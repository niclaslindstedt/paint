// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What Delete background keeps: the subject, found from a rough tracing of it.
//
// The user paints roughly over the subject and this module finds where the
// subject actually ends. The idea is a classical one (it is the machinery
// inside Intelligent Scissors and snakes, arranged the way GrabCut arranges
// its inputs): the tracing splits the picture into three zones — well inside
// is *subject*, well outside is *background*, and a band either side of the
// traced outline is where the true border must run. The band is unwrapped
// into a strip by walking the outline and sampling along its normals, each
// strip cell is priced by how much it looks like a border there, and the
// cheapest *closed* path through the strip — found exactly, by dynamic
// programming — is the border. Cells are priced by three things: how strong
// the colour edge across the band is, how well the colours either side match
// learned models of the subject's and the background's palettes, and a weak
// pull toward the user's own line so that where the picture offers no
// evidence the cut follows the hand rather than wandering. The whole solve
// runs twice, the found border feeding the second pass, which measurably
// tightens the result.
//
// Everything here is pure and DOM-free — RGBA in, an alpha mask and outlines
// out — so a whole cut is testable in node. The half that needs a canvas
// (rasterising the layer, applying the mask) lives with the effects.
//
// The returned confidence is deliberately not "how continuous is the border":
// prototyping showed a border can lock onto the wrong thing (a tree trunk
// beside the subject) and be *perfectly* continuous. What tracks quality is
// how differently the two sides of the border are coloured — subject-ish
// within, background-ish without, all the way round — so that is most of the
// score.

import type { BinaryMask } from "./flood.ts";
import { fillRegion, maskFor, type MaskFrame } from "./regionMask.ts";
import type { Point } from "./types.ts";

/** How the cut may be tuned — the dials the effect exposes, plus the band
 *  half-width the design fixes at 20 document pixels. */
export type CutoutOptions = {
  /** Half-width of the searched border zone, in pixels of the bitmap the
   *  subject was traced over. The true border must lie within this distance
   *  of the tracing. */
  band?: number;
  /** Softness of the final edge, in pixels: 0 keeps it crisp, more melts the
   *  cut into whatever it lands on. */
  feather?: number;
  /** 0–1: how little colour difference still counts as a border. Low wants a
   *  sharp change (busy backgrounds); high lets faint changes attract the cut
   *  (subject nearly matching its background). */
  tolerance?: number;
  /** 0–1: how continuous the border is required to be. Low follows every
   *  wrinkle, high gives a calmer outline that rounds fine detail. */
  smoothness?: number;
  /** How many times the found border is fed back in as the new tracing. */
  passes?: number;
};

export type CutoutResult = {
  /** The refined border, one closed loop per traced loop, read even-odd (a
   *  loop traced inside another cuts a hole). */
  contours: Point[][];
  /** Per-pixel coverage of the subject, `width * height`, feathered. */
  alpha: Uint8ClampedArray;
  /** 0–1: how believable the border is, weighted toward `separation`. */
  confidence: number;
  /** Fraction of the border sitting on a genuinely strong colour edge. */
  onEdge: number;
  /** How differently the two sides of the border are coloured (0–1-ish;
   *  near zero means the border does not actually separate anything). */
  separation: number;
};

export const CUTOUT_BAND = 20;

/** The strip never spends more than this many columns in total across all
 *  loops in one pass — a page-sized tracing walks at a coarser step instead
 *  of pricing millions of cells. */
const MAX_COLUMNS = 8000;

/** Palette size of the learned subject / background colour models, and how
 *  many pixels feed each. GrabCut uses five Gaussians for the same job; five
 *  cluster centres are the poor man's version and price identically. */
const MODEL_COLORS = 5;
const MODEL_SAMPLES = 4000;

/** How the three prices mix. The region weight is GrabCut's idea borrowed
 *  into the band; the hand weight is deliberately faint — it only decides
 *  where the picture is silent. */
const REGION_WEIGHT = 0.45;
const HAND_WEIGHT = 0.06;

/** Find the subject's border near a rough tracing of it.
 *
 *  `rgba` is the bitmap the tracing was made over; `subject` is the tracing,
 *  closed loops in bitmap coordinates, read even-odd. Returns `null` when the
 *  tracing holds nothing workable (no loop with any area on the bitmap). */
