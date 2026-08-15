// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What "a selection" means, as arithmetic.
//
// The selection itself is not document state — nothing about which marks are
// picked belongs in a saved drawing, and nothing about it is undoable. What *is*
// document state is what you do to the marks afterwards: moving them, deleting
// them, pasting copies of them. So the screen holds a set of stroke ids and this
// module answers every question about them:
//
//   - which marks a dragged marquee caught (`strokesInBox`), and which marks any
//     other selection gesture caught — a lasso, an oval, an outline traced off
//     the page itself — all of which arrive here as closed contours and go
//     through one test (`strokesInRegion`)
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

/** What a selection gesture chose, as closed contours in document coordinates —
 *  the one currency the selection tools deal in, whatever gesture made them (see
 *  `plugins/builtin/select.ts`). A box marquee sends one rectangle, a lasso the
 *  loop it drew, the tracing tool one contour per outline of the area it found —
 *  including its holes, which the even-odd rule below leaves out of the
 *  selection the same way the bucket leaves them unpainted. */
export type SelectionRegion = readonly (readonly Point[])[];

/** The smallest box holding every contour, or `null` when there is nothing
 *  there. */
function regionBox(region: SelectionRegion): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const loop of region) {
    for (const p of loop) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX > maxX) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Whether a region is just its own box — one axis-aligned rectangle.
 *
 *  The box marquee is exactly that, and it is the selection people make most,
 *  so it is worth spotting: everything below can then be skipped and the answer
 *  is the box overlap it always was. */
function isBoxRegion(region: SelectionRegion, box: Box): boolean {
  if (region.length !== 1) return false;
  const loop = region[0]!;
  if (loop.length !== 4) return false;
  return loop.every(
    (p) =>
      (p.x === box.x || p.x === box.x + box.width) &&
      (p.y === box.y || p.y === box.y + box.height),
  );
}

/** Whether `p` is inside the region, by the even-odd rule — the same rule the
 *  bucket's fill is painted with, so a traced area's holes are outside its
 *  selection exactly as they are outside its paint. */
function inRegion(region: SelectionRegion, p: Point): boolean {
  let inside = false;
  for (const loop of region) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i]!;
      const b = loop[j]!;
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Whether the segment `a`–`b` touches `box` at all. Liang–Barsky, which also
 *  answers "yes" for a segment lying wholly inside the box. */
function segmentMeetsBox(a: Point, b: Point, box: Box): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

/** Whether a mark's box and a selection region meet — the test a non-rectangular
 *  marquee catches marks by.
 *
 *  Two ways they can, and both are needed: the outline crosses (or runs inside)
 *  the box, or the box sits wholly inside the outline with nothing crossing it.
 *  Measured against the mark's *box* rather than its geometry, which is the same
 *  approximation `strokesInBox` has always made — a marquee that only caught the
 *  ink itself would be one you had to draw twice. */
function regionMeetsBox(region: SelectionRegion, box: Box): boolean {
  for (const loop of region) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      if (segmentMeetsBox(a, b, box)) return true;
    }
  }
  return inRegion(region, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
}

/** The marks a selection gesture caught: every **visible, unlocked** stroke
 *  whose own box the chosen outline touches, in paint order.
 *
 *  The same rules `strokesInBox` holds — it is the box case of this one — plus
 *  the shape of whatever was actually drawn: a lasso catches what its loop
 *  crosses or encloses, and a traced area catches what lies within the contours
 *  the page itself gave it. The region's box is used to reject the obvious
 *  misses first, so a lasso on a busy page walks its outline only for the marks
 *  that were in the running at all. */
export function strokesInRegion(
  drawing: Drawing,
  region: SelectionRegion,
): Stroke[] {
  const box = regionBox(region);
  if (!box) return [];
  const near = strokesInBox(drawing, box);
  if (isBoxRegion(region, box)) return near;
  return near.filter((stroke) => {
    const bounds = strokeBounds(stroke);
    return bounds ? regionMeetsBox(region, bounds) : false;
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
