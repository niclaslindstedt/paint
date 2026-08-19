// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What is on the end of the handle, and how hard it is bearing.
//
// The paintbrush's own `head.ts`: everything about the head that is settled
// before a stroke starts and read at every touch of one — what one dip holds,
// what the bundle breaks into, which hairs are down at a given distance along
// a drag, and how much of the head the hand actually has on the paper.
// Nothing in it knows about a whole gesture: `bristleWalk.ts` drags it,
// `bristlePrint.ts` is what it leaves at the two ends of a mark, and
// `bristleSim.ts` is the seam the app paints through.
//
// Every number here is a claim about a brush, written in document pixels, and
// every one of them can be held to without painting a mark — which is what the
// tests and the tuning harnesses do.

import type { GroundProfile } from "../ground.ts";
import type { Point } from "../types.ts";
import { mm } from "../units.ts";
import type { HeadPress } from "./bristleField.ts";
import {
  driftWalk,
  hashedRandom,
  smoothstep,
  type DriftWalk,
  type Trace,
} from "./grain.ts";
import { BLADE, hairLayout } from "./head.ts";

/** How much page to leave round a mark, in cells: the feather's two, the line
 *  gain, and one of slack. */
export const MARGIN_CELLS = 4;

/** How much optical density one unit of paint film is worth — the number
 *  that makes this medium *body paint* where the quill's 0.55 is ink: one
 *  honest pass reads nearly opaque, a thinned or starved passage shades, and
 *  a crossing barely deepens. It has to stay short of full saturation or the
 *  streaks the comb scratches through the slab would have nothing to show. */
export const PAINT_DENSITY = 2.1;

/** How readily this medium wicks into a thirsty sheet — the feather's
 *  strength: the same wetness the brush declares on its descriptor
 *  (`wetness: 0.6`), read the same way. */
export const BRUSH_WETNESS = 0.6;

/** How much a thirsty sheet drinks out of the reservoir as the head travels —
 *  smaller than the pen's, because paint is thick and gives its medium up
 *  slowly. */
const DRINK = 0.35;

/** The run one dip buys, in document pixels: a floor so a liner is not spent
 *  in a centimetre, plus so much per pixel of head — the same charge the
 *  vector painter spends (`capacityOf`), kept in step so a mark that falls
 *  back runs dry where the field would have. */
const CHARGE_FLOOR = mm(9);
const CHARGE_RUN = 10.5;

/** What a chisel ferrule leaves of the round's reservoir: a flat lays a wider
 *  mark off a shallower store, so a full flat runs about half as far as the
 *  round on the same dip (see `reservoirOf` in `head.ts`, whose number this
 *  is). */
const FLAT_RESERVOIR = 0.5;

/** How far past its last paint the head keeps marking, as a multiple of the
 *  charge it just spent, and how thick that film of residue starts: the
 *  trail every reference stroke peters out through. */
const RESIDUE_RUN = 1;
export const RESIDUE_FILM = 0.3;

/** The film one touch of a fully fed, unhurried head aims to leave. */
export const BASE_FILM = 1;

/** How the hand's speed moves the film. Paint shades far less than ink — a
 *  fast drag thins and skips a little rather than paling to a wash — so the
 *  span is modest and the floor high. */
export const SPEED_SCALE = 14;
export const SPEED_SHARP = 1.5;
export const SPEED_SPAN = 0.4;
export const THIN_FAST = 0.66;

/** The heavier deposit where a charged head first touches down, and how far
 *  into the stroke it carries (in head widths). A press, not the pen's bead:
 *  paint blobs less than ink pools. */
export const TOUCH_BEAD = 0.3;
const TOUCH_REACH = 0.6;

/** How far back from the lift the head thins as it rolls off, as a share of
 *  the head — the window the end of a drag still reaches back through.
 *
 *  It used to be a third of a head, with a matching one at the touch-down, and
 *  the two of them carried the whole *shape* of the two ends: each hair was
 *  simply switched off until the drag had run its own landing distance. That
 *  is not what the ends of a brushed mark are. It cut a notch of bare paper
 *  between the blot the head printed coming down and the body of the stroke,
 *  it drew a bright seam across the mark where the last hair arrived — every
 *  hair in the head landing inside a tenth of a head-width is a *line* — and
 *  on a stroke shorter than the window it was the whole mark, which is how a
 *  press that moved two pixels came out as nothing at all.
 *
 *  The raggedness of a cut bundle lives on the rim of the print the head does
 *  leave (`tips`), and the fray of a lift lives in the fan of bent-back hairs
 *  past it (`draws`). What is left here is the *hand*: the pressure coming off
 *  over the last stretch of the stroke, which is the long taper a lifted mark
 *  ends in and the reason it ends in a fan rather than at an edge. Nearly half
 *  a head, because that is what the photograph measures — an end that narrows
 *  over a few pixels reads as a cut. */
const LIFT_SHARE = 0.45;

/** How much shorter than the head the outermost hair of a bundle can be —
 *  what makes the rim of a print a *fringe* rather than a drawn circle.
 *
 *  A brush is a bundle of hair in a metal collar and the hairs are not cut to
 *  a common length: press one on paper and the blot it leaves has a ragged
 *  edge you can see the strands in. The print used to be a filled ellipse with
 *  a geometric rim, on the one tool whose whole character is that it is made
 *  of hair. */
const TIP_FRAY = 0.22;

