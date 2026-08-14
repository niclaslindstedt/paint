// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How big a new page is.
//
// A drawing's page is a fixed pixel size that never reflows (see `types.ts`),
// which makes it a choice worth making once, at the moment the page is created,
// rather than a setting to hunt for afterwards. This module is the whole of
// that choice: the sizes offered, the one offered *first* — this screen — and
// the rules a hand-typed size has to pass.
//
// Pure by design. The picker (`NewDrawingModal.tsx`) reads the screen once and
// hands it in, so every rule below can be driven from a test without a browser.

import { DEFAULT_CANVAS } from "./types.ts";

/** A page size in document pixels. */
export type CanvasSize = { width: number; height: number };

/** The narrowest page worth having — below this a "page" is a thumbnail, and
 *  the toolbar under it is wider than the sheet. */
export const MIN_CANVAS_SIDE = 64;

/** The widest. 8192 clears 8K on the long edge and stays inside the maximum
 *  texture / canvas dimension browsers will rasterise on a phone, which is what
 *  a PNG export has to go through. */
export const MAX_CANVAS_SIDE = 8192;

/** The sizes the new-drawing picker offers by name. `screen` is not listed
 *  here: it is whatever the device you are holding actually is, so it is
 *  computed rather than written down. */
export type CanvasPresetId =
  "screen" | "hd" | "uhd" | "sheet" | "square" | "print";

export type CanvasPreset = { id: CanvasPresetId; size: CanvasSize };

/** The named sizes, in the order they are offered under "This screen".
 *
 *  `sheet` is the page every drawing used to get — deliberately bigger than any
 *  screen, so there is always room to the right of what you have drawn. It stays
 *  on the list because that is still the right answer for a diagram that will
 *  grow; it is no longer the answer chosen *for* you. */
const NAMED_PRESETS: readonly CanvasPreset[] = [
  { id: "hd", size: { width: 1920, height: 1080 } },
  { id: "uhd", size: { width: 3840, height: 2160 } },
  { id: "sheet", size: { ...DEFAULT_CANVAS } },
  { id: "square", size: { width: 2048, height: 2048 } },
  // A4 at 300 dpi — the one preset that is a piece of paper rather than a
  // display, and the only portrait one.
  { id: "print", size: { width: 2480, height: 3508 } },
];

/** Round a side to a whole pixel and hold it inside the supported range. */
export function clampSide(side: number): number {
  if (!Number.isFinite(side)) return MIN_CANVAS_SIDE;
  return Math.min(MAX_CANVAS_SIDE, Math.max(MIN_CANVAS_SIDE, Math.round(side)));
}

/** Both sides of a size, rounded and clamped. */
export function clampCanvasSize(size: CanvasSize): CanvasSize {
  return { width: clampSide(size.width), height: clampSide(size.height) };
}

export function sameCanvasSize(a: CanvasSize, b: CanvasSize): boolean {
  return a.width === b.width && a.height === b.height;
}

/** The screen's own resolution in device pixels: CSS pixels times the pixel
 *  ratio, so "this screen" means the pixels the panel actually has and a page
 *  made at that size exports at native resolution rather than at two-thirds of
 *  it on a retina display.
 *
 *  A display past the ceiling (a 6K panel at 2×) is scaled *whole* rather than
 *  clipped side by side: the point of this preset is a page shaped like the
 *  screen, and squaring off the long edge alone would hand back a page that no
 *  longer is. */
export function screenCanvasSize(screen: {
  width: number;
  height: number;
  pixelRatio: number;
}): CanvasSize {
  const ratio =
    Number.isFinite(screen.pixelRatio) && screen.pixelRatio > 0
      ? screen.pixelRatio
      : 1;
  const width = screen.width * ratio;
  const height = screen.height * ratio;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { ...DEFAULT_CANVAS };
  }
  const shrink = Math.min(1, MAX_CANVAS_SIDE / Math.max(width, height));
  return clampCanvasSize({ width: width * shrink, height: height * shrink });
}

/** This device's resolution, or the default sheet where there is no window to
 *  ask (a test, or a document rendered outside the browser). */
export function currentScreenCanvasSize(): CanvasSize {
  const screen = typeof window === "undefined" ? undefined : window.screen;
  if (!screen) return { ...DEFAULT_CANVAS };
  return screenCanvasSize({
    width: screen.width,
    height: screen.height,
    pixelRatio: window.devicePixelRatio,
  });
}

/** The full list of offered sizes: this screen first — it is the default, and
 *  the one that needs no explanation — then the named ones.
 *
 *  A named size that *is* the screen size is dropped rather than listed twice:
 *  on a 1080p monitor "Full HD" and "This screen" are the same page, and two
 *  rows reading `1920 × 1080` only make the list longer. */
export function canvasPresets(screen: CanvasSize): CanvasPreset[] {
  const first: CanvasPreset = { id: "screen", size: clampCanvasSize(screen) };
  return [
    first,
    ...NAMED_PRESETS.filter((p) => !sameCanvasSize(p.size, first.size)),
  ];
}

/** The preset that matches a size, if one does. */
export function matchPreset(
  presets: readonly CanvasPreset[],
  size: CanvasSize,
): CanvasPreset | undefined {
  return presets.find((p) => sameCanvasSize(p.size, size));
}

/** A typed side, or `null` when it isn't a usable one. Out-of-range is `null`
 *  rather than clamped: silently turning the 20000 someone typed into 8192
 *  would create a page they didn't ask for, so the field says no instead. */
export function parseSide(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const side = Math.round(value);
  if (side < MIN_CANVAS_SIDE || side > MAX_CANVAS_SIDE) return null;
  return side;
}

/** A hand-typed page size, or `null` when either side fails. */
export function parseCanvasSize(
  width: string,
  height: string,
): CanvasSize | null {
  const w = parseSide(width);
  const h = parseSide(height);
  return w !== null && h !== null ? { width: w, height: h } : null;
}
