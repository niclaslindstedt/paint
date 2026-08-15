// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Reading a container. `writePct` needs a canvas and so can't be driven here,
// but `readPct` is pure byte work — so the archive is assembled by hand from the
// same builders the writer uses, and the two paths that matter are exercised for
// real: a container carrying `vectors.json` reopens as the drawing that went in,
// and one without (another tool's) is composed from its layer PNGs instead.
import { describe, expect, it } from "vitest";

import {
  MANIFEST_ENTRY,
  MIMETYPE_ENTRY,
  PCT_MIME,
  PREVIEW_ENTRY,
  VECTORS_ENTRY,
  buildManifest,
  buildVectors,
  planLayers,
  serializeManifest,
} from "../src/app/pct.ts";
import { readPct } from "../src/app/pctFile.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";
import { zip, type ZipEntry } from "../src/app/zip.ts";

const INK = { pageColor: "#ffffff", defaultInk: "#000000" };
const utf8 = new TextEncoder();

/** Four bytes that start like a PNG. `readPct` never decodes a layer — it wraps
 *  the bytes in a `data:` URL — so a real image would prove nothing extra. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function stroke(id: string, layer?: string): Stroke {
  return {
    id,
    tool: "pencil",
    size: 4,
    ...(layer ? { layer } : {}),
    shape: { kind: "segment", from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
  };
}

const source: Drawing = {
  id: "d1",
  name: "Wireframe",
  width: 640,
  height: 480,
  background: "#0b0d10",
  layers: [
    { id: "bg", name: "", locked: true },
    { id: "ink", name: "Ink" },
    { id: "notes", name: "Notes", hidden: true },
  ],
  strokes: [stroke("a", "ink"), stroke("b", "notes")],
};

/** Build a container the way `writePct` does, minus the rendering. */
async function container(options: { vectors: boolean } = { vectors: true }) {
  const planned = planLayers(source, INK);
  const manifest = buildManifest(source, planned, {
    preview: true,
    vectors: options.vectors,
  });
  const entries: ZipEntry[] = [
    { name: MIMETYPE_ENTRY, bytes: utf8.encode(PCT_MIME), compress: false },
    { name: MANIFEST_ENTRY, bytes: utf8.encode(serializeManifest(manifest)) },
    ...(options.vectors
      ? [{ name: VECTORS_ENTRY, bytes: utf8.encode(buildVectors(source)) }]
      : []),
    ...planned.map((p) => ({
      name: p.entry.src,
      bytes: PNG,
      compress: false,
    })),
    { name: PREVIEW_ENTRY, bytes: PNG, compress: false },
  ];
  return new Blob([(await zip(entries)) as BlobPart], { type: PCT_MIME });
}

describe("readPct", () => {
  it("reopens the drawing exactly as it went in", async () => {
    const { drawing } = await readPct(await container());
    expect(drawing).toEqual(source);
  });

  it("hands back the index alongside it", async () => {
    const { manifest } = await readPct(await container());
    expect(manifest.format).toBe("pct");
    expect(manifest.drawing.name).toBe("Wireframe");
    expect(manifest.layers).toHaveLength(3);
  });

  it("hands back the preview as a data URL", async () => {
    const { preview } = await readPct(await container());
    expect(preview).toMatch(/^data:image\/png;base64,/);
  });

  it("refuses bytes that aren't an archive", async () => {
    await expect(readPct(new Blob(["nonsense"]))).rejects.toThrow(/not a zip/i);
  });

  it("refuses an archive with no manifest", async () => {
    const bytes = await zip([{ name: "hello.txt", bytes: utf8.encode("hi") }]);
    await expect(readPct(new Blob([bytes as BlobPart]))).rejects.toThrow(
      /not a paint file/i,
    );
  });

  it("refuses a container from a newer build", async () => {
    const bytes = await zip([
      {
        name: MANIFEST_ENTRY,
        bytes: utf8.encode(
          JSON.stringify({
            format: "pct",
            version: 99,
            canvas: { width: 1, height: 1 },
            layers: [],
          }),
        ),
      },
    ]);
    await expect(readPct(new Blob([bytes as BlobPart]))).rejects.toThrow(
      /newer version/i,
    );
  });

  // The foreign-file path: no native payload, so the picture is rebuilt from
  // the layer PNGs the manifest points at.
  describe("without a native payload", () => {
    it("keeps the page and the stack", async () => {
      const { drawing } = await readPct(await container({ vectors: false }));
      expect(drawing.width).toBe(640);
      expect(drawing.height).toBe(480);
      expect(drawing.background).toBe("#0b0d10");
      expect(drawing.layers?.map((l) => l.name)).toEqual(["", "Ink", "Notes"]);
    });

    it("keeps the eyes and the locks", async () => {
      const { drawing } = await readPct(await container({ vectors: false }));
      expect(drawing.layers?.[0]).toMatchObject({ locked: true });
      expect(drawing.layers?.[2]).toMatchObject({ hidden: true });
    });

    it("places one image per layer, on the layer it came from", async () => {
      const { drawing } = await readPct(await container({ vectors: false }));
      expect(drawing.strokes).toHaveLength(3);
      expect(drawing.strokes.map((s) => s.layer)).toEqual([
        "bg",
        "ink",
        "notes",
      ]);
      for (const s of drawing.strokes) {
        expect(s.shape.kind).toBe("image");
      }
    });

    it("covers the page with each layer's image", async () => {
      const { drawing } = await readPct(await container({ vectors: false }));
      const shape = drawing.strokes[0]!.shape;
      expect(shape).toMatchObject({
        from: { x: 0, y: 0 },
        to: { x: 640, y: 480 },
      });
    });

    // A manifest may name a layer whose PNG is missing (a half-written
    // container). That layer should still exist in the stack, just empty —
    // losing the whole file over one absent image would be the wrong trade.
    it("keeps a layer whose PNG is missing, without a mark for it", async () => {
      const planned = planLayers(source, INK);
      const manifest = buildManifest(source, planned, { vectors: false });
      const bytes = await zip([
        {
          name: MANIFEST_ENTRY,
          bytes: utf8.encode(serializeManifest(manifest)),
        },
        // Only the first layer's pixels are present.
        { name: planned[0]!.entry.src, bytes: PNG, compress: false },
      ]);
      const { drawing } = await readPct(new Blob([bytes as BlobPart]));
      expect(drawing.layers).toHaveLength(3);
      expect(drawing.strokes).toHaveLength(1);
    });
  });
});
