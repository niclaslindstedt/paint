// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The middle of a shape you only went round — found on the way out of the
// gesture, rather than waited for.
//
// Draw a circle with the selection pencil and what you get is a *ring*: the
// stripe the nib painted is chosen and the disc it encloses is not, because
// nothing painted it. The same is true of a trace round a subject and of a
// lasso doubled back on itself. Every one of them is the shape you meant with
// the middle missing, and every one of them is one press of **Gap select** away
// from being right (see `regionMask.fillGap`) — which is one press you have to
// know exists.
//
// So the app asks. When a gesture settles and the window it left has a pocket
// in it big enough to be the point of the gesture, a small card offers to fill
// it in (`GapOffer.tsx`). Say yes and the pocket joins the window; say nothing
// and it goes away the moment you do anything else. It is an offer rather than
// a rule because "round the outside" is a real answer too — a frame, a halo, a
// rubbed-out ring — and an app that quietly filled those in would be an app
// fighting the hand.
//
// **The filling is free.** A selection is contours read by the even-odd rule
// (see `selection.ts`), so a pocket is a contour nested inside another one, and
// filling it in is *dropping that contour* — not re-rasterising the window the
// way the gap tool's flood does. The outline you drew comes through the offer
// unmoved, to the last decimal, which is what lets the card be pressed twice on
// a shape with two pockets without the border creeping.
//
// Pure and DOM-free: contours in, pockets out.

import type { SelectionRegion } from "./selection.ts";
import type { Point } from "./types.ts";

/** A pocket the window went round: which contour bounds it, a point inside it,
 *  and how much page it is worth. */
export type SelectionGap = {
  /** The contour that encloses it — its index in the region. */
  loop: number;
  /** A point that really lies inside it, in document pixels. Where a fill
   *  aimed at this pocket would be seeded, and where the card that offers to
   *  fill it floats. */
  at: Point;
  /** Its area in square document pixels. */
  area: number;
};

/** How small a pocket may be and still be offered, in square document pixels —
 *  a sixteenth of the page's smallest sensible mark. Below this it is a gap
 *  between two strokes of the same outline rather than the middle of a shape,
 *  and offering to fill it would be noise. */
const MIN_GAP = 256;

/** How much of the outline's own area the pockets have to be worth before the
 *  offer is made at all.
 *
 *  This is the whole difference between "you went round something" and "what
 *  you chose happens to have holes in it". A ring painted with the selection
 *  pencil is mostly pocket — the stripe is a fraction of the disc — and asking
 *  is obviously right. A traced face with two eyes in it is a hundredth pocket,
 *  and asking there is an app interrupting to point out something you can see. */
const OFFER_SHARE = 1 / 3;

/** How many contours a window may be made of before pockets stop being looked
 *  for. A colour select over a photograph comes back in hundreds of pieces, and
 *  none of them is a shape anybody *went round*: the question is meaningless
 *  there, and the nesting walk below is the one part of a settle that would
 *  rather not be asked it. */
const MAX_LOOPS = 64;

/** Every pocket the window encloses, biggest first.
 *
 *  A pocket is a contour at **odd nesting depth** — inside an odd number of the
 *  others — which is exactly what the even-odd rule leaves unchosen. That makes
 *  a ring's inside a pocket, an island inside that ring's inside *not* one, and
 *  the arithmetic the same one the renderer and the hit test already use. */
export function selectionGaps(region: SelectionRegion): SelectionGap[] {
  const shape = analyse(region);
  if (!shape) return [];
  const gaps: SelectionGap[] = [];
  shape.loops.forEach((loop, index) => {
    if (loop.depth % 2 === 0 || !loop.inside) return;
    gaps.push({ loop: index, at: loop.inside, area: loop.area });
  });
  return gaps.sort((a, b) => b.area - a.area);
}

/** …and the ones worth stopping the hand for. Empty means say nothing, which
 *  is what almost every gesture gets. */
export function gapsWorthOffering(region: SelectionRegion): SelectionGap[] {
  const shape = analyse(region);
  if (!shape) return [];
  // What the outline is around, pockets and all: the area of the contours that
  // are not themselves inside anything. The pockets are measured against this
  // rather than against what was chosen, so a fat outline and a fine one round
  // the same circle read the same.
  let outer = 0;
  for (const loop of shape.loops) if (loop.depth === 0) outer += loop.area;
  if (outer <= 0) return [];
  const gaps = selectionGaps(region).filter((gap) => gap.area >= MIN_GAP);
  const held = gaps.reduce((sum, gap) => sum + gap.area, 0);
  return held >= outer * OFFER_SHARE ? gaps : [];
}

/** The same window with those pockets filled in.
 *
 *  Dropping the pocket's own contour is what fills it — and everything nested
 *  *inside* the pocket goes with it, because an island that stayed behind would
 *  flip from a chosen island to a hole the moment the water round it came in.
 *  "Fill the middle" means the middle, all of it. */
