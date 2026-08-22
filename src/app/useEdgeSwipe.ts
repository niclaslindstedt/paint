// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Whose gesture is this — the drawer's, the layers panel's, or the canvas's?
//
// A touch that lands within a few pixels of the screen edge is ambiguous, and
// it stays ambiguous until it moves: an inward drag opens a panel, and anything
// else is a mark the user meant to draw at the edge of the page. The canvas
// cannot answer it at press time and must not guess, because both wrong answers
// are bad — opening the drawer over a stroke somebody was drawing, or laying a
// stroke down while the drawer slides out under it.
//
// So a press in a watched strip is **held**: nothing is begun, nothing is
// painted, and the press waits. The moment the finger moves far enough to
// decide (`classifyEdgeDrag`), one of three things happens — the swipe fires
// and the panel opens, the press turns out to be a drawing gesture and is
// **replayed from where it first landed** so no ink is lost to the wait, or it
// is still too early to tell and the press keeps waiting. A finger that lifts
// while still held was never a swipe, and lands as the tap it was.
//
// It is a seam of its own because none of it is about drawing: the canvas asks
// four questions of it and does not need to know how any of them are answered.
// Touch only, deliberately — a swipe is a touch gesture, so a mouse or a pen at
// the edge is never in doubt and is never held.

import { useCallback, useRef } from "react";

import { classifyEdgeDrag, inEdgeZone, type MenuEdge } from "./gestures.ts";
import type { Point } from "./types.ts";

/** A press waiting to find out what it is. `viewport` is where it landed on the
 *  screen (what the swipe is measured in), `point` where it landed on the
 *  element (what the gesture is replayed from when it turns out to be ours),
 *  and `open` what to run if the swipe fires: nothing for the drawer, which the
 *  framework opens itself. */
type HeldEdgePress = {
  pointerId: number;
  edge: MenuEdge;
  viewport: Point;
  point: Point;
  open?: () => void;
};

/** What a held press has turned out to be, now that the finger has moved:
 *  `"waiting"` — still too early to tell, and the press stays held;
 *  `"opened"` — the swipe fired and the panel is opening;
 *  a point — the gesture is the canvas's, to be replayed from there;
 *  `null` — this pointer was never held, so nothing here applies. */
export type EdgeVerdict = "waiting" | "opened" | Point | null;

export function useEdgeSwipe({
  menuSwipeEdge,
  panelSwipeEdge,
  onPanelSwipe,
}: {
  /** The edge the sidebar's open-swipe is armed on, or `null`. */
  menuSwipeEdge: MenuEdge | null;
  /** …and the layers panel's. */
  panelSwipeEdge: MenuEdge | null;
  onPanelSwipe?: () => void;
}) {
  const held = useRef<HeldEdgePress | null>(null);

  /** Which swipe, if any, a press landing at `x` (in viewport coordinates)
   *  could still turn out to be. The sidebar is asked first: it is the
   *  framework's gesture and it is already listening whatever we decide, so on
   *  the one edge both could want, holding it for anything else would open two
   *  things at once. */
  const watching = useCallback(
    (x: number): { edge: MenuEdge; open?: () => void } | undefined => {
      const width = window.innerWidth;
      if (menuSwipeEdge && inEdgeZone(x, width, menuSwipeEdge)) {
        return { edge: menuSwipeEdge };
      }
      if (panelSwipeEdge && inEdgeZone(x, width, panelSwipeEdge)) {
        return { edge: panelSwipeEdge, open: onPanelSwipe };
      }
      return undefined;
    },
    [menuSwipeEdge, panelSwipeEdge, onPanelSwipe],
  );

  /** Hold a touch that landed in a watched strip. `true` when it was held —
   *  the caller must then begin nothing at all. */
  const hold = useCallback(
    (
      e: {
        pointerId: number;
        pointerType: string;
        clientX: number;
        clientY: number;
      },
      point: Point,
    ): boolean => {
      const watched =
        e.pointerType === "touch" ? watching(e.clientX) : undefined;
      if (!watched) return false;
      held.current = {
        pointerId: e.pointerId,
        viewport: { x: e.clientX, y: e.clientY },
        point,
        ...watched,
      };
      return true;
    },
    [watching],
  );

  /** Decide a held press now that its finger has moved (see `EdgeVerdict`). A
   *  swipe that fired opens what it was watching here; a press that turns out
   *  to be the canvas's is handed back the point it first landed on. */
  const settle = useCallback(
    (e: {
      pointerId: number;
      clientX: number;
      clientY: number;
    }): EdgeVerdict => {
      const press = held.current;
      if (!press || press.pointerId !== e.pointerId) return null;
      const verdict = classifyEdgeDrag(
        e.clientX - press.viewport.x,
        e.clientY - press.viewport.y,
        press.edge,
      );
      if (verdict === "pending") return "waiting";
      held.current = null;
      if (verdict === "menu") {
        press.open?.();
        return "opened";
      }
      return press.point;
    },
    [],
  );

  /** A press still held when the finger lifts was never a swipe — it would
   *  have fired long before this. The point it landed on, so the caller can
   *  start it now and end it in the same breath; `null` when this pointer was
   *  not held. */
  const lift = useCallback((pointerId: number): Point | null => {
    const press = held.current;
    if (!press || press.pointerId !== pointerId) return null;
    held.current = null;
    return press.point;
  }, []);

  /** Forget a held press, whoever owned it. */
  const drop = useCallback((pointerId?: number): void => {
    if (pointerId === undefined || held.current?.pointerId === pointerId) {
      held.current = null;
    }
  }, []);

  return { hold, settle, lift, drop };
}
