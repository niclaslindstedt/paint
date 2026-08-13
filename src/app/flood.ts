// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Turning a bucket tap into vector geometry.
//
// A paint bucket is a raster idea — "flood the pixels that look like this one" —
// and this document has no pixels. So the filler does the raster work *once*, at
// the moment of the tap, and throws the pixels away: flood a rasterised snapshot
// of the page, trace the flooded area's outline, and keep only the outline. What
// lands in the document is an ordinary vector stroke (`shape.kind === "region"`)
// that scales, undoes, exports, and syncs like every other mark.
//
// Everything here is pure and DOM-free — it takes an RGBA buffer and returns
// points — so the whole pipeline is testable in node. The snapshot itself is
// taken by `probe.ts`, which is the half that needs a canvas.

import type { Point } from "./types.ts";

/** A binary image: 1 where the flood reached, 0 everywhere else. */
export type BinaryMask = {
  width: number;
  height: number;
  data: Uint8Array;
};

/** How alike two colours have to be to count as the same area, as a distance in
 *  0–255 channel units (averaged over RGBA). Generous enough to walk across the
 *  soft edge of an anti-aliased line without leaking through it. */
export const DEFAULT_TOLERANCE = 24;

/** How far the flooded area is grown before it is traced, in **document**
 *  pixels.
 *
 *  A line drawn on a canvas is anti-aliased: the pixels either side of it are a
 *  blend, too unlike the page to be flooded and too unlike the line to be
 *  ignored. Left alone, every fill would stop a pixel short and leave a pale
 *  halo around itself. Growing the area back over that blend is what makes a
 *  bucket fill meet the line it was aimed at.
 *
 *  Two pixels is enough to cross that blend and no more: the fill has to tuck
 *  *under* the line that bounds it, not swallow it. */
export const DEFAULT_GROW_PX = 2;

/** Flood the connected run of like-coloured pixels containing `seed`.
 *
 *  Four-connected and scanline-based: the classic bucket fill, which is also
 *  the one that can't leak through a diagonal join. Returns `null` when the
 *  seed is off the buffer. */
export function floodMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  seed: Point,
  tolerance = DEFAULT_TOLERANCE,
): BinaryMask | null {
  const sx = Math.floor(seed.x);
  const sy = Math.floor(seed.y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

  const data = new Uint8Array(width * height);
  const base = (sy * width + sx) * 4;
  const sr = rgba[base]!;
  const sg = rgba[base + 1]!;
  const sb = rgba[base + 2]!;
  const sa = rgba[base + 3]!;
  const limit = tolerance * tolerance;

  const alike = (index: number): boolean => {
    const i = index * 4;
    const dr = rgba[i]! - sr;
    const dg = rgba[i + 1]! - sg;
    const db = rgba[i + 2]! - sb;
    const da = rgba[i + 3]! - sa;
    return (dr * dr + dg * dg + db * db + da * da) / 4 <= limit;
  };

  // Scanline flood: each popped seed fills its whole row span, then pushes one
  // seed per contiguous run found on the rows above and below. That is an order
  // of magnitude fewer stack entries than a per-pixel flood, which matters on a
  // page-sized fill.
  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const row = y * width;
    if (data[row + x] === 1 || !alike(row + x)) continue;

    let left = x;
    while (left > 0 && data[row + left - 1] === 0 && alike(row + left - 1)) {
      left--;
    }
    let right = x;
    while (
      right < width - 1 &&
      data[row + right + 1] === 0 &&
      alike(row + right + 1)
    ) {
      right++;
    }
    for (let i = left; i <= right; i++) data[row + i] = 1;

    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      const nrow = ny * width;
      let run = false;
      for (let i = left; i <= right; i++) {
        const open = data[nrow + i] === 0 && alike(nrow + i);
        if (open && !run) stack.push(i, ny);
        run = open;
      }
    }
  }

  return { width, height, data };
}

/** Grow a mask by `radius` cells (a square dilation — cheap, and the difference
 *  from a round one is invisible at one or two cells). */
export function grow(mask: BinaryMask, radius: number): BinaryMask {
  if (radius <= 0) return mask;
  const { width, height } = mask;
  // Separable: a horizontal pass then a vertical one, each O(n·radius).
  let src = mask.data;
  for (const horizontal of [true, false]) {
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (src[y * width + x] !== 1) continue;
        const from = horizontal ? x - radius : y - radius;
        const to = horizontal ? x + radius : y + radius;
        const span = horizontal ? width : height;
        for (let i = Math.max(0, from); i <= Math.min(span - 1, to); i++) {
          out[horizontal ? y * width + i : i * width + x] = 1;
        }
      }
    }
    src = out;
  }
  return { width, height, data: src };
}

/** Trace every boundary of a mask into closed loops, in *lattice* coordinates
 *  (corner coordinates, so a 1×1 cell at the origin traces `(0,0) (1,0) (1,1)
 *  (0,1)`).
 *
 *  The walk is the obvious one: every side of a filled cell whose neighbour is
 *  empty is a boundary edge, oriented so the loops run the same way round; the
 *  edges then chain end-to-start into loops. Holes come out as loops of their
 *  own, which is why the painter fills with the even-odd rule — an island inside
 *  a filled area stays unpainted without anything having to know it is an
 *  island. */
