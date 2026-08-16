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
//   5. **the chrome** — the selection's marching ants and the sheet's edge.
//      Above everything on purpose: the outline of what you have selected is
//      the one thing on screen that must stay sharp.
//
// The chrome is painted last and deliberately *after* the cache has taken its
// copy of the screen, which is why it lives here rather than in `render.ts`: it
// is not a mark, it never exports, and a cached frame must never have to be
// thrown away to redraw it.
//
// …and then there is the frame that paints almost none of that. While a gesture
// is being drawn, the *only* thing that changes from one frame to the next is
// the couple of samples that arrived, so a frame that repaints the whole
// gesture is doing the same work over and over — quadratically over, since it
// does it once per sample. Such a frame instead repaints the patch of screen
// the gesture has just grown into and leaves the rest standing (see
// `trail.ts`, which decides when that is safe, and `paintPatch` below, which
// paints it). It is the same three coats over a smaller box.

import type { Box } from "./bounds.ts";
import {
  blitCache,
  createCache,
  paintCommitted,
  windowOnPage,
  type CacheSpec,
  type MarkCache,
} from "./cache.ts";
import type { Rect } from "./geometry.ts";
import type { EffectPreview } from "./render.ts";
import { visibleStrokes } from "./layers.ts";
import { paintMarquee } from "./plugins/builtin/select.ts";
import type { DraftStroke } from "./plugins/types.ts";
import type { LeadEngine } from "./plugins/lead.ts";
import type { WashEngine } from "./plugins/wash.ts";
import {
  anyErases,
  onSheet,
  paintStrokes,
  relayFixed,
  underlay,
} from "./render.ts";
import { translateStrokes } from "./selection.ts";
import { trailAhead, trailPainted, type Trail } from "./trail.ts";
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
  /** The two squares of the transparency chequer for the app as it is currently
   *  painting (see `canvas.ts`). Only ever set by a screen: it is how a page
   *  with no sheet is *shown*, and an export leaves it out so the nothing stays
   *  nothing. */
  checker: readonly [string, string];
  /** Which watercolour engine paints a wash on this frame (see
   *  `plugins/wash.ts`). Written into the render options so the mark cache can
   *  see it change — switching engine repaints the page rather than blitting
   *  the picture the other one left. */
  washEngine: WashEngine;
  /** …and how finely it resolves, for the same reason: turning the detail down
   *  repaints every wash on the page without touching a stroke, so the cache
   *  has to be able to see it move (see `MIN_WASH_DETAIL`). */
  washDetail: number;
  /** …and which pencil draws the graphite marks, for the same reason again:
   *  switching engine redraws every pencil line on the page without touching a
   *  stroke, so the cache has to be able to see it move (see
   *  `plugins/lead.ts`). */
  leadEngine: LeadEngine;
  /** …and how finely it works them out, for the same reason once more (see
   *  `MIN_LEAD_DETAIL`). */
  leadDetail: number;
  /** Bumped whenever a bitmap finishes decoding — see `CacheSpec`. */
  decodedAt: number;
  /** An effect the dialog is setting up, shown on the layers it would land on
   *  and never kept (see `render.ts`). Pass the *same object* for as long as the
   *  setting holds: the mark cache compares it by identity. */
  preview: EffectPreview | null;
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
  /** What the frame before this one painted, so a gesture that has merely got
   *  longer can be painted where it grew and nowhere else (see `trail.ts`).
   *  Held by the caller for the same reason the cache is. */
  trail: Trail;
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
    // What the sheet is made of. It travels with the drawing rather than being
    // a setting of the canvas, so it is read off the document like the page's
    // colour is (see `ground.ts`).
    ground: frame.drawing.ground,
    grid: frame.showGrid ? GRID_STEP : undefined,
    checker: frame.checker,
    washEngine: frame.washEngine,
    washDetail: frame.washDetail,
    leadEngine: frame.leadEngine,
    leadDetail: frame.leadDetail,
    // The effect being set up, if a dialog is open on one. It goes through the
    // renderer rather than being composited over the finished frame, because an
    // effect lands on *layers*: what the preview shows has to be the same
    // composite the bake will rasterise (see `bake.ts`).
    ...(frame.preview ? { preview: frame.preview } : {}),
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

  const spec: CacheSpec = {
    drawing,
    view: snapped,
    width,
    height,
    dpr,
    options,
    decodedAt: frame.decodedAt,
  };
  const draft = frame.draft ? { ...frame.draft, id: "draft" } : null;
  // The selection's outline: the same marching ants the marquee was dragged
  // with, so what you dragged and what you got read as one thing.
  const outline = moving
    ? {
        ...moving.box,
        x: moving.box.x + moving.offset.x,
        y: moving.box.y + moving.offset.y,
      }
    : frame.selection;

  // The cheap frame: nothing changed but the gesture, and the gesture only got
  // longer. Repaint the patch it grew into and leave the rest of the screen
  // standing (see `trail.ts`). Skipped while marks are being dragged — that is
  // a second coat over the page and not a mark growing.
  const patch = moving ? null : trailAhead(frame.trail, spec, draft, outline);
  const cache = frame.cache.current;
  if (
    patch &&
    draft &&
    cache?.painted &&
    paintPatch(ctx, frame, spec, cache, draft, patch, outline)
  ) {
    trailPainted(frame.trail, spec, draft, outline);
    return;
  }

  // Clear the whole window first — what shows through around the sheet is the
  // container's own background, so the page reads as a sheet on a desk.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  frame.cache.current ??= createCache(width, height);
  paintCommitted(ctx, canvas, frame.cache.current, spec);

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
  const dragged = moving
    ? translateStrokes(moving.strokes, moving.offset.x, moving.offset.y)
    : [];
  // Both coats are culled against the window, exactly as the page under them
  // was: a mark being dragged half off the screen, or a spray whose cone is
  // mostly past the edge, should cost what is showing (see `PaintDetail.clip`).
  const onPage = windowOnPage(spec);
  const inFlight = draft ? [...dragged, draft] : dragged;
  // Both coats are held to the sheet as well, exactly as the page under them
  // was (see `onSheet`): a gesture that wanders off the paper leaves nothing on
  // the desk beside it, and the screen therefore shows what an export would.
  onSheet(ctx, drawing, () => {
    if (moving) {
      paintStrokes(ctx, dragged, { ...options, clip: onPage, omit: undefined });
    }

    // The gesture in flight is the one coat in the app painted once per pointer
    // sample rather than once per mark, so it is the one told so — the
    // watercolour simulation works a live mark out on a smaller field and
    // settles it into the full one when the brush lifts (see `PaintDetail.live`).
    if (draft) {
      paintStrokes(ctx, [draft], { ...options, clip: onPage, live: true });
    }

    // Both coats above landed on pixels that already have the sheet in them — the
    // cache hands back a finished picture, page and all. A mark that rubs out
    // therefore takes the page with it, so the sheet goes back under whatever the
    // hole exposed (see `underlay`). Only when something actually erased: this is
    // every frame of an eraser stroke, and no frame of anything else.
    if (anyErases(inFlight)) {
      // …and a rubbing out that only lifts what a rubber can lift took the ink
      // with it too, for the same reason: those pixels are a finished picture and
      // it cannot tell what made them. The marks it could not have lifted go back
      // first, under nothing and over the hole (see `relayFixed`).
      relayFixed(ctx, inFlight, options, visibleStrokes(drawing));
      underlay(ctx, drawing, options);
    }
  });

  paintChrome(ctx, drawing, outline, view.scale, dpr);
  trailPainted(frame.trail, spec, draft, outline);
}

