// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The committed marks, kept as pixels.
//
// A repaint is a fold over the whole document (see `render.ts`), and that is
// the right shape for a vector app: one path, no stale state, undo and sync and
// a theme flip all handled by the same code. But the canvas repaints on *every
// pointer sample*, and almost none of what it repaints has changed — the
// hundred strokes already on the page are the same hundred strokes they were a
// millisecond ago. Drawing one more line should not cost a hundred airbrush
// strokes, and on a busy page it was costing several hundred milliseconds of
// them per sample.
//
// So the committed marks are kept as a bitmap and blitted. Three things can
// happen when the canvas asks for a frame, and they are in order of how often
// they happen:
//
//   - **nothing changed** — the same document, the same view, the same page
//     colours. Blit. This is every frame of a stroke being drawn, and it is
//     the case the whole file exists for.
//   - **strokes were appended** — the gesture just committed. Paint the new
//     ones onto the cache, on top of what is already there, and blit. A
//     finished stroke costs one stroke, not a document.
//   - **the page was dragged** — a pan moves the window without changing a
//     mark in it, so the cache is blitted at an offset and only the strip of
//     page that has just come into view is painted. A slow drag exposes a few
//     pixels a frame; the rest of the window is a copy of the frame before it.
//   - **anything else** — an undo, a colour change, a zoom, a different
//     drawing. Paint the document, and this is the part worth reading twice:
//     it is painted **to the screen**, and the cache then *copies the screen*.
//
// That last move is the difference between this being a win and a wash.
// Rendering into an off-screen canvas measures around two and a half times
// slower than rendering to the visible one — an off-screen 2D context does not
// reliably get the same accelerated surface — so a design that repaints into
// the cache and blits would make every pan and zoom slower than having no cache
// at all. Painting the screen and copying the finished pixels back costs one
// bitmap copy instead, and leaves the cache holding exactly what the screen
// showed, which is exactly what the next frame wants to blit.
//
// The cache is *screen-shaped*, not page-shaped: it holds the window at the
// zoom it is currently showing, so blitting it is a straight copy with no
// resampling, and a page far larger than the screen costs no more memory than
// the screen does. The price is that panning and zooming fall into the third
// case, which is why the renderer culls to the window (`geometry.ts`) — a
// zoomed-in pan then repaints what is on screen instead of the whole document.
//
// What the cache must never be is a second source of truth. It holds no state
// the document doesn't, every path into it goes through `renderDrawing`, and if
// it cannot be created at all (no DOM) the canvas paints exactly as it did
// before it existed.
//
// "The strokes" here always means the *painted* ones — the stack flattened into
// paint order with the hidden layers left out (`layers.ts`), which is what the
// renderer folds over too. Reordering or hiding a layer therefore reads as a
// changed document and repaints, and a mark landing under a layer that is
// already painted repaints rather than appending, which is exactly right: it
// has to go *under* pixels the cache is already holding.
//
// (This file was `layer.ts` until the drawing itself grew layers. The bitmap
// gave the word back.)

import type { Rect } from "./geometry.ts";
import { backgroundHidden, paintedLayers, visibleStrokes } from "./layers.ts";
import { groundProfile, groundStains } from "./ground.ts";
import { relayFixed } from "./relay.ts";
import {
  anyErases,
  anyStains,
  onSheet,
  paintStrokes,
  renderDrawing,
  underlay,
  type KeepWet,
  type RenderOptions,
} from "./render.ts";
import { createSurface, resizeSurface, type Surface } from "./surface.ts";
import type { Drawing, Ground, Stroke } from "./types.ts";

/** Where the page sits in the window: a scale and a translation, in CSS pixels
 *  (the canvas's `CanvasView`, which this module deliberately doesn't import —
 *  the cache cares about the numbers, not about the viewport's rules). */
export type CacheView = { scale: number; tx: number; ty: number };

/** Everything a frame of committed marks depends on. Two frames with equal
 *  specs are the same picture, which is what makes "blit and stop" safe. */