export function cutout(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  subject: readonly (readonly Point[])[],
  options: CutoutOptions = {},
): CutoutResult | null {
  const band = options.band ?? CUTOUT_BAND;
  const feather = options.feather ?? 1;
  const tolerance = clamp01(options.tolerance ?? 0.5);
  const smoothness = clamp01(options.smoothness ?? 0.35);
  const passes = Math.max(1, options.passes ?? 2);

  let loops = subject
    .map((loop) => resampleClosed(loop, stepFor(subject)))
    .filter((loop) => loop.length >= 12);
  if (loops.length === 0) return null;

  let solved: SolvedPass | null = null;
  for (let pass = 0; pass < passes; pass++) {
    solved = solvePass(rgba, width, height, loops, band, tolerance, smoothness);
    if (!solved) return null;
    loops = solved.contours.map((loop) =>
      resampleClosed(loop, stepFor([loop])),
    );
  }
  if (!solved) return null;

  const alpha = coverage(solved.contours, width, height, feather);
  return {
    contours: solved.contours.map((loop) =>
      loop.map((p) => ({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
      })),
    ),
    alpha,
    // Separation carries the score (see the header); it saturates around 0.3,
    // which is what a cleanly separated border measured in practice.
    confidence: clamp01(
      0.6 * clamp01(solved.separation / 0.3) + 0.4 * solved.onEdge,
    ),
    onEdge: solved.onEdge,
    separation: solved.separation,
  };
}

// ---------------------------------------------------------------------------
// One pass: tracing in, refined border out.

type SolvedPass = {
  contours: Point[][];
  onEdge: number;
  separation: number;
};

function solvePass(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  loops: Point[][],
  band: number,
  tolerance: number,
  smoothness: number,
): SolvedPass | null {
  const trimap = buildTrimap(loops, width, height, band);
  if (!trimap) return null;
  const models = learnModels(rgba, width, height, trimap);

  // The DP transition price: how much moving one cell in or out per step
  // costs, mapped from the dial across the range that prototyping bracketed
  // (0.02 follows every wrinkle, 0.30 rounds everything).
  const lambda = 0.02 + 0.28 * smoothness;

  const contours: Point[][] = [];
  let onEdgeSum = 0;
  let separationSum = 0;
  let weightSum = 0;
  for (const loop of loops) {
    const solvedLoop = solveLoop(
      rgba,
      width,
      height,
      loop,
      loops,
      band,
      tolerance,
      lambda,
      models,
    );
    if (!solvedLoop) {
      contours.push(loop);
      continue;
    }
    contours.push(solvedLoop.contour);
    onEdgeSum += solvedLoop.onEdge * loop.length;
    separationSum += solvedLoop.separation * loop.length;
    weightSum += loop.length;
  }
  if (weightSum === 0) return null;
  return {
    contours,
    onEdge: onEdgeSum / weightSum,
    separation: separationSum / weightSum,
  };
}

/** The walking step along the tracing, chosen so the strip stays affordable:
 *  1 px until the combined outline is longer than the column budget. */
function stepFor(loops: readonly (readonly Point[])[]): number {
  let perimeter = 0;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      perimeter += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return Math.max(1, perimeter / MAX_COLUMNS);
}

// ---------------------------------------------------------------------------
// The trimap: subject / background / the band between.

type Trimap = {
  mask: BinaryMask;
  frame: MaskFrame;
  /** Signed distance to the tracing in bitmap px, per mask cell: negative
   *  inside the subject, positive outside. Approximate (chamfer), which is
   *  plenty — it only labels zones. */
  distance: Float32Array;
  /** The band half-width the zones were cut at. */
  band: number;
};

