// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Region arithmetic, done the honest way: on a bitmap, briefly.
//
// A selection is closed contours read with the even-odd rule (see
// `selection.ts`), and two sets of contours cannot be unioned or subtracted by
// concatenating them — where they overlap, even-odd flips and the overlap
// becomes a hole. Proper polygon clipping is a project of its own, so this
// module does what the paint bucket does instead (see `flood.ts`): rasterise
// the question, answer it a cell at a time, and trace the answer back into
// contours. The pixels live for one gesture and are thrown away; what comes out
// is ordinary vector geometry that zooms, undoes and syncs like everything
// else.
//
// The one caller today is the selection pencil (`select.ts`), which paints
// selection the way a pencil paints ink: each stroke is stamped into a mask the
// current selection was first filled into, adding or taking away, and the
// mask's outline is the new selection. The pieces are exported separately —
// fill a region in, stamp a path, trace the result — because they are the same
// pieces any later raster-to-region job needs.
//
// Everything here is pure and DOM-free, like `flood.ts` under it: buffers in,
// points out, the whole pipeline testable in node.

import { simplifyContour, traceContours, type BinaryMask } from "./flood.ts";
import type { Point } from "./types.ts";

/** How the mask's cells map onto the page: the document point cell (0,0)
 *  starts at, and cells per document pixel (≤ 1 — the mask is never finer than
 *  the page). */
export type MaskFrame = {
  x: number;
  y: number;
  scale: number;
};

/** The most cells a gesture's mask may cost. A whole-page selection on the
 *  default sheet is 6.4M document pixels; capped here it is traced at about
 *  half resolution instead, which is the same trade the bucket's snapshot makes
 *  on a big page — an outline nobody can tell apart, at a price every gesture
 *  can afford. */
const MAX_CELLS = 1_500_000;

/** The most points a traced selection may keep, and where its simplification
 *  starts — the bucket's own numbers, for the bucket's reason: an outline that
 *  bloats every save is worse than one a tenth of a pixel off. */
const MAX_POINTS = 4000;
const BASE_EPSILON = 1;

/** An empty mask sized to hold `box` (document coordinates) with `pad`
 *  document pixels of slack all round, at a scale the cell budget allows.
 *  `null` for a box with nothing in it. */
export function maskFor(
  box: { x: number; y: number; width: number; height: number },
  pad: number,
): { mask: BinaryMask; frame: MaskFrame } | null {
  const w = box.width + pad * 2;
  const h = box.height + pad * 2;
  if (w <= 0 || h <= 0) return null;
  const scale = Math.min(1, Math.sqrt(MAX_CELLS / (w * h)));
  const width = Math.max(1, Math.ceil(w * scale) + 1);
  const height = Math.max(1, Math.ceil(h * scale) + 1);
  return {
    mask: { width, height, data: new Uint8Array(width * height) },
    frame: { x: box.x - pad, y: box.y - pad, scale },
  };
}

/** Fill `region`'s area into the mask — the even-odd read of its contours, so
 *  a hole in the selection stays a hole in the mask. Scanline over the cell
 *  centres, which is the raster's own definition of "inside". */
export function fillRegion(
  mask: BinaryMask,
  frame: MaskFrame,
  region: readonly (readonly Point[])[],
): void {
  // The contours in mask space, closed edge lists with their row ranges, so a
  // row only prices the edges that can cross it.
  type Edge = { x0: number; y0: number; x1: number; y1: number };
  const edges: Edge[] = [];
  for (const loop of region) {
    if (loop.length < 3) continue;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      edges.push({
        x0: (a.x - frame.x) * frame.scale,
        y0: (a.y - frame.y) * frame.scale,
        x1: (b.x - frame.x) * frame.scale,
        y1: (b.y - frame.y) * frame.scale,
      });
    }
  }
  if (edges.length === 0) return;
  const cuts: number[] = [];
  for (let y = 0; y < mask.height; y++) {
    const cy = y + 0.5;
    cuts.length = 0;
    for (const e of edges) {
      // Half-open in y, so an edge is counted once at the vertex two edges
      // share — the same rule `regionHolds` reads a point with.
      if (e.y0 > cy === e.y1 > cy) continue;
      cuts.push(e.x0 + ((cy - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0));
    }
    if (cuts.length < 2) continue;
    cuts.sort((a, b) => a - b);
    const row = y * mask.width;
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const from = Math.max(0, Math.ceil(cuts[i]! - 0.5));
      const to = Math.min(mask.width - 1, Math.floor(cuts[i + 1]! - 0.5));
      for (let x = from; x <= to; x++) mask.data[row + x] = 1;
    }
  }
}

