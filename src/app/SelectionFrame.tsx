// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useRef } from "react";

import { boxFromCorners, type Box } from "./bounds.ts";
import { useT } from "./i18n/index.ts";
import { CORNERS, type Corner } from "./placement.ts";
import { scaleRegion, type Selection } from "./selection.ts";
import type { Point } from "./types.ts";
import { toDocumentPoint, toScreenPoint, type CanvasView } from "./viewport.ts";

// The grips on a settled selection.
//
// A selection you cannot adjust is one you draw again: the marquee lands where
// your finger let go of it, and "a few pixels further left" costs you the whole
// gesture. So the four corners of a settled window are grabbable, and dragging
// one stretches the window it belongs to — the *shape* you drew and not just its
// box, so a lasso adjusted by a corner is still that lasso (see `scaleRegion`).
//
// They are elements over the canvas rather than paint on it, exactly as the
// dropped image's frame is (see `ImagePlacement.tsx`): a grip is a control, and
// as an element it gets hit-testing, a cursor and a focus ring for nothing. The
// layer between them is **transparent to the pointer** — that matters more here
// than it does there, because everything inside a selection is still the
// canvas's: painting in it, dragging its contents with the hand, sliding the
// window with the marquee. Only the twelve pixels of each grip are ours.
//
// The outline itself is not drawn here. It is painted on the canvas with the
// same marching ants the gesture was dragged with (see `frame.ts`), so what you
// drew and what you got read as one thing at any zoom. That is also why the
// grips take an `offset`: a hand drag carries the window live — ink and ants
// both — without touching the document, and chrome that lives above the canvas
// has to be told, or the grips are left behind at corners the window no longer
// has (see `PaintCanvas.onCarrySelection`).

type Props = {
  /** The window onto the page, so the grips sit exactly on the corners. */
  view: CanvasView;
  selection: Selection;
  /** The window as this drag has it now — screen state, never a document
   *  edit. */
  onChange: (selection: Selection) => void;
  /** How far a hand drag has carried the window since it began, in document
   *  pixels, or `null` when nothing is in flight. The frame rides along; the
   *  grips stop taking the pointer while it does, because the window they would
   *  stretch is not the one on the screen yet. */
  offset?: Point | null;
  /** Where the corner under the finger is, in document coordinates, so the
   *  canvas can float the magnifier beside it — and `null` when the drag ends.
   *  Placing an edge is the one gesture in the app where a pixel matters (see
   *  `loupe.ts`). */
  onPlacing: (at: { x: number; y: number } | null) => void;
};

/** How small a window may be pulled, in document pixels. A selection smaller
 *  than this is one you meant to redraw rather than one you meant to keep. */
const MIN_SELECTION = 2;

type Drag = {
  pointerId: number;
  corner: Corner;
  /** The window as it was when the grip was taken — every move is measured from
   *  here rather than accumulated, so a drag is exact and reversible. */
  from: Selection;
};

export function SelectionFrame({
  view,
  selection,
  offset = null,
  onChange,
  onPlacing,
}: Props) {
  const t = useT();
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const documentPoint = (e: { clientX: number; clientY: number }) => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return toDocumentPoint(view, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>, corner: Corner) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, corner, from: selection };
    onPlacing(documentPoint(e));
  };

  const continueDrag = (e: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    const at = documentPoint(e);
    const box = pulled(active.from.box, active.corner, at);
    // Spread from the window the drag began with, so what else it carries (its
    // feather) travels through the stretch untouched.
    onChange({
      ...active.from,
      region: scaleRegion(active.from.region, active.from.box, box),
      box,
    });
    onPlacing(at);
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    onPlacing(null);
  };

  const topLeft = toScreenPoint(view, {
    x: selection.box.x + (offset?.x ?? 0),
    y: selection.box.y + (offset?.y ?? 0),
  });
  const frame = {
    left: topLeft.x,
    top: topLeft.y,
    width: selection.box.width * view.scale,
    height: selection.box.height * view.scale,
  };

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        role="group"
        aria-label={t("canvas.selectionFrame")}
        className="absolute"
        style={{
          left: `${frame.left}px`,
          top: `${frame.top}px`,
          width: `${frame.width}px`,
          height: `${frame.height}px`,
        }}
      >
        {CORNERS.map((corner) => (
          <button
            key={corner}
            type="button"
            aria-label={t("canvas.adjustSelection")}
            style={{ cursor: CURSORS[corner] }}
            className={`absolute h-3.5 w-3.5 cursor-pointer touch-none rounded-sm border-2 border-accent bg-surface ${offset ? "" : "pointer-events-auto"} ${OFFSETS[corner]}`}
            onPointerDown={(e) => startDrag(e, corner)}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ))}
      </div>
    </div>
  );
}

/** The box a grip drags out: the corner opposite it stays pinned, the one under
 *  the finger goes where the finger is, and neither side may be pulled through
 *  the other into nothing. Free of any aspect ratio, unlike a dropped picture's
 *  frame — a window is a window, and the shape of it is the point. */
function pulled(box: Box, corner: Corner, at: { x: number; y: number }): Box {
  const anchor = {
    x: corner === "nw" || corner === "sw" ? box.x + box.width : box.x,
    y: corner === "nw" || corner === "ne" ? box.y + box.height : box.y,
  };
  const pulledBox = boxFromCorners(anchor, at);
  return {
    x: pulledBox.x,
    y: pulledBox.y,
    width: Math.max(pulledBox.width, MIN_SELECTION),
    height: Math.max(pulledBox.height, MIN_SELECTION),
  };
}

/** Where each grip sits on the frame — half of it hanging outside, so a corner
 *  stays grabbable over a dark drawing. */
const OFFSETS: Record<Corner, string> = {
  nw: "-top-1.5 -left-1.5",
  ne: "-top-1.5 -right-1.5",
  se: "-right-1.5 -bottom-1.5",
  sw: "-bottom-1.5 -left-1.5",
};

/** The resize cursor each corner offers. */
const CURSORS: Record<Corner, string> = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};
