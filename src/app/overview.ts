// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The whole page, kept as pixels — what Settings → Performance calls "render
// the whole picture".
//
// Everything else that paints marks is culled to the window (`cache.ts`,
// `frame.ts`), and for the frames a screen actually shows that is exactly
// right: painting page the user cannot see is work thrown away. It stops being
// right the moment the window *moves*. The mark cache is screen-shaped, so a
// pinch that zooms out is asking for page that was never painted, and the only
// two answers it has are to repaint the document on every frame of the gesture
// — seconds per frame on a busy page — or to carry the held pixels and show
// bare desk around them until the fingers lift. It carries, and the picture
// arrives after the gesture instead of during it.
//
// This is the third answer, and it is a *trade* rather than an improvement,
// which is why it is a setting and why the setting says "on a device with room
// to spare". The whole drawing is painted once into a surface of its own, off
// to one side and at idle, and a frame that is zooming out draws that surface
// under the carried pixels. Zooming out then reveals the picture as it goes.
// What it costs is a page-sized bitmap in memory and a full repaint of the
// document — off the frame path, but a real one — every time the drawing
// changes and the app next goes idle. On a phone with a heavy watercolour on
// the page that is the wrong trade; on a desktop it is free.
//
// Three rules keep it from becoming a second source of truth, and they are the
// mark cache's own (see the note at the top of `cache.ts`):
//
//   - **It holds no state the document doesn't.** The pixels are a function of
//     the spec they were painted for and nothing else, and a spec that differs
//     by so much as the page colour is a different picture (`overviewReady`).
//   - **It is only ever shown under a frame that is mid-gesture**, never
//     instead of one. A settled frame paints the document, at the zoom it is
//     actually being shown at, exactly as it did before this file existed.
//   - **It can always fail.** No DOM, no surface, nothing painted yet: every
//     caller carries on with the behaviour it had without an overview.
//
// The surface is held at *document* resolution or below — one surface pixel per
// document pixel, scaled down until it fits a pixel budget — because it is only
// ever shown zoomed *out*. At the zoom where it would start to look soft the
// window is showing the page at less than a device pixel per document pixel
// anyway, and the settle frame that follows is the sharp one regardless.

import { sameFrame, type CacheSpec } from "./cache.ts";
import { visibleStrokes } from "./layers.ts";
import { renderDrawing } from "./render.ts";
import { createSurface, wipeSurface, type Surface } from "./surface.ts";
import { atIdle } from "./tiles.ts";
import type { Stroke } from "./types.ts";

/** The most pixels an overview may be. Four megapixels is sixteen megabytes of
 *  bitmap — the size of a couple of photos, and a great deal less than the
 *  drawing that would need a bigger one has already spent on itself. A page
 *  larger than this is held at a fraction of its own resolution instead, which
 *  is invisible at the zooms an overview is shown at. */
export const OVERVIEW_PIXELS = 4_000_000;

/** …and the most it may be on one side, whatever the budget allows. A canvas
 *  past a few thousand pixels a side is refused outright by some browsers, and
 *  a refused surface would take the whole overview down rather than the
 *  resolution. */
const MAX_SIDE = 8192;

/** The whole page as pixels, and the picture those pixels are of. */
export type Overview = {
  surface: Surface;
  /** Surface pixels per document pixel — at most one (see the note above). */
  scale: number;
  /** The spec the pixels were painted for, or `null` when there are none. */
  painted: CacheSpec | null;
  /** The strokes on them, by identity — the half of "same picture" a spec
   *  cannot answer (see `overviewReady`). */
  strokes: readonly Stroke[];
  /** The spec the queued rebuild will paint, always the newest one asked for:
   *  a burst of edits costs one repaint at the end rather than one each. */
  next: CacheSpec | null;
  /** Cancels that queued rebuild, or `null` when none is queued. */
  cancel: (() => void) | null;
};

/** The overview across frames, held by whoever paints them — a holder rather
 *  than a value for the reason the mark cache is one: it outlives any frame,
 *  and it is `null` until something asks for it (and where there is no DOM to
 *  make one in). */
export type OverviewHolder = { current: Overview | null };

/** How small a page of this size has to be held to fit the budget. Never
 *  larger than 1: the document's own resolution is the most an overview can
 *  usefully be, since it is only ever shown zoomed out. */
export function overviewScale(page: { width: number; height: number }): number {
  const width = Math.max(1, page.width);
  const height = Math.max(1, page.height);
  return Math.min(
    1,
    Math.sqrt(OVERVIEW_PIXELS / (width * height)),
    MAX_SIDE / width,
    MAX_SIDE / height,
  );
}

