// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { drawingBounds, type Box } from "./bounds.ts";
import { renderDrawing, type RenderOptions } from "./render.ts";
import type { Drawing, Point } from "./types.ts";
import {
  clampView,
  clampScale,
  nativeScale,
  panBy,
  pinch,
  zoomAt,
  type CanvasView,
} from "./viewport.ts";

// The window you keep watching while the dialog is over the page.
//
// An effect's options preview onto the drawing itself, and on a desktop that is
// the whole answer: the card steps aside, and now it can be dragged clear of
// whatever you are looking at. On a phone there is no aside to step to. The
// dialog **is** the screen — three sliders, a scope picker and a warning do not
// fit beside a picture on 390 points of width — so a preview painted on the page
// behind it is a preview of a page nobody can see.
//
// So the dialog carries its own window onto the page: the same drawing, through
// the same renderer, with the same effect being tried on it. It pans and it
// zooms, because a fixed thumbnail of a 3200-pixel sheet says nothing about a
// six-pixel blur — the whole reason to have it is to put the part you care about
// under the change you are making and watch it move.
//
// Three things it deliberately is not:
//
//   - **Not the canvas.** No cache, no trail, no gesture. It repaints the
//     document straight through `render.ts` on an animation frame, which is
//     affordable precisely because it is small and clipped to what it shows.
//   - **Not an edit.** It is the same `preview` object the page behind is
//     painted from, so what it shows and what Apply lands cannot disagree.
//   - **Not a second viewport.** It opens on whatever the canvas was already
//     looking at, so the first thing it shows is the thing you had in front of
//     you when you opened the dialog.
//
// And it can be turned off: hold **Before** and the effect comes out of the
// render for as long as you hold it, which is the comparison every adjustment
// wants and the one thing a live preview cannot show on its own.

type Props = {
  drawing: Drawing;
  /** How the page is painted, effect and all. Handed down whole so this window
   *  and the canvas behind it are painted from one value. */
  options: RenderOptions;
  /** Where to open: a document point to put in the middle, and the scale the
   *  canvas was showing it at. `null` opens on the middle of the page. */
  look: { at: Point; scale: number } | null;
  labels: {
    title: string;
    hint: string;
    fit: string;
    before: string;
    /** The zoom readout, given the percentage — the same string the canvas's
     *  own pill wears, so 100% means the same thing in both windows. */
    zoom: (percent: string) => string;
  };
};

/** How tall the window is, in CSS pixels. Big enough to judge a softening or a
 *  grade on, small enough to leave the controls that drive it on the same
 *  screen — which is the trade the whole component exists to make. */
const PEEK_HEIGHT = 176;

/** What one wheel notch does to the zoom. The canvas's own feel, so the two
 *  windows behave the same under the same hand. */
const WHEEL_STEP = 0.0015;

