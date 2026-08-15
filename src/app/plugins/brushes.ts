// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stylistic painters.
//
// `ink.ts` holds the primitives every tool shares — apply the ink, stroke a
// polyline, draw a box. This module holds the *characterful* ones: the painters
// that make an airbrush read as an airbrush and a nib as a nib, rather than as
// a pencil with a different width. (Two outgrew this file and have modules of
// their own — the bristle brush in `bristle.ts` and the crayon in `crayon.ts`;
// the hashes they all scatter with, and the walk along a path they lay texture
// down on, are in `grain.ts`.)
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
// The medium's own numbers — a dab every fifth of a radius, a hair every couple
// of pixels of head — stay written as the medium, and the screen only ever
// *takes away*. That is what keeps a stroke looking the same as you zoom into
// it, and what makes the PNG export (always 1:1) exactly what the tool
// intended.

import { withAlpha } from "../color.ts";
import type { Point, Stroke } from "../types.ts";
import { HAIRLINE, PIXEL, hashedRandom, resample } from "./grain.ts";
import { paintPath } from "./ink.ts";

/** How crisp a stroke's edge is, 0–1, defaulting to hard. */
function hardnessOf(stroke: Stroke): number {
  const value = stroke.hardness;
  if (typeof value !== "number" || Number.isNaN(value)) return 1;
  return Math.max(0, Math.min(1, value));
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
  flow = 1,
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
  // Per-dab strength — how far the trigger is pulled. Faint by design: coverage
  // is built from overlap, and a heavy dab would make the first pass opaque and
  // the tool uncontrollable. `flow` is the user moving that line, and it is
  // capped short of opaque for exactly the same reason: an airbrush that covers
  // in one dab is a marker.
  //
  // What "faint" is worth was set when the cone was three times the nib it was
  // asked for: a mark that wide reaches the same coverage off far weaker dabs,
  // and once the cone came down to the width the toolbar actually says (see the
  // airbrush's `sizeScale`) the trigger at rest was laying down a haze. So the
  // dab is about twice what it was — an airbrush held still still builds, and a
  // single pass at flow 100% now leaves a mark you can see.
  const faint = Math.min(0.55, (0.11 + hard * 0.09) * Math.max(0, flow));

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

// The crayon used to live here — five jittered passes of a plain line, with
// a wobble scaled off the stroke's own width. It has moved to `crayon.ts` and
// is built out of the paper's grain instead: see that file's header for why
// the texture of a wax mark cannot be a function of how wide the stick is.

/** The calligraphy nib: a flat edge held at a fixed angle, so the line is broad
 *  across the nib and hairline along it. Each step is a quad between the two
 *  ends of the nib at consecutive points.
 *
 *  All the quads go into **one path filled once**, so the seams between them
 *  disappear instead of showing as darker joins under a translucent ink. That
 *  makes their *winding* load-bearing: a canvas fills a path by the nonzero
 *  rule, and a quad laid down while travelling one way round the nib winds the
 *  opposite way to one laid down travelling back. Where the two overlap the
 *  winding numbers cancel and the fill leaves a hole — which is why a
 *  stylistic `l`, drawn up and then back down over itself, used to look like it
 *  had erased the stroke underneath it. So every quad is emitted the same way
 *  round: the overlap then winds to two rather than to zero, and doubling back
 *  paints over the mark the way a real nib does. */
export function paintCalligraphy(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  angle = -Math.PI / 4,
): void {
  const along = resample(points, Math.max(1, size / 4, PIXEL / scale));
  const first = along[0];
  if (!first) return;
  // The angle the nib is held at — 45° up to the right by default, which is
  // what a right-handed italic hand does. It is the one thing about a broad nib
  // that a writer actually changes, so the tool offers it as a dial and hands
  // it down here (see `builtin/dials.ts`).
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
    // Which way round this quad comes out is decided by which side of the nib
    // the step travels along — the sign of the nib crossed with the step. Flip
    // the two ends when it comes out backwards and every quad in the stroke
    // winds the same way.
    const facing = nx * (b.y - a.y) - ny * (b.x - a.x) >= 0 ? 1 : -1;
    const ex = nx * facing;
    const ey = ny * facing;
    ctx.moveTo(a.x - ex, a.y - ey);
    ctx.lineTo(a.x + ex, a.y + ey);
    ctx.lineTo(b.x + ex, b.y + ey);
    ctx.lineTo(b.x - ex, b.y - ey);
    ctx.closePath();
  }
  ctx.fill();
}

