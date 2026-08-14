// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  handOffDrawing,
  handOffFolder,
  type Mint,
} from "../src/app/handoff.ts";
import type { AppData, Drawing } from "../src/app/types.ts";

// Handing a drawing or a folder to another sketchbook. Two documents change at
// once, which is the whole reason this is a pure function rather than a couple
// of lines inside the store: the interesting cases are all about what happens
// to the *source* — it can't be left without a page, and it can't be left
// pointing at a drawing it no longer holds.

// A deterministic mint, so the assertions can name the ids the arriving copies
// get rather than fish them out of the result.
function counting(): Mint {
  let n = 0;
  const id = (prefix: string) => `${prefix}-${++n}`;
  return {
    id,
    blankPage: () => ({
      id: id("drawing"),
      name: "",
      width: 800,
      height: 600,
      strokes: [],
    }),
  };
}

const page = (id: string, patch: Partial<Drawing> = {}): Drawing => ({
  id,
  name: id,
  width: 800,
  height: 600,
  strokes: [],
  ...patch,
});

const doc = (patch: Partial<AppData> = {}): AppData => ({
  folders: [],
  drawings: [],
  activeDrawingId: "",
  ...patch,
});

describe("handOffDrawing", () => {
  it("appends a fresh copy to the target and drops the original", () => {
    const source = doc({
      drawings: [page("a"), page("b")],
      activeDrawingId: "a",
    });
    const moved = handOffDrawing(source, doc(), "b", counting())!;

    expect(moved.source.drawings.map((d) => d.id)).toEqual(["a"]);
    expect(moved.target.drawings).toHaveLength(1);
    expect(moved.target.drawings[0]!.name).toBe("b");
  });

  it("mints a new id for the arriving copy and reports it", () => {
    const source = doc({ drawings: [page("a"), page("b")] });
    const moved = handOffDrawing(source, doc(), "b", counting())!;

    // Not "b" — an undo in the source restores the original id, and two live
    // sketchbooks must never both claim it.
    expect(moved.target.drawings[0]!.id).not.toBe("b");
    expect(moved.arrived.drawings).toEqual([moved.target.drawings[0]!.id]);
  });

  it("lands the copy at the target's top level", () => {
    const source = doc({
      folders: [{ id: "f", name: "Diagrams" }],
      drawings: [page("a"), page("b", { folderId: "f" })],
    });
    const moved = handOffDrawing(source, doc(), "b", counting())!;

    // The folder it was filed in is the *source's* — it doesn't exist over
    // there, so a copy still pointing at it would be stranded.
    expect(moved.target.drawings[0]!.folderId).toBeNull();
  });

  it("keeps the target's own drawings", () => {
    const source = doc({ drawings: [page("a"), page("b")] });
    const target = doc({ drawings: [page("x")], activeDrawingId: "x" });
    const moved = handOffDrawing(source, target, "b", counting())!;

    expect(moved.target.drawings).toHaveLength(2);
    expect(moved.target.drawings[0]!.id).toBe("x");
    expect(moved.target.activeDrawingId).toBe("x");
  });

  it("leaves a blank page behind when the last live drawing is given away", () => {
    const source = doc({ drawings: [page("a")], activeDrawingId: "a" });
    const moved = handOffDrawing(source, doc(), "a", counting())!;

    expect(moved.source.drawings).toHaveLength(1);
    expect(moved.source.drawings[0]!.id).not.toBe("a");
    expect(moved.source.drawings[0]!.strokes).toEqual([]);
    // …and the canvas opens on it rather than on the page that just left.
    expect(moved.source.activeDrawingId).toBe(moved.source.drawings[0]!.id);
  });

  it("counts only live pages when deciding whether one is left", () => {
    const source = doc({
      drawings: [page("a"), page("shelved", { archived: true })],
      activeDrawingId: "a",
    });
    const moved = handOffDrawing(source, doc(), "a", counting())!;

    // The archive isn't somewhere to draw, so giving away the only live page
    // still leaves a blank one.
    expect(moved.source.drawings.filter((d) => !d.archived)).toHaveLength(1);
    expect(moved.source.drawings).toHaveLength(2);
  });

  it("moves the open page along when the one that left was it", () => {
    const source = doc({
      drawings: [page("a"), page("b")],
      activeDrawingId: "b",
    });
    const moved = handOffDrawing(source, doc(), "b", counting())!;

    expect(moved.source.activeDrawingId).toBe("a");
  });

  it("leaves the open page alone when a different drawing left", () => {
    const source = doc({
      drawings: [page("a"), page("b")],
      activeDrawingId: "a",
    });
    const moved = handOffDrawing(source, doc(), "b", counting())!;

    expect(moved.source.activeDrawingId).toBe("a");
  });

  it("refuses a drawing that isn't in the source", () => {
    const source = doc({ drawings: [page("a")] });
    expect(handOffDrawing(source, doc(), "nope", counting())).toBeNull();
  });
});

