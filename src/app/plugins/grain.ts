// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The grain the painters are built out of.
//
// Every textured mark in this app — the airbrush's speckle, the crayon's skips,
// the bristle brush's partings — needs two things: a source of scatter that is
// the *same* on every repaint, and a rule for when a detail has got too small to
// be worth drawing. Painting is a pure function of the stroke (a pan, an undo
// and the PNG export all repaint from the document), so a texture drawn from
// `Math.random` would shimmer; these hashes give the same answer for the same
// place for ever.
//
// Kept apart from the painters because both `brushes.ts` and `bristle.ts` build
// on them and neither owns them.

import type { Point } from "../types.ts";

/** The finest detail worth drawing, in device pixels. Two stamps closer
 *  together than this, or two hairs, land on the same pixel: the second one is
 *  arithmetic with nothing to show for it. */
export const PIXEL = 1;

/** Below this, in device pixels, a mark is a hairline — every painter here
 *  collapses to a plain path rather than building a texture nobody can see. */
export const HAIRLINE = 0.75;

/** A deterministic pseudo-random number in [0, 1) for a lattice of inputs. A
 *  cheap integer hash (three shifts and two multiplies) — good enough to look
 *  like scatter, and stable across engines because it stays in 32-bit integer
 *  space until the final divide. */
export function hashedRandom(a: number, b: number, c = 0): number {
  let h = (Math.round(a * 16) | 0) * 374761393;
  h = (h + (Math.round(b * 16) | 0) * 668265263) | 0;
  h = (h + (c | 0) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Smooth pseudo-random noise along one dimension, in [0, 1).
 *
 *  `hashedRandom` on its own is white noise: sampled along a stroke it jumps
 *  from one value to the next, and a bristle offset by it comes out as a
 *  zigzag. This interpolates between hashed lattice points with a smoothstep,
 *  which is what turns the same hash into something that *drifts* — a brush
 *  head twisting slowly as it travels rather than twitching per sample. */
export function driftNoise(t: number, seed: number): number {
  const cell = Math.floor(t);
  const f = t - cell;
  const a = hashedRandom(cell, seed, 17);
  const b = hashedRandom(cell + 1, seed, 17);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/** Resample a polyline at a fixed spacing, so a painter that puts something
 *  *at* each point (a spray dot, a bristle) lays them down evenly however fast
 *  the pointer was moving when the path was sampled. */
export function resample(points: readonly Point[], spacing: number): Point[] {
  const first = points[0];
  if (!first) return [];
  if (points.length === 1) return [first];
  const step = Math.max(0.5, spacing);
  const out: Point[] = [first];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (span === 0) continue;
    let travelled = step - carry;
    while (travelled <= span) {
      const t = travelled / span;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      travelled += step;
    }
    carry = (carry + span) % step;
  }
  return out;
}
