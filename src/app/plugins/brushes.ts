// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stylistic painters.
//
// `ink.ts` holds the primitives every tool shares — apply the ink, stroke a
// polyline, draw a box. This module holds the *characterful* ones: the painters
// that make an airbrush read as an airbrush and a bristle brush as a brush,
// rather than as a pencil with a different width.
//
// Three rules hold all of them together:
//
//   - **Painting is a pure function of the stroke.** Every repaint — a pan, an
//     undo, the PNG export — repaints from the document, so a brush that
//     scattered its spray at random would shimmer. The scatter here comes from
//     a hash of the position instead: the same stroke grains the same way for
//     ever, on screen and in the exported file.
//   - **A tool is its medium, not its width.** A brush leaves bristle streaks
//     and thins when you move fast; an airbrush leaves a soft cloud that builds
//     up where you linger. Those are the things that make a mark look painted
//     rather than drawn, and they are what these painters are for. A stroke
//     that differs from the pencil only in `lineWidth` is not a tool.
//   - **Build the softness out of what the stroke knows.** No `ctx.filter` (it
//     is uneven across browsers and ruinous per stroke): a radial gradient stamp
//     and a handful of hashed offsets get there and look the same everywhere.
//   - **Draw nothing smaller than a pixel.** Every painter here takes the
//     `scale` it is being rasterised at (see `PaintDetail`) and thins its detail
//     to match: a mark fitted to a phone screen gets the stamps, hairs and
//     specks that screen can actually show, and not the three hundred that land
//     inside the same device pixel. It is the difference between a page of
//     airbrush that pans and one that does not.
//
// The medium's own numbers — a dab every fifth of a radius, a hair per 1.6
// pixels of head — stay written as the medium, and the screen only ever *takes
// away*. That is what keeps a stroke looking the same as you zoom into it, and
// what makes the PNG export (always 1:1) exactly what the tool intended.

import { withAlpha } from "../color.ts";
import type { Point, Stroke } from "../types.ts";
import { paintPath } from "./ink.ts";

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