export type CacheSpec = {
  drawing: Drawing;
  view: CacheView;
  /** The on-screen canvas's size, in device pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  dpr: number;
  /** What the marks are painted over and against — see `render.ts`. */
  options: Omit<RenderOptions, "clip" | "scale">;
  /** Bumped whenever a bitmap the document references finishes decoding.
   *
   *  The cache's whole premise is that an unchanged document paints the same
   *  picture, and an image stroke is the one place that isn't true: it paints
   *  nothing until its data URL has decoded, and the decode lands later without
   *  touching the document (see `images.ts`). Without this, a dropped picture
   *  would sit invisible behind a cached frame until something else forced a
   *  repaint — the bug the cache would otherwise have quietly introduced. */
  decodedAt?: number;
  /** The view is still under the fingers — a pinch in progress, a wheel still
   *  turning. A frame that differs from the cache's only by where the view has
   *  got to may then be served by **carrying** the held pixels to the new view
   *  (one resampled blit) instead of repainting the document, because a sharp
   *  frame is coming the moment the gesture settles (see `carry`). The caller
   *  owns that promise: whoever sets this must ask for one more frame with it
   *  off when the gesture ends. */
  zooming?: boolean;
};

/** What a frame actually had to do. The canvas ignores it; the tests assert on
 *  it, because "did this frame repaint the document" is the whole point of the
 *  cache and is otherwise invisible. */
export type CacheWork =
  "blitted" | "appended" | "scrolled" | "carried" | "repainted";

export type MarkCache = {
  surface: Surface;
  /** The spec the pixels were painted for, or `null` when there are none. */
  painted: CacheSpec | null;
  /** The painted strokes, in paint order. Held so the next frame can ask
   *  whether the document merely grew. Never copied — it is the array
   *  `visibleStrokes` handed back, which for a single-layer drawing is the
   *  document's own. */
  strokes: readonly Stroke[];
  /** How many of them are actually on the pixels. */
  count: number;
  /** The topmost painted layer kept apart as pixels, on a sheet that soaks —
   *  what lets a wet mark land for the cost of one stroke (see the wet-append
   *  note in `paintCommitted`). `null` until the first repaint on such a
   *  sheet builds it. */
  wet: WetLayer | null;
};

/** The wet layer's own pixels, and the picture that stood below them.
 *
 *  A wet mark mixes with *its own layer* rather than with the finished picture
 *  (see `render.ts`), so the finished pixels above can never absorb one. These
 *  two surfaces are the decomposition that can: `layer` is the surface the
 *  topmost painted layer was lifted onto — the exact one `paintLayerApart`
 *  composited, handed to the cache instead of being recycled — and `below` is
 *  the screen as it stood just before that composite: every lower layer, and
 *  no sheet, which goes under at the end (`underlay`). A stroke landing on the
 *  layer is then painted onto `layer` exactly as a full repaint would have
 *  painted it — same fold, same pixels under it — and the screen is put back
 *  together as `below` + `layer` + the sheet.
 *
 *  Valid only while `layerId` is set, and only for the spec the cache's own
 *  pixels were painted for: anything that repaints, scrolls or resizes the
 *  frame stales it. The surfaces are kept through invalidation so a pinch
 *  repainting every frame reuses them rather than minting two canvases a
 *  frame. */
type WetLayer = {
  /** Which layer these pixels are, or `null` while they are stale. */
  layerId: string | null;
  /** The marks on `layer`, in paint order — what a rubbing out landing next
   *  owes ink back over (see `relayFixed`). */
  strokes: readonly Stroke[];
  layer: Surface;
  below: Surface;
};

/** Open a cache, or `null` where there is no DOM to open one in — in which case
 *  the canvas paints the document directly, as it always did. */
export function createCache(width: number, height: number): MarkCache | null {
  const surface = createSurface(width, height);
  return surface
    ? { surface, painted: null, strokes: [], count: 0, wet: null }
    : null;
}

