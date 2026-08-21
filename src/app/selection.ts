// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What "a selection" means, as arithmetic.
//
// A selection is an **area of the page**, and nothing else. It picks no marks
// out — press inside one with the pencil and you paint, press inside it with
// the eraser and you rub out, and both are held to the outline. That is the
// whole idea: the selection is a *tool*, a window cut in the page that the next
// thing you do happens inside.
//
// It is not document state — nothing about where the window is belongs in a
// saved drawing, and nothing about it is undoable. What *is* document state is
// what you do through it, and there are three of those, all of them on the
// **layer you are drawing on** and none of them on any other:
//
//   - **paint** — a mark made while a selection is up records the outline it
//     was cut to (`Stroke.clip`) and paints inside it forever after;
//   - **move** — the hand drags what is painted inside the window somewhere
//     else, which cuts every mark the outline crosses in two: the half that
//     travelled and the half that stayed (`moveRegionContents`);
//   - **erase** — Delete, or a tap with the rubber, takes what is inside it off
//     (`eraseRegion`).
//
// **Nothing here rasterises anything.** A cut mark is still the whole stroke it
// always was, with a window recorded beside it, so moving a selection over a
// pencil line twice leaves a pencil line rather than a photograph of one — and
// one undo puts the single mark back. That is the same trade the rest of the
// document makes, and it is why a selection can be a hard boundary in a vector
// drawing at all.
//
// All of it is pure and switches on the shape kind, the same contract the
// renderer's fallback painter and `bounds.ts` use: a tool that invents no new
// shape kind needs no change here. Which is the point — the selection works on
// marks made by tools it has never heard of, including ones a later build adds.

import {
  padBox,
  strokeBounds,
  unionBox,
  type Box,
  type Measurable,
} from "./bounds.ts";
import { activeLayer, groupByLayer, isLocked } from "./layers.ts";
import type { Drawing, Mask, Point, Shape, Stroke } from "./types.ts";

/** As much of a mark as moving it needs: the geometry, and the window it was
 *  cut to. Widened from `Stroke` like `Measurable` is, so a mark that hasn't
 *  been filed yet — one on the clipboard, one being pasted — moves through the
 *  same function the page uses. */
export type Movable = { shape: Shape; clip?: Mask[] };

/** Whether `p` lies inside `box` — what decides that a press on the page has
 *  landed on the selection's own rectangle rather than beside it. */
export function inBox(box: Box, p: Point): boolean {
  return (
    p.x >= box.x &&
    p.x <= box.x + box.width &&
    p.y >= box.y &&
    p.y <= box.y + box.height
  );
}

/** What a selection gesture chose, as closed contours in document coordinates —
 *  the one currency the selection tools deal in, whatever gesture made them (see
 *  `plugins/builtin/select.ts`). A box marquee sends one rectangle, a lasso the
 *  loop it drew, the tracing tool one contour per outline of the area it found —
 *  including its holes, which the even-odd rule below leaves out of the
 *  selection the same way the bucket leaves them unpainted. */
export type SelectionRegion = readonly (readonly Point[])[];

/** The selection the screen holds: the area itself, and the rectangle around it
 *  that the corner handles hang off (see `SelectionFrame.tsx`). The box is
 *  derived rather than remembered, so the two can never disagree. */
export type Selection = {
  region: SelectionRegion;
  box: Box;
  /** How softly a Delete through this window fades out, in document pixels —
   *  the selection pencil's feather dial, stamped when the window was cut (see
   *  `useSelection.ts` for what a feathered delete files). Absent, and every
   *  window the marquees cut, means the hard edge deletes have always had.
   *  Screen state like the rest of the window: it travels with the window as
   *  it is slid and stretched, and it is nowhere in the document. */
  feather?: number;
};

/** The smallest box holding every contour, or `null` when there is nothing
 *  there. */