// --- The two ends of a mark are not the same mark -----------------------------
//
// From a photograph of a real one — a loaded round, one sweep, left to right,
// and the direction is legible in the paint: the left end is the deepest colour
// on the sheet and the mark pales the whole way across as the dip is spent.
// **The two ends of it look nothing like each other, and neither of them is the
// head's own print stamped on the paper.**
//
// It *begins* blunt and full-strength — the head is put down and pulled away —
// but not as a disc. Only part of the bundle takes the sheet at the touch-down,
// so the first stretch is ragged and a little short of the full width, and the
// mark opens to the ferrule within a fraction of a head. Stamping the whole
// footprint there is the one shape that reads wrong: a circle the diameter of
// the brush, at the head of a mark it is wider than.
//
// It *ends* drawn out. Two things happen at once at a lift and they pull the
// same way: the hand releases the pressure over the last stretch, so the band
// narrows, and every hair in the bundle is by then bent backwards along the
// stroke and comes off the sheet still bent — so the mark does not close with an
// edge at all. It frays into a fan of trailing hair ends, thinning and paling,
// which in the photograph runs for several head-widths past anything you would
// call the end of the stroke.
//
// So the two ends read the same head through different numbers: the entry
// through `ENTRY_*`, which is a ramp along the stroke rather than a print at
// all, and the lift through `draws` and the lift window.

/** How far a lifted head draws out past the last point, as a share of the
 *  print it would have stamped coming down. */
export const LIFT_DRAW = 0.75;

/** How much further the middle of the head carries than its sides, going up —
 *  the taper of the fan. The hairs in the middle of a bundle are the ones
 *  bearing hardest, so they are the last to leave the paper. */
const LIFT_TAPER = 1.6;

/** How much of the film is still going down at the far end of that. The hairs
 *  are leaving, so the last of a lifted stroke is thin. */
export const LIFT_FADE = 0.35;

// --- How the hand leaves the paper -------------------------------------------
//
// The other half of why every mark ended the same way. A lift is not one event
// a brush has: a hand that *stops* and then picks the head up leaves a blunt,
// full end — the head is standing still on the paper while the pressure comes
// off, so the fan is short, broad and dark. A hand still travelling when the
// head leaves — a flick — is the opposite at every one of those: the bundle
// rolls up onto its bent-back tips over a longer stretch, only the middle
// hairs are still bearing by the end of it, and what they leave is pale.
//
// So the speed at the last touch is read once per walk and shapes the end. It
// may only be read *inside* the lift window, which is provisional to the last
// frame of the gesture (see `advanceDrag`) — a settled touch cannot feel how
// the stroke it is part of eventually ended, or a mark would change behind the
// hand.

/** How fast the hand has to be leaving for the lift to be a flick rather than
 *  a stop, in document pixels a sample — a device term like `ENTRY_SWEEP`,
 *  and deliberately on the same scale as it: a stored sample gap is the gap
 *  the *hardware* reported, so a term read off one has to be a threshold the
 *  two ends of a mark agree about rather than a number tuned alone. */
const LIFT_FLICK = 30;

/** How far the fan runs past the last point at a stop and at a flick, as a
 *  multiple of what the head has pressed there — the head is coming off the
 *  paper either way, so the *width* follows the pressure, and this is how far
 *  the hair ends go on trailing past it. A stopped head leaves a stub about a
 *  third of itself; a flicked one lays its bent-back tips out over the better
 *  part of a head-width. */
export const FAN_STOP = 0.8;
export const FAN_FLICK = 3;

/** …and how much more sharply a flick tapers the fan to the middle of the
 *  head: a stopped head leaves the stub at the bundle's whole width, a flicked
 *  one at the few hairs still bearing by then. */
export const FAN_POINT = 0.8;

/** How much of the film the end is still laying, and how much of the head is
 *  still down through the lift window, at a stop against a flick. */
export const FAN_FADE = 1.6;
export const FAN_FILM = 0.84;
export const FAN_FILM_FLICK = 0.18;
const FAN_DOWN = 0.54;
const FAN_DOWN_FLICK = 0.2;

/** How much of the way to a flick this lift is, 0 (stopped) to 1. Read off the
 *  hand's speed at the last touch, and nothing else. */
export function liftFlick(speed: number): number {
  return Math.min(1, Math.max(0, speed) / LIFT_FLICK);
}

/** How far into a stroke the head has fully landed, as a share of its own
 *  width, and how much of it is down at the very first touch.
 *
 *  Short and not very deep: the photograph's entry is *blunt*, and what this
 *  is for is stopping the mark from opening with a stamped circle wider than
 *  the stroke it starts. Measured along the stroke rather than in time, so it
 *  does not depend on how fast the sample rate happened to be.
 *
 *  Every one of the four is a *middle*, spread per stroke (see `markSeed`):
 *  no two touch-downs of a real brush are the same touch-down, and the one
 *  that is the same every time reads as a stamp — which is what the little
 *  circle at the head of every mark this engine drew actually was. */
const ENTRY_RUN = 0.5;
const ENTRY_RUN_SPREAD = 0.5;
const ENTRY_LEAST = 0.4;
const ENTRY_LEAST_SPREAD = 0.32;

/** …and how fast the hand has to be moving for it to be an entry at all.
 *
 *  A head put down *on the spot* and then dragged away has landed before it
 *  travels — that is a press, and its mark starts at the full width of the
 *  print it made (which is the tap this tool draws for a touch with no drag at
 *  all). A head swept onto the paper has not. One number reads the difference
 *  off the samples the canvas already stores, which is what keeps the two
 *  cases from being two different marks with a seam between them. */
const ENTRY_SWEEP = 13;
const ENTRY_SWEEP_SPREAD = 0.3;

/** How the width comes on over that run. A square root opens fast and then
 *  crawls, which is exactly the shape that reads as a blob with a stroke
 *  coming out of it; nearer linear, and spread per stroke, the head *widens*
 *  into the mark instead of being stamped and then extended. */
const ENTRY_EASE = 0.8;
const ENTRY_EASE_SPREAD = 0.3;

