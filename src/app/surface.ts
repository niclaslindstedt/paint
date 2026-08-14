// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Off-screen drawing surfaces.
//
// Two things in the app paint onto a canvas that is never shown: the airbrush's
// cone stamp (`plugins/stamp.ts`) and the committed-strokes cache (`cache.ts`).
// Both want the same three lines of ceremony and the same failure mode, so they
// share this.
//
// A surface is deliberately an `HTMLCanvasElement` rather than an
// `OffscreenCanvas`. Nothing here paints off the main thread, and an offscreen
// context is a *different type* to the one every painter is written against —
// buying a seam we'd have to thread through the whole renderer for no gain.
//
// `null` is a first-class answer. In a test (no DOM) or a browser that refuses
// a 2D context, every caller falls back to painting the slow way rather than
// failing: a cache is an optimisation, and an optimisation that can crash the
// canvas is not worth having.

/** An off-screen canvas and its context, kept together because a caller always
 *  wants both. */
export type Surface = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

/** Make an off-screen surface `width`×`height` device pixels, or `null` where
 *  there is no DOM to make one in. */
export function createSurface(width: number, height: number): Surface | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

/** Resize a surface, clearing it. Assigning `width`/`height` is what clears a
 *  canvas, so a no-op resize is skipped rather than being a hidden erase — the
 *  layer cache leans on that to keep its pixels across a repaint that didn't
 *  change shape. */
export function resizeSurface(
  surface: Surface,
  width: number,
  height: number,
): void {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (surface.canvas.width === w && surface.canvas.height === h) return;
  surface.canvas.width = w;
  surface.canvas.height = h;
}
