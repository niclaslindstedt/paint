// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the head leaves where it lands, where it lifts, and where it is simply
// pressed onto the paper.
//
// The one part of the paintbrush that is about a *shape* rather than about a
// path. `bristleWalk.ts` presses the head's cross-section along the stroke,
// and that is a complete account of the middle of a mark and of nothing else:
// a walk that stops at its last point cuts the mark off square across the full
// width of the head, which is the mark a chisel leaves and the mark this
// engine used to leave for every head there is.
//
// So this is the rest of it — the print of the head itself. It is why a round
// ends round and a flat ends square, why a tap is the mark of a bundle of hair
// rather than a filled disc, and why the two ends of one stroke look nothing
// like each other.

import { press, type BristleField, type HeadPress } from "./bristleField.ts";
import type { Trace } from "./grain.ts";
import {
  BASE_FILM,
  LIFT_FADE,
  TIP_LUMPS,
  TIP_SOFT,
  TIP_WOBBLE,
  TOUCH_BEAD,
  combOver,
  paintDryness,
  paintFlow,
  printOf,
  spanOf,
  type Pen,
} from "./bristleHead.ts";

/** How an end of a mark is shaped — everything that separates the head coming
 *  *down* from the head coming *up* (see "The two ends of a mark are not the
 *  same mark"). Built once per end rather than per touch, which is what keeps
 *  it a record instead of five more arguments. */
export type EndShape = {
  /** +1 for the end the hand is travelling towards, −1 for the one it came
   *  from. */
  forward: number;
  /** How far each hair reaches past the last point, as a share of the head's
   *  own footprint: `tips` where it lands, `draws` where it lifts. */
  reaches: Float64Array;
  /** How much of the film is still going down at the far end of that. */
  fade: number;
  /** Whether the section through the point itself is this half's to lay —
   *  false at the end of a drag, where the walk has already laid it, and true
   *  for one half of a press, which is nothing *but* two halves of a print
   *  (see `dab`). */
  centre: boolean;
};

/** Lay what the head leaves past the end of a drag: the print it stamps coming
 *  down, or the fan of hair ends it draws out going up.
 *
 *  **This is what an end of a brushed mark *is*.** A walk that lays
 *  cross-sections and stops at its last point cuts the mark off square across
 *  the full width of the head — the mark a chisel leaves, and the mark this
 *  engine left for every head there is, which is most of why a round drew a
 *  flat's stroke. A brush does not stop like that: the head is a shape, and
 *  where the hand stops, that shape is what the paper has on it.
 *
 *  Which shape comes out of the same projection as everything else, so nothing
 *  here knows a round from a flat: the head reaches `projected` along the path
 *  as well as across it, and that reach is the *whole* half-width for a cone —
 *  an end as deep as the mark is wide — against a fourteenth of it for a blade
 *  pulled square across itself, which is the crisp square cut a one-stroke
 *  flat is bought for.
 *
 *  Both ends are laid as sections stepping out along the path, narrowing with
 *  the chord of the footprint; what differs is how far each *lane* is still
 *  down (`EndShape.reaches`) and how much film it is still laying, and that is
 *  the whole difference between a stamped edge and a drawn-out flick. */
