// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useRef, useState } from "react";

import {
  addCurvePoint,
  moveCurvePoint,
  normalizeCurve,
  removeCurvePoint,
  sampleCurve,
  STRAIGHT,
  type CurveChannel,
  type CurvePoint,
} from "./adjust.ts";

// The tone curve, as a thing you drag.
//
// Every other control an effect offers is a number, and a number is a slider —
// which is why the effect dialog can render most of them off a descriptor
// without knowing what it is showing. A curve is the exception the descriptor
// admits to (`EffectCurve`): the value is a *line*, and the only honest control
// for a line is the line itself.
//
// It is a square, deliberately. Input runs left to right and output runs bottom
// to top, so the straight diagonal is "nothing changed" and every bend reads
// against it — lift the middle and the picture lightens, pull the top-left
// corner down and you have taken the highlights off. That diagonal stays drawn
// underneath at all times, because a curve with nothing to compare it to says
// very little.
//
// The maths — where the line actually goes between the handles, and why it is a
// monotone spline rather than an ordinary one — is `adjust.ts`'s and is shared
// with the painter, so what you drag and what lands on the pixels are the same
// function. This file only turns pointers into handles.
//
// It is capped at a comfortable square rather than filling the dialog's width.
// A tone curve is read by the *shape* of the line against the diagonal, and that
// shape is legible long before the square gets big — where a square as wide as
// the dialog pushes the scope picker and the warning that follows it off the
// bottom of a laptop screen, which is a worse trade than a smaller graph.
//
// **It is reachable without a pointer.** A drag-only control on a canvas app is
// an easy thing to ship and a hard thing to use: the square takes focus, the
// arrows move whichever handle is selected, and Delete takes it away. The hand
// and the keyboard write through the same three pure helpers, so neither can
// produce a curve the other could not.

type Props = {
  points: readonly CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  /** Which line this is, which is the only thing that changes its colour. */
  channel: CurveChannel;
  label: string;
  /** How far off the square a handle has to be dragged to be thrown away. */
  removeHint: string;
};

/** How close a press has to land to a handle to grab it rather than make a new
 *  one, as a fraction of the square. A finger is about this wide on a phone. */
const GRAB = 0.06;

/** How far outside the square a dragged handle is considered thrown away. */
const OFF = 0.12;

/** One arrow key's worth of movement. Coarse enough to cross the square in a
 *  few seconds, fine enough to place a handle where you meant it. */
const STEP = 1 / 64;

/** How many segments the drawn line is made of. The painter samples it 256
 *  times (one per tone); the screen needs far fewer to look smooth. */
const SEGMENTS = 64;

/** What each line is drawn in. The composite is the ink colour of the dialog it
 *  is in; a channel is drawn in the channel. */
const STROKE: Record<CurveChannel, string> = {
  rgb: "currentColor",
  r: "#ef4444",
  g: "#22c55e",
  b: "#60a5fa",
};

