// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  classifyEdgeDrag,
  inEdgeZone,
  isDoubleTap,
  isTap,
  type MenuEdge,
} from "./gestures.ts";
import { createLayer, paintCommitted, type Layer } from "./layer.ts";
import { pluginById } from "./plugins/registry.ts";
import type { CanvasProbe, DraftStroke, ToolContext } from "./plugins/types.ts";
import { createProbe } from "./probe.ts";
import { paintStrokes } from "./render.ts";
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
// page that is larger than it, a pointer gesture in flight, and a frame
// whenever any of the three changes.
//
// The element is a **window**, not the page. It is sized to its container in
// device pixels (container size × devicePixelRatio) and the drawing is painted
// through the view transform, so the page can be bigger than the screen and you
// move around it rather than squinting at a shrunken whole.
//
// A frame is not a full repaint. The gesture in flight is painted every frame,
// because it changes every frame; the marks already committed come off a cached
// layer (`layer.ts`), which is what stops one more pencil line costing a whole
// page of airbrush. Frames are asked for rather than taken — one per animation
// frame however many pointer samples arrive — and the draft never travels
// through React state to get here, because the only thing it feeds is the next
// frame.
//
// The gesture split is the Procreate one, and it is the whole interaction model:
//
//   one finger / pen / mouse   draws — or pans, under a tool that `navigates`,
//                              or samples, under one that `picksColor`
//   two fingers                pinch to zoom, drag to pan
//   wheel                      pans; ctrl/⌘ + wheel (and a trackpad pinch) zooms
//   double-tap (hand only)     fits the page, again for 1:1
//   inward swipe from the edge opens the sidebar, and draws nothing
//
// A second finger landing mid-stroke **abandons** the stroke rather than
// committing it: you meant to zoom, and half a line you didn't want is worse
// than no line. All pointer maths goes through `toDocumentPoint`, so the tools
// still only ever see document coordinates, at any zoom.
//
// Double-tap belongs to the hand and nowhere else. Under a drawing tool the two
// presses are two marks — the browser's `dblclick` arrives long after they have
// been committed, so "fit the page" and "leave two dots on it" would both
// happen. The tool that draws nothing is the one that can afford the gesture.

