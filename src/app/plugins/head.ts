// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What is on the end of the handle.
//
// `bristle.ts` is a head being *dragged across paper*: the path it can follow,
// the profile it lays down, where each hair goes sample by sample. This module
// is the head itself, and the difference is that nothing in it knows about a
// stroke — how the bundle breaks into strands, how much paint it holds and how
// fast it spends it, and how a mark exactly as wide as the head is fitted
// across the strands it turns out to have.
//
// Kept apart because it is a separate thing to get right and a separate thing
// to check: every number here is a claim about a brush — the gauge real
// filament is milled at, what one dip covers, how far a worn head frays open —
// and those claims can be held to without painting a mark.
//
// The numbers are the medium's, in document pixels, and the screen only ever
// takes detail away — never adds it (see `hairLayout`).

import { mm } from "../units.ts";
import { PIXEL, hashedRandom } from "./grain.ts";

/** What is on the end of the handle.
 *
 *  A `round` is a cone of hair: it lays down the same width whichever way you
 *  pull it, which is why it is the brush you draw with. A `flat` is a blade —
 *  a bundle squeezed into a chisel ferrule — and it lays down its full width
 *  only when you pull it square across itself. Turn it and the mark closes to
 *  the thickness of the blade, which is the entire reason a sign-writer owns
 *  one: a single stroke that swells and thins as it goes round a curve.
 *
 *  It is a property of the *brush*, not a dial: you do not turn a round into a
 *  flat, you pick up a different brush. So it arrives here from the plugin
 *  descriptor the way the marker's chisel does (see `builtin/index.ts`). */
export type BrushHead = {
  shape: "round" | "flat";
  /** Which way the blade is turned, in radians off the horizontal. Meaningless
   *  on a round, which has no flat to turn. */
  angle: number;
};

/** The round head every brush is unless it says otherwise. */
export const ROUND_HEAD: BrushHead = { shape: "round", angle: 0 };

/** How thick a flat blade is, as a share of its width — what is left of the
 *  mark when the brush is pulled along its own edge.
 *
 *  Not zero, and not close to it: a chisel ferrule squeezes the bundle flat but
 *  a bundle of hair still has a body, and an edge-on flat leaves a line you can
 *  letter with rather than nothing at all. About a seventh is what a
 *  one-stroke brush actually measures. */
export const BLADE = 0.14;

/** How much of its load the head still has after travelling `at` document
 *  pixels, 1 down to nearly 0.
 *
 *  A brush is charged once and then spends it. That is the shape of a real
 *  drag and the thing that makes the two ends of one look nothing alike: it
 *  starts as a solid slab, and somewhere along its length the paint stops
 *  covering and the mark opens up into the separate hairs that are laying it
 *  down. Every dry-brush and every hand-lettered stroke ends that way.
 *
 *  How that happens is not a fade, and that is the whole of the curve here. A
 *  loaded head **plateaus**: it covers solidly for most of its range and then
 *  gives out over the last stretch, which is why the lifted stroke on a
 *  reference sheet is three-quarters slab and one-quarter hair rather than an
 *  even gradient. A dry one is the opposite — it is nearly spent the moment it
 *  touches down, and stays that way. One exponent, driven by how loaded the
 *  head is, is both of those.
 *
 *  It never quite reaches nothing: a brush with a dry patch is not a brush with
 *  no paint, and a stroke that faded out entirely would be a stroke the user
 *  could not finish. */
export function loadAt(at: number, capacity: number, hard: number): number {
  const spent = Math.min(1, at / capacity);
  return Math.max(0.08, 1 - spent ** (0.45 + hard * 1.9));
}

