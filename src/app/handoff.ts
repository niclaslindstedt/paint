// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { nextActiveId, type AppData, type Drawing } from "./types.ts";

// Handing a drawing — or a whole folder — from one sketchbook to another.
//
// A namespace is a separate document under a separate storage key, so "move to
// another sketchbook" is not an edit to one document but a coordinated edit to
// two: append to the destination, remove from the source. That pairing is the
// only interesting thing about it, and it is pure — take both documents, return
// both documents — so it lives here rather than inside the store hook, where it
// could only be exercised through React.
//
// Three rules the store would otherwise have to remember at every call site:
//
//   1. **Fresh ids on the way in.** The arriving copies are minted new ids, so a
//      move that is later undone in the source (which restores the original ids)
//      can't leave two live sketchbooks arguing over the same drawing.
//   2. **The source always keeps a page.** Handing away the last live drawing
//      leaves a blank one behind, exactly as deleting it does — the app must
//      always have something to draw on.
//   3. **The open page follows.** Giving away the drawing on screen moves the
//      canvas to the next live one rather than leaving it pointed at a page this
//      sketchbook no longer holds.
//
// A folder travels with the drawings filed in it: the folder is re-created in
// the destination and its contents are re-filed under the new folder id, so a
// group arrives as a group rather than as loose pages.

/** Both sides of a completed hand-off — the document to keep, the document to
 *  write to the destination namespace, and the ids the arriving copies were
 *  minted with.
 *
 *  Those ids are not bookkeeping: the destination's storage is a best-effort
 *  sink that reports a failed write rather than throwing (see `DocBackend`), so
 *  the caller reads the destination back and looks for them before committing
 *  the source side. Without that check a full disk would quietly swallow the
 *  drawing on the way over *and* remove it here. */
export type Handoff = {
  source: AppData;
  target: AppData;
  arrived: { drawings: string[]; folder?: string };
};

/** The id / blank-page constructors the hand-off needs. Passed in rather than
 *  imported so this module stays a pure function of its inputs (and so a test
 *  can hand it deterministic ones). */
export type Mint = {
  /** A unique id carrying `prefix` — `freshId` in the store. */
  id: (prefix: string) => string;
  /** A fresh empty page, for a source left with nothing live. */
  blankPage: () => Drawing;
};

/** Rule 2: a source thinned down to nothing live keeps a blank page. */
function withLivePage(remaining: Drawing[], mint: Mint): Drawing[] {
  return remaining.some((d) => !d.archived)
    ? remaining
    : [...remaining, mint.blankPage()];
}

/** Hand one drawing to another namespace's document. `null` when the drawing
 *  isn't in `source` — nothing is written on either side. */
export function handOffDrawing(
  source: AppData,
  target: AppData,
  drawingId: string,
  mint: Mint,
): Handoff | null {
  const drawing = source.drawings.find((d) => d.id === drawingId);
  if (!drawing) return null;
  // The arriving copy lands at the destination's top level: the folder it was
  // filed in is this sketchbook's, and doesn't exist over there.
  const arriving: Drawing = {
    ...drawing,
    id: mint.id("drawing"),
    folderId: null,
  };
  const remaining = withLivePage(
    source.drawings.filter((d) => d.id !== drawingId),
    mint,
  );
  return {
    source: {
      ...source,
      drawings: remaining,
      activeDrawingId: nextActiveId(remaining, source.activeDrawingId),
    },
    target: { ...target, drawings: [...target.drawings, arriving] },
    arrived: { drawings: [arriving.id] },
  };
}

/** Hand a folder — and every drawing filed in it — to another namespace's
 *  document. `null` when the folder isn't in `source`. */
export function handOffFolder(
  source: AppData,
  target: AppData,
  folderId: string,
  mint: Mint,
): Handoff | null {
  const folder = source.folders.find((f) => f.id === folderId);
  if (!folder) return null;
  const inside = source.drawings.filter((d) => d.folderId === folderId);
  const arrivingFolderId = mint.id("folder");
  const arriving: Drawing[] = inside.map((d) => ({
    ...d,
    id: mint.id("drawing"),
    folderId: arrivingFolderId,
  }));
  const moved = new Set(inside.map((d) => d.id));
  const remaining = withLivePage(
    source.drawings.filter((d) => !moved.has(d.id)),
    mint,
  );
  return {
    source: {
      ...source,
      folders: source.folders.filter((f) => f.id !== folderId),
      drawings: remaining,
      activeDrawingId: nextActiveId(remaining, source.activeDrawingId),
    },
    target: {
      ...target,
      folders: [...target.folders, { ...folder, id: arrivingFolderId }],
      drawings: [...target.drawings, ...arriving],
    },
    arrived: {
      drawings: arriving.map((d) => d.id),
      folder: arrivingFolderId,
    },
  };
}
