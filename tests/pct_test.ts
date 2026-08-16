// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The `.pct` container's arithmetic, without a canvas in sight — which is the
// point of splitting the format (`pct.ts`) from its pixels (`pctFile.ts`).
//
// Two things carry real weight here. The **hash** is what decides whether a
// layer gets re-rendered and re-uploaded, so it has to move when the pixels
// would and hold still when they wouldn't — including for the reasons that
// aren't strokes at all, like a theme flip re-inking every mark that never
// chose a colour. And the **manifest** is the half of the format a foreign
// reader sees, so its shape is a promise rather than an implementation detail.
import { describe, expect, it } from "vitest";

import { drawingTag } from "../src/app/imageStore.ts";
import { BACKGROUND_LAYER_ID, BASE_LAYER_ID } from "../src/app/layers.ts";
import {
  PCT_VERSION,
  adoptDrawing,
  buildManifest,
  buildVectors,
  drawingFolder,
  layerHash,
  layerPath,
  manifestLayerPaths,
  planLayers,
  readManifest,
  readVectors,
  serializeManifest,
} from "../src/app/pct.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

const INK = { pageColor: "#ffffff", defaultInk: "#000000" };

function stroke(id: string, layer?: string): Stroke {
  return {
    id,
    tool: "pencil",
    size: 4,
    ...(layer ? { layer } : {}),
    shape: {
      kind: "path",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    },
  };
}

function drawing(over: Partial<Drawing> = {}): Drawing {
  return {
    id: "drawing-1",
    name: "Sequence diagram",
    width: 800,
    height: 600,
    strokes: [],
    ...over,
  };
}

const KEY = { ...INK, width: 800, height: 600, paintsPage: false };