/** How far a head that loaded runs before it is spent, in document pixels.
 *
 *  Two things set it, and both are the brush rather than the stroke: a wide
 *  head holds more paint than a narrow one, and a charged head holds more than
 *  a dry one. The range is wide on purpose — a loaded two-inch flat covers most
 *  of a page before it opens up, a dry one is streaking within a head-width —
 *  because that range *is* the difference between the top and bottom of a
 *  pressure series.
 *
 *  Mostly proportional to the head, with a floor under it so a rigger is not
 *  spent in a centimetre. A charged #6 round — five millimetres of hair —
 *  covers something like four centimetres of paper here, which is a good long
 *  drag and about what one dip actually gives you.
 *
 *  It used to be nearly four times that, and the whole page was the poorer for
 *  it: a head that lasts a hundred and fifty millimetres never runs out inside
 *  a drawing, so every brush mark in it was the solid end of the stroke and the
 *  thing that makes a brushed line look brushed — the far end opening up into
 *  separate hairs — was something you had to cross the page twice to see. It is
 *  also the one number that decides what a long stroke *costs*: a spent head
 *  lifts most of its hairs off the paper, so the run-out is where a drag stops
 *  getting more expensive the longer it gets. */
export function capacityOf(size: number, hard: number): number {
  return (mm(3) + size * 3.5) * (0.45 + hard * 1.6);
}

/** How wide the pooled middle of the mark is, as a share of the head's
 *  half-width — 0 for anything but a well-charged head.
 *
 *  What makes a mark *solid* is not this: it is the hairs themselves, wet
 *  enough to be wider than the gaps they sit in and so overlapping into one
 *  body (see the line width in the painter). This is the extra on top — the
 *  paint that pools in the middle of a charged head, where the load is deepest
 *  and there is nowhere for it to go.
 *
 *  Which is why it stays a spine and never becomes a slab. Every gap it covers
 *  is a parting that does not get drawn, and the partings *are* the texture: a
 *  full-width flood would repaint the whole subtractive mark as a rectangle.
 *  Half the head is as far as it goes, and below a charged head it is nothing
 *  at all — a light or dry mark is hairs and paper, with no body under it. */
export function coreShare(hard: number): number {
  return Math.max(0, (hard - 0.22) / 0.78) ** 0.9 * 0.62;
}

// --- What a brush head is actually made of -----------------------------------
//
// A real brush does not get *hairier* as it gets bigger — it gets **more
// hairs**. Artists' filament is milled in a narrow band of thicknesses: a fine
// sable is drawn at about 0.075 mm and the coarsest hog or house-brush bristle
// at about 0.3 mm. Head widths span nothing like that range: a size 2 round is
// 2 mm across the ferrule and a wide flat is 50 mm. So a head twenty-five times
// the width carries hair only some four times the thickness — and about six
// times as many streaks per centimetre of edge.
//
// That ratio is the whole of the rule below, and now that a document pixel is a
// real distance (see `units.ts`) every number in it is the millimetre it stands
// for. The pitch between hairs grows as roughly the third root of the head,
// which over the app's whole 1–150 mm range moves a streak from 0.13 mm to
// 0.39 mm — the real filament band, near enough. A mark made with the fattest
// brush is a mark full of fine hair lines, not four fat noodles, which is what
// a linear `size / count` gives and what no brush has ever left on paper.

/** The gap between hairs on a head of `HAIR_HEAD` — a fine-to-middling sable,
 *  a little under a fifth of a millimetre. */
const HAIR_PITCH = mm(0.18);

/** The head width the pitch above is written for: a half-inch brush, which is
 *  the middle of the rack in every sense. */
const HAIR_HEAD = mm(12);

/** How fast hair coarsens as the head widens — the exponent on the ratio above.
 *  0 would be one hair gauge for every brush in the rack; 1 would be the
 *  noodles. Real filament ranges over ~4× while heads range over ~50×, and the
 *  logs of those land here. */
const HAIR_COARSENING = 0.38;

/** The coarsest and finest a hair is allowed to get however extreme the head —
 *  the two ends of what is actually milled: fine sable, and hog. The fine end
 *  stops a shade above the real 0.075 mm, because a strand thinner than a page
 *  pixel is one the mark cannot show however carefully it is placed. */
const HAIR_PITCH_MIN = mm(0.1);
const HAIR_PITCH_MAX = mm(0.32);

/** The most strands one mark will ever be drawn from. Well past what a head
 *  this wide splays into visibly; it is here so a page-wide brush cannot walk
 *  the whole path a hundred times over. */
const MAX_HAIRS = 56;

