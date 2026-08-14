// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bristle brush.
//
// The one painter with a whole module to itself, because it is the only one
// modelling a physical *object* rather than a way of laying down colour. An
// airbrush is a cone and a crayon is a wobble, but a brush is a head of hair on
// a handle: it holds a load and spends it, it is wider than the wiggles you ask
// it to follow, it cannot turn inside its own width, and the mark it leaves is
// opaque with the hairs' partings scratched through it. Each of those is a
// function below, and together they are most of what separates a brush stroke
// from a thick line.
//
// The numbers here are the medium's, in document pixels, and the screen only
// ever takes detail away — never adds it. That is what keeps a mark looking the
// same as you zoom into it and makes the PNG export exactly what the tool
// intended.

import type { Point } from "../types.ts";
import { HAIRLINE, PIXEL, driftNoise, hashedRandom } from "./grain.ts";
import { paintPath } from "./ink.ts";

/** Where along a path each sample sits, and how fast the hand was moving when
 *  it passed through — the two things a real brush's mark depends on.
 *
 *  Speed is read back out of the *sampled* geometry: the canvas records a point
 *  every 1.5 document pixels at the slowest, so the gaps between the points a
 *  stroke actually stored are how quickly the pointer crossed them. It costs
 *  nothing to store and it is the difference between a stroke that swells as
 *  you slow into a corner and one that is the same slab all the way round. */
type Trace = { x: number; y: number; speed: number; at: number };

/** Resample a stroke evenly and carry the local speed along with it, smoothed
 *  over a few samples so one jittery pointer report can't pinch the mark. */
function trace(points: readonly Point[], spacing: number): Trace[] {
  const first = points[0];
  if (!first) return [];
  // Raw speed per stored sample, in document pixels between reports.
  const speeds: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const smoothed = speeds.map((_, i) => {
    const from = Math.max(0, i - 2);
    const to = Math.min(speeds.length - 1, i + 2);
    let sum = 0;
    for (let k = from; k <= to; k++) sum += speeds[k]!;
    return sum / (to - from + 1);
  });

  if (points.length === 1) {
    return [{ x: first.x, y: first.y, speed: 0, at: 0 }];
  }
  const step = Math.max(0.5, spacing);
  const out: Trace[] = [
    { x: first.x, y: first.y, speed: smoothed[0] ?? 0, at: 0 },
  ];
  let carry = 0;
  let travelledTotal = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (span === 0) continue;
    let travelled = step - carry;
    while (travelled <= span) {
      const t = travelled / span;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        speed:
          (smoothed[i - 1] ?? 0) +
          ((smoothed[i] ?? 0) - (smoothed[i - 1] ?? 0)) * t,
        at: travelledTotal + travelled,
      });
      travelled += step;
    }
    travelledTotal += span;
    carry = (carry + span) % step;
  }
  return out;
}

/** Stiffen a traced path to what a head that wide could actually have drawn.
 *
 *  A brush head is a bar of hair, not a point. Waggle a two-inch flat over a
 *  five-millimetre squiggle and the paper does not get the squiggle: the head is
 *  wider than the detail, so it sweeps straight through it. Push it round a
 *  corner tighter than its own half-width and the inner hairs would have to
 *  travel backwards — which is exactly what the offset geometry here does if it
 *  is asked to, folding the mark into a pinch and a swirl that no brush has ever
 *  left behind.
 *
 *  So the path is smoothed by about a half-width before any hair is placed on
 *  it. The window closes to nothing at the two ends, which keeps the mark
 *  starting and finishing where the hand did — it is the middle of a gesture a
 *  wide head rounds off, not its extent. A small head barely notices; that is
 *  the point, and it is why a pencil-sized brush still takes your handwriting. */
function stiffen(along: Trace[], radius: number, spacing: number): Trace[] {
  const window = Math.floor(radius / Math.max(0.5, spacing));
  if (window < 1 || along.length < 3) return along;
  const out: Trace[] = new Array(along.length);
  for (let i = 0; i < along.length; i++) {
    const k = Math.min(window, i, along.length - 1 - i);
    if (k === 0) {
      out[i] = along[i]!;
      continue;
    }
    let sx = 0;
    let sy = 0;
    for (let j = i - k; j <= i + k; j++) {
      sx += along[j]!.x;
      sy += along[j]!.y;
    }
    const n = k * 2 + 1;
    out[i] = { ...along[i]!, x: sx / n, y: sy / n };
  }
  return out;
}

