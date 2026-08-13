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
  } else if (shape.kind === "text") {
    ctx.font = `${stroke.size * 6}px sans-serif`;
    ctx.fillText(shape.text, shape.at.x, shape.at.y);
  }
}

/** How a repaint treats the page, and what it inks unpicked strokes with. */
export type RenderOptions = InkContext & {
  /** Clear to transparent instead of filling with the page colour. The screen
   *  sets this (the element paints the page in CSS); the PNG export never does
   *  — an exported sketch must carry its own background. The page colour is
   *  still required either way: the eraser paints with it. */
  transparentPage?: boolean;
};

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

  for (const stroke of drawing.strokes) paintStroke(ctx, stroke, options);
  if (draft) paintStroke(ctx, draft, options);
}

/** Map a pointer event's client coordinates into document space.
 *
 *  The canvas is laid out to fit the viewport (`object-fit: contain` style), so
 *  the element's CSS size rarely matches the document's pixel size; this is the
 *  one place that conversion lives. */
export function toDocumentPoint(
  rect: { left: number; top: number; width: number; height: number },
  drawing: { width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const scaleX = rect.width === 0 ? 1 : drawing.width / rect.width;
  const scaleY = rect.height === 0 ? 1 : drawing.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}
