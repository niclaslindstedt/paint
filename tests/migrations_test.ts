// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

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

  it("refuses a document from a newer build rather than mangling it", () => {
    expect(() =>
      parseDoc(JSON.stringify({ version: LATEST_VERSION + 5, drawings: [] })),
    ).toThrow();
  });
});
