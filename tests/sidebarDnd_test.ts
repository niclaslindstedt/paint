// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { canDrop } from "../src/app/sidebarDnd.ts";
import type { AppData, Drawing } from "../src/app/types.ts";

// Which sidebar drops are legal. The framework asks this twice per gesture —
// once to decide which zones light up the moment a row is lifted, once to
// decide whether the release does anything — so every rule here is as much
// about what the user is *shown* as about what is allowed.

const page = (id: string, folderId?: string | null): Drawing => ({
  id,
  name: id,
  width: 800,
  height: 600,
  strokes: [],
  ...(folderId === undefined ? {} : { folderId }),
});

const data: AppData = {
  folders: [
    { id: "f1", name: "Diagrams" },
    { id: "f2", name: "Scratch" },
  ],
  drawings: [page("loose"), page("filed", "f1")],
  activeDrawingId: "loose",
};

describe("canDrop", () => {
  it("files a drawing into a folder it isn't already in", () => {
    expect(
      canDrop(
        data,
        { kind: "drawing", id: "loose" },
        { kind: "folder", id: "f1" },
      ),
    ).toBe(true);
    expect(
      canDrop(
        data,
        { kind: "drawing", id: "filed" },
        { kind: "folder", id: "f2" },
      ),
    ).toBe(true);
  });

  it("refuses the folder a drawing is already filed in", () => {
    // A no-op drop, but refusing it is what keeps that row from advertising
    // itself as a destination while the drag is in flight.
    expect(
      canDrop(
        data,
        { kind: "drawing", id: "filed" },
        { kind: "folder", id: "f1" },
      ),
    ).toBe(false);
  });

  it("refuses a folder dropped onto a folder", () => {
    // Folders are flat by design — there is no nesting to perform.
    expect(
      canDrop(data, { kind: "folder", id: "f2" }, { kind: "folder", id: "f1" }),
    ).toBe(false);
  });

  it("refuses a drawing the document doesn't hold", () => {
    expect(
      canDrop(
        data,
        { kind: "drawing", id: "ghost" },
        { kind: "folder", id: "f1" },
      ),
    ).toBe(false);
    expect(
      canDrop(data, { kind: "drawing", id: "ghost" }, { kind: "root" }),
    ).toBe(false);
  });

  it("lifts a filed drawing back to the top level", () => {
    expect(
      canDrop(data, { kind: "drawing", id: "filed" }, { kind: "root" }),
    ).toBe(true);
  });

  it("refuses the top level for a drawing already there", () => {
    expect(
      canDrop(data, { kind: "drawing", id: "loose" }, { kind: "root" }),
    ).toBe(false);
  });

  it("refuses the top level for a folder", () => {
    expect(canDrop(data, { kind: "folder", id: "f1" }, { kind: "root" })).toBe(
      false,
    );
  });

  it("accepts either kind onto another sketchbook", () => {
    expect(
      canDrop(
        data,
        { kind: "drawing", id: "loose" },
        { kind: "namespace", slug: "teaching" },
      ),
    ).toBe(true);
    expect(
      canDrop(
        data,
        { kind: "folder", id: "f1" },
        { kind: "namespace", slug: "teaching" },
      ),
    ).toBe(true);
  });

  it("accepts either kind onto the archive", () => {
    expect(
      canDrop(data, { kind: "drawing", id: "filed" }, { kind: "archive" }),
    ).toBe(true);
    expect(
      canDrop(data, { kind: "folder", id: "f1" }, { kind: "archive" }),
    ).toBe(true);
  });
});
