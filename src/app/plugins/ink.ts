// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared painting helpers for the built-in tools. Every tool paints through
// these, so the ink (colour, width, cap, opacity) is applied one way and a new
// tool only has to describe its geometry.

import type { Point, Stroke } from "../types.ts";

/** Apply a stroke's ink to a 2D context: colour, width, joins, and opacity.
 *  Callers restore the context themselves (the renderer wraps each stroke in a
 *  save/restore pair), so this deliberately doesn't.
 *
 *  The stroke reaching a painter always carries a concrete colour — the
 *  renderer resolves an absent one against the page before dispatching (see
 *  `resolveStrokeInk`) — so the fallback here is only a belt-and-braces default
 *  for a painter called directly. */
export function applyInk(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const color = stroke.color ?? "#111827";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = stroke.opacity ?? 1;
}

/** Paint a freehand polyline. A single-point path (a tap) is painted as a dot
 *  so tapping the canvas with the pencil leaves a mark, the way it does on
 *  paper. */
export function paintPath(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
): void {
  const first = points[0];
  if (!first) return;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  // Quadratic smoothing through the midpoints: a sampled pointer path is
  // polygonal, and drawing it as line segments shows every sample as a corner.
  // Curving through midpoints costs nothing and reads as a hand-drawn line.
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = points[points.length - 1]!;
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** Paint a straight run between two points. */
export function paintSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** Paint an arrow: the shaft plus a head at `to`, scaled off the stroke width
 *  so a thick arrow gets a proportionate head. */
export function paintArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number,
): void {
  paintSegment(ctx, from, to);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.max(size * 3, 12);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - head * Math.cos(angle - spread),
    to.y - head * Math.sin(angle - spread),
  );
  ctx.lineTo(
    to.x - head * Math.cos(angle + spread),
    to.y - head * Math.sin(angle + spread),
  );
  ctx.closePath();
  ctx.fill();
}

/** The normalised rectangle two drag corners describe — dragging up-left is as
 *  valid as down-right, and canvas wants a positive width/height. */
export function normalizeBox(
  from: Point,
  to: Point,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/** Paint a rectangle, outlined or filled. */
export function paintRect(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  filled: boolean,
): void {
  const r = normalizeBox(from, to);
  if (filled) ctx.fillRect(r.x, r.y, r.width, r.height);
  else ctx.strokeRect(r.x, r.y, r.width, r.height);
}

/** Paint the ellipse inscribed in the box two drag corners describe. */
export function paintEllipse(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  filled: boolean,
): void {
  const r = normalizeBox(from, to);
  ctx.beginPath();
  ctx.ellipse(
    r.x + r.width / 2,
    r.y + r.height / 2,
    r.width / 2,
    r.height / 2,
    0,
    0,
    Math.PI * 2,
  );
  if (filled) ctx.fill();
  else ctx.stroke();
}

/** How far apart two points are. The freehand tools use it to drop samples
 *  that are too close to matter, which keeps a long stroke's point list (and
 *  the saved document) from growing without bound. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Whether a drag covers enough ground to be a shape rather than a stray tap.
 *  Shape tools discard anything smaller so a mis-tap doesn't litter the page
 *  with invisible zero-size marks. */
export function isMeaningfulDrag(from: Point, to: Point): boolean {
  return distance(from, to) >= 2;
}