/** Whether the held pixels are the picture `spec` describes.
 *
 *  Two questions, because a spec answers only one of them. `sameFrame` compares
 *  everything that decides a frame's pixels — the page's colours and sheet, the
 *  grid, the simulation detail, an effect being previewed, the marks a drag is
 *  leaving out — but it compares the *view* too, and an overview deliberately
 *  has none: it is the whole page, at its own scale, whatever the window is
 *  doing. So the view, the canvas size and the pixel ratio are forced equal
 *  before the comparison, and the strokes are compared separately by identity,
 *  exactly as the mark cache compares them. */
export function overviewReady(
  overview: Overview | null,
  spec: CacheSpec,
): boolean {
  if (!overview?.painted) return false;
  if (!samePicture(overview.painted, spec)) return false;
  return sameStrokes(overview.strokes, visibleStrokes(spec.drawing));
}

/** Draw the held page where this frame's view says it now sits.
 *
 *  One `drawImage` under the transform that maps document space onto the
 *  frame's device pixels — the same map `cache.ts` paints through, with the
 *  overview's own scale divided back out. `false` when there is nothing to
 *  draw. */
export function paintOverview(
  ctx: CanvasRenderingContext2D,
  overview: Overview,
  spec: CacheSpec,
): boolean {
  if (!overview.painted) return false;
  const { view, dpr } = spec;
  const onScreen = (dpr * view.scale) / overview.scale;
  if (!Number.isFinite(onScreen) || onScreen <= 0) return false;
  ctx.setTransform(onScreen, 0, 0, onScreen, dpr * view.tx, dpr * view.ty);
  ctx.drawImage(overview.surface.canvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}

/** Keep the overview current *off the frame's own path*: a stale one is queued
 *  to be repainted the next time the browser has a moment, and the queue holds
 *  one job however many frames ask.
 *
 *  Called from a settled frame rather than from every frame, because the
 *  repaint it queues is a whole document and an idle callback that landed
 *  between two frames of a gesture would be felt. A drawing that is being drawn
 *  on therefore has a stale overview for as long as the hand is moving, which
 *  is exactly when nothing is looking at it. */
export function warmOverview(holder: OverviewHolder, spec: CacheSpec): void {
  const overview = open(holder, spec);
  if (!overview) return;
  if (overviewReady(overview, spec)) {
    overview.next = null;
    return;
  }
  overview.next = spec;
  if (overview.cancel) return;
  overview.cancel = atIdle(() => {
    overview.cancel = null;
    const queued = overview.next;
    overview.next = null;
    if (queued) refreshOverview(overview, queued);
  });
}

/** Paint the whole document into the overview's surface, now.
 *
 *  Unclipped on purpose — this is the one render in the app that wants every
 *  mark, whatever the window is showing — and at the overview's own scale
 *  rather than the frame's, so the pixels are the page rather than a view of
 *  it. */
export function refreshOverview(overview: Overview, spec: CacheSpec): void {
  const { drawing } = spec;
  overview.scale = overviewScale(drawing);
  const { ctx } = wipeSurface(
    overview.surface,
    drawing.width * overview.scale,
    drawing.height * overview.scale,
  );
  ctx.setTransform(overview.scale, 0, 0, overview.scale, 0, 0);
  renderDrawing(ctx, drawing, null, spec.options);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  overview.painted = spec;
  overview.strokes = visibleStrokes(drawing);
}

/** Drop the pixels and cancel anything queued — the setting being switched off,
 *  or the canvas going away. The surface is a page-sized bitmap and there is no
 *  reason for it to outlive the answer that asked for it. */
export function releaseOverview(holder: OverviewHolder): void {
  holder.current?.cancel?.();
  holder.current = null;
}

/** The holder's overview, opened on first use. `null` where there is no DOM to
 *  open one in, which is every caller's cue to carry on without one. */
function open(holder: OverviewHolder, spec: CacheSpec): Overview | null {
  if (holder.current) return holder.current;
  const surface = createSurface(1, 1);
  if (!surface) return null;
  holder.current = {
    surface,
    scale: overviewScale(spec.drawing),
    painted: null,
    strokes: [],
    next: null,
    cancel: null,
  };
  return holder.current;
}

/** The view an overview is compared at — it has none of its own, so both sides
 *  of the comparison are asked about the same one. */
const NO_VIEW = { scale: 1, tx: 0, ty: 0 };

function samePicture(a: CacheSpec, b: CacheSpec): boolean {
  const flatten = (spec: CacheSpec): CacheSpec => ({
    ...spec,
    view: NO_VIEW,
    width: 0,
    height: 0,
    dpr: 1,
  });
  return sameFrame(flatten(a), flatten(b));
}

function sameStrokes(a: readonly Stroke[], b: readonly Stroke[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
