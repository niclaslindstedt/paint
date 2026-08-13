// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  archivedCount,
  byRecency,
  drawingsInFolder,
  favoriteDrawings,
  lastTouched,
  liveDrawings,
  liveFolders,
  type AppData,
  type Drawing,
} from "../src/app/types.ts";

// The reads the side menu and the archive screen share. They decide what shows
// where — which drawing is in which folder, what is starred, what is shelved —
// so the two screens can never disagree about it.

// The fixtures carry explicit `updatedAt` stamps: the lists are ordered
// most-recently-edited first, so a test that left them off would be pinning the
// name tiebreak rather than the real ordering.
const drawing = (
  id: string,
  updatedAt: string,
  patch: Partial<Drawing> = {},
): Drawing => ({
  id,
  name: id,
  width: 800,
  height: 600,
  strokes: [],
  updatedAt,
  ...patch,
});

const doc: AppData = {
  folders: [
    { id: "f1", name: "Diagrams" },
    { id: "f2", name: "Old", archived: true },
  ],
  drawings: [
    drawing("loose", "2026-01-03T00:00:00.000Z"),
    drawing("starred", "2026-01-05T00:00:00.000Z", { favorite: true }),
    drawing("filed", "2026-01-02T00:00:00.000Z", { folderId: "f1" }),
    drawing("starredAndFiled", "2026-01-06T00:00:00.000Z", {
      folderId: "f1",
      favorite: true,
    }),
    drawing("shelved", "2026-01-01T00:00:00.000Z", { archived: true }),
    drawing("shelvedWithFolder", "2026-01-01T00:00:00.000Z", {
      folderId: "f2",
      archived: true,
    }),
    drawing("orphan", "2026-01-04T00:00:00.000Z", { folderId: "gone" }),
  ],
  activeDrawingId: "loose",
};

describe("liveFolders / liveDrawings", () => {
  it("leaves the archived ones out of the menu", () => {
    expect(liveFolders(doc).map((f) => f.id)).toEqual(["f1"]);
    expect(liveDrawings(doc).map((d) => d.id)).not.toContain("shelved");
  });
});

describe("drawingsInFolder", () => {
  it("lists a folder's live drawings", () => {
    expect(drawingsInFolder(doc, "f1").map((d) => d.id)).toEqual([
      "starredAndFiled",
      "filed",
    ]);
  });

  it("counts a drawing whose folder is gone as ungrouped", () => {
    // A pruned folder must never strand its drawings: they lift back to the top
    // level rather than dropping out of the menu entirely.
    expect(drawingsInFolder(doc, null).map((d) => d.id)).toEqual([
      "starred",
      "orphan",
      "loose",
    ]);
  });

  it("counts a drawing filed in an archived folder as neither", () => {
    // It is shelved with its folder, so it belongs to the archive screen — not
    // to the top level and not to a live folder.
    expect(drawingsInFolder(doc, null).map((d) => d.id)).not.toContain(
      "shelvedWithFolder",
    );
    expect(drawingsInFolder(doc, "f2")).toEqual([]);
  });
});

describe("favoriteDrawings", () => {
  it("gathers the starred ones flat, wherever they are filed", () => {
    expect(favoriteDrawings(doc).map((d) => d.id)).toEqual([
      "starredAndFiled",
      "starred",
    ]);
  });

  it("leaves a shelved favorite out", () => {
    const shelvedStar: AppData = {
      ...doc,
      drawings: [
        drawing("d1", "2026-01-01T00:00:00.000Z", {
          favorite: true,
          archived: true,
        }),
      ],
    };
    expect(favoriteDrawings(shelvedStar)).toEqual([]);
  });
});

describe("archivedCount", () => {
  it("tallies shelved drawings and folders together", () => {
    // Two drawings ("shelved", "shelvedWithFolder") plus one folder ("f2").
    expect(archivedCount(doc)).toBe(3);
  });

  it("is zero for a document with nothing shelved", () => {
    expect(
      archivedCount({
        folders: [],
        drawings: [drawing("d1", "2026-01-01T00:00:00.000Z")],
        activeDrawingId: "d1",
      }),
    ).toBe(0);
  });
});

describe("byRecency", () => {
  it("orders every list most-recently-edited first", () => {
    expect(liveDrawings(doc).map((d) => d.id)).toEqual([
      "starredAndFiled",
      "starred",
      "orphan",
      "loose",
      "filed",
    ]);
  });

  it("falls back to when the drawing was made, then to its name", () => {
    // A drawing that has never been edited has no `updatedAt`, so its creation
    // stamp stands in; one carrying neither (written by a build older than the
    // stamps) sorts oldest, and equal stamps break by name so the order is
    // stable rather than arbitrary.
    const made = { ...drawing("made", ""), updatedAt: undefined };
    expect(
      lastTouched({ ...made, createdAt: "2026-01-09T00:00:00.000Z" }),
    ).toBe(Date.parse("2026-01-09T00:00:00.000Z"));
    expect(lastTouched({ ...made, createdAt: undefined })).toBe(0);
    const stamp = "2026-01-08T00:00:00.000Z";
    expect(
      [drawing("b", stamp), drawing("a", stamp)]
        .sort(byRecency)
        .map((d) => d.id),
    ).toEqual(["a", "b"]);
  });
});
