// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Grips on the outline itself, and what dragging one does to it.
//
// A box marquee has four corners and a box has four corners, so hanging the
// grips off the frame was free and honest — for a box. For a lasso, a trace or
// a painted window it is neither: the grips float in space beside the shape,
// nothing you can grab is anywhere near the line you drew, and the only edit
// they offer is *stretch the whole thing* (see `scaleRegion`). The line that is
// half a centimetre too far left cannot be nudged half a centimetre left. You
// redraw it.
//
// So a window that is not a rectangle gets its grips **on its own outline** —
// at every sharp corner, and at an even spacing along everything between them —
// and dragging one bends the outline around it instead of scaling the lot.
//
// The bend is the tone curve's, deliberately (see `CurveEditor.tsx`): the grip
// goes where the finger is, its neighbours follow by less and less, and by a
// fixed distance along the line nothing has moved at all. That is what makes it
// feel like adjusting a shape rather than dragging a point — a hand that pulls
// one grip out gets a lobe, not a spike — and it is why the falloff is a raised
// cosine, which arrives at both ends flat and so leaves no crease where its
// influence runs out.
//
// The reach is one grip spacing exactly. Neighbouring grips therefore sit
// precisely where the influence dies, so a shape adjusted grip by grip stays
// where you put each one instead of undoing the last pull with the next.
//
// **Every point survives a bend.** The contours come out with the same points
// in the same order, moved — no resampling, no smoothing pass — so a grip's
// (loop, index) address stays good for the whole drag, and a traced outline is
// still the outline that was traced.
//
// Pure and DOM-free; the screen that draws them is `SelectionOutlineGrips.tsx`.

import type { SelectionRegion } from "./selection.ts";
import type { Point } from "./types.ts";

/** One grip: where on the window it is, and where that is on the page. */
export type SelectionHandle = {
  /** The contour it belongs to — its index in the region. */
  loop: number;
  /** The point of that contour it sits on. Stable across a bend, which is what
   *  a drag holds on to. */
  index: number;
  /** Where that point is now, in document pixels. */
  at: Point;
  /** Whether it is there because the outline turns sharply there, rather than
   *  because the spacing put it there. Corners are placed first and never
   *  dropped: they are the shape's own landmarks, and a grip that is not on one
   *  is a grip you have to aim at. */
  corner: boolean;
};

/** How sharply the outline has to turn, in radians, before the turn counts as a
 *  corner. About 35° — tight enough that a hand-drawn curve does not come out
 *  studded with grips, loose enough to catch the corners of a traced letter. */
const CORNER_TURN = 0.61;

/** How much of the outline a corner is measured over, as a share of the grip
 *  spacing. A traced contour is a staircase of one-pixel steps, and a turn
 *  measured between two of those is 90° everywhere; measured over a stretch it
 *  is the shape's turn rather than the tracing's. */
const CORNER_LOOK = 1 / 5;

/** How close two grips may come, as a share of the spacing. Corners win — a
 *  spacing grip that lands on top of one is simply not placed. */
const CROWDING = 0.6;

/** The most grips one contour may carry, and the most the whole window may.
 *  A traced outline can be four thousand points long and a colour select can
 *  come back in dozens of pieces; past these the grips stop being controls and
 *  start being a texture over the picture. Corners are kept in preference to
 *  spacing grips when the cap bites. */
const MAX_PER_LOOP = 28;
const MAX_HANDLES = 64;

/** How short a contour may be and still get grips of its own, as a share of the
 *  spacing. A three-pixel speck picked up by a colour select is not a thing
 *  anybody adjusts by hand. */
const MIN_LOOP = 1.5;

/** Whether the window is an upright rectangle — the one shape whose corners
 *  really are its corners, and so the one that keeps the frame grips it has
 *  always had. */
