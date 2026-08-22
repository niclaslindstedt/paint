// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the canvas repaints, and when.
//
// `frame.ts` owns what one frame *looks like* and `PaintCanvas` owns what a
// pointer *means*; between the two sits this — the third job that was living in
// the component because it had nowhere else to be. It is the whole of the
// answer to "when does the screen get redrawn": the pixels kept between frames,
// the render inputs gathered where an animation frame can reach them, the
// coalescing that turns a burst of pointer samples into one paint, and the
// React effect that asks for a frame when something the component rendered
// changed.
//
// The seam is the same one `frame.ts` describes from the other side: everything
// here is a *render input* or a *held bitmap*, and nothing here knows what a
// press does. A gesture reaches it as four refs (`GestureRefs`) that the paint
// reads at frame time and never writes.
//
// Why refs rather than props for those: the paint runs from
// `requestAnimationFrame`, outside React's render, and a pointer reports at
// 120Hz or better. A draft routed through state would re-render the component
// once per sample to reach a canvas call that is already scheduled, and the
// closure a frame ran in could be a frame out of date. So the live values are
// held in refs, refreshed on every render, and the frame reads them when it
// runs.

import { useCallback, useEffect, useRef, useState } from "react";

import type { MarkCache } from "./cache.ts";
import type { CutAim } from "./cutAim.ts";
import { paintFrame } from "./frame.ts";
import { onImageDecoded } from "./images.ts";
import { releaseOverview, type Overview } from "./overview.ts";
import type { DraftStroke } from "./plugins/types.ts";
import type { EffectPreview } from "./render.ts";
import type { Selection } from "./selection.ts";
import { createTrail } from "./trail.ts";
import type { Drawing, Point, Stroke } from "./types.ts";
import type { CanvasView } from "./viewport.ts";

/** Everything about the *picture* a frame paints — the document, what it is
 *  painted on and against, and the chrome drawn over it. Every field is a
 *  render input in the sense the mark cache means it: change one and the frame
 *  is a different frame (see `cache.ts`). */
export type PaintInks = {
  drawing: Drawing;
  pageColor: string;
  defaultInk: string;
  showGrid: boolean;
  showPixelGrid: boolean;
  fullRender: boolean;
  checker: readonly [string, string];
  washDetail: number;
  leadDetail: number;
  preview: EffectPreview | null;
  selection: Selection | null;
  aiming?: CutAim | null;
  adjusting: Point | null;
};

/** The gesture in flight, as the frame sees it: four refs the component writes
 *  from its pointer handlers and this only ever reads. */
export type GestureRefs = {
  /** The draft stroke under the hand, or `null`. */
  draft: { current: DraftStroke | null };
  /** The selection's contents being dragged, or `null`. */
  moving: {
    current: {
      strokes: Stroke[];
      stay: Stroke[];
      ids: Set<string>;
      from: Selection;
    } | null;
  };
  /** How far that drag has carried them. */
  offset: { current: Point };
  /** The point a marquee is being dragged out to, which the magnifier floats
   *  beside (see `loupe.ts`). */
  placing: { current: Point | null };
};

