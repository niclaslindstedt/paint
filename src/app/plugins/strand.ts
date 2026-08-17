// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One hair of a head, travelling.
//
// `head.ts` fits the strands across the ferrule — where each one sits, how
// thick it is, how far the bundle has opened. `bristle.ts` drags the head over
// paper. This module is the little that sits between them: what a single hair
// is *like* over the length of a drag, and how the run it leaves is streamed
// into a path.
//
// It is here rather than in either neighbour because a drag has two phases and
// both need it. The charged run and the trail of residue after it (see
// `residue.ts`) are different amounts of paint, but they are the same head: the
// hair that lifts first while there is paint is the hair that gives out first
// once there is none, and the hair that landed a fraction late lands a fraction
// late in both. Computed twice, they would drift apart and the mark would part
// company with itself where the paint ran out.

import { hashedRandom } from "./grain.ts";
import type { HeadFit } from "./head.ts";

/** What every hair of a fitted head is like along a mark of a given length.
 *
 *  The arrays are parallel and `count` long, and every one of them is settled
 *  before a hair is drawn — the same reason `fitHead` settles the geometry up
 *  front. */
export type HeadHairs = {
  count: number;
  /** Where this hair sits across the head, −1 to 1, before anything strays it
   *  out of line. */
  lane: Float64Array;
  /** …and where its centre actually is, as a share of the half-width: its lane
   *  fitted to the head, plus the nudge towards its neighbour. */
  across: Float64Array;
  /** How readily it leaves the paper — the share of a drag it spends off it,
   *  before the load and the paper's tooth have their say. */
  dryEdge: Float64Array;
  /** How long its dry stretches run, in document pixels. */
  skipRun: Float64Array;
  /** How far in from each end of the mark it touches down and rolls off. */
  lands: Float64Array;
  lifts: Float64Array;
};

/** Work out what each hair of a fitted head is like over a mark `total` long.
 *
 *  `hard` is how wet and gathered the bundle is — it is the largest term in how
 *  readily a hair leaves the paper, and deliberately so: look at a pressure
 *  series and each mark is *evenly* streaky down its whole length. The paint
 *  running out is a second, slower thing that happens along the stroke, not
 *  what makes a light-pressure mark light. */
export function hairTraits(
  fit: HeadFit,
  size: number,
  hard: number,
  total: number,
): HeadHairs {
  const { count, lanes, edges, clumps, inset } = fit;
  const half = size / 2;
  const lane = new Float64Array(count);
  const across = new Float64Array(count);
  const dryEdge = new Float64Array(count);
  const skipRun = new Float64Array(count);
  const lands = new Float64Array(count);
  const lifts = new Float64Array(count);
  // How far either end of the mark a hair may be cut short. Held to a fraction
  // of the mark as well as of the head, because a dab is shorter than the brush
  // that made it: unbounded, a head-width of fray at each end of a stroke a
  // third of a head long cuts every hair away and leaves the pooled middle on
  // its own.
  const ragged = Math.min(size, total * 0.5);
  for (let b = 0; b < count; b++) {
    const edge = edges[b]!;
    lane[b] = count === 1 ? 0 : (b / (count - 1) - 0.5) * 2;
    across[b] = (lanes[b]! * inset + clumps[b]!) / Math.max(1, half);
    // The outer hairs go first whatever the head — they carry the least paint
    // and take the least pressure, and that is what makes an edge fray rather
    // than stop.
    //
    // It rises across the head as well as at its very sides. A head does not
    // bear on the paper evenly — the middle of the bundle is where the handle's
    // weight goes — so a light mark is a mass that is thickest down its centre,
    // not a rectangle of evenly spaced wires with two frayed borders.
    dryEdge[b] =
      0.03 +
      (1 - hard) * 0.3 +
      lane[b]! * lane[b]! * (1 - hard) * 0.24 +
      edge * 0.4 * (1.4 - hard) +
      hashedRandom(b * 7.1, b * 3.3) * 0.1;
    // How long this hair's dry stretches run. Per hair, so the skips across the
    // head are not all the same length — one drift period for all of them reads
    // as a dashed line, which is a thing no brush does.
    //
    // Measured against the head rather than in absolute pixels, and kept short:
    // a run comparable to the whole stroke is not a skipping hair at all, it is
    // a hair that either drew or did not, and a head of those comes out as a
    // handful of unbroken wires with bare paper between them instead of as a
    // mark that is combed all over.
    skipRun[b] = Math.max(14, size * (0.3 + hashedRandom(b * 2.7, 33) * 0.8));
    // Where this hair touches down and where it leaves. A head is a cut bundle,
    // not a blade: the hairs are near enough level, which is why a brushed mark
    // starts and stops bluntly rather than tapering — but only near enough, and
    // the few tenths of a head-width they disagree by is the ragged edge across
    // both ends of every stroke on a reference sheet. The lift end frays
    // further than the landing one, because by then the head is emptier and the
    // outermost hairs have the least holding them down.
    lands[b] = hashedRandom(b * 4.7, 13) ** 1.6 * ragged * 0.1;
    lifts[b] = hashedRandom(b * 6.1, 29) ** 1.4 * ragged * (0.16 + edge * 0.34);
  }
  return { count, lane, across, dryEdge, skipRun, lands, lifts };
}

/** One bristle's run, streamed into the current path.
 *
 *  Curved through the midpoints — the same smoothing the freehand painter uses,
 *  and for the same reason: an offset polyline has a corner at every sample. A
 *  run of one point is dropped rather than drawn, so a hair that touches down
 *  for a single sample leaves no dot.
 *
 *  It is a little state machine rather than an array because a hair crosses
 *  hundreds of samples and there are up to sixteen of them per stroke: the
 *  points are used once, in order, and never looked at again.
 *
 *  It counts the runs it commits, too, so a caller painting one hair in several
 *  passes can skip the passes the hair was off the paper for entirely — which
 *  is most of them once the paint has gone (see `residue.ts`). */
export function openStrand() {
  // The last point emitted into the path, held back one step so the curve
  // through it can be aimed at the midpoint of the next.
  let heldX = 0;
  let heldY = 0;
  let seen = 0;
  let runs = 0;
  return {
    to(ctx: CanvasRenderingContext2D, x: number, y: number): void {
      if (seen === 0) {
        heldX = x;
        heldY = y;
        seen = 1;
        return;
      }
      if (seen === 1) {
        ctx.moveTo(heldX, heldY);
      } else {
        ctx.quadraticCurveTo(heldX, heldY, (heldX + x) / 2, (heldY + y) / 2);
      }
      heldX = x;
      heldY = y;
      seen++;
    },
    /** End the run — the hair has left the paper, or the stroke has. */
    lift(ctx: CanvasRenderingContext2D): void {
      if (seen > 1) {
        ctx.lineTo(heldX, heldY);
        runs++;
      }
      seen = 0;
    },
    /** How many runs have gone into the path — 0 if there is nothing to
     *  stroke. */
    marks(): number {
      return runs;
    },
  };
}