function buildTrimap(
  loops: readonly (readonly Point[])[],
  width: number,
  height: number,
  band: number,
): Trimap | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const loop of loops) {
    for (const p of loop) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(width, maxX);
  maxY = Math.min(height, maxY);
  const made = maskFor(
    { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    band * 2,
  );
  if (!made) return null;
  const { mask, frame } = made;
  fillRegion(mask, frame, loops);
  const distance = signedDistance(mask, frame.scale);
  return { mask, frame, distance, band };
}

/** Two-pass chamfer distance to the mask's boundary, in bitmap pixels,
 *  negated inside. */
function signedDistance(mask: BinaryMask, scale: number): Float32Array {
  const { width, height, data } = mask;
  const outside = chamfer(width, height, (i) => data[i] === 1);
  const inside = chamfer(width, height, (i) => data[i] !== 1);
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = (data[i] === 1 ? -inside[i]! : outside[i]!) / scale;
  }
  return out;
}

/** Distance in cells from every cell to the nearest cell where `seed` holds
 *  (0 on the seeds themselves). The classic 3×3 two-pass sweep. */
function chamfer(
  width: number,
  height: number,
  seed: (index: number) => boolean,
): Float32Array {
  const DIAG = Math.SQRT2;
  const far = width + height;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = seed(i) ? 0 : far;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let best = d[i]!;
      if (x > 0) best = Math.min(best, d[i - 1]! + 1);
      if (y > 0) best = Math.min(best, d[i - width]! + 1);
      if (x > 0 && y > 0) best = Math.min(best, d[i - width - 1]! + DIAG);
      if (x < width - 1 && y > 0) {
        best = Math.min(best, d[i - width + 1]! + DIAG);
      }
      d[i] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let best = d[i]!;
      if (x < width - 1) best = Math.min(best, d[i + 1]! + 1);
      if (y < height - 1) best = Math.min(best, d[i + width]! + 1);
      if (x < width - 1 && y < height - 1) {
        best = Math.min(best, d[i + width + 1]! + DIAG);
      }
      if (x > 0 && y < height - 1) {
        best = Math.min(best, d[i + width - 1]! + DIAG);
      }
      d[i] = best;
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Colour models: what the subject and the background look like.

type Models = {
  subject: Float32Array; // MODEL_COLORS × 3 Lab centres
  background: Float32Array;
};

function learnModels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  trimap: Trimap,
): Models {
  const { mask, frame, distance } = trimap;
  const rand = mulberry32(0x5eed);
  const subjectPx: number[] = [];
  const backgroundPx: number[] = [];
  const cells = mask.width * mask.height;
  // Reservoir-free subsample: visit cells in a seeded random order until each
  // model has its fill. Bounded, deterministic, and unbiased enough.
  const stride = Math.max(1, Math.floor(cells / (MODEL_SAMPLES * 8)));
  const offset = Math.floor(rand() * stride);
  for (let i = offset; i < cells; i += stride) {
    const dist = distance[i]!;
    const into =
      dist < -trimap.band
        ? subjectPx
        : dist > trimap.band
          ? backgroundPx
          : null;
    if (!into || into.length >= MODEL_SAMPLES * 3) continue;
    const cx = i % mask.width;
    const cy = (i - cx) / mask.width;
    const x = Math.min(
      width - 1,
      Math.max(0, Math.round(frame.x + cx / frame.scale)),
    );
    const y = Math.min(
      height - 1,
      Math.max(0, Math.round(frame.y + cy / frame.scale)),
    );
    const base = (y * width + x) * 4;
    const lab = rgbToLab(rgba[base]!, rgba[base + 1]!, rgba[base + 2]!);
    into.push(lab[0], lab[1], lab[2]);
  }
  return {
    subject: kmeans(subjectPx, rand),
    background: kmeans(backgroundPx, rand),
  };
}

/** Lloyd's k-means with k-means++ seeding over Lab triples. Deterministic
 *  (seeded), and happy with tiny sample sets — a model with fewer distinct
 *  colours than centres just repeats some. */
