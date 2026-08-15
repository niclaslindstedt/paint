// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One frame of the canvas.
//
// Split out from `PaintCanvas` because the two are different jobs: that
// component decides *what a pointer means* — which gesture a press begins, when
// a stroke is abandoned, whose the swipe at the edge is — and this decides what
// the screen looks like once that has been decided. The seam between them is the
// spec below: everything a frame depends on, in one value, with no refs and no
// component state in sight.
//
// A frame has four coats, painted in this order and for these reasons:
//
//   1. **the committed marks**, off the mark cache (`cache.ts`) — a blit while a
//      stroke is being drawn, a repaint only when the document or the view
//      actually changed. This is the coat the cache exists for.
//   2. **the marks in flight**, if a selection is being dragged. They are left
//      *out* of the coat above (`RenderOptions.omit`) and painted here at the
//      offset the finger has reached, so a drag is the marks moving rather than
//      a ghost hovering over the copy they came from.
//   3. **the gesture in flight** — the draft stroke, which changes every frame.
//   4. **the sheet, back under the hole**, if either of those two rubbed
//      something out. Coats 2 and 3 land on a finished picture rather than on
//      bare canvas, so an erasing mark takes the page away with the ink; this
//      puts it back (see `underlay`). Skipped entirely unless something erased.
//   5. **the page's filters**, if it carries any — a composite over the
//      finished picture rather than over any part of it, which is why they are
//      applied here and not in the renderer (see `filterPaint.ts`). The
//      context is handed back exactly as they found it.
//   6. **the chrome** — the selection's marching ants and the sheet's edge.
//      Above the filters on purpose: the outline of what you have selected is
//      the one thing on screen that must stay sharp.
//
// The chrome is painted last and deliberately *after* the cache has taken its
// copy of the screen, which is why it lives here rather than in `render.ts`: it
// is not a mark, it never exports, and a cached frame must never have to be
// thrown away to redraw it.

import type { Box } from "./bounds.ts";
import { createCache, paintCommitted, type MarkCache } from "./cache.ts";
import { activeFilters } from "./filters.ts";
import { paintFilters } from "./filterPaint.ts";
import { backgroundHidden } from "./layers.ts";
import { paintMarquee } from "./plugins/builtin/select.ts";
import type { DraftStroke } from "./plugins/types.ts";
import { anyErases, paintStrokes, underlay } from "./render.ts";
import { translateStrokes } from "./selection.ts";
import type { Drawing, Point, Stroke } from "./types.ts";
import type { CanvasView } from "./viewport.ts";

/** Grid spacing in document pixels. */
export const GRID_STEP = 40;

/** The most device pixels one CSS pixel is worth painting at. Past three the
 *  frame costs more than the screen can show. */
const MAX_DPR = 3;

/** A selection being dragged: the marks that were picked up, the ids the page
 *  underneath must leave out, and how far they have come. */
export type MovingMarks = {
  strokes: readonly Stroke[];
  ids: ReadonlySet<string>;
  /** The box the marks covered when the drag began. */
  box: Box;
  offset: Point;
};

/** Everything one frame depends on. */
export type Frame = {
  canvas: HTMLCanvasElement;
  /** The window onto the page, and how big that window is in CSS pixels. */
  view: CanvasView;
  viewport: { width: number; height: number };
  drawing: Drawing;
  pageColor: string;
  defaultInk: string;
  showGrid: boolean;
  /** Bumped whenever a bitmap finishes decoding — see `CacheSpec`. */
  decodedAt: number;
  /** The gesture in flight, or `null`. */
  draft: DraftStroke | null;
  /** The settled selection's outline, or `null`. Ignored while `moving` is set:
   *  the drag draws its own, at the offset it has reached. */
  selection: Box | null;
  moving: MovingMarks | null;
  /** The mark cache, held by the caller across frames and opened here on the
   *  first one. A holder rather than a value because the cache outlives any one
   *  frame and is `null` where there is no DOM to make one in. */
  cache: { current: MarkCache | null };
};

