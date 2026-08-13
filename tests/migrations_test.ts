// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { drawingLayers, visibleStrokes } from "../src/app/layers.ts";
import {
  LATEST_VERSION,
  parseDoc,
  serializeDoc,
} from "../src/app/migrations.ts";
import { DEFAULT_CANVAS } from "../src/app/types.ts";

// The migration chain is what stands between a stored document and a build that
// has moved on, and the same bytes travel to a sync backend — so a round trip
// and the bootstrap step are both pinned here.

describe("serializeDoc", () => {
  it("stamps the version onto the bytes at rest", () => {
    const text = serializeDoc({
      folders: [],
      drawings: [],
      activeDrawingId: "",
    });
    expect(JSON.parse(text)).toEqual({
      version: LATEST_VERSION,
      folders: [],
      drawings: [],
      activeDrawingId: "",
    });
  });

  it("round-trips a document", () => {
    const doc = {
      folders: [{ id: "f1", name: "Diagrams" }],
      drawings: [
        {
          id: "d1",
          name: "Sequence",
          width: 800,
          height: 600,
          strokes: [
            {
              id: "s1",
              tool: "pencil",
              size: 4,
              shape: { kind: "path" as const, points: [{ x: 1, y: 2 }] },
            },
          ],
        },
      ],
      activeDrawingId: "d1",
    };
    expect(parseDoc(serializeDoc(doc))).toEqual(doc);
  });
});

describe("parseDoc", () => {
  it("bootstraps an unversioned document", () => {
    const migrated = parseDoc(JSON.stringify({ drawings: [{ id: "d1" }] }));
    expect(migrated.drawings[0]).toMatchObject({
      id: "d1",
      name: "",
      width: DEFAULT_CANVAS.width,
      height: DEFAULT_CANVAS.height,
      strokes: [],
    });
    // An absent background means "follow the canvas theme" — the migration must
    // not invent one, or every old drawing would pin itself to white.
    expect(migrated.drawings[0]!.background).toBeUndefined();
    expect(migrated.activeDrawingId).toBe("d1");
  });

  it("keeps a pinned background", () => {
    const migrated = parseDoc(
      JSON.stringify({ drawings: [{ id: "d1", background: "#fef3c7" }] }),
    );
    expect(migrated.drawings[0]!.background).toBe("#fef3c7");
  });

  it("survives a document with nothing in it", () => {
    expect(parseDoc("{}")).toEqual({
      folders: [],
      drawings: [],
      activeDrawingId: "",
    });
  });

  it("gives a v1 document the folders array the menu iterates", () => {
    const migrated = parseDoc(
      JSON.stringify({
        version: 1,
        drawings: [{ id: "d1" }],
        activeDrawingId: "d1",
      }),
    );
    expect(migrated.folders).toEqual([]);
    // Grouping, starring and archiving are all opt-in flags, so an existing
    // drawing must come through ungrouped, unstarred and live rather than
    // being rewritten into some default.
    expect(migrated.drawings[0]!.folderId).toBeUndefined();
    expect(migrated.drawings[0]!.favorite).toBeUndefined();
    expect(migrated.drawings[0]!.archived).toBeUndefined();
  });

  it("keeps folders a v2 document already carried", () => {
    const migrated = parseDoc(
      JSON.stringify({
        version: 2,
        folders: [{ id: "f1", name: "Diagrams" }],
        drawings: [{ id: "d1", folderId: "f1", favorite: true }],
        activeDrawingId: "d1",
      }),
    );
    expect(migrated.folders).toEqual([{ id: "f1", name: "Diagrams" }]);
    expect(migrated.drawings[0]!.folderId).toBe("f1");
    expect(migrated.drawings[0]!.favorite).toBe(true);
  });

  it("round-trips a dropped image, bitmap and all", () => {
    // An image stroke carries its bitmap inline, and it was added *without* a
    // version bump because nothing on disk needed rewriting for it (see
    // `migrations.ts`). What that turns into a promise is this: the bytes come
    // back byte-for-byte, at the same version, through the same pipeline.
    const src = "data:image/png;base64,AAAA";
    const doc = parseDoc(
      JSON.stringify({
        version: LATEST_VERSION,
        folders: [],
        drawings: [
          {
            id: "d1",
            name: "photo",
            width: 400,
            height: 300,
            strokes: [
              {
                id: "s1",
                tool: "image",
                size: 1,
                shape: {
                  kind: "image",
                  from: { x: 0, y: 0 },
                  to: { x: 400, y: 300 },
                  src,
                },
              },
            ],
          },
        ],
        activeDrawingId: "d1",
      }),
    );
    const stroke = doc.drawings[0]!.strokes[0]!;
    expect(stroke.shape).toEqual({
      kind: "image",
      from: { x: 0, y: 0 },
      to: { x: 400, y: 300 },
      src,
    });
    expect(parseDoc(serializeDoc(doc))).toEqual(doc);
  });

  it("reads a document written before layers existed as one layer", () => {
    // Layers were added the same way dropped images were — additively, with no
    // version bump, because nothing already on disk needs rewriting. The
    // promise that makes is this one: an untouched v2 document still opens, its
    // marks still belong somewhere, and it goes back to disk unchanged.
    const doc = parseDoc(
      JSON.stringify({
        version: LATEST_VERSION,
        folders: [],
        drawings: [
          {
            id: "d1",
            name: "sketch",
            width: 400,
            height: 300,
            strokes: [
              {
                id: "s1",
                tool: "pencil",
                size: 4,
                shape: { kind: "path", points: [{ x: 1, y: 1 }] },
              },
            ],
          },
        ],
        activeDrawingId: "d1",
      }),
    );
    const page = doc.drawings[0]!;
    expect(page.layers).toBeUndefined();
    expect(drawingLayers(page)).toHaveLength(1);
    expect(visibleStrokes(page)).toEqual(page.strokes);
    expect(parseDoc(serializeDoc(doc))).toEqual(doc);
  });

  it("round-trips a stack of layers", () => {
    const doc = parseDoc(
      JSON.stringify({
        version: LATEST_VERSION,
        folders: [],
        drawings: [
          {
            id: "d1",
            name: "sketch",
            width: 400,
            height: 300,
            layers: [
              { id: "base", name: "" },
              { id: "l2", name: "Layer 2", hidden: true },
            ],
            activeLayerId: "l2",
            strokes: [
              {
                id: "s1",
                tool: "pencil",
                size: 4,
                layer: "l2",
                shape: { kind: "path", points: [{ x: 1, y: 1 }] },
              },
            ],
          },
        ],
        activeDrawingId: "d1",
      }),
    );
    const page = doc.drawings[0]!;
    expect(page.layers).toHaveLength(2);
    expect(page.activeLayerId).toBe("l2");
    expect(page.strokes[0]!.layer).toBe("l2");
    expect(visibleStrokes(page)).toEqual([]);
    expect(parseDoc(serializeDoc(doc))).toEqual(doc);
  });

  it("refuses a document from a newer build rather than mangling it", () => {
    expect(() =>
      parseDoc(JSON.stringify({ version: LATEST_VERSION + 5, drawings: [] })),
    ).toThrow();
  });
});
