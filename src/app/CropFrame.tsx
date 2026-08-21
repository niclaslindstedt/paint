// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef } from "react";

import type { Box } from "./bounds.ts";
import type { CanvasSize } from "./canvasSize.ts";
import { CROP_HANDLES, dragCrop, moveCrop, type CropHandle } from "./crop.ts";
import { useT } from "./i18n/index.ts";
import type { Point } from "./types.ts";
import { toDocumentPoint, toScreenPoint, type CanvasView } from "./viewport.ts";

// The rectangle you aim a crop with.
//
// It is a DOM overlay over the canvas, like the dropped image's frame and the
// selection's grips: the box, its eight handles and the shade over everything
// outside it are *chrome*, and as elements they get hit-testing, a cursor, a
// focus ring and keyboard nudging for nothing (see `ImagePlacement.tsx`).
//
// **This layer takes the whole pointer, which the other two deliberately don't.**
// A crop is a mode: while the rectangle is up, a press on the page is aiming it
// rather than drawing on it, and a stroke laid down through a crop you were
// still adjusting would be a mark on a picture you were in the middle of
// cutting. So the shade swallows presses, and the two ways out are the two the
// card beside it offers — Apply and Cancel — plus Enter and Escape.
//
// What is dimmed is what the crop is about to throw away, which is why the shade
// is drawn as four rectangles around the box rather than as one sheet with a
// hole cut in it: four `div`s need no compositing tricks, stay crisp at any
// zoom, and leave the part of the picture you are keeping completely untouched.
//
// The thirds are drawn because a crop is a composition decision and the rule of
// thirds is the one every viewfinder in the world offers to help with it. They
// are hairlines over the *kept* part only — a guide, never something you could
// mistake for a mark on the page.

type Props = {
  /** The window onto the page, so the frame sits exactly over the picture. */
  view: CanvasView;
  /** The sheet the box is being cut out of, in document pixels. */
  page: CanvasSize;
  box: Box;
  /** The shape the box is locked to, or `null` for any shape at all. */
  ratio: number | null;
  onChange: (box: Box) => void;
  /** Take the crop. */
  onCommit: () => void;
  /** Leave the page as it was. */
  onCancel: () => void;
};

/** How far one arrow key moves a box or an edge, in document pixels, and how
 *  far one held with shift does. The handles are buttons as well as grips: a
 *  crop you can only aim with a pointer is a crop half the people using it
 *  can't take. */
const KEY_STEP = 1;
const KEY_STEP_COARSE = 20;

type Drag = {
  pointerId: number;
  /** The grip in hand, or `null` while the whole box is being carried. */
  handle: CropHandle | null;
  /** Where the drag began and the box it began on — every move is measured from
   *  here rather than accumulated, so a drag is exact and reversible. */
  origin: Point;
  from: Box;
};

