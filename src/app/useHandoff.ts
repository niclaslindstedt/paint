// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Handing work to another sketchbook.
//
// Two verbs — give a drawing away, give a folder and everything filed in it
// away — and the delivery both of them go through. They sit beside the store
// rather than in it because they are the one family of edits that touches a
// document **this app does not have open**: the arithmetic of what leaves and
// what arrives is pure and lives in `handoff.ts`, and what is left here is the
// awkward half — writing the other side through the backend, reading it back to
// see that the bytes really landed, and only then committing this side without
// the item.
//
// Everything else about them is ordinary: the source document changes in one
// commit, so a hand-off is one undo step like any other edit (see
// `usePaintStore.ts`, which owns the timeline).

import { useCallback } from "react";

import { blankDrawing, freshId, type DocBackend } from "./docBackend.ts";
import {
  handOffDrawing,
  handOffFolder,
  type Handoff,
  type Mint,
} from "./handoff.ts";
import type { AppData } from "./types.ts";
import * as output from "../output.ts";

/** The constructors the hand-off module needs to mint arriving copies and to
 *  leave a page behind when the last live one is given away. */
const MINT: Mint = { id: freshId, blankPage: () => blankDrawing("") };

/** The store's live state, as much of it as a hand-off reads. Held as a ref
 *  rather than passed as a value so these verbs are not rebuilt on every
 *  stroke: they travel down to menu rows and namespace drop targets, which
 *  would otherwise re-render with each mark (see `usePaintStore.ts`). */
type StateRef = {
  readonly current: { slug: string; backend: DocBackend; data: AppData };
};

/** The two "move it to that sketchbook" verbs, over the store's state and its
 *  commit. */
export function useHandoff(
  stateRef: StateRef,
  commit: (next: AppData) => void,
) {
  /** Deliver one side of a hand-off to another namespace's storage, then check
   *  it actually landed there before this namespace lets go of it.
   *
   *  Two documents change and only one of them is in React state: the
   *  destination isn't loaded, so it is written straight through the backend.
   *  That write is a best-effort sink — it reports a failure rather than
   *  throwing (see `DocBackend`) — so "it didn't throw" is not evidence the
   *  bytes are there. Reading the destination back and looking for the ids the
   *  hand-off minted is; only then is this side committed without the item.
   *  Resolves to whether the move went through.
   *
   *  Asynchronous because the storage is: `deliver` writes to the database and
   *  waits for it to confirm, then reads the record back past the cache. Both
   *  waits are the guarantee — a cached read would only be the write agreeing
   *  with itself. */
  const deliver = useCallback(
    async (targetSlug: string, moved: Handoff | null): Promise<boolean> => {
      if (!moved) return false;
      let landed = false;
      try {
        const written = await stateRef.current.backend.deliver(
          targetSlug,
          moved.target,
        );
        if (written) {
          const drawings = new Set(written.drawings.map((d) => d.id));
          const folders = new Set(written.folders.map((f) => f.id));
          landed =
            moved.arrived.drawings.every((id) => drawings.has(id)) &&
            (moved.arrived.folder === undefined ||
              folders.has(moved.arrived.folder));
        }
      } catch {
        landed = false;
      }
      if (!landed) {
        output.error(
          "Couldn't move that into the other sketchbook — its copy on this device wouldn't take the change (its storage may be full). Nothing was moved.",
        );
        return false;
      }
      commit(moved.source);
      return true;
    },
    [commit, stateRef],
  );

  /** Hand a drawing to another sketchbook — the menu's "drop it onto a
   *  namespace row" gesture. It lands at that sketchbook's top level: the
   *  folder it was filed in is this one's, and doesn't exist over there. */
  const moveDrawingToNamespace = useCallback(
    async (id: string, targetSlug: string) => {
      const { slug: from, backend: store } = stateRef.current;
      if (targetSlug === from) return;
      let moved: Handoff | null;
      try {
        // The destination isn't the open sketchbook, so it is very likely not
        // in hand — hydrate it rather than reading a cache that would answer
        // "empty" and hand the drawing to a document that wipes the rest.
        const target = await store.hydrate(targetSlug);
        moved = handOffDrawing(stateRef.current.data, target, id, MINT);
      } catch {
        return; // The destination's storage wouldn't even read — leave it be.
      }
      await deliver(targetSlug, moved);
    },
    [deliver, stateRef],
  );

  /** Hand a folder — and the drawings filed in it — to another sketchbook. The
   *  group travels together: the folder is re-created over there and its
   *  drawings are re-filed inside it, so it arrives as a group rather than as
   *  loose pages. */
  const moveFolderToNamespace = useCallback(
    async (id: string, targetSlug: string) => {
      const { slug: from, backend: store } = stateRef.current;
      if (targetSlug === from) return;
      let moved: Handoff | null;
      try {
        const target = await store.hydrate(targetSlug);
        moved = handOffFolder(stateRef.current.data, target, id, MINT);
      } catch {
        return;
      }
      await deliver(targetSlug, moved);
    },
    [deliver, stateRef],
  );
  return { moveDrawingToNamespace, moveFolderToNamespace };
}
