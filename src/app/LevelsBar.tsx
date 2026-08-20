// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useRef } from "react";

import { gammaAt, gammaFraction, MIN_LEVELS_SPAN } from "./adjust.ts";
import { TONES, type Histogram } from "./histogram.ts";

// Levels, as a thing you drag over a picture of your own tones.
//
// The three numbers under this control were three sliders, and three sliders
// are the one shape that cannot answer the question you have in front of a
// levels control: *where does the picture start, and where does it stop?* A
// scan of a pencil sketch has nothing above tone 200 and nothing below 40, and
// "black point: 40" only means something once you can see that the data begins
// there. So the numbers are drawn on the shape they are aimed at, and placing
// them is pulling the two ends in to where the ink actually is.
//
// Three handles on one rail:
//
//   - **Black** — the tone that comes out black. Everything below it clips.
//   - **White** — the tone that comes out white. Everything above it clips.
//   - **The middle** — where the midtones sit between the two. It is a *gamma*
//     rather than a tone, so where it sits is a fraction of the way between the
//     other two and the arithmetic for that is `adjust.ts`'s (`gammaAt`), shared
//     with nothing else but kept there because it is arithmetic.
//
// The shaded ends are what is being thrown away — the part of your own
// histogram that is about to become flat black or flat white. That is the one
// thing a levels control can get badly wrong, so it is the thing drawn loudest.
//
// **It is reachable without a pointer**, on the same terms as the tone curve:
// each handle is a `slider` in its own right, so it takes focus in the ordinary
// tab order, reads its own value out, and moves under the arrow keys. Nothing
// here hijacks Tab.

/** The lightest and darkest level, as the axis counts them. 255 rather than
 *  256, because a tone fraction of 1 is level 255 — which is what the readouts
 *  say and what the sliders step by. */
const MAX_TONE = TONES - 1;

/** How far a handle may be pushed toward either end of the middle's travel. The
 *  gamma at the very ends is the extreme the control declares, and a handle
 *  pinned flat against another one cannot be told apart from it. */
const MID_MARGIN = 0.02;

/** One arrow key's worth of tone, and of the middle handle's travel. */
const TONE_STEP = 1 / MAX_TONE;
const MID_STEP = 1 / 128;

/** Which handle a press grabbed. */
type Handle = "black" | "gamma" | "white";

type Props = {
  /** The tones the effect would land on, or `null` where they could not be
   *  counted. The bar then draws its handles over an empty box — an honest
   *  picture of "we don't know", and still perfectly draggable. */
  histogram: Histogram | null;
  black: number;
  white: number;
  gamma: number;
  /** What the three numbers may be, straight off the effect's own controls, so
   *  the bar and the sliders it stands in for can't disagree about the range. */
  range: {
    black: { min: number; max: number };
    white: { min: number; max: number };
    gamma: { min: number; max: number };
  };
  onChange: (next: { black: number; white: number; gamma: number }) => void;
  /** Accessible names for the three handles — the same catalog strings the
   *  sliders wore, with their values already filled in. */
  labels: Record<Handle, string>;
  hint: string;
  /** Where the data starts and ends, in words — the one thing the shape says
   *  that a reader who cannot see it would otherwise lose. `null` where the
   *  tones could not be counted. */
  note: string | null;
};