/** The chrome, in document coordinates: the selection's outline and the sheet's
 *  edge. Neither is a mark — they never export, and the cache takes its copy of
 *  the screen before they go on. */
function paintChrome(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  outline: Box | null,
  scale: number,
  dpr: number,
): void {
  if (outline) paintMarquee(ctx, outline, scale * dpr);

  // The sheet's edge, so it is visible against the desk. The width is divided
  // by the zoom so the line stays a hairline at any scale instead of fattening
  // as you zoom in.
  ctx.strokeStyle = "rgba(120,130,145,0.4)";
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(0, 0, drawing.width, drawing.height);
}

/** One patch of one frame: the box a growing gesture has just reached into,
 *  repainted from the document, with every pixel outside it left exactly as the
 *  frame before this one drew it. `false` when it couldn't be done and the
 *  caller has to paint the frame in full.
 *
 *  Inside the box it is the same three coats a full frame paints, in the same
 *  order — the committed marks, the gesture, the chrome — so the patch is what a
 *  full repaint would have put there, painted from the document and not
 *  assembled out of what was already on screen.
 *
 *  "What a full repaint would have put there" is true to within the
 *  **antialiasing fringe**, and that is worth writing down because it looks like
 *  a bug and is the same one the mark cache's scrolled frames document: a canvas
 *  rasteriser is not indifferent to how much of a path it is being asked to
 *  draw. Painting a stroke cropped to a patch and painting the whole of it put
 *  the *same* edge in the same place to within a fraction of a device pixel, but
 *  not to within nothing — measured at a fifth of a percent of the canvas, all
 *  of it on the one-pixel rim of a hard-edged mark, and at a hundredth of a
 *  percent for the soft ones this exists for. Nothing accumulates (each patch
 *  repaints its box from the page up rather than blending into what was there)
 *  and it heals: the moment the gesture lands, the stroke is painted once more,
 *  whole, onto the mark cache.
 *
 *  What it is *not* allowed to be is stale. Every pixel outside the box has to
 *  be one the new samples could not have changed, which is what `runBounds` is
 *  for and why `PaintPlugin.grows` is opt-in. */