/** Paint one frame onto its canvas. A no-op for a window with no area yet. */
export function paintFrame(frame: Frame): void {
  const { canvas, view, drawing, moving } = frame;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const width = Math.round(frame.viewport.width * dpr);
  const height = Math.round(frame.viewport.height * dpr);
  if (width === 0 || height === 0) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const options = {
    pageColor: frame.pageColor,
    defaultInk: frame.defaultInk,
    grid: frame.showGrid ? GRID_STEP : undefined,
    // Marks being dragged are left out of the page and painted below instead.
    // The set is the caller's and lives as long as the drag, because the cache
    // compares it by identity (see `cache.ts`).
    ...(moving ? { omit: moving.ids } : {}),
  };

  // Paint from a view whose pan is a whole number of device pixels. The view
  // itself keeps its exact value — panning stays smooth and reversible, and the
  // clamp still bites where it bit — but a *frame* is drawn on the pixel grid,
  // which is what lets a drag reuse the frame before it by copying it sideways
  // rather than resampling it (see `cache.ts`). Half a device pixel is below
  // anything a screen can show; a smeared drawing is not.
  const snapped = {
    scale: view.scale,
    tx: Math.round(view.tx * dpr) / dpr,
    ty: Math.round(view.ty * dpr) / dpr,
  };

  // Clear the whole window first — what shows through around the sheet is the
  // container's own background, so the page reads as a sheet on a desk.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  frame.cache.current ??= createCache(width, height);
  paintCommitted(ctx, canvas, frame.cache.current, {
    drawing,
    view: snapped,
    width,
    height,
    dpr,
    options,
    decodedAt: frame.decodedAt,
  });

  // Then the view: device pixels, then the view's scale and pan. From here on
  // this works in document coordinates exactly as the PNG export does.
  ctx.setTransform(
    dpr * snapped.scale,
    0,
    0,
    dpr * snapped.scale,
    dpr * snapped.tx,
    dpr * snapped.ty,
  );

  // The marks being dragged, at the offset the drag has reached. Painted from
  // the same renderer the page uses, so what you are dragging looks exactly like
  // what will land.
  if (moving) {
    const { x: dx, y: dy } = moving.offset;
    paintStrokes(ctx, translateStrokes(moving.strokes, dx, dy), {
      ...options,
      omit: undefined,
    });
  }

  const draft = frame.draft ? { ...frame.draft, id: "draft" } : null;
  if (draft) paintStrokes(ctx, [draft], options);

  // Both coats above landed on pixels that already have the sheet in them — the
  // cache hands back a finished picture, page and all. A mark that rubs out
  // therefore takes the page with it, so the sheet goes back under whatever the
  // hole exposed (see `underlay`). Only when something actually erased: this is
  // every frame of an eraser stroke, and no frame of anything else.
  if ((draft && anyErases([draft])) || (moving && anyErases(moving.strokes))) {
    underlay(ctx, drawing, options);
  }

  // The page's filters, over the finished picture and under the chrome. They
  // are applied here rather than inside the renderer because they are a
  // composite over *everything* — the committed marks the cache blitted, the
  // gesture in flight, the sheet — and because the cache must go on holding the
  // unfiltered picture: moving a slider then costs one composite instead of a
  // repaint of the document (see `filterPaint.ts`).
  const filters = activeFilters(drawing);
  if (filters.length > 0) {
    paintFilters(ctx, filters, {
      page: {
        x: snapped.tx * dpr,
        y: snapped.ty * dpr,
        width: drawing.width * snapped.scale * dpr,
        height: drawing.height * snapped.scale * dpr,
      },
      scale: snapped.scale * dpr,
      pageColor: frame.pageColor,
      transparent: backgroundHidden(drawing),
    });
  }

  // The selection's outline: the same marching ants the marquee was dragged
  // with, so what you dragged and what you got read as one thing.
  const outline = moving
    ? {
        ...moving.box,
        x: moving.box.x + moving.offset.x,
        y: moving.box.y + moving.offset.y,
      }
    : frame.selection;
  if (outline) paintMarquee(ctx, outline, view.scale * dpr);

  // The sheet's edge, so it is visible against the desk. The width is divided
  // by the zoom so the line stays a hairline at any scale instead of fattening
  // as you zoom in.
  ctx.strokeStyle = "rgba(120,130,145,0.4)";
  ctx.lineWidth = 1 / view.scale;
  ctx.strokeRect(0, 0, drawing.width, drawing.height);
}
