// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting the page's filters — the pixels half of `filters.ts`.
//
// It runs *after* everything else has been painted, on whatever context the
// picture landed on: the screen's canvas at the end of a frame (`frame.ts`), and
// the export's off-screen one at its document size (`export.ts`). Both hand in
// the same three things — where the page is on that canvas, how many canvas
// pixels one document pixel is worth, and what colour the sheet is — so a
// filter means the same thing at any zoom and in a file.
//
// Two rules keep it out of the way of the rest of the renderer:
//
//   - **It never touches the document.** Every call is a composite over pixels
//     that are already finished. Nothing here can change what a stroke is, and
//     turning a filter off simply stops this from running.
//   - **It is never cached.** The mark cache (`cache.ts`) holds the *unfiltered*
//     picture and this is applied to the screen after the blit, so moving a
//     slider costs a composite rather than a repaint of the document — and the
//     cache can go on absorbing a committed stroke without knowing filters
//     exist.
//
// Both effects are composited rather than computed per pixel, which is what
// makes them affordable on every frame of a stroke: the blur is one filtered
// `drawImage`, and the grain is a small tile of specks tiled across the page.
// A `getImageData` pass over the window would be several million pixels of
// arithmetic per frame; this is two draws.

import { GRAIN_CEILING } from "./filters.ts";
import { createSurface, type Surface } from "./surface.ts";
import type { Filter } from "./types.ts";

/** Where the page is on the canvas being painted, and what it is being painted
 *  against. All in *canvas* pixels — device pixels on screen, document pixels
 *  in an export. */
export type FilterPaint = {
  /** The page's rectangle on this canvas. It may hang off any edge: on screen
   *  it is wherever the view has scrolled the sheet to. */
  page: { x: number; y: number; width: number; height: number };
  /** Canvas pixels per document pixel — a filter's distances are set in
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

/** How far past its standard deviation a Gaussian is worth sampling. Three is
 *  where it falls under a thousandth and stops being visible. */
const BLUR_TAIL = 3;

/** How many specks across the grain tile is. Big enough that the repeat doesn't
 *  read as a pattern, small enough to build in a millisecond. */
const TILE_SPECKS = 48;

/** Paint a drawing's filters over the picture already on `ctx`.
 *
 *  A no-op with no filters, and a no-op where there is no DOM to make a working
 *  surface in — the picture is then simply unfiltered, which is the same
 *  fallback the mark cache takes. */
export function paintFilters(
  ctx: CanvasRenderingContext2D,
  filters: readonly Filter[],
  paint: FilterPaint,
): void {
  if (filters.length === 0) return;
  const region = onCanvas(ctx, paint.page);
  if (!region) return;
  for (const filter of filters) {
    if (filter.kind === "blur") blur(ctx, region, filter.radius, paint);
    else grain(ctx, region, filter, paint);
  }
}

type Region = { x: number; y: number; width: number; height: number };

/** The part of the page that is actually on this canvas, in whole canvas
 *  pixels — `null` when the sheet is entirely off it. Everything below works on
 *  this rather than on the page: on screen the page is usually far bigger than
 *  the window, and filtering the whole of it would mean allocating a surface
 *  the size of a sheet nobody is looking at. */
function onCanvas(
  ctx: CanvasRenderingContext2D,
  page: FilterPaint["page"],
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
  paint: FilterPaint,
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
  ctx.filter = `blur(${sigma}px)`;
  ctx.drawImage(copy.canvas, source.x, source.y);
  ctx.restore();
}

/** Speckle the page.
 *
 *  One tile of specks, tiled across the sheet and anchored to the page's own
 *  origin so the grain sits *on the drawing* — pan the window and it stays
 *  where it was, which is the difference between film grain and dirt on the
 *  screen.
 *
 *  `source-atop` rather than `source-over` so the specks land on the picture
 *  and nowhere else: on an ordinary page that is every pixel inside the sheet,
 *  and on a transparent one it is the marks alone, so a grained cut-out exports
 *  without a rectangle of dust around it. */
function grain(
  ctx: CanvasRenderingContext2D,
  region: Region,
  filter: Extract<Filter, { kind: "noise" }>,
  paint: FilterPaint,
): void {
  const speck = Math.max(1, Math.round(filter.grain * paint.scale));
  const tile = grainTile(speck, filter.color === true);
  if (!tile) return;
  const pattern = ctx.createPattern(tile.canvas, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = Math.min(1, Math.max(0, filter.amount)) * GRAIN_CEILING;
  // The pattern is laid from the page's corner rather than the canvas's, so the
  // grain belongs to the drawing rather than to the window it is seen through.
  ctx.translate(paint.page.x, paint.page.y);
  ctx.fillStyle = pattern;
  ctx.fillRect(
    region.x - paint.page.x,
    region.y - paint.page.y,
    region.width,
    region.height,
  );
  ctx.restore();
}

/** The last few grain tiles built, keyed by what they look like. A tile is the
 *  same picture for the length of a session — the same page at the same zoom
 *  asks for it on every frame — so building one per frame would be the one
 *  expensive thing in this file. */
const tiles = new Map<string, Surface | null>();
const TILE_CACHE = 4;

/** A square of specks: half of them lighter than what they land on, half
 *  darker, most of them faint. Deterministic, so the screen and the exported
 *  file are speck-for-speck the same picture — a filter that resolves at paint
 *  time may not paint differently each time it is asked. */
function grainTile(speck: number, color: boolean): Surface | null {
  const key = `${speck}:${color}`;
  const held = tiles.get(key);
  if (held !== undefined) return held;
  const side = speck * TILE_SPECKS;
  const surface = createSurface(side, side);
  if (surface) {
    const image = surface.ctx.createImageData(side, side);
    const pixels = image.data;
    const random = seeded(0x9e3779b9);
    for (let row = 0; row < TILE_SPECKS; row++) {
      for (let column = 0; column < TILE_SPECKS; column++) {
        // Faint far more often than strong: squaring a uniform draw is what
        // gives a field of grain its few bright specks and its many invisible
        // ones.
        const strength = random();
        const alpha = Math.round(strength * strength * 255);
        const light = random() < 0.5;
        const r = color ? Math.round(random() * 255) : light ? 255 : 0;
        const g = color ? Math.round(random() * 255) : r;
        const b = color ? Math.round(random() * 255) : r;
        for (let y = 0; y < speck; y++) {
          const top = (row * speck + y) * side;
          for (let x = 0; x < speck; x++) {
            const at = (top + column * speck + x) * 4;
            pixels[at] = r;
            pixels[at + 1] = g;
            pixels[at + 2] = b;
            pixels[at + 3] = alpha;
          }
        }
      }
    }
    surface.ctx.putImageData(image, 0, 0);
  }
  if (tiles.size >= TILE_CACHE) {
    const oldest = tiles.keys().next();
    if (!oldest.done) tiles.delete(oldest.value);
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
