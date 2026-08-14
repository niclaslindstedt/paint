// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What "a selection" means, as arithmetic.
//
// The selection itself is not document state — nothing about which marks are
// picked belongs in a saved drawing, and nothing about it is undoable. What *is*
// document state is what you do to the marks afterwards: moving them, deleting
// them, pasting copies of them. So the screen holds a set of stroke ids and this
// module answers every question about them:
//
//   - which marks a dragged marquee caught (`strokesInBox`)
//   - how much of the page the caught ones cover (`selectionBox`)
//   - what one of them looks like moved (`translateStroke`)
//
// All of it is pure and switches on the shape kind, the same contract the
// renderer's fallback painter and `bounds.ts` use: a tool that invents no new
// shape kind needs no change here. Which is the point — the selection tool works
// on marks made by tools it has never heard of, including ones a later build
// adds.

import { strokeBounds, unionBox, type Box, type Measurable } from "./bounds.ts";
import { lockedMarks, visibleStrokes } from "./layers.ts";
import type { Drawing, Point, Stroke } from "./types.ts";

/** Whether two boxes overlap at all. */
function overlaps(a: Box, b: Box): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

/** Whether `p` lies inside `box` — what decides that a press on the page has
 *  landed on the selection rather than beside it. */
export function inBox(box: Box, p: Point): boolean {
  return (
    p.x >= box.x &&
    p.x <= box.x + box.width &&
    p.y >= box.y &&
    p.y <= box.y + box.height
  );
}

/** The marks a marquee dragged over `box` catches: every **visible, unlocked**
 *  stroke whose own box it touches, in paint order.
 *
 *  Touching rather than containing, deliberately. A marquee you have to draw
 *  right around a long diagonal line is a marquee you draw twice; catching what
 *  the box crosses is what every drawing program does and what a hand expects.
 *
 *  Two kinds of mark are not caught at all. Marks on a **hidden** layer, because
 *  you cannot select what you cannot see and deleting something invisible is the
 *  worst kind of surprise; and marks on a **locked** one, because a lock that
 *  stopped the pencil but let a marquee drag the sheet off the page would not be
 *  a lock. This is the one gate both rules live behind — everything a selection
 *  can then do (move, cut, delete) takes its ids from here. */
export function strokesInBox(drawing: Drawing, box: Box): Stroke[] {
  const locked = lockedMarks(drawing);
  return visibleStrokes(drawing).filter((stroke) => {
    if (locked(stroke)) return false;
    const bounds = strokeBounds(stroke);
    return bounds ? overlaps(bounds, box) : false;
  });
}

/** The page a run of marks covers, or `null` when there are none — the outline
 *  the canvas draws around a settled selection, and the box a press is tested
 *  against to see whether it grabbed it. */
export function selectionBox(strokes: readonly Measurable[]): Box | null {
  let box: Box | null = null;
  for (const stroke of strokes) {
    const next = strokeBounds(stroke);
    if (!next) continue;
    box = box ? unionBox(box, next) : next;
  }
  return box;
}

/** Shift every point in a shape by (`dx`, `dy`).
 *
 *  Switching on the kind rather than on the tool, for the same reason
 *  `strokeBounds` does: moving a mark is a question about geometry, and the
 *  plugin that drew it has no say in the answer. A stroke whose shape this build
 *  doesn't recognise comes back unmoved rather than mangled. */
export function translateStroke<T extends Measurable>(
  stroke: T,
  dx: number,
  dy: number,
): T {
  const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  const shape = stroke.shape;
  switch (shape.kind) {
    case "path":
      return { ...stroke, shape: { ...shape, points: shape.points.map(move) } };
    case "segment":
    case "box":
    case "image":
      return {
        ...stroke,
        shape: { ...shape, from: move(shape.from), to: move(shape.to) },
      };
    case "region":
      return {
        ...stroke,
        shape: { ...shape, contours: shape.contours.map((c) => c.map(move)) },
      };
    case "text":
      return { ...stroke, shape: { ...shape, at: move(shape.at) } };
  }
}

/** …and the same over a run of them. */
export function translateStrokes<T extends Measurable>(
  strokes: readonly T[],
  dx: number,
  dy: number,
): T[] {
  return strokes.map((stroke) => translateStroke(stroke, dx, dy));
}

/** The offset that would put a run of marks' top-left corner at `at`. What the
 *  menu's paste uses so the marks land where the menu was opened, rather than a
 *  fixed nudge from wherever they were copied. */
export function offsetTo(strokes: readonly Measurable[], at: Point): Point {
  const box = selectionBox(strokes);
  if (!box) return { x: 0, y: 0 };
  return { x: at.x - box.x, y: at.y - box.y };
}
