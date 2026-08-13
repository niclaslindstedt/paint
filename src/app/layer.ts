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
//   - **anything else** — an undo, a colour change, a pan, a zoom, a different
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
};

/** What a frame actually had to do. The canvas ignores it; the tests assert on
 *  it, because "did this frame repaint the document" is the whole point of the
 *  cache and is otherwise invisible. */
export type LayerWork = "blitted" | "appended" | "repainted";

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

  paintDocument(ctx, spec);
  capture(layer, canvas, spec);
  remember(layer, spec);
  return "repainted";
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