/** The unit normal at `i` — the direction "across" the stroke, which is what a
 *  bristle is offset along and what a nib is measured across. */
function normalAt(
  trace: readonly Trace[],
  i: number,
): { nx: number; ny: number } {
  const prev = trace[Math.max(0, i - 1)]!;
  const next = trace[Math.min(trace.length - 1, i + 1)]!;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

/** How much of its load the head still has after travelling `at` document
 *  pixels, 1 down to 0.
 *
 *  A brush is charged once and then spends it. That is the shape of a real
 *  drag and the thing that makes the two ends of one look nothing alike: it
 *  starts as a solid slab, and somewhere along its length the paint stops
 *  covering and the mark opens up into the separate hairs that are laying it
 *  down. Every dry-brush and every hand-lettered stroke ends that way.
 *
 *  A firm head (`hard`) holds its paint against the paper longer; a splayed
 *  soft one gives it up. Neither ever reaches nothing — a brush with a dry
 *  patch is not a brush with no paint, and a stroke that faded out entirely
 *  would be a stroke the user could not finish. */
function loadAt(at: number, capacity: number, hard: number): number {
  const spent = Math.min(1, at / capacity);
  return 1 - spent ** 1.6 * (0.62 - hard * 0.22);
}

/** The radius of the curve the path is taking at `i`, measured over a span of
 *  `k` samples either side — the circle through those three points.
 *
 *  Straight enough to have no circle through it is the common case and comes
 *  back as `Infinity`, which is the honest answer and the one the caller wants:
 *  a head is never too wide for a straight line. */
function turnRadius(along: readonly Trace[], i: number, k: number): number {
  const a = along[Math.max(0, i - k)]!;
  const b = along[i]!;
  const c = along[Math.min(along.length - 1, i + k)]!;
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  // Twice the triangle's area, from the cross product of two of its edges.
  const twice = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (twice < 1e-6) return Infinity;
  return (ab * bc * ca) / (2 * twice);
}

/** How much of its full width the mark has at sample `i`.
 *
 *  Look at a real drag and the thing that is *not* there is a lens. A head is a
 *  bar of hair on the end of a handle: it comes down, and from the moment it is
 *  down it is as wide as it is going to get. The mark starts blunt — a squared
 *  end, give or take the hairs that landed first — holds that width for the
 *  whole drag, and gives way only at the lift, where the head rolls up off its
 *  tip. So the lead-in is short and shallow, the run-out is longer and still
 *  only takes back a third of the width, and the middle is a constant.
 *
 *  What actually reads as "the end of the stroke" is not the narrowing at all —
 *  it is the mark coming apart into separate hairs as the paint runs out. That
 *  is `load` in the painter, not this. */
function widthProfile(
  trace: readonly Trace[],
  i: number,
  leadIn: number,
  runOut: number,
  speedThinning: number,
): number {
  const landing = Math.min(1, i / Math.max(1, leadIn));
  const lifting = Math.min(1, (trace.length - 1 - i) / Math.max(1, runOut));
  const taper = Math.min(
    0.8 + 0.2 * Math.sqrt(landing),
    0.62 + 0.38 * Math.sqrt(lifting),
  );
  const speed = trace[i]!.speed;
  const thinning = 1 / (1 + (speed / 26) * speedThinning);
  return taper * Math.max(0.55, thinning);
}

// --- What a brush head is actually made of -----------------------------------
//
// A real brush does not get *hairier* as it gets bigger — it gets **more
// hairs**. Artists' filament is milled in a narrow band of thicknesses: a fine
// sable is drawn at about 0.075 mm and the coarsest hog or house-brush bristle
// at about 0.3 mm. Head widths span nothing like that range: a size 2 round is
// 4 mm across the ferrule and a wide flat is 50 mm. So a head fifteen times the
// width carries hair only some three times the thickness — and about five times
// as many streaks per centimetre of edge.
//
// That ratio is the whole of the rule below. `size` is a head width in document
// pixels; the pitch between hairs grows as its fifth root or so, which over the
// app's whole 2.5–240 px range moves a streak from about one pixel wide to
// about four. A mark made with the fattest brush is a mark full of fine hair
// lines, not four fat noodles — which is what a linear `size / count` gives and
// what no brush has ever left on paper.

/** The gap between hairs, in document pixels, on a head of `HAIR_HEAD`. */
const HAIR_PITCH = 2.1;

/** The head width, in document pixels, the pitch above is written for. */
const HAIR_HEAD = 24;

/** How fast hair coarsens as the head widens — the exponent on the ratio above.
 *  0 would be one hair gauge for every brush in the rack; 1 would be the
 *  noodles. Real filament ranges over ~4× while heads range over ~15×, and
 *  log(4)/log(15) lands here. */
const HAIR_COARSENING = 0.38;

/** The coarsest and finest a hair is allowed to get however extreme the head. */
const HAIR_PITCH_MIN = 1.5;
const HAIR_PITCH_MAX = 4.6;

/** The most strands one mark will ever be drawn from. Well past what a head
 *  this wide splays into visibly; it is here so a page-wide brush cannot walk
 *  the whole path a hundred times over. */
const MAX_HAIRS = 56;

/** How a head of a given width breaks into hairs.
 *
 *  Two numbers come out: how many strands to draw, and how far apart they sit.
 *  The pitch is the medium's — it is what makes a wide brush's streaks stay as
 *  fine as a narrow one's — and the count is the head divided by it, less
 *  whatever the screen cannot resolve.
 *
 *  `merged` is the bookkeeping for that last part: when the screen can only tell
 *  twenty strands apart on a head the medium splays into forty, each drawn
 *  strand stands for two and is widened to match. Without it a stroke would
 *  visibly thin out as you zoomed away from it — the same trap the airbrush's
 *  dab count and the crayon's strands answer, and the same answer. */
export function hairLayout(
  size: number,
  scale = 1,
): { pitch: number; count: number; merged: number } {
  const pitch = Math.max(
    HAIR_PITCH_MIN,
    Math.min(
      HAIR_PITCH_MAX,
      HAIR_PITCH * (size / HAIR_HEAD) ** HAIR_COARSENING,
    ),
  );
  const wanted = Math.max(3, Math.min(MAX_HAIRS, Math.round(size / pitch)));
  // Two hairs inside one device pixel are one hair drawn twice. A little over a
  // pixel apart, because a strand needs a gap beside it to read as a strand.
  const resolvable = Math.max(2, Math.round((size * scale) / (PIXEL * 1.3)));
  const count = Math.min(wanted, resolvable);
  return { pitch, count, merged: wanted / count };
}

/** The bristle brush.
 *
 *  Put a real brushed mark next to a drawn one and the difference is not the
 *  outline. It is that the mark is **solid, and scratched through**: paint is
 *  opaque, so a drag lays down one flat slab of colour, and everything you read
 *  as "brush" is the thin slivers of bare paper the hairs left in it — the
 *  partings between clumps, the streaks where a hair lifted, the fray along the
 *  sides, and the far end coming apart as the load runs out. It is a subtractive
 *  texture in an opaque mark, not a weave of translucent threads.
 *
 *  So this paints the whole mark at the stroke's own opacity and spends its
 *  effort on *where the hairs are* rather than on how dark each one is:
 *
 *   - a narrow **core** down the middle, the paint that pooled between the
 *     hairs, narrowing as the head empties;
 *   - **hairs** at the pitch `hairLayout` sets — fine, and many of them on a
 *     wide head rather than few and fat — each keeping to its own lane, nudged
 *     into clumps so the partings between them run the length of the mark;
 *   - a **head that twists as one**: the whole bundle drifts together, and a
 *     hair only wanders a hair's width either side of that. Hairs in a ferrule
 *     are parallel and stay parallel; letting each one wander by a fraction of
 *     the *head* instead is what turns a wide mark into woven rope;
 *   - a **width that lands blunt and holds**, because a head is as wide the
 *     moment it touches down as it is ever going to be (see `widthProfile`);
 *   - **paint that runs out**, which is what actually ends a stroke: the far end
 *     of a long drag opens up into separate hairs (see `loadAt`).
 *
 *  Hardness is how wet and how gathered the head is: a hard setting is a loaded,
 *  tight head that covers solidly, a soft one is a splayed dry one that leaves
 *  most of its length in streaks. */
export function paintBrush(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  hardness: number,
  scale = 1,
): void {
  const alpha = ctx.globalAlpha;
  const hard = Math.max(0, Math.min(1, hardness));
  const half = size / 2;
  // The head's width on the screen it is bound for. A brush drawn four pixels
  // wide has room for four hairs, however many the medium would splay.
  const onScreen = size * scale;

  if (onScreen < HAIRLINE) {
    // Too small to have a texture at all. A plain line at the weight the hairs
    // would have covered to is what they average out to anyway.
    ctx.save();
    ctx.globalAlpha = alpha * (0.8 + hard * 0.2);
    paintPath(ctx, points, size);
    ctx.restore();
    return;
  }

  // Samples no closer than a device pixel: the medium wants one every quarter
  // width, and past a pixel apart they are the same pixel twice. Capped in
  // absolute terms as well, because a quarter of a *wide* head is tens of pixels
  // and the head's twist has to be sampled finely enough to read as a curve
  // rather than as a chain of straights.
  const spacing = Math.max(PIXEL / scale, Math.min(Math.max(1, size / 4), 7));
  // Rounded off to what a head this wide could physically have followed — see
  // `stiffen`. Everything downstream (the normals, the body, the hairs) reads
  // this path, so the whole mark is placed on a curve the brush could take.
  const along = stiffen(trace(points, spacing), size * 0.3, spacing);

  if (along.length < 2) {
    // A tap: a single dab of the head, not a perfect disc.
    const p = along[0] ?? points[0];
    if (!p) return;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, half, half * 0.82, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const count = along.length;
  // Landing and lift-off, in samples: a head width or so of each, so a liner
  // and a two-inch flat both start and end over their own scale. Held under a
  // third of the stroke so a short dash is still a dash and not two tapers.
  const leadIn = Math.max(1, Math.min(count * 0.2, (size * 0.2) / spacing));
  const runOut = Math.max(1, Math.min(count * 0.3, (size * 0.5) / spacing));
  // How far the head splays: tight when hard, spread when soft.
  const splay = 1 + (1 - hard) * 0.3;
  const widths = new Float64Array(count);
  // The corner the path turns, measured over about a half-width of travel.
  const span = Math.max(1, Math.round(half / Math.max(1, spacing)));
  for (let i = 0; i < count; i++) {
    // Stiffening rounds the path off to something a head this wide could
    // follow; what is left after it can still be a corner tighter than the head
    // is long. On the inside of such a corner the hairs would have to pass
    // through the centre of the turn and come out the far side — a fold, and
    // the pinched swirl it leaves is the one thing a mark like this cannot
    // survive. A real head turning inside its own width does not fold, it
    // pivots: it rolls up on edge and lays down a narrower mark. So the width
    // gives way to the corner.
    const reach = turnRadius(along, i, span) / (half * splay);
    widths[i] =
      widthProfile(along, i, leadIn, runOut, 1) *
      Math.min(1, Math.max(0.15, reach));
  }
  // The hairs, at the medium's own pitch (see `hairLayout`) — many and fine on
  // a wide head, few and fine on a narrow one.
  const { count: bristles, merged } = hairLayout(size, scale);
  // How far along the drag the head has emptied. A brush leaves the start of a
  // stroke wet and the end of it dry, and a bigger head holds more paint — so
  // this is measured against the load a head that size carries, not a constant.
  const capacity = 200 + size * 6;

  // The direction across the stroke at each sample. Hoisted out of the bristle
  // loop: it is a property of the *path*, and computing it per hair was the
  // same divide and square root done sixteen times over.
  const nxs = new Float64Array(count);
  const nys = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const { nx, ny } = normalAt(along, i);
    nxs[i] = nx;
    nys[i] = ny;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Every pass below goes down at the stroke's own opacity, and that is the
  // single decision that makes this look like paint.
  //
  // Look at a brushed mark: it is *solid*. Paint is opaque, and the hairs that
  // laid it down overlapped, so no part of the mark is a thread you can see
  // through — the texture is not darker threads on a pale wash, it is thin
  // slivers of bare paper where a hair lifted. Give each hair its own alpha
  // instead and the overlaps stack into a plaid of tide-marks that reads as
  // sixty translucent wires, which is what the mark is made of but nothing like
  // what it looks like.
  //
  // At one alpha there are no overlaps to see. The mark comes out solid, the
  // gaps come out as paper, and everything that used to be spent on making the
  // hairs distinct is spent on *where they are* instead.
  ctx.globalAlpha = alpha;

  // The wet core: the paint that pooled between the hairs while the head still
  // had a load. Kept to the middle of the head — a spine, not a slab. Any wider
  // and it tiles over the gaps the hairs leave, and the striations that are the
  // whole texture of a brushed mark disappear under it. It narrows as the load
  // goes, which is what opens the far end of a drag out into separate hairs
  // rather than stopping it with an edge.
  const core = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    core[i] = widths[i]! * (0.3 + 0.7 * loadAt(along[i]!.at, capacity, hard));
  }
  ctx.beginPath();
  ribbon(ctx, along, core, nxs, nys, half * 0.3 * splay);
  ctx.fill();

  // What the hairs are actually spaced at once they have been fitted across
  // this head — the pitch is what set their *number*, and the head has to be
  // covered by exactly that many. Solving for the gap that puts the outermost
  // hair's outer side on the edge of the head keeps the mark the width it says
  // it is, instead of the width plus one hair.
  const gap = (size * splay) / bristles;
  const inset = half * splay - gap / 2;

  // The hairs.
  for (let b = 0; b < bristles; b++) {
    // Where this hair sits across the head. Evenly spaced would be a comb: wet
    // hairs stick to their neighbours, so the head is really a row of little
    // tufts with partings between them. A hashed nudge of up to half a gap is
    // what puts those in — and where the nudge pulls two neighbours apart it
    // opens a parting that runs the whole length of the mark, which is what the
    // long white hairlines in a brushed stroke are. The same for ever, because
    // it is hashed off the hair's index and not drawn at random.
    const lane = bristles === 1 ? 0 : (b / (bristles - 1) - 0.5) * 2;
    // How far into the *side* of the head this hair is, 0 through the whole
    // body of it and 1 at the very outside. A head is uniform almost all the
    // way across and only comes apart at its two sides, so everything that
    // frays a mark — thinner hairs, drier ones, ones that stray out of line —
    // is gated on this rather than on the lane. Spread across the whole width
    // instead, the fray eats a third of the mark from each side and what is
    // left is a black bar with a comb either side of it.
    const edge = Math.max(0, (Math.abs(lane) - 0.72) / 0.28) ** 1.5;
    const clump = (hashedRandom(b * 5.3, 61) - 0.5) * 0.85 * gap;
    // How far out this hair actually reaches. Hairs are not cut to a common
    // length: without this the outer ones share an envelope and the mark ends
    // in a drawn outline rather than in a frayed edge.
    const reach = 1 + edge * (hashedRandom(b * 3.9, 23) - 0.45) * 0.16;
    const across = (lane * reach * inset + clump) / Math.max(1, half);
    // A hair is a hair wide — the pitch it sits at, give or take, and *not* a
    // share of the head. This is the whole point of `hairLayout`: widen the
    // head and you get more of these, never fatter ones. The only thing that
    // fattens them is a screen too coarse to show them all, where each strand
    // left is standing in for the ones that were dropped.
    //
    // Wider than the gap it sits in, so neighbours overlap and the wet part of
    // the mark closes up into one solid piece. What separates them is a hair
    // *lifting*, not a gap left between them — dry hairs make the texture,
    // thin ones would only make a mesh.
    //
    // Except at the edges: a head is fullest in the middle and thins to its
    // sides, and the hairs that show up alone — the ones in the fray — are the
    // outermost. Leaving them as fat as the ones buried in the middle is what
    // makes a frayed edge read as rope rather than as hair.
    ctx.lineWidth = Math.max(
      0.5,
      gap *
        merged *
        (1.05 + hashedRandom(b * 11.7, 5) * 0.35) *
        (1 - edge * 0.4),
    );
    // How readily this hair leaves the paper. The outer ones go first — they
    // carry the least paint and take the least pressure, and that is what makes
    // an edge fray rather than stop.
    const dryEdge =
      0.05 + edge * 0.3 * (1.3 - hard) + hashedRandom(b * 7.1, b * 3.3) * 0.08;
    // How long this hair's dry stretches run. Per hair, so the skips across the
    // head are not all the same length — one drift period for all of them reads
    // as a dashed line, which is a thing no brush does.
    const skipRun = 60 + hashedRandom(b * 2.7, 33) * 160;

    // Walk the stroke, emitting the runs where this hair is on the paper
    // straight into the path. Collecting them into arrays of points first cost
    // an object per sample per hair — thousands of allocations per stroke, for
    // a list read once and thrown away.
    ctx.beginPath();
    const strand = openStrand();
    for (let i = 0; i < count; i++) {
      const p = along[i]!;
      // Dry patches. A hair lifts for a *stretch* — the paper's tooth is not
      // per-sample — so the threshold is crossed by a slow drift; the ones at
      // the edge of the head run dry first, a fast drag skips more, and the far
      // end of a long stroke is drier than its start because the paint is gone.
      const wetness = driftNoise(p.at / skipRun, b + 91);
      const dryness =
        dryEdge +
        Math.min(0.2, p.speed / 120) +
        (1 - loadAt(p.at, capacity, hard)) * 0.85;
      if (i > 0 && i < count - 1 && wetness < dryness) {
        strand.lift(ctx);
        continue;
      }
      // The head twists as it travels — a slow drift along the stroke's own
      // length, so it survives resampling and never depends on the sample rate.
      // The bundle turns *together*: `twist` moves every hair at once, and the
      // per-hair wander on top of it is measured in hair widths rather than in
      // head widths, so neighbours stay neighbours and nothing weaves.
      // The wave reaches the far side of the head a moment after the near side
      // — a real head does not pivot about its centre — and that lag is what
      // stops the hairs from tracing a stack of parallel contour lines.
      const twist = (driftNoise((p.at + lane * 25) / 150, 7) - 0.5) * 0.08;
      const wander = (driftNoise(p.at / 90, b) - 0.5) * gap * 0.55;
      const offset = (across + twist) * half * widths[i]! + wander;
      strand.to(ctx, p.x + nxs[i]! * offset, p.y + nys[i]! * offset);
    }
    strand.lift(ctx);
    ctx.stroke();
  }
  ctx.restore();
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
 *  points are used once, in order, and never looked at again. */
function openStrand() {
  // The last point emitted into the path, held back one step so the curve
  // through it can be aimed at the midpoint of the next.
  let heldX = 0;
  let heldY = 0;
  let seen = 0;
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
      if (seen > 1) ctx.lineTo(heldX, heldY);
      seen = 0;
    },
  };
}

