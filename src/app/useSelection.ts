// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The window a selection has cut in the page, and the three edits that hang off
// it.
//
// It sits beside the screen rather than in it because it is a *concern*: where
// the window is, what the three things you can do through it are, and the keys
// that reach them. The screen wires it to the canvas and to the menu and knows
// nothing else about it (see `CanvasScreen.tsx`).
//
// Nothing here is *document* state: a window is never saved and never synced,
// and what the drawing keeps is what you did through it (see `selection.ts` for
// the arithmetic, which is pure and node-tested). It **is** undoable, though,
// and that is why the window itself lives in the store rather than in a
// `useState` here: cutting one, sliding one, painting one stroke of one with
// the draw-select nib, and putting one away are each a rung of the same
// timeline the marks land on, so ⌘/Ctrl+Z takes back whichever of the two you
// did last (see `history.ts`). This module holds the verbs and the keys; the
// store holds the window.

import { useCallback, useEffect, useRef, useState } from "react";

import { writeStrokes } from "./clipboard.ts";
import { fieldHasKeyboard } from "./keys.ts";
import { eraseRegionStroke } from "./plugins/builtin/eraseRegion.ts";
import { pluginById } from "./plugins/registry.ts";
import type { DraftStroke } from "./plugins/types.ts";
import {
  boxRegion,
  eraseRegion,
  moveRegion,
  moveRegionContents,
  selectionOf,
  splitRegion,
  type Selection,
} from "./selection.ts";
import { encodeStrokes } from "./strokeClipboard.ts";
import type { Drawing, Point } from "./types.ts";
import { freshId, type PaintStore } from "./usePaintStore.ts";

export type SelectionControl = {
  /** The window itself, or `null` for none. One object for as long as it
   *  doesn't move: the canvas's frame compares it by identity to decide whether
   *  a frame can be patched (see `trail.ts`). */
  selection: Selection | null;
  /** Cut a window, move one, or put one away — one step back each, unless
   *  `live` says the window is still in flight (see `usePaintStore.ts`). */
  setSelection: (
    selection: Selection | null,
    options?: { live?: boolean },
  ) => void;
  /** The window as it is *now*, for callbacks that must not be rebuilt every
   *  time it moves — a caption is kept by an effect that watches the tool, and
   *  rebuilding that on every nudge of a marquee would keep firing it. */
  selectionRef: { readonly current: Selection | null };
  /** The point a corner grip is being dragged to, while one is — what the canvas
   *  floats the magnifier beside (see `loupe.ts`). */
  adjusting: Point | null;
  setAdjusting: (at: Point | null) => void;
  /** How far the hand's drag has carried the window so far, while one is in
   *  flight, and `null` the rest of the time. The canvas paints what the window
   *  holds — and the outline around it — at this offset without touching the
   *  document; the grips are elements *over* the canvas and are not painted by
   *  it, so they need the same offset or they stay at the corners of a window
   *  that has visibly left them (see `SelectionFrame.tsx`). */
  carrying: Point | null;
  setCarrying: (offset: Point | null) => void;
  /** Keep what the window holds — see below. Answers whether there was
   *  anything to keep. */
  copySelection: (data?: DataTransfer | null) => boolean;
  /** The marks this app last copied. The system clipboard is the real one — a
   *  copy writes there too, which is what makes copy-here-paste-there work — but
   *  a browser may refuse to hand it back, and falling back on what we know we
   *  copied beats a paste that does nothing. */
  copied: { readonly current: DraftStroke[] | null };
  eraseSelection: () => void;
  moveSelection: (dx: number, dy: number) => void;
};

/** Hold a window over `drawing`, and the three edits that go through it.
 *
 *  `tool` decides one thing only: whether ⌘/Ctrl+A means anything. "Take the
 *  whole sheet" means nothing with a pencil in your hand, and swallowing the
 *  browser's own select-all there would be a nuisance.
 *
 *  `onEscape` is what else that key means to the screen — closing the menu, so
 *  one press is one "never mind". */