export function EffectPeek({ drawing, options, look, labels }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [view, setView] = useState<CanvasView | null>(null);
  // Held down: the page without the effect on it, for as long as the button is
  // under the finger.
  const [before, setBefore] = useState(false);

  // How big the window actually is. It changes with the dialog — a phone turned
  // on its side, a keyboard coming up — so it is measured rather than assumed.
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** The view that puts `at` in the middle of the window at `scale`. */
  const centred = useCallback(
    (
      at: Point,
      scale: number,
      viewport: { width: number; height: number },
    ): CanvasView => {
      const next = clampScale(scale);
      return clampView(
        {
          scale: next,
          tx: viewport.width / 2 - at.x * next,
          ty: viewport.height / 2 - at.y * next,
        },
        drawing,
        viewport,
      );
    },
    [drawing],
  );

  /** A box of the page, filling the window with a little air around it. */
  const framing = useCallback(
    (what: Box, viewport: { width: number; height: number }): CanvasView => {
      const scale = clampScale(
        Math.min(
          viewport.width / Math.max(1, what.width),
          viewport.height / Math.max(1, what.height),
        ) * 0.96,
      );
      return centred(
        { x: what.x + what.width / 2, y: what.y + what.height / 2 },
        scale,
        viewport,
      );
    },
    [centred],
  );

  /** The whole page in the window — what the fit button returns to. */
  const fitted = useCallback(
    (viewport: { width: number; height: number }): CanvasView =>
      framing(
        { x: 0, y: 0, width: drawing.width, height: drawing.height },
        viewport,
      ),
    [drawing, framing],
  );

  // Where the marks actually are. Only read to decide what to open on, so it is
  // computed once per drawing rather than per frame.
  const ink = useMemo(() => drawingBounds(drawing), [drawing]);

  // Opened once the window has a size, and there are two answers.
  //
  // The first is **where you were looking**: the canvas's own centre at the
  // canvas's own zoom, so the window opens on the thing that was in front of you
  // when you reached for the effect.
  //
  // The second is the answer to that going wrong. This window is a fraction of
  // the height of the canvas, so the same centre at the same zoom can easily
  // come up on a patch of blank page beside your drawing — and a preview showing
  // nothing at all is worse than no preview, because it looks like the effect
  // did nothing. So when the opening window catches none of the marks, it frames
  // the marks instead.
  useEffect(() => {
    if (!box || view) return;
    const wanted = look ? centred(look.at, look.scale, box) : null;
    if (wanted && (!ink || catches(wanted, box, ink))) {
      setView(wanted);
      return;
    }
    setView(ink ? framing(ink, box) : fitted(box));
  }, [box, view, look, ink, centred, framing, fitted]);

  // The paint itself, on an animation frame so a slider dragged from end to end
  // costs one frame apiece rather than one per pointer event.
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !box || !view) return;
    const paint = () => {
      pending.current = null;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scale = view.scale * ratio;
      ctx.setTransform(scale, 0, 0, scale, view.tx * ratio, view.ty * ratio);
      renderDrawing(ctx, drawing, null, {
        ...options,
        // Held down, the effect simply is not in the render — the same page,
        // painted the way it already is.
        preview: before ? undefined : options.preview,
        // Only the slice of the page this window is showing. Without it a peek
        // at one corner of a big sheet would cost the whole document a frame.
        clip: {
          x: -view.tx / view.scale,
          y: -view.ty / view.scale,
          width: box.width / view.scale,
          height: box.height / view.scale,
        },
      });
    };
    pending.current = requestAnimationFrame(paint);
    return () => {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
      pending.current = null;
    };
  }, [drawing, options, view, box, before]);

  // The pointers on the glass. One pans, two pinch — the canvas's own two
  // gestures, through the canvas's own arithmetic (`viewport.ts`), so a page
  // moves the same way in here as it does out there.
  const pointers = useRef(new Map<number, Point>());
  const panFrom = useRef<{ id: number; at: Point } | null>(null);
  const pinchFrom = useRef<{ view: CanvasView; a: Point; b: Point } | null>(
    null,
  );

  const spot = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
  };

  const onDown = (e: PointerEvent) => {
    if (!view || !box) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const at = spot(e);
    pointers.current.set(e.pointerId, at);
    if (pointers.current.size === 1) {
      panFrom.current = { id: e.pointerId, at };
      pinchFrom.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      panFrom.current = null;
      pinchFrom.current = { view, a: a!, b: b! };
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !box) return;
    const at = spot(e);
    pointers.current.set(e.pointerId, at);
    if (pinchFrom.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      setView(pinch(pinchFrom.current, a!, b!, drawing, box));
      return;
    }
    const pan = panFrom.current;
    if (!pan || pan.id !== e.pointerId) return;
    setView((current) =>
      current
        ? clampView(
            panBy(current, at.x - pan.at.x, at.y - pan.at.y),
            drawing,
            box,
          )
        : current,
    );
    panFrom.current = { id: e.pointerId, at };
  };

  const onUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (panFrom.current?.id === e.pointerId) panFrom.current = null;
    if (pointers.current.size < 2) pinchFrom.current = null;
    // A finger lifted off a pinch leaves the other one panning from where it is,
    // rather than jumping the page by however far apart they were.
    if (pointers.current.size === 1) {
      const [id] = [...pointers.current.keys()];
      const at = pointers.current.get(id!);
      if (at) panFrom.current = { id: id!, at };
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (!view || !box) return;
    e.preventDefault();
    const at = spot(e);
    setView(
      clampView(
        zoomAt(view, view.scale * Math.exp(-e.deltaY * WHEEL_STEP), at),
        drawing,
        box,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">{labels.title}</span>
        <span className="text-[11px] tabular-nums text-muted">
          {labels.zoom(
            String(
              Math.round(
                ((view?.scale ?? 0) / nativeScale(window.devicePixelRatio)) *
                  100,
              ),
            ),
          )}
        </span>
      </div>
      <div
        ref={boxRef}
        style={{ height: PEEK_HEIGHT }}
        className="relative overflow-hidden rounded border border-line bg-surface-2"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={labels.title}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={onWheel}
          className="h-full w-full touch-none"
          style={{ cursor: "grab" }}
        />
        {/* The two things the glass can be told, over the corner of it rather
            than in a row of their own — the window is the scarce thing on a
            phone, and neither button is worth a line of the dialog. */}
        <div className="absolute right-1 top-1 flex gap-1">
          <button
            type="button"
            onPointerDown={() => setBefore(true)}
            onPointerUp={() => setBefore(false)}
            onPointerCancel={() => setBefore(false)}
            onPointerLeave={() => setBefore(false)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === " " || e.key === "Enter") setBefore(true);
            }}
            onKeyUp={(e: KeyboardEvent) => {
              if (e.key === " " || e.key === "Enter") setBefore(false);
            }}
            aria-pressed={before}
            className={`cursor-pointer rounded border border-line px-2 py-1 text-[11px] ${
              before ? "bg-accent text-surface" : "bg-surface-3 text-muted"
            }`}
          >
            {labels.before}
          </button>
          <button
            type="button"
            onClick={() => box && setView(fitted(box))}
            className="cursor-pointer rounded border border-line bg-surface-3 px-2 py-1 text-[11px] text-muted hover:text-fg-bright"
          >
            {labels.fit}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted">{labels.hint}</p>
    </div>
  );
}

/** Whether a view of this window would show any part of `what`. */
function catches(
  view: CanvasView,
  viewport: { width: number; height: number },
  what: Box,
): boolean {
  const left = -view.tx / view.scale;
  const top = -view.ty / view.scale;
  const right = left + viewport.width / view.scale;
  const bottom = top + viewport.height / view.scale;
  return (
    what.x < right &&
    what.x + what.width > left &&
    what.y < bottom &&
    what.y + what.height > top
  );
}