/** How far the head stands off the path where it lands, as a share of its own
 *  half-width.
 *
 *  A bundle swept onto paper does not come down square on the line the hand
 *  drew: it takes the sheet with one side of itself and rolls onto the rest as
 *  it opens, so the first stretch of the mark stands a little off the path and
 *  settles onto it. Which side, and how far, is the stroke's own (see
 *  `markSeed`) — and it is most of what stops a touch-down from being the
 *  head's own print, centred, again. */
const ENTRY_LEAN = 0.34;

/** How far a head splays under the hand, and how much of that a blade gives.
 *
 *  The pressure dial's whole geometry (see `BEARING` in `builtin/dials.ts`).
 *  A round is a *cone*: touch it to the paper and only the point is down, lean
 *  on it and the belly goes down too, so the mark runs from a rigger's
 *  hairline to something half again as wide as the ferrule — which is the one
 *  thing a round brush is bought for, and the stroke every leaf and petal in
 *  watercolour is made of. A blade has no belly to put down: the metal collar
 *  holds the hairs at their width and pressing one mostly presses it *into*
 *  the paper, so it gives about a third as much.
 *
 *  It is the one thing here allowed to take the mark **past the number on the
 *  size button**, and deliberately: every other width term only ever takes
 *  width away (see `SWELL`), because a brush cannot measure wider than its own
 *  ferrule — but a hand can spread the hairs *out* of the ferrule, and that is
 *  what pressing is. The button is the width this head lays at an ordinary
 *  hand, not the widest mark it can make. */
const SPLAY = 0.55;
const BLADE_GIVE = 0.3;

/** …and how far the dial is read, whatever a document hands over. The panel
 *  clamps to the dial's own range; a stroke carries whatever it was written
 *  with, and a splay that reached zero would be a mark with no width at all. */
const LEAST_PRESS = 0.1;
const MOST_PRESS = 3;

/** How much of a mark pressing on it *disorders*, past the width — the second
 *  half of the dial, and the half a wider brush is not.
 *
 *  A head bearing down is a bundle out of its own shape: the hairs are bent
 *  under the ferrule rather than gathered by it, so they clump instead of
 *  combing, the partings between the clumps stay open instead of the film
 *  closing them, the outermost hairs skate over the sheet rather than laying
 *  on it, the bundle rolls further as it is dragged, and the width pulses
 *  where an ordinary hand's is nearly parallel. Every one of those is a term
 *  that already exists below — the pressure only leans on them — and every one
 *  of them is gated on the same `give`, because it is the cone that buckles
 *  and the blade that does not.
 *
 *  Under an ordinary hand (`press < 1`) they run the other way: a brush held
 *  on its point is the *tidiest* mark this tool makes. */
const CLUMP_PRESS = 1.2;
const CLUMP_MID = 0.9;
const OPEN_PRESS = 0.6;
const EDGE_PRESS = 1;
const SWELL_PRESS = 1.3;
const TWIST_PRESS = 1.5;
const TWIST_CHATTER = 0.5;
const FRAY_PRESS = 1;

/** How far the width of the mark pinches as the head travels, and over how
 *  much of it — the wander of a hand and a bundle of hair that photographs as
 *  a band with no two sides parallel. It is the difference between a stroke
 *  and an extrusion.
 *
 *  It only ever takes width *away*, which is the same rule the vector painter
 *  budgets its strays under: the ferrule is the width of the ferrule, so a
 *  swell that reached past it would be a brush that measures wider than it is.
 *  The one thing that may reach past it is the hand — see `SPLAY`, which is a
 *  bundle spread *out* of the ferrule rather than a wander inside it. */
const SWELL = 0.13;
const SWELL_RUN = 1.1;

/** How much of its own reach a hair takes to come off the paper as the head
 *  rolls onto its tip — a strand leaves over the last of its length rather
 *  than at a line, which is what keeps the fringe from being a row of cut
 *  wires. */
export const TIP_SOFT = 0.16;

/** How far the outline of a print swells and pinches as it goes round, and
 *  over how many swings — a bundle of hair is not turned on a lathe, and a
 *  circle drawn to the pixel is the one thing a pressed brush never leaves. */
export const TIP_WOBBLE = 0.05;
export const TIP_LUMPS = 7;

/** How much this head gives under the hand: the whole of it for the round's
 *  cone, `BLADE_GIVE` of it for the chisel the collar holds square (see
 *  `SPLAY`). Everything the pressure reaches is scaled by it, which is what
 *  makes the dial the round brush's dial. */
function giveOf(flat: number): number {
  return 1 - flat * (1 - BLADE_GIVE);
}

/** How much wider than its ferrule this head lays at this pressure — the
 *  footprint's own scale, and the whole of what the dial does to the mark's
 *  width (see `SPLAY`).
 *
 *  Exported because the bounds have to know it before there is a head: a mark
 *  is simulated inside a box opened around the path, and a box drawn for the
 *  ferrule clips a pressed stroke's edges off (see `reachOf` in
 *  `bristleSim.ts`). */
export function splayOf(press: number, flatness: number): number {
  const flat = Math.max(0, Math.min(1, flatness));
  return 1 + SPLAY * giveOf(flat) * (pressOf(press) - 1);
}

/** …and how far out of its own shape it is at that pressure, signed: positive
 *  is a bundle bearing down and coming apart, negative is one held on its
 *  point and gathered (see `CLUMP_PRESS`). */
function chaosOf(press: number, flatness: number): number {
  const flat = Math.max(0, Math.min(1, flatness));
  return giveOf(flat) * (pressOf(press) - 1);
}

/** The dial as the head may read it (see `LEAST_PRESS`). */
function pressOf(press: number): number {
  if (!Number.isFinite(press)) return 1;
  return Math.max(LEAST_PRESS, Math.min(MOST_PRESS, press));
}

/** How elliptical a head's footprint is across the path — 1 for the round's
 *  cone, 0 for the chisel that cuts its bundle off square (see `bearing` in
 *  `bristleField.ts`, which is where the number does its work). It is the
 *  flatness dial and nothing else: the same one projection that decides how
 *  wide the head lays also decides whether the sides of the band are ruled. */