export function isRectangular(region: SelectionRegion): boolean {
  if (region.length !== 1) return false;
  const loop = closed(region[0]!);
  if (loop.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % 4]!;
    const flat = Math.abs(a.y - b.y) < 1e-6;
    const upright = Math.abs(a.x - b.x) < 1e-6;
    // Exactly one of the two: a segment that is both is a repeated point, and
    // a segment that is neither is a slope.
    if (flat === upright) return false;
  }
  return true;
}

/** The contour without the repeated closing point some callers carry. */
function closed(loop: readonly Point[]): readonly Point[] {
  if (loop.length < 2) return loop;
  const first = loop[0]!;
  const last = loop[loop.length - 1]!;
  const same =
    Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
  return same ? loop.slice(0, -1) : loop;
}

/** Where the grips go on a window, at a spacing measured in document pixels.
 *
 *  The spacing is the screen's to decide and is passed in for a reason: grips a
 *  fixed distance apart *on the page* would crowd into a smear when the picture
 *  is zoomed out and scatter to the corners when it is zoomed in. The screen
 *  passes a distance that is constant on the glass, so the outline always wears
 *  about as many grips as a hand can use (see `SelectionOutlineGrips.tsx`). */
export function selectionHandles(
  region: SelectionRegion,
  spacing: number,
): SelectionHandle[] {
  if (!(spacing > 0)) return [];
  const found: SelectionHandle[] = [];
  region.forEach((raw, loop) => {
    const points = closed(raw);
    if (points.length < 3) return;
    const walk = arcLengths(points);
    if (walk.total < spacing * MIN_LOOP) return;
    for (const index of placements(points, walk, spacing)) {
      found.push({
        loop,
        index: index.index,
        at: points[index.index]!,
        corner: index.corner,
      });
    }
  });
  if (found.length <= MAX_HANDLES) return found;
  // Over the cap: keep every corner, then as many spacing grips as there is
  // room for. Losing a corner would move a landmark; losing a mid-edge grip
  // only makes the edge coarser.
  const corners = found.filter((handle) => handle.corner);
  const rest = found.filter((handle) => !handle.corner);
  return [...corners, ...rest].slice(0, MAX_HANDLES);
}

/** Which points of one contour get a grip: its corners first, then the spacing
 *  laid over what is left. */
function placements(
  points: readonly Point[],
  walk: Walk,
  spacing: number,
): { index: number; corner: boolean }[] {
  const chosen: { index: number; corner: boolean }[] = [];
  const taken = (at: number) =>
    chosen.some(
      (grip) => gap(walk, walk.at[grip.index]!, at) < spacing * CROWDING,
    );
  for (const index of corners(points, walk, spacing)) {
    if (taken(walk.at[index]!)) continue;
    chosen.push({ index, corner: true });
    if (chosen.length >= MAX_PER_LOOP) return chosen;
  }
  const steps = Math.max(2, Math.round(walk.total / spacing));
  for (let step = 0; step < steps; step++) {
    const along = (walk.total * step) / steps;
    const index = nearestPoint(walk, along);
    if (index === null || taken(walk.at[index]!)) continue;
    chosen.push({ index, corner: false });
    if (chosen.length >= MAX_PER_LOOP) break;
  }
  return chosen.sort((a, b) => a.index - b.index);
}

/** The points where the outline turns sharply, sharpest first — so that when
 *  two corners crowd each other it is the blunter one that goes. */
function corners(
  points: readonly Point[],
  walk: Walk,
  spacing: number,
): number[] {
  const look = Math.max(spacing * CORNER_LOOK, 1e-6);
  const turns: { index: number; turn: number }[] = [];
  for (let index = 0; index < points.length; index++) {
    const here = points[index]!;
    const before = along(points, walk, walk.at[index]! - look);
    const after = along(points, walk, walk.at[index]! + look);
    const turn = angleBetween(
      { x: here.x - before.x, y: here.y - before.y },
      { x: after.x - here.x, y: after.y - here.y },
    );
    if (turn >= CORNER_TURN) turns.push({ index, turn });
  }
  return turns.sort((a, b) => b.turn - a.turn).map((found) => found.index);
}

