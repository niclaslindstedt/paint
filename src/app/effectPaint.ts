// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting an effect — the pixels half of `effects.ts`.
//
// It runs *after* the marks have been painted, on whatever context they landed
// on: the off-screen surface a bake rasterises a layer onto (`bake.ts`), and the
// screen while the dialog's sliders are still moving (`render.ts`). Both hand in
// the same three things — where the page is on that canvas, how many canvas
// pixels one document pixel is worth, and what colour the sheet is — so an
// effect means the same thing at any zoom and at document size.
//
// One rule keeps it out of the way of the rest of the renderer: **it never
// touches the document.** Every call is a composite over pixels that are already
// finished. What makes an effect permanent is what `bake.ts` does with the
// pixels afterwards, not anything here.
//
// Both effects are composited rather than computed per pixel, which is what
// makes them cheap enough to preview on every pointer sample of a slider drag:
// the blur is one filtered `drawImage`, and the grain is two coats of a speck
// tile laid across the page as a pattern. A `getImageData` pass over the window
// would be several million pixels of arithmetic per frame; this is three draws.
//
// The blur has a second painter behind it, because `ctx.filter` — the whole of
// how it used to work — is unavailable in Safari and fails *silently* there.
// See "Softening without `ctx.filter`" below.

import { BLUR_TAIL, GRAIN_CEILING, type Effect } from "./effects.ts";
import { createSurface, type Surface } from "./surface.ts";

/** Where the page is on the canvas being painted, and what it is being painted
 *  against. All in *canvas* pixels — device pixels on screen, document pixels
 *  in an export. */
export type EffectPaint = {
  /** The page's rectangle on this canvas. It may hang off any edge: on screen
   *  it is wherever the view has scrolled the sheet to. */
  page: { x: number; y: number; width: number; height: number };
  /** Canvas pixels per document pixel — an effect's distances are set in
   *  document pixels, so they scale with the zoom exactly as a nib does. */
  scale: number;
  /** The sheet's colour, which is what a blur reaches for past the edge of what
   *  it can see (see `blur`). */
  pageColor: string;
  /** No sheet under the marks — a transparent export, or a drawing whose
   *  background layer is hidden. The blur then fades into nothing at the edges,
   *  which is what a blurred cut-out should do. */
  transparent?: boolean;
};

/** How many specks across a grain tile is.
 *
 *  The tile is built at one speck per *pixel* and blown up to the speck size
 *  when it is painted, so this is a count rather than a size: 512 specks repeat
 *  every 512 document pixels at the finest grain and every 4096 at the
 *  coarsest, and zooming in pushes the repeat further away rather than
 *  rebuilding anything. It is also the whole memory budget — one megabyte per
 *  coat, whatever the grain and whatever the zoom. */
const TILE_SPECKS = 512;

/** Paint one effect over the picture already on `ctx`.
 *
 *  A no-op where there is no DOM to make a working surface in — the picture is
 *  then simply left as it was, which is the same fallback the mark cache takes
 *  and which the bake reads as "nothing happened" (see `bake.ts`). */
export function paintEffect(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  paint: EffectPaint,
): void {
  const region = onCanvas(ctx, paint.page);
  if (!region) return;
  if (effect.kind === "blur") blur(ctx, region, effect.radius, paint);
  else grain(ctx, region, effect, paint);
}

type Region = { x: number; y: number; width: number; height: number };

/** The part of the page that is actually on this canvas, in whole canvas
 *  pixels — `null` when the sheet is entirely off it. Everything below works on
 *  this rather than on the page: on screen the page is usually far bigger than
 *  the window, and running the effect over the whole of it would mean
 *  allocating a surface the size of a sheet nobody is looking at. */
function onCanvas(
  ctx: CanvasRenderingContext2D,
  page: EffectPaint["page"],
): Region | null {
  const x = Math.max(0, Math.floor(page.x));
  const y = Math.max(0, Math.floor(page.y));
  const right = Math.min(ctx.canvas.width, Math.ceil(page.x + page.width));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(page.y + page.height));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** Soften the page.
 *
 *  The pixels are copied off, blurred on the way back, and painted inside the
 *  page and nowhere else — the desk around the sheet is not part of the picture
 *  and must not be smeared onto.
 *
 *  The copy is taken *wider than the region it will replace*, because a blur
 *  reads pixels its result doesn't cover: without the margin every edge of the
 *  window would fade out, which on screen would be a soft frame that follows
 *  you as you pan. What the margin cannot supply — the page beyond the edge of
 *  the canvas — is filled with the sheet's own colour, which is exactly what is
 *  there on a page whose marks stop short of the edge, and close enough
 *  anywhere else that no edge announces itself. A transparent page skips that
 *  fill and fades into nothing, which is what a blurred cut-out is. */