export function fillSelectionGaps(
  region: SelectionRegion,
  gaps: readonly SelectionGap[],
): SelectionRegion {
  if (gaps.length === 0) return region;
  const shape = analyse(region);
  if (!shape) return region;
  const dropped = new Set<number>();
  for (const gap of gaps) {
    const pocket = shape.loops[gap.loop];
    if (!pocket) continue;
    dropped.add(gap.loop);
    shape.loops.forEach((loop, index) => {
      if (index === gap.loop || !loop.rim) return;
      if (holds(pocket, loop.rim)) dropped.add(index);
    });
  }
  const kept = region.filter((_, index) => !dropped.has(index));
  return kept.length > 0 ? kept : region;
}

/** One contour, measured: its box, its area, a point genuinely inside it, the
 *  point its nesting is judged by, and how many of the others it sits within. */
type Loop = {
  points: readonly Point[];
  box: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
  inside: Point | null;
  /** A point **on the contour's own rim**, a hair inside it — what "is this
   *  contour within that one?" is asked of.
   *
   *  It has to be the rim rather than the roomy middle found above, and the
   *  difference is the whole nesting walk: an outer contour's middle is inside
   *  its own hole's outline as well as its own, so asking there would have
   *  every ring report itself as its own pocket. A point on the rim is inside
   *  exactly the contours that enclose *this* one, which is what nesting
   *  means. The hair inward is for a contour that shares an edge with its
   *  neighbour, where a vertex itself would be a coin toss. */
  rim: Point | null;
  depth: number;
};

/** How far inside its own rim a contour is probed, as a share of the way to its
 *  interior point. Small enough to still be at the rim, big enough to be off
 *  it. */
const RIM_NUDGE = 1e-4;

/** The whole window measured that way, or `null` when there is nothing here
 *  worth asking about. */
function analyse(region: SelectionRegion): { loops: Loop[] } | null {
  if (region.length < 2 || region.length > MAX_LOOPS) return null;
  const loops: Loop[] = region.map((points) => {
    const inside = interiorPoint(points);
    return {
      points,
      box: boxOf(points),
      area: areaOf(points),
      inside,
      rim: rimPoint(points, inside),
      depth: 0,
    };
  });
  for (const loop of loops) {
    const rim = loop.rim;
    if (!rim) continue;
    for (const other of loops) {
      if (other === loop || !inBox(other.box, rim)) continue;
      if (holds(other, rim)) loop.depth++;
    }
  }
  return { loops };
}

/** A point on a contour's rim, a hair inside it — its first vertex, nudged
 *  towards the interior point so a shared edge cannot make the answer a coin
 *  toss. `null` for a contour that encloses nothing to nudge towards. */
function rimPoint(
  points: readonly Point[],
  inside: Point | null,
): Point | null {
  const first = points[0];
  if (!first) return null;
  if (!inside) return first;
  return {
    x: first.x + (inside.x - first.x) * RIM_NUDGE,
    y: first.y + (inside.y - first.y) * RIM_NUDGE,
  };
}

function boxOf(points: readonly Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function inBox(box: Loop["box"], p: Point): boolean {
  return (
    p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY
  );
}

/** The area a closed contour encloses, unsigned — the shoelace sum. Winding
 *  direction is nothing to us: what a contour is *for* here is decided by how
 *  deeply it is nested, not by which way round it was traced. */
function areaOf(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    sum += (b.x + a.x) * (b.y - a.y);
  }
  return Math.abs(sum) / 2;
}

/** Whether one contour holds a point, by the even-odd rule — `regionHolds`
 *  asked of a single loop, which is the question nesting is made of. */
function holds(loop: Loop, p: Point): boolean {
  const points = loop.points;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** How many rows are tried when looking for a point inside a contour. A
 *  crescent has no interior point at its own centre, so the middle of the box
 *  is a guess rather than an answer — these are the other guesses. */
const PROBE_ROWS = 9;

/** A point that really lies inside a contour, or `null` for one that encloses
 *  nothing.
 *
 *  The centroid is no good — a horseshoe's is outside it — so this crosses the
 *  contour with a handful of horizontal lines and takes the middle of the
 *  widest span that came out inside. That point is what a fill would be seeded
 *  at and where the card floats, so "widest" is doing real work: it is the
 *  roomiest part of the pocket, which is where a card is least in the way. */
function interiorPoint(points: readonly Point[]): Point | null {
  if (points.length < 3) return null;
  const box = boxOf(points);
  if (!(box.maxY > box.minY) || !(box.maxX > box.minX)) return null;
  let best: { at: Point; width: number } | null = null;
  for (let row = 1; row <= PROBE_ROWS; row++) {
    const y = box.minY + ((box.maxY - box.minY) * row) / (PROBE_ROWS + 1);
    const crossings: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!;
      const b = points[j]!;
      if (a.y > y === b.y > y) continue;
      crossings.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
    crossings.sort((l, r) => l - r);
    // Even-odd again: the spans between the first and second crossing, the
    // third and fourth, and so on are the ones inside.
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const width = crossings[i + 1]! - crossings[i]!;
      if (best && width <= best.width) continue;
      best = { at: { x: (crossings[i]! + crossings[i + 1]!) / 2, y }, width };
    }
  }
  return best && best.width > 0 ? best.at : null;
}