function paintPatch(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  spec: CacheSpec,
  cache: MarkCache,
  draft: Stroke,
  patch: Rect,
  outline: Box | null,
): boolean {
  const box = onScreen(patch, spec);
  // The gesture has grown somewhere the window cannot see. Nothing to paint,
  // and the screen is already right.
  if (!box) return true;
  const { view, dpr } = spec;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  ctx.clearRect(box.x, box.y, box.width, box.height);
  // The committed marks, back under the patch — the same blit a full frame
  // takes, kept to the clip. They are a finished picture, page and all, which
  // is the whole reason a mark that rubs out is never painted this way.
  blitCache(ctx, cache);

  ctx.setTransform(
    dpr * view.scale,
    0,
    0,
    dpr * view.scale,
    dpr * view.tx,
    dpr * view.ty,
  );
  // The whole gesture, culled: what the painters skip they skip because it
  // could not have landed in the box, never because the box cut it off. Held to
  // the sheet and marked live for the same reasons a full frame's is.
  onSheet(ctx, frame.drawing, () => {
    paintStrokes(ctx, [draft], { ...spec.options, clip: patch, live: true });
  });
  paintChrome(ctx, frame.drawing, outline, view.scale, dpr);
  ctx.restore();
  return true;
}

/** Where a box of page lands in the window, in whole device pixels and clamped
 *  to it. `null` when none of it is on screen. Rounded outwards, so a patch can
 *  never fall half a pixel short of the ink it is there to cover. */
function onScreen(box: Rect, spec: CacheSpec): Rect | null {
  const { view, dpr, width, height } = spec;
  const left = Math.floor((box.x * view.scale + view.tx) * dpr);
  const top = Math.floor((box.y * view.scale + view.ty) * dpr);
  const right = Math.ceil(((box.x + box.width) * view.scale + view.tx) * dpr);
  const bottom = Math.ceil(((box.y + box.height) * view.scale + view.ty) * dpr);
  const x = Math.max(0, left);
  const y = Math.max(0, top);
  const w = Math.min(width, right) - x;
  const h = Math.min(height, bottom) - y;
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
}
