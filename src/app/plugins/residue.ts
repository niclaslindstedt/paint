// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The trail a spent head leaves: what comes off the hairs after the paint.
//
// `bristle.ts` paints the charge — the slab of colour a dipped head lays down,
// scratched through with the partings between its hairs, giving out through the
// marked dry stretch at the end of its run. This module paints what happens
// next, and on paper it is most of the length of a long stroke.
//
// A brush does not stop when it stops covering. The load proper goes, and what
// is left is the paint still wetting the filaments themselves: a film far too
// thin to close a mark and far from nothing. Carry the stroke on and it keeps
// coming off for about as far again (see `RESIDUE_RUN`) — pale, thin, broken
// all over, and fading the whole way — until there is genuinely nothing left.
// That trail is what a dry-brush scumble is made of, it is why a stroke you
// pushed too far ends in a ghost of itself instead of at an edge, and it is the
// reason a real brush tells you it wants dipping long before it goes silent.
//
// Three things separate it from the charged run, and they are the three things
// a thinning deposit does:
//
//   - it is **paler**. This and the wick are the only passes in a brushed mark
//     drawn at less than the stroke's own opacity, and both for the same
//     reason: they are not the mark, they are the thinner deposit at the edge
//     of it. Paint that no longer covers is paint you can see the paper
//     through. The fade is drawn as a run of bands rather than per sample,
//     because a canvas has one alpha per stroke and a hair is one path;
//   - it is **thinner**. The film wets the filament and no longer bridges to
//     the next one, so what lands is nearer the hair's own width than the wet
//     mark's;
//   - it is **mostly gaps**, and more of them as it goes. Half the trail is
//     bare paper where it parts company with the paint, and all of it by the
//     end. That, rather than the alpha, is what makes the trail *vanish*: it
//     comes apart into fewer and shorter scratches until the last of them is
//     behind you.
//
// Everything about the head itself — which hair is where, which gives out
// first, where each one landed — comes in from `strand.ts` already settled, so
// the trail is the same head as the charged run rather than a second brush
// drawn over the first.

import { driftWalk, smoothstep, type Trace } from "./grain.ts";
import {
  FILM_FROM,
  FILM_TO,
  TWIST_STRAY,
  WANDER_STRAY,
  type HeadFit,
} from "./head.ts";
import { openStrand, type HeadHairs } from "./strand.ts";

/** How much of the stroke's own ink the film carries where it is strongest —
 *  the moment the paint proper runs out.
 *
 *  Around half: enough that the trail reads as the same colour thinly laid
 *  rather than as a grey, and light enough that it can never be mistaken for
 *  the mark. It falls from here to nothing across the trail. */
export const RESIDUE_INK = 0.55;

/** How many steps the fade is drawn in.
 *
 *  A canvas has one alpha per stroke, so a continuous fade would mean a stroke
 *  per sample. Six bands over a trail that is already broken into scratches is
 *  under a tenth of the stroke's opacity between one and the next, which is
 *  well inside what the gaps hide — and the bands overlap by a sample, so no
 *  seam runs across the mark where one hands over to the next. */
const RESIDUE_BANDS = 6;

/** How much of the trail is bare paper right where the paint gives out.
 *
 *  Half, so the film arrives already broken — a deposit that covered would be
 *  paint, and the whole point of this phase is that the paint has gone. From
 *  here it climbs to all of it. */
const RESIDUE_BREAK = 0.5;

/** Everything the trail needs: the path, the head that is travelling it, and
 *  the stretch of it the paint has already given out over. */
export type ResidueTrail = {
  ctx: CanvasRenderingContext2D;
  /** The stroke's own opacity — what the charged run was painted at, and what
   *  every band below is a fraction of. */
  alpha: number;
  along: readonly Trace[];
  /** The direction across the stroke at each sample, and how much of its full
   *  width the mark has there — both as the charged run read them. */
  nxs: Float64Array;
  nys: Float64Array;
  widths: Float64Array;
  /** How much film is left at each sample (see `residueAt`), and how much paint
   *  proper — the trail is handed the last stretch of the charge as well, and
   *  eases itself in across it (see `FILM_FROM`). */
  residues: Float64Array;
  loads: Float64Array;
  /** The paper under each sample, on the same reading the hairs lifted over. */
  teeth: Float64Array;
  fit: HeadFit;
  hairs: HeadHairs;
  half: number;
  worn: number;
  /** How much of the medium's texture a head this narrow can show at all. */
  grainShare: number;
  /** How long the mark is, so a hair can be cut short of its far end. */
  total: number;
  /** Which samples the caller is keeping any ink from, or `null` for all of
   *  them (see `visibleAlong` in `bristle.ts`). */
  shown: Uint8Array | null;
  /** The whole trail: the sample it starts coming through at, and the one past
   *  which there is no film left.
   *
   *  Deliberately the *whole* one rather than the part being painted. The fade
   *  is drawn in bands, and where those bands fall has to be a property of the
   *  mark and not of what a caller asked to repaint — cut them to the patch and
   *  a pan would paint a strip of trail at the wrong step of the fade, which is
   *  a seam down the middle of the mark where two patches meet. */
  from: number;
  to: number;
  /** …and the part of it worth walking, which is what the patch decides. */
  visibleFrom: number;
  visibleTo: number;
};