function blur(
  ctx: CanvasRenderingContext2D,
  region: Region,
  radius: number,
  paint: EffectPaint,
): void {
  const sigma = radius * paint.scale;
  if (!(sigma > 0)) return;
  const margin = Math.ceil(sigma * BLUR_TAIL);
  const from = {
    x: Math.max(0, region.x - margin),
    y: Math.max(0, region.y - margin),
  };
  const source = {
    ...from,
    width:
      Math.min(ctx.canvas.width, region.x + region.width + margin) - from.x,
    height:
      Math.min(ctx.canvas.height, region.y + region.height + margin) - from.y,
  };
  const copy = createSurface(source.width, source.height);
  if (!copy) return;
  copy.ctx.drawImage(
    ctx.canvas,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    source.width,
    source.height,
  );
  if (!paint.transparent) {
    copy.ctx.globalCompositeOperation = "destination-over";
    copy.ctx.fillStyle = paint.pageColor;
    copy.ctx.fillRect(0, 0, source.width, source.height);
    copy.ctx.globalCompositeOperation = "source-over";
  }

  // Where the softening actually happens. On a context that honours `filter`
  // it is the blit itself; everywhere else the copy is softened first and
  // blitted sharp (see `soften`).
  const native = canvasFilterBlurs();
  const softened = native ? copy : soften(copy, sigma);
  if (!softened) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  // The sharp picture goes first. A blur is *instead of* what was there, and
  // painting a softened copy over its own original would only ever look half
  // applied. Clearing is safe because the copy above already holds it.
  ctx.clearRect(region.x, region.y, region.width, region.height);
  if (native) ctx.filter = `blur(${sigma}px)`;
  ctx.drawImage(
    softened.canvas,
    source.x,
    source.y,
    source.width,
    source.height,
  );
  ctx.restore();
}

// --- Softening without `ctx.filter` -----------------------------------------
//
// `ctx.filter` is the obvious way to blur a canvas and the one this file used
// to rely on outright. It is also **not available in Safari** — not on the Mac,
// not on iOS, and not in any shipped version: WebKit has the property behind a
// flag that is off by default. An assignment to it there is silently ignored,
// which is the worst possible failure for a blur: `drawImage` puts the sharp
// picture straight back and the page looks exactly as it did, so a blur set to
// its maximum reads as a blur that does nothing at all.
//
// So the blur is asked for and then *checked*, and a context that didn't
// deliver gets the resampling path below instead.

/** Whether `ctx.filter` actually blurs on this browser, worked out once and
 *  remembered for the session.
 *
 *  Behaviour, not feature detection: Safari 18 and later *have* the property —
 *  it reads back the value you set — and ignore it. The only question worth
 *  asking is whether ink lands where an unblurred draw would have left none, so
 *  that is the question this asks. */
let filterBlurs: boolean | null = null;

/** Forget the answer. Only the tests call this — a browser does not change its
 *  mind about `ctx.filter` mid-session, and re-probing per frame would spend a
 *  `getImageData` on a question that has already been settled. */
export function forgetFilterSupport(): void {
  filterBlurs = null;
}

function canvasFilterBlurs(): boolean {
  if (filterBlurs !== null) return filterBlurs;
  const probe = createSurface(PROBE, PROBE);
  if (!probe) return false; // No DOM to ask in — don't remember a non-answer.
  filterBlurs = false;
  try {
    const { ctx } = probe;
    ctx.filter = "blur(2px)";
    ctx.fillStyle = "#000";
    // One opaque pixel dead centre. Blurred, its ink reaches the sample below;
    // unblurred, that pixel is untouched and stays fully transparent.
    ctx.fillRect(PROBE >> 1, PROBE >> 1, 1, 1);
    const spread = ctx.getImageData((PROBE >> 1) - 2, PROBE >> 1, 1, 1).data[3];
    filterBlurs = spread > 0;
  } catch {
    // A context that won't hand its pixels back can't be asked. Take the
    // fallback, which needs no readback.
    filterBlurs = false;
  }
  return filterBlurs;
}

/** How big the probe canvas is. Wide enough that a 2px blur's tail stays well
 *  inside it, small enough that the one `getImageData` it costs is nothing. */
const PROBE = 17;

/** How many source pixels one pixel of the shrunken copy stands for, per sigma
 *  of blur asked for.
 *
 *  Shrinking an image and drawing it back up *is* a blur: each small pixel is
 *  the average of the `span` source pixels it was made from, and the smooth
 *  climb back spreads it over that span again — a triangular kernel a couple of
 *  spans wide. What the number should be is therefore a question about how a
 *  tent compares to a bell, and it was settled by measuring rather than by
 *  algebra: this is the value at which the result sits closest to the Gaussian
 *  a browser with a working `ctx.filter` produces, across the whole of the
 *  radius slider. */
