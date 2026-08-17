// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bristle brush: a head dragged across paper.
//
// The one painter with a module to itself, because it is the only one modelling
// a physical *object* rather than a way of laying down colour. An airbrush is a
// cone and a crayon is a wobble, but a brush is a head of hair on a handle: it
// holds a load and spends it, it is wider than the wiggles you ask it to
// follow, it cannot turn inside its own width, and the mark it leaves is opaque
// with the hairs' partings scratched through it. Each of those is a function
// below, and together they are most of what separates a brush stroke from a
// thick line.
//
// What the head *is* — how the bundle breaks into strands, how much paint it
// holds, and how a mark exactly as wide as the head is fitted across those
// strands — lives next door in `head.ts`. Nothing there knows about a stroke;
// everything here is about dragging one.
//
// The numbers here are the medium's, in document pixels, and the screen only
// ever takes detail away — never adds it. That is what keeps a mark looking the
// same as you zoom into it and makes the PNG export exactly what the tool
// intended.

import type { Rect } from "../geometry.ts";
import type { Point } from "../types.ts";
import { mm } from "../units.ts";
import {
  driftWalk,
  HAIRLINE,
  hashedRandom,
  normalAt,
  PIXEL,
  trace,
  type Trace,
} from "./grain.ts";
import {
  BLADE,
  capacityOf,
  coreShare,
  fitHead,
  loadAt,
  ROUND_HEAD,
  TWIST_STRAY,
  WANDER_STRAY,
  type BrushHead,
} from "./head.ts";
import { paintPath } from "./ink.ts";

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
  const n = along.length;
  // Running sums, so a window of any width costs one subtraction per sample
  // rather than one addition per sample per tap. A two-inch flat smooths over
  // tens of samples either side, and a long drag has thousands of them: summed
  // the obvious way that is the single most expensive thing in the painter
  // before a hair has been placed, and it is the same numbers added over and
  // over.
  const sumX = new Float64Array(n + 1);
  const sumY = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sumX[i + 1] = sumX[i]! + along[i]!.x;
    sumY[i + 1] = sumY[i]! + along[i]!.y;
  }
  const out: Trace[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.min(window, i, n - 1 - i);
    if (k === 0) {
      out[i] = along[i]!;
      continue;
    }
    const lo = i - k;
    const hi = i + k + 1;
    const span = k * 2 + 1;
    out[i] = {
      ...along[i]!,
      x: (sumX[hi]! - sumX[lo]!) / span,
      y: (sumY[hi]! - sumY[lo]!) / span,
    };
  }
  return out;
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
  // …and how much a quick one thins. A head dragged fast rides up and lays down
  // less of itself, which is real — but it was worth nearly half the width at
  // the top end, and a mark that is only the size on the button when the hand
  // is standing still is not a brush of that size. Halved, and floored well
  // above where it was: what a round brush is *for* is laying the same width
  // whichever way and however fast you pull it, and everything a flat does
  // differently it does through its blade rather than through this.
  const thinning = 1 / (1 + (speed / 46) * speedThinning);
  return taper * Math.max(0.72, thinning);
}

/** The paper's grain, in document pixels: how far you travel before the sheet
 *  is a different height under the head. Everything a mark does that belongs to
 *  the *page* rather than to the brush is read off it — the hairs lift over the
 *  peaks, and the paint pools in the dips — which is why one number serves both
 *  and why it is written in document pixels rather than as a share of the head:
 *  the sheet does not get coarser because you picked up a wider brush.
 *
 *  Short on purpose. A grain measured in half-stroke-lengths, as it was, cannot
 *  interrupt a stroke at all: every hair reads one value of it for its whole run
 *  and either draws or does not, which is a bundle of wires rather than a mark
 *  that is broken all over.
 *
 *  Just under two millimetres, which is the pitch of the ridges on cold-pressed
 *  stock — the paper a brush is usually being dragged over. */
const TOOTH = mm(1.8);

/** How much coarser the pooling is than the grain it pools in. A dip that holds
 *  paint is several grains across, so a wet mark is blotchy at a scale you can
 *  see rather than speckled at one you cannot. */
