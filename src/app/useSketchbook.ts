// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sketchbook: the pages and the folders they are filed in.
//
// Everything here is an edit to the *collection* rather than to a page — make a
// drawing, duplicate one, rename it, throw it away, star it, file it in a
// folder, hold it in the archive, and the same four for the folders themselves.
// They sit beside the store because they are their own concern: not one of them
// knows what a stroke is, and the screens that drive them are the menu and the
// sidebar rather than the canvas.
//
// They are ordinary edits for all that. Each lands in one `commit`, so each is
// one undo step and one push to the cloud, and the store owns the timeline they
// land on (see `usePaintStore.ts`).

import { useCallback } from "react";

import { blankDrawing, freshId } from "./docBackend.ts";
import {
  nextActiveId,
  type AppData,
  type Drawing,
  type Folder,
} from "./types.ts";

/** Apply `patch` to the drawings named by `ids`, stamping `updatedAt` on each.
 *  The one funnel the archive / restore / file-into-folder actions share, so a
 *  bulk edit (archiving a folder takes its drawings with it) is one map rather
 *  than one per call site. */
function patchDrawings(
  drawings: Drawing[],
  ids: ReadonlySet<string>,
  patch: Partial<Drawing>,
): Drawing[] {
  const stamp = new Date().toISOString();
  return drawings.map((d) =>
    ids.has(d.id) ? { ...d, ...patch, updatedAt: stamp } : d,
  );
}

/** The page and folder verbs, over the store's document and its commit.
 *
 *  `emptied` is told when the last live page has just been deleted and a blank
 *  one put in its place: what a fresh start is *made of* is the settings'
 *  answer rather than this module's (see `kit.ts`). Held in a ref by the caller
 *  so a fresh closure doesn't rebuild every verb below. */