/** How crisp a stroke's edge is, 0–1, defaulting to hard. */
function hardnessOf(stroke: Stroke): number {
  const value = stroke.hardness;
  if (typeof value !== "number" || Number.isNaN(value)) return 1;
  return Math.max(0, Math.min(1, value));
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

/** A freehand line with a soft edge: the core stroke, plus wider passes at
 *  falling alpha for however soft the nib is set. A hard nib paints exactly
 *  what `paintPath` would. */
export function paintSoftPath(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  hardness: number,
  scale = 1,
): void {
  const softness = 1 - Math.max(0, Math.min(1, hardness));
  // A halo narrower than a pixel is four passes of the same line. Draw it once.
  if (size * scale * softness < PIXEL) {
    paintPath(ctx, points, size);
    return;
  }
  if (softness <= 0.01) {
    paintPath(ctx, points, size);
    return;
  }
  const alpha = ctx.globalAlpha;
  const halo = 3;
  for (let i = halo; i >= 1; i--) {
    const spread = 1 + softness * 1.2 * (i / halo);
    ctx.globalAlpha = alpha * (0.22 / i);
    paintPath(ctx, points, size * spread);
  }
  // The core, thinned as the nib softens so a soft stroke reads as a fade
  // rather than a hard line wearing a halo.
  ctx.globalAlpha = alpha;
  paintPath(ctx, points, size * (1 - softness * 0.45));
}

/** Where along a path each sample sits, and how fast the hand was moving when
 *  it passed through — the two things a real brush's mark depends on.
 *
 *  Speed is read back out of the *sampled* geometry: the canvas records a point
 *  every 1.5 document pixels at the slowest, so the gaps between the points a
 *  stroke actually stored are how quickly the pointer crossed them. It costs
 *  nothing to store and it is the difference between a stroke that swells as
 *  you slow into a corner and one that is the same slab all the way round. */
export type Trace = { x: number; y: number; speed: number; at: number };

/** Resample a stroke evenly and carry the local speed along with it, smoothed
 *  over a few samples so one jittery pointer report can't pinch the mark. */
export function trace(points: readonly Point[], spacing: number): Trace[] {
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

/** The unit normal at `i` — the direction "across" the stroke, which is what a
 *  bristle is offset along and what a nib is measured across. */
export function normalAt(
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

/** How much of its full width the mark has at sample `i`: tapered in from both
 *  ends, and thinned where the hand was moving fast — a loaded brush leaves
 *  less paint the quicker it is dragged. */
function widthProfile(
  trace: readonly Trace[],
  i: number,
  ramp: number,
  speedThinning: number,
): number {
  const ends = Math.min(i, trace.length - 1 - i);
  const taper = Math.min(1, ends / Math.max(1, ramp));
  const eased = 0.12 + 0.88 * Math.sqrt(taper);
  const speed = trace[i]!.speed;
  const thinning = 1 / (1 + (speed / 26) * speedThinning);
  return eased * Math.max(0.35, thinning);
}

/** The airbrush.
 *
 *  A real airbrush is a cone of atomised paint: dense at the axis, fading to
 *  nothing at the rim, and *cumulative* — the colour comes from how long the
 *  cone dwelt on a spot, which is why you shade with it by circling rather than
 *  by pressing. Both halves of that are here:
 *
 *   - the cone is a **radial gradient stamp** repeated along the path at a
 *     fraction of its own radius, so the overlap of consecutive stamps is what
 *     makes a smooth band rather than a row of blobs. Each stamp is faint, so
 *     passing twice over the same place really is twice the paint;
 *   - the **grain** is a sparse scatter of sub-pixel dots over the top, thicker
 *     towards the rim, because atomised paint lands as specks and an edge with
 *     no speckle at all is the thing that reads as a computer gradient.
 *
 *  The gradient is built once per stroke at the origin and stamped by
 *  translating the context — a `createRadialGradient` per dab would dominate the
 *  cost of a long stroke. (Pre-rendering the cone into a sprite and blitting it
 *  instead was tried and is *slower*: a browser fills a small radial gradient
 *  about as fast as it blends a bitmap, and the sprite adds a texture upload per
 *  colour the drawing uses. The dabs are cheap; there are simply a lot of them.)
 *
 *  So the saving that matters is drawing fewer of them: the dabs **thin out with
 *  the zoom**. The medium wants one every fifth of a radius; the screen can only
 *  show one per pixel, and past that point the extra dabs are invisible.
 *  Dropping them would fade the mark, so the ones that remain are darkened to
 *  stand for the ones that went — the coverage a stack of faint dabs builds is
 *  `1-(1-a)^n`, and that inverts exactly. */
export function paintSpray(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  hardness: number,
  color: string,
  scale = 1,
): void {
  const radius = Math.max(3, size * 1.6);
  const hard = Math.max(0, Math.min(1, hardness));
  const alpha = ctx.globalAlpha;
  // The cone's radius on the screen it is bound for. Everything below is a
  // decision about what that many pixels can hold.
  const onScreen = radius * scale;

  // How much of the cone is at full strength before it starts to fall away. A
  // hard setting is a tight, almost-solid core; a soft one fades from the axis.
  const core = 0.08 + hard * 0.55;
  // Per-dab strength. Faint by design: coverage is built from overlap, and a
  // heavy dab would make the first pass opaque and the tool uncontrollable.
  const faint = 0.055 + hard * 0.05;

  if (onScreen < HAIRLINE) {
    // Pulled back far enough that the whole cone is inside one pixel. A cloud
    // this small is a line, so paint the line — at the weight the cone's own
    // build-up would have reached, so the drawing doesn't lighten as you zoom
    // out of it.
    ctx.save();
    ctx.globalAlpha = alpha * Math.min(1, faint * 6);
    paintPath(ctx, points, radius);
    ctx.restore();
    return;
  }

  // The spacing the medium wants, and the spacing this screen can resolve.
  const dense = Math.max(0.8, radius / 5);
  const step = Math.max(dense, PIXEL / scale);
  // How many of the medium's dabs each stamp now stands for, and the strength
  // that many faint dabs would have built up to.
  const merged = step / dense;
  const dab = merged > 1 ? 1 - (1 - faint) ** merged : faint;

  const along = resample(points, step);
  if (along.length === 0) return;

  const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  cone.addColorStop(0, withAlpha(color, dab * alpha));
  cone.addColorStop(core, withAlpha(color, dab * alpha * 0.82));
  for (const t of [0.25, 0.5, 0.75]) {
    const at = core + (1 - core) * t;
    // Quadratic falloff to nothing at the rim — the profile of a spray cone,
    // and the reason the edge has no line in it anywhere.
    cone.addColorStop(at, withAlpha(color, dab * alpha * 0.82 * (1 - t) ** 2));
  }
  cone.addColorStop(1, withAlpha(color, 0));

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = cone;
  // Moved rather than saved and restored per dab: the cone is anchored at the
  // origin, so each dab only has to walk the context from the last one to this
  // one, and the whole run is undone by one translate at the end.
  let atX = 0;
  let atY = 0;
  for (const p of along) {
    ctx.translate(p.x - atX, p.y - atY);
    atX = p.x;
    atY = p.y;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // The grain. Hashed off the position, so it is the same speckle on every
  // repaint and in the exported PNG — and skipped outright once the specks are
  // smaller than a pixel, where they are a hundred sub-pixel arcs that render
  // as nothing at all.
  if (onScreen < GRAIN_FLOOR) return;
  const grains = Math.max(3, Math.round(radius / 3));
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.1 * Math.min(2, merged);
  ctx.beginPath();
  for (const [index, p] of along.entries()) {
    if (index % 2 === 1) continue;
    for (let n = 0; n < grains; n++) {
      const angle = hashedRandom(p.x, p.y, n * 2 + 1) * Math.PI * 2;
      // Biased outwards: the specks that read are the ones past the core,
      // where the gradient has thinned enough to show them.
      const r = radius * (0.35 + 0.65 * hashedRandom(p.x, p.y, n * 2 + 2));
      const x = p.x + Math.cos(angle) * r;
      const y = p.y + Math.sin(angle) * r;
      const grain = 0.35 + hashedRandom(x, y, index) * 0.5;
      ctx.moveTo(x + grain, y);
      ctx.arc(x, y, grain, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

/** How big the cone has to be on screen, in device pixels, before its speckle
 *  is worth drawing. Below it the specks are sub-pixel arcs — a lot of path
 *  building for a texture the screen cannot show. */
const GRAIN_FLOOR = 4;

/** The bristle brush.
 *
 *  What makes a brush mark look like a brush mark is not its outline — it is
 *  that the paint arrives through **separate hairs**. The head splays, each
 *  hair carries its own load, and the ones at the edge run dry first; drag it
 *  quickly and it thins and streaks, slow into a curve and it pools. So this
 *  paints the stroke as a body with individual bristles dragged through it,
 *  rather than as a tapered ribbon:
 *
 *   - a **body** pass at low alpha, so the mark has paint in it between hairs;
 *   - **bristles**, each offset across the head by its own amount, wandering
 *     slowly as the head twists (hashed off the position, so the wander is the
 *     same on every repaint), each with its own load and its own dry patches;
 *   - a **width that answers the hand**: tapered at both ends, and thinner
 *     where the pointer was moving fast.
 *
 *  Hardness splays the head: a hard setting keeps the hairs together into
 *  something like an inking brush, a soft one lets them spread and go
 *  translucent at the edges. */
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
    // Too small to have a texture at all. A plain line at the body's weight is
    // what the hairs would average out to anyway.
    ctx.save();
    ctx.globalAlpha = alpha * (0.55 + hard * 0.3);
    paintPath(ctx, points, size);
    ctx.restore();
    return;
  }

  // Samples no closer than a device pixel: the medium wants one every quarter
  // width, and past a pixel apart they are the same pixel twice.
  const along = trace(points, Math.max(1, size / 4, PIXEL / scale));

  if (along.length < 2) {
    // A tap: a single dab of the head, not a perfect disc.
    const p = along[0] ?? points[0];
    if (!p) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, half, half * 0.82, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const count = along.length;
  const ramp = Math.max(2, Math.min(10, Math.floor(count / 5)));
  const widths = new Float64Array(count);
  for (let i = 0; i < count; i++) widths[i] = widthProfile(along, i, ramp, 1);
  // How far the head splays: tight when hard, spread when soft.
  const splay = 1 + (1 - hard) * 0.5;
  // The hairs the medium splays into, and the most this screen can tell apart —
  // one per device pixel of head, because two hairs inside one pixel are one
  // hair drawn twice.
  const inHead = Math.max(5, Math.min(16, Math.round(size / 1.6)));
  const bristles = Math.max(
    2,
    Math.min(inHead, Math.max(3, Math.round(onScreen / PIXEL))),
  );

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

  // The body — the paint that lands between the hairs. Low alpha, and narrower
  // than the head, so the outer bristles read as separate strands rather than
  // as the edge of a slab.
  ctx.globalAlpha = alpha * (0.28 + hard * 0.34);
  ctx.beginPath();
  ribbon(ctx, along, widths, nxs, nys, half * 0.72 * splay);
  ctx.fill();

  // The hairs.
  for (let b = 0; b < bristles; b++) {
    // Where this hair sits across the head, and how loaded it is. The outer
    // ones carry less — that is what makes a brush edge fray instead of stop.
    const across = bristles === 1 ? 0 : (b / (bristles - 1) - 0.5) * 2;
    const load =
      (0.35 + hashedRandom(b * 7.1, b * 3.3) * 0.5) *
      (1 - Math.abs(across) * 0.3);
    ctx.globalAlpha = alpha * load * (0.5 + hard * 0.4);
    // Each hair is its own thickness, so the strands read as strands rather
    // than as a comb.
    ctx.lineWidth = Math.max(
      0.4,
      (size / bristles) * (0.7 + hashedRandom(b * 11.7, 5) * 0.8),
    );
    const dryEdge = 0.1 + Math.abs(across) * 0.22 * (1 - hard);

    // Walk the stroke, emitting the runs where this hair is on the paper
    // straight into the path. Collecting them into arrays of points first cost
    // an object per sample per hair — thousands of allocations per stroke, for
    // a list read once and thrown away.
    ctx.beginPath();
    const strand = openStrand();
    for (let i = 0; i < count; i++) {
      const p = along[i]!;
      // Dry patches. A hair lifts for a *stretch* — the paper's tooth is not
      // per-sample — so the threshold is crossed by a slow drift, and the ones
      // at the edge of the head run dry first.
      const wetness = driftNoise(p.at / 26, b + 91);
      const dryness = dryEdge + Math.min(0.2, p.speed / 120);
      if (i > 0 && i < count - 1 && wetness < dryness) {
        strand.lift(ctx);
        continue;
      }
      // The head twists as it travels — a slow drift along the stroke's own
      // length, so it survives resampling and never depends on the sample rate.
      const wander = (driftNoise(p.at / 34, b) - 0.5) * 0.55;
      const offset = (across * splay + wander) * half * widths[i]!;
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

// The crayon used to live here — five jittered passes of a plain line, with a
// wobble scaled off the stroke's own width. It has moved to `crayon.ts` and is
// built out of the paper's grain instead: see that file's header for why the
// texture of a wax mark cannot be a function of how wide the stick is.

/** The calligraphy nib: a flat edge held at a fixed angle, so the line is broad
 *  across the nib and hairline along it. Each step is a quad between the two
 *  ends of the nib at consecutive points. */
export function paintCalligraphy(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
): void {
  const along = resample(points, Math.max(1, size / 4, PIXEL / scale));
  const first = along[0];
  if (!first) return;
  // 45° up to the right — the angle a right-handed italic hand holds.
  const angle = -Math.PI / 4;
  const half = size;
  const nx = Math.cos(angle) * half;
  const ny = Math.sin(angle) * half;
  if (along.length === 1) {
    ctx.beginPath();
    ctx.moveTo(first.x - nx, first.y - ny);
    ctx.lineTo(first.x + nx, first.y + ny);
    ctx.lineWidth = Math.max(1, size / 4);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  for (let i = 1; i < along.length; i++) {
    const a = along[i - 1]!;
    const b = along[i]!;
    ctx.moveTo(a.x - nx, a.y - ny);
    ctx.lineTo(a.x + nx, a.y + ny);
    ctx.lineTo(b.x + nx, b.y + ny);
    ctx.lineTo(b.x - nx, b.y - ny);
    ctx.closePath();
  }
  ctx.fill();
}

/** The neon pen: a wide, faint aura under a bright thin core, which is what
 *  reads as "glowing" without a filter. */
export function paintGlow(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
): void {
  const alpha = ctx.globalAlpha;
  for (const [spread, weight] of [
    [3.2, 0.1],
    [2.2, 0.14],
    [1.4, 0.22],
  ] as const) {
    // An aura that has closed to within a pixel of the core is not an aura.
    if ((spread - 0.55) * size * scale < PIXEL) continue;
    ctx.globalAlpha = alpha * weight;
    paintPath(ctx, points, size * spread);
  }
  ctx.globalAlpha = alpha;
  paintPath(ctx, points, Math.max(1, size * 0.55));
}

/** Fill an area given as closed outlines — what the paint bucket leaves behind.
 *
 *  Even-odd, so a loop that lies inside another is a hole: an island of marks
 *  inside a flooded area stays unpainted, which is what makes a fill land
 *  *behind* the drawing rather than over it. */
export function paintRegion(
  ctx: CanvasRenderingContext2D,
  contours: readonly Point[][],
): void {
  ctx.beginPath();
  for (const loop of contours) {
    const first = loop[0];
    if (!first || loop.length < 3) continue;
    // Curved through the midpoints rather than joined corner to corner. A
    // traced outline is a staircase of whatever the snapshot's resolution was,
    // and at eight hundred percent those steps are the difference between a
    // painted fill and a paint-bucket-shaped rectangle. Smoothing them here
    // costs the document nothing — the stored outline stays as small as it was.
    const mid = (a: Point, b: Point) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
    const start = mid(loop[loop.length - 1]!, first);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < loop.length; i++) {
      const here = loop[i]!;
      const next = loop[(i + 1) % loop.length]!;
      const to = mid(here, next);
      ctx.quadraticCurveTo(here.x, here.y, to.x, to.y);
    }
    ctx.closePath();
  }
  ctx.fill("evenodd");
}

/** The stroke's hardness, for painters that take it as an argument. */
export function strokeHardness(stroke: Stroke): number {
  return hardnessOf(stroke);
}
