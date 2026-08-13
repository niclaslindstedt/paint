// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a stroke covers, and which strokes a repaint can skip.
//
// A repaint is a loop over every mark in the document, and at a zoom past
// fitting the page most of those marks are off screen. Painting them is not
// wasted in the sense of being wrong — the canvas clips them — but the clip
// happens *after* the painter has resampled the path, splayed sixteen bristles
// through it and stamped four hundred cones along it. The cheapest work is the
// work that never starts.
//
// So: a box per stroke, an intersection test per repaint, and nothing else.
// The boxes are cached against the stroke objects themselves — a stroke is
// immutable (every edit in the store builds a new one), so a stroke that is
// still the same object still has the same shape, and a document that has not
// changed measures itself exactly once.

import type { Point, Stroke } from "./types.ts";

/** An axis-aligned box in document coordinates. */
export type Rect = { x: number; y: number; width: number; height: number };

/** How far past its own geometry a painter is allowed to spread, as a multiple
 *  of the stroke width.
 *
 *  This is the one number that has to stay ahead of the painters: the neon pen
 *  lays an aura 3.2× its width, the airbrush a cone 1.6× plus its grain, the
 *  soft nib a halo 2.2×. Set it too low and a mark is culled while a corner of
 *  it is still on screen, which reads as a stroke that pops in. It is
 *  deliberately generous — the cost of being wrong is a visible glitch, and the
 *  cost of being loose is a few strokes painted that needn't have been. */
const SPREAD = 4;

/** …and a floor, in document pixels, for a hairline stroke whose spread is a
 *  fraction of nothing. */
const MARGIN = 4;

const cache = new WeakMap<Stroke, Rect>();

function around(points: readonly Point[], pad: number): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return null;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/** The box a stroke can possibly paint inside, in document coordinates.
 *
 *  `null` for a stroke with no geometry at all (an empty path), which is a
 *  stroke that paints nothing and can always be skipped. */
export function strokeBounds(stroke: Stroke): Rect | null {
  const hit = cache.get(stroke);
  if (hit) return hit;
  const pad = stroke.size * SPREAD + MARGIN;
  const shape = stroke.shape;
  let box: Rect | null = null;
  if (shape.kind === "path") box = around(shape.points, pad);
  else if (shape.kind === "segment") box = around([shape.from, shape.to], pad);
  else if (shape.kind === "box") box = around([shape.from, shape.to], pad);
  else if (shape.kind === "region") box = around(shape.contours.flat(), pad);
  else if (shape.kind === "text") {
    // Text is measured without a context to measure it with, so this is a
    // deliberate over-estimate: the font is `size * 6` and no glyph is wider
    // than it is tall.
    const em = stroke.size * 6;
    box = around(
      [
        shape.at,
        { x: shape.at.x + em * shape.text.length, y: shape.at.y + em },
      ],
      pad + em,
    );
  }
  if (box) cache.set(stroke, box);
  return box;
}

/** Whether two boxes overlap at all. Touching edges count — a mark exactly on
 *  the boundary is one whose antialiasing lands inside it. */
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

/** Whether a stroke can paint anything inside `view`. A stroke with no
 *  geometry cannot; a stroke with no view to clip against always can. */
export function strokeVisible(stroke: Stroke, view: Rect | undefined): boolean {
  if (!view) return true;
  const box = strokeBounds(stroke);
  return box ? overlaps(box, view) : false;
}