function domeOf(flat: number): number {
  return 1 - flat;
}

/** How far the bundle twists out of its lanes, as a share of the half-width,
 *  and over how many document pixels of travel one swing of that takes.
 *
 *  A head is not a comb bolted to the handle. It rolls a little as it is
 *  dragged, and the whole bundle goes together — so the partings between the
 *  clumps *wander* down the length of a mark instead of ruling it with a set
 *  of dead-straight rails, which is the other half of why a brushed stroke
 *  never looks extruded. Small, and slow: the hairs stay in their own order
 *  and neighbours stay neighbours (the vector painter's `TWIST_STRAY`, whose
 *  reasoning this is). */
const TWIST_STRAY = 0.13;
const TWIST_RUN = 150;

/** How much of a hair's film the lane it left still gets while the head is
 *  charged — **the paint that bridges the hairs**.
 *
 *  A brushed mark is not a bundle of wires laid side by side, and this is the
 *  number that decides which of the two it comes out as. Paint is a liquid with
 *  a body: where a hair lifts off a *loaded* head, the film either side of the
 *  gap runs together over it and closes it, so what the sheet ends up with is
 *  one slab of colour with the hairs' streaks scratched **through** it. Give a
 *  lifted lane bare paper instead and every parting is a full-strength white
 *  rail from one end of the stroke to the other, and the mark reads as a rope
 *  of separate ribbons — which is what it did.
 *
 *  It goes with the paint, twice over: with the *head*, because a gathered wet
 *  bundle has the film to bridge with and a splayed dry one has not, and with
 *  the *reservoir*, because the last stretch of a drag is where a brushed mark
 *  is supposed to come apart into strands. The dry-brush end of the range keeps
 *  every bit of the open comb it had. */
const BRIDGE = 0.3;

/** The paper's grain, in document pixels — the pitch of cold-pressed ridges,
 *  the same number the vector painter reads (`TOOTH` in `bristle.ts`): how
 *  far the head travels before the sheet is a different height under it. */
const TOOTH = mm(1.8);

/** How pale a starved stroke goes when the plain-line fallback has to draw it
 *  — the stand-in for the reservoir, so a low-load stroke does not snap to
 *  full-strength paint when the view is pulled back to a hairline. */
export const FALLBACK_PALE = 0.45;

/** How raw samples' smoothed speeds settle: a sample's speed is averaged over
 *  its two neighbours either side (see `trace`), so it can still move until
 *  two more samples exist beyond it. */
export const SPEED_WINDOW = 2;

/** How much paint is left in the head, 0–1ish, and the two curves everything
 *  downstream reads off it: how freely the paint still comes off the hairs,
 *  and how starved the head presses. Pure and exported for the tests — the
 *  whole "runs dry" picture rests on these two lines. A loaded head
 *  *plateaus*: it covers solidly for most of its run and gives out over the
 *  last stretch, which is why the smoothstep shoulders sit low. */
export function paintFlow(reserve: number): number {
  return 0.12 + 0.88 * smoothstep(0.04, 0.45, reserve);
}

export function paintDryness(reserve: number): number {
  return 1 - smoothstep(0, 0.22, reserve);
}

/** The half-width of the mark where the head crosses the path like this — the
 *  head's footprint projected across the stroke.
 *
 *  `bn` is how much of the blade lies across the path, `bt` how much along
 *  it (the two are cos and sin of one angle), and `minor` how thick the head
 *  is against its blade: 1 for a round, `BLADE` for a full flat. A round
 *  comes out `half` whichever way the path runs; a flat swells to its full
 *  width square across itself and closes to `half × BLADE` along its own
 *  edge — which is the entire reason a sign-writer owns one. Exported for
 *  the tests: this one line is what the flatness dial *is*. */
export function projected(
  half: number,
  minor: number,
  bn: number,
  bt: number,
): number {
  return half * Math.hypot(bn, minor * bt);
}

/** The head's footprint resolved against a direction of travel — the one
 *  place the blade's *angle* becomes a shape rather than a width.
 *
 *  The footprint is an ellipse: `half` along the blade, `half × minor` across
 *  it, turned to wherever the blade is held. Sliced by the lines square to
 *  the path, it gives everything the two ends of a mark are made of:
 *
 *  - `reach`, how far it stands out along the path. A round's is its whole
 *    half-width whichever way it goes; a blade's runs from a fourteenth of
 *    one pulled square across itself to the whole of it dragged along its own
 *    edge — which is why a head cannot carry this as one number, and why the
 *    hand has to travel further before a *flat* has left its own print.
 *  - `across`, the half-width of the band the drag lays (`projected`).
 *  - `lean`, how far the far tip of the print stands **off** the path. A
 *    blade held obliquely leads with one corner, so the end of its stroke is
 *    a slant cut at the angle it is held at rather than a cap square to the
 *    direction of travel. It is zero for a round, whose every slice is
 *    centred on the path, and zero for a blade pulled square across itself —
 *    the two cases the mark used to be right in.
 *  - `chord`, half the print's width where the path leaves it.
 *
 *  A slice at `out` of the reach then runs `out × lean` off the path and
 *  `chord × √(1 − out²)` either side of that — which comes to exactly
 *  `across` at its widest, whichever way the blade is turned (see `capAt`). */
export type Print = {
  reach: number;
  across: number;
  lean: number;
  chord: number;
};