/** Trace the outline of a variable-width band through a path and leave it as
 *  the current path, ready to fill. Shared by the brush body and anything else
 *  that wants a stroke with a profile rather than a width. */
function ribbon(
  ctx: CanvasRenderingContext2D,
  along: readonly Trace[],
  widths: Float64Array,
  nxs: Float64Array,
  nys: Float64Array,
  half: number,
): void {
  const count = along.length;
  // The outline, as a flat run of x, y pairs: up one side and back down the
  // other. Flat rather than an array of points because it is walked once to
  // emit the path — a point object per sample is an allocation for a coordinate
  // pair that is read twice.
  const loop = new Float64Array(count * 4);
  for (let i = 0; i < count; i++) {
    const w = half * widths[i]!;
    const p = along[i]!;
    const nx = nxs[i]! * w;
    const ny = nys[i]! * w;
    loop[i * 2] = p.x + nx;
    loop[i * 2 + 1] = p.y + ny;
    // The far side is filled from the end backwards, which is the reversal the
    // outline needs without reversing anything.
    const back = loop.length - 2 - i * 2;
    loop[back] = p.x - nx;
    loop[back + 1] = p.y - ny;
  }
  ctx.moveTo(loop[0]!, loop[1]!);
  // Curved through the midpoints, like the freehand painter: an offset polyline
  // has a corner at every sample, and at this width they show.
  for (let i = 2; i < loop.length - 2; i += 2) {
    const ax = loop[i]!;
    const ay = loop[i + 1]!;
    ctx.quadraticCurveTo(
      ax,
      ay,
      (ax + loop[i + 2]!) / 2,
      (ay + loop[i + 3]!) / 2,
    );
  }
  ctx.closePath();
}
