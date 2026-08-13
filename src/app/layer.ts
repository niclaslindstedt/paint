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
//     ones onto the layer, on top of what is already there, and blit. A
//     finished stroke costs one stroke, not a document.
//   - **the page was dragged** — a pan moves the window without changing a
//     mark in it, so the layer is blitted at an offset and only the strip of
//     page that has just come into view is painted. A slow drag exposes a few
//     pixels a frame; the rest of the window is a copy of the frame before it.
//   - **anything else** — an undo, a colour change, a zoom, a different
//     drawing. Paint the document, and this is the part worth reading twice:
//     it is painted **to the screen**, and the layer then *copies the screen*.
//
// That last move is the difference between this being a win and a wash.
// Rendering into an off-screen canvas measures around two and a half times
// slower than rendering to the visible one — an off-screen 2D context does not
// reliably get the same accelerated surface — so a design that repaints into
// the layer and blits would make every pan and zoom slower than having no cache
// at all. Painting the screen and copying the finished pixels back costs one
// bitmap copy instead, and leaves the layer holding exactly what the screen
// showed, which is exactly what the next frame wants to blit.
//
// The layer is *screen-shaped*, not page-shaped: it holds the window at the
// zoom it is currently showing, so blitting it is a straight copy with no
// resampling, and a page far larger than the screen costs no more memory than
// the screen does. The price is that panning and zooming fall into the third
// case, which is why the renderer culls to the window (`geometry.ts`) — a
// zoomed-in pan then repaints what is on screen instead of the whole document.
//
// What the layer must never be is a second source of truth. It holds no state
// the document doesn't, every path into it goes through `renderDrawing`, and if
// it cannot be created at all (no DOM) the canvas paints exactly as it did
// before it existed.

import { paintStrokes, renderDrawing, type RenderOptions } from "./render.ts";
import { createSurface, resizeSurface, type Surface } from "./surface.ts";
import type { Drawing, Stroke } from "./types.ts";

/** Where the page sits in the window: a scale and a translation, in CSS pixels
 *  (the canvas's `CanvasView`, which this module deliberately doesn't import —
 *  the layer cares about the numbers, not about the viewport's rules). */
export type LayerView = { scale: number; tx: number; ty: number };

/** Everything a frame of committed marks depends on. Two frames with equal
 *  specs are the same picture, which is what makes "blit and stop" safe. */
export type LayerSpec = {
  drawing: Drawing;
  view: LayerView;
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
};

/** What a frame actually had to do. The canvas ignores it; the tests assert on
 *  it, because "did this frame repaint the document" is the whole point of the
 *  cache and is otherwise invisible. */
export type LayerWork = "blitted" | "appended" | "scrolled" | "repainted";

export type Layer = {
  surface: Surface;
  /** The spec the pixels were painted for, or `null` when there are none. */
  painted: LayerSpec | null;
  /** The strokes on the layer, in order. Held so the next frame can ask
   *  whether the document merely grew — the array is the document's own, so
   *  this is a reference, not a copy. */
  strokes: readonly Stroke[];
  /** How many of them are actually on the pixels. */
  count: number;
};

/** Open a layer, or `null` where there is no DOM to open one in — in which case
 *  the canvas paints the document directly, as it always did. */
export function createLayer(width: number, height: number): Layer | null {
  const surface = createSurface(width, height);
  return surface ? { surface, painted: null, strokes: [], count: 0 } : null;
}

/** Paint the committed marks onto the visible canvas, keeping `layer` up to
 *  date as cheaply as the frame allows.
 *
 *  The caller is expected to have cleared `canvas` and to paint the gesture in
 *  flight and any chrome *after* this returns — what is on the canvas when this
 *  finishes is what the layer will be holding, and neither of those belongs
 *  there. Passing a `null` layer paints the document straight through, which is
 *  the behaviour this whole module is an optimisation of. */