export function CropFrame({
  view,
  page,
  box,
  ratio,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  const t = useT();
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // Enter takes the crop, Escape leaves the page alone — the same two keys that
  // keep and discard a dropped picture, because it is the same beat: something
  // floating over the page, waiting to be settled or dropped.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onCommit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCommit, onCancel]);

  const documentPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return toDocumentPoint(view, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const startDrag = (
    e: React.PointerEvent<HTMLElement>,
    handle: CropHandle | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      handle,
      origin: documentPoint(e),
      from: box,
    };
  };

  const continueDrag = (e: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    const at = documentPoint(e);
    const delta = { x: at.x - active.origin.x, y: at.y - active.origin.y };
    onChange(
      active.handle
        ? dragCrop(active.from, active.handle, delta, page, ratio)
        : moveCrop(active.from, delta, page),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  /** Arrow keys, on the box itself or on one of its grips. */
  const nudge = (
    e: React.KeyboardEvent<HTMLElement>,
    handle: CropHandle | null,
  ) => {
    const step = e.shiftKey ? KEY_STEP_COARSE : KEY_STEP;
    const delta =
      e.key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : e.key === "ArrowRight"
          ? { x: step, y: 0 }
          : e.key === "ArrowUp"
            ? { x: 0, y: -step }
            : e.key === "ArrowDown"
              ? { x: 0, y: step }
              : null;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(
      handle
        ? dragCrop(box, handle, delta, page, ratio)
        : moveCrop(box, delta, page),
    );
  };

  const topLeft = toScreenPoint(view, { x: box.x, y: box.y });
  const frame = {
    left: topLeft.x,
    top: topLeft.y,
    width: box.width * view.scale,
    height: box.height * view.scale,
  };
  const shade = { background: "rgb(0 0 0 / 0.55)" };
  const THIRDS = {
    background: "rgb(255 255 255 / 0.45)",
    mixBlendMode: "difference" as const,
  };

  return (
    <div
      ref={layerRef}
      aria-hidden="false"
      className="absolute inset-0 touch-none overflow-hidden"
      // Nothing under the crop takes a press while it is up — see the note at
      // the top of the file.
      onPointerDown={(e) => e.preventDefault()}
    >
      {/* What the crop is about to lose, dimmed: four rectangles around the box
          rather than a hole cut in one. */}
      <div
        className="absolute inset-x-0 top-0"
        style={{ ...shade, height: `${Math.max(0, frame.top)}px` }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ ...shade, top: `${frame.top + frame.height}px` }}
      />
      <div
        className="absolute left-0"
        style={{
          ...shade,
          top: `${frame.top}px`,
          height: `${frame.height}px`,
          width: `${Math.max(0, frame.left)}px`,
        }}
      />
      <div
        className="absolute right-0"
        style={{
          ...shade,
          top: `${frame.top}px`,
          height: `${frame.height}px`,
          left: `${frame.left + frame.width}px`,
        }}
      />

      {/* The box itself. Dragging anywhere inside it carries the whole crop. */}
      <div
        role="group"
        tabIndex={0}
        aria-label={t("crop.frame")}
        className="absolute cursor-move touch-none outline-none ring-1 ring-white/90"
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
        onKeyDown={(e) => nudge(e, null)}
      >
        {/* The thirds — a composition guide over the part you are keeping.
            Painted as a *difference* against what is under them rather than in
            a colour of their own: a white hairline is invisible on a white page
            and a black one is invisible on a dark drawing, and a guide you can
            only see on some pictures is worse than none. Inverting whatever is
            behind it works on both, and on the photograph in between. */}
        <div className="pointer-events-none absolute inset-0">
          {[1, 2].map((n) => (
            <div
              key={`v${n}`}
              className="absolute inset-y-0 w-px"
              style={{ ...THIRDS, left: `${(n / 3) * 100}%` }}
            />
          ))}
          {[1, 2].map((n) => (
            <div
              key={`h${n}`}
              className="absolute inset-x-0 h-px"
              style={{ ...THIRDS, top: `${(n / 3) * 100}%` }}
            />
          ))}
        </div>

        {CROP_HANDLES.map((handle) => (
          <button
            key={handle}
            type="button"
            aria-label={t(HANDLE_LABELS[handle])}
            style={{ cursor: CURSORS[handle] }}
            className={`absolute touch-none rounded-[2px] border border-fg-bright bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${OFFSETS[handle]}`}
            onPointerDown={(e) => startDrag(e, handle)}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(e) => nudge(e, handle)}
          />
        ))}
      </div>
    </div>
  );
}

/** Where each grip sits on the frame, and how big it is. Corners are squares
 *  hanging half outside the box; the edge grips are short bars centred on their
 *  side, so a side is grabbable without covering the corners next to it. */
const OFFSETS: Record<CropHandle, string> = {
  nw: "-top-1.5 -left-1.5 h-3 w-3",
  n: "-top-1.5 left-1/2 h-3 w-6 -translate-x-1/2",
  ne: "-top-1.5 -right-1.5 h-3 w-3",
  e: "-right-1.5 top-1/2 h-6 w-3 -translate-y-1/2",
  se: "-right-1.5 -bottom-1.5 h-3 w-3",
  s: "-bottom-1.5 left-1/2 h-3 w-6 -translate-x-1/2",
  sw: "-bottom-1.5 -left-1.5 h-3 w-3",
  w: "-left-1.5 top-1/2 h-6 w-3 -translate-y-1/2",
};

/** The resize cursor each grip offers. */
const CURSORS: Record<CropHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

/** What each grip is called, for a screen reader and for the tooltip. */
const HANDLE_LABELS = {
  nw: "crop.handles.nw",
  n: "crop.handles.n",
  ne: "crop.handles.ne",
  e: "crop.handles.e",
  se: "crop.handles.se",
  s: "crop.handles.s",
  sw: "crop.handles.sw",
  w: "crop.handles.w",
} as const;
