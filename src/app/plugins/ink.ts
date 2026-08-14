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
  const color = strokeColor(stroke);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = stroke.opacity ?? 1;
}

/** A stroke's concrete colour. The renderer resolves an absent one against the
 *  page before dispatching (see `resolveStrokeInk`), so this only ever falls
 *  back for a painter called directly — but the painters that build a gradient
 *  need the colour as a *value* rather than as a context setting, so it is
 *  worth having in one place. */
export function strokeColor(stroke: Stroke): string {
  return stroke.color ?? "#111827";
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

/** Paint one arrowhead at `tip`, pointing away from `tail`. Scaled off the
 *  stroke width so a thick arrow gets a proportionate head. */
function paintHead(
  ctx: CanvasRenderingContext2D,
  tail: Point,
  tip: Point,
  size: number,
): void {
  const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const head = Math.max(size * 3, 12);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(
    tip.x - head * Math.cos(angle - spread),
    tip.y - head * Math.sin(angle - spread),
  );
  ctx.lineTo(
    tip.x - head * Math.cos(angle + spread),
    tip.y - head * Math.sin(angle + spread),
  );
  ctx.closePath();
  ctx.fill();
}

/** Paint an arrow: the shaft plus a head at `to`. */
export function paintArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number,
): void {
  paintSegment(ctx, from, to);
  paintHead(ctx, from, to, size);
}

/** Paint an arrow with a head at both ends — the "these two are the same
 *  distance apart" mark a diagram needs as often as a one-way one. */
export function paintDoubleArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number,
): void {
  paintSegment(ctx, from, to);
  paintHead(ctx, from, to, size);
  paintHead(ctx, to, from, size);
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

/** Paint a rectangle with rounded corners.
 *
 *  The radius is a fraction of the box's shorter side rather than a fixed number
 *  of pixels, so a rounded rectangle looks like one whether it is a button-sized
 *  box or half the page — and it is capped at half that side, which is the point
 *  where the corners meet and the shape is a stadium. */
export function paintRoundRect(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  filled: boolean,
): void {
  const r = normalizeBox(from, to);
  const radius = Math.min(r.width, r.height) * ROUND_CORNER;
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.lineTo(r.x + r.width - radius, r.y);
  ctx.quadraticCurveTo(r.x + r.width, r.y, r.x + r.width, r.y + radius);
  ctx.lineTo(r.x + r.width, r.y + r.height - radius);
  ctx.quadraticCurveTo(
    r.x + r.width,
    r.y + r.height,
    r.x + r.width - radius,
    r.y + r.height,
  );
  ctx.lineTo(r.x + radius, r.y + r.height);
  ctx.quadraticCurveTo(r.x, r.y + r.height, r.x, r.y + r.height - radius);
  ctx.lineTo(r.x, r.y + radius);
  ctx.quadraticCurveTo(r.x, r.y, r.x + radius, r.y);
  ctx.closePath();
  if (filled) ctx.fill();
  else ctx.stroke();
}

/** How round a rounded rectangle's corners are, as a fraction of its shorter
 *  side. A quarter reads as "rounded" at any size without softening the shape
 *  into a lozenge. */
const ROUND_CORNER = 0.25;

/** The corners of a regular polygon inscribed in the box two drag corners
 *  describe — stretched to fill it, so a hexagon dragged wide comes out wide.
 *
 *  `turn` rotates the polygon, as a fraction of a full turn: the default puts a
 *  vertex at the top, which is what a triangle, a pentagon and a diamond all
 *  want, and a sixth of a turn lays a hexagon on its flats.
 *
 *  Pure and exported for its own test — the painters below are the only callers,
 *  and "does a pentagon have five evenly spaced corners inside its box" is not a
 *  question a canvas can answer. */
export function polygonCorners(
  from: Point,
  to: Point,
  sides: number,
  turn = 0,
): Point[] {
  const r = normalizeBox(from, to);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const points: Point[] = [];
  for (let i = 0; i < sides; i++) {
    // Straight up from the middle is -90°, so a vertex leads rather than an
    // edge; `turn` spins it from there.
    const angle = (i / sides + turn) * Math.PI * 2 - Math.PI / 2;
    points.push({
      x: cx + (Math.cos(angle) * r.width) / 2,
      y: cy + (Math.sin(angle) * r.height) / 2,
    });
  }
  return points;
}

/** The corners of a star inscribed in the box, alternating between the outer
 *  radius and `inner` of it. Five points at 0.382 is the pentagram every star
 *  glyph is — the ratio the outer edges cross at, so the arms read straight. */
export function starCorners(
  from: Point,
  to: Point,
  points = 5,
  inner = 0.382,
): Point[] {
  const r = normalizeBox(from, to);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const corners: Point[] = [];
  for (let i = 0; i < points * 2; i++) {
    const reach = i % 2 === 0 ? 1 : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    corners.push({
      x: cx + (Math.cos(angle) * r.width * reach) / 2,
      y: cy + (Math.sin(angle) * r.height * reach) / 2,
    });
  }
  return corners;
}

/** Paint a closed polygon through `corners`, outlined or filled. */
export function paintPolygon(
  ctx: CanvasRenderingContext2D,
  corners: readonly Point[],
  filled: boolean,
): void {
  const first = corners[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i]!.x, corners[i]!.y);
  }
  ctx.closePath();
  if (filled) ctx.fill();
  else ctx.stroke();
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