export function capAt(
  field: BristleField,
  pen: Pen,
  p: Trace,
  nx: number,
  ny: number,
  end: EndShape,
  down: number,
  film: number,
  dry: number,
  head: HeadPress,
  log?: number[],
): void {
  // The unit tangent, from the normal the caller already has.
  const tx = ny * end.forward;
  const ty = -nx * end.forward;
  // The head's own footprint against that direction (see `printOf`): how far
  // it stands out past the last touch, how wide it lays across the path, how
  // far its far tip **leans off** the path — which is the whole of what the
  // blade's angle does to an end — and how wide its slices are. All of it
  // scaled by how much of the bundle is actually on the paper here (see
  // `bearingDown`): the print at a swept touch-down is the print of *what
  // landed*, which is part of a head and not a disc the width of the ferrule.
  const print = printOf(pen, tx, ty, nx, ny);
  const reach = print.reach * down;
  const w = print.across * down;
  if (reach < field.cell || w < field.cell * 0.5) return;
  const steps = Math.max(1, Math.ceil(reach / pen.spacing));
  const step = reach / steps;
  // The comb this end is cut out of, kept aside: each step of the walk writes
  // the hairs that are still down into `head.comb`, and it must not eat the
  // comb it is reading.
  const rim = pen.rim;
  rim.set(head.comb);
  for (let k = end.centre ? 0 : 1; k <= steps; k++) {
    const out = k / steps;
    // How far round the footprint this step stands, so the outline wobbles on
    // one walk rather than per step.
    const round = Math.asin(Math.min(1, out)) / Math.PI;
    // How far the *hairs* are still down here. Every lane stops at its own
    // reach and thins over the last of it — a hair is on its point there, not
    // on its side — so what the end shows is strands rather than a drawn
    // curve: a fringe where the head came down, a fan where it lifted.
    let reaching = 0;
    for (let b = 0; b < pen.hairs; b++) {
      const left = end.reaches[b]! - out;
      head.comb[b] =
        left <= 0 ? 0 : rim[b]! * (left >= TIP_SOFT ? 1 : left / TIP_SOFT);
      if (head.comb[b]! > 0) reaching = 1;
    }
    if (reaching === 0) break;
    // How far the print still reaches to either side this far past the end,
    // and how far off the path that stands (see `spanOf`) — everything of it
    // from here out, since the head passed over this place carrying the rest
    // of the footprint with it. A round and a square-on flat come out the
    // centred taper they always were; an oblique blade comes out the slant it
    // is held at.
    const span = spanOf(print, out, 1);
    const off = span.mid * down;
    // A bundle of hair is not turned on a lathe: the outline swells and
    // pinches by a few percent as it goes round.
    const across =
      span.half *
      down *
      (1 + (pen.tipWalk.at(round * TIP_LUMPS) - 0.5) * TIP_WOBBLE * 2);
    if (across < field.cell * 0.5) continue;
    press(
      field,
      p.x + tx * out * reach + nx * off,
      p.y + ty * out * reach + ny * off,
      nx * across,
      ny * across,
      film * (1 - (1 - end.fade) * out),
      dry,
      step,
      head,
      log,
    );
  }
  // …and the comb handed back the way it was found, so a caller that presses
  // the section as well as the end reads the head and not its own rim.
  head.comb.set(rim);
}

/** The head coming down: its whole footprint, a fringe of tips all round it,
 *  and every hair laying what it is laying. */
export function landing(pen: Pen, forward: number, centre: boolean): EndShape {
  return { forward, reaches: pen.tips, fade: 1, centre };
}

/** The head coming up off a drag: shorter, tapered to the middle, ragged, and
 *  thinning as the hairs leave (see `LIFT_DRAW`). */
export function lifting(pen: Pen): EndShape {
  return { forward: 1, reaches: pen.draws, fade: LIFT_FADE, centre: false };
}

/** A press and a lift with no drag: the print of the head — a disc for a
 *  round, the blade's bar for a flat, and the ellipse between for everything
 *  between.
 *
 *  It is the two halves of the same print a drag's two ends get (see `capAt`),
 *  laid about the blade rather than about a direction of travel a press does
 *  not have — which is what makes a tap and the touch-down of a stroke the
 *  same mark, and it is the whole reason they are one function. A tap used to
 *  be its own geometry, and it showed: a **filled disc**, with a drawn rim and
 *  not one hair in it, on the one tool whose character is that it is a bundle
 *  of hair.
 *
 *  What it prints instead is the head: the hairs that are down at this load
 *  and the partings between them, softening off the rim where a cone curves
 *  away from the paper, ragged on the sheet's own grain. */
export function dab(
  field: BristleField,
  pen: Pen,
  at: Trace,
  down: number,
  log?: number[],
): void {
  const film =
    BASE_FILM *
    (1 + TOUCH_BEAD * Math.min(1.3, pen.load)) *
    paintFlow(pen.load);
  const dry = paintDryness(pen.load);
  const head = combOver(pen, 0, at.speed, dry);
  // Laid across the blade: the section through the middle of the print runs
  // the full width of the ferrule, and the print rolls out either side of it
  // over the blade's own thickness. A round has no blade and comes out the
  // disc it is whichever axis this picks.
  const nx = pen.bladeX;
  const ny = pen.bladeY;
  // A head *placed* on the paper prints all of itself; one still sweeping in
  // when the gesture was cut this short prints what landed, exactly as the
  // touch-down of a drag does — so the mark does not jump when a flick grows
  // long enough to be a drag (see `bearingDown`).
  capAt(
    field,
    pen,
    at,
    nx,
    ny,
    landing(pen, 1, true),
    down,
    film,
    dry,
    head,
    log,
  );
  capAt(
    field,
    pen,
    at,
    nx,
    ny,
    landing(pen, -1, false),
    down,
    film,
    dry,
    head,
    log,
  );
}