/** Paint the committed marks onto the visible canvas, keeping `cache` up to
 *  date as cheaply as the frame allows.
 *
 *  The caller is expected to have cleared `canvas` and to paint the gesture in
 *  flight and any chrome *after* this returns — what is on the canvas when this
 *  finishes is what the cache will be holding, and neither of those belongs
 *  there. Passing a `null` cache paints the document straight through, which is
 *  the behaviour this whole module is an optimisation of. */
export function paintCommitted(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cache: MarkCache | null,
  spec: CacheSpec,
): CacheWork {
  if (!cache) {
    paintDocument(ctx, spec);
    return "repainted";
  }

  const strokes = visibleStrokes(spec.drawing);
  // An effect being previewed gives up both shortcuts, and has to.
  //
  // Appending is the load-bearing one: a layer under a preview is composited as
  // a unit (see `render.ts`), so a mark landing on it does not go *on top of*
  // the pixels the cache is holding — the whole layer has to be softened again
  // with the new mark inside it, and a stroke painted over the finished blur
  // would sit sharp on a page that is not. Scrolling is a correctness no-op but
  // a performance one: each strip would re-run the effect over a canvas-sized
  // surface, so two strips a frame costs more than the single repaint it is
  // avoiding.
  //
  // This is a *dialog being open*, which is the whole reason it is affordable:
  // an effect that has been applied is a bitmap on the page and the cache
  // absorbs marks landing on it exactly as it does anywhere else. Every drawing
  // with no dialog open on it takes neither branch and pays nothing for this.
  const previewing = spec.options.preview !== undefined;
  const usable =
    cache.painted !== null &&
    sameFrame(cache.painted, spec) &&
    cache.surface.canvas.width === spec.width &&
    cache.surface.canvas.height === spec.height &&
    grewFrom(cache.strokes, cache.count, strokes) &&
    (!previewing || strokes.length === cache.count);

  // A mark that soaks into the sheet mixes with what is under it (see
  // `render.ts`), and on these pixels "what is under it" is a *finished*
  // picture — every layer, and the sheet itself. Appending one would mix it
  // with all of that, where a repaint mixes it only with its own layer, and the
  // two would show a different picture the next time anything forced a full
  // one. So a wet mark can never land on the cache's own pixels — it lands on
  // the **wet layer's** instead, when the last repaint kept them (see
  // `WetLayer`): the stroke is painted onto that layer's surface exactly as
  // the repaint would have painted it, and the screen is put back together
  // from the two halves. One stroke, not a document — the difference between
  // a heavy watercolour that hitches on every landing and one that doesn't.
  // Without kept pixels to land on it costs the repaint it always did, which
  // rebuilds them for the stroke after it.
  const landed = usable ? strokes.slice(cache.count) : [];
  if (
    usable &&
    landed.length > 0 &&
    wetAppend(ctx, canvas, cache, spec, landed)
  ) {
    remember(cache, spec, strokes);
    return "appended";
  }
  if (usable && !anyStains(landed, groundProfile(spec.options.ground))) {
    // These pixels are everything flattened, so a mark landing here must not
    // be one the wet layer's surface is also going to claim: the surface goes
    // stale the moment the append below paints past it.
    if (landed.length > 0 && cache.wet) cache.wet.layerId = null;
    const added = landed.length;
    if (added > 0) {
      // The gesture that just landed, painted onto the marks already there —
      // which is what compositing it over them on screen did anyway. Held to
      // the sheet, exactly as a full repaint holds every mark to it (see
      // `onSheet`), so the cache cannot keep ink the page hasn't got.
      applyView(cache.surface.ctx, spec);
      onSheet(cache.surface.ctx, spec.drawing, () => {
        paintStrokes(cache.surface.ctx, landed, {
          ...spec.options,
          clip: windowOnPage(spec),
        });
        // …with the same caveat the screen has: what is already on these pixels
        // is a finished picture, sheet included, so a mark that rubs out takes
        // the page with it — and, if it was a rubber rather than a hole, takes
        // ink it could never have lifted with it too. Both go back: the ink over
        // what the rubbing out exposed, then the sheet under the lot.
        if (anyErases(landed)) {
          relayFixed(
            cache.surface.ctx,
            landed,
            { ...spec.options, clip: windowOnPage(spec) },
            strokes.slice(0, cache.count),
          );
          underlay(cache.surface.ctx, spec.drawing, spec.options);
        }
      });
    }
    remember(cache, spec, strokes);
    blitCache(ctx, cache);
    return added > 0 ? "appended" : "blitted";
  }

  if (!previewing && scroll(ctx, cache, spec, strokes)) {
    capture(cache, canvas, spec);
    remember(cache, spec, strokes);
    // The kept wet pixels are in the view they were painted in, and the view
    // just moved under them.
    if (cache.wet) cache.wet.layerId = null;
    return "scrolled";
  }

  // The view is mid-gesture and only the view moved: carry the held pixels to
  // where it has got to and let the settle frame paint the real picture. The
  // cache deliberately remembers nothing — every carried frame resamples the
  // *last real repaint* exactly once, so a long pinch cannot compound blur by
  // blitting blits.
  if (spec.zooming && carry(ctx, cache, spec, strokes)) {
    return "carried";
  }

  paintDocument(ctx, spec, wetKeep(cache, canvas, spec));
  capture(cache, canvas, spec);
  remember(cache, spec, strokes);
  return "repainted";
}