/** Stamp a stroked path into the mask — the capsule a round nib of `radius`
 *  document pixels leaves along `points` — writing `value` (1 paints selection
 *  in, 0 takes it away). A single point is a dab: the disc alone. */
export function stampPath(
  mask: BinaryMask,
  frame: MaskFrame,
  points: readonly Point[],
  radius: number,
  value: 0 | 1,
): void {
  if (points.length === 0) return;
  // Never thinner than a cell, so a fine nib at a coarse scale still marks the
  // cells it crossed rather than falling between them.
  const r = Math.max(radius * frame.scale, 0.75);
  const stamp = (px: number, py: number): void => {
    const top = Math.max(0, Math.ceil(py - r - 0.5));
    const bottom = Math.min(mask.height - 1, Math.floor(py + r - 0.5));
    for (let y = top; y <= bottom; y++) {
      const dy = y + 0.5 - py;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const from = Math.max(0, Math.ceil(px - half - 0.5));
      const to = Math.min(mask.width - 1, Math.floor(px + half - 0.5));
      const row = y * mask.width;
      for (let x = from; x <= to; x++) mask.data[row + x] = value;
    }
  };
  let last: { x: number; y: number } | null = null;
  for (const p of points) {
    const px = (p.x - frame.x) * frame.scale;
    const py = (p.y - frame.y) * frame.scale;
    if (!last) {
      stamp(px, py);
      last = { x: px, y: py };
      continue;
    }
    // Walk the segment at under a cell per step, so the capsule has no gaps
    // however far apart two pointer samples landed.
    const run = Math.hypot(px - last.x, py - last.y);
    const steps = Math.max(1, Math.ceil(run / 0.75));
    for (let i = 1; i <= steps; i++) {
      stamp(
        last.x + ((px - last.x) * i) / steps,
        last.y + ((py - last.y) * i) / steps,
      );
    }
    last = { x: px, y: py };
  }
}

/** Trace the mask's area back into contours in document coordinates —
 *  simplified until they fit the point budget, exactly as a bucket fill is —
 *  or `null` when nothing is filled. */
export function maskRegion(
  mask: BinaryMask,
  frame: MaskFrame,
): Point[][] | null {
  const contours = traceContours(mask);
  if (contours.length === 0) return null;
  let epsilon = BASE_EPSILON * frame.scale;
  let simplified = contours;
  for (let attempt = 0; attempt < 6; attempt++) {
    simplified = contours.map((loop) => simplifyContour(loop, epsilon));
    const points = simplified.reduce((n, loop) => n + loop.length, 0);
    if (points <= MAX_POINTS) break;
    epsilon *= 2;
  }
  const out = simplified
    .filter((loop) => loop.length >= 3)
    .map((loop) =>
      loop.map((p) => ({
        // Back to the page, at the tenth of a pixel the mask was ever good
        // for — the same rounding the bucket files (see `flood.ts`).
        x: Math.round((frame.x + p.x / frame.scale) * 10) / 10,
        y: Math.round((frame.y + p.y / frame.scale) * 10) / 10,
      })),
    );
  return out.length > 0 ? out : null;
}

/** The box around a run of contours and a path together, or `null` when both
 *  are empty. */
function boundsOf(
  region: readonly (readonly Point[])[],
  points: readonly Point[],
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const loop of region) for (const p of loop) take(p);
  for (const p of points) take(p);
  if (minX > maxX) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The whole gesture, in one call: the selection as it stands, worked over by
 *  one stroke of a round nib — painted in, or (`erase`) painted away — and
 *  handed back as contours. `null` when what is left encloses nothing, which
 *  is what "select nothing" arrives as everywhere else. */
export function combineRegion(
  region: readonly (readonly Point[])[],
  points: readonly Point[],
  radius: number,
  erase: boolean,
): Point[][] | null {
  const box = boundsOf(region, points);
  if (!box) return null;
  const made = maskFor(box, radius + 2);
  if (!made) return null;
  const { mask, frame } = made;
  fillRegion(mask, frame, region);
  stampPath(mask, frame, points, radius, erase ? 0 : 1);
  return maskRegion(mask, frame);
}
