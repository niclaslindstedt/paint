// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, useRef, useState } from "react";

import { useT } from "./i18n/index.ts";
import {
  reshapeRegion,
  selectionHandles,
  type SelectionHandle,
} from "./selectHandles.ts";
import { selectionOf, type Selection } from "./selection.ts";
import type { Point } from "./types.ts";
import { toScreenPoint, type CanvasView } from "./viewport.ts";

// The grips a window that is not a rectangle wears — on its own line.
//
// Everything about *where* they go and *what* a pull does is `selectHandles.ts`
// and is pure; this file turns pointers into pulls, and is otherwise the same
// bargain `SelectionFrame.tsx` makes: elements over the canvas, pointer-
// transparent except for the grips themselves, so painting inside the window
// and dragging its contents still reach the canvas underneath.
//
// A corner grip is drawn square and a spacing grip round. That is not
// decoration: a corner is a landmark of the shape and stays put as the outline
// is worked over, where a spacing grip is only wherever the ruler happened to
// fall, and a hand that knows which is which knows which one to reach for.

type Props = {
  view: CanvasView;
  selection: Selection;
  onChange: (selection: Selection, options?: { live?: boolean }) => void;
  /** How far a hand drag has carried the window, in document pixels, or `null`.
   *  The grips ride along and stop taking the pointer while it does — the same
   *  rule the frame's corners follow. */
  offset: Point | null;
  onPlacing: (at: Point | null) => void;
  /** Where a pointer event is on the page. The frame owns the layer the grips
   *  are positioned in, so it owns the conversion too. */
  documentPoint: (e: { clientX: number; clientY: number }) => Point;
};

/** How far apart the grips sit, **on the glass**. Kept in screen pixels rather
 *  than document ones so an outline wears about as many grips at any zoom: a
 *  finger is the same size however far in you are. Roughly two fingers' width,
 *  which is as close as two independently draggable things may come on a
 *  phone. */
const SPACING = 44;

type Drag = {
  pointerId: number;
  handle: SelectionHandle;
  /** The window as it was when the grip was taken. Every move is measured from
   *  here rather than accumulated, so a drag is exact and reversible — and the
   *  bend is applied once to the original outline rather than compounded frame
   *  by frame into a shape nobody asked for. */
  from: Selection;
  /** How far the pull is felt along the outline, in document pixels. Frozen
   *  with the drag: a pinch mid-drag must not change what the drag means. */
  reach: number;
  /** Whether this drag has settled its step back yet — see `SelectionFrame`. */
  stepped: boolean;
};

export function SelectionOutlineGrips({
  view,
  selection,
  onChange,
  offset,
  onPlacing,
  documentPoint,
}: Props) {
  const t = useT();
  const drag = useRef<Drag | null>(null);
  // Which points of the outline are grips is settled when a drag begins and
  // held for its duration. The bend moves the points it does not add or drop
  // any, so a frozen address stays good — but the *set* would otherwise shift
  // under the finger as the corners it is made of soften, and a grip that
  // vanished mid-pull would take the pointer capture with it.
  const [held, setHeld] = useState<SelectionHandle[] | null>(null);

  const spacing = SPACING / view.scale;
  const handles = useMemo(
    () => selectionHandles(selection.region, spacing),
    [selection.region, spacing],
  );

  // Frozen addresses, read against the outline as it is now, so the grips
  // follow the bend they are making.
  const shown: SelectionHandle[] = held
    ? held.flatMap((handle) => {
        const at = selection.region[handle.loop]?.[handle.index];
        return at ? [{ ...handle, at }] : [];
      })
    : handles;

  const startDrag = (
    e: React.PointerEvent<HTMLElement>,
    handle: SelectionHandle,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      handle,
      from: selection,
      reach: spacing,
      stepped: false,
    };
    setHeld(handles);
    onPlacing(documentPoint(e));
  };

  const continueDrag = (e: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    const at = documentPoint(e);
    const region = reshapeRegion(
      active.from.region,
      active.handle,
      at,
      active.reach,
    );
    // Spread from the window the drag began with, so what else it carries — the
    // feather it was cut with, the nib that painted it — comes through the bend
    // untouched. A bend that flattened the outline into nothing is not a window
    // and is simply not sent.
    const next = selectionOf(region, {
      feather: active.from.feather,
      nib: active.from.nib,
    });
    if (next) {
      onChange(next, { live: active.stepped });
      active.stepped = true;
    }
    onPlacing(at);
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    setHeld(null);
    onPlacing(null);
  };

  return (
    <>
      {shown.map((handle) => {
        const at = toScreenPoint(view, {
          x: handle.at.x + (offset?.x ?? 0),
          y: handle.at.y + (offset?.y ?? 0),
        });
        return (
          <button
            key={`${handle.loop}:${handle.index}`}
            type="button"
            aria-label={t("canvas.reshapeSelection")}
            style={{ left: `${at.x}px`, top: `${at.y}px` }}
            className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none border-2 border-accent bg-surface active:cursor-grabbing ${handle.corner ? "rounded-[2px]" : "rounded-full"} ${offset ? "" : "pointer-events-auto"}`}
            onPointerDown={(e) => startDrag(e, handle)}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        );
      })}
    </>
  );
}
