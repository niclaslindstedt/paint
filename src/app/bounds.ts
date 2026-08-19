// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How much of the page a mark actually covers.
//
// Two things need this and neither is a tool: the "just the marks" download
// scope (crop the export to the ink rather than the sheet) and growing the page
// around a dropped image. Both are questions about *geometry*, so the answers
// live here and switch on the shape kind — the same fallback contract the
// renderer's generic painter uses. A tool that invents no new shape kind needs
// no change here.

import { visibleStrokes } from "./layers.ts";
import { textBox } from "./plugins/builtin/text.ts";
import type { Drawing, Point, Stroke } from "./types.ts";

/** An axis-aligned rectangle in document pixels. */
export type Box = { x: number; y: number; width: number; height: number };

/** The box two corners describe, whichever way round they were dragged. */
export function boxFromCorners(from: Point, to: Point): Box {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/** The smallest box holding both. */
export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Grow a box by `by` on every side — how a stroke's nib is accounted for. */
export function padBox(box: Box, by: number): Box {
  return {
    x: box.x - by,
    y: box.y - by,
    width: box.width + by * 2,
    height: box.height + by * 2,
  };
}

/** The smallest box holding every point, or `null` when there are none. */
function pointsBox(points: readonly Point[]): Box | null {
  const first = points[0];
  if (!first) return null;
  let box: Box = { x: first.x, y: first.y, width: 0, height: 0 };
  for (const p of points) {
    box = unionBox(box, { x: p.x, y: p.y, width: 0, height: 0 });
  }
  return box;
}

/** As much of a stroke as measuring it needs: the geometry, the nib, and the
 *  window it was cut to. Widened from `Stroke` so a mark that hasn't been filed
 *  yet — one on the clipboard, one being pasted — can be measured with the same
 *  function the page uses. */
export type Measurable = Pick<Stroke, "size" | "shape" | "clip">;

/** Where two boxes overlap, or `null` when they don't. */
function meetBox(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width >= 0 && height >= 0 ? { x, y, width, height } : null;
}

/** The area one stroke paints: its geometry and its nib, held inside whatever
 *  windows it was cut to. `null` for a shape carrying no geometry (an empty
 *  path) — which simply contributes nothing to the union — and for a mark whose
 *  window it misses entirely, which paints nothing at all.
 *
 *  Cutting the box down matters as much as the box itself: it is what culls a
 *  mark whose window is off screen, what crops "just the marks" to what is
 *  actually painted, and what stops half a page-wide line that was cut to a
 *  thumbnail-sized selection dragging the page's size out with it. */
export function strokeBounds(stroke: Measurable): Box | null {
  const drawn = shapeBounds(stroke);
  if (!drawn || !stroke.clip) return drawn;
  let box: Box | null = drawn;
  for (const mask of stroke.clip) {
    const window = pointsBox(mask.contours.flat());
    // A window with no outline at all is one nothing gets through.
    if (!window || !box) return null;
    box = meetBox(box, window);
  }
  return box;
}

/** The area the stroke's own geometry covers, before any window is applied. */
function shapeBounds(stroke: Measurable): Box | null {
  const shape = stroke.shape;
  // Half the nib each way, and never less than a pixel: a hairline still has
  // to survive the crop.
  const nib = Math.max(stroke.size, 1) / 2;
  if (shape.kind === "path") {
    const box = pointsBox(shape.points);
    return box && padBox(box, nib);
  }
  if (shape.kind === "region") {
    // A filled area is painted, not stroked, so its outlines *are* its edges.
    return pointsBox(shape.contours.flat());
  }
  if (shape.kind === "segment" || shape.kind === "box") {
    return padBox(boxFromCorners(shape.from, shape.to), nib);
  }
  // A bitmap ends exactly where its frame does — no nib to account for.
  if (shape.kind === "image") return boxFromCorners(shape.from, shape.to);
  // A caption hangs from its top-left anchor and is as big as the type in it —
  // measured by the tool that sets it, in the face it was set in, so a crop to
  // "just the marks" ends where the words do (see `plugins/builtin/text.ts`).
  const box = textBox(shape.text, {
    size: stroke.size,
    font: shape.font,
    bold: shape.bold,
    italic: shape.italic,
  });
  return { x: shape.at.x, y: shape.at.y, ...box };
}

/** The area every mark on a drawing covers, or `null` for a blank page.
 *
 *  Only the marks that are actually painted — a hidden layer is not in the
 *  file, so cropping an export to it would leave a margin of blank page around
 *  what you can see. */
export function drawingBounds(drawing: Drawing): Box | null {
  let box: Box | null = null;
  for (const stroke of visibleStrokes(drawing)) {
    const next = strokeBounds(stroke);
    if (!next) continue;
    box = box ? unionBox(box, next) : next;
  }
  return box;
}

/** Clip a box to the page — nothing outside the sheet was ever painted. */
export function clipToPage(
  box: Box,
  page: { width: number; height: number },
): Box {
  const x = Math.max(0, Math.min(box.x, page.width));
  const y = Math.max(0, Math.min(box.y, page.height));
  return {
    x,
    y,
    width: Math.max(0, Math.min(box.x + box.width, page.width) - x),
    height: Math.max(0, Math.min(box.y + box.height, page.height) - y),
  };
}

/** The page size that would contain `box` — the current one, grown on the
 *  right and the bottom only. The origin is fixed: moving it would shift every
 *  existing mark on the page. */
export function pageFitting(
  page: { width: number; height: number },
  box: Box,
): { width: number; height: number } {
  return {
    width: Math.max(page.width, Math.ceil(box.x + box.width)),
    height: Math.max(page.height, Math.ceil(box.y + box.height)),
  };
}