export function printOf(
  pen: Pen,
  tx: number,
  ty: number,
  nx: number,
  ny: number,
): Print {
  // The two axes of the footprint — the blade, and the thickness across it —
  // each projected onto the path's two axes.
  const bt = pen.half * (pen.bladeX * tx + pen.bladeY * ty);
  const et = pen.half * pen.minor * (pen.bladeX * ty - pen.bladeY * tx);
  const bn = pen.half * (pen.bladeX * nx + pen.bladeY * ny);
  const en = pen.half * pen.minor * (pen.bladeX * ny - pen.bladeY * nx);
  const reach = Math.hypot(bt, et);
  const across = Math.hypot(bn, en);
  if (reach <= 0) return { reach: 0, across, lean: 0, chord: across };
  return {
    reach,
    across,
    // The slant and the width of the slices, straight off the ellipse: the
    // covariance of the two projections, and the area they span.
    lean: (bt * bn + et * en) / reach,
    chord: Math.abs(bt * en - et * bn) / reach,
  };
}

/** The mark's cross-section where the swept print is bounded to `from`..`to`
 *  of its own reach, as an offset off the path and a half-width either side —
 *  the interval the head has actually covered there.
 *
 *  Away from both ends the whole print has passed, and this is the band:
 *  centred, `across` either side. Within a print's reach of an end only part
 *  of it has, and for a blade held obliquely that part is **off to one side**:
 *  the leading corner arrives first and the trailing one last, so the mark is
 *  cut off at the angle the blade is held at rather than square across the
 *  direction of travel. A round, and a blade pulled square across itself,
 *  lean nowhere and get the centred taper they always had. */
export function spanOf(
  print: Print,
  from: number,
  to: number,
): { mid: number; half: number } {
  const hi = edgeOf(print, from, to);
  const lo = -edgeOf(print, -to, -from);
  return { mid: (hi + lo) * 0.5, half: (hi - lo) * 0.5 };
}

/** How far the swept print reaches to one side over `from`..`to` of its
 *  reach. One slice stands `u × lean` off the path and `chord × √(1 − u²)`
 *  either side of that, which is widest at `lean / across` — so the answer is
 *  that slice when the range holds it and the nearer end of the range when it
 *  does not. */
function edgeOf(print: Print, from: number, to: number): number {
  const peak = print.across > 0 ? print.lean / print.across : 0;
  const at = peak < from ? from : peak > to ? to : peak;
  return at * print.lean + print.chord * Math.sqrt(Math.max(0, 1 - at * at));
}

/** How far the head's own print reaches along a direction of travel — how far
 *  the hand has to carry it before there is a *drag* to lay rather than a
 *  press that moved (see `drag`). */
export function printReach(pen: Pen, tx: number, ty: number): number {
  return printOf(pen, tx, ty, -ty, tx).reach;
}

// --- The head, fixed for the length of one stroke -----------------------------

/** Which brush this stroke got, as a number every hashed trait of the head is
 *  mixed with.
 *
 *  Everything about a bundle of hair that is not the size on the button — how
 *  thick each strand lays, where the partings fall, how level the cut is, how
 *  it comes down and how it leaves — used to be hashed off the strand's index
 *  alone. That is one brush, for every stroke anyone ever draws with the tool:
 *  the same fringe, the same rails in the same places, and the same little cap
 *  at the head of the mark, again and again. Hashing them off the gesture as
 *  well makes each stroke its own dip of its own brush.
 *
 *  It reads **the first point and nothing else**, which is what lets it be
 *  random and reproducible at once: the mark under the hand and the mark the
 *  dried-mark store re-walks days later are the same mark, and a gesture does
 *  not re-seed as it grows (see the `grows` contract). */
export function markSeed(points: readonly Point[]): number {
  const first = points[0];
  if (!first) return 0;
  return Math.floor(hashedRandom(first.x, first.y, 91) * 4096);
}

/** One of the head's own spreads: a middle, scattered by `spread` either way,
 *  hashed off the stroke's seed and a key of its own. */
function varied(
  seed: number,
  key: number,
  mid: number,
  spread: number,
): number {
  return mid * (1 + (hashedRandom(key, seed, 53) - 0.5) * 2 * spread);
}

export type Pen = {
  /** The half-width of the head's footprint: the ferrule, after the sheet's
   *  line gain — and after the hand, which is the one thing that may spread
   *  the hairs past it (see `SPLAY`). Everything downstream measures the mark
   *  against this, so a pressed head is simply a bigger head that draws
   *  worse. */
  half: number;
  /** …and how far past the ferrule that is, kept because the *bounds* of the
   *  mark were opened for it before the head existed. */
  splay: number;
  /** How thick the head is against its blade (1 round … `BLADE` flat), and
   *  which way the blade is turned. */
  minor: number;
  bladeX: number;
  bladeY: number;
  /** How far one dip runs, where the touch bead reaches, and how far back
   *  from either end the hairs disagree. */
  capacity: number;
  /** How far the trail of film runs past the last of the paint — scaled off
   *  the charge that was actually dipped, so a light dip trails briefly. */
  residueRun: number;
  touchReach: number;
  liftWindow: number;
  /** How the head comes down: how far it takes to open to its full width at a
   *  swept touch-down, how much of it is down at the first touch, the shape of
   *  the widening, how fast the hand has to be moving for it to be a sweep at
   *  all, and how far the bundle stands off the path while it lands (signed —
   *  a head lands on one side of the line or the other). All of them this
   *  stroke's own (see `markSeed`). */
  entryRun: number;
  entryLeast: number;
  entryEase: number;
  entrySweep: number;
  entryLean: number;
  /** …and how far one swing of the width's own wander runs. */
  swellRun: number;
  /** How much of the gesture's own wiggle a head this wide rounds off before
   *  anything is laid on it (see `walkOf`). */
  stiffness: number;
  load: number;
  hard: number;
  spacing: number;
  /** How far the width wanders as the head travels, how far the bundle twists
   *  out of its lanes and how fast one swing of that runs, and how much of a
   *  hair's film the lane beside it still gets — the four the hand's pressure
   *  leans on (see `CLUMP_PRESS`). They are the head's rather than the
   *  module's because a pressed head is a different bundle from a rested
   *  one. */
  swell: number;
  twist: number;
  twistRun: number;
  bridge: number;
  /** How much of the grain's interruptions a head this narrow can show. */
  grainShare: number;
  /** The hairs: how many, what each lays, how readily each leaves the paper,
   *  how long its skips run, and how far each reaches out of the ferrule (see
   *  `TIP_FRAY`). Parallel, `hairs` long, settled before anything is laid. */
  hairs: number;
  thick: Float64Array;
  dryEdge: Float64Array;
  skipRun: Float64Array;
  /** How far each hair reaches at a touch-down, and how far it draws out at a
   *  lift — the two ends of a mark, which are not the same shape. */
  tips: Float64Array;
  draws: Float64Array;
  /** …and `draws` as the hand actually left the paper, worked out once per
   *  lift (see `lifting`) — scratch, so a flick costs no allocation. */
  fan: Float64Array;
  /** The comb a print's rim is cut out of — scratch, so the gated comb one
   *  step of a print reads does not overwrite the one it is cut from. */
  rim: Float32Array;
  /** One drift walker per hair, one for the tooth the whole head reads, and
   *  one for the twist of the bundle — reused across touches because the walk
   *  visits them in arc order. */
  walkers: DriftWalk[];
  toothWalk: DriftWalk;
  twistWalk: DriftWalk;
  /** …one for the lumps in the outline of a print, and one for the swell of
   *  the band as the hand travels. */
  tipWalk: DriftWalk;
  swellWalk: DriftWalk;
  /** The head as one touch presses it down — scratch, rewritten per touch. */
  head: HeadPress;
};