export function useSketchbook(
  data: AppData,
  commit: (next: AppData) => void,
  emptied: { readonly current: (() => void) | undefined },
) {
  /** Create a page and open it, optionally filed into a folder.
   *
   *  `init` seeds the new page — the size and the strokes an image dropped onto
   *  the sidebar arrives with — so the drawing is created in its finished state
   *  rather than created blank and then edited, which would be two undo steps
   *  for one gesture. */
  const addDrawing = useCallback(
    (
      name = "",
      folderId: string | null = null,
      init: Partial<Omit<Drawing, "id">> = {},
    ): string => {
      const drawing = { ...blankDrawing(name, folderId), ...init };
      commit({
        ...data,
        drawings: [...data.drawings, drawing],
        activeDrawingId: drawing.id,
      });
      return drawing.id;
    },
    [commit, data],
  );

  /** Duplicate a page, marks and all — the "start from this sketch" move. */
  const duplicateDrawing = useCallback(
    (id: string): string | null => {
      const source = data.drawings.find((d) => d.id === id);
      if (!source) return null;
      const copy: Drawing = {
        ...source,
        id: freshId("drawing"),
        strokes: source.strokes.map((s) => ({ ...s, id: freshId("stroke") })),
        createdAt: new Date().toISOString(),
        updatedAt: undefined,
      };
      commit({
        ...data,
        drawings: [...data.drawings, copy],
        activeDrawingId: copy.id,
      });
      return copy.id;
    },
    [commit, data],
  );

  const renameDrawing = useCallback(
    (id: string, name: string) => {
      commit({
        ...data,
        drawings: data.drawings.map((d) =>
          d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d,
        ),
      });
    },
    [commit, data],
  );

  /** Delete a page. The last page is never removed outright — it is replaced by
   *  a fresh blank one, so the app always has something to draw on.
   *
   *  Emptying the sketchbook is a fresh start rather than merely one fewer
   *  page, so the blank one that lands is handed over the way a first run's is:
   *  no colour of its own, which resolves to the default page (see
   *  `canvas.ts`), and `onEmptied` puts the default tool back in your hand. */
  const deleteDrawing = useCallback(
    (id: string) => {
      const remaining = data.drawings.filter((d) => d.id !== id);
      // "The last page" means the last *live* one: with everything else in the
      // archive, deleting the open drawing still has to leave a page to draw
      // on, and un-archiving one to get there would be a surprise.
      const live = remaining.some((d) => !d.archived);
      const drawings = live ? remaining : [...remaining, blankDrawing("")];
      commit({
        ...data,
        drawings,
        activeDrawingId: nextActiveId(drawings, data.activeDrawingId),
      });
      if (!live) emptied.current?.();
    },
    [commit, data, emptied],
  );

  /** Star / unstar a drawing — what puts it in the menu's Favorites section. */
  const toggleFavorite = useCallback(
    (id: string) => {
      const target = data.drawings.find((d) => d.id === id);
      if (!target) return;
      commit({
        ...data,
        drawings: patchDrawings(data.drawings, new Set([id]), {
          favorite: !target.favorite,
        }),
      });
    },
    [commit, data],
  );

  /** File a drawing into a folder, or lift it back to the top level with
   *  `null`. */
  const moveDrawingToFolder = useCallback(
    (id: string, folderId: string | null) => {
      commit({
        ...data,
        drawings: patchDrawings(data.drawings, new Set([id]), { folderId }),
      });
    },
    [commit, data],
  );

  /** Hold a drawing in the archive, or bring it back out. Archiving the open
   *  page moves the canvas to the next live one rather than leaving it on a
   *  filed-away drawing. */
  const setDrawingArchived = useCallback(
    (id: string, archived: boolean) => {
      const drawings = patchDrawings(data.drawings, new Set([id]), {
        archived,
      });
      commit({
        ...data,
        drawings,
        activeDrawingId: archived
          ? nextActiveId(drawings, data.activeDrawingId)
          : id,
      });
    },
    [commit, data],
  );

  /** Create a folder. Empty until drawings are filed into it — creating one
   *  never moves anything on its own. */
  const addFolder = useCallback(
    (name: string): string => {
      const folder: Folder = {
        id: freshId("folder"),
        name,
        createdAt: new Date().toISOString(),
      };
      commit({ ...data, folders: [...data.folders, folder] });
      return folder.id;
    },
    [commit, data],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      commit({
        ...data,
        folders: data.folders.map((f) => (f.id === id ? { ...f, name } : f)),
      });
    },
    [commit, data],
  );

  /** Archive a folder — and, with it, every drawing filed inside. Restoring the
   *  folder restores them together, so a group is held and brought back as one
   *  thing rather than card by card. */
  const setFolderArchived = useCallback(
    (id: string, archived: boolean) => {
      const inside = new Set(
        data.drawings.filter((d) => d.folderId === id).map((d) => d.id),
      );
      const drawings = patchDrawings(data.drawings, inside, { archived });
      commit({
        ...data,
        folders: data.folders.map((f) =>
          f.id === id ? { ...f, archived } : f,
        ),
        drawings,
        activeDrawingId: archived
          ? nextActiveId(drawings, data.activeDrawingId)
          : data.activeDrawingId,
      });
    },
    [commit, data],
  );

  /** Delete a folder, keeping its drawings — they lift back to the top level
   *  rather than vanishing with the group. Deleting the box is not deleting
   *  what was in it. */
  const deleteFolder = useCallback(
    (id: string) => {
      const inside = new Set(
        data.drawings.filter((d) => d.folderId === id).map((d) => d.id),
      );
      commit({
        ...data,
        folders: data.folders.filter((f) => f.id !== id),
        drawings: patchDrawings(data.drawings, inside, { folderId: null }),
      });
    },
    [commit, data],
  );

  return {
    addDrawing,
    duplicateDrawing,
    renameDrawing,
    deleteDrawing,
    toggleFavorite,
    moveDrawingToFolder,
    setDrawingArchived,
    addFolder,
    renameFolder,
    setFolderArchived,
    deleteFolder,
  };
}