function kmeans(samples: number[], rand: () => number): Float32Array {
  const n = samples.length / 3;
  const centers = new Float32Array(MODEL_COLORS * 3);
  if (n === 0) return centers;
  // k-means++: first centre uniform, the rest proportional to squared
  // distance from the nearest chosen one.
  const pick = (index: number, into: number): void => {
    centers[into * 3] = samples[index * 3]!;
    centers[into * 3 + 1] = samples[index * 3 + 1]!;
    centers[into * 3 + 2] = samples[index * 3 + 2]!;
  };
  pick(Math.floor(rand() * n), 0);
  const d2 = new Float32Array(n).fill(Infinity);
  for (let c = 1; c < MODEL_COLORS; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dl = samples[i * 3]! - centers[(c - 1) * 3]!;
      const da = samples[i * 3 + 1]! - centers[(c - 1) * 3 + 1]!;
      const db = samples[i * 3 + 2]! - centers[(c - 1) * 3 + 2]!;
      d2[i] = Math.min(d2[i]!, dl * dl + da * da + db * db);
      total += d2[i]!;
    }
    let target = rand() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      target -= d2[i]!;
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    pick(chosen, c);
  }
  const assign = new Int32Array(n);
  for (let iteration = 0; iteration < 12; iteration++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < MODEL_COLORS; c++) {
        const dl = samples[i * 3]! - centers[c * 3]!;
        const da = samples[i * 3 + 1]! - centers[c * 3 + 1]!;
        const db = samples[i * 3 + 2]! - centers[c * 3 + 2]!;
        const dist = dl * dl + da * da + db * db;
        if (dist < bestD) {
          bestD = dist;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    if (!moved && iteration > 0) break;
    const sum = new Float64Array(MODEL_COLORS * 4);
    for (let i = 0; i < n; i++) {
      const c = assign[i]!;
      sum[c * 4] += samples[i * 3]!;
      sum[c * 4 + 1] += samples[i * 3 + 1]!;
      sum[c * 4 + 2] += samples[i * 3 + 2]!;
      sum[c * 4 + 3] += 1;
    }
    for (let c = 0; c < MODEL_COLORS; c++) {
      const count = sum[c * 4 + 3]!;
      if (count === 0) continue;
      centers[c * 3] = sum[c * 4]! / count;
      centers[c * 3 + 1] = sum[c * 4 + 1]! / count;
      centers[c * 3 + 2] = sum[c * 4 + 2]! / count;
    }
  }
  return centers;
}