export function paintCommitted(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layer: Layer | null,
  spec: LayerSpec,
): LayerWork {
  if (!layer) {
    paintDocument(ctx, spec);
    return "repainted";
  }

  const strokes = spec.drawing.strokes;
  const usable =
    layer.painted !== null &&
    sameFrame(layer.painted, spec) &&
    layer.surface.canvas.width === spec.width &&
    layer.surface.canvas.height === spec.height &&
    grewFrom(layer.strokes, layer.count, strokes);

  if (usable) {
    const added = strokes.length - layer.count;
    if (added > 0) {
      // The gesture that just landed, painted onto the marks already there —
      // which is what compositing it over them on screen did anyway.
      applyView(layer.surface.ctx, spec);
      paintStrokes(layer.surface.ctx, strokes.slice(layer.count), {
        ...spec.options,
        clip: windowOnPage(spec),
      });
    }
    remember(layer, spec);
    blitLayer(ctx, layer);
    return added > 0 ? "appended" : "blitted";
  }

  if (scroll(ctx, layer, spec)) {
    capture(layer, canvas, spec);
    remember(layer, spec);
    return "scrolled";
  }

  paintDocument(ctx, spec);
  capture(layer, canvas, spec);
  remember(layer, spec);
  return "repainted";
}

/** Serve a frame that differs from the layer's only by how far the page has
 *  been dragged: blit the marks at their new offset, then paint the strip (or
 *  two) of page that has just come into view.
 *
 *  `false` when this frame isn't a pan — a zoom, a different document, a
 *  resize, or a drag long enough that nothing on the layer is still on screen.
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
  layer: Layer,
  spec: LayerSpec,
): boolean {
  const from = layer.painted;
  if (!from) return false;
  if (!sameFrame({ ...from, view: spec.view }, spec)) return false;
  if (from.view.scale !== spec.view.scale) return false;
  if (!grewFrom(layer.strokes, layer.count, spec.drawing.strokes)) return false;
  if (spec.drawing.strokes.length !== layer.count) return false;
  if (
    layer.surface.canvas.width !== spec.width ||
    layer.surface.canvas.height !== spec.height
  ) {
    return false;
  }

  const dx = Math.round((spec.view.tx - from.view.tx) * spec.dpr);
  const dy = Math.round((spec.view.ty - from.view.ty) * spec.dpr);
  if (dx === 0 && dy === 0) return false;
  // Dragged clear across the window: there is nothing left to reuse.
  if (Math.abs(dx) >= spec.width || Math.abs(dy) >= spec.height) return false;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.surface.canvas, dx, dy);

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
  spec: LayerSpec,
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

/** Copy the layer onto a context, pixel for pixel. */
export function blitLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.surface.canvas, 0, 0);
}

/** Paint the document itself: the page, the grid, and every mark that can reach
 *  the window. */
function paintDocument(ctx: CanvasRenderingContext2D, spec: LayerSpec): void {
  applyView(ctx, spec);
  renderDrawing(ctx, spec.drawing, null, {
    ...spec.options,
    clip: windowOnPage(spec),
  });
}

/** Take the pixels currently on `source` as the layer's own. */
function capture(
  layer: Layer,
  source: HTMLCanvasElement,
  spec: LayerSpec,
): void {
  const { ctx } = layer.surface;
  resizeSurface(layer.surface, spec.width, spec.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // `copy` rather than a clear and a draw: it replaces the layer outright, so
  // the transparent desk around the sheet stays transparent instead of keeping
  // whatever the last frame had there.
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

function remember(layer: Layer, spec: LayerSpec): void {
  layer.strokes = spec.drawing.strokes;
  layer.count = spec.drawing.strokes.length;
  layer.painted = spec;
}

/** Whether two specs describe the same picture, ignoring the strokes (which are
 *  compared separately, because "the same plus a few more" is a case worth
 *  knowing about). */
function sameFrame(a: LayerSpec, b: LayerSpec): boolean {
  return (
    a.drawing.id === b.drawing.id &&
    a.drawing.width === b.drawing.width &&
    a.drawing.height === b.drawing.height &&
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
    a.options.transparentPage === b.options.transparentPage
  );
}

/** Whether `next` is `painted` with more on the end — the shape of a committed
 *  gesture, and the only document change the layer can absorb without
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
 *  the renderer culls against. */
function windowOnPage(spec: LayerSpec) {
  const { view, width, height, dpr } = spec;
  return {
    x: -view.tx / view.scale,
    y: -view.ty / view.scale,
    width: width / dpr / view.scale,
    height: height / dpr / view.scale,
  };
}

/** Put a context into document coordinates for this spec — device pixels, then
 *  the view's zoom and pan. Both the screen and the layer are painted through
 *  it, which is what makes the copy between them a straight one. */
function applyView(ctx: CanvasRenderingContext2D, spec: LayerSpec): void {
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