export function traceContours(mask: BinaryMask): Point[][] {
  const { width, height, data } = mask;
  const filled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;

  // Directed boundary edges, indexed by the corner they start at so the chaining
  // pass is a lookup rather than a search.
  const ax: number[] = [];
  const ay: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  const fromCorner = new Map<number, number[]>();
  const corner = (x: number, y: number): number => y * (width + 1) + x;

  const edge = (x1: number, y1: number, x2: number, y2: number): void => {
    const index = ax.length;
    ax.push(x1);
    ay.push(y1);
    bx.push(x2);
    by.push(y2);
    const key = corner(x1, y1);
    const list = fromCorner.get(key);
    if (list) list.push(index);
    else fromCorner.set(key, [index]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) edge(x, y, x + 1, y);
      if (!filled(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) edge(x, y + 1, x, y);
    }
  }

  const used = new Uint8Array(ax.length);
  const loops: Point[][] = [];
  for (let seed = 0; seed < ax.length; seed++) {
    if (used[seed] === 1) continue;
    const points: Point[] = [];
    let current = seed;
    // Follow the chain until it closes on itself. It always does: every corner
    // a boundary edge arrives at has one leaving it, so the walk can only stop
    // where it started.
    for (;;) {
      used[current] = 1;
      points.push({ x: ax[current]!, y: ay[current]! });
      const key = corner(bx[current]!, by[current]!);
      const candidates = fromCorner.get(key);
      const next = candidates?.find((index) => used[index] === 0);
      if (next === undefined) break;
      current = next;
    }
    if (points.length >= 4) loops.push(collapseCollinear(points));
  }
  return loops;
}

/** Drop the points that only continue a straight run. A traced outline is a
 *  staircase of unit steps, and most of them say nothing. */
function collapseCollinear(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const here = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const cross =
      (here.x - prev.x) * (next.y - here.y) -
      (here.y - prev.y) * (next.x - here.x);
    if (cross !== 0) out.push(here);
  }
  return out.length >= 3 ? out : points;
}

/** Ramer–Douglas–Peucker: drop the points a closed outline can lose without
 *  moving further than `epsilon` from where it was. A traced fill is a
 *  staircase; this is what turns it back into an outline you'd have drawn. */
export function simplifyContour(points: Point[], epsilon: number): Point[] {
  if (points.length <= 3 || epsilon <= 0) return points;
  // Split the loop at its two furthest-apart-in-index points so the recursion
  // has two open runs to work on rather than one closed one.
  const half = Math.floor(points.length / 2);
  const first = simplifyRun(points.slice(0, half + 1), epsilon);
  const second = simplifyRun(
    [...points.slice(half), points[0]!],
    epsilon,
  ).slice(1, -1);
  const out = [...first, ...second];
  return out.length >= 3 ? out : points;
}

function simplifyRun(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToSegment(points[i]!, first, last);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= epsilon) return [first, last];
  const left = simplifyRun(points.slice(0, at + 1), epsilon);
  const right = simplifyRun(points.slice(at), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** Distance from `p` to the segment `a`–`b`. */
function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** How the raster snapshot maps back onto the page. */
export type FloodSpace = {
  /** Mask cells per document pixel — below 1 when the snapshot was taken at a
   *  coarser resolution than the page (which it is, on a big page). */
  scale: number;
};

export type FloodOptions = FloodSpace & {
  tolerance?: number;
  /** Mask cells the flooded area is grown by before tracing. Defaults to
   *  `DEFAULT_GROW_PX` document pixels' worth at this snapshot's scale — the
   *  growth has to be a distance on the *page*, or a fill would swallow the
   *  line it was aimed at whenever the snapshot was taken coarsely. */
  growBy?: number;
  /** Outline tolerance in *document* pixels. */
  epsilon?: number;
  /** Give up rather than file an enormous stroke: outlines are simplified
   *  harder until they fit under this many points in total. */
  maxPoints?: number;
};

/** The whole bucket pipeline: flood a snapshot, trace what was flooded, and
 *  hand back outlines in document coordinates. `null` when the tap landed off
 *  the page. */
export function regionAt(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  seed: Point,
  options: FloodOptions = { scale: 1 },
): Point[][] | null {
  const scale = options.scale;
  const flooded = floodMask(
    rgba,
    width,
    height,
    { x: seed.x * scale, y: seed.y * scale },
    options.tolerance ?? DEFAULT_TOLERANCE,
  );
  if (!flooded) return null;
  const growBy =
    options.growBy ?? Math.max(1, Math.round(DEFAULT_GROW_PX * scale));
  const contours = traceContours(grow(flooded, growBy));
  if (contours.length === 0) return null;

  const maxPoints = options.maxPoints ?? 4000;
  let epsilon = options.epsilon ?? 1;
  let simplified = contours;
  // A page-sized fill against a ragged pencil sketch can trace tens of
  // thousands of steps. Rather than file that, coarsen the outline until it
  // fits — a fill nobody can see the difference in beats one that bloats every
  // save from here on.
  for (let attempt = 0; attempt < 6; attempt++) {
    simplified = contours.map((loop) => simplifyContour(loop, epsilon * scale));
    if (countPoints(simplified) <= maxPoints) break;
    epsilon *= 2;
  }

  return simplified
    .filter((loop) => loop.length >= 3)
    .map((loop) =>
      loop.map((p) => ({
        // Back to document space, rounded to a tenth of a pixel: the snapshot
        // was never more precise than that, and the extra digits would be pure
        // JSON weight in every save and every sync.
        x: Math.round((p.x / scale) * 10) / 10,
        y: Math.round((p.y / scale) * 10) / 10,
      })),
    );
}

function countPoints(contours: Point[][]): number {
  return contours.reduce((n, loop) => n + loop.length, 0);
}