// --- The width of the mark ---------------------------------------------------
//
// **A brush lays down a mark the width of the brush.** That is the whole of the
// contract the size button makes, and for a long time this painter did not keep
// it: everything that ruffles the edge of a brushed stroke — the clump that
// pulls a hair towards its neighbour, the wander that carries it along the
// mark, the twist of the whole bundle, the fray of a worn head, the thickness
// of the outermost strand itself — was *added* to a lane that already sat on
// the rim of the head. A #6 round set to 4.8 mm measured nearer 6.7, which is
// not a #6 and does not feel like one.
//
// So the budget below is subtracted instead. Every one of those wanderings has
// a known ceiling, they are taken out of the head before the lanes are laid
// across it, and what comes out is a mark that measures what the button says
// however the dials are set. A fringe frays *inwards*, which is the only
// direction a fringe on a real head can fray: the ferrule is the width of the
// ferrule.

/** How far a hair is nudged out of its lane towards a neighbour, as a share of
 *  the gap it sits in — the clumping that puts the long partings into a mark. */
export const CLUMP_STRAY = 0.53;

/** …and how far it wanders across the head as it travels, in the same units. */
export const WANDER_STRAY = 0.55;

/** …and how far the whole bundle twists, as a share of the half-width. */
export const TWIST_STRAY = 0.04;

/** How much of the two ceilings above a strand is actually sitting at, near
 *  enough, at any point along a mark.
 *
 *  They are slow drifts and not offsets: a hair is somewhere in the middle of
 *  its wander almost everywhere along a stroke, so budgeting for the rail it
 *  touches twice draws a mark visibly *under* the size on the button — which is
 *  the same complaint as drawing one over it. What pokes past the rim at this
 *  share is the odd strand at the odd moment, by a percent or so, which is what
 *  a hair straying out of a bundle looks like. */
const WOBBLE_TYPICAL = 0.35;

/** How much shorter than the head a hair at its very edge can be cut, at most —
 *  what turns the rim of the mark from a traced contour into a fringe. Scaled
 *  by how worn the head is, and capped, because a fringe that eats half the
 *  mark is a mark with no edges left. */
const FRAY_CUT = 0.34;
const FRAY_CUT_MAX = 0.5;

/** How a head of a given width breaks into hairs.
 *
 *  Two numbers come out: how many strands to draw, and how far apart they sit.
 *  The pitch is the medium's — it is what makes a wide brush's streaks stay as
 *  fine as a narrow one's — and the count is the head divided by it, less
 *  whatever the screen cannot resolve.
 *
 *  `gauge` is which rack the brush came off: the filament this head is milled
 *  from, as a fraction of the ordinary. It multiplies the pitch *after* the
 *  clamps, because those bound what a brush of a given width is made of and
 *  this is the user saying they wanted a different brush — a fine sable at 0.5,
 *  a coarse hog at 2. It changes the streaks, never the width.
 *
 *  `merged` is the bookkeeping for the screen: when the screen can only tell
 *  twenty strands apart on a head the medium splays into forty, each drawn
 *  strand stands for two and is widened to match. Without it a stroke would
 *  visibly thin out as you zoomed away from it — the same trap the airbrush's
 *  dab count and the crayon's strands answer, and the same answer. */
export function hairLayout(
  size: number,
  scale = 1,
  gauge = 1,
): { pitch: number; count: number; merged: number } {
  const pitch =
    Math.max(
      HAIR_PITCH_MIN,
      Math.min(
        HAIR_PITCH_MAX,
        HAIR_PITCH * (size / HAIR_HEAD) ** HAIR_COARSENING,
      ),
    ) * Math.max(0.1, gauge);
  const wanted = Math.max(3, Math.min(MAX_HAIRS, Math.round(size / pitch)));
  // Two hairs inside one device pixel are one hair drawn twice, and a strand
  // needs a gap beside it to read as a strand at all — so the budget is a
  // strand per couple of device pixels rather than per pixel. Above 1:1 that
  // changes nothing, because the medium's own pitch is the smaller of the two
  // numbers there; pulled back it is what stops a page of brushwork from
  // costing every hair of every mark on it to draw a thumbnail.
  const resolvable = Math.max(2, Math.round((size * scale) / (PIXEL * 1.8)));
  const count = Math.min(wanted, resolvable);
  return { pitch, count, merged: wanted / count };
}

