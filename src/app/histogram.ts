// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the tones actually are — the picture behind the levels handles.
//
// "Black point 0.06" is a number nobody can picture, and the reason every levels
// control ever built is drawn over a histogram is that the *shape* is the thing
// you are aiming at: you pull the black handle up to where the data starts and
// the white handle down to where it ends, and the picture opens out. Without the
// shape you are guessing, dragging, and reading the result off the page — which
// is exactly what a phone-sized screen with a dialog over it cannot show you.
//
// So this counts the tones of the pixels an effect is about to land on. Two
// halves, split the way the rest of the app splits them:
//
//   - `tally` is pure arithmetic over a pixel buffer and is tested in node.
//   - `layerTones` is the one part that needs a DOM: it paints the target
//     layers' marks onto a small off-screen surface and hands the pixels over.
//
// It is deliberately counted at a *low* resolution. A histogram is a shape, and
// the shape of a quarter-megapixel sample is the shape of the whole page — where
// rasterising a 3200×2000 sheet per open would cost more than the dialog it is
// drawn in.

import { groupByLayer } from "./layers.ts";
import { relayFixed } from "./relay.ts";
import { paintStrokes, type InkContext } from "./render.ts";
import { createSurface } from "./surface.ts";
import type { Drawing } from "./types.ts";

/** How many tones a histogram counts in — one per 8-bit level, which is how
 *  every histogram in the world is drawn and the same scale the black and white
 *  readouts use (see `controlReadout`). */
export const TONES = 256;

/** How faint a pixel may be and still count. A layer is mostly *empty* by the
 *  time it reaches here — its marks are painted onto a transparent surface of
 *  their own (see `render.ts`) — and counting that emptiness as black would
 *  bury the picture under one enormous bar at tone 0. */
const FAINT = 8;

/** The longest side the tones are counted at. A histogram is a shape rather
 *  than a measurement, and the shape settles long before the sample gets big:
 *  384² is a quarter of a megapixel at the very most, which is a few
 *  milliseconds once per opening. */
const MAX_SAMPLE_SIDE = 384;

/** The tones of the pixels an effect would land on. */
export type Histogram = {
  /** How many pixels fell in each tone, darkest first. */
  bins: Uint32Array;
  /** The tallest bin, so a bar can be drawn as a fraction of it. Zero when
   *  nothing was counted. */
  peak: number;
  /** How many pixels were counted at all. */
  count: number;
  /** The darkest and the lightest tone with anything in them — literally where
   *  the data starts and ends, which is the question the handles are asking. */
  low: number;
  high: number;
};

/** An empty count, for the callers that need a histogram shaped object with
 *  nothing in it — no DOM, no marks, no pixels handed back. */
export function emptyHistogram(): Histogram {
  return {
    bins: new Uint32Array(TONES),
    peak: 0,
    count: 0,
    low: 0,
    high: TONES - 1,
  };
}

/** Count the tones in an RGBA buffer.
 *
 *  Luminance rather than a channel, because the levels handles move all three
 *  together: what you are placing is where the *light* starts and stops. The
 *  Rec. 601 weights are the ones `adjust.ts` desaturates with, so the grey a
 *  histogram is counting is the grey the app would make.
 *
 *  Pure and buffer-shaped so a whole page of pixels can be handed in from a
 *  canvas, or eight numbers from a test. */
export function tally(pixels: ArrayLike<number>): Histogram {
  const bins = new Uint32Array(TONES);
  let count = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3] ?? 0;
    if (alpha < FAINT) continue;
    const tone = Math.round(
      0.299 * (pixels[i] ?? 0) +
        0.587 * (pixels[i + 1] ?? 0) +
        0.114 * (pixels[i + 2] ?? 0),
    );
    const at = Math.min(TONES - 1, Math.max(0, tone));
    bins[at] = (bins[at] ?? 0) + 1;
    count += 1;
  }
  if (count === 0) return emptyHistogram();
  let peak = 0;
  let low = TONES - 1;
  let high = 0;
  for (let tone = 0; tone < TONES; tone += 1) {
    const n = bins[tone] ?? 0;
    if (n === 0) continue;
    if (n > peak) peak = n;
    if (tone < low) low = tone;
    if (tone > high) high = tone;
  }
  return { bins, peak, count, low, high };
}

/** The tones of the marks on `layerIds`, sampled off the page.
 *
 *  `null` where there is nothing to count or nowhere to count it: no marks, no
 *  DOM (a node test), or a browser that refused to hand the pixels back. The
 *  editor then draws its handles over an empty box rather than a shape, which is
 *  an honest picture of "we don't know" and still perfectly draggable.
 *
 *  What is counted is the marks alone, on nothing — the same surface a bake
 *  paints a layer onto (see `bake.ts`), and for the same reason: the effect is
 *  going to land on those pixels and not on the sheet under them, so the sheet's
 *  colour has no business in the count. */
export function layerTones(
  drawing: Drawing,
  layerIds: readonly string[],
  ink: InkContext,
): Histogram | null {
  if (layerIds.length === 0) return null;
  const marks = groupByLayer(drawing);
  const strokes = layerIds.flatMap((id) => marks.get(id) ?? []);
  if (strokes.length === 0) return null;
  const scale = Math.min(
    1,
    MAX_SAMPLE_SIDE / Math.max(1, drawing.width, drawing.height),
  );
  const width = Math.max(1, Math.round(drawing.width * scale));
  const height = Math.max(1, Math.round(drawing.height * scale));
  const surface = createSurface(width, height);
  if (!surface) return null;
  const ctx = surface.ctx;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const options = {
    pageColor: ink.pageColor,
    defaultInk: ink.defaultInk,
    ground: drawing.ground,
    scale,
  };
  paintStrokes(ctx, strokes, options);
  // A rubbing out that only lifts what a rubber can lift took everything for
  // the length of one composite; this puts the rest back (see `render.ts`).
  relayFixed(ctx, strokes, options);
  try {
    const counted = tally(ctx.getImageData(0, 0, width, height).data);
    return counted.count > 0 ? counted : null;
  } catch {
    // A canvas that won't be read — nothing this app paints can taint one, but
    // a privacy extension faking the read still can. No shape, same handles.
    return null;
  }
}