/** Land a run of marks on the kept wet layer: paint them onto its surface
 *  exactly as the repaint that kept it would have, and put the screen back
 *  together from the two halves (see `WetLayer`). `false` when the kept pixels
 *  cannot absorb this landing — stale, the wrong frame shape, or marks that
 *  belong to some other layer — and the caller repaints.
 *
 *  Deliberately not gated on the marks being wet: a dry mark on the wet layer
 *  lands here too, and has to — painted onto the finished picture instead, it
 *  would sit *outside* the layer's surface, which the next landing would then
 *  paint past. It is also simply the more faithful picture: the repaint this
 *  stands in for scopes everything on that layer, rubbing out included, to the
 *  layer's own surface. */
function wetAppend(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cache: MarkCache,
  spec: CacheSpec,
  landed: readonly Stroke[],
): boolean {
  const wet = cache.wet;
  if (!wet || wet.layerId === null) return false;
  if (
    wet.layer.canvas.width !== spec.width ||
    wet.layer.canvas.height !== spec.height ||
    wet.below.canvas.width !== spec.width ||
    wet.below.canvas.height !== spec.height
  ) {
    return false;
  }
  // The kept layer must still be the topmost painted one, and every mark that
  // landed must be its: the layer's strokes then are the kept ones plus the
  // landing, by identity, and everything below is untouched.
  const walk = paintedLayers(spec.drawing, {
    withoutBackground: spec.options.transparentPage,
  });
  const top = walk[walk.length - 1];
  if (!top || top.layer.id !== wet.layerId) return false;
  if (top.strokes.length !== wet.strokes.length + landed.length) return false;
  for (let i = 0; i < wet.strokes.length; i++) {
    if (top.strokes[i] !== wet.strokes[i]) return false;
  }
  for (let i = 0; i < landed.length; i++) {
    if (top.strokes[wet.strokes.length + i] !== landed[i]) return false;
  }

  // The landing, onto the layer's own pixels — the same fold the repaint ran:
  // the marks already there are the same marks, so what a wet one soaks up and
  // mixes with is what it would have soaked up and mixed with. Unclipped, as
  // the lift paints unclipped: the sheet's edge is cut at composite time.
  const scoped = { ...spec.options, clip: windowOnPage(spec) };
  applyView(wet.layer.ctx, spec);
  paintStrokes(wet.layer.ctx, landed, scoped);
  // A rubbing out is scoped to this surface, so what it owes back is too —
  // the same scoping `paintLayerApart` gives the full run.
  relayFixed(wet.layer.ctx, landed, scoped, wet.strokes);
  wet.strokes = top.strokes;

  // The screen, put back together: what stood below the layer, the layer over
  // it — held to the sheet, exactly as its composite always is — and the sheet
  // laid under the lot.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, spec.width, spec.height);
  ctx.drawImage(wet.below.canvas, 0, 0);
  applyView(ctx, spec);
  onSheet(ctx, spec.drawing, () => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(wet.layer.canvas, 0, 0);
    ctx.restore();
  });
  underlay(ctx, spec.drawing, spec.options);
  capture(cache, canvas, spec);
  return true;
}