export function penFor(
  size: number,
  flatness: number,
  angle: number,
  hardness: number,
  load: number,
  cell: number,
  ground: GroundProfile,
  seed = 0,
  press = 1,
): Pen {
  const hard = Math.max(0, Math.min(1, hardness));
  const flat = Math.max(0, Math.min(1, flatness));
  const soak = Math.max(0, Math.min(1, ground.absorbency));
  // How hard the hand is bearing on it, as the two numbers everything below
  // reads: how far the bundle is spread out of the ferrule, and how far out of
  // its own shape that has put it (see `SPLAY`).
  const splay = splayOf(press, flat);
  const chaos = chaosOf(press, flat);
  // The paper's two claims on the head: a thirsty sheet widens the line a
  // little the moment the paint lands, and drinks the reservoir as it runs.
  // The hand's claim is the third, and the only one that may reach past the
  // ferrule.
  const half = (size / 2) * (1 + 0.05 * soak) * splay;
  // One *full* dip's run: the vector painter's own charge (`capacityOf`),
  // times what the ferrule keeps of it. The load dial is the reservoir the
  // walk starts with, not a second scale on this — a half dip runs half of
  // this because it starts half spent.
  // …and the hand's, which is the reference's "press harder and more paint
  // comes off": the film per unit of paper is the same whatever the pressure
  // (see `daub`), so a head laying a band half again as wide is spending its
  // dip half again as fast, and a stroke leaned on runs dry sooner than the
  // same dip drawn on the point.
  const capacity =
    (((CHARGE_FLOOR + size * CHARGE_RUN) * (0.45 + hard * 1.6)) /
      ((1 + DRINK * soak) * splay)) *
    (1 - flat * (1 - FLAT_RESERVOIR));
  const { count } = hairLayout(size);
  const thick = new Float64Array(count);
  const dryEdge = new Float64Array(count);
  const skipRun = new Float64Array(count);
  const tips = new Float64Array(count);
  const draws = new Float64Array(count);
  const walkers: DriftWalk[] = new Array(count);
  const liftWindow = size * LIFT_SHARE;
  const edgeStart = 0.78;
  for (let b = 0; b < count; b++) {
    const lane = count === 1 ? 0 : (b / (count - 1) - 0.5) * 2;
    // How far into the *side* of the head this hair is: everything that frays
    // a mark is gated on it, so the body cuts clean and the rim combs open —
    // the same shape `fitHead` gives the vector painter.
    const edge =
      Math.max(0, (Math.abs(lane) - edgeStart) / (1 - edgeStart)) ** 1.5;
    // Not all much of a muchness: a head is a row of clumps, so a few strands
    // lay heavily and most lay their share — squared, so the broad ones stay
    // the exception they are on paper.
    // …and a bundle bearing down is *clumpier* than one gathered on its
    // point: the spread about the middle opens with the pressure, so a
    // pressed head combs in fat and thin strands where a light one lays an
    // even one (see `CLUMP_PRESS`). The middle itself does not move — the
    // paint that comes off is the reservoir's business, not the comb's.
    thick[b] =
      CLUMP_MID +
      (0.72 + 0.56 * hashedRandom(b * 11.7, 5, seed) ** 2 - CLUMP_MID) *
        Math.max(0.3, 1 + CLUMP_PRESS * chaos);
    // The outer hairs go first whatever the head — they carry the least paint
    // and take the least pressure — and a dry, ungathered bundle skips all
    // over (see `hairTraits`, whose curve this is).
    dryEdge[b] =
      0.03 +
      (1 - hard) * 0.3 +
      lane * lane * (1 - hard) * 0.22 +
      edge * 0.42 * (1.4 - hard) * Math.max(0.3, 1 + EDGE_PRESS * chaos) +
      hashedRandom(b * 7.1, b * 3.3, seed) * 0.07;
    // How long this hair's dry stretches run — per hair, so the skips across
    // the head are not all the same length, which would be a dashed line.
    // Long enough that a parting reads as combing rather than as stipple, and
    // no longer: at two and three head-widths, as it was, every hair either
    // drew or did not for the whole stroke, so the mark came out as a set of
    // ribbons that never crossed. A parting wants to open, run, and close
    // again while the mark is still going, so the stroke stays stitched
    // together along its length.
    skipRun[b] = Math.max(
      20,
      size * (0.45 + hashedRandom(b * 2.7, 33, seed) * 1.1),
    );
    // How far out of the ferrule this hair reaches, as a share of the head's
    // own footprint: a cut bundle is level only near enough, so the rim of a
    // print is a fringe of tips at slightly different lengths rather than a
    // drawn curve (see `TIP_FRAY`). The outermost hairs fall shortest — a
    // fringe frays *inwards*, which is the only direction a bundle in a metal
    // collar can fray.
    tips[b] =
      1 -
      TIP_FRAY *
        Math.max(0.3, 1 + FRAY_PRESS * chaos) *
        (0.35 + 0.65 * edge) *
        hashedRandom(b * 4.7, 13, seed) ** 1.4;
    // …and how far it draws out at a *lift*, which is a different number about
    // a different thing (see "The two ends of a mark"): the bundle rolls up
    // onto its bent-back tips from the outside in, so a lane's reach falls off
    // towards the sides of the head and every one of them is ragged. What the
    // sheet keeps is a fan of hair ends, and it is longest down the middle.
    draws[b] =
      LIFT_DRAW *
      (1 - Math.abs(lane) ** LIFT_TAPER) *
      (0.3 + 0.7 * hashedRandom(b * 6.1, 29, seed));
    const walk = driftWalk();
    walk.reset(seed * 97 + b * 17 + 3);
    walkers[b] = walk;
  }
  // The walks the *whole* head reads, each pointed somewhere of this stroke's
  // own: two marks laid over the same paper disagree about the tooth, which is
  // the one thing here that is not the brush — but the tooth is already read
  // off arc distance rather than page position, so every stroke started from
  // its own beginning either way, and starting them all from the *same*
  // beginning is what made one mark the template for the next.
  const toothWalk = driftWalk();
  toothWalk.reset(seed * 97 + 3);
  const twistWalk = driftWalk();
  twistWalk.reset(seed * 97 + 7);
  const tipWalk = driftWalk();
  tipWalk.reset(seed * 97 + 29);
  const swellWalk = driftWalk();
  swellWalk.reset(seed * 97 + 41);
  return {
    half,
    splay,
    minor: BLADE + (1 - BLADE) * (1 - flat),
    bladeX: Math.cos(angle),
    bladeY: Math.sin(angle),
    capacity,
    residueRun: capacity * RESIDUE_RUN * Math.max(0.05, Math.min(1.3, load)),
    touchReach: TOUCH_REACH * size,
    liftWindow,
    entryRun: Math.max(1, size * varied(seed, 3, ENTRY_RUN, ENTRY_RUN_SPREAD)),
    entryLeast: varied(seed, 5, ENTRY_LEAST, ENTRY_LEAST_SPREAD),
    entryEase: varied(seed, 7, ENTRY_EASE, ENTRY_EASE_SPREAD),
    entrySweep: varied(seed, 11, ENTRY_SWEEP, ENTRY_SWEEP_SPREAD),
    entryLean:
      ENTRY_LEAN *
      (hashedRandom(13, seed, 53) - 0.5) *
      2 *
      (0.4 + 0.6 * hashedRandom(17, seed, 53)),
    swellRun: Math.max(1, size * SWELL_RUN),
    // A wider footprint rounds off more of the gesture, for the reason the
    // ferrule's own width does: a bar of hair cannot turn inside itself, and
    // a splayed one is a wider bar (see `stiffen`).
    stiffness: size * 0.3 * splay,
    load,
    hard,
    // Touches close enough together that consecutive sections tile the band
    // with no gap at this cell size.
    spacing: Math.max(0.5, cell * 0.8),
    // The four the hand leans on. All of them the ordinary numbers under an
    // ordinary hand, and none of them allowed past the point where the mark
    // stops being one mark: a bundle out of shape scatters, it does not come
    // apart into wires (see `CLUMP_PRESS`).
    swell: SWELL * Math.max(0.2, 1 + SWELL_PRESS * chaos),
    twist: TWIST_STRAY * Math.max(0.2, 1 + TWIST_PRESS * chaos),
    twistRun: TWIST_RUN / Math.max(0.5, 1 + TWIST_CHATTER * chaos),
    bridge: BRIDGE * Math.max(0, Math.min(1.4, 1 - OPEN_PRESS * chaos)),
    // The grain is the paper's, so it does not shrink with the brush: a
    // liner rides the sheet a house brush catches on (the vector painter's
    // own reading).
    grainShare: 0.35 + 0.65 * Math.min(1, (size / (TOOTH * 1.6)) ** 0.7),
    hairs: count,
    thick,
    dryEdge,
    skipRun,
    tips,
    draws,
    fan: new Float64Array(count),
    rim: new Float32Array(count),
    walkers,
    toothWalk,
    twistWalk,
    tipWalk,
    swellWalk,
    head: { comb: new Float32Array(count), dome: domeOf(flat), shift: 0 },
  };
}

