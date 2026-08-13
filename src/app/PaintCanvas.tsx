// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { pluginById } from "./plugins/registry.ts";
import type { DraftStroke, ToolContext } from "./plugins/types.ts";
import { renderDrawing } from "./render.ts";
import type { Drawing, Point } from "./types.ts";
import {
  clampView,
  fitView,
  initialView,
  panBy,
  pinch,
  toDocumentPoint,
  zoomAt,
  type CanvasView,
} from "./viewport.ts";

// The canvas surface: one `<canvas>` element filling the screen, a view onto a
// page that is larger than it, a pointer gesture in flight, and a full repaint
// whenever any of the three changes.
//
// The element is a **window**, not the page. It is sized to its container in
// device pixels (container size × devicePixelRatio) and the drawing is painted
// through the view transform, so the page can be bigger than the screen and you
// move around it rather than squinting at a shrunken whole.
//
// The gesture split is the Procreate one, and it is the whole interaction model:
//
//   one finger / pen / mouse   draws
//   two fingers                pinch to zoom, drag to pan
//   wheel                      pans; ctrl/⌘ + wheel (and a trackpad pinch) zooms
//
// A second finger landing mid-stroke **abandons** the stroke rather than
// committing it: you meant to zoom, and half a line you didn't want is worse
// than no line. All pointer maths goes through `toDocumentPoint`, so the tools
// still only ever see document coordinates, at any zoom.

type Props = {
  drawing: Drawing;
  /** The resolved page colour (see `canvas.ts`): the drawing's pinned colour,
   *  or the canvas theme's sheet. Painted as the sheet, and handed to the tools
   *  as `background` so the eraser paints with it. */
  pageColor: string;
  /** The active tool's plugin id. */
  tool: string;
  /** The ink the toolbar has selected — `color: null` when the user hasn't
   *  picked one, which is what lets a mark follow the page. */
  ink: Omit<ToolContext, "background">;
  /** The colour an unpicked mark resolves to on this page. */
  defaultInk: string;
  /** Called once per finished gesture with the stroke to file. */
  onCommit: (draft: DraftStroke) => void;
  /** Paint a faint grid behind the page as a drawing aid. Never exported. */
  showGrid?: boolean;
  /** Bumped by the zoom pill to toggle between fitting the page and 1:1. */
  fitToken?: number;
  /** Reports the live zoom so the header can show it. */
  onScaleChange?: (scale: number) => void;
  ariaLabel: string;
};

/** Grid spacing in document pixels. */
const GRID_STEP = 40;

/** How much one wheel notch zooms. Small enough that a trackpad pinch (which
 *  arrives as a stream of ctrl+wheel events) feels continuous. */
const WHEEL_ZOOM_RATE = 0.0015;