/** What a repaint is handed so the wet layer's pixels survive it — or `null`
 *  on the frames that have nothing to keep: a sheet nothing stains on (every
 *  solid-page drawing), or an effect dialog open (its previews give up every
 *  shortcut, see above). The two surfaces are reused across rebuilds — a pinch
 *  repaints every frame, and two minted canvases a frame is an allocator bill
 *  the whole cache exists to avoid. */
function wetKeep(
  cache: MarkCache,
  canvas: HTMLCanvasElement,
  spec: CacheSpec,
): KeepWet | undefined {
  if (cache.wet) cache.wet.layerId = null;
  if (spec.options.preview !== undefined) return undefined;
  if (!groundStains(groundProfile(spec.options.ground))) return undefined;
  if (!cache.wet) {
    const layer = createSurface(spec.width, spec.height);
    const below = layer && createSurface(spec.width, spec.height);
    if (!layer || !below) return undefined;
    cache.wet = { layerId: null, strokes: [], layer, below };
  }
  const wet = cache.wet;
  // What the screen holds when the walk reaches the kept layer, taken then;
  // which layer it was, remembered so a `kept` for some other lift — or none
  // at all — leaves the cache honestly stale.
  let saw: string | null = null;
  return {
    into: wet.layer,
    below: (layer) => {
      resizeSurface(wet.below, spec.width, spec.height);
      const target = wet.below.ctx;
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalCompositeOperation = "copy";
      target.drawImage(canvas, 0, 0);
      target.globalCompositeOperation = "source-over";
      saw = layer.id;
    },
    kept: (layer, strokes) => {
      if (saw !== layer.id) return;
      wet.layerId = layer.id;
      wet.strokes = strokes;
    },
  };
}

/** Serve a frame that differs from the cache's only by how far the page has
 *  been dragged: blit the marks at their new offset, then paint the strip (or
 *  two) of page that has just come into view.
 *
 *  `false` when this frame isn't a pan — a zoom, a different document, a
 *  resize, or a drag long enough that nothing on the cache is still on screen.
 *
 *  The offset is measured in whole device pixels, and it can be because the
 *  canvas snaps the view to the device pixel grid before painting. That matters
 *  more than it looks: a fractional blit would resample the marks, and a
 *  fractional blit *of a fractional blit*, frame after frame, would smear a
 *  drawing into mush over a long drag. Copying whole pixels is lossless — a
 *  frame can go through hundreds of round trips and come out bit-identical.
 *
 *  What a scrolled frame is *not* is bit-identical to the frame a plain repaint
 *  would have produced, and the reason is worth writing down because it looks
 *  like a bug and isn't: a canvas rasteriser is not translation-invariant.
 *  Rendering the same drawing seventy pixels to the left changes which side of
 *  a sample point an edge falls on, and Chromium's own output differs in about
 *  one pixel in a thousand — antialiasing fringes, by up to a few percent of a
 *  shade. A scrolled frame carries those fringes along from wherever they were
 *  first drawn, so mid-drag the window is a patchwork of renderings taken a few
 *  pixels apart. The difference is bounded (nothing compounds; the strips
 *  replace what they cover rather than blending into it) and it heals itself:
 *  every pixel gets repainted once the drag has moved a window's width, and the
 *  measured worst case mid-drag is a quarter shade on half a percent of pixels.
 *  That is the trade every scrolling compositor makes, and it buys a drag on a
 *  busy page that runs at frame rate instead of at five frames a second. */