describe("layerHash", () => {
  it("is stable for the same marks", () => {
    const marks = [stroke("a"), stroke("b")];
    expect(layerHash(marks, KEY)).toBe(layerHash(marks, KEY));
  });

  it("moves when a mark is added", () => {
    expect(layerHash([stroke("a")], KEY)).not.toBe(
      layerHash([stroke("a"), stroke("b")], KEY),
    );
  });

  it("moves when the marks are reordered — paint order is pixels", () => {
    expect(layerHash([stroke("a"), stroke("b")], KEY)).not.toBe(
      layerHash([stroke("b"), stroke("a")], KEY),
    );
  });

  it("moves when the page is resized", () => {
    expect(layerHash([stroke("a")], KEY)).not.toBe(
      layerHash([stroke("a")], { ...KEY, width: 1600 }),
    );
  });

  // The one that is easy to get wrong: a mark that never picked a colour is
  // re-inked by the theme at paint time, so the same strokes on a dark page are
  // genuinely different pixels.
  it("moves when the default ink changes", () => {
    expect(layerHash([stroke("a")], KEY)).not.toBe(
      layerHash([stroke("a")], { ...KEY, defaultInk: "#ffffff" }),
    );
  });

  it("moves when the layer starts or stops carrying the sheet", () => {
    expect(layerHash([], KEY)).not.toBe(
      layerHash([], { ...KEY, paintsPage: true }),
    );
  });

  it("is 16 hex characters", () => {
    expect(layerHash([stroke("a")], KEY)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("layerPath", () => {
  it("leads with the stack position, zero-padded so a listing sorts", () => {
    expect(layerPath(0, "abc")).toBe("layers/00-abc.png");
    expect(layerPath(7, "abc")).toBe("layers/07-abc.png");
  });

  it("puts the hash in the name, so a path's bytes never change", () => {
    expect(layerPath(1, "aaaa")).not.toBe(layerPath(1, "bbbb"));
  });
});

describe("drawingFolder", () => {
  it("reads as drawings/<slug>-<tag>", () => {
    expect(drawingFolder(drawing())).toBe("drawings/sequence-diagram-b40p");
  });

  // `pct.ts` re-derives the tag rather than importing it, so that it stays free
  // of the byte transports. The two must not drift.
  it("agrees with the image store's tag", () => {
    const d = drawing();
    expect(drawingFolder(d).endsWith(`-${drawingTag(d.id)}`)).toBe(true);
  });

  it("survives a nameless drawing", () => {
    expect(drawingFolder({ id: "x", name: "" })).toMatch(/^drawings\/drawing-/);
  });

  it("keeps two drawings sharing a name apart", () => {
    expect(drawingFolder({ id: "a", name: "Sketch" })).not.toBe(
      drawingFolder({ id: "b", name: "Sketch" }),
    );
  });
});

describe("planLayers", () => {
  it("plans the implicit stack for a drawing that has none", () => {
    const planned = planLayers(drawing({ strokes: [stroke("a")] }), INK);
    expect(planned.map((p) => p.entry.id)).toEqual([
      BACKGROUND_LAYER_ID,
      BASE_LAYER_ID,
    ]);
  });

  it("files marks that name no layer onto the base", () => {
    const planned = planLayers(
      drawing({ strokes: [stroke("a"), stroke("b")] }),
      INK,
    );
    expect(planned.map((p) => p.entry.marks)).toEqual([0, 2]);
  });

  it("walks the stack bottom first", () => {
    const planned = planLayers(
      drawing({
        layers: [
          { id: "bottom", name: "Bottom" },
          { id: "top", name: "Top" },
        ],
        strokes: [stroke("a", "top"), stroke("b", "bottom")],
      }),
      INK,
    );
    expect(planned.map((p) => p.entry.name)).toEqual(["Bottom", "Top"]);
    expect(planned.map((p) => p.entry.marks)).toEqual([1, 1]);
  });

  it("carries the eye and the lock into the index", () => {
    const [entry] = planLayers(
      drawing({ layers: [{ id: "a", name: "A", hidden: true, locked: true }] }),
      INK,
    ).map((p) => p.entry);
    expect(entry).toMatchObject({ hidden: true, locked: true });
  });

  it("omits hidden and locked when they are off, so the index stays terse", () => {
    const [entry] = planLayers(
      drawing({ layers: [{ id: "a", name: "A" }] }),
      INK,
    ).map((p) => p.entry);
    expect(entry).not.toHaveProperty("hidden");
    expect(entry).not.toHaveProperty("locked");
  });

  it("gives each layer a distinct path", () => {
    const planned = planLayers(
      drawing({
        layers: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        strokes: [stroke("s1", "a")],
      }),
      INK,
    );
    const paths = planned.map((p) => p.entry.src);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // Two empty layers above the sheet render identical pixels, so they share a
  // hash — and must still not collide, because the stack position is in the
  // name. (The *bottom* layer is excluded: it carries the page colour, which is
  // pixels, so its hash differs by design — see the `paintsPage` case above.)
  it("keeps two identical empty layers apart by position", () => {
    const planned = planLayers(
      drawing({
        layers: [
          { id: BACKGROUND_LAYER_ID, name: "", locked: true },
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
      }),
      INK,
    );
    expect(planned[1]!.entry.hash).toBe(planned[2]!.entry.hash);
    expect(planned[1]!.entry.src).not.toBe(planned[2]!.entry.src);
  });

  // The sheet is the one layer whose pixels are not only its marks.
  it("hashes the bottom layer differently — it carries the page", () => {
    const planned = planLayers(
      drawing({
        layers: [
          { id: BACKGROUND_LAYER_ID, name: "" },
          { id: "a", name: "A" },
        ],
      }),
      INK,
    );
    expect(planned[0]!.entry.hash).not.toBe(planned[1]!.entry.hash);
  });

  it("hands the marks back beside the entry that describes them", () => {
    const planned = planLayers(
      drawing({
        layers: [{ id: "only", name: "Only" }],
        strokes: [stroke("a", "only"), stroke("b", "only")],
      }),
      INK,
    );
    expect(planned[0]!.strokes.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("buildManifest", () => {
  const planned = planLayers(drawing({ strokes: [stroke("a")] }), INK);

  it("declares the format and the version", () => {
    const manifest = buildManifest(drawing(), planned);
    expect(manifest.format).toBe("pct");
    expect(manifest.version).toBe(PCT_VERSION);
  });

  it("records the canvas", () => {
    expect(buildManifest(drawing(), planned).canvas).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("records a pinned page colour, and omits an unpinned one", () => {
    expect(
      buildManifest(drawing({ background: "#102030" }), planned).canvas
        .background,
    ).toBe("#102030");
    expect(buildManifest(drawing(), planned).canvas).not.toHaveProperty(
      "background",
    );
  });

  it("names the native payload by default", () => {
    expect(buildManifest(drawing(), planned).vectors).toBe("vectors.json");
  });

  // The backend tree carries neither: the strokes travel in the document beside
  // it, and a full-page thumbnail on every save is the upload this whole layout
  // exists to avoid.
  it("omits the preview and the vectors when the backend asks it to", () => {
    const manifest = buildManifest(drawing(), planned, {
      preview: false,
      vectors: false,
    });
    expect(manifest.preview).toBeUndefined();
    expect(manifest.vectors).toBeUndefined();
  });

  it("lists every layer's path", () => {
    const manifest = buildManifest(drawing(), planned, { preview: true });
    expect(manifestLayerPaths(manifest).size).toBe(planned.length);
  });

  it("serializes as readable JSON", () => {
    const text = serializeManifest(buildManifest(drawing(), planned));
    expect(text).toContain("\n  ");
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("readManifest", () => {
  const good = serializeManifest(
    buildManifest(drawing(), planLayers(drawing(), INK)),
  );

  it("reads one back", () => {
    expect(readManifest(good)?.drawing.name).toBe("Sequence diagram");
  });

  it("round-trips through serialize", () => {
    const manifest = buildManifest(drawing(), planLayers(drawing(), INK));
    expect(readManifest(serializeManifest(manifest))).toEqual(manifest);
  });

  it("rejects bytes that aren't JSON", () => {
    expect(readManifest("not json at all")).toBeNull();
  });

  it("rejects JSON that isn't a manifest", () => {
    expect(readManifest('{"hello":"world"}')).toBeNull();
    expect(readManifest("[]")).toBeNull();
    expect(readManifest("null")).toBeNull();
  });

  it("rejects a manifest with no layer list", () => {
    expect(readManifest('{"format":"pct","version":1,"canvas":{}}')).toBeNull();
  });

  // A container from a newer build is a different case from a broken one, and
  // the user is owed the difference.
  it("throws on a container from the future", () => {
    expect(() =>
      readManifest(
        JSON.stringify({
          format: "pct",
          version: PCT_VERSION + 1,
          canvas: { width: 1, height: 1 },
          layers: [],
        }),
      ),
    ).toThrow(/newer version/i);
  });
});

describe("vectors", () => {
  it("round-trips a drawing losslessly", () => {
    const original = drawing({
      background: "#101010",
      layers: [
        { id: "bg", name: "", locked: true },
        { id: "ink", name: "Ink" },
      ],
      strokes: [stroke("a", "ink"), stroke("b", "ink")],
    });
    const back = readVectors(buildVectors(original));
    expect(back).toEqual(original);
  });

  it("rides the ordinary migration chain", () => {
    // A v0 document — no version stamp, no folders array — is what an older
    // build would have written into a container. It has to open.
    const legacy = JSON.stringify({
      drawings: [{ id: "d", name: "Old", strokes: [] }],
      activeDrawingId: "d",
    });
    expect(readVectors(legacy)?.name).toBe("Old");
  });

  it("hands back null for bytes that aren't a document", () => {
    expect(readVectors("{{{")).toBeNull();
  });
});

describe("adoptDrawing", () => {
  const opened = drawing({
    background: "#222222",
    layers: [{ id: "a", name: "A" }],
    activeLayerId: "a",
    strokes: [stroke("original-1", "a"), stroke("original-2", "a")],
  });

  it("re-mints every stroke id", () => {
    let n = 0;
    const adopted = adoptDrawing(opened, () => `fresh-${++n}`);
    expect(adopted.strokes?.map((s) => s.id)).toEqual(["fresh-1", "fresh-2"]);
  });

  it("drops the drawing's own id, so the store mints one", () => {
    expect(adoptDrawing(opened, () => "x")).not.toHaveProperty("id");
  });

  it("keeps the page, the stack and the marks", () => {
    const adopted = adoptDrawing(opened, () => "x");
    expect(adopted.width).toBe(800);
    expect(adopted.height).toBe(600);
    expect(adopted.background).toBe("#222222");
    expect(adopted.layers).toEqual([{ id: "a", name: "A" }]);
    expect(adopted.activeLayerId).toBe("a");
    expect(adopted.strokes).toHaveLength(2);
  });

  it("keeps which layer each mark was on", () => {
    expect(adoptDrawing(opened, () => "x").strokes?.[0]?.layer).toBe("a");
  });

  it("omits an unpinned background rather than inventing one", () => {
    expect(adoptDrawing(drawing(), () => "x")).not.toHaveProperty("background");
  });
});