export function PaintCanvas({
  drawing,
  pageColor,
  tool,
  ink,
  defaultInk,
  onCommit,
  showGrid = false,
  fitToken = 0,
  onScaleChange,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The in-flight gesture. Held in state (not a ref) because every move has to
  // repaint; held as a draft (not a committed stroke) because an abandoned
  // gesture must leave no trace in the document or the undo history.
  const [draft, setDraft] = useState<DraftStroke | null>(null);
  // The window onto the page, and its size in CSS pixels. `null` until the
  // element has been measured — the initial view can't be computed without
  // knowing how big the window is.
  const [view, setView] = useState<CanvasView | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // The pointer that owns the current stroke. A second finger landing mid
  // stroke abandons it and starts a pinch instead.
  const drawingPointer = useRef<number | null>(null);
  // Every pointer currently down, in element space — a pinch needs two, and a
  // pinch is computed from where it began (`pinchStart`) rather than
  // accumulated frame by frame, so it stays exact and reversible.
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ view: CanvasView; a: Point; b: Point } | null>(
    null,
  );
  // The live view, for the handlers — they run outside React's render and must
  // read the current value rather than the one their closure captured.
  const viewRef = useRef<CanvasView | null>(null);
  viewRef.current = view;
  const pageRef = useRef(drawing);
  pageRef.current = drawing;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const context = useCallback(
    (): ToolContext => ({ ...ink, background: pageColor }),
    [ink, pageColor],
  );

  /** A pointer event's position on the element, in CSS pixels. */
  const elementPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  /** …and the same point in document space, which is all the tools ever see. */
  const documentPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const current = viewRef.current;
      if (!current) return { x: 0, y: 0 };
      return toDocumentPoint(current, elementPoint(e));
    },
    [elementPoint],
  );

  const applyView = useCallback((next: CanvasView) => {
    const clamped = clampView(next, pageRef.current, viewportRef.current);
    viewRef.current = clamped;
    setView(clamped);
  }, []);

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
  }, []);

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

  /** Toggle between fitting the whole page and 1:1, zooming about `anchor`
   *  (the window's centre when nothing more specific is meant). The one
   *  "get me back" gesture, shared by the zoom pill and the double-tap. */
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
            1,
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
    [applyView],
  );

  // The zoom pill. Skipped on the first render (token 0) so it doesn't fight
  // the initial view above.
  useEffect(() => {
    if (fitToken === 0) return;
    toggleFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);

  useEffect(() => {
    if (view) onScaleChange?.(view.scale);
  }, [view, onScaleChange]);

  // Repaint whenever the document, the gesture, the view, or the device pixel
  // ratio changes. A full redraw per frame is cheap at sketch-sized stroke
  // counts and keeps the model the single source of truth (see `render.ts`).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.round(viewport.width * dpr);
    const height = Math.round(viewport.height * dpr);
    if (width === 0 || height === 0) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Clear the whole window first — what shows through around the sheet is the
    // container's own background, so the page reads as a sheet on a desk.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Then paint the drawing through the view: device pixels, then the view's
    // scale and pan. From here on the renderer works in document coordinates
    // exactly as the PNG export does.
    ctx.setTransform(
      dpr * view.scale,
      0,
      0,
      dpr * view.scale,
      dpr * view.tx,
      dpr * view.ty,
    );
    renderDrawing(ctx, drawing, draft ? { ...draft, id: "draft" } : null, {
      pageColor,
      defaultInk,
      grid: showGrid ? GRID_STEP : undefined,
    });
    // Outline the sheet so its edge is visible against the desk. Screen-only —
    // it is chrome, not a mark, so it lives here rather than in the renderer
    // the PNG export shares. The width is divided by the zoom so the line stays
    // a hairline at any scale instead of fattening as you zoom in.
    ctx.strokeStyle = "rgba(120,130,145,0.4)";
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeRect(0, 0, drawing.width, drawing.height);
  }, [drawing, draft, view, viewport, pageColor, defaultInk, showGrid]);

  /** Abandon whatever stroke is in flight without committing it. */
  const abandon = useCallback(() => {
    drawingPointer.current = null;
    setDraft(null);
  }, []);

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, elementPoint(e));

    // Two pointers down: this is a pinch, not a stroke. Drop any stroke the
    // first finger had begun — the user is zooming, and half a line they never
    // wanted is worse than none.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      abandon();
      if (viewRef.current && a && b) {
        pinchStart.current = { view: viewRef.current, a, b };
      }
      return;
    }
    if (pointers.current.size > 2) return;

    if (drawingPointer.current !== null) return;
    const plugin = pluginById(tool);
    if (!plugin) return;
    const next = plugin.behaviour.start(documentPoint(e), context());
    if (!next) return;
    drawingPointer.current = e.pointerId;
    setDraft({ ...next, tool });
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, elementPoint(e));

    // A pinch in progress owns the gesture: scale by how far the fingers have
    // spread since it began, pan by how far their midpoint moved.
    const start = pinchStart.current;
    if (start && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        viewRef.current = pinch(
          start,
          a,
          b,
          pageRef.current,
          viewportRef.current,
        );
        setView(viewRef.current);
      }
      return;
    }

    if (drawingPointer.current !== e.pointerId) return;
    const plugin = pluginById(tool);
    if (!plugin) return;
    setDraft((cur) =>
      cur ? plugin.behaviour.move(cur, documentPoint(e), context()) : cur,
    );
  };

  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    // A pinch ends when it stops being one. The finger still down does *not*
    // resume drawing — it would lay a mark from wherever the zoom left it.
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    release(e);
    if (drawingPointer.current !== e.pointerId) return;
    drawingPointer.current = null;
    const plugin = pluginById(tool);
    setDraft((cur) => {
      if (cur && plugin) {
        const committed = plugin.behaviour.end
          ? plugin.behaviour.end(cur, context())
          : cur;
        if (committed) onCommit(committed);
      }
      return null;
    });
  };

  // A cancelled gesture (the OS took the pointer — a system gesture, a call)
  // drops the draft without committing: half a stroke is worse than none.
  const cancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    release(e);
    if (drawingPointer.current !== e.pointerId) return;
    abandon();
  };

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
      const next =
        e.ctrlKey || e.metaKey
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
  }, [applyView]);

  // Double-tap / double-click toggles between fitting the page and 1:1 — the
  // quick way back when a pinch has left you somewhere unfamiliar. Bound by
  // hand rather than through a JSX prop: Preact spells the prop `onDblClick`
  // where React spells it `onDoubleClick`, and a native listener sidesteps the
  // difference (see the Rendering-runtime notes in `docs/architecture.md`).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: MouseEvent) => toggleFit(elementPoint(e));
    canvas.addEventListener("dblclick", handler);
    return () => canvas.removeEventListener("dblclick", handler);
  }, [toggleFit, elementPoint]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={finish}
      onPointerCancel={cancel}
      // `touch-none` hands every touch to this component: without it a drag on
      // the canvas scrolls or zooms the page instead of drawing and pinching.
      className="h-full w-full touch-none"
      style={{ cursor: pinchStart.current ? "grabbing" : "crosshair" }}
    />
  );
}
