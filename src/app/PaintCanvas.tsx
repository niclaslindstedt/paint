// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Box } from "./bounds.ts";
import {
  classifyEdgeDrag,
  inEdgeZone,
  isDoubleTap,
  isTap,
  LONG_PRESS_MS,
  type MenuEdge,
} from "./gestures.ts";
import { paintFrame } from "./frame.ts";
import type { EffectPreview } from "./render.ts";
import { onImageDecoded } from "./images.ts";
import type { MarkCache } from "./cache.ts";
import { cursorFor, usePointerRing } from "./PointerRing.tsx";
import { pluginById } from "./plugins/registry.ts";
import type { CanvasProbe, DraftStroke, ToolContext } from "./plugins/types.ts";
import { DEFAULT_WASH_ENGINE, type WashEngine } from "./plugins/wash.ts";
import { createProbe } from "./probe.ts";
import { inBox } from "./selection.ts";
import type { Drawing, Point, Stroke } from "./types.ts";
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
// because it changes every frame; the marks already committed come off a cache
// of pixels (`cache.ts`), which is what stops one more pencil line costing a
// whole page of airbrush. Frames are asked for rather than taken — one per
// animation frame however many pointer samples arrive — and the draft never
// travels through React state to get here, because the only thing it feeds is
// the next frame.
//
// The gesture split is the Procreate one, and it is the whole interaction model:
//
//   one finger / pen / mouse   draws — or pans, under `navigates`, samples,
//                              under `picksColor`, opens a caret, under
//                              `entersText`, or drags a marquee, under `selects`
//   …on a selection, with the  moves the marks instead of the page: the hand is
//   hand                       what picks things up, and it is the same drag
//   two fingers                pinch to zoom, drag to pan
//   wheel                      pans; ctrl/⌘ + wheel (and a trackpad pinch) zooms
//   double-tap (hand only)     fits the page, again for 1:1
//   long press / right click   opens the selection's menu — copy, cut, delete
//   inward swipe from the edge opens the sidebar — or, from the right, the
//                              layers panel — and draws nothing
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
  /** Called with what a tool that `picksColor` (the dropper) sampled when it is
   *  pressed — that colour becomes the ink. */
  onPickColor?: (color: string) => void;
  /** Called with the document point pressed under a tool that `entersText` (the
   *  text tool) — the caret opens there. Nothing is drawn and nothing reaches
   *  the document: the caption arrives later, as a finished mark (see
   *  `TextEntry.tsx`). */
  onEnterText?: (at: Point) => void;
  /** Called with the outlines a tool that `selects` chose, in document
   *  coordinates — or `null` for a gesture that chose nothing (a press that
   *  never moved, a trace that found no area), which means "select nothing".
   *
   *  Closed contours whatever the gesture was: a box marquee sends its four
   *  corners, a lasso the loop it drew, the tracing tool the outline of what is
   *  painted under it. The marks inside them are the screen's to work out (see
   *  `selection.ts`); nothing reaches the document. */
  onSelectRegion?: (contours: Point[][] | null) => void;
  /** The marks currently selected, and the page they cover. The canvas outlines
   *  the box, and a drag on it under the hand moves them. */
  selection?: { ids: readonly string[]; box: Box } | null;
  /** Called once, when a drag that moved the selection lifts — the whole move,
   *  as one edit. The drag itself is shown live here and touches no document. */
  onMoveSelection?: (dx: number, dy: number) => void;
  /** Called where a right-click, or a long press on touch, asks for the
   *  selection's menu — in viewport coordinates, which is where a floating menu
   *  is placed. */
  onContextMenu?: (at: Point) => void;
  /** Paint a faint grid behind the page as a drawing aid. Never exported. */
  showGrid?: boolean;
  /** The transparency chequer for the app's current theme (see `canvas.ts`) —
   *  what a page with no sheet is drawn as. Never exported either. */
  checker: readonly [string, string];
  /** Which watercolour engine paints a wash (see `plugins/wash.ts`). Threaded
   *  in rather than read off the module the app puts it in force on, because
   *  the canvas needs it as a *render input*: it is what makes a page repaint
   *  when the setting changes, and what lets the mark cache tell the two
   *  engines' pixels apart. */
  washEngine?: WashEngine;
  /** An effect the sidebar's dialog is setting up, shown on the layers it would
   *  land on and never kept (see `effects.ts`). A render input like the wash
   *  engine, and for the same reason: it is what makes the page repaint when a
   *  slider moves, and what the mark cache compares to know it must. */
  preview?: EffectPreview | null;
  /** Bumped by the zoom pill to toggle between fitting the page and 1:1. */
  fitToken?: number;
  /** Bumped when the *page itself* changed shape — a turn, a resize. The view
   *  then fits the whole sheet, because the window it was looking through no
   *  longer describes the page it was looking at: a landscape drawing turned
   *  portrait leaves the marks somewhere off the bottom, and hunting for them is
   *  not what "turn the page" should mean. Distinct from `fitToken`, which is a
   *  *toggle* — this one only ever fits. */
  refitToken?: number;
  /** Reports the live zoom so the header can show it. */
  onScaleChange?: (scale: number) => void;
  /** Reports the whole view, so an overlay drawn over the canvas — the dropped
   *  image's placement frame — can sit exactly over the page. */
  onViewChange?: (view: CanvasView) => void;
  /** True while something is floating over the page waiting to be settled: a
   *  dropped image. A press then *settles* that instead of drawing — it is the
   *  "click outside it" half of the placement gesture, and no mark may be laid
   *  down under a picture that isn't placed yet. Two-finger pinch and the wheel
   *  still move the view, so you can look around before deciding. */
  placing?: boolean;
  onPlacingPress?: () => void;
  /** The screen edge an inward swipe opens the layers panel from, or `null`
   *  when it isn't armed. A touch that lands in that strip is held rather than
   *  drawn, and measured before it is either — see `gestures.ts`. */
  panelSwipeEdge?: MenuEdge | null;
  onPanelSwipe?: () => void;
  ariaLabel: string;
};

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
  onEnterText,
  onSelectRegion,
  selection = null,
  onMoveSelection,
  onContextMenu,
  showGrid = false,
  checker,
  washEngine = DEFAULT_WASH_ENGINE,
  preview = null,
  fitToken = 0,
  refitToken = 0,
  onScaleChange,
  onViewChange,
  placing = false,
  onPlacingPress,
  panelSwipeEdge = null,
  onPanelSwipe,
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
  // A drag that is moving the selection rather than the page. It carries the
  // marks it picked up, so a frame can paint them where the finger has got to
  // without going anywhere near the document, and a set of their ids, which the
  // repaint hides from the cached page underneath (see `RenderOptions.omit`).
  // The set is made once per drag and kept: the cache compares it by identity,
  // so a fresh one each frame would repaint the whole page each frame.
  const moveStart = useRef<{
    pointerId: number;
    origin: Point;
    strokes: Stroke[];
    ids: Set<string>;
    box: Box;
  } | null>(null);
  const moveBy = useRef<Point>({ x: 0, y: 0 });
  // A press that may still become a long one: the timer that decides, and where
  // it landed — a finger that wanders is not being held still.
  const hold = useRef<{ timer: number; from: Point } | null>(null);
  // A touch that landed in a watched edge strip and has begun nothing yet: it
  // may be an inward swipe — the sidebar's, or the layers panel's. `viewport`
  // is where it landed on the screen (what the swipe is measured in), `point`
  // where it landed on the element (what the gesture is replayed from when it
  // turns out to be ours), and `open` what to run if the swipe fires: nothing
  // for the drawer, which the framework opens itself.
  const heldEdgePress = useRef<{
    pointerId: number;
    edge: MenuEdge;
    viewport: Point;
    point: Point;
    open?: () => void;
  } | null>(null);
  // The live view, for the handlers — they run outside React's render and must
  // read the current value rather than the one their closure captured.
  const viewRef = useRef<CanvasView | null>(null);
  viewRef.current = view;
  const pageRef = useRef(drawing);
  pageRef.current = drawing;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  // A bitmap on the page decodes asynchronously but paints synchronously, so a
  // freshly-loaded image would otherwise sit invisible until something else
  // forced a repaint. Bumping this counter is that something (see `images.ts`),
  // and it travels into the cache's spec so a cached frame can't hide a picture
  // that has only just arrived.
  const [decodedAt, setDecodedAt] = useState(0);
  useEffect(() => onImageDecoded(() => setDecodedAt((count) => count + 1)), []);

  // Everything else a repaint reads. The paint runs from an animation frame,
  // outside React's render, so it takes its inputs from here rather than from a
  // closure that may be a frame out of date.
  const inks = useRef({
    drawing,
    pageColor,
    defaultInk,
    showGrid,
    checker,
    washEngine,
    preview,
    decodedAt,
    selection,
  });
  inks.current = {
    drawing,
    pageColor,
    defaultInk,
    showGrid,
    checker,
    washEngine,
    preview,
    decodedAt,
    selection,
  };
  // The committed marks, as pixels (see `cache.ts`). Opened on the first paint
  // and kept for the life of the canvas.
  const cacheRef = useRef<MarkCache | null>(null);
  // The repaint this frame has already scheduled, so a burst of pointer moves
  // costs one paint rather than one each.
  const pending = useRef<number | null>(null);

  // The page as it is actually painted, for the tools that read it (the fills
  // and the dropper). Made fresh for each press and kept for that gesture: the
  // document can't change while a pointer is down, so one snapshot answers every
  // question a drag asks — and a press that never reaches a tool that reads the
  // page never takes one at all (see `probe.ts`).
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

  /** Paint one frame — everything it depends on, gathered from the refs above
   *  and handed to `frame.ts`, which owns what a frame looks like. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (!canvas || !view) return;
    const moving = moveStart.current;
    paintFrame({
      canvas,
      view,
      viewport: viewportRef.current,
      ...inks.current,
      selection: inks.current.selection?.box ?? null,
      draft: draftRef.current,
      moving: moving ? { ...moving, offset: moveBy.current } : null,
      cache: cacheRef,
    });
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
  // change — and when a bitmap finishes decoding, which changes what the same
  // document paints as without changing the document. The gesture in flight
  // asks for its own frames as it moves; it never reaches React at all.
  useEffect(() => {
    requestPaint();
  }, [
    drawing,
    view,
    viewport,
    pageColor,
    defaultInk,
    showGrid,
    checker,
    washEngine,
    preview,
    decodedAt,
    selection,
    requestPaint,
  ]);

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

  /** Drop the selection drag without moving anything — what a pinch, a
   *  cancelled pointer or an unmount does to one in flight. */
  const dropMove = useCallback(
    (pointerId?: number) => {
      if (
        pointerId !== undefined &&
        moveStart.current?.pointerId !== pointerId
      ) {
        return;
      }
      if (!moveStart.current) return;
      moveStart.current = null;
      moveBy.current = { x: 0, y: 0 };
      requestPaint();
    },
    [requestPaint],
  );

  /** Forget the press that might have become a long one. */
  const dropHold = useCallback(() => {
    if (!hold.current) return;
    clearTimeout(hold.current.timer);
    hold.current = null;
  }, []);

  useEffect(() => () => dropHold(), [dropHold]);

  /** Start whatever gesture the active tool makes of a press at `at` (an
   *  element point). Split out from the pointer handler because a press held
   *  back at the screen edge starts here too, late, from where it landed. */
  const beginGesture = (pointerId: number, at: Point) => {
    // Something is floating over the page waiting to be settled: this press is
    // the "click outside it" that keeps it, and it begins nothing else.
    if (placing) {
      onPlacingPress?.();
      return;
    }
    const plugin = pluginById(tool);
    if (!plugin) return;
    // A new press reads a new page: whatever the last gesture drew is part of
    // what this one samples.
    probe.current = null;

    // The dropper. A press under a colour-sampling tool asks the tool what it
    // read off the page and hands that to the toolbar; nothing is drawn and
    // nothing reaches the document. *What* it read is the tool's own answer
    // (`ToolBehaviour.pick`) — how much page one press covers is its own setting
    // (see `builtin/dropper.ts`) — and a tool offering none falls back to the
    // colour under the pointer.
    if (plugin.picksColor) {
      const where = toDoc(at);
      const sampled = plugin.behaviour.pick
        ? plugin.behaviour.pick(where, context())
        : openProbe().colorAt(where);
      if (sampled) onPickColor?.(sampled);
      return;
    }

    // The text tool. A press under a typing tool opens a caret where it landed
    // and begins no stroke: the mark is entered rather than drawn, and it
    // reaches the document only once the words are finished.
    if (plugin.entersText) {
      onEnterText?.(toDoc(at));
      return;
    }

    // The hand. A press under a navigating tool grabs the page instead of
    // starting a stroke, and is a tap until it travels far enough not to be.
    if (plugin.navigates) {
      if (!viewRef.current) return;
      // …unless it landed on a selection, in which case it grabs *that*. The
      // hand is what picks things up, and the drag is the same drag — what
      // moves is the marks rather than the window behind them.
      const picked = selection;
      if (picked && picked.ids.length > 0 && inBox(picked.box, toDoc(at))) {
        const held = new Set(picked.ids);
        moveStart.current = {
          pointerId,
          origin: toDoc(at),
          strokes: pageRef.current.strokes.filter((s) => held.has(s.id)),
          ids: held,
          box: picked.box,
        };
        moveBy.current = { x: 0, y: 0 };
        return;
      }
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

  /** Which swipe, if any, a press landing at `x` (in viewport coordinates)
   *  could still turn out to be. */
  const edgeWatching = (
    x: number,
  ): { edge: MenuEdge; open?: () => void } | undefined => {
    const width = window.innerWidth;
    if (panelSwipeEdge && inEdgeZone(x, width, panelSwipeEdge)) {
      return { edge: panelSwipeEdge, open: onPanelSwipe };
    }
    return undefined;
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

  /** Whether a press here should offer the selection's menu.
   *
   *  Two ways it can: it landed on the selection (whatever tool is in hand — the
   *  marks under your finger are what the menu is about), or the marquee tool is
   *  the one you are holding, which is where "paste it here" belongs even with
   *  nothing selected. Anywhere else the press is a mark, and a menu opening
   *  over a drawing hand is exactly the interruption the sidebar's long press
   *  was taken away for. */
  const menuHere = (at: Point): boolean => {
    if (
      selection &&
      selection.ids.length > 0 &&
      inBox(selection.box, toDoc(at))
    ) {
      return true;
    }
    return Boolean(pluginById(tool)?.selects);
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = elementPoint(e);
    pointers.current.set(e.pointerId, at);
    dropHold();

    // A finger held still over a selection asks for its menu — the touch half of
    // a right-click. Armed only where the menu means something (see `menuHere`),
    // and dropped the moment the press moves, lifts, or is joined by a second
    // finger.
    if (e.pointerType === "touch" && pointers.current.size === 1) {
      if (menuHere(at)) {
        const point = { x: e.clientX, y: e.clientY };
        hold.current = {
          from: at,
          timer: window.setTimeout(() => {
            hold.current = null;
            // Whatever the press had begun is abandoned: the menu is the gesture
            // now, and half a marquee behind it is not.
            abandon();
            endPan();
            dropMove();
            onContextMenu?.(point);
          }, LONG_PRESS_MS),
        };
      }
    }

    // Two pointers down: this is a pinch, not a stroke. Drop any stroke the
    // first finger had begun — the user is zooming, and half a line they never
    // wanted is worse than none.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      abandon();
      // …and any pan, half-made tap, or selection being dragged, for the same
      // reason: a pinch is not the second half of a double-tap. A held edge
      // press goes with them: two fingers are not the drawer's swipe either.
      endPan();
      dropMove();
      dropHeld();
      dropHold();
      lastTap.current = null;
      if (viewRef.current && a && b) {
        pinchStart.current = { view: viewRef.current, a, b };
      }
      return;
    }
    if (pointers.current.size > 2) return;

    // A touch landing in a watched strip might be an inward swipe — the
    // drawer's or the layers panel's — and neither may leave a mark. Hold the
    // press instead of starting anything: `handleMove` releases it the moment
    // it proves it is neither, and replays it from here. Touch only — a swipe
    // is a touch gesture, so a mouse or a pen at the edge is never in doubt.
    const watched =
      e.pointerType === "touch" ? edgeWatching(e.clientX) : undefined;
    if (watched) {
      heldEdgePress.current = {
        pointerId: e.pointerId,
        viewport: { x: e.clientX, y: e.clientY },
        point: at,
        ...watched,
      };
      return;
    }

    beginGesture(e.pointerId, at);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const at = elementPoint(e);
    pointers.current.set(e.pointerId, at);
    // A press that has wandered from where it landed is not being held still,
    // whatever else it turns out to be.
    if (hold.current && !isTap(hold.current.from, at)) dropHold();

    // A selection being dragged: the marks follow the finger, and nothing
    // reaches the document until it lifts.
    const move = moveStart.current;
    if (move && move.pointerId === e.pointerId) {
      const to = documentPoint(e);
      moveBy.current = { x: to.x - move.origin.x, y: to.y - move.origin.y };
      requestPaint();
      return;
    }

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
    // moved. A swipe that fired opens what it was watching and is dropped;
    // anything else becomes the gesture it always was, replayed from where the
    // finger first landed so no ink is lost to the wait, and then caught up to
    // here by the code below.
    const held = heldEdgePress.current;
    if (held && held.pointerId === e.pointerId) {
      const verdict = classifyEdgeDrag(
        e.clientX - held.viewport.x,
        e.clientY - held.viewport.y,
        held.edge,
      );
      if (verdict === "pending") return;
      heldEdgePress.current = null;
      if (verdict === "menu") {
        held.open?.();
        return;
      }
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
    dropHold();

    // A selection that was being dragged lands here, once: the canvas has been
    // showing the move all along without touching a thing, and this is the
    // single edit (and the single undo step) the whole drag costs.
    const move = moveStart.current;
    if (move && move.pointerId === e.pointerId) {
      const { x: dx, y: dy } = moveBy.current;
      moveStart.current = null;
      moveBy.current = { x: 0, y: 0 };
      if (dx !== 0 || dy !== 0) onMoveSelection?.(dx, dy);
      // A drag that went nowhere changes no document, so nothing else will ask
      // for the frame that puts the marks back on the page.
      else requestPaint();
      return;
    }

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
      // A selection gesture never reaches the document: the tool chooses marks
      // rather than making one, so what it chose goes to the screen and the
      // frame below clears the ants off the page. *What* it chose is the
      // behaviour's to say (`selection`) — a box, an oval, a lasso loop or a
      // traced outline all arrive here as contours, and a gesture that chose
      // nothing sends `null`, which clears the selection.
      if (plugin.selects) {
        onSelectRegion?.(
          committed ? (plugin.behaviour.selection?.(committed) ?? null) : null,
        );
        requestPaint();
        return;
      }
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

  // A cancelled gesture (the OS took the pointer) drops the draft uncommitted.
  const cancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    release(e);
    endPan(e.pointerId);
    dropHeld(e.pointerId);
    dropHold();
    // A cancelled drag puts the marks back where they were: nothing was moved,
    // because nothing reached the document until the finger lifted.
    dropMove(e.pointerId);
    lastTap.current = null;
    if (drawingPointer.current !== e.pointerId) return;
    abandon();
  };

  /** The desktop half of the selection menu. The browser's own menu is refused
   *  where ours means something and left alone everywhere else — a right-click
   *  on a drawing surface with nothing selected has no business being swallowed. */
  const contextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onContextMenu) return;
    if (!menuHere(elementPoint(e))) return;
    e.preventDefault();
    onContextMenu({ x: e.clientX, y: e.clientY });
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

  // The one thing the cursor can't read off a descriptor: whether the page (or
  // a selection on it) is being dragged right now.
  const holding = Boolean(
    pinchStart.current || panStart.current || moveStart.current,
  );

  // …and the nib outline a fine pointer wears: a circle the size the next mark
  // will be on this page, at this zoom. See `PointerRing.tsx`.
  const ring = usePointerRing({
    hostRef: canvasRef,
    plugin: pluginById(tool),
    size: ink.size,
    scale: view?.scale ?? 1,
    disabled: placing,
  });

  return (
    // The canvas fills this box and the ring floats over it, positioned against
    // the element the pointer maths is already measured from.
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={(e) => {
          ring.move(e);
          handleDown(e);
        }}
        onPointerMove={(e) => {
          // The outline follows every pointer over the page, drawing or not —
          // but not two fingers on the glass, which is a pinch and not an aim.
          if (pointers.current.size >= 2) ring.hide();
          else ring.move(e);
          handleMove(e);
        }}
        onPointerUp={finish}
        onPointerCancel={(e) => {
          ring.hide();
          cancel(e);
        }}
        onPointerLeave={ring.hide}
        onContextMenu={contextMenu}
        // `touch-none` hands every touch to this component: without it a drag on
        // the canvas scrolls or zooms the page instead of drawing and pinching.
        className="h-full w-full touch-none"
        style={{
          cursor: cursorFor({
            plugin: pluginById(tool),
            placing,
            holding,
            ring: ring.shown,
          }),
        }}
      />
      {ring.node}
    </div>
  );
}