export function useSelection(
  store: PaintStore,
  drawing: Drawing | undefined,
  tool: string,
  onEscape: () => void,
): SelectionControl {
  const copied = useRef<DraftStroke[] | null>(null);
  const [adjusting, setAdjusting] = useState<Point | null>(null);
  const [carrying, setCarrying] = useState<Point | null>(null);
  // The window is the store's, because it is undoable (see the head of this
  // file). A window is cut in *one* page and shown over no other, which the
  // store answers rather than an effect here having to drop it: opening another
  // drawing shows none, and coming back finds this one where you left it.
  const { selection, setSelection } = store;
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;

  // What a drag in flight is worth carrying to another page: nothing. The
  // window itself needs no such sweep — it belongs to the page it was cut in
  // and the store shows it over no other — but an offset left over from a drag
  // the page changed under would move ink that is no longer there.
  const openPage = drawing?.id;
  useEffect(() => {
    setAdjusting(null);
    setCarrying(null);
  }, [openPage]);

  /** Keep what the window holds: on the system clipboard, so it can be pasted
   *  into another tab or another sketchbook, and in the screen's own hand in
   *  case the browser won't give it back.
   *
   *  What is copied is the marks under the window on the layer being drawn on,
   *  each one **cut to it** — so a copy of half a line is half a line, and
   *  pasting it back gives you exactly what the outline was around.
   *
   *  `data` is the `DataTransfer` of a real `copy` / `cut` event when there is
   *  one — that path needs no permission and never fails, so it is the one the
   *  keyboard takes. The menu has no event and falls back to asking. */
  const copySelection = useCallback(
    (data?: DataTransfer | null) => {
      if (!selection || !drawing) return false;
      const held = splitRegion(drawing, selection.region).inside;
      if (held.length === 0) return false;
      copied.current = held.map(({ id: _id, layer: _layer, ...s }) => s);
      const text = encodeStrokes(held);
      if (data) data.setData("text/plain", text);
      else void writeStrokes(held);
      return true;
    },
    [drawing, selection],
  );

  /** Rub out what the window holds, on the layer being drawn on — Delete, the
   *  menu's Delete, and a tap inside it with the rubber all land here.
   *
   *  A mark the window swallows whole goes; one it crosses is cut to everywhere
   *  the window isn't, so what is left of it is still the mark it was and one
   *  undo brings the whole of it back (see `eraseRegion`). The window stays up:
   *  clearing a patch and painting something else into it is one job, not two.
   *
   *  A window that carries a **feather** (the selection pencil's) deletes the
   *  other way this app takes pixels off: as one erasing mark, the selection's
   *  area with the bucket's softened skirt run outward from its outline, so
   *  what goes fades out through the corners instead of stopping dead (see
   *  `eraseRegion.ts`). It behaves as the eraser tool does — lifting ink down
   *  to the sheet, whatever layer it was on — because a fade has no outline a
   *  vector cut could follow. Still one undo step either way. */
  const eraseSelection = useCallback(() => {
    if (!selection || !drawing) return;
    const feather = selection.feather ?? 0;
    if (feather > 0) {
      // Nothing on the page means nothing to fade out — an invisible mark and
      // an undo step for it would be all a press could buy.
      if (drawing.strokes.length === 0) return;
      store.addStroke(eraseRegionStroke(selection.region, feather));
      return;
    }
    const strokes = eraseRegion(drawing, selection.region);
    if (strokes) store.applyStrokes(strokes);
  }, [drawing, selection, store]);

  /** Carry what the window holds somewhere else — the hand's drag, landed once
   *  when the finger lifts. The window travels with the ink: what you dragged is
   *  still under the window when you let go, so a second nudge is a second drag
   *  rather than a fresh marquee. */
  const moveSelection = useCallback(
    (dx: number, dy: number) => {
      if (!selection || !drawing) return;
      const strokes = moveRegionContents(
        drawing,
        selection.region,
        dx,
        dy,
        () => freshId("stroke"),
      );
      if (!strokes) return;
      // The ink and the window move in one edit, so one step back brings both
      // home rather than leaving the outline stranded where the marks no longer
      // are.
      store.applyStrokes(strokes, {
        fitPage: true,
        select: {
          ...selection,
          region: moveRegion(selection.region, dx, dy),
          box: {
            ...selection.box,
            x: selection.box.x + dx,
            y: selection.box.y + dy,
          },
        },
      });
    },
    [drawing, selection, store],
  );

  // The keys the clipboard's own events don't carry: rubbing out what the window
  // holds, putting the window away, and taking the whole sheet.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (fieldHasKeyboard(e.target)) return;
      const held = e.metaKey || e.ctrlKey;
      if (!held && (e.key === "Delete" || e.key === "Backspace")) {
        if (!selection) return;
        e.preventDefault();
        eraseSelection();
        return;
      }
      if (!held && e.key === "Escape") {
        setSelection(null);
        onEscape();
        return;
      }
      if (held && e.key.toLowerCase() === "a") {
        if (!pluginById(tool)?.selects || !drawing) return;
        e.preventDefault();
        setSelection(
          selectionOf(
            boxRegion({
              x: 0,
              y: 0,
              width: drawing.width,
              height: drawing.height,
            }),
          ),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [eraseSelection, selection, setSelection, tool, drawing, onEscape]);

  return {
    selection,
    setSelection,
    selectionRef,
    adjusting,
    setAdjusting,
    carrying,
    setCarrying,
    copySelection,
    copied,
    eraseSelection,
    moveSelection,
  };
}