function scroll(
  ctx: CanvasRenderingContext2D,
  cache: MarkCache,
  spec: CacheSpec,
  strokes: readonly Stroke[],
): boolean {
  const from = cache.painted;
  if (!from) return false;
  if (!sameFrame({ ...from, view: spec.view }, spec)) return false;
  if (from.view.scale !== spec.view.scale) return false;
  if (!grewFrom(cache.strokes, cache.count, strokes)) return false;
  if (strokes.length !== cache.count) return false;
  if (
    cache.surface.canvas.width !== spec.width ||
    cache.surface.canvas.height !== spec.height
  ) {
    return false;
  }

  const dx = Math.round((spec.view.tx - from.view.tx) * spec.dpr);
  const dy = Math.round((spec.view.ty - from.view.ty) * spec.dpr);
  if (dx === 0 && dy === 0) return false;
  // Dragged clear across the window: there is nothing left to reuse.
  if (Math.abs(dx) >= spec.width || Math.abs(dy) >= spec.height) return false;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cache.surface.canvas, dx, dy);

  // What the blit left uncovered: a column on the side the page came from, and
  // a row on the top or bottom. The row stops short of the column so the corner
  // they share is painted once — twice would double the ink in translucent
  // marks, which is exactly the kind of seam a cache must never leave.
  const columnX = dx > 0 ? 0 : spec.width + dx;
  const rowX = dx > 0 ? dx : 0;
  const rowWidth = spec.width - Math.abs(dx);
  if (dx !== 0) {
    paintStrip(ctx, spec, columnX, 0, Math.abs(dx), spec.height);
  }
  if (dy !== 0) {
    paintStrip(
      ctx,
      spec,
      rowX,
      dy > 0 ? 0 : spec.height + dy,
      rowWidth,
      Math.abs(dy),
    );
  }
  return true;
}

/** Serve a mid-gesture frame by drawing the held pixels where the new view
 *  says they now sit: one `drawImage` under the transform that maps the view
 *  they were painted in onto the view being asked for. A zoom then costs a
 *  resampled blit per frame instead of a document — which on a page of
 *  simulated marks is the difference between a pinch at frame rate and one at
 *  seconds per frame.
 *
 *  What it shows is honest but soft: the last real frame, resampled, with bare
 *  desk where the gesture has revealed page the held frame never painted. Both
 *  are paid off by the settle frame the `zooming` flag promises (see
 *  `CacheSpec.zooming`). `false` when the frame differs by anything *but* the
 *  view — a landed stroke, an undo, a resize, a decode — and the caller
 *  repaints for real, exactly as it would have without this. */
function carry(
  ctx: CanvasRenderingContext2D,
  cache: MarkCache,
  spec: CacheSpec,
  strokes: readonly Stroke[],
): boolean {
  const from = cache.painted;
  if (!from) return false;
  if (!sameFrame({ ...from, view: spec.view }, spec)) return false;
  // The same marks, exactly: a document that changed mid-gesture deserves the
  // real repaint, soft frames and all.
  if (strokes.length !== cache.count) return false;
  if (!grewFrom(cache.strokes, cache.count, strokes)) return false;
  if (
    cache.surface.canvas.width !== spec.width ||
    cache.surface.canvas.height !== spec.height
  ) {
    return false;
  }

  // Where a device pixel of the held frame lands on this one: both frames are
  // `applyView` over the same page, so the map between them is one uniform
  // scale and offset.
  const grew =
    (spec.view.scale * spec.dpr) / (from.view.scale * (from.dpr || 1));
  if (!Number.isFinite(grew) || grew <= 0) return false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, spec.width, spec.height);
  ctx.setTransform(
    grew,
    0,
    0,
    grew,
    spec.dpr * spec.view.tx - grew * from.dpr * from.view.tx,
    spec.dpr * spec.view.ty - grew * from.dpr * from.view.ty,
  );
  ctx.drawImage(cache.surface.canvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}