const POOL_GRAIN = 2.6;

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
 *  The four numbers past the geometry are four different things about the
 *  brush, and none of them is a restyling of another:
 *
 *   - `hardness` is how wet and how gathered the head is — a loaded, tight head
 *     that covers solidly at the top of the range, a spent dry one that leaves
 *     most of its length in streaks at the bottom. It is the pressure series on
 *     a reference sheet, top to bottom.
 *   - `gauge` is the hair itself: which brush off the rack this is, milled from
 *     fine sable or coarse hog (see `hairLayout`). It changes the streaks and
 *     never the width.
 *   - `fray` is the *state* of that head rather than its make — how far the
 *     bundle has come apart with use. A new flat cuts a crisp side; one that
 *     has been washed a hundred times has a fringe on it.
 *   - `bleed` is the paper's doing, not the brush's: how far a wet edge wicks
 *     into the sheet before it dries. It is the only thing here that softens an
 *     edge, and it rests at nothing, because bristle on cartridge paper does
 *     not bleed and a mark that always did would look damp.
 *
 *  `clip` is the patch of page the caller is actually keeping (see
 *  `PaintDetail.clip`), and it is the difference between a zoomed-in pan
 *  costing the strip of paper it exposed and costing every mark that crosses
 *  it end to end. A brush is one path per *hair* rather than one stamp per
 *  sample, so it cannot be culled a stroke at a time the way the airbrush's
 *  cones can — the hair is lifted over the stretches of the drag that are off
 *  screen instead, which saves exactly the same work one sample at a time. */