/** A head fitted to the strands it turns out to be made of: where every hair
 *  sits, how thick it is, and how far the outermost lane may sit from the
 *  middle so the mark comes out `size` across.
 *
 *  The four arrays are parallel and `count` long. `lanes` is signed and in units
 *  of `inset` — a hair's centre is `lanes[b] * inset` off the middle of the head
 *  — while `clumps` and `pens` are document pixels. */
export type HeadFit = {
  /** How far the head has opened, as a multiple of its own width. */
  splay: number;
  /** Where the body of the head ends and its side begins, as a share of the
   *  half-width. Everything that frays a mark is gated on being past it, so
   *  this one number is the difference between a flat that cuts a clean edge
   *  and one whose outer third is loose hair. A new brush keeps it at the rim. */
  edgeStart: number;
  /** The spacing the hairs were fitted at, in document pixels. */
  gap: number;
  /** How far the outermost lane sits from the middle, in document pixels. */
  inset: number;
  /** How many strands there are, and how many each stands for on the screen
   *  this head is bound for (see `hairLayout`). */
  count: number;
  merged: number;
  lanes: Float64Array;
  /** How far into the *side* of the head each hair is: 0 through the whole body
   *  of it, 1 at the very outside. */
  edges: Float64Array;
  clumps: Float64Array;
  pens: Float64Array;
};

/** Break a head of this width into strands and fit them across it.
 *
 *  `hard` is how wet and gathered the bundle is, `worn` how far it has come
 *  apart with use, `gauge` which rack the brush came off, and `scale` how big
 *  the mark is coming out on the screen it is bound for.
 *
 *  Every answer is settled before a single hair is drawn, and that is the point:
 *  the width of a mark is a property of the *set* of strands, and it cannot be
 *  got right a hair at a time (see "The width of the mark"). */