/** Paint the document into one rectangle of the window, in device pixels, and
 *  nowhere else. Clipped twice over: the context clip keeps the paint inside
 *  the strip, and the renderer's own cull keeps marks that cannot reach the
 *  strip from being painted at all.
 *
 *  The rectangle is grown by a pixel first, and that pixel is the difference
 *  between this being seamless and leaving a faint hairline behind on every
 *  frame of a drag. A clip edge is antialiased, so the pixels along it come out
 *  as a blend of the strip and whatever was under it. Landing that blend one
 *  pixel *inside* the blitted marks makes it a blend of the region with itself —
 *  the strip repaints exactly what the blit already had there — and a blend of
 *  two identical pixels is that pixel. Overlapping the strips is safe for the
 *  same reason it is safe to paint one twice: each one repaints its rectangle
 *  from an opaque page up, so nothing accumulates. */
function paintStrip(
  ctx: CanvasRenderingContext2D,
  spec: CacheSpec,
  left: number,
  top: number,
  wide: number,
  tall: number,
): void {
  if (wide <= 0 || tall <= 0) return;
  const x = Math.max(0, left - 1);
  const y = Math.max(0, top - 1);
  const width = Math.min(spec.width, left + wide + 1) - x;
  const height = Math.min(spec.height, top + tall + 1) - y;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  applyView(ctx, spec);
  const { view, dpr } = spec;
  renderDrawing(ctx, spec.drawing, null, {
    ...spec.options,
    clip: {
      x: (x / dpr - view.tx) / view.scale,
      y: (y / dpr - view.ty) / view.scale,
      width: width / dpr / view.scale,
      height: height / dpr / view.scale,
    },
  });
  ctx.restore();
}

/** Copy the cache onto a context, pixel for pixel. */
export function blitCache(
  ctx: CanvasRenderingContext2D,
  cache: MarkCache,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cache.surface.canvas, 0, 0);
}

/** Paint the document itself: the page, the grid, and every mark that can reach
 *  the window — keeping the wet layer's pixels on the way past when the cache
 *  asked for them (see `wetKeep`). */
function paintDocument(
  ctx: CanvasRenderingContext2D,
  spec: CacheSpec,
  keep?: KeepWet,
): void {
  applyView(ctx, spec);
  renderDrawing(ctx, spec.drawing, null, {
    ...spec.options,
    clip: windowOnPage(spec),
    ...(keep ? { keepWet: keep } : {}),
  });
}