export function LevelsBar({
  histogram,
  black,
  white,
  gamma,
  range,
  onChange,
  labels,
  hint,
  note,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const held = useRef<Handle | null>(null);

  const span = Math.max(MIN_LEVELS_SPAN, white - black);
  const midAt =
    black + gammaFraction(gamma, range.gamma.min, range.gamma.max) * span;

  /** Move one handle to a place on the rail, 0–1, and answer the whole trio.
   *  Every write goes through here — hand and keyboard alike — so no press can
   *  produce a levels setting the arrows could not. */
  const placed = useCallback(
    (handle: Handle, at: number) => {
      const clamp = (v: number, lo: number, hi: number) =>
        Math.min(hi, Math.max(lo, v));
      if (handle === "black") {
        const next = clamp(
          at,
          range.black.min,
          Math.min(range.black.max, white - MIN_LEVELS_SPAN),
        );
        // The middle keeps its *place between the ends* rather than its gamma:
        // it is a fraction of the span, and moving an end moves the span.
        return { black: next, white, gamma };
      }
      if (handle === "white") {
        const next = clamp(
          at,
          Math.max(range.white.min, black + MIN_LEVELS_SPAN),
          range.white.max,
        );
        return { black, white: next, gamma };
      }
      const fraction = clamp(
        (at - black) / Math.max(MIN_LEVELS_SPAN, white - black),
        MID_MARGIN,
        1 - MID_MARGIN,
      );
      return {
        black,
        white,
        gamma: gammaAt(fraction, range.gamma.min, range.gamma.max),
      };
    },
    [black, white, gamma, range],
  );

  /** Where a pointer is on the rail, as a tone fraction. */
  const at = useCallback((e: { clientX: number }) => {
    const box = railRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    return Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
  }, []);

  /** Which handle a press at `spot` meant: the nearest one. Pressing the rail
   *  anywhere therefore takes hold of something and drags it, which is how a
   *  handle this size is caught with a thumb. */
  const nearest = (spot: number): Handle => {
    const gaps: [Handle, number][] = [
      ["black", Math.abs(spot - black)],
      ["gamma", Math.abs(spot - midAt)],
      ["white", Math.abs(spot - white)],
    ];
    return gaps.sort((a, b) => a[1] - b[1])[0]![0];
  };

  const onDown = (e: PointerEvent) => {
    const spot = at(e);
    if (spot === null) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const handle = nearest(spot);
    held.current = handle;
    onChange(placed(handle, spot));
  };

  const onMove = (e: PointerEvent) => {
    const handle = held.current;
    if (!handle) return;
    const spot = at(e);
    if (spot === null) return;
    onChange(placed(handle, spot));
  };

  const onUp = () => {
    held.current = null;
  };

  const onKey = (handle: Handle) => (e: KeyboardEvent) => {
    const step =
      (handle === "gamma" ? MID_STEP : TONE_STEP) * (e.shiftKey ? 8 : 1);
    const here =
      handle === "black" ? black : handle === "white" ? white : midAt;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(placed(handle, here - step * (handle === "gamma" ? span : 1)));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(placed(handle, here + step * (handle === "gamma" ? span : 1)));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(placed(handle, 0));
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(placed(handle, 1));
    }
  };

  // The shape itself, as one filled outline across the tones. The heights are
  // square-rooted rather than raw: a photograph's peak is often a hundred times
  // its tails, and on a linear scale the tails — which is precisely where you
  // are placing the two ends — are a flat line one pixel high.
  const shape = histogram
    ? [
        "M 0,100",
        ...Array.from({ length: TONES }, (_, tone) => {
          const n = histogram.bins[tone] ?? 0;
          const h = histogram.peak > 0 ? Math.sqrt(n / histogram.peak) : 0;
          return `L ${tone},${(100 - h * 96).toFixed(2)}`;
        }),
        `L ${TONES - 1},100`,
        "Z",
      ].join(" ")
    : null;

  const handles: { id: Handle; at: number; value: string; fill: string }[] = [
    { id: "black", at: black, value: tone(black), fill: "#000" },
    { id: "gamma", at: midAt, value: gamma.toFixed(2), fill: "#9ca3af" },
    { id: "white", at: white, value: tone(white), fill: "#fff" },
  ];

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={railRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative touch-none"
      >
        <svg
          viewBox={`0 0 ${TONES - 1} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-24 w-full rounded-t border border-line bg-surface-2 text-fg-bright"
        >
          {/* Quarters, so a handle can be put somewhere on purpose. */}
          {[0.25, 0.5, 0.75].map((n) => (
            <line
              key={n}
              x1={n * MAX_TONE}
              y1={0}
              x2={n * MAX_TONE}
              y2={100}
              stroke="currentColor"
              strokeWidth={0.4}
              opacity={0.15}
            />
          ))}
          {shape && <path d={shape} fill="currentColor" opacity={0.55} />}
          {/* What is about to be thrown away: everything outside the two ends
              comes out flat black or flat white. */}
          <g className="text-danger" fill="currentColor" opacity={0.16}>
            <rect
              x={0}
              y={0}
              width={Math.max(0, black * MAX_TONE)}
              height={100}
            />
            <rect
              x={white * MAX_TONE}
              y={0}
              width={Math.max(0, (1 - white) * MAX_TONE)}
              height={100}
            />
          </g>
          {[black, white].map((edge, i) => (
            <line
              key={i}
              x1={edge * MAX_TONE}
              y1={0}
              x2={edge * MAX_TONE}
              y2={100}
              stroke="currentColor"
              strokeWidth={0.8}
              opacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* What the axis means, in the only language it has. */}
        <div
          aria-hidden="true"
          className="h-2 border-x border-line"
          style={{ background: "linear-gradient(to right, #000, #fff)" }}
        />
        {/* The rail the handles stand on. It is the full width of the box above
            so a handle's place is the tone it is on, with no inset to correct
            for — which is the thing an `<input type=range>` cannot promise. */}
        <div className="relative h-5 rounded-b border-x border-b border-line bg-surface-3">
          {handles.map((handle) => (
            <div
              key={handle.id}
              role="slider"
              tabIndex={0}
              aria-label={labels[handle.id]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(handle.at * 100)}
              aria-valuetext={handle.value}
              onKeyDown={onKey(handle.id)}
              style={{ left: `${handle.at * 100}%` }}
              className="absolute top-0 -ml-2 h-4 w-4 cursor-ew-resize focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4">
                <polygon
                  points="8,1 15,14 1,14"
                  fill={handle.fill}
                  stroke="var(--color-fg-bright, currentColor)"
                  strokeWidth={1.2}
                />
              </svg>
            </div>
          ))}
        </div>
      </div>
      {/* The three numbers, under the handles that set them — the readouts the
          sliders used to wear in their own labels. */}
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-muted">
        {handles.map((handle) => (
          <span key={handle.id}>{labels[handle.id]}</span>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        {hint}
        {note ? ` ${note}` : ""}
      </p>
    </div>
  );
}

/** A tone fraction as the 8-bit level every histogram labels its ends with. */
function tone(value: number): string {
  return String(Math.round(value * MAX_TONE));
}
