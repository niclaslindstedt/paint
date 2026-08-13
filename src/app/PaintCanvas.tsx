// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useRef, useState } from "react";

import { pluginById } from "./plugins/registry.ts";
import type { DraftStroke, ToolContext } from "./plugins/types.ts";
import { renderDrawing, toDocumentPoint } from "./render.ts";
import type { Drawing } from "./types.ts";

// The canvas surface: one `<canvas>` element, a pointer gesture in flight, and
// a full repaint whenever either the document or the gesture changes.
//
// The element is sized in *device* pixels (document size × devicePixelRatio) and
// laid out in CSS pixels by the parent, so a sketch is crisp on a retina screen
// while the model stays in document coordinates. All pointer math goes through
// `toDocumentPoint`, so the tools never see a screen coordinate.

type Props = {
  drawing: Drawing;
  /** The resolved page colour (see `canvas.ts`): the drawing's pinned colour,
   *  or the canvas theme's sheet. Painted by the element, and handed to the
   *  tools as `background` so the eraser paints with it. */
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
  ariaLabel: string;
};

/** Grid spacing in document pixels — 40 is about a finger-width on a phone at
 *  the default page size, and divides the default page evenly. */
const GRID_STEP = 40;

export function PaintCanvas({
  drawing,
  pageColor,
  tool,
  ink,
  defaultInk,
  onCommit,
  showGrid = false,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The in-flight gesture. Held in state (not a ref) because every move has to
  // repaint; held as a draft (not a committed stroke) because an abandoned
  // gesture must leave no trace in the document or the undo history.
  const [draft, setDraft] = useState<DraftStroke | null>(null);
  // The pointer that owns the current gesture. A second finger landing mid
  // stroke is ignored rather than jumping the line across the page.
  const activePointer = useRef<number | null>(null);

  const context = useCallback(
    (): ToolContext => ({ ...ink, background: pageColor }),
    [ink, pageColor],
  );

  const pointOf = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      return toDocumentPoint(
        canvas.getBoundingClientRect(),
        drawing,
        e.clientX,
        e.clientY,
      );
    },
    [drawing],
  );

  // Repaint whenever the document, the gesture, or the device pixel ratio
  // changes. A full redraw per frame is cheap at sketch-sized stroke counts and
  // keeps the model the single source of truth (see `render.ts`).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.round(drawing.width * dpr);
    const height = Math.round(drawing.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderDrawing(ctx, drawing, draft ? { ...draft, id: "draft" } : null, {
      transparentPage: true,
      pageColor,
      defaultInk,
    });
  }, [drawing, draft, pageColor, defaultInk]);

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== null) return;
    const plugin = pluginById(tool);
    if (!plugin) return;
    const next = plugin.behaviour.start(pointOf(e), context());
    if (!next) return;
    activePointer.current = e.pointerId;
    // Capture so a stroke that runs off the canvas edge keeps sampling until
    // the pointer is released — a line drawn past the page boundary should end
    // where the user let go, not where they crossed the border.
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ ...next, tool });
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return;
    const plugin = pluginById(tool);
    if (!plugin) return;
    setDraft((cur) =>
      cur ? plugin.behaviour.move(cur, pointOf(e), context()) : cur,
    );
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
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
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setDraft(null);
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={finish}
      onPointerCancel={cancel}
      // `touch-none` hands every touch to the tools: without it a drag on the
      // canvas scrolls or pans the page instead of drawing.
      className="max-h-full max-w-full touch-none rounded-sm shadow-lg"
      style={{
        aspectRatio: `${drawing.width} / ${drawing.height}`,
        // The page paints its own background; the grid sits *under* it as a
        // repeating gradient so it is a drawing aid on screen and can never
        // reach the exported PNG (which renders the model, not this element).
        backgroundColor: pageColor,
        backgroundImage: showGrid
          ? `linear-gradient(to right, rgba(120,130,145,0.25) 1px, transparent 1px),
             linear-gradient(to bottom, rgba(120,130,145,0.25) 1px, transparent 1px)`
          : undefined,
        backgroundSize: showGrid ? `${GRID_STEP}px ${GRID_STEP}px` : undefined,
      }}
    />
  );
}