/** Take the pixels currently on `source` as the cache's own. */
function capture(
  cache: MarkCache,
  source: HTMLCanvasElement,
  spec: CacheSpec,
): void {
  const { ctx } = cache.surface;
  resizeSurface(cache.surface, spec.width, spec.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // `copy` rather than a clear and a draw: it replaces the cache outright, so
  // the transparent desk around the sheet stays transparent instead of keeping
  // whatever the last frame had there.
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

function remember(
  cache: MarkCache,
  spec: CacheSpec,
  strokes: readonly Stroke[],
): void {
  cache.strokes = strokes;
  cache.count = strokes.length;
  cache.painted = spec;
}

/** Whether two specs describe the same picture, ignoring the strokes (which are
 *  compared separately, because "the same plus a few more" is a case worth
 *  knowing about).
 *
 *  Exported for the one other thing that asks "is this the same frame as the
 *  last one": the gesture trail (`trail.ts`), which repaints a patch of the
 *  screen and has to be sure the rest of it is still current. */
export function sameFrame(a: CacheSpec, b: CacheSpec): boolean {
  return (
    a.drawing.id === b.drawing.id &&
    a.drawing.width === b.drawing.width &&
    a.drawing.height === b.drawing.height &&
    // The sheet is a layer now, so switching its eye off changes the picture
    // without changing a stroke — one of the two document edits the stroke
    // comparison below cannot see.
    backgroundHidden(a.drawing) === backgroundHidden(b.drawing) &&
    // …and an effect being previewed is the other. Moving its slider repaints
    // the layers it names without adding, removing or reordering a single mark,
    // so a cache that asked only about strokes would blit the picture from
    // before the slider moved and go on doing it until something else forced a
    // repaint. Compared by identity, like `omit`: the screen keeps one object
    // for as long as the setting holds, and mints a new one when it changes.
    a.options.preview === b.options.preview &&
    a.view.scale === b.view.scale &&
    a.view.tx === b.view.tx &&
    a.view.ty === b.view.ty &&
    a.width === b.width &&
    a.height === b.height &&
    a.dpr === b.dpr &&
    a.decodedAt === b.decodedAt &&
    a.options.pageColor === b.options.pageColor &&
    a.options.defaultInk === b.options.defaultInk &&
    a.options.grid === b.options.grid &&
    // Crossing into the pixels repaints every bitmap on the page with the other
    // filtering, and changes no stroke at all — so the cache has to be able to
    // see it happen (see `RenderOptions.pixels`).
    a.options.pixels === b.options.pixels &&
    // The chequer under a page with no sheet: it is theme-coloured, so flipping
    // the app between light and dark repaints it without touching a stroke.
    a.options.checker?.[0] === b.options.checker?.[0] &&
    a.options.checker?.[1] === b.options.checker?.[1] &&
    a.options.transparentPage === b.options.transparentPage &&
    // How finely the watercolour simulation is resolving. It is a view of the
    // drawing rather than part of it (see `plugins/wash.ts`), so moving it
    // changes every wash on the page without touching a stroke — the third of
    // the edits this comparison would otherwise be blind to.
    a.options.washDetail === b.options.washDetail &&
    // …and how finely the graphite simulation is working, which changes every
    // pencil mark on the page without touching a stroke in exactly the same way.
    a.options.leadDetail === b.options.leadDetail &&
    // The sheet: change the paper and every mark on the page is painted
    // differently — the grain under them, and how the wet ones mix with what
    // they are over.
    sameGround(a.options.ground, b.options.ground) &&
    // Compared by identity, and the canvas keeps one set for the length of a
    // drag so it holds: what matters is only "are the same marks lifted off",
    // and walking two sets per frame to answer it would cost more than the
    // repaint it saves on the frames where the answer is no.
    a.options.omit === b.options.omit
  );
}

/** Whether two drawings are on the same stock, at the same weight of grain. */
function sameGround(a: Ground | undefined, b: Ground | undefined): boolean {
  return a?.stock === b?.stock && a?.texture === b?.texture;
}

/** Whether `next` is `painted` with more on the end — the shape of a committed
 *  gesture, and the only document change the cache can absorb without
 *  repainting.
 *
 *  Compared by identity, stroke by stroke. A stroke is immutable, so an
 *  unchanged stroke is the *same object*; anything that rewrites one (an undo,
 *  a document arriving from sync, a migration) makes new objects and fails the
 *  test, which is the conservative answer. Walking the whole prefix rather than
 *  spot-checking its end is a few hundred pointer comparisons against the
 *  hundreds of milliseconds of painting it is guarding — the cheapest
 *  correctness in the file. */
function grewFrom(
  painted: readonly Stroke[],
  count: number,
  next: readonly Stroke[],
): boolean {
  if (next.length < count) return false;
  for (let i = 0; i < count; i++) {
    if (painted[i] !== next[i]) return false;
  }
  return true;
}

/** The slice of the page the window is showing, in document coordinates — what
 *  the renderer culls against.
 *
 *  Exported for the frame around this one (`frame.ts`), which paints the
 *  gesture in flight and any marks being dragged over the top and wants them
 *  culled against the same window. */
export function windowOnPage(spec: CacheSpec): Rect {
  const { view, width, height, dpr } = spec;
  return {
    x: -view.tx / view.scale,
    y: -view.ty / view.scale,
    width: width / dpr / view.scale,
    height: height / dpr / view.scale,
  };
}

/** Put a context into document coordinates for this spec — device pixels, then
 *  the view's zoom and pan. Both the screen and the cache are painted through
 *  it, which is what makes the copy between them a straight one. */
function applyView(ctx: CanvasRenderingContext2D, spec: CacheSpec): void {
  const { view, dpr } = spec;
  ctx.setTransform(
    dpr * view.scale,
    0,
    0,
    dpr * view.scale,
    dpr * view.tx,
    dpr * view.ty,
  );
}
