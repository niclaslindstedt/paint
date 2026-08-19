// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a stroke covers, and which strokes a repaint can skip.
//
// A repaint is a loop over every mark in the document, and at a zoom past
// fitting the page most of those marks are off screen. Painting them is not
// wasted in the sense of being wrong — the canvas clips them — but the clip
// happens *after* the painter has resampled the path, splayed fifty bristles
// through it and stamped four hundred cones along it. The cheapest work is the
// work that never starts.
//
// So: a box per stroke, an intersection test per repaint, and nothing else.
// The boxes are cached against the stroke objects themselves — a stroke is
// immutable (every edit in the store builds a new one), so a stroke that is
// still the same object still has the same shape, and a document that has not
// changed measures itself exactly once.

import { textBox } from "./plugins/builtin/text.ts";
import { pluginById } from "./plugins/registry.ts";
import type { Point, Stroke } from "./types.ts";

/** An axis-aligned box in document coordinates. */
export type Rect = { x: number; y: number; width: number; height: number };

/** How far past its own geometry a painter is allowed to spread, as a multiple
 *  of the stroke width, for a tool that hasn't said.
 *
 *  This is the one number that has to stay ahead of the painters: the airbrush
 *  lays a cone 1.6× its width plus its grain, the soft nib a halo 2.2×, the
 *  bucket's feather up to forty document pixels. Set it too low and a mark is culled while a corner of
 *  it is still on screen, which reads as a stroke that pops in. It is
 *  deliberately generous — the cost of being wrong is a visible glitch, and the
 *  cost of being loose is a few strokes painted that needn't have been.
 *
 *  A tool that has actually been read for it says so on its descriptor
 *  (`PaintPlugin.reach`) and gets a box its own size instead. That is worth
 *  doing where the box is a *repaint* rather than a cull — see `runBounds`. */
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

/** How far past a point of this stroke's geometry its painter can reach: what
 *  the tool declares, or the generous default for one that hasn't. */
function padFor(stroke: Stroke): number {
  const spread = pluginById(stroke.tool)?.reach ?? SPREAD;
  return stroke.size * spread + MARGIN;
}

/** The box a *run* of a path's points can paint inside — `strokeBounds` for
 *  part of a stroke, padded by the very same rule.
 *
 *  One caller: the gesture in flight, which grows by a point or two per frame
 *  and is repainted only where it grew (see `trail.ts`). It shares `SPREAD`
 *  deliberately — "how far past its geometry a painter reaches" is one number,
 *  and a second copy of it would be a second thing to keep ahead of the
 *  painters. */
export function runBounds(
  stroke: Stroke,
  points: readonly Point[],
): Rect | null {
  return around(points, padFor(stroke));
}

/** The box a stroke can possibly paint inside, in document coordinates.
 *
 *  `null` for a stroke with no geometry at all (an empty path), which is a
 *  stroke that paints nothing and can always be skipped. */
export function strokeBounds(stroke: Stroke): Rect | null {
  const hit = cache.get(stroke);
  if (hit) return hit;
  const pad = padFor(stroke);
  const shape = stroke.shape;
  let box: Rect | null = null;
  if (shape.kind === "path") box = around(shape.points, pad);
  else if (shape.kind === "segment") box = around([shape.from, shape.to], pad);
  else if (shape.kind === "box") box = around([shape.from, shape.to], pad);
  else if (shape.kind === "region") box = around(shape.contours.flat(), pad);
  else if (shape.kind === "image") box = around([shape.from, shape.to], pad);
  else if (shape.kind === "text") {
    // A caption hangs from its top-left anchor, as wide as its longest line and
    // as tall as its lines stacked — measured by the tool that sets it (see
    // `plugins/builtin/text.ts`), with a whole type size of slack for the
    // ascenders and descenders that reach past the box.
    const measured = textBox(shape.text, {
      size: stroke.size,
      font: shape.font,
      bold: shape.bold,
      italic: shape.italic,
    });
    box = around(
      [
        shape.at,
        {
          x: shape.at.x + measured.width,
          y: shape.at.y + measured.height,
        },
      ],
      pad + stroke.size,
    );
  }
  // A mark cut by a selection cannot paint outside the window it was cut to,
  // however far its painter reaches (see `Mask`) — so the cull box is held to
  // it as well, and a mark whose window is off screen is skipped for the same
  // price as one whose ink is.
  if (box && stroke.clip) {
    for (const mask of stroke.clip) {
      const window = around(mask.contours.flat(), 0);
      box = window && box ? meet(box, window) : null;
      if (!box) break;
    }
  }
  if (box) cache.set(stroke, box);
  return box;
}

/** Where two boxes overlap, or `null` when they don't meet at all. */
function meet(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width >= 0 && height >= 0 ? { x, y, width, height } : null;
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