function nearestDistance(
  models: Float32Array,
  l: number,
  a: number,
  b: number,
): number {
  let best = Infinity;
  for (let c = 0; c < models.length; c += 3) {
    const dl = l - models[c]!;
    const da = a - models[c + 1]!;
    const db = b - models[c + 2]!;
    best = Math.min(best, dl * dl + da * da + db * db);
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------------------
// One loop: unwrap its band, price it, and run the path.

type SolvedLoop = {
  contour: Point[];
  onEdge: number;
  separation: number;
};

function solveLoop(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  loop: Point[],
  region: readonly (readonly Point[])[],
  band: number,
  tolerance: number,
  lambda: number,
  models: Models,
): SolvedLoop | null {
  const n = loop.length;
  const t = band * 2 + 1;
  const smoothed = smoothClosed(loop, 15);
  const normals = outwardNormals(smoothed, region);

  // The strip: Lab colour at every (step along the outline, offset across the
  // band) cell, offsets running inside → outside.
  const strip = new Float32Array(n * t * 3);
  for (let i = 0; i < n; i++) {
    const c = smoothed[i]!;
    const normal = normals[i]!;
    for (let k = 0; k < t; k++) {
      const offset = k - band;
      const lab = sampleLab(
        rgba,
        width,
        height,
        c.x + normal.x * offset,
        c.y + normal.y * offset,
      );
      const base = (i * t + k) * 3;
      strip[base] = lab[0];
      strip[base + 1] = lab[1];
      strip[base + 2] = lab[2];
    }
  }
  blurStrip(strip, n, t);

  // Edge price: the colour gradient across the band, normalised against its
  // own strong end so "strong edge" means strong *for this picture*. The
  // tolerance dial rescales what counts as strong.
  const gradient = new Float32Array(n * t);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < t; k++) {
      const lo = (i * t + Math.max(0, k - 1)) * 3;
      const hi = (i * t + Math.min(t - 1, k + 1)) * 3;
      const dl = strip[hi]! - strip[lo]!;
      const da = strip[hi + 1]! - strip[lo + 1]!;
      const db = strip[hi + 2]! - strip[lo + 2]!;
      gradient[i * t + k] = Math.sqrt(dl * dl + da * da + db * db) / 2;
    }
  }
  const strong = percentile(gradient, 0.99) * (1.6 - 1.2 * tolerance) || 1;

  // Region price: a border cell is cheap when what lies within it matches the
  // subject's palette and what lies without matches the background's. Prefix
  // sums make "mean subject-likeness up to here" O(1) per cell.
  const likeness = new Float32Array(n * t);
  const margin = 4 + 12 * (1 - tolerance);
  for (let i = 0; i < n * t; i++) {
    const l = strip[i * 3]!;
    const a = strip[i * 3 + 1]!;
    const b = strip[i * 3 + 2]!;
    const gap =
      nearestDistance(models.subject, l, a, b) -
      nearestDistance(models.background, l, a, b);
    likeness[i] = 1 / (1 + Math.exp(Math.max(-30, Math.min(30, gap / margin))));
  }

  const cost = new Float32Array(n * t);
  let regionMin = Infinity;
  let regionMax = -Infinity;
  const regionRaw = new Float32Array(n * t);
  for (let i = 0; i < n; i++) {
    let prefix = 0;
    const row = i * t;
    const rowTotal = sumRow(likeness, row, t);
    for (let k = 0; k < t; k++) {
      prefix += likeness[row + k]!;
      const within = prefix / (k + 1);
      // Past the outermost cell there is nothing to average, and an empty
      // "outside" must not read as a background-free one — the rim continues
      // with its own colour instead, so the last column earns no discount.
      const without =
        k < t - 1 ? (rowTotal - prefix) / (t - 1 - k) : likeness[row + k]!;
      const raw = 1 - within + without;
      regionRaw[row + k] = raw;
      regionMin = Math.min(regionMin, raw);
      regionMax = Math.max(regionMax, raw);
    }
  }
  const regionSpan = regionMax - regionMin || 1;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < t; k++) {
      const cell = i * t + k;
      const edge = 1 - Math.min(1, gradient[cell]! / strong);
      const region01 = (regionRaw[cell]! - regionMin) / regionSpan;
      const hand = Math.abs(k - band) / band;
      cost[cell] =
        (1 - REGION_WEIGHT) * edge +
        REGION_WEIGHT * region01 +
        HAND_WEIGHT * hand;
    }
  }

  const path = circularPath(cost, n, t, lambda);
  if (!path) return null;

  // Score the found border with the *undialled* edge measure, so confidence
  // means the same thing whatever the dials say.
  let onEdge = 0;
  let separation = 0;
  for (let i = 0; i < n; i++) {
    const k = path[i]!;
    if (1 - Math.min(1, gradient[i * t + k]! / strong) < 0.5) onEdge++;
    const row = i * t;
    let within = 0;
    for (let j = 0; j <= k; j++) within += likeness[row + j]!;
    within /= k + 1;
    // The same empty-outside rule the pricing uses: a border on the band's
    // rim separates nothing it can show, so it scores against itself.
    let without = likeness[row + k]!;
    if (k < t - 1) {
      without = 0;
      for (let j = k + 1; j < t; j++) without += likeness[row + j]!;
      without /= t - 1 - k;
    }
    separation += within - without;
  }

  const contour: Point[] = [];
  for (let i = 0; i < n; i++) {
    const c = smoothed[i]!;
    const normal = normals[i]!;
    const offset = path[i]! - band;
    contour.push({ x: c.x + normal.x * offset, y: c.y + normal.y * offset });
  }
  return { contour, onEdge: onEdge / n, separation: separation / n };
}

function sumRow(values: Float32Array, from: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += values[from + i]!;
  return total;
}

// ---------------------------------------------------------------------------
// The cheapest closed path through the strip.

/** Minimise Σ cost(i, k_i) + λ·|k_i − k_{i+1}| over closed paths that move at
 *  most one cell in or out per step. Closure is exact: the path must end in
 *  the column it started from, tried from a spread of fixed starts. */