/** Work out how the head is pressing at this touch: which hairs are down and
 *  how much of the film each is laying — the comb `press` reads a lane at a
 *  time — and how far the bundle has twisted out of its lanes by here.
 *
 *  Everything in it is a function of the path *up to and at* this touch (arc
 *  distance, speed, reserve) — that is the whole of the `grows` contract, kept
 *  here in one place. */
export function combOver(
  pen: Pen,
  at: number,
  speed: number,
  dry: number,
): HeadPress {
  const comb = pen.head.comb;
  const tooth = pen.toothWalk.at(at / TOOTH);
  // Two thresholds added together, and they are two different things: the
  // first is *texture* — how streaky this stretch is — capped short of
  // certainty and scaled to what a head this narrow can show; the second is
  // the paint going, and it is capped too, deliberately short of lifting
  // every hair: what actually ends the mark is the sheet refusing a starving
  // head (`catching`) and the trail of film fading out (`residueRun`), so
  // the comb's job here is only to thin the head out toward those.
  const base = Math.min(0.3, speed / 70) + (0.5 - tooth) * 0.15;
  const spent = Math.min(0.6, dry * 0.75);
  // What the paint left in the head bridges across a lane a hair has left (see
  // `BRIDGE`) — the difference between a slab scratched through and a row of
  // separate ribbons.
  const bridge = pen.bridge * pen.hard * (1 - Math.min(1, dry * 1.6));
  for (let b = 0; b < pen.hairs; b++) {
    const wet = pen.walkers[b]!.at(at / pen.skipRun[b]!);
    const dryness =
      Math.min(0.75, pen.dryEdge[b]! + base) * pen.grainShare + spent;
    if (wet < dryness) {
      comb[b] = pen.thick[b]! * bridge;
      continue;
    }
    // On the paper, and bearing down by however far past its threshold the
    // drift is — which is what keeps a hair's run from being a wire of one
    // even thickness.
    comb[b] = pen.thick[b]! * (0.66 + 0.34 * smoothstep(0, 0.3, wet - dryness));
  }
  // The comb levelled a lane either side. A film of paint does not dry with
  // vertical walls: it slumps into the gap beside it, so a parting is a valley
  // with two shoulders rather than a slot cut with a knife — and the hair that
  // laid the ridge and the one beside it are joined at the bottom of it, which
  // is the whole of what "one mark" rather than "several" looks like here.
  let before = comb[0]!;
  for (let b = 0; b < pen.hairs; b++) {
    const here = comb[b]!;
    const after = b + 1 < pen.hairs ? comb[b + 1]! : here;
    comb[b] = before * 0.25 + here * 0.5 + after * 0.25;
    before = here;
  }
  // …and where the bundle has rolled to by here. Read off the arc distance
  // like everything else, so it survives resampling and a settled touch keeps
  // the answer it settled with.
  pen.head.shift = (pen.twistWalk.at(at / pen.twistRun) - 0.5) * pen.twist * 2;
  return pen.head;
}

