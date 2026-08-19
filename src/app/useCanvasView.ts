// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The window onto the page: where it is, how big it is, and everything that
// moves it that isn't a finger on the canvas.
//
// The canvas element is a *window* rather than the page (see `PaintCanvas.tsx`),
// and "where that window is" turns out to be a whole concern of its own: the
// element's measured size, the view seeded from it, the clamp that keeps the
// sheet reachable, the two tokens the screen nudges it with, the wheel, and the
// settle frame a zoom owes when it stops. None of it is about what a *press*
// means, which is what the canvas component is about — so it lives here, and
// the component keeps the pointer handling.
//
// The gestures still move the view, of course: a pinch and a one-finger pan
// both write through `applyView` (or, mid-pinch, straight onto `viewRef` for
// the same reason the draft never goes through React — a pinch reports at the
// pointer's rate and only feeds the next frame). That is why the refs are
// handed back as well as the values.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Drawing, Point } from "./types.ts";
import {
  clampView,
  fitView,
  initialView,
  nativeScale,
  panBy,
  zoomAt,
  type CanvasView,
} from "./viewport.ts";

/** How much one wheel notch zooms. Small enough that a trackpad pinch (which
 *  arrives as a stream of ctrl+wheel events) feels continuous. */
const WHEEL_ZOOM_RATE = 0.0015;

/** How long after the last zooming notch the sharp frame lands. The wheel has
 *  no "gesture ended" event, so the settle rides a timer re-armed by every
 *  notch. */
const WHEEL_SETTLE_MS = 140;

type Options = {
  /** The element the window is measured from — the canvas itself. */
  canvasRef: { readonly current: HTMLCanvasElement | null };
  /** The page being looked at, live: the clamp and the fit are both about the
   *  sheet's size, and it can change under the view. */
  pageRef: { readonly current: Drawing };
  drawing: Drawing;
  /** Bumped by the zoom pill to toggle between fitting the page and 1:1. */
  fitToken: number;
  /** Bumped when the page itself changed shape — a turn, a resize — which only
   *  ever fits (see `PaintCanvas`'s prop of the same name). */
  refitToken: number;
  onScaleChange?: (scale: number) => void;
  onViewChange?: (view: CanvasView) => void;
  /** Ask for a frame. A **holder** rather than the function, because the view
   *  is set up before the canvas's painting is — and the one frame this owes
   *  (the sharp one after a zoom settles) is asked for long after both. */
  repaint: { readonly current: () => void };
};

export type CanvasViewControl = {
  view: CanvasView | null;
  viewport: { width: number; height: number };
  /** The live view and window size, for handlers that run outside React's
   *  render and must read the current value rather than a captured one. */
  viewRef: { current: CanvasView | null };
  viewportRef: { readonly current: { width: number; height: number } };
  /** Move the window, clamped so the sheet stays reachable. */
  applyView: (next: CanvasView) => void;
  /** …and the write a pinch makes: the same view, without the clamp, because a
   *  pinch is computed from where it began and clamps itself as it goes. */
  setView: (view: CanvasView) => void;
  /** Fit the whole page, or — if it is already fitted — show it at 1:1 about
   *  `anchor`. The one "get me back" gesture, shared by the zoom pill and the
   *  hand's double-tap. */
  toggleFit: (anchor?: Point) => void;
  /** True while the view is still under the fingers — a pinch in progress, a
   *  wheel still streaming. Frames painted meanwhile may carry the cached pixels
   *  to the new view instead of repainting the document (see
   *  `CacheSpec.zooming`); whoever turns it on owes the settle frame that turns
   *  it off. */
  zooming: { current: boolean };
  /** Say that the view is under the fingers now — what a pinch beginning does.
   *  Whoever calls it owes `settleZoom`. */
  beginZoom: () => void;
  /** The sharp frame a run of carried ones is paid off by. A no-op when nothing
   *  was zooming, so it is safe to call from every path that could have ended
   *  one. */
  settleZoom: () => void;
};