function circularPath(
  cost: Float32Array,
  n: number,
  t: number,
  lambda: number,
): Int32Array | null {
  if (n < 4) return null;
  const dp = new Float32Array(t);
  const next = new Float32Array(t);
  const back = new Int8Array(n * t);
  let bestTotal = Infinity;
  let bestPath: Int32Array | null = null;
  for (let start = 0; start < t; start += 2) {
    dp.fill(Infinity);
    dp[start] = cost[start]!;
    for (let i = 1; i < n; i++) {
      const row = i * t;
      for (let k = 0; k < t; k++) {
        let best = dp[k]!;
        let move = 0;
        if (k > 0 && dp[k - 1]! + lambda < best) {
          best = dp[k - 1]! + lambda;
          move = -1;
        }
        if (k < t - 1 && dp[k + 1]! + lambda < best) {
          best = dp[k + 1]! + lambda;
          move = 1;
        }
        next[k] = best + cost[row + k]!;
        back[row + k] = move;
      }
      dp.set(next);
    }
    for (let k = Math.max(0, start - 1); k <= Math.min(t - 1, start + 1); k++) {
      const total = dp[k]! + lambda * Math.abs(k - start);
      if (total < bestTotal) {
        bestTotal = total;
        const path = new Int32Array(n);
        path[n - 1] = k;
        for (let i = n - 1; i > 0; i--) {
          path[i - 1] = path[i]! + back[i * t + path[i]!]!;
        }
        bestPath = path;
      }
    }
  }
  return bestPath;
}

// ---------------------------------------------------------------------------
// Geometry: walking the tracing.

/** The loop, resampled to roughly `step`-px arc lengths. */
export function resampleClosed(loop: readonly Point[], step: number): Point[] {
  if (loop.length < 3) return [...loop];
  let perimeter = 0;
  const lengths: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(length);
    perimeter += length;
  }
  const count = Math.max(3, Math.round(perimeter / step));
  const out: Point[] = [];
  let segment = 0;
  let into = 0;
  for (let i = 0; i < count; i++) {
    const target = (perimeter * i) / count;
    while (into + lengths[segment]! < target && segment < loop.length - 1) {
      into += lengths[segment]!;
      segment++;
    }
    const a = loop[segment]!;
    const b = loop[(segment + 1) % loop.length]!;
    const f = lengths[segment]! > 0 ? (target - into) / lengths[segment]! : 0;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

/** Circular moving average — the tracing's wobble should not become the
 *  band's wobble. */
function smoothClosed(loop: readonly Point[], window: number): Point[] {
  const n = loop.length;
  const half = Math.min(Math.floor(window / 2), Math.floor((n - 1) / 2));
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    for (let j = -half; j <= half; j++) {
      const p = loop[(i + j + n) % n]!;
      x += p.x;
      y += p.y;
    }
    const span = half * 2 + 1;
    out.push({ x: x / span, y: y / span });
  }
  return out;
}

/** Unit normals pointing away from the subject — decided by probing a few
 *  points against the whole traced region (even-odd), which makes a hole's
 *  band look *into* the hole, exactly where its background is. */
function outwardNormals(
  smoothed: readonly Point[],
  region: readonly (readonly Point[])[],
): Point[] {
  const n = smoothed.length;
  const normals: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = smoothed[(i - 3 + n) % n]!;
    const b = smoothed[(i + 3) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    normals.push({ x: dy / length, y: -dx / length });
  }
  let inside = 0;
  let probes = 0;
  const stride = Math.max(1, Math.floor(n / 9));
  for (let i = 0; i < n; i += stride) {
    const c = smoothed[i]!;
    const normal = normals[i]!;
    if (inRegion(region, c.x + normal.x * 5, c.y + normal.y * 5)) inside++;
    probes++;
  }
  if (inside * 2 > probes) {
    for (const normal of normals) {
      normal.x = -normal.x;
      normal.y = -normal.y;
    }
  }
  return normals;
}