type Props = {
  drawing: Drawing;
  /** The resolved page colour (see `canvas.ts`): the drawing's pinned colour,
   *  or the canvas theme's sheet. Painted as the sheet, and handed to the tools
   *  as `background` so the eraser paints with it. */
  pageColor: string;
  /** The active tool's plugin id. */
  tool: string;
  /** The ink the toolbar has selected — `color: null` when the user hasn't
   *  picked one, which is what lets a mark follow the page. The page colour and
   *  the probe are the canvas's own to supply. */
  ink: Omit<ToolContext, "background" | "probe">;
  /** The colour an unpicked mark resolves to on this page. */
  defaultInk: string;
  /** Called once per finished gesture with the stroke to file. */
  onCommit: (draft: DraftStroke) => void;
  /** Called with the colour under the pointer when a tool that `picksColor`
   *  (the dropper) is pressed — the sampled colour becomes the ink. */
  onPickColor?: (color: string) => void;
  /** Paint a faint grid behind the page as a drawing aid. Never exported. */
  showGrid?: boolean;
  /** Bumped by the zoom pill to toggle between fitting the page and 1:1. */
  fitToken?: number;
  /** Reports the live zoom so the header can show it. */
  onScaleChange?: (scale: number) => void;
  /** The screen edge the sidebar's open-swipe is currently armed on, or `null`
   *  when nothing is watching an edge (a docked sidebar, the floating-button
   *  mode, a drawer that is already open). A touch that lands in that strip is
   *  held rather than drawn — see `gestures.ts`. */
  menuSwipeEdge?: MenuEdge | null;
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
  onPickColor,
  showGrid = false,
  fitToken = 0,
  onScaleChange,
  menuSwipeEdge = null,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The in-flight gesture. Held in a ref, not in state: a pointer reports at
  // 120Hz or better and the only thing a draft feeds is the next repaint, so
  // routing it through React would re-render the component once per sample to
  // reach a canvas call that is already scheduled. It is a draft rather than a
  // committed stroke because an abandoned gesture must leave no trace in the
  // document or the undo history.
  const draftRef = useRef<DraftStroke | null>(null);
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
  // A one-finger pan under a navigating tool, computed from where it began for
  // the same reason a pinch is: no drift, and the clamp can bite and let go
  // again without the page creeping.
  const panStart = useRef<{
    pointerId: number;
    view: CanvasView;
    origin: Point;
  } | null>(null);
  // The press that might still turn out to be a tap, and the last one that did.
  // Only a navigating tool ever arms these (see the header note).
  const tapStart = useRef<{ pointerId: number; point: Point } | null>(null);
  const lastTap = useRef<{ time: number; point: Point } | null>(null);
  // A touch that landed in the sidebar's edge strip and has begun nothing yet:
  // it may be the drawer's open-swipe. `viewport` is where it landed on the
  // screen (what the swipe is measured in), `point` where it landed on the
  // element (what the gesture is replayed from when it turns out to be ours).
  const heldEdgePress = useRef<{
    pointerId: number;
    edge: MenuEdge;
    viewport: Point;
    point: Point;
  } | null>(null);
  // The live view, for the handlers — they run outside React's render and must
  // read the current value rather than the one their closure captured.
  const viewRef = useRef<CanvasView | null>(null);
  viewRef.current = view;
  const pageRef = useRef(drawing);
  pageRef.current = drawing;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  // Everything else a repaint reads. The paint runs from an animation frame,
  // outside React's render, so it takes its inputs from here rather than from a
  // closure that may be a frame out of date.
  const inks = useRef({ drawing, pageColor, defaultInk, showGrid });
  inks.current = { drawing, pageColor, defaultInk, showGrid };
  // The committed marks, as pixels (see `layer.ts`). Opened on the first paint
  // and kept for the life of the canvas.
  const layerRef = useRef<Layer | null>(null);
  // The repaint this frame has already scheduled, so a burst of pointer moves
  // costs one paint rather than one each.
  const pending = useRef<number | null>(null);

  // The page as it is actually painted, for the two tools that read it (the
  // bucket and the dropper). Made fresh for each press and kept for the length
  // of that gesture: the document can't change while a pointer is down, so one
  // snapshot answers every question a drag asks — and a press that never
  // reaches a colour tool never takes one at all (see `probe.ts`).
  const probe = useRef<CanvasProbe | null>(null);
  const openProbe = useCallback((): CanvasProbe => {
    probe.current ??= createProbe(pageRef.current, {
      pageColor,
      defaultInk,
    });
    return probe.current;
  }, [pageColor, defaultInk]);

  const context = useCallback(
    (): ToolContext => ({
      ...ink,
      background: pageColor,
      // Lazily: reading `probe` here would take a snapshot for every pencil
      // move. A tool that wants one asks for it.
      get probe() {
        return openProbe();
      },
    }),
    [ink, pageColor, openProbe],
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

  /** An element point in document space, which is all the tools ever see. */
  const toDoc = useCallback((at: Point): Point => {
    const current = viewRef.current;
    if (!current) return { x: 0, y: 0 };
    return toDocumentPoint(current, at);
  }, []);

  /** …and the same, straight from a pointer event. */
  const documentPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => toDoc(elementPoint(e)),
    [elementPoint, toDoc],
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

  /** Paint one frame.
   *
   *  The committed marks come off the layer — a blit while a stroke is being
   *  drawn, a repaint when the document or the view actually changed (see
   *  `layer.ts`). The gesture in flight and the sheet's outline go on top,
   *  every frame, because both change every frame. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    const window_ = viewportRef.current;
    if (!canvas || !view) return;
    const { drawing, pageColor, defaultInk, showGrid } = inks.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.round(window_.width * dpr);
    const height = Math.round(window_.height * dpr);
    if (width === 0 || height === 0) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const options = {
      pageColor,
      defaultInk,
      grid: showGrid ? GRID_STEP : undefined,
    };

    // Paint from a view whose pan is a whole number of device pixels. The view
    // itself keeps its exact value — panning stays smooth and reversible, and
    // the clamp still bites where it bit — but a *frame* is drawn on the pixel
    // grid, which is what lets a drag reuse the frame before it by copying it
    // sideways rather than resampling it (see `layer.ts`). Half a device pixel
    // is below anything a screen can show; a smeared drawing is not.
    const snapped = {
      scale: view.scale,
      tx: Math.round(view.tx * dpr) / dpr,
      ty: Math.round(view.ty * dpr) / dpr,
    };

    // Clear the whole window first — what shows through around the sheet is the
    // container's own background, so the page reads as a sheet on a desk.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // The committed marks: a blit while a stroke is being drawn, a repaint when
    // the document or the view actually changed (see `layer.ts`).
    layerRef.current ??= createLayer(width, height);
    paintCommitted(ctx, canvas, layerRef.current, {
      drawing,
      view: snapped,
      width,
      height,
      dpr,
      options,
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
    const draft = draftRef.current;
    if (draft) paintStrokes(ctx, [{ ...draft, id: "draft" }], options);
    // Outline the sheet so its edge is visible against the desk. Screen-only —
    // it is chrome, not a mark, so it lives here rather than in the renderer
    // the PNG export shares, and it stays off the layer so a cached frame never
    // has to be thrown away to redraw it. The width is divided by the zoom so
    // the line stays a hairline at any scale instead of fattening as you zoom.
    ctx.strokeStyle = "rgba(120,130,145,0.4)";
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeRect(0, 0, drawing.width, drawing.height);
  }, []);

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
  // change. The gesture in flight asks for its own frames as it moves — it
  // never reaches React at all.
  useEffect(() => {
    requestPaint();
  }, [drawing, view, viewport, pageColor, defaultInk, showGrid, requestPaint]);

  /** Abandon whatever stroke is in flight without committing it. */
  const abandon = useCallback(() => {
    drawingPointer.current = null;
    draftRef.current = null;
    requestPaint();
  }, [requestPaint]);

  /** Forget the one-finger pan and the pending tap. With no argument it drops
   *  them whoever owned them — what a pinch taking over does. */
  const endPan = useCallback((pointerId?: number) => {
    if (pointerId === undefined || panStart.current?.pointerId === pointerId) {
      panStart.current = null;
    }
    if (pointerId === undefined || tapStart.current?.pointerId === pointerId) {
      tapStart.current = null;
    }
  }, []);

  /** Start whatever gesture the active tool makes of a press at `at` (an
   *  element point). Split out from the pointer handler because a press held
   *  back at the screen edge starts here too, late, from where it landed. */
  const beginGesture = (pointerId: number, at: Point) => {
    const plugin = pluginById(tool);
    if (!plugin) return;
    // A new press reads a new page: whatever the last gesture drew is part of
    // what this one samples.
    probe.current = null;

    // The dropper. A press under a colour-sampling tool takes the colour it
    // landed on and hands it to the toolbar; nothing is drawn, and nothing
    // reaches the document or the undo history.
    if (plugin.picksColor) {
      const sampled = openProbe().colorAt(toDoc(at));
      if (sampled) onPickColor?.(sampled);
      return;
    }

    // The hand. A press under a navigating tool grabs the page instead of
    // starting a stroke, and is a tap until it travels far enough not to be.
    if (plugin.navigates) {
      if (!viewRef.current) return;
      panStart.current = { pointerId, view: viewRef.current, origin: at };
      tapStart.current = { pointerId, point: at };
      return;
    }

    if (drawingPointer.current !== null) return;
    const next = plugin.behaviour.start(toDoc(at), context());
    if (!next) return;
    drawingPointer.current = pointerId;
    draftRef.current = { ...next, tool };
    requestPaint();
  };

  /** Forget a held edge press, whoever owned it. */
  const dropHeld = (pointerId?: number) => {
    if (
      pointerId === undefined ||
      heldEdgePress.current?.pointerId === pointerId
    ) {
      heldEdgePress.current = null;
    }
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = elementPoint(e);
    pointers.current.set(e.pointerId, at);

    // Two pointers down: this is a pinch, not a stroke. Drop any stroke the
    // first finger had begun — the user is zooming, and half a line they never
    // wanted is worse than none.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      abandon();
      // …and any pan or half-made tap, for the same reason: a pinch is not the
      // second half of a double-tap. A held edge press goes with them: two
      // fingers are not the drawer's swipe either.
      endPan();
      dropHeld();
      lastTap.current = null;
      if (viewRef.current && a && b) {
        pinchStart.current = { view: viewRef.current, a, b };
      }
      return;
    }
    if (pointers.current.size > 2) return;

    // A touch landing in the strip the sidebar watches might be the drawer's
    // open-swipe, and that swipe must leave no mark. Hold the press instead of
    // starting anything: `handleMove` releases it the moment it proves it is
    // not the drawer's, and replays it from here. Touch only — the swipe is a
    // touch gesture, so a mouse or a pen at the edge is never in doubt.
    if (
      menuSwipeEdge &&
      e.pointerType === "touch" &&
      inEdgeZone(e.clientX, window.innerWidth, menuSwipeEdge)
    ) {
      heldEdgePress.current = {
        pointerId: e.pointerId,
        edge: menuSwipeEdge,
        viewport: { x: e.clientX, y: e.clientY },
        point: at,
      };
      return;
    }

    beginGesture(e.pointerId, at);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const at = elementPoint(e);
    pointers.current.set(e.pointerId, at);

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

    // A press held back at the screen edge: decide whose it is now that it has
    // moved. The drawer's swipe is dropped outright; anything else becomes the
    // gesture it always was, replayed from where the finger first landed so no
    // ink is lost to the wait, and then caught up to here by the code below.
    const held = heldEdgePress.current;
    if (held && held.pointerId === e.pointerId) {
      const verdict = classifyEdgeDrag(
        e.clientX - held.viewport.x,
        e.clientY - held.viewport.y,
        held.edge,
      );
      if (verdict === "pending") return;
      heldEdgePress.current = null;
      if (verdict === "menu") return;
      beginGesture(e.pointerId, held.point);
    }

    // A one-finger drag under the hand: pan by how far it has come from where
    // it landed. Once it has travelled past a finger's wobble it stops being a
    // tap, for good — a pan that ends near where it began is still a pan.
    const pan = panStart.current;
    if (pan && pan.pointerId === e.pointerId) {
      const tap = tapStart.current;
      if (tap && !isTap(tap.point, at)) tapStart.current = null;
      applyView(panBy(pan.view, at.x - pan.origin.x, at.y - pan.origin.y));
      return;
    }

    if (drawingPointer.current !== e.pointerId) return;
    const plugin = pluginById(tool);
    if (!plugin) return;
    const current = draftRef.current;
    if (!current) return;
    draftRef.current = plugin.behaviour.move(
      current,
      documentPoint(e),
      context(),
    );
    requestPaint();
  };

  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    // A pinch ends when it stops being one. The finger still down does *not*
    // resume drawing — it would lay a mark from wherever the zoom left it.
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    release(e);

    // A press still held at the edge when the finger lifts was never the
    // drawer's — the swipe would have fired long before this. Start it now so
    // the press lands as the tap it was, and let the rest of this handler end
    // it in the same breath.
    const held = heldEdgePress.current;
    if (held && held.pointerId === e.pointerId) {
      heldEdgePress.current = null;
      beginGesture(e.pointerId, held.point);
    }

    // A press that never wandered is a tap; two of them in quick succession fit
    // the page, then return to 1:1. Detected here rather than from `dblclick`
    // so it works the same on touch, and armed only by a navigating tool so it
    // can never fire alongside a mark being laid down.
    const tap = tapStart.current;
    if (tap && tap.pointerId === e.pointerId) {
      tapStart.current = null;
      const at = elementPoint(e);
      if (isTap(tap.point, at)) {
        const now = { time: e.timeStamp, point: at };
        if (isDoubleTap(lastTap.current, now)) {
          lastTap.current = null;
          toggleFit(at);
        } else {
          lastTap.current = now;
        }
      }
    }
    endPan(e.pointerId);

    if (drawingPointer.current !== e.pointerId) return;
    drawingPointer.current = null;
    const plugin = pluginById(tool);
    const current = draftRef.current;
    draftRef.current = null;
    let committed = null;
    if (current && plugin) {
      committed = plugin.behaviour.end
        ? plugin.behaviour.end(current, context())
        : current;
      if (committed) onCommit(committed);
    }
    // A committed stroke asks for no frame here: it arrives as a new document,
    // and *that* is what repaints. Painting now would show the page for one
    // frame with the gesture already dropped and the commit not yet in — the
    // stroke blinking out and back in as it lands. A gesture that committed
    // nothing (a shape tool's stray tap) has no document change coming, so it
    // does need a frame to clear itself.
    if (!committed) requestPaint();
  };

  // A cancelled gesture (the OS took the pointer — a system gesture, a call)
  // drops the draft without committing: half a stroke is worse than none.
  const cancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    release(e);
    endPan(e.pointerId);
    dropHeld(e.pointerId);
    lastTap.current = null;
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

  // The cursor names the gesture the surface is currently offering: an open
  // hand under a navigating tool, a closed one while the page is actually being
  // moved, crosshairs when the next press would leave a mark.
  const navigates = Boolean(pluginById(tool)?.navigates);
  const holding = Boolean(pinchStart.current || panStart.current);

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
      style={{
        cursor: holding ? "grabbing" : navigates ? "grab" : "crosshair",
      }}
    />
  );
}