/** A felt tip, anywhere between a bullet and a chisel.
 *
 *  The calligraphy nib above is one extreme of this — a flat with no thickness
 *  at all — and a plain round pen is the other. What sits between them is the
 *  whole difference between the two tools that used to be told apart by nothing
 *  but their width: a marker's tip is a slightly squashed bullet that broadens
 *  when you pull it sideways, and a highlighter's is a wide flat wedge that
 *  lays a band across the page and a hairline down it.
 *
 *  So the nib is an **ellipse stamped along the path**: `flat` squashes it (0 is
 *  a circle, 1 is very nearly the calligraphy nib's edge) and `angle` says which
 *  way the long axis points. Every stamp goes into one path and is filled once,
 *  so a translucent marker doubling back over itself composites the way ink does
 *  rather than printing a dark seam at every overlap. They all wind the same way
 *  round, which is what keeps a self-crossing stroke from cancelling itself out
 *  under the nonzero rule (the bug the calligraphy nib above documents).
 *
 *  A nib with no chisel in it is a plain round line, and so is one whose flat is
 *  thinner than a device pixel — at that point every stamp lands on the same
 *  row of pixels and `paintPath` draws the identical mark for a fraction of the
 *  cost. */
export function paintNib(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  flat: number,
  angle: number,
  scale = 1,
): void {
  const half = Math.max(0.5, size / 2);
  const chisel = Math.max(0, Math.min(1, flat));
  if (chisel < 0.04) {
    paintPath(ctx, points, size);
    return;
  }
  // How thick the nib stays across its flat. Never nothing: a felt tip is a
  // wedge of fibre, not a razor, and a stamp with no thickness leaves nothing
  // behind on a stroke travelling along the nib.
  const across = half * Math.max(0.1, 1 - chisel);
  if ((half - across) * scale < HAIRLINE) {
    paintPath(ctx, points, size);
    return;
  }
  // Close enough together that consecutive stamps overlap even when the stroke
  // is travelling square across the flat, and never finer than the screen can
  // show.
  const step = Math.max(0.5, Math.min(across * 0.8, half), PIXEL / scale);
  const along = resample(points, step);
  if (along.length === 0) return;
  const nx = Math.cos(angle) * half;
  const ny = Math.sin(angle) * half;
  ctx.beginPath();
  for (const p of along) {
    // `ellipse` draws from wherever the path already is, so each stamp opens
    // its own subpath at the point the arc starts from.
    ctx.moveTo(p.x + nx, p.y + ny);
    ctx.ellipse(p.x, p.y, half, across, angle, 0, Math.PI * 2);
  }
  ctx.fill();
}

/** How many passes a feathered edge is built from. Three, like every other soft
 *  edge here: enough that the fade reads as a fade, few enough that a page of
 *  washes is still three strokes of a traced outline. */
const FEATHER_PASSES = 3;

/** Fill an area given as closed outlines — what the paint bucket leaves behind.
 *
 *  Even-odd, so a loop that lies inside another is a hole: an island of marks
 *  inside a flooded area stays unpainted, which is what makes a fill land
 *  *behind* the drawing rather than over it.
 *
 *  `feather` softens the boundary, in document pixels: the outline is stroked a
 *  few times on the way out, widest and faintest first, and the solid fill goes
 *  down over the top. That is the same shape `paintSoftPath` gives a soft line
 *  — a solid core inside a fading skirt — and it feathers the holes as well as
 *  the rim, since a hole's edge is an outline like any other. The fade is a
 *  *fraction of the ink*, so a translucent wash feathers translucently. */
export function paintRegion(
  ctx: CanvasRenderingContext2D,
  contours: readonly Point[][],
  feather = 0,
  scale = 1,
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
  // The skirt, before the fill so the solid colour lands on top of its inner
  // half — a feather that reached over the fill would print as a dark ring just
  // inside the edge. A fade thinner than a device pixel is four passes of the
  // same outline, so it is simply not drawn.
  if (feather > 0 && feather * scale >= PIXEL) {
    const alpha = ctx.globalAlpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = FEATHER_PASSES; i >= 1; i--) {
      // Centred on the outline, so the widest pass reaches `feather` past it.
      ctx.lineWidth = (feather * 2 * i) / FEATHER_PASSES;
      ctx.globalAlpha = alpha * (0.22 / i);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }
  ctx.fill("evenodd");
}

/** The stroke's hardness, for painters that take it as an argument. */
export function strokeHardness(stroke: Stroke): number {
  return hardnessOf(stroke);
}