export function useCanvasView({
  canvasRef,
  pageRef,
  drawing,
  fitToken,
  refitToken,
  onScaleChange,
  onViewChange,
  repaint,
}: Options): CanvasViewControl {
  // `null` until the element has been measured — the initial view can't be
  // computed without knowing how big the window is.
  const [view, setView] = useState<CanvasView | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const viewRef = useRef<CanvasView | null>(null);
  viewRef.current = view;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const zooming = useRef(false);
  const wheelSettle = useRef<number | null>(null);

  const applyView = useCallback(
    (next: CanvasView) => {
      const clamped = clampView(next, pageRef.current, viewportRef.current);
      viewRef.current = clamped;
      setView(clamped);
    },
    [pageRef],
  );

  // Track the window's size. The element fills its container, so this is what
  // the layout gives it — remeasured on resize and on an orientation flip.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  // Seed the view once the window has a size, and re-seed when the page itself
  // is swapped for another drawing — opening a different page should land you
  // at its middle rather than wherever you had scrolled the last one to.
  useEffect(() => {
    if (viewport.width === 0 || viewport.height === 0) return;
    applyView(initialView(drawing, viewport));
    // Keyed on the page's identity and the window's size, deliberately: a pan
    // or a zoom must not re-seed the view it just changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id, viewport.width, viewport.height, applyView]);

  const toggleFit = useCallback(
    (anchor?: Point) => {
      const current = viewRef.current;
      const window_ = viewportRef.current;
      if (!current || window_.width === 0 || window_.height === 0) return;
      const fitted = fitView(pageRef.current, window_);
      if (Math.abs(current.scale - fitted.scale) < 0.01) {
        applyView(
          zoomAt(
            current,
            nativeScale(window.devicePixelRatio),
            anchor ?? {
              x: window_.width / 2,
              y: window_.height / 2,
            },
          ),
        );
      } else {
        applyView(fitted);
      }
    },
    [applyView, pageRef],
  );

  // The zoom pill. Skipped on the first render (token 0) so it doesn't fight
  // the initial view above.
  useEffect(() => {
    if (fitToken === 0) return;
    toggleFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);

  // A page that changed shape under the view. Fits it, rather than toggling:
  // after a turn or a resize the question is "what does the page look like
  // now", and the answer is the whole of it.
  useEffect(() => {
    if (refitToken === 0) return;
    const window_ = viewportRef.current;
    if (window_.width === 0 || window_.height === 0) return;
    applyView(fitView(pageRef.current, window_));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitToken]);

  useEffect(() => {
    if (!view) return;
    onScaleChange?.(view.scale);
    onViewChange?.(view);
  }, [view, onScaleChange, onViewChange]);

  const setViewNow = useCallback((next: CanvasView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const beginZoom = useCallback(() => {
    zooming.current = true;
  }, []);

  const settleZoom = useCallback(() => {
    if (wheelSettle.current !== null) {
      clearTimeout(wheelSettle.current);
      wheelSettle.current = null;
    }
    if (!zooming.current) return;
    zooming.current = false;
    repaint.current();
  }, [repaint]);

  useEffect(
    () => () => {
      if (wheelSettle.current !== null) clearTimeout(wheelSettle.current);
    },
    [],
  );

  // Wheel: pan by default, zoom with ctrl/⌘ held. A trackpad pinch arrives as
  // ctrl+wheel too, so the same branch serves both. Registered by hand rather
  // than through `onWheel` because it must be **non-passive** to call
  // `preventDefault` — otherwise the browser zooms the whole app underneath us,
  // which is exactly what the canvas is here to take over.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      const current = viewRef.current;
      if (!current) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const zoom = e.ctrlKey || e.metaKey;
      if (zoom) {
        // A trackpad pinch is a stream of these with no "gesture ended", so the
        // settle frame rides a short timer re-armed by every notch: the stream
        // carries cached pixels at frame rate, and the sharp repaint lands the
        // moment it pauses.
        zooming.current = true;
        if (wheelSettle.current !== null) clearTimeout(wheelSettle.current);
        wheelSettle.current = window.setTimeout(settleZoom, WHEEL_SETTLE_MS);
      }
      const next = zoom
        ? zoomAt(
            current,
            current.scale * Math.exp(-e.deltaY * WHEEL_ZOOM_RATE),
            anchor,
          )
        : panBy(current, -e.deltaX, -e.deltaY);
      applyView(next);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [applyView, settleZoom, canvasRef]);

  return {
    view,
    viewport,
    viewRef,
    viewportRef,
    applyView,
    setView: setViewNow,
    toggleFit,
    zooming,
    beginZoom,
    settleZoom,
  };
}
