// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the text box's field and its type bar are allowed to sit.
//
// The box is a DOM element floating over the canvas at the point that was
// pressed, and it grows: to the right as the caption gets longer, and — the bar
// above it — with however wide a row of type buttons comes out in the user's
// language. Both of those can run off the canvas, so both are bounded here,
// away from the DOM, and `TextEntry.tsx` only supplies the measurements.
//
// Two different bounds, because the two halves mean different things. The field
// is a *preview of the mark*: it must start exactly on the anchor, so the only
// thing that may give is its width. The bar is *chrome*: it may sit wherever it
// is reachable, so it is allowed to wrap onto more rows, slide back inside the
// canvas, and flip below the box when there is no room above it.
//
// The wrap matters more than it sounds. The bar is nearly as wide as a phone,
// so a caption started on the right-hand half used to push it hard against the
// left edge of the canvas — and the grip is at the head of the bar, which left
// the one thumb-sized handle for moving the caption pinned to the edge with
// nowhere left to drag it *to*. Wrapping the buttons into the room actually
// left keeps the bar's head over the box it belongs to, so the caption can be
// dragged either way.

/** How much of the canvas is kept clear around the box and its bar, in screen
 *  pixels. Enough that a clamped bar doesn't sit flush against the edge. */
export const GUTTER = 8;

/** How narrow the field is allowed to get when the caret lands right against
 *  the edge of the canvas.
 *
 *  Deliberately tiny. A wider floor reads better right up until the press that
 *  lands twenty pixels from the edge, and then it is a box hanging off the
 *  screen again — which is the thing this is here to stop. A box this narrow is
 *  awkward, but the words scroll through it, the bar above it is reachable, and
 *  the caption can be dragged somewhere sensible. */
export const MIN_FIELD = 24;

/** How narrow the bar is allowed to wrap itself down to, in screen pixels —
 *  four square buttons and the gaps between them, which is the narrowest a row
 *  of controls still reads as a row. It is what folds the bar into its two
 *  sensible halves (the grip and the face, then the weight, the slant and the
 *  two ways out); under it the bar would be a column, so it stops wrapping and
 *  slides instead. */
export const MIN_BAR = 136;

/** What the box is measured against: the canvas layer, in screen pixels. */
export type Room = { width: number; height: number };

/** How wide the field opens: what the words want, capped by what is left of the
 *  canvas to the right of the anchor. The browser scrolls the field sideways to
 *  follow the caret once it hits that cap, so the words being typed stay
 *  visible even when the box can't grow any further. */
export function fieldWidth(
  wanted: number,
  roomWidth: number,
  anchorX: number,
): number {
  if (!roomWidth) return wanted;
  return Math.max(MIN_FIELD, Math.min(wanted, roomWidth - anchorX - GUTTER));
}

/** Where the type bar goes, given the room, the anchor it hangs off, and what
 *  the bar itself last measured. */
export type BarPlacement = {
  /** The width to wrap the buttons into, or `null` before anything has been
   *  measured — then the bar takes its natural single row. */
  maxWidth: number | null;
  /** How far to slide the bar off the anchor, in screen pixels. Negative pulls
   *  it back inside the right-hand edge; positive pushes it off the left. */
  shift: number;
  /** Whether the bar hangs above the box, or below it for want of room. */
  above: boolean;
};

export function barPlacement(
  room: Room,
  anchor: { x: number; y: number },
  bar: { width: number; height: number },
): BarPlacement {
  // Wrap into the room to the right of the anchor, so the bar's head stays over
  // the box — but never into less than a row, and never wider than the canvas
  // (which is what bounds a box pressed near the left edge).
  const maxWidth = room.width
    ? Math.min(
        room.width - GUTTER * 2,
        Math.max(MIN_BAR, room.width - anchor.x - GUTTER),
      )
    : null;
  // Whatever still hangs off the right — the bar jammed against the right-hand
  // edge, where the wrap has bottomed out at `MIN_BAR` — is slid back inside,
  // but not so far that the bar leaves the canvas on the other side.
  const overhang = room.width
    ? Math.min(0, room.width - GUTTER - (anchor.x + bar.width))
    : 0;
  const shift = Math.max(overhang, GUTTER - anchor.x);
  const above = !bar.height || anchor.y - bar.height - GUTTER >= 0;
  return { maxWidth, shift, above };
}
