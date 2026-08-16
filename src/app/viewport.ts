// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The canvas view: which part of the page the screen is looking at.
//
// The page is now bigger than any screen, so the canvas is a *window* onto it
// rather than a shrink-to-fit thumbnail. That window is one affine transform —
// a uniform scale plus a translation — and everything about panning, pinching,
// and mapping a finger to a document coordinate is arithmetic on it.
//
// Kept pure and DOM-free on purpose: a whole pinch can be driven in a node test
// (see `tests/viewport_test.ts`), which is the only way this stays trustworthy.
// `PaintCanvas` owns the pointers and the repaint; this module owns the maths.

import type { Point } from "./types.ts";

/**
 * How document space maps onto the canvas element's CSS pixels:
 *
 *   screen = document * scale + translate
 *
 * `scale` is uniform — a sketch is never stretched — and `tx` / `ty` are in
 * screen pixels, so they can be nudged straight from a pointer delta.
 */
export type CanvasView = { scale: number; tx: number; ty: number };

/** The size of the window onto the page, in CSS pixels. */
export type Viewport = { width: number; height: number };

/** How far the view may be zoomed. A tenth shows a whole page on a phone; 8×
 *  is enough to place a mark precisely without the page turning to mush. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

/** The scale at which one document pixel is one *device* pixel — the zoom the
 *  readout calls 100%.
 *
 *  The view's own `scale` is in CSS pixels because pointer maths is, but a
 *  page is *made* in device pixels (see `canvasSize.ts`) and the physical
 *  calibration in `units.ts` — "5 mm on the size button is 5 mm on the glass" —
 *  holds at one document pixel per device pixel. So that is what 100% means:
 *  a page made at "This screen" covers the screen exactly, and reads 100%
 *  while doing it, instead of the 1/pixel-ratio it used to be accused of. */
export function nativeScale(pixelRatio: number): number {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return 1 / ratio;
}

/** How much of the page must stay on screen when panning, as a fraction of the
 *  viewport. Panning is otherwise unbounded, so a careless two-finger flick
 *  could leave the sheet off the edge with nothing to steer back by. */
const KEEP_VISIBLE = 0.25;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Map a point on the canvas element (CSS pixels, origin at its top-left) into
 *  document space. The one conversion the tools depend on — they only ever see
 *  document coordinates, at any zoom. */
export function toDocumentPoint(view: CanvasView, screen: Point): Point {
  return {
    x: (screen.x - view.tx) / view.scale,
    y: (screen.y - view.ty) / view.scale,
  };
}

/** The inverse: where a document point lands on the element. */
export function toScreenPoint(view: CanvasView, doc: Point): Point {
  return { x: doc.x * view.scale + view.tx, y: doc.y * view.scale + view.ty };
}

/**
 * Keep the page reachable. The translation is clamped so at least
 * `KEEP_VISIBLE` of the viewport is always covered by the sheet (or, once the
 * page is smaller than the window, so it can't be pushed out past its own
 * edges) — you can always see enough of it to pan back.
 */
export function clampView(
  view: CanvasView,
  page: { width: number; height: number },
  viewport: Viewport,
): CanvasView {
  const clamp = (
    t: number,
    pageLength: number,
    windowLength: number,
  ): number => {
    const painted = pageLength * view.scale;
    const slack = windowLength * KEEP_VISIBLE;
    // The furthest the page may be pushed each way: far enough that only
    // `slack` of it still overlaps the window, in either direction.
    const min = slack - painted;
    const max = windowLength - slack;
    return Math.min(max, Math.max(min, t));
  };
  return {
    scale: view.scale,
    tx: clamp(view.tx, page.width, viewport.width),
    ty: clamp(view.ty, page.height, viewport.height),
  };
}

/** The view a drawing opens at: the page *covering* the window, centred.
 *
 *  Covering, not fitting — the scale is chosen so the page fills the window
 *  edge to edge on both axes, and whichever side the aspect ratios disagree on
 *  is cropped equally at both ends. Opening on a sheet of margins asked you to
 *  zoom before you could draw; opening at 1:1 dropped you somewhere in the
 *  middle of a page you couldn't see the shape of. Opening on the whole
 *  visible sheet is the one view that needs no gesture first — and for a page
 *  made at "This screen" it is also exactly native resolution (see
 *  `nativeScale`). */
export function initialView(
  page: { width: number; height: number },
  viewport: Viewport,
): CanvasView {
  if (page.width <= 0 || page.height <= 0) return centerAt(1, page, viewport);
  const scale = clampScale(
    Math.max(viewport.width / page.width, viewport.height / page.height),
  );
  return centerAt(scale, page, viewport);
}

/** The view that fits the whole page in the window with a little margin — what
 *  the header's "fit page" button returns to. */
export function fitView(
  page: { width: number; height: number },
  viewport: Viewport,
): CanvasView {
  if (page.width <= 0 || page.height <= 0) return initialView(page, viewport);
  const margin = 0.94;
  const scale = clampScale(
    Math.min(viewport.width / page.width, viewport.height / page.height) *
      margin,
  );
  return centerAt(scale, page, viewport);
}

/** The view at `scale` with the page's centre on the window's centre. */
function centerAt(
  scale: number,
  page: { width: number; height: number },
  viewport: Viewport,
): CanvasView {
  return {
    scale,
    tx: (viewport.width - page.width * scale) / 2,
    ty: (viewport.height - page.height * scale) / 2,
  };
}

/**
 * Zoom to `scale` while pinning `anchor` (a point on the element, in CSS
 * pixels) to the same document coordinate it was already over.
 *
 * That anchoring is what makes a pinch feel attached to the fingers rather than
 * to the page's corner: whatever is between your fingers stays between them.
 */
export function zoomAt(
  view: CanvasView,
  scale: number,
  anchor: Point,
): CanvasView {
  const next = clampScale(scale);
  const doc = toDocumentPoint(view, anchor);
  return {
    scale: next,
    tx: anchor.x - doc.x * next,
    ty: anchor.y - doc.y * next,
  };
}

/** Shift the view by a screen-space delta. */
export function panBy(view: CanvasView, dx: number, dy: number): CanvasView {
  return { scale: view.scale, tx: view.tx + dx, ty: view.ty + dy };
}

/** The midpoint between two pointers — a pinch's anchor. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The distance between two pointers — a pinch's scale signal. Guarded against
 *  zero so a ratio taken from it can never be `Infinity`. */
export function distance(a: Point, b: Point): number {
  return Math.max(1e-6, Math.hypot(a.x - b.x, a.y - b.y));
}

/**
 * Apply one frame of a two-finger gesture: scale by how far the fingers spread
 * relative to where they started, and pan by how far their midpoint moved.
 *
 * `start` is the view as it was when the second finger landed, so the whole
 * gesture is computed from its origin rather than accumulated frame by frame —
 * which keeps it exact and makes it reversible (pinch out and back in and you
 * land where you began).
 */
export function pinch(
  start: { view: CanvasView; a: Point; b: Point },
  a: Point,
  b: Point,
  page: { width: number; height: number },
  viewport: Viewport,
): CanvasView {
  const ratio = distance(a, b) / distance(start.a, start.b);
  const from = midpoint(start.a, start.b);
  const to = midpoint(a, b);
  const zoomed = zoomAt(start.view, start.view.scale * ratio, from);
  return clampView(panBy(zoomed, to.x - from.x, to.y - from.y), page, viewport);
}