export function fitHead(
  size: number,
  hard: number,
  scale: number,
  gauge: number,
  worn: number,
): HeadFit {
  const half = size / 2;
  // How far the head splays. A dry head has nothing gathering it, so it opens
  // out a little — but only a little: put a pressure series side by side and
  // the five marks are the same width. What separates them is how much of that
  // width is *covered*, and that is `coreShare` and the hairs, not this.
  //
  // A worn head opens further, and that part is the `fray` dial. It is the one
  // thing here allowed to widen the mark, and it does so barely: a splayed
  // brush is a brush with a *fringe*, not a wider brush.
  const splay = 1 + (1 - hard) * 0.12 + Math.max(0, worn - 1) * 0.16;
  const edgeStart = 0.94 - worn * 0.22;
  const { count, merged } = hairLayout(size, scale, gauge);
  // What the hairs are actually spaced at once they have been fitted across
  // this head — the pitch is what set their *number*, and the head has to be
  // covered by exactly that many.
  const gap = (size * splay) / count;
  const frayCut = Math.min(FRAY_CUT_MAX, FRAY_CUT * worn);

  const lanes = new Float64Array(count);
  const edges = new Float64Array(count);
  const clumps = new Float64Array(count);
  const pens = new Float64Array(count);
  for (let b = 0; b < count; b++) {
    // Where this hair sits across the head. Evenly spaced would be a comb: wet
    // hairs stick to their neighbours, so the head is really a row of little
    // tufts with partings between them. A hashed nudge of up to half a gap is
    // what puts those in — and where the nudge pulls two neighbours apart it
    // opens a parting that runs the whole length of the mark, which is what the
    // long white hairlines in a brushed stroke are. The same for ever, because
    // it is hashed off the hair's index and not drawn at random.
    const lane = count === 1 ? 0 : (b / (count - 1) - 0.5) * 2;
    // How far into the side of the head this hair is. A head is uniform almost
    // all the way across and only comes apart at its two sides, so everything
    // that frays a mark — thinner hairs, drier ones, ones that stray out of
    // line — is gated on this rather than on the lane. Spread across the whole
    // width instead, the fray eats a third of the mark from each side and what
    // is left is a black bar with a comb either side of it.
    const edge =
      Math.max(0, (Math.abs(lane) - edgeStart) / (1 - edgeStart)) ** 1.5;
    // How far out this hair actually reaches. Hairs are not cut to a common
    // length: without this the outer ones share an envelope and the mark ends
    // in a drawn outline rather than in a frayed edge — which is exactly what
    // it did at a sixth of this spread, because a rim of hairs all landing
    // within a few percent of the same offset *is* a traced contour.
    //
    // Cut *short* of the head rather than either side of it. A hair that
    // reached past the ferrule was the largest single reason a brush drew a
    // mark half again the size on the button, and it is not a thing a bundle of
    // hair in a metal collar can do: the strands that show up in a fringe are
    // the ones that fell short.
    edges[b] = edge;
    lanes[b] = lane * (1 - edge * hashedRandom(b * 3.9, 23) * frayCut);
    clumps[b] = (hashedRandom(b * 5.3, 61) - 0.5) * CLUMP_STRAY * 2 * gap;
    // A hair is a hair wide — the pitch it sits at, give or take, and *not* a
    // share of the head. This is the whole point of `hairLayout`: widen the
    // head and you get more of these, never fatter ones. The only thing that
    // fattens them is a screen too coarse to show them all, where each strand
    // left is standing in for the ones that were dropped.
    //
    // Wider than the gap it sits in, so neighbours overlap and the wet part of
    // the mark closes up into one solid piece. What separates them is a hair
    // *lifting*, not a gap left between them — dry hairs make the texture, thin
    // ones would only make a mesh.
    //
    // Except at the edges: a head is fullest in the middle and thins to its
    // sides, and the hairs that show up alone — the ones in the fray — are the
    // outermost. Leaving them as fat as the ones buried in the middle is what
    // makes a frayed edge read as rope rather than as hair.
    //
    // And it is *wet* hairs that are wider than their gap. Paint is what bridges
    // one hair to the next: a charged head lays a closed mark down because the
    // hairs' loads meet in the middle, and a dry one leaves the filament's own
    // width with bare paper either side of it. So the same number that decides
    // how much of the head floods (`coreShare`) has to decide this too, or a dry
    // brush comes out as a solid mark wearing a handful of scratches.
    pens[b] = Math.max(
      0.5,
      gap *
        merged *
        (0.56 + hard * 0.5) *
        // Not all much of a muchness: a head is a row of *clumps*, so a few
        // strands are several hairs stuck together and most are one. Squared,
        // so the broad ones are the exception they are on paper — an even
        // spread of widths reads as a comb, which is the giveaway that a mark
        // was ruled rather than brushed.
        (0.65 + hashedRandom(b * 11.7, 5) ** 2 * 1) *
        (1 - edge * 0.4),
    );
  }

  // What is *not* settled until the hair is travelling: how far it wanders out
  // of its lane, and how far the whole bundle twists. Both have a ceiling and
  // neither belongs to any one hair, so both come out of the head once.
  const wobble =
    (gap * WANDER_STRAY * (0.5 + worn * 0.5) + half * splay * TWIST_STRAY) *
    WOBBLE_TYPICAL;
  // How far the outermost lane may sit from the middle. Every hair has to fit
  // inside the head with its own clump, its own thickness and that wobble
  // beside it — so the spread is the tightest of those demands, and the mark
  // measures `size` across because the strand that decides it lands on the rim.
  let fitted = half * splay;
  for (let b = 0; b < count; b++) {
    const out = Math.abs(lanes[b]!);
    if (out < 1e-6) continue;
    // The clump counts with its sign, against the side of the head this hair is
    // on: a nudge towards its neighbour carries it *inwards*, and charging it
    // for that would shrink the head on account of a hair that was never going
    // to reach the rim.
    const room =
      half * splay - wobble - pens[b]! / 2 - Math.sign(lanes[b]!) * clumps[b]!;
    if (room / out < fitted) fitted = room / out;
  }
  return {
    splay,
    edgeStart,
    gap,
    // Never past the point where the head would be all fringe and no body: a
    // brush a couple of pixels wide has no room to budget anything, and a mark
    // down the middle of where it should be beats no mark at all.
    inset: Math.max(half * splay * 0.35, fitted),
    count,
    merged,
    lanes,
    edges,
    clumps,
    pens,
  };
}