/** The turn from one direction to the next, in radians, or 0 when either is
 *  too short to have a direction. */
function angleBetween(a: Point, b: Point): number {
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cos = (a.x * b.x + a.y * b.y) / (la * lb);
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

/** A contour measured along itself: how far each of its points is from the
 *  first, and how long the whole closed loop is. */
type Walk = { at: number[]; total: number };

function arcLengths(points: readonly Point[]): Walk {
  const at: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );
    at.push(total);
  }
  const last = points[points.length - 1]!;
  total += Math.hypot(last.x - points[0]!.x, last.y - points[0]!.y);
  return { at, total };
}

/** How far apart two places on a closed contour are, the short way round.
 *  Closed is the whole point: the first point of a lasso is not an end, and a
 *  bend that stopped dead there would put a crease in the loop where the hand
 *  happened to start. */
function gap(walk: Walk, a: number, b: number): number {
  const raw = Math.abs(a - b) % walk.total;
  return Math.min(raw, walk.total - raw);
}

/** The point of the contour nearest a distance along it. */
function nearestPoint(walk: Walk, along: number): number | null {
  let best: number | null = null;
  let bestGap = Infinity;
  for (let index = 0; index < walk.at.length; index++) {
    const found = gap(walk, walk.at[index]!, along);
    if (found >= bestGap) continue;
    bestGap = found;
    best = index;
  }
  return best;
}

/** Where the contour is at a distance along it, between its points — what a
 *  turn is measured from. Wraps, like everything else here.
 *
 *  Binary search rather than a walk, because every point of the contour asks
 *  this twice: a traced outline is four thousand points long, and the linear
 *  version turns corner-finding into a second of arithmetic on the settle. */
function along(points: readonly Point[], walk: Walk, distance: number): Point {
  let want = distance % walk.total;
  if (want < 0) want += walk.total;
  let lo = 0;
  let hi = walk.at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (walk.at[mid]! <= want) lo = mid;
    else hi = mid - 1;
  }
  const from = walk.at[lo]!;
  const to = lo + 1 < walk.at.length ? walk.at[lo + 1]! : walk.total;
  const span = to - from;
  const a = points[lo]!;
  const b = points[(lo + 1) % points.length]!;
  if (span <= 0) return a;
  const k = Math.min(1, (want - from) / span);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** The window with one grip dragged to `to` and the outline bent to follow.
 *
 *  `reach` is how far along the outline the pull is felt, in document pixels —
 *  the grip spacing, so the neighbouring grips sit exactly where it dies. Every
 *  other contour comes back untouched, which is what keeps a traced shape's
 *  holes where they were while its border is adjusted. */
export function reshapeRegion(
  region: SelectionRegion,
  handle: { loop: number; index: number },
  to: Point,
  reach: number,
): SelectionRegion {
  const raw = region[handle.loop];
  if (!raw) return region;
  const points = closed(raw);
  const held = points[handle.index];
  if (!held || !(reach > 0)) return region;
  const walk = arcLengths(points);
  const dx = to.x - held.x;
  const dy = to.y - held.y;
  if (dx === 0 && dy === 0) return region;
  const anchor = walk.at[handle.index]!;
  const bent = points.map((p, index) => {
    const pull = falloff(gap(walk, walk.at[index]!, anchor) / reach);
    if (pull === 0) return p;
    return { x: p.x + dx * pull, y: p.y + dy * pull };
  });
  return region.map((loop, index) => (index === handle.loop ? bent : loop));
}

/** How much of the pull is felt at `t` grip-spacings away: all of it at the
 *  grip, none of it at one spacing, and a raised cosine in between — flat at
 *  both ends, so the bend has no crease at its middle and no kink where it
 *  stops. */
function falloff(t: number): number {
  if (t >= 1) return 0;
  if (t <= 0) return 1;
  return (1 + Math.cos(Math.PI * t)) / 2;
}