describe("handOffFolder", () => {
  const grouped = () =>
    doc({
      folders: [{ id: "f", name: "Diagrams" }],
      drawings: [
        page("a"),
        page("b", { folderId: "f" }),
        page("c", { folderId: "f" }),
      ],
      activeDrawingId: "b",
    });

  it("takes the folder and everything filed in it", () => {
    const moved = handOffFolder(grouped(), doc(), "f", counting())!;

    expect(moved.source.folders).toEqual([]);
    expect(moved.source.drawings.map((d) => d.id)).toEqual(["a"]);
    expect(moved.target.folders).toHaveLength(1);
    expect(moved.target.drawings.map((d) => d.name)).toEqual(["b", "c"]);
  });

  it("re-files the arriving drawings under the arriving folder", () => {
    const moved = handOffFolder(grouped(), doc(), "f", counting())!;
    const folderId = moved.target.folders[0]!.id;

    // The group arrives as a group: a new folder id, and every drawing rewired
    // onto it rather than onto the source's (which doesn't exist there).
    expect(folderId).not.toBe("f");
    expect(moved.target.drawings.map((d) => d.folderId)).toEqual([
      folderId,
      folderId,
    ]);
    expect(moved.arrived.folder).toBe(folderId);
    expect(moved.arrived.drawings).toEqual(
      moved.target.drawings.map((d) => d.id),
    );
  });

  it("moves the open page along when it was inside the folder", () => {
    const moved = handOffFolder(grouped(), doc(), "f", counting())!;
    expect(moved.source.activeDrawingId).toBe("a");
  });

  it("leaves a blank page behind when the folder held every live drawing", () => {
    const source = doc({
      folders: [{ id: "f", name: "Diagrams" }],
      drawings: [page("b", { folderId: "f" })],
      activeDrawingId: "b",
    });
    const moved = handOffFolder(source, doc(), "f", counting())!;

    expect(moved.source.drawings).toHaveLength(1);
    expect(moved.source.drawings[0]!.folderId).toBeUndefined();
    expect(moved.source.activeDrawingId).toBe(moved.source.drawings[0]!.id);
  });

  it("hands over an empty folder with no drawings in tow", () => {
    const source = doc({
      folders: [{ id: "f", name: "Empty" }],
      drawings: [page("a")],
      activeDrawingId: "a",
    });
    const moved = handOffFolder(source, doc(), "f", counting())!;

    expect(moved.target.folders).toHaveLength(1);
    expect(moved.target.drawings).toEqual([]);
    expect(moved.arrived.drawings).toEqual([]);
    // Nothing left the source's page list, so no blank page is invented.
    expect(moved.source.drawings.map((d) => d.id)).toEqual(["a"]);
  });

  it("refuses a folder that isn't in the source", () => {
    expect(handOffFolder(grouped(), doc(), "nope", counting())).toBeNull();
  });
});