const SPAN_PER_SIGMA = 1.8;

/** How many shrink-and-climb passes one blur is made of.
 *
 *  One tent is a recognisable blur but a slightly boxy one, and it shows on the
 *  wide radii where the effect is most visible. Two passes cascade into
 *  something much rounder — measured against Chromium's own `blur()` over a
 *  page of hard edges, thin lines and an erased hole, one pass lands about 8
 *  levels per channel away and two lands about 4, which is under the step
 *  between two positions of the slider. A third pass buys almost nothing (3.8)
 *  and costs another half of the work, so two is where this stops. */
const PASSES = 2;

/** The smallest the shrunken copy is allowed to get. Below a few pixels across
 *  there is not enough of the picture left to climb back out of, and a heavy
 *  blur would read as flat colour rather than as a soft one. */
const MIN_SMALL = 4;

/** A blurred copy of `copy`, made without `ctx.filter`.
 *
 *  Shrink the picture, draw it back up smoothed, and do it twice. Both halves
 *  of each pass go in factor-of-two steps rather than in one jump: a single big
 *  downscale is free to point-sample, which throws detail into aliasing instead
 *  of into the blur, and repeated halving is the one resize every browser
 *  filters properly.
 *
 *  It costs a handful of `drawImage` calls on an image that is getting smaller
 *  each time — a few hundred thousand pixels of work in total, against the
 *  several million a `getImageData` blur over the window would spend per frame.
 *  That is what keeps it affordable on every frame of a stroke, which is the
 *  same bar the rest of this file is held to. */
function soften(copy: Surface, sigma: number): Surface | null {
  // Blurs compose in quadrature, so `PASSES` of this much come to `sigma`.
  const each = sigma / Math.sqrt(PASSES);
  let softened: Surface | null = copy;
  for (let pass = 0; pass < PASSES && softened; pass += 1) {
    softened = onePass(softened, each);
  }
  return softened;
}

/** One shrink-and-climb. */
function onePass(copy: Surface, sigma: number): Surface | null {
  const width = copy.canvas.width;
  const height = copy.canvas.height;
  const span = Math.max(1, sigma * SPAN_PER_SIGMA);
  const small = {
    width: Math.max(MIN_SMALL, Math.round(width / span)),
    height: Math.max(MIN_SMALL, Math.round(height / span)),
  };
  // Already smaller than the blur would shrink it to — nothing to soften.
  if (small.width >= width || small.height >= height) return copy;
  const shrunk = resample(copy, small.width, small.height);
  if (!shrunk) return null;
  return resample(shrunk, width, height);
}

/** Resize a surface to `width`×`height`, halving or doubling until it gets
 *  there. The last step lands on the exact size asked for, which is rarely a
 *  whole factor of two. */
function resample(
  from: Surface,
  width: number,
  height: number,
): Surface | null {
  let current = from;
  // Bounded rather than `while (true)`: each step at least halves or doubles a
  // dimension, so this can only run log2 of the canvas's size — and a surface
  // that fails to allocate mid-climb must not spin.
  for (let step = 0; step < RESAMPLE_STEPS; step += 1) {
    const at = current.canvas;
    if (at.width === width && at.height === height) return current;
    const next = createSurface(
      stepToward(at.width, width),
      stepToward(at.height, height),
    );
    if (!next) return null;
    next.ctx.imageSmoothingEnabled = true;
    next.ctx.imageSmoothingQuality = "high";
    next.ctx.drawImage(at, 0, 0, next.canvas.width, next.canvas.height);
    current = next;
  }
  return current;
}

/** The most resampling steps a climb may take. A canvas cannot be more than a
 *  few tens of thousands of pixels across, so sixteen halvings is past any real
 *  one — this is a backstop, not a limit anything reaches. */
const RESAMPLE_STEPS = 16;

/** One step of a resize: half the distance to the target, or the target itself
 *  when it is within one factor of two. */
function stepToward(at: number, to: number): number {
  if (to < at) return Math.max(to, Math.ceil(at / 2));
  if (to > at) return Math.min(to, at * 2);
  return at;
}

