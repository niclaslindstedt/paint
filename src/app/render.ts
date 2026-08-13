// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The renderer: paint a drawing onto a 2D context, in document coordinates.
//
// It is deliberately dumb — clear the page, then hand each stroke to the tool
// plugin that drew it. That indirection is what keeps the core free of tool
// knowledge: a stroke names its tool, the registry resolves the painter.
//
// The same function paints the on-screen canvas, the in-flight gesture, and the
// off-screen canvas the PNG export rasterises, so what you export is exactly
// what you saw.

import { paintRegion } from "./plugins/brushes.ts";
import { pluginById } from "./plugins/registry.ts";
import { applyInk, paintPath, paintRect, paintSegment } from "./plugins/ink.ts";
import type { Drawing, Stroke } from "./types.ts";

/** The colours a repaint resolves absent stroke ink against. */
export type InkContext = {
  /** The page the drawing is painted on. */
  pageColor: string;
  /** The default ink for that page (see `canvas.ts`). */
  defaultInk: string;
};

/** Give a stroke a concrete colour.
 *
 *  A stroke records a colour only when the user picked one. Everything else
 *  resolves here, at paint time: a tool that paints with the background (the
 *  eraser) takes the page colour, and any other mark takes the page's default
 *  ink. That indirection is what makes the canvas theme a *view* of a drawing
 *  rather than an edit to it — flipping a sketch from a dark page to a light
 *  one re-inks it instead of leaving it invisible, and nothing in the document
 *  changes. */
export function resolveStrokeInk(stroke: Stroke, ink: InkContext): Stroke {
  if (stroke.color) return stroke;
  const usesBackground = pluginById(stroke.tool)?.usesBackground ?? false;
  return {
    ...stroke,
    color: usesBackground ? ink.pageColor : ink.defaultInk,
  };
}

/** Paint one stroke through its tool's painter.
 *
 *  A stroke whose tool this build doesn't ship — a document written by a newer
 *  version, or one that used a plugin since removed — still renders: we fall
 *  back to a generic painter keyed off the shape kind. Losing the tool must
 *  never mean losing the drawing. */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  ink: InkContext,
): void {
  const resolved = resolveStrokeInk(stroke, ink);
  ctx.save();
  const plugin = pluginById(resolved.tool);
  if (plugin) plugin.behaviour.paint(ctx, resolved);
  else paintGeneric(ctx, resolved);
  ctx.restore();
}

/** The fallback painter for an unknown tool: honour the geometry, ignore the
 *  tool's flourishes (an unknown arrow renders as a plain line). */
function paintGeneric(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  applyInk(ctx, stroke);
  const shape = stroke.shape;
  if (shape.kind === "path") paintPath(ctx, shape.points, stroke.size);
  else if (shape.kind === "segment") paintSegment(ctx, shape.from, shape.to);
  else if (shape.kind === "box") {
    paintRect(ctx, shape.from, shape.to, stroke.filled ?? false);
  } else if (shape.kind === "region") {
    paintRegion(ctx, shape.contours);
  } else if (shape.kind === "text") {
    ctx.font = `${stroke.size * 6}px sans-serif`;
    ctx.fillText(shape.text, shape.at.x, shape.at.y);
  }
}

/** How a repaint treats the page, and what it inks unpicked strokes with. */
export type RenderOptions = InkContext & {
  /** Clear to transparent instead of filling with the page colour. Nothing sets
   *  it today — both the screen and the export paint the sheet — but a caller
   *  compositing the marks over something of its own can. The page colour is
   *  required either way: the eraser paints with it. */
  transparentPage?: boolean;
  /** Rule a grid of this spacing (document pixels) across the page, under the
   *  marks. A **screen-only** drawing aid: the PNG export leaves it unset, so a
   *  grid can never reach an exported file. */
  grid?: number;
};

/** The grid's ink. Deliberately a fixed translucent grey rather than a theme
 *  colour: it has to read as a faint guide on a white sheet and on a black one,
 *  and it is never the thing you are looking at. */
const GRID_INK = "rgba(120,130,145,0.25)";

/** Rule the grid across the page, clipped to it — the guide belongs to the
 *  sheet, not to the desk it is lying on. Lines are drawn one document pixel
 *  wide; the view transform thins or fattens them with the zoom, which is what
 *  makes the grid recede when you pull back. */
function paintGrid(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  step: number,
): void {
  if (step <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, drawing.width, drawing.height);
  ctx.clip();
  ctx.strokeStyle = GRID_INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < drawing.width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, drawing.height);
  }
  for (let y = step; y < drawing.height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(drawing.width, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Repaint a whole drawing, plus an optional in-flight stroke on top.
 *
 *  Full redraws (rather than incremental compositing) keep the model the single
 *  source of truth: undo, a synced document arriving, and a colour change all
 *  go through the same path, and there is no stale-pixel state to reconcile. At
 *  sketch-sized stroke counts this is comfortably fast enough. */
export function renderDrawing(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  draft: Stroke | null,
  options: RenderOptions,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  if (options.transparentPage) {
    // The on-screen canvas leaves the page colour to CSS so the optional grid
    // can sit *behind* the marks — painting an opaque page here would bury it.
    ctx.clearRect(0, 0, drawing.width, drawing.height);
  } else {
    ctx.fillStyle = options.pageColor;
    ctx.fillRect(0, 0, drawing.width, drawing.height);
  }
  ctx.restore();

  if (options.grid) paintGrid(ctx, drawing, options.grid);

  for (const stroke of drawing.strokes) paintStroke(ctx, stroke, options);
  if (draft) paintStroke(ctx, draft, options);
}

// Screen-to-document mapping used to live here, back when the canvas element
// was the page and was laid out to fit the viewport. The page is now larger
// than the screen and the element is a window onto it, so that conversion is a
// property of the *view* rather than of the element's box — it lives in
// `viewport.ts` alongside the rest of the pan/zoom maths.
