// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef } from "react";

import {
  CheckIcon,
  CloseIcon,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import {
  CORNERS,
  movePlacement,
  resizePlacement,
  type Corner,
  type Placement,
} from "./placement.ts";
import { toDocumentPoint, toScreenPoint, type CanvasView } from "./viewport.ts";

// The floating frame a dropped image wears until it is settled.
//
// A drop lands the picture *over* the page rather than on it: drag it, pull a
// corner to scale it, and it becomes a mark only when you keep it — a click away
// from it, Enter, or the Keep button (Escape and Discard throw it away). That
// beat exists because a dropped image
// arrives at whatever size the file happened to be, in whatever spot the cursor
// happened to be over — committing that straight into the document would make
// the first thing you do after every drop an undo.
//
// It is a DOM overlay rather than something painted on the canvas: the frame and
// its handles are chrome, not marks, and as elements they get hit-testing, focus
// and a cursor for free. The layer itself is transparent to the pointer, so a
// press *outside* the frame still reaches the canvas underneath — which is what
// settles the placement (see `PaintCanvas`'s `placing`).

type Props = {
  /** The window onto the page, so the frame can sit exactly over the picture. */
  view: CanvasView;
  placement: Placement;
  onChange: (placement: Placement) => void;
  /** Keep it: turn the placement into a mark on the page. */
  onSettle: () => void;
  /** Drop it: leave the document as it was. */
  onCancel: () => void;
};

/** A drag in progress: which corner it holds (or the whole frame), and the
 *  placement it started from. Computing from the start rather than accumulating
 *  per frame keeps a drag exact and reversible. */
type Drag = {
  pointerId: number;
  corner: Corner | null;
  origin: { x: number; y: number };
  box: Placement["box"];
};

export function ImagePlacement({
  view,
  placement,
  onChange,
  onSettle,
  onCancel,
}: Props) {
  const t = useT();
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // Enter keeps the picture, Escape throws it away — the two keys every "place
  // this thing" interaction has used since the first drawing program.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSettle();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSettle, onCancel]);

  /** A pointer event in document coordinates — the space the placement lives
   *  in, at any zoom. */
  const documentPoint = (e: {
    clientX: number;
    clientY: number;
  }): { x: number; y: number } => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return toDocumentPoint(view, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const startDrag = (
    e: React.PointerEvent<HTMLElement>,
    corner: Corner | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      corner,
      origin: documentPoint(e),
      box: placement.box,
    };
  };

  const continueDrag = (e: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    const at = documentPoint(e);
    const box = active.corner
      ? resizePlacement(active.box, active.corner, at, placement.aspect)
      : movePlacement(
          active.box,
          at.x - active.origin.x,
          at.y - active.origin.y,
        );
    onChange({ ...placement, box });
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  const topLeft = toScreenPoint(view, {
    x: placement.box.x,
    y: placement.box.y,
  });
  const frame = {
    left: topLeft.x,
    top: topLeft.y,
    width: placement.box.width * view.scale,
    height: placement.box.height * view.scale,
  };

  return (
    // The layer spans the canvas but is transparent to the pointer: only the
    // frame and its handles are hit targets, so a press anywhere else lands on
    // the canvas and settles the placement.
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        role="group"
        aria-label={t("canvas.placeImage")}
        className="pointer-events-auto absolute cursor-move touch-none"
        style={{
          left: `${frame.left}px`,
          top: `${frame.top}px`,
          width: `${frame.width}px`,
          height: `${frame.height}px`,
        }}
        onPointerDown={(e) => startDrag(e, null)}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={placement.src}
          alt=""
          draggable={false}
          className="h-full w-full select-none"
        />
        {/* The marching outline: an accent frame so the picture reads as
            floating over the page rather than already on it. */}
        <div className="pointer-events-none absolute inset-0 border-2 border-accent" />
        {CORNERS.map((corner) => (
          <button
            key={corner}
            type="button"
            aria-label={t("canvas.resizeImage")}
            style={{ cursor: CURSORS[corner] }}
            className={`absolute h-4 w-4 touch-none rounded-sm border-2 border-accent bg-surface ${OFFSETS[corner]}`}
            onPointerDown={(e) => startDrag(e, corner)}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ))}
      </div>

      {/* What to do next, and the two ways to be done with it.
          The buttons are not a convenience: a picture bigger than the window
          covers the whole canvas, so on a phone there is no "outside" left to
          tap and no Enter key to press. They are the only way out of that. */}
      <div className="pointer-events-none absolute inset-x-2 top-3 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs text-muted">
        <span>{t("canvas.placeImageHint")}</span>
        <span className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSettle}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-accent bg-accent/15 px-2.5 py-1 font-bold text-accent hover:bg-accent/25"
          >
            <CheckIcon className="h-3.5 w-3.5" />
            {t("canvas.placeImageKeep")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-1 text-fg hover:bg-surface-2"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            {t("canvas.placeImageDiscard")}
          </button>
        </span>
      </div>
    </div>
  );
}

/** Where each handle sits on the frame — half of it hanging outside, so a
 *  corner stays grabbable when the picture behind it is dark. */
const OFFSETS: Record<Corner, string> = {
  nw: "-top-2 -left-2",
  ne: "-top-2 -right-2",
  se: "-right-2 -bottom-2",
  sw: "-bottom-2 -left-2",
};

/** The resize cursor each corner offers. */
const CURSORS: Record<Corner, string> = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};
