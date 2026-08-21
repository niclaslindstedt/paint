// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Bitmaps: getting one into the document, and getting it back out for a
// repaint.
//
// A dropped image is stored inline as a data URL on the stroke that places it
// (see `Shape`'s `image` kind), which keeps the working copy one self-contained
// JSON document — it exports and undoes as one thing. The price is bytes, and
// the whole document is re-serialized on every edit, so an import is *downscaled* on the way in
// rather than stored at whatever a phone camera produced. On the way *out* to a
// remote backend the bytes are split off into a real image file beside the
// document (see `imageStore.ts`); nothing in this module has to know that.
//
// Painting is synchronous (see `render.ts`) but decoding an image is not, so
// this module also owns a small cache: a painter asks for a decoded image and
// gets one or `null`, and anything showing the document subscribes for the
// repaint that follows a decode.

import { readFileAsDataUrl } from "@niclaslindstedt/oss-framework/files";

import type { Drawing } from "./types.ts";

/** The longest edge an imported bitmap is kept at, in document pixels.
 *
 *  Sized to clear a **phone screenshot** — 2556 on an iPhone, 2796 on the big
 *  one, 3120 on a tall Android — because on a phone-first drawing app that is
 *  the picture people actually import, and a screenshot is the one import whose
 *  whole point is its pixels. Inside the cap a picture is stored byte for byte,
 *  so a screenshot arrives exact: every pixel of it is a document pixel, which
 *  is what lets the pixel grid rule the squares it is genuinely made of (see
 *  `pixelGrid.ts`).
 *
 *  It was 2000 — roughly a retina laptop's screen — and every phone screenshot
 *  landed the wrong side of it. Resampled to 0.78 of its height, a screenshot's
 *  hard edges become grey smears in the stored bytes before anything is ever
 *  drawn, and no filtering downstream can get them back. */
export const MAX_IMPORT_EDGE = 3200;

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
  return (
    drawing.strokes
      .map((s) => (s.shape.kind === "image" ? s.shape.src : undefined))
      // An image stroke whose bytes haven't been read back from the backend yet
      // references nothing to decode — see `imageStore.ts`.
      .filter((src): src is string => typeof src === "string" && src.length > 0)
  );
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
  /** The size to place it at, in document pixels — the size of the bitmap that
   *  is actually **stored**, which for anything inside the cap is the file's own
   *  size.
   *
   *  It used to be the file's own size always, on the reasoning that a photo
   *  dropped on the page is the size it is and storing fewer pixels than are
   *  painted is a quality trade rather than a change of dimensions. That is
   *  true right up until the document starts claiming a resolution it does not
   *  hold: a picture stored at 0.78 of the size it is drawn has pixels 1.28
   *  document pixels wide, so they can never line up with the document's own
   *  lattice — the pixel grid rules squares the picture has nothing to put in
   *  them — and an export at the nominal size is an upscale of bytes that were
   *  never that big. Placing it at the size it is kept at makes one stored
   *  pixel one document pixel, which is the only arrangement in which the two
   *  agree. */
  width: number;
  height: number;
};

/** Read a picked (or dropped) image file into an inline payload, downscaled to
 *  `MAX_IMPORT_EDGE` so a 12-megapixel photo doesn't become a 12-megapixel
 *  document. An image already inside the cap is stored byte-for-byte — a
 *  screenshot survives as the PNG it was, at the size it was.
 *
 *  A picture that *is* downscaled is placed at the size it is stored at rather
 *  than the size of the file it came from, so one stored pixel is always one
 *  document pixel (see `ImportedImage.width`).
 *
 *  Rejects on a file that is too large, isn't an image, or won't decode; the
 *  caller surfaces that rather than dropping the file on the floor. */
/** The size a bitmap of `width` × `height` is stored — and therefore placed —
 *  at: its own, or the largest that fits `MAX_IMPORT_EDGE` with its shape kept.
 *
 *  Split out from the import because it is the whole of the decision and the
 *  only part of it that can be checked without a browser: everything else in
 *  `importImageFile` is decoding bytes and asking a canvas to redraw them. */
export function storedSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(1, MAX_IMPORT_EDGE / Math.max(width, height));
  if (scale === 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

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

  const stored = storedSize(width, height);
  if (stored.width === width && stored.height === height) {
    return { src: original, width, height };
  }

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
  // Fewer pixels stored, and placed at that: a picture is drawn at the
  // resolution the document actually holds it at, so its pixels are the
  // document's pixels. A photo larger than the cap still arrives larger than
  // most sheets and still takes the page over — it just does it at the size it
  // really is rather than at the size it used to claim.
  return { src, width: stored.width, height: stored.height };
}

/** Redraw a bitmap mirrored or turned a quarter, as a new data URL — the
 *  `BitmapTurn` the page transforms take (see `transform.ts`).
 *
 *  A page transform is exact for everything else in the document, because
 *  everything else is geometry. A picture has pixels of its own, so mapping its
 *  frame would leave the picture inside it facing the wrong way; the bytes have
 *  to be redrawn. That is the one lossy step in the whole operation, and it is
 *  the same one every paint program takes.
 *
 *  `null` when there is nothing to redraw with — no DOM, or an image that hasn't
 *  finished decoding — and the caller then keeps the bytes it had. */
export function turnBitmap(
  src: string,
  op: { mirror?: "horizontal" | "vertical"; turn?: "left" | "right" },
): string | null {
  const img = cachedImage(src);
  if (!img || typeof document === "undefined") return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const quarter = op.turn !== undefined;
  const canvas = document.createElement("canvas");
  canvas.width = quarter ? h : w;
  canvas.height = quarter ? w : h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (op.turn) ctx.rotate((op.turn === "right" ? 1 : -1) * (Math.PI / 2));
  if (op.mirror === "horizontal") ctx.scale(-1, 1);
  if (op.mirror === "vertical") ctx.scale(1, -1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  // PNG throughout: a turn is not the moment to re-compress a photo, and the
  // bytes were already capped on the way in (`MAX_IMPORT_EDGE`).
  return canvas.toDataURL("image/png");
}

/** A drawing's name for an imported file: the file name with its extension
 *  taken off, so `holiday-photo.jpg` becomes `holiday-photo`. */
export function imageFileStem(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim();
}