export function paintBrush(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  hardness: number,
  scale = 1,
  gauge = 1,
  fray = 1,
  bleed = 0,
  head: BrushHead = ROUND_HEAD,
  clip?: Rect,
): void {
  const alpha = ctx.globalAlpha;
  const hard = Math.max(0, Math.min(1, hardness));
  const half = size / 2;
  // The head's width on the screen it is bound for. A brush drawn four pixels
  // wide has room for four hairs, however many the medium would splay.
  const onScreen = size * scale;

  if (onScreen < HAIRLINE) {
    // Too small to have a texture at all. A plain line at the weight the hairs
    // would have covered to is what they average out to anyway — and how much
    // that is, is the whole of the difference between a loaded head and a dry
    // one, so it has to survive the collapse or a page zoomed out would show
    // every brush mark on it at the same weight.
    ctx.save();
    ctx.globalAlpha = alpha * (0.42 + hard * 0.58);
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
    // A tap: a single dab of the head, not a perfect disc — and on a flat, the
    // print of the blade, which is the one mark that shows what shape the
    // ferrule is.
    const p = along[0] ?? points[0];
    if (!p) return;
    ctx.save();
    ctx.beginPath();
    if (head.shape === "flat") {
      ctx.ellipse(p.x, p.y, half, half * BLADE, head.angle, 0, Math.PI * 2);
    } else {
      // A cone of hair pressed onto paper prints very nearly the circle it is.
      // Not exactly — nothing wet lands as a drawn disc — but the squashed oval
      // this used to leave was the shape of a flat, and on the one tool whose
      // whole character is that it draws the same width in every direction.
      ctx.ellipse(p.x, p.y, half, half * 0.94, 0.6, 0, Math.PI * 2);
    }
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
  // The head itself: its strands, where each of them sits across it, and how
  // far the lanes could be spread and still leave a mark `size` wide (see
  // `head.ts`). All of it settled before a hair is drawn.
  const worn = Math.max(0, Math.min(2, fray));
  const {
    splay,
    gap,
    inset,
    count: bristles,
    lanes,
    edges,
    clumps,
    pens,
  } = fitHead(size, hard, scale, gauge, worn);
  // How far along the drag the head has emptied — see `capacityOf`.
  const capacity = capacityOf(size, hard);
  // How far a wet edge wicks into the sheet, in document pixels — the `bleed`
  // dial, measured against the head because a fat brush puts down more water.
  // Zero unless the dial has been moved, and zero as well once the halo is
  // thinner than a device pixel, where it is a second pass of the same line
  // for a softness nobody can see.
  const wickReach =
    Math.max(1.5, size * 0.09) * Math.max(0, Math.min(2, bleed));
  const wick = wickReach * scale >= PIXEL ? wickReach : 0;

  // The direction across the stroke at each sample. Hoisted out of the bristle
  // loop: it is a property of the *path*, and computing it per hair was the
  // same divide and square root done sixteen times over.
  //
  // The load left in the head and the paper's tooth are hoisted for exactly the
  // same reason — both are properties of *where you are along the stroke*, the
  // same for every hair crossing that place, and both are read once per hair
  // per sample. On a wide head that is fifty identical noise reads and fifty
  // identical exponentiations per sample.
  const nxs = new Float64Array(count);
  const nys = new Float64Array(count);
  const loads = new Float64Array(count);
  const teeth = new Float64Array(count);
  const tooth = driftWalk();
  tooth.reset(3);
  for (let i = 0; i < count; i++) {
    const { nx, ny } = normalAt(along, i);
    nxs[i] = nx;
    nys[i] = ny;
    loads[i] = loadAt(along[i]!.at, capacity, hard);
    teeth[i] = tooth.at(along[i]!.at / TOOTH);
  }

  const widths = new Float64Array(count);
  // The corner the path turns, measured over about a half-width of travel.
  const span = Math.max(1, Math.round(half / Math.max(1, spacing)));
  // The blade, for a flat head: the direction the ferrule holds the hair in.
  // A round has none, and every width below is then the head's own.
  const bladeX = head.shape === "flat" ? Math.cos(head.angle) : 0;
  const bladeY = head.shape === "flat" ? Math.sin(head.angle) : 0;
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
    // …and, on a flat, how much of the blade is actually across the stroke.
    // A one-stroke brush pulled square across itself lays its whole width; the
    // same brush pulled along its edge lays the thickness of the bundle and
    // nothing more. That single projection is the whole of what a chisel
    // ferrule does, and it is why one stroke of a flat swells and thins as it
    // goes round a curve without the hand doing anything at all.
    const across =
      head.shape === "flat"
        ? Math.max(BLADE, Math.abs(bladeX * nxs[i]! + bladeY * nys[i]!))
        : 1;
    widths[i] =
      widthProfile(along, i, leadIn, runOut, 1) *
      Math.min(1, Math.max(0.15, reach)) *
      across;
  }
  // How much of the medium's texture a head this narrow can show at all.
  //
  // The grain is the *paper's*, so it does not shrink with the brush: a liner
  // is narrower than one of the dips a house brush skips over, rides the sheet
  // instead of catching on it, and leaves a line. Without this the same skip
  // rate applies to a nine-hair head as to a fifty-hair one, and the app's
  // default brush — fifteen document pixels, which is most of the marks in most
  // drawings — comes out as a dashed ghost rather than as a stroke.
  const grainShare = 0.35 + 0.65 * Math.min(1, (size / (TOOTH * 1.6)) ** 0.7);
  // How far the mark runs, so a hair can be cut short of either end of it.
  const total = along[count - 1]!.at;

  // Which samples can put ink where the caller is keeping any (see `clip`), and
  // the first and last that can. A sample reaches half a head plus a wet edge
  // off its own point, and a curve drawn through the midpoints reaches a sample
  // either side, so the box is grown by that much before it is asked.
  //
  // Everything above this line is one pass over the path and costs what the
  // path costs. Everything below it is one pass over the path *per hair*, which
  // on a wide head is fifty of them — so this is the one place in the painter
  // where knowing what is on screen is worth the asking.
  const shown = visibleAlong(
    along,
    clip,
    half * splay + wick + spacing + PIXEL / Math.max(0.01, scale),
  );
  const first = shown ? shown.first : 0;
  const last = shown ? shown.last : count - 1;
  if (first > last) return;

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

  // The wet core: the paint that pooled between the hairs and bridged them into
  // one body. How much of the head it covers is `coreShare` — a slab under a
  // loaded head, a narrow spine under a dry one, nothing at all at the bottom
  // of the range — and it narrows further as the load goes, which is what opens
  // the far end of a drag out into separate hairs rather than stopping it with
  // an edge.
  //
  // This is the single number that separates the five marks in a pressure
  // series, and it is why it must be free to reach both ends: pinned to a third
  // of the head, as it was, every brush in the rack lays down the same slab
  // with the same handful of scratches in it.
  //
  // It also stops short of both ends of the mark, and stops *bluntly*. Paint
  // pools where the head has been bearing down for a while; at the tips there
  // is nothing over it and nowhere for it to have come from. Running it the
  // whole length put a rounded bead on the end of every heavy stroke — a filled
  // ribbon has to close, and a closed ribbon at full width is a blob — and
  // narrowing it to nothing instead only traded the bead for a spearpoint,
  // because a band whose width goes to zero *is* a point. So the band keeps its
  // width and the run it covers is simply shorter, which is the one shape a
  // pool of paint under a squared-off head can have.
  //
  // And it swells and shrinks as it goes, on the same reading of the paper's
  // tooth the hairs lift on. Paint does not pool evenly: it floods where the
  // sheet dips and thins over the high grain, so a wet mark is patchily solid.
  // A spine of constant width is the one thing in a brushed stroke that looks
  // extruded, because its two long edges are a pair of curves nothing on paper
  // ever draws.
  const pool = half * coreShare(hard) * splay;
  if (pool > 0) {
    const core = new Float64Array(count);
    const pooling = driftWalk();
    pooling.reset(3);
    for (let i = 0; i < count; i++) {
      core[i] =
        widths[i]! *
        (0.15 + 0.85 * loads[i]!) *
        (0.55 + pooling.at(along[i]!.at / (TOOTH * POOL_GRAIN)) * 0.8);
    }
    const pooled = Math.min(
      Math.round(Math.min(size * 0.35, total * 0.25) / Math.max(0.5, spacing)),
      Math.floor((count - 1) / 2),
    );
    ctx.beginPath();
    // Held to the visible run as well as to the pool's own inset. A band that
    // stops off screen stops bluntly, which is what it does at its own ends
    // anyway — so the picture inside the patch is the picture a whole ribbon
    // would have left there.
    ribbon(
      ctx,
      along,
      core,
      nxs,
      nys,
      pool,
      Math.max(pooled, first),
      Math.min(count - 1 - pooled, last),
    );
    // The pool wicks too, and it has to be stroked before it is filled: the halo
    // is centred on the outline, so half of it lands inside the body where the
    // fill then covers it. Stroked after, that inside half would print as a
    // paler ring just within the edge of every heavy mark.
    if (wick > 0) wickPass(ctx, alpha, 0, wick);
    ctx.fill();
  }

  // The three drifts a hair reads as it travels: whether it is on the paper,
  // how far it has wandered out of its lane, and where the bundle has twisted
  // to. One walker each rather than a hash per sample — a wide head asks the
  // same lattice cell for the same answer a dozen times in a row (see
  // `driftWalk`), and this loop is the one place in the app where that
  // multiplies by fifty.
  const dry = driftWalk();
  const drift = driftWalk();
  const twisting = driftWalk();
  twisting.reset(7);

  // The hairs.
  for (let b = 0; b < bristles; b++) {
    const lane = bristles === 1 ? 0 : (b / (bristles - 1) - 0.5) * 2;
    const edge = edges[b]!;
    const across = (lanes[b]! * inset + clumps[b]!) / Math.max(1, half);
    ctx.lineWidth = pens[b]!;
    // How readily this hair leaves the paper — the fraction of the drag it
    // spends off it, before the load and the paper's tooth have their say.
    //
    // Mostly this is how dry the head is, and that is deliberate: look at a
    // pressure series and each mark is *evenly* streaky down its whole length.
    // The paint running out is a second, slower thing that happens along the
    // stroke (the term below), not what makes a light-pressure mark light.
    //
    // The outer hairs go first whatever the head — they carry the least paint
    // and take the least pressure, and that is what makes an edge fray rather
    // than stop.
    //
    // It rises across the head as well as at its very sides. A head does not
    // bear on the paper evenly — the middle of the bundle is where the handle's
    // weight goes — so a light mark is a mass that is thickest down its centre,
    // not a rectangle of evenly spaced wires with two frayed borders.
    const dryEdge =
      0.03 +
      (1 - hard) * 0.3 +
      lane * lane * (1 - hard) * 0.24 +
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
    const skipRun = Math.max(
      14,
      size * (0.3 + hashedRandom(b * 2.7, 33) * 0.8),
    );
    // Where this hair touches down and where it leaves, as a distance in from
    // each end of the mark. A head is a cut bundle, not a blade: the hairs are
    // near enough level, which is why a brushed mark starts and stops bluntly
    // rather than tapering — but only near enough, and the few tenths of a
    // head-width they disagree by is the ragged edge across both ends of every
    // stroke on a reference sheet. The lift end frays further than the landing
    // one, because by then the head is emptier and the outermost hairs have the
    // least holding them down.
    //
    // Held to a fraction of the mark as well as of the head, because a dab is
    // shorter than the brush that made it: unbounded, a head-width of fray at
    // each end of a stroke a third of a head long cuts every hair away and
    // leaves the pooled middle on its own.
    const ragged = Math.min(size, total * 0.5);
    const lands = hashedRandom(b * 4.7, 13) ** 1.6 * ragged * 0.1;
    const lifts =
      hashedRandom(b * 6.1, 29) ** 1.4 * ragged * (0.16 + edge * 0.34);

    // Walk the stroke, emitting the runs where this hair is on the paper
    // straight into the path. Collecting them into arrays of points first cost
    // an object per sample per hair — thousands of allocations per stroke, for
    // a list read once and thrown away.
    ctx.beginPath();
    const strand = openStrand();
    dry.reset(b + 91);
    drift.reset(b);
    for (let i = first; i <= last; i++) {
      const p = along[i]!;
      // Somewhere the caller is not keeping, if it said (see `shown`). The hair
      // lifts over it exactly as it lifts over a dry patch, and what it skips is
      // off screen — so the mark inside the patch is the mark a whole one would
      // have left there, for the cost of the part that shows.
      if (shown && !shown.at[i]) {
        strand.lift(ctx);
        continue;
      }
      // Before the far end of this hair, or past it: the head has not touched
      // down yet, or has already rolled off.
      if (p.at < lands || p.at > total - lifts) {
        strand.lift(ctx);
        continue;
      }
      // Dry patches. A hair lifts for a *stretch* — the paper's tooth is not
      // per-sample — so the threshold is crossed by a slow drift; the ones at
      // the edge of the head run dry first, a fast drag skips more, and the far
      // end of a long stroke is drier than its start because the paint is gone.
      //
      // `tooth` is the one part of that which belongs to the paper rather than
      // to the hair, so every hair reads the same value of it at the same place:
      // it lifts the whole head at once for a moment, which is what puts the
      // breaks *across* a mark rather than only along it. Alone, per-hair drift
      // gives a mark that is combed but never interrupted.
      const tooth = teeth[i]!;
      const wetness = dry.at(p.at / skipRun);
      // Capped short of certainty: a head that has run out is a head laying
      // down a scratchy mark, not one laying down nothing, and a stroke that
      // faded to nothing would be one the user could not finish.
      //
      // The load's share of that is the largest term by some way, and it is
      // meant to be: what ends a brushed stroke is the paint going, not the
      // hand lifting (see `capacityOf`). It is also the term that decides what
      // a long drag *costs* — a lifted hair is a run of samples that never
      // reach the path — so the far end of one gets cheaper as it gets drier,
      // which is the right way round.
      const dryness =
        Math.min(
          0.72,
          dryEdge +
            Math.min(0.2, p.speed / 120) +
            (1 - loads[i]!) * 0.55 +
            (0.5 - tooth) * 0.22,
        ) * grainShare;
      if (wetness < dryness) {
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
      const twist =
        (twisting.at((p.at + lane * 25) / 150) - 0.5) * TWIST_STRAY * 2;
      const wander =
        (drift.at(p.at / 90) - 0.5) * gap * WANDER_STRAY * (0.5 + worn * 0.5);
      const offset = (across + twist) * half * widths[i]! + wander;
      strand.to(ctx, p.x + nxs[i]! * offset, p.y + nys[i]! * offset);
    }
    strand.lift(ctx);
    // The wick, where the sheet is soft enough to take one — drawn under the
    // hair rather than over it, so the hair stays as opaque as it was and only
    // the outside of it is softened.
    //
    // How far it reaches is the paper's business and not the hair's, so every
    // hair on the head wicks the same distance. That also keeps the overlaps
    // shallow: neighbouring wicks meet at their rims rather than stacking, and
    // the tide-marks a per-hair alpha would print stay out of the mark.
    if (wick > 0) wickPass(ctx, alpha, ctx.lineWidth, wick);
    ctx.stroke();
  }
  ctx.restore();
}

/** Which samples of a traced path can put ink inside `clip`, padded by how far
 *  a head sitting on one of them reaches — plus the first and last that can, so
 *  a caller can skip the two ends of a drag outright rather than walking them.
 *
 *  `null` when there is no patch to keep to, which is every caller that wants
 *  the whole mark: the PNG export, a thumbnail, a size preview. Nothing then
 *  tests anything, and the painter walks the path exactly as it always did.
 *
 *  A flat array of flags rather than a list of runs because it is read once per
 *  sample per hair and the read has to be a bounds-free index. */
function visibleAlong(
  along: readonly Trace[],
  clip: Rect | undefined,
  pad: number,
): { at: Uint8Array; first: number; last: number } | null {
  if (!clip) return null;
  const left = clip.x - pad;
  const right = clip.x + clip.width + pad;
  const top = clip.y - pad;
  const bottom = clip.y + clip.height + pad;
  const at = new Uint8Array(along.length);
  let first = along.length;
  let last = -1;
  for (let i = 0; i < along.length; i++) {
    const p = along[i]!;
    if (p.x < left || p.x > right || p.y < top || p.y > bottom) continue;
    at[i] = 1;
    if (i < first) first = i;
    last = i;
  }
  return { at, first, last };
}

/** Stroke the current path as a damp halo around whatever is about to be drawn
 *  over it: two passes, the outer one wider and fainter.
 *
 *  Two rather than one because a wick *fades* — a single pass has a uniform
 *  alpha and therefore a hard outer edge, which is a drop shadow rather than a
 *  damp patch. Two rather than the feathered fill's three because this runs per
 *  hair and there can be fifty of them, and the third pass buys a gradient step
 *  nobody can see for a third more strokes.
 *
 *  It is the one thing in this painter drawn at less than the stroke's own
 *  opacity, and it is allowed to be because it is not the mark: it is the
 *  thinner deposit at the edge of the mark, which is exactly what a wick is. */
function wickPass(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  pen: number,
  wick: number,
): void {
  ctx.globalAlpha = alpha * 0.14;
  ctx.lineWidth = pen + wick * 2;
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.2;
  ctx.lineWidth = pen + wick;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = pen;
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
 *  that wants a stroke with a profile rather than a width.
 *
 *  `from` and `to` are the first and last sample the band covers, so it can stop
 *  short of the path it follows without tapering — a squared-off end rather
 *  than a point or a bead. They are also where a caller cuts the band to the
 *  patch it is keeping: an end that lands off screen is squared off out there,
 *  where nobody is looking. */
function ribbon(
  ctx: CanvasRenderingContext2D,
  path: readonly Trace[],
  allWidths: Float64Array,
  allNxs: Float64Array,
  allNys: Float64Array,
  half: number,
  from = 0,
  to = path.length - 1,
): void {
  const start = Math.max(0, from);
  const end = Math.min(path.length - 1, to);
  const count = end - start + 1;
  if (count < 2) return;
  // The outline, as a flat run of x, y pairs: up one side and back down the
  // other. Flat rather than an array of points because it is walked once to
  // emit the path — a point object per sample is an allocation for a coordinate
  // pair that is read twice.
  const loop = new Float64Array(count * 4);
  for (let i = 0; i < count; i++) {
    const at = start + i;
    const w = half * allWidths[at]!;
    const p = path[at]!;
    const nx = allNxs[at]! * w;
    const ny = allNys[at]! * w;
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
