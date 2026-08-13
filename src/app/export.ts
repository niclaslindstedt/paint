// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Getting work out of the app.
//
// Two exits, both offline: the whole document as JSON (the same bytes the sync
// backends carry, so an export is a portable backup), and the open page as an
// image — PNG, JPG, or SVG, downloaded or put straight on the clipboard.
//
// Every one of those goes through the *same* renderer the screen uses: the
// raster formats paint onto an off-screen canvas at the document's own pixel
// size, and the SVG paints onto a recording context that writes elements
// instead of pixels (see `svg.ts`). So what lands in the file is exactly what
// was on screen — there is no second painting path to drift.

import { clipToPage, drawingBounds, padBox, type Box } from "./bounds.ts";
import { preloadDrawingImages } from "./images.ts";
import { renderDrawing, type InkContext } from "./render.ts";
import { asContext2D, SvgCanvas } from "./svg.ts";
import type { Drawing } from "./types.ts";

/** The image formats the download menu can offer. The ids are persisted in the
 *  settings blob, so they are fixed. */
export const DOWNLOAD_FORMATS = ["png", "jpg", "svg"] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

/** How much of the drawing an export covers: the whole sheet, or just the part
 *  that has marks on it. */
export type ExportScope = "page" | "marks";

/** Breathing room left around the marks when the export is cropped to them, in
 *  document pixels — enough that a line doesn't sit flush against the edge of
 *  the file. */
const MARK_MARGIN = 8;

/** JPEG quality. High enough to stay invisible on a sketch, low enough to be
 *  worth choosing JPG for in the first place. */
const JPEG_QUALITY = 0.92;

export type ExportOptions = InkContext & {
  /** Crop to the marks, or export the whole page. */
  scope: ExportScope;
  /** Leave the page unpainted so the marks land on transparency. Ignored by
   *  JPG, which has no alpha channel to leave. */
  transparent: boolean;
};

/** A filesystem-safe file name for a drawing, e.g. `sequence-diagram.png`. */
export function exportFileName(
  drawing: Drawing,
  extension: string,
  fallback = "drawing",
): string {
  const stem =
    drawing.name
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  return `${stem}.${extension}`;
}

/** The MIME type a format is encoded as. */
export function formatMime(format: DownloadFormat): string {
  if (format === "png") return "image/png";
  if (format === "jpg") return "image/jpeg";
  return "image/svg+xml";
}

/** The part of the page an export covers, in document pixels.
 *
 *  `page` is the whole sheet. `marks` is the bounding box of everything drawn,
 *  with a small margin, clipped to the sheet — and it falls back to the whole
 *  page for a drawing with nothing on it, because a zero-by-zero file is not
 *  what "crop to the marks" meant. Whole pixels either way: a raster canvas
 *  can't be sized in fractions. */
export function exportRegion(drawing: Drawing, scope: ExportScope): Box {
  const page = {
    x: 0,
    y: 0,
    width: Math.max(1, Math.round(drawing.width)),
    height: Math.max(1, Math.round(drawing.height)),
  };
  if (scope === "page") return page;
  const marks = drawingBounds(drawing);
  if (!marks) return page;
  const cropped = clipToPage(padBox(marks, MARK_MARGIN), drawing);
  if (cropped.width < 1 || cropped.height < 1) return page;
  return {
    x: Math.floor(cropped.x),
    y: Math.floor(cropped.y),
    width: Math.max(1, Math.ceil(cropped.width)),
    height: Math.max(1, Math.ceil(cropped.height)),
  };
}

/** Whether an export of this format should leave the page unpainted. JPG never
 *  can — it has no alpha, and a "transparent" JPEG comes out black. */
function wantsTransparency(
  format: DownloadFormat,
  options: ExportOptions,
): boolean {
  return options.transparent && format !== "jpg";
}

/** Render a drawing into one of the image formats.
 *
 *  Bitmaps are decoded first: a repaint is synchronous, so an image that hadn't
 *  finished decoding would simply be missing from the file.
 *
 *  Rejects when the browser can't hand back a 2D context or refuses the encode
 *  — the caller surfaces that rather than silently downloading nothing. */
export async function drawingToBlob(
  drawing: Drawing,
  format: DownloadFormat,
  options: ExportOptions,
): Promise<Blob> {
  await preloadDrawingImages(drawing);
  const region = exportRegion(drawing, options.scope);
  const paint = {
    pageColor: options.pageColor,
    defaultInk: options.defaultInk,
    transparentPage: wantsTransparency(format, options),
  };

  if (format === "svg") {
    const recorder = new SvgCanvas();
    renderDrawing(asContext2D(recorder), drawing, null, paint);
    return new Blob([recorder.toSvg(region)], { type: formatMime(format) });
  }

  const canvas = document.createElement("canvas");
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser gave no 2D canvas context");
  // The renderer works in document coordinates; a cropped export is the same
  // painting with its origin moved onto the crop.
  ctx.translate(-region.x, -region.y);
  renderDrawing(ctx, drawing, null, paint);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, formatMime(format), JPEG_QUALITY),
  );
  if (!blob) throw new Error(`the browser could not encode the ${format}`);
  return blob;
}

/** Rasterise a drawing to a PNG blob at its document size — the shorthand
 *  behind Settings → Storage's one-click export. */
export async function drawingToPng(
  drawing: Drawing,
  ink: InkContext,
): Promise<Blob> {
  return drawingToBlob(drawing, "png", {
    ...ink,
    scope: "page",
    transparent: false,
  });
}

/** Put the drawing on the system clipboard as a PNG — the "paste it into the
 *  chat you were already in" exit, with no file to find afterwards.
 *
 *  PNG regardless of which formats the menu offers: it is the one image type
 *  every clipboard on every platform accepts. Rejects when the browser has no
 *  async clipboard, or when the page isn't allowed to write to it (a permission
 *  browsers only grant inside a user gesture). */
export async function copyDrawingToClipboard(
  drawing: Drawing,
  options: ExportOptions,
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("this browser can't put an image on the clipboard");
  }
  // Constructed with the *promise* of the blob rather than an awaited one:
  // Safari only lets a page write to the clipboard inside the gesture that
  // asked for it, and awaiting the render first spends that window. Handing
  // `ClipboardItem` the promise works everywhere.
  const item = new ClipboardItem({
    [formatMime("png")]: drawingToBlob(drawing, "png", options),
  });
  await navigator.clipboard.write([item]);
}