export function useCanvasPaint({
  canvasRef,
  viewRef,
  viewportRef,
  view,
  viewport,
  zooming,
  gesture,
  inks,
}: {
  canvasRef: { current: HTMLCanvasElement | null };
  /** The live view and window, for the frame; and the same two as values, so a
   *  React-driven change asks for a frame (see the effect below). */
  viewRef: { current: CanvasView | null };
  viewportRef: { current: { width: number; height: number } };
  view: CanvasView | null;
  viewport: { width: number; height: number };
  /** Whether the view is still under the fingers (see `CacheSpec.zooming`). */
  zooming: { current: boolean };
  gesture: GestureRefs;
  inks: PaintInks;
}) {
  // A bitmap on the page decodes asynchronously but paints synchronously, so a
  // freshly-loaded image would otherwise sit invisible until something else
  // forced a repaint. Bumping this counter is that something (see `images.ts`),
  // and it travels into the cache's spec so a cached frame can't hide a picture
  // that has only just arrived.
  const [decodedAt, setDecodedAt] = useState(0);
  useEffect(() => onImageDecoded(() => setDecodedAt((count) => count + 1)), []);

  // The render inputs where an animation frame can reach them (see the note at
  // the top of this file). Refreshed on every render rather than in an effect:
  // a frame asked for *during* a render must not paint the values from the one
  // before it.
  const live = useRef<PaintInks & { decodedAt: number }>({
    ...inks,
    decodedAt,
  });
  live.current = { ...inks, decodedAt };

  // The committed marks, as pixels (see `cache.ts`). Opened on the first paint
  // and kept for the life of the canvas.
  const cacheRef = useRef<MarkCache | null>(null);
  // …and the whole page as pixels, for the frames of a zoom out (see
  // `overview.ts`). Held here for the same reason the cache is, and dropped
  // with the canvas: it is a page-sized bitmap, and nothing outside a frame has
  // any use for it.
  const overviewRef = useRef<Overview | null>(null);
  useEffect(() => () => releaseOverview(overviewRef), []);
  // …and what the last frame painted, which is what lets a frame of a gesture
  // in flight repaint the patch it grew into rather than the whole mark (see
  // `trail.ts`). Kept for the life of the canvas for the same reason.
  const trailRef = useRef(createTrail());
  // The repaint this frame has already scheduled, so a burst of pointer moves
  // costs one paint rather than one each.
  const pending = useRef<number | null>(null);

  /** Paint one frame — everything it depends on, gathered from the refs above
   *  and handed to `frame.ts`, which owns what a frame looks like. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const current = viewRef.current;
    if (!canvas || !current) return;
    const moving = gesture.moving.current;
    paintFrame({
      canvas,
      view: current,
      viewport: viewportRef.current,
      ...live.current,
      selection: live.current.selection,
      aiming: live.current.aiming ?? null,
      zooming: zooming.current,
      draft: gesture.draft.current,
      moving: moving ? { ...moving, offset: gesture.offset.current } : null,
      // The edge under the finger, whether the finger is dragging a marquee out
      // here or holding a corner grip out there.
      loupe: gesture.placing.current ?? live.current.adjusting,
      cache: cacheRef,
      overview: overviewRef,
      trail: trailRef.current,
    });
  }, [canvasRef, viewRef, viewportRef, zooming, gesture]);

  /** Ask for a repaint on the next animation frame, at most one per frame.
   *
   *  Coalescing is the point: a pointer can report several times per frame, a
   *  pinch moves the view and the draft together, and every one of those used
   *  to be its own synchronous repaint. The screen only shows one. */
  const requestPaint = useCallback(() => {
    if (pending.current !== null) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      paint();
    });
  }, [paint]);

  useEffect(
    () => () => {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
    },
    [],
  );

  // Repaint whenever the document, the view, the window or the page's colours
  // change — and when a bitmap finishes decoding, which changes what the same
  // document paints as without changing the document. The gesture in flight
  // asks for its own frames as it moves; it never reaches React at all.
  //
  // Listed field by field rather than on the inks object itself: the caller
  // builds that object fresh on every render, so depending on it would ask for
  // a frame on every render instead of on every change.
  const {
    drawing,
    pageColor,
    defaultInk,
    showGrid,
    showPixelGrid,
    fullRender,
    checker,
    washDetail,
    leadDetail,
    preview,
    selection,
    aiming,
    adjusting,
  } = inks;
  useEffect(() => {
    requestPaint();
  }, [
    drawing,
    view,
    viewport,
    pageColor,
    defaultInk,
    showGrid,
    showPixelGrid,
    fullRender,
    checker,
    washDetail,
    leadDetail,
    preview,
    decodedAt,
    selection,
    aiming,
    adjusting,
    requestPaint,
  ]);

  // Only the one call: the live inputs behind it are this hook's own, and a
  // caller reaching into them would be reading the frame's state rather than
  // its own.
  return { requestPaint };
}