export function regionBox(region: SelectionRegion): Box | null {
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

/** The selection a gesture's contours make, or `null` for an outline that
 *  encloses nothing — which is what "select nothing" arrives as. `feather` is
 *  how softly a Delete through it fades out; absent (and 0, which is the dial
 *  at rest) records nothing, so a marquee's window is the object it always
 *  was. */
export function selectionOf(
  region: SelectionRegion | null | undefined,
  feather?: number,
): Selection | null {
  if (!region || region.length === 0) return null;
  const box = regionBox(region);
  if (!box || box.width <= 0 || box.height <= 0) return null;
  return { region, box, ...(feather && feather > 0 ? { feather } : {}) };
}

/** A rectangle as a window — the shape a box marquee cuts, and the one two
 *  other things ask for: ⌘/Ctrl+A, which is the whole sheet, and a paste, which
 *  leaves a window around what it landed so the next drag carries it. */
export function boxRegion(box: Box): SelectionRegion {
  return [
    [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ],
  ];
}

/** The window turned inside out: everything on the page the selection *isn't*.
 *
 *  Even-odd is what makes this one line of geometry rather than a clipping
 *  algorithm — the page's own rectangle with the selection's contours inside it
 *  reads as the page minus the selection, exactly as `maskOutside` cuts a
 *  mark's complement. A contour that runs past the page's edge comes out
 *  *kept* out there (even-odd is exclusive-or), which is the honest reading of
 *  "everything I didn't select": a mark hanging off the sheet was as unchosen
 *  as the rest. */
export function invertRegion(
  region: SelectionRegion,
  page: { width: number; height: number },
): SelectionRegion {
  return [
    ...boxRegion({ x: 0, y: 0, width: page.width, height: page.height }),
    ...region.map((loop) => loop.map((p) => ({ ...p }))),
  ];
}

/** The same window, somewhere else on the page. */
export function moveRegion(
  region: SelectionRegion,
  dx: number,
  dy: number,
): SelectionRegion {
  if (dx === 0 && dy === 0) return region;
  return region.map((loop) => loop.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

/** The same window, stretched from the box it filled into the one a handle has
 *  dragged it into.
 *
 *  Every contour is carried along proportionally, which is what lets a lasso and
 *  a traced outline be adjusted by their corners at all: the *shape* you drew is
 *  kept and only its frame changes. A box marquee — four corners on the frame —
 *  comes out as the rectangle you dragged, which is exactly what it looks like
 *  it should do. A frame with no width or height to scale from is left alone
 *  rather than collapsed. */
export function scaleRegion(
  region: SelectionRegion,
  from: Box,
  to: Box,
): SelectionRegion {
  if (from.width <= 0 || from.height <= 0) return region;
  const kx = to.width / from.width;
  const ky = to.height / from.height;
  return region.map((loop) =>
    loop.map((p) => ({
      x: to.x + (p.x - from.x) * kx,
      y: to.y + (p.y - from.y) * ky,
    })),
  );
}

/** Whether `p` is inside the region, by the even-odd rule — the same rule the
 *  bucket's fill is painted with, so a traced area's holes are outside its
 *  selection exactly as they are outside its paint.
 *
 *  This is the test a press is judged by: inside means the gesture is about the
 *  selection (the hand carries its contents, the marquee tool slides the window
 *  itself), outside means it is about the page. */
export function regionHolds(region: SelectionRegion, p: Point): boolean {
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

/** Whether any of the region's own outline runs through `box`. */
function outlineCrosses(region: SelectionRegion, box: Box): boolean {
  for (const loop of region) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      if (segmentMeetsBox(a, b, box)) return true;
    }
  }
  return false;
}

/** Whether a mark's box and the selection meet at all — the first question
 *  asked of every mark on the layer, and the one that lets a selection on a busy
 *  page cost the marks near it rather than all of them.
 *
 *  Two ways they can, and both are needed: the outline crosses (or runs inside)
 *  the box, or the box sits wholly inside the outline with nothing crossing it.
 *  Measured against the mark's *box* rather than its geometry, deliberately: a
 *  mark whose box the window catches but whose ink it misses is cut to a window
 *  it paints nothing through, which costs a few bytes and changes no pixel. */
export function regionMeets(region: SelectionRegion, box: Box): boolean {
  if (outlineCrosses(region, box)) return true;
  return regionHolds(region, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
}

/** Whether the selection holds the *whole* of `box`: its outline runs nowhere
 *  through it and its middle is inside. Such a mark needs no window at all — it
 *  is entirely within the selection already, so moving it moves the whole mark
 *  and erasing takes the whole mark away. */
export function regionCovers(region: SelectionRegion, box: Box): boolean {
  if (outlineCrosses(region, box)) return false;
  return regionHolds(region, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
}

/** The selection as a window a mark can be cut to (see `Mask`). */
export function maskOf(region: SelectionRegion): Mask {
  return { contours: region.map((loop) => loop.map((p) => ({ ...p }))) };
}

/** …and its opposite: everywhere the selection *isn't*, out to a rectangle big
 *  enough to hold `around` and the selection both.
 *
 *  Even-odd is what makes this work with no geometry of its own: an outer
 *  rectangle with the selection's contours inside it is the rectangle minus the
 *  selection, exactly as a loop inside a loop is a hole. The rectangle has to
 *  cover the mark it is cutting — a mark reaching past it would be cut off at a
 *  boundary nobody drew — so it is the mark and the window together, with a
 *  pixel of slack. */
export function maskOutside(region: SelectionRegion, around: Box): Mask {
  const box = regionBox(region);
  const outer = padBox(box ? unionBox(around, box) : around, 1);
  return {
    contours: [
      [
        { x: outer.x, y: outer.y },
        { x: outer.x + outer.width, y: outer.y },
        { x: outer.x + outer.width, y: outer.y + outer.height },
        { x: outer.x, y: outer.y + outer.height },
      ],
      ...region.map((loop) => loop.map((p) => ({ ...p }))),
    ],
  };
}

/** One mark, held inside one more window. The windows stack rather than
 *  replace: a mark drawn inside a selection and later cut by another is cut by
 *  both (see `Stroke.clip`). */
export function cutTo<T extends { clip?: Mask[] }>(stroke: T, mask: Mask): T {
  return { ...stroke, clip: [...(stroke.clip ?? []), mask] };
}

/** The marks a selection has anything to say about, and what it says about each
 *  of them — the one walk every selection edit is built out of.
 *
 *  Only the **layer being drawn on** is walked. That is the rule for all three
 *  edits and it is what makes a selection safe: what is under the window on
 *  another sheet is not what you are working on, and a window that quietly took
 *  the layer below with it would be a window you could not trust. A locked
 *  layer yields nothing at all, for the same reason it takes no marks. */
export type RegionSplit = {
  /** What the selection holds, each mark cut to it: what a drag carries, and
   *  what a copy takes. */
  inside: Stroke[];
  /** What is left of the marks it only partly holds, each cut to everywhere
   *  else. A mark the selection swallows whole leaves nothing behind. */
  outside: Stroke[];
  /** Every mark the selection touched at all, by id — what a live drag hides
   *  from the page underneath while it shows the two halves itself. */
  ids: Set<string>;
};

/** Split the active layer's marks against the selection. */
export function splitRegion(
  drawing: Drawing,
  region: SelectionRegion,
): RegionSplit {
  const split: RegionSplit = { inside: [], outside: [], ids: new Set() };
  for (const { stroke, bounds, whole } of regionMarks(drawing, region)) {
    split.ids.add(stroke.id);
    if (whole) {
      split.inside.push(stroke);
      continue;
    }
    split.inside.push(cutTo(stroke, maskOf(region)));
    split.outside.push(cutTo(stroke, maskOutside(region, bounds)));
  }
  return split;
}

/** Each mark of the layer being drawn on that the selection reaches, with the
 *  box it was measured by and whether the selection holds all of it. */
function regionMarks(
  drawing: Drawing,
  region: SelectionRegion,
): { stroke: Stroke; bounds: Box; whole: boolean }[] {
  const layer = activeLayer(drawing);
  if (isLocked(layer)) return [];
  const own = groupByLayer(drawing).get(layer.id) ?? [];
  const found: { stroke: Stroke; bounds: Box; whole: boolean }[] = [];
  for (const stroke of own) {
    const bounds = strokeBounds(stroke);
    if (!bounds || !regionMeets(region, bounds)) continue;
    found.push({ stroke, bounds, whole: regionCovers(region, bounds) });
  }
  return found;
}

/** The drawing's marks with what is inside the selection moved by (`dx`, `dy`),
 *  or `null` when the selection holds nothing to move.
 *
 *  A mark the window swallows whole simply travels — same mark, same id, one
 *  undo step. A mark it only crosses is **cut in two**: the half inside is a new
 *  mark held to the window at its new place, and what is left of the original is
 *  held to everywhere the window wasn't. Paint order is kept either way: both
 *  halves take the place the one mark had, with the travelling half over the one
 *  that stayed, so a move can never lift ink over a mark that was drawn after
 *  it. */
export function moveRegionContents(
  drawing: Drawing,
  region: SelectionRegion,
  dx: number,
  dy: number,
  mintId: () => string,
): Stroke[] | null {
  if (dx === 0 && dy === 0) return null;
  const marks = new Map(
    regionMarks(drawing, region).map((found) => [found.stroke.id, found]),
  );
  if (marks.size === 0) return null;
  const strokes: Stroke[] = [];
  for (const stroke of drawing.strokes) {
    const found = marks.get(stroke.id);
    if (!found) {
      strokes.push(stroke);
      continue;
    }
    if (found.whole) {
      strokes.push(translateStroke(stroke, dx, dy));
      continue;
    }
    strokes.push(cutTo(stroke, maskOutside(region, found.bounds)));
    strokes.push({
      ...translateStroke(cutTo(stroke, maskOf(region)), dx, dy),
      id: mintId(),
    });
  }
  return strokes;
}

/** The drawing's marks with what is inside the selection taken off, or `null`
 *  when there was nothing inside it.
 *
 *  A mark the window swallows whole goes; one it crosses is kept, held to
 *  everywhere the window wasn't. Nothing is composited away and no hole is
 *  punched through the layers below — this is a real edit to the marks on one
 *  sheet, and one undo step brings every one of them back whole. */
export function eraseRegion(
  drawing: Drawing,
  region: SelectionRegion,
): Stroke[] | null {
  const marks = new Map(
    regionMarks(drawing, region).map((found) => [found.stroke.id, found]),
  );
  if (marks.size === 0) return null;
  const strokes: Stroke[] = [];
  for (const stroke of drawing.strokes) {
    const found = marks.get(stroke.id);
    if (!found) {
      strokes.push(stroke);
      continue;
    }
    if (found.whole) continue;
    strokes.push(cutTo(stroke, maskOutside(region, found.bounds)));
  }
  return strokes;
}

/** Shift every point in a shape by (`dx`, `dy`), the window it was cut to
 *  included.
 *
 *  Switching on the kind rather than on the tool, for the same reason
 *  `strokeBounds` does: moving a mark is a question about geometry, and the
 *  plugin that drew it has no say in the answer. A stroke whose shape this build
 *  doesn't recognise comes back unmoved rather than mangled. */
export function translateStroke<T extends Movable>(
  stroke: T,
  dx: number,
  dy: number,
): T {
  const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  // The window travels with the mark: it is geometry on the page like the ink
  // is, and a mark that slid out from under its own cut would paint a shape
  // nobody drew.
  const clipped = stroke.clip
    ? {
        clip: stroke.clip.map((mask) => ({
          contours: mask.contours.map((loop) => loop.map(move)),
        })),
      }
    : {};
  const shape = stroke.shape;
  switch (shape.kind) {
    case "path":
      return {
        ...stroke,
        ...clipped,
        shape: { ...shape, points: shape.points.map(move) },
      };
    case "segment":
    case "box":
    case "image":
      return {
        ...stroke,
        ...clipped,
        shape: { ...shape, from: move(shape.from), to: move(shape.to) },
      };
    case "region":
      return {
        ...stroke,
        ...clipped,
        shape: {
          ...shape,
          contours: shape.contours.map((c) => c.map(move)),
          // A ramp is laid along a line on the page (see `Gradient`), so it
          // travels with the area it fills — moving the outlines and leaving
          // the ramp where it was would slide the colours across the mark.
          ...(shape.gradient
            ? {
                gradient: {
                  ...shape.gradient,
                  from: move(shape.gradient.from),
                  to: move(shape.gradient.to),
                },
              }
            : {}),
        },
      };
    case "text":
      return { ...stroke, ...clipped, shape: { ...shape, at: move(shape.at) } };
  }
}

/** …and the same over a run of them. */
export function translateStrokes<T extends Movable>(
  strokes: readonly T[],
  dx: number,
  dy: number,
): T[] {
  return strokes.map((stroke) => translateStroke(stroke, dx, dy));
}

/** The page a run of marks covers, or `null` when there are none. */
export function selectionBox(strokes: readonly Measurable[]): Box | null {
  let box: Box | null = null;
  for (const stroke of strokes) {
    const next = strokeBounds(stroke);
    if (!next) continue;
    box = box ? unionBox(box, next) : next;
  }
  return box;
}

/** The offset that would put a run of marks' top-left corner at `at`. What the
 *  menu's paste uses so the marks land where the menu was opened, rather than a
 *  fixed nudge from wherever they were copied. */
export function offsetTo(strokes: readonly Measurable[], at: Point): Point {
  const box = selectionBox(strokes);
  if (!box) return { x: 0, y: 0 };
  return { x: at.x - box.x, y: at.y - box.y };
}
