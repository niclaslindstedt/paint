// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Bitmaps: getting one into the document, and getting it back out for a
// repaint.
//
// A dropped image is stored inline as a data URL on the stroke that places it
// (see `Shape`'s `image` kind), which keeps a drawing one self-contained JSON
// document — it syncs, exports, and undoes as one thing. The price is bytes, and
// the document lives in localStorage, so an import is *downscaled* on the way in
// rather than stored at whatever a phone camera produced.
//
// Painting is synchronous (see `render.ts`) but decoding an image is not, so
// this module also owns a small cache: a painter asks for a decoded image and
// gets one or `null`, and anything showing the document subscribes for the
// repaint that follows a decode.

import { readFileAsDataUrl } from "@niclaslindstedt/oss-framework/files";

import type { Drawing } from "./types.ts";

/** The longest edge an imported bitmap is kept at, in document pixels. Roughly
 *  a retina laptop's screen — big enough that a placed photo still looks sharp
 *  zoomed in, small enough that a handful of them fit in localStorage beside
 *  the drawings. */
export const MAX_IMPORT_EDGE = 2000;

/** How big a file is worth reading at all. Anything past this is refused before
 *  it is decoded — the re-encode below would shrink it, but not before the
 *  browser had held the original in memory. */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

/** JPEG quality for a re-encoded import. High enough to stay invisible on a
 *  photo, low enough that the data URL is a fraction of a PNG's. */
const JPEG_QUALITY = 0.9;

// --- The decode cache --------------------------------------------------------

const decoded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();
const listeners = new Set<() => void>();

/** Decode a data URL into an image element, once per URL. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const ready = decoded.get(src);
  if (ready) return Promise.resolve(ready);
  if (typeof Image === "undefined") {
    // No DOM to decode with (a node test). Nothing can be painted, and saying
    // so is better than throwing somewhere further down the repaint.
    return Promise.reject(new Error("no image decoder in this environment"));
  }
  const inFlight = pending.get(src);
  if (inFlight) return inFlight;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      decoded.set(src, img);
      pending.delete(src);
      for (const fn of listeners) fn();
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(src);
      reject(new Error("the browser could not decode that image"));
    };
    img.src = src;
  });
  pending.set(src, promise);
  return promise;
}

/** A decoded image, or `null` while it is still being decoded — in which case
 *  the decode has been started and subscribers will be told when it lands. The
 *  painter's view of the cache: synchronous, and never throws. */
export function cachedImage(src: string): HTMLImageElement | null {
  const ready = decoded.get(src);
  if (ready) return ready;
  void loadImage(src).catch(() => {
    // A broken data URL paints nothing rather than tearing down the repaint.
  });
  return null;
}

/** Be told when an image finishes decoding, so the canvas can repaint. */
export function onImageDecoded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Every bitmap a drawing references. */
export function imageSources(drawing: Drawing): string[] {
  return drawing.strokes
    .map((s) => (s.shape.kind === "image" ? s.shape.src : null))
    .filter((src): src is string => src !== null);
}

/** Decode everything a drawing references. The export path awaits this: a
 *  rasterise is one synchronous pass, so an image that hasn't decoded yet would
 *  simply be missing from the file. */
export async function preloadDrawingImages(drawing: Drawing): Promise<void> {
  await Promise.all(
    imageSources(drawing).map((src) => loadImage(src).catch(() => null)),
  );
}

/** Drop every decoded image. Tests use it; the app never does. */
export function resetImageCache(): void {
  decoded.clear();
  pending.clear();
}

/** Seed the cache with an already-decoded bitmap. Tests use it to paint an
 *  image stroke without a DOM to decode one; the app never calls it. */
export function primeImageCache(src: string, image: HTMLImageElement): void {
  decoded.set(src, image);
}

// --- Import ------------------------------------------------------------------

/** A bitmap ready to be placed. */
export type ImportedImage = {
  /** The image as a data URL — exactly what the stroke carries. Possibly
   *  re-encoded smaller than the file that was dropped (see below). */
  src: string;
  /** The size to place it at, in document pixels: the file's *own* size, even
   *  when the stored bitmap was scaled down to fit the cap. A photo dropped on
   *  the page is the size it is — that is what decides whether it fits on the
   *  sheet or takes the sheet over — and storing fewer pixels than are painted
   *  is a quality trade, not a change to the picture's dimensions. */
  width: number;
  height: number;
};

/** Read a picked (or dropped) image file into an inline payload, downscaled to
 *  `MAX_IMPORT_EDGE` so a 12-megapixel photo doesn't become a 12-megapixel
 *  document. An image already inside the cap is stored byte-for-byte — a
 *  screenshot survives as the PNG it was.
 *
 *  Rejects on a file that is too large, isn't an image, or won't decode; the
 *  caller surfaces that rather than dropping the file on the floor. */
export async function importImageFile(file: File): Promise<ImportedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("that file isn't an image");
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("that image is too large to add to a drawing");
  }
  const original = await readFileAsDataUrl(file);
  const img = await loadImage(original);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error("that image has no size");

  const scale = Math.min(1, MAX_IMPORT_EDGE / Math.max(width, height));
  if (scale === 1) return { src: original, width, height };

  const stored = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  const canvas = document.createElement("canvas");
  canvas.width = stored.width;
  canvas.height = stored.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser gave no 2D canvas context");
  ctx.drawImage(img, 0, 0, stored.width, stored.height);
  // A photo goes back out as a JPEG (a re-encoded PNG of one is enormous);
  // anything else keeps an alpha channel it may well be using.
  const src =
    file.type === "image/jpeg"
      ? canvas.toDataURL("image/jpeg", JPEG_QUALITY)
      : canvas.toDataURL("image/png");
  // Fewer pixels stored, same picture: it is still placed at the size it was
  // dropped at, so a photo larger than the sheet still takes the sheet over.
  return { src, width, height };
}

/** A drawing's name for an imported file: the file name with its extension
 *  taken off, so `holiday-photo.jpg` becomes `holiday-photo`. */
export function imageFileStem(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim();
}