/** Speckle the page.
 *
 *  Specks come from a tile laid across the sheet and anchored to the page's own
 *  origin, so the grain sits *on the drawing* — pan the window and it stays
 *  where it was, which is the difference between film grain and dirt on the
 *  screen.
 *
 *  **It is two coats, not one, and that is what stops the grain repeating.** A
 *  tile has to repeat somewhere, and a single one gives itself away: the eye is
 *  very good at spotting the same clump of specks arriving again at a fixed
 *  spacing, and at a few hundred pixels it reads as a woven texture rather than
 *  as noise — which is exactly what it measures as, an autocorrelation spike at
 *  the tile's pitch as strong as the one between neighbouring pixels. So the
 *  field is two different tiles laid at sizes that don't share a factor (see
 *  `COATS`): each still repeats, but the pair only agree again a hundred tiles
 *  out, which is further than any page is wide. It costs one more fill of an
 *  already-built tile, and it is a truer picture of grain besides — real film
 *  has a spread of clump sizes rather than one.
 *
 *  `source-atop` rather than `source-over` so the specks land on the picture
 *  and nowhere else: on an ordinary page that is every pixel inside the sheet,
 *  and on a transparent one it is the marks alone, so a grained cut-out exports
 *  without a rectangle of dust around it. */
function grain(
  ctx: CanvasRenderingContext2D,
  region: Region,
  effect: Extract<Effect, { kind: "noise" }>,
  paint: EffectPaint,
): void {
  const speck = Math.max(1, effect.grain * paint.scale);
  const strength = Math.min(1, Math.max(0, effect.amount)) * GRAIN_CEILING;
  const color = effect.color === true;
  for (const coat of COATS) {
    const tile = grainTile(coat.seed, color);
    if (!tile) continue;
    const pattern = ctx.createPattern(tile.canvas, "repeat");
    if (!pattern) continue;
    const size = speck * coat.speck;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.width, region.height);
    ctx.clip();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = strength * coat.share;
    // Square specks, not soft ones: the tile is one pixel per speck and is
    // being blown up, and a speck that got interpolated on the way would leave
    // the page hazy rather than grainy.
    ctx.imageSmoothingEnabled = false;
    // The pattern is laid from the page's corner rather than the canvas's, so
    // the grain belongs to the drawing rather than to the window it is seen
    // through — and it is scaled with the context, which is what makes one
    // speck `grain` document pixels across at any zoom.
    ctx.translate(paint.page.x, paint.page.y);
    ctx.scale(size, size);
    ctx.fillStyle = pattern;
    ctx.fillRect(
      (region.x - paint.page.x) / size,
      (region.y - paint.page.y) / size,
      region.width / size,
      region.height / size,
    );
    ctx.restore();
  }
}

/** The two coats a grain is laid in: the specks the size that was asked for,
 *  and a coarser scattering of a *different* field over them.
 *
 *  The size multiplier is deliberately not a whole number. Both coats repeat —
 *  a tile has to — but at 512 specks and 512 × 1.63 specks they only agree
 *  again after a hundred tiles, which is further away than any page is wide.
 *  Between them they come to a little over one coat's worth of ink, because two
 *  independent fields at half strength each read fainter than one at full. */
const COATS = [
  { seed: 0x9e3779b9, speck: 1, share: 0.72 },
  { seed: 0x85ebca6b, speck: 1.63, share: 0.52 },
];

/** The grain tiles, one per (coat, colour). Four at the very most, a megabyte
 *  each, and built once for the session: the same field serves every zoom, so
 *  neither zooming nor resizing the page can cost a rebuild. */
const tiles = new Map<string, Surface | null>();

/** A square of specks, one pixel each: half of them lighter than what they land
 *  on, half darker, most of them faint. Deterministic, so the preview and the
 *  bake it approves are speck-for-speck the same picture — an effect may not
 *  scatter different dust each time it is asked. */
function grainTile(seed: number, color: boolean): Surface | null {
  const key = `${seed}:${color}`;
  const held = tiles.get(key);
  if (held !== undefined) return held;
  const surface = createSurface(TILE_SPECKS, TILE_SPECKS);
  if (surface) {
    const image = surface.ctx.createImageData(TILE_SPECKS, TILE_SPECKS);
    const pixels = image.data;
    const random = seeded(seed);
    for (let at = 0; at < pixels.length; at += 4) {
      // Faint far more often than strong: squaring a uniform draw is what
      // gives a field of grain its few bright specks and its many invisible
      // ones.
      const strength = random();
      const light = random() < 0.5;
      const r = color ? Math.round(random() * 255) : light ? 255 : 0;
      pixels[at] = r;
      pixels[at + 1] = color ? Math.round(random() * 255) : r;
      pixels[at + 2] = color ? Math.round(random() * 255) : r;
      pixels[at + 3] = Math.round(strength * strength * 255);
    }
    surface.ctx.putImageData(image, 0, 0);
  }
  tiles.set(key, surface);
  return surface;
}

/** A small deterministic PRNG (mulberry32). `Math.random` would give a page
 *  that grains differently every time it is painted. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