/** Even-odd containment against a set of loops. */
function inRegion(
  region: readonly (readonly Point[])[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (const loop of region) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i]!;
      const b = loop[j]!;
      if (
        a.y > y !== b.y > y &&
        x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Pixels: sampling, blurring, covering.

/** Bilinear RGBA sample converted to Lab, clamped at the bitmap's edge. */
function sampleLab(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] {
  const cx = Math.max(0, Math.min(width - 1.001, x));
  const cy = Math.max(0, Math.min(height - 1.001, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [px, py, w] of [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ] as const) {
    const base = (py * width + px) * 4;
    r += rgba[base]! * w;
    g += rgba[base + 1]! * w;
    b += rgba[base + 2]! * w;
  }
  return rgbToLab(r, g, b);
}

/** sRGB → Lab (D65). Lab because a colour step reads the same size to the
 *  pricing as it does to the eye, which RGB distances do not. */
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (v: number): number =>
    v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** A light separable blur over the strip — noise should not price a cell. */
function blurStrip(strip: Float32Array, n: number, t: number): void {
  const kernel = [0.25, 0.5, 0.25];
  const row = new Float32Array(t * 3);
  for (let i = 0; i < n; i++) {
    row.set(strip.subarray(i * t * 3, (i + 1) * t * 3));
    for (let k = 0; k < t; k++) {
      for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let j = -1; j <= 1; j++) {
          const kk = Math.max(0, Math.min(t - 1, k + j));
          value += row[kk * 3 + channel]! * kernel[j + 1]!;
        }
        strip[(i * t + k) * 3 + channel] = value;
      }
    }
  }
  const column = new Float32Array(n * 3);
  for (let k = 0; k < t; k++) {
    for (let i = 0; i < n; i++) {
      column[i * 3] = strip[(i * t + k) * 3]!;
      column[i * 3 + 1] = strip[(i * t + k) * 3 + 1]!;
      column[i * 3 + 2] = strip[(i * t + k) * 3 + 2]!;
    }
    for (let i = 0; i < n; i++) {
      for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let j = -1; j <= 1; j++) {
          const ii = (i + j + n) % n;
          value += column[ii * 3 + channel]! * kernel[j + 1]!;
        }
        strip[(i * t + k) * 3 + channel] = value;
      }
    }
  }
}

/** The refined region as per-pixel coverage, feathered. Filled at full
 *  resolution over the region's own bounding box only. */
function coverage(
  contours: readonly (readonly Point[])[],
  width: number,
  height: number,
  feather: number,
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const loop of contours) {
    for (const p of loop) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const pad = Math.ceil(feather * 3 + 2);
  const x0 = Math.max(0, Math.floor(minX) - pad);
  const y0 = Math.max(0, Math.floor(minY) - pad);
  const x1 = Math.min(width, Math.ceil(maxX) + pad);
  const y1 = Math.min(height, Math.ceil(maxY) + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return alpha;

  const mask: BinaryMask = { width: w, height: h, data: new Uint8Array(w * h) };
  fillRegion(mask, { x: x0, y: y0, scale: 1 }, contours);

  // Feather: three box passes approximate a Gaussian of the dialled sigma;
  // even at zero one light pass stays, softening the staircase a raster fill
  // leaves on a diagonal.
  const soft = new Float32Array(w * h);
  for (let i = 0; i < soft.length; i++) soft[i] = mask.data[i]! * 255;
  const radius = Math.max(1, Math.round(feather));
  const boxPasses = feather > 0 ? 3 : 1;
  for (let pass = 0; pass < boxPasses; pass++) {
    boxBlur(soft, w, h, feather > 0 ? radius : 1);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      alpha[(y0 + y) * width + (x0 + x)] = soft[y * w + x]!;
    }
  }
  return alpha;
}

/** One separable box pass, in place. */
function boxBlur(
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  const span = radius * 2 + 1;
  const line = new Float32Array(Math.max(width, height));
  for (let y = 0; y < height; y++) {
    const row = y * width;
    line.set(values.subarray(row, row + width));
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += line[Math.max(0, Math.min(width - 1, x))]!;
    }
    for (let x = 0; x < width; x++) {
      values[row + x] = sum / span;
      sum -= line[Math.max(0, x - radius)]!;
      sum += line[Math.min(width - 1, x + radius + 1)]!;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = values[y * width + x]!;
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += line[Math.max(0, Math.min(height - 1, y))]!;
    }
    for (let y = 0; y < height; y++) {
      values[y * width + x] = sum / span;
      sum -= line[Math.max(0, y - radius)]!;
      sum += line[Math.min(height - 1, y + radius + 1)]!;
    }
  }
}

function percentile(values: Float32Array, q: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Small seeded PRNG — the cut must be the same cut on every run. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