export function CurveEditor({
  points,
  onChange,
  channel,
  label,
  removeHint,
}: Props) {
  const boxRef = useRef<SVGSVGElement>(null);
  // Which handle the hand or the keyboard is on. A drag sets it; so does an
  // arrow key, so the two never disagree about what is being moved.
  const [held, setHeld] = useState<number | null>(null);
  const dragging = useRef(false);

  /** Where a pointer is on the square, in curve coordinates — x rightward, y
   *  *upward*, which is the way a curve is read and the opposite of the way a
   *  screen is measured. Deliberately not clamped: a handle dragged off the
   *  square is how you throw it away. */
  const at = useCallback((e: { clientX: number; clientY: number }) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {
      x: (e.clientX - box.left) / box.width,
      y: 1 - (e.clientY - box.top) / box.height,
    };
  }, []);

  const grab = (spot: CurvePoint) => {
    let near = -1;
    let best = GRAB;
    points.forEach((point, index) => {
      const gap = Math.hypot(point.x - spot.x, point.y - spot.y);
      if (gap <= best) {
        best = gap;
        near = index;
      }
    });
    return near;
  };

  const onDown = (e: PointerEvent) => {
    const spot = at(e);
    if (!spot) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const near = grab(spot);
    if (near >= 0) {
      setHeld(near);
    } else {
      const added = addCurvePoint(points, spot);
      setHeld(added.index);
      onChange(normalizeCurve(added.points));
    }
    dragging.current = true;
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging.current || held === null) return;
    const spot = at(e);
    if (!spot) return;
    onChange(moveCurvePoint(points, held, spot));
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const spot = at(e);
    // Dragged clear off the square: the handle goes, the way it does in every
    // curve editor there has ever been. The two ends stay whatever you do —
    // without them the line has no black and no white to run between.
    if (
      spot &&
      held !== null &&
      (spot.x < -OFF || spot.x > 1 + OFF || spot.y < -OFF || spot.y > 1 + OFF)
    ) {
      const left = removeCurvePoint(points, held);
      setHeld(null);
      onChange(left);
      return;
    }
    // A handle dragged *just* off the edge is one you meant to pin to the edge.
    onChange(normalizeCurve(points));
  };

  const onKey = (e: KeyboardEvent) => {
    const index = held ?? 0;
    const point = points[index];
    if (!point) return;
    const step = e.shiftKey ? STEP * 4 : STEP;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(
        moveCurvePoint(points, index, {
          x: point.x + (e.key === "ArrowRight" ? step : -step),
          y: point.y,
        }),
      );
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(
        moveCurvePoint(points, index, {
          x: point.x,
          y: point.y + (e.key === "ArrowUp" ? step : -step),
        }),
      );
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setHeld(null);
      onChange(removeCurvePoint(points, index));
    } else if (e.key === "Tab" && !e.shiftKey && index < points.length - 1) {
      // Walking the handles inside the square, rather than out of it.
      e.preventDefault();
      setHeld(index + 1);
    } else if (e.key === "Tab" && e.shiftKey && index > 0) {
      e.preventDefault();
      setHeld(index - 1);
    }
  };

  // The line itself, sampled through the same function the painter builds its
  // lookup table from.
  const line = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
    const x = i / SEGMENTS;
    return `${(x * 100).toFixed(2)},${((1 - sampleCurve(points, x)) * 100).toFixed(2)}`;
  }).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={boxRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="application"
        aria-label={`${label}. ${removeHint}`}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="mx-auto aspect-square w-full max-w-64 cursor-crosshair touch-none rounded border border-line bg-surface-2 text-fg-bright focus:outline-2 focus:outline-offset-2 focus:outline-accent"
      >
        {/* Quarters, so a handle can be put somewhere on purpose. */}
        {[25, 50, 75].map((n) => (
          <g key={n} stroke="currentColor" strokeWidth={0.4} opacity={0.15}>
            <line x1={n} y1={0} x2={n} y2={100} />
            <line x1={0} y1={n} x2={100} y2={n} />
          </g>
        ))}
        {/* "Nothing changed", drawn under everything. */}
        <line
          x1={0}
          y1={100}
          x2={100}
          y2={0}
          stroke="currentColor"
          strokeWidth={0.6}
          opacity={0.3}
          strokeDasharray="3 3"
        />
        <polyline
          points={line}
          fill="none"
          stroke={STROKE[channel]}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
        />
        {points.map((point, index) => (
          <circle
            key={`${index}:${point.x}`}
            cx={point.x * 100}
            cy={(1 - point.y) * 100}
            r={index === held ? 3.4 : 2.4}
            fill={index === held ? STROKE[channel] : "var(--color-surface)"}
            stroke={STROKE[channel]}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <p className="text-[11px] text-muted">{removeHint}</p>
    </div>
  );
}

/** The straight line, for the editor's reset. Here rather than inlined so the
 *  dialog does not have to know what "no curve" is shaped like. */
export function straightLine(): CurvePoint[] {
  return [...STRAIGHT];
}