/** Paint the trail. Nothing happens if the head still has paint everywhere the
 *  caller can see, which is every stroke short enough to have been drawn with
 *  one dip — the common case, and it costs one comparison. */
export function paintResidue(trail: ResidueTrail): void {
  const { ctx, along, fit, hairs, residues, from, to } = trail;
  if (from > to || trail.visibleFrom > trail.visibleTo) return;
  // The same three drifts the charged run reads, seeded the same way, so a hair
  // carries on wandering from where the paint left it rather than jumping.
  const dry = driftWalk();
  const drift = driftWalk();
  const twisting = driftWalk();
  twisting.reset(7);
  // The bands overlap by their end samples: a band that stopped one sample
  // short of the next would put the same break across every hair at the same
  // place, which is a rung of a ladder rather than a fading mark.
  const span = Math.max(1, Math.ceil((to - from) / RESIDUE_BANDS));

  for (let b = 0; b < hairs.count; b++) {
    dry.reset(b + 91);
    drift.reset(b);
    const skipRun = hairs.skipRun[b]!;
    const dryEdge = hairs.dryEdge[b]!;
    const across = hairs.across[b]!;
    const lane = hairs.lane[b]!;
    const lifts = hairs.lifts[b]!;
    for (let start = from; start <= to; start += span) {
      const end = Math.min(to, start + span);
      // How much film is left over this band, read at its middle — so the run
      // of bands is an even fade rather than a stack of steps that begins full
      // and ends abruptly.
      const left = residues[(start + end) >> 1]!;
      if (left <= 0) break;
      // The band's own extent decides the fade; the patch decides how much of
      // it is worth walking. A band that lies entirely off screen is skipped
      // whole, and one that straddles the edge is walked from where the patch
      // starts — either way what lands inside the patch is what a full repaint
      // would have put there.
      const lo = Math.max(start, trail.visibleFrom);
      const hi = Math.min(end, trail.visibleTo);
      if (lo > hi) continue;
      // How this band goes down, settled before the path is built rather than
      // just before it is stroked: the ink is the film's own strength here, and
      // the pen is nearer the filament's own width than the wet mark's, because
      // a film wets the hair and no longer bridges it to its neighbour.
      ctx.globalAlpha = trail.alpha * RESIDUE_INK * left;
      ctx.lineWidth = Math.max(0.5, fit.pens[b]! * (0.3 + 0.35 * left));
      ctx.beginPath();
      const strand = openStrand();
      for (let i = lo; i <= hi; i++) {
        const p = along[i]!;
        if (trail.shown && !trail.shown[i]) {
          strand.lift(ctx);
          continue;
        }
        // Past the far end of this hair: the head has already rolled off.
        if (p.at > trail.total - lifts) {
          strand.lift(ctx);
          continue;
        }
        // How much of the mark here is the film's to make: none of it while
        // there is still paint covering, all of it once the charge has given
        // out. Eased across the handover rather than switched, or every hair
        // would come in at the same sample and the trail would start with a
        // ruled edge across the mark.
        const took = 1 - smoothstep(FILM_TO, FILM_FROM, trail.loads[i]!);
        // …and how broken it is. Half paper where the paint gave out, all of it
        // by the time the film has gone — and on top of that the same two
        // things that break the charged run: the hairs at the edge of the head,
        // which carry the least and give out first, and the paper's own tooth,
        // which lifts the whole head at once for a moment and so puts the
        // breaks *across* the trail rather than only along it.
        const dryness =
          RESIDUE_BREAK +
          (1 - RESIDUE_BREAK) * (1 - took) +
          (1 - left) * (1 - RESIDUE_BREAK) +
          dryEdge * 0.5 * trail.grainShare +
          (0.5 - trail.teeth[i]!) * 0.25;
        if (dry.at(p.at / skipRun) < dryness) {
          strand.lift(ctx);
          continue;
        }
        const twist =
          (twisting.at((p.at + lane * 25) / 150) - 0.5) * TWIST_STRAY * 2;
        const wander =
          (drift.at(p.at / 90) - 0.5) *
          fit.gap *
          WANDER_STRAY *
          (0.5 + trail.worn * 0.5);
        const offset =
          (across + twist) * trail.half * trail.widths[i]! + wander;
        strand.to(
          ctx,
          p.x + trail.nxs[i]! * offset,
          p.y + trail.nys[i]! * offset,
        );
      }
      strand.lift(ctx);
      // Most bands of most hairs are nothing at all by now — that is what a
      // trail coming apart *is* — so the stroke is only paid for where the hair
      // actually touched the paper.
      if (strand.marks() === 0) continue;
      ctx.stroke();
    }
  }
}
