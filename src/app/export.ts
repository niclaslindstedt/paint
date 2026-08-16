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
import { activeFilters, svgFilter } from "./filters.ts";
import { paintFilters } from "./filterPaint.ts";
import { preloadDrawingImages } from "./images.ts";
import { backgroundHidden } from "./layers.ts";
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

/** A drawing's name as a filesystem-safe slug, e.g. `sequence-diagram` — the
 *  stem an export downloads under, and the stem a dropped bitmap is filed under
 *  when the document syncs (see `imageStore.ts`), so the two agree. */
export function drawingSlug(name: string, fallback = "drawing"): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

/** A filesystem-safe file name for a drawing, e.g. `sequence-diagram.png`. */
export function exportFileName(
  drawing: Drawing,
  extension: string,
  fallback = "drawing",
): string {
  return `${drawingSlug(drawing.name, fallback)}.${extension}`;
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

/** Whether a format can carry transparency at all. JPG cannot — it has no alpha
 *  channel, and a "transparent" JPEG comes out solid black.
 *
 *  Exported for the tests: what comes out of a page made of nothing is decided
 *  by these three predicates and nothing else, and they are worth pinning down
 *  without a canvas to rasterise onto. */
export function carriesAlpha(format: DownloadFormat): boolean {
  return format !== "jpg";
}

/** Whether an export of this format should leave the page unpainted *because it
 *  was asked to* — the download setting, which is a choice about this file
 *  rather than about the drawing. */
function wantsTransparency(
  format: DownloadFormat,
  options: ExportOptions,
): boolean {
  return options.transparent && carriesAlpha(format);
}

/** Whether this file will end up with nothing behind the marks: because the
 *  export asked for it, or because the page itself has no sheet.
 *
 *  The second half is the one worth naming. A page with no colour is not a page
 *  that *happens* to be white — its background layer is switched off (see
 *  `layers.ts`), which is the same state as hiding the sheet from the layers
 *  panel, and the renderer honours it whoever is painting. So a PNG or an SVG of
 *  one comes out transparent without the download menu being asked, which is
 *  right: an image made to sit on somebody else's page should arrive with
 *  nothing behind it. */
export function exportsTransparent(
  drawing: Drawing,
  format: DownloadFormat,
  options: ExportOptions,
): boolean {
  return (
    carriesAlpha(format) && (options.transparent || backgroundHidden(drawing))
  );
}

/** Whether this file has to be given a page the drawing hasn't got: a page with
 *  no sheet, written to a format with no alpha. Without it the encoder reads the
 *  nothing as black, which is the one way a "transparent" export can come out
 *  looking like a mistake rather than like a choice. */
export function flattensPage(
  drawing: Drawing,
  format: DownloadFormat,
): boolean {
  return !carriesAlpha(format) && backgroundHidden(drawing);
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
    // The sheet travels with the drawing, so an export is on the same paper the
    // canvas was — grain included in the bitmap formats, and the marks blended
    // the way the sheet blends them. (A vector file gets the marks and the page
    // without the grain: there is nothing in SVG that a canvas pattern of noise
    // maps onto. See `groundPaint.ts`.)
    ground: drawing.ground,
    transparentPage: wantsTransparency(format, options),
  };

  // What actually comes out, once the page's own sheet has had its say.
  const transparent = exportsTransparent(drawing, format, options);
  // …and the case the two disagree on: a page with no sheet, written to a format
  // that cannot hold one. The marks would land on nothing and the encoder would
  // read that nothing as black, so the file gets a page after all — the colour
  // the sheet would go back to if it were switched on (see `resolvePageColor`),
  // which is what "JPG always keeps the page colour" has always meant.
  const flatten = flattensPage(drawing, format);

  const filters = activeFilters(drawing);

  if (format === "svg") {
    const recorder = new SvgCanvas();
    renderDrawing(asContext2D(recorder), drawing, null, paint);
    // A vector file has no pixels to composite, so the page's filters travel as
    // SVG filter primitives and the reader applies them (see `filters.ts`).
    recorder.setPageFilter(svgFilter(filters));
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
  // …and then, for a format that cannot hold the nothing this page is made of,
  // a sheet under the lot. *After* the renderer and never before it: a repaint
  // clears the canvas it is handed before it paints anything (see
  // `renderDrawing`), so a fill laid first is a fill thrown away — which is
  // exactly how a "transparent" JPEG comes out black. `destination-over` puts it
  // behind the marks, which is the same way the sheet goes down when there is
  // one.
  if (flatten) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = options.pageColor;
    ctx.fillRect(region.x, region.y, region.width, region.height);
    ctx.restore();
  }
  // …and the page's filters over the finished picture, through the same code
  // the screen's last coat runs (see `filterPaint.ts`), at one canvas pixel per
  // document pixel. A cropped export moves the page's corner with the origin.
  paintFilters(ctx, filters, {
    page: {
      x: -region.x,
      y: -region.y,
      width: drawing.width,
      height: drawing.height,
    },
    scale: 1,
    pageColor: options.pageColor,
    transparent,
  });
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
