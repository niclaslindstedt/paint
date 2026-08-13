// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Getting work out of the app.
//
// Two exits, both offline: the whole document as JSON (the same bytes the sync
// backends carry, so an export is a portable backup), and the open page as a
// PNG (the shareable artefact — a sketch you paste into a chat or a slide).
//
// The PNG is rasterised through the *same* renderer the screen uses, on an
// off-screen canvas at the document's own pixel size, so what lands in the file
// is exactly what was on screen — no second painting path to drift.

import { renderDrawing, type InkContext } from "./render.ts";
import type { Drawing } from "./types.ts";

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

/** Rasterise a drawing to a PNG blob at its document size.
 *
 *  `ink` carries the resolved page colour and default ink (see `canvas.ts`) —
 *  an export always paints an opaque background, including the dark sheet, so a
 *  sketch pasted into a chat reads the same way it did on screen.
 *
 *  Rejects when the browser can't hand back a 2D context or refuses the encode
 *  — the caller surfaces that rather than silently downloading nothing. */
export async function drawingToPng(
  drawing: Drawing,
  ink: InkContext,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = drawing.width;
  canvas.height = drawing.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser gave no 2D canvas context");
  renderDrawing(ctx, drawing, null, ink);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("the browser could not encode the PNG");
  return blob;
}