/** How much of the head is actually on the paper at this touch, as a share of
 *  the width it would lay flat — how far it is *down*, which nothing else in
 *  the walk is about.
 *
 *  Three things move it, and all three are things a hand does rather than
 *  things paint does:
 *
 *   - **The entry.** A head swept onto the sheet takes it with part of the
 *     bundle and opens to its full width over the first stretch of the stroke
 *     (see `ENTRY_RUN`). A head *placed* — put down on the spot and then
 *     pulled away — has already landed, and starts at its full width; the
 *     hand's own speed at the touch-down is what tells the two apart, so
 *     there is no seam between them and no flag to get wrong.
 *   - **The lift.** The pressure comes off over the last stretch, so the band
 *     narrows into the fan of hair ends `capAt` draws out past it. Exactly 1
 *     at the edge of the lift window, so a settled touch cannot feel the end
 *     of the stroke moving away from it.
 *   - **The wander.** No two sides of a brushed band are parallel: the hand
 *     leans, the bundle gives, and the width swells and pinches by a few
 *     percent the whole way along (see `SWELL`).
 *
 *  Every one of them reads the path *behind* this touch (or, at the lift, no
 *  further ahead than the window), which is what keeps the `grows` contract.
 *
 *  What is **not** here is the hand's own pressure, though it is the same
 *  quantity: the dial is one number for the whole stroke, so it is settled
 *  into the head's footprint once (see `splayOf` in `penFor`) rather than
 *  multiplied back in at every touch. The day a stylus reports its own
 *  pressure per sample, this is where it arrives — a fourth term on the same
 *  line, reading `p` like the other three. */
export function bearingDown(
  pen: Pen,
  p: Trace,
  fromEnd: number,
  flick = 0,
): number {
  // How much of the bundle the touch-down has taken by here, and how much of
  // that matters: a head that was not moving when it landed was placed, not
  // swept, and starts flat.
  const opened =
    pen.entryLeast +
    (1 - pen.entryLeast) * Math.min(1, (p.at / pen.entryRun) ** pen.entryEase);
  const swept = Math.min(1, p.speed / pen.entrySweep);
  let down = opened + (1 - opened) * (1 - swept);
  if (fromEnd < pen.liftWindow) {
    // …and how far off it has come by here, which is the hand's business and
    // not the head's: a stop sets the head down and picks it up, a flick takes
    // the weight off over the whole window (see `liftFlick`). Exactly 1 at the
    // window's edge whichever it was, so a settled touch cannot feel it.
    const low = FAN_DOWN - FAN_DOWN_FLICK * flick;
    down *= low + (1 - low) * (fromEnd / pen.liftWindow) ** 0.7;
  }
  return down * (1 - pen.swell * pen.swellWalk.at(p.at / pen.swellRun));
}

/** How far off the path the head is standing where it lands — a lateral
 *  offset in document pixels, this stroke's own way and gone by the time the
 *  head has opened (see `ENTRY_LEAN`).
 *
 *  A swept touch-down is the one place a brushed mark is not about the line
 *  the hand drew: the bundle takes the sheet with a side of itself, so the
 *  first stretch runs a little wide of the path and hooks onto it. It is what
 *  a *placed* head does not do, so it reads the same touch-down speed the
 *  opening does, and it is a function of the path behind this touch alone. */
export function entryLean(pen: Pen, p: Trace): number {
  if (pen.entryLean === 0 || p.at >= pen.entryRun) return 0;
  // Squared, so it is a *sweep* that leans and not every touch that moved: a
  // finger resting on the glass and shifting two pixels is a press, and a
  // press has to print where it stands or the mark bites its own blot.
  const swept = Math.min(1, p.speed / pen.entrySweep) ** 2;
  return pen.entryLean * pen.half * swept * (1 - p.at / pen.entryRun) ** 1.4;
}
