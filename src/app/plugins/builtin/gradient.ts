// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The gradient: the paint bucket, poured.
//
// It is the bucket's gesture with the bucket's machinery — the same rasterised
// snapshot of the page (`ToolContext.probe`), the same flood, the same contour
// tracing (see `flood.ts`) — and it files the same `region` stroke. One thing
// differs, and it is the whole tool: the area is inked with a **ramp** rather
// than with one flat colour (see `Gradient`).
//
// So the two live behind one toolbar button, as a family (see `builtin/index.ts`
// and `ToolGroup`): press the bucket a second time and the gradient is there
// beside it. That is where a variant belongs — it is the same question ("fill
// this area") with a different answer about what to fill it with — and it costs
// the toolbar nothing.
//
// **The press decides the area; the drag decides the ramp.** Press inside the
// space you want filled, drag the way you want the colour to run, and let go:
// where you pressed is the first colour, where you let go is the last, and the
// run between them is the gradient. It is the gesture every other paint program
// uses for one, and it is why the bucket's "dragging re-aims it" rule is *not*
// inherited — re-flooding mid-drag would move the area out from under the ramp
// being drawn.
//
// **It pours its own inks, not the toolbar's.** Two colours (or three) are what
// a gradient *is*, and one of them could never be the ink button's — so the tool
// declares them as `swatches`, they live on its own panel, and the toolbar dims
// the ink while it is in hand (see `plugins/swatches.ts` and
// `plugins/controls.ts`). Nothing outside this file knows they are called "from"
// and "to".

import { paintRegion } from "../brushes.ts";
import { extraDials, strokeDial } from "../dials.ts";
import { applyInk } from "../ink.ts";
import { inkOf } from "../swatches.ts";
import {
  FULL_DETAIL,
  type ToolBehaviour,
  type ToolContext,
  type ToolSwatch,
} from "../types.ts";
import type { Gradient, Point } from "../../types.ts";

/** The id the gradient registers under. Persisted on every mark it pours, so it
 *  is fixed for good. */
export const GRADIENT_TOOL_ID = "gradient";

/** …and the id the family shares. It is the **bucket's own plugin id**, exactly
 *  as the selection family took the lone marquee's: a settings blob written
 *  before the gradient existed has `filler` in its enabled list and in its
 *  toolbar order, and this is what keeps that install's bucket button where it
 *  was — with the gradient now behind it — rather than switching the whole thing
 *  off. */
export const FILL_GROUP_ID = "filler";

/** The two ends of the ramp, and the optional colour in the middle of it.
 *
 *  Black to white is the default for the reason it is everywhere else: it is the
 *  gradient you can see on any page, and the two colours are both one tap away
 *  in the panel's palette when you want something else. The middle stop is off
 *  out of the box — a three-stop ramp is a deliberate thing, and a fill that
 *  quietly ran through a third colour nobody asked for would be a puzzle. */
export const GRADIENT_FROM: ToolSwatch = {
  id: "from",
  nameKey: "swatches.from",
  default: "#111827",
};

export const GRADIENT_MID: ToolSwatch = {
  id: "mid",
  nameKey: "swatches.mid",
  optional: true,
};

export const GRADIENT_TO: ToolSwatch = {
  id: "to",
  nameKey: "swatches.to",
  default: "#ffffff",
};

export const GRADIENT_SWATCHES = [
  GRADIENT_FROM,
  GRADIENT_MID,
  GRADIENT_TO,
] as const;

/** The smallest area worth filing — the bucket's rule, for the bucket's reason:
 *  a tap on a hairline gap traces a sliver nobody asked for. */
function meaningful(contours: Point[][]): boolean {
  return contours.some((loop) => loop.length >= 3);
}

/** The ramp a press with this tool pours: the tool's own inks, in order, each
 *  at its place along the run.
 *
 *  Recorded on the mark rather than resolved when it is painted, like every
 *  other ink in this app — re-colouring the tool tomorrow must not re-pour the
 *  fills you made today. */
function stopsFor(ctx: ToolContext): Gradient["stops"] {
  const from = inkOf(ctx, GRADIENT_FROM) ?? "#111827";
  const to = inkOf(ctx, GRADIENT_TO) ?? "#ffffff";
  const mid = inkOf(ctx, GRADIENT_MID);
  return mid
    ? [
        { at: 0, color: from },
        { at: 0.5, color: mid },
        { at: 1, color: to },
      ]
    : [
        { at: 0, color: from },
        { at: 1, color: to },
      ];
}

/** How short a drag counts as no drag at all, in document pixels. Below it the
 *  press is a tap, and a tap still has to pour something. */
const MIN_RUN = 2;

/** The ramp a gesture that never travelled should get: straight across the area
 *  it filled, left to right.
 *
 *  A tap is a perfectly reasonable way to use this tool — "fill that shape with
 *  a gradient, I don't much mind which way" — and the alternative to answering
 *  it is a fill that comes out empty, because a ramp with no length paints
 *  nothing at all. */
function acrossArea(contours: Point[][]): { from: Point; to: Point } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const loop of contours) {
    for (const p of loop) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX === Infinity || maxX - minX < MIN_RUN) return null;
  const middle = (minY + maxY) / 2;
  return { from: { x: minX, y: middle }, to: { x: maxX, y: middle } };
}

export const gradientBehaviour: ToolBehaviour = {
  // The press: flood where it landed, and start the ramp there. No probe (a
  // headless caller, or a browser that refused the pixels) means no fill rather
  // than a wrong one.
  start: (p, ctx) => {
    const contours = ctx.probe?.regionAt(p);
    if (!contours || !meaningful(contours)) return null;
    const extra = extraDials(ctx.dials);
    return {
      tool: "",
      // No `color`: this mark's ink is the ramp, and every colour in it is
      // recorded there. The renderer still resolves one against the page for
      // the painters that read it — the feathered edge is stroked with the ramp
      // regardless (see `paint`).
      size: ctx.size,
      ...(ctx.dials.opacity !== undefined && ctx.dials.opacity < 1
        ? { opacity: ctx.dials.opacity }
        : {}),
      ...(extra ? { dials: extra } : {}),
      shape: {
        kind: "region",
        contours,
        gradient: { from: p, to: p, stops: stopsFor(ctx) },
      },
    };
  },
  // The drag runs the ramp. The area is *not* re-flooded: it was decided by the
  // press, and this is the gesture that says which way the colour goes.
  move: (draft, p) => {
    const shape = draft.shape;
    if (shape.kind !== "region" || !shape.gradient) return draft;
    return {
      ...draft,
      shape: { ...shape, gradient: { ...shape.gradient, to: p } },
    };
  },
  // A gesture that never travelled still fills: the ramp is laid across the
  // area instead of along a drag that didn't happen.
  end: (draft) => {
    const shape = draft.shape;
    if (shape.kind !== "region" || !shape.gradient) return draft;
    const { from, to } = shape.gradient;
    if (Math.hypot(to.x - from.x, to.y - from.y) >= MIN_RUN) return draft;
    const across = acrossArea(shape.contours);
    if (!across) return null;
    return {
      ...draft,
      shape: { ...shape, gradient: { ...shape.gradient, ...across } },
    };
  },
  paint: (ctx2d, stroke, detail = FULL_DETAIL) => {
    if (stroke.shape.kind !== "region") return;
    applyInk(ctx2d, stroke);
    const ramp = rampFor(ctx2d, stroke.shape.gradient);
    if (ramp) {
      // Both, because the feathered edge is *stroked* along the outline before
      // the area is filled (see `paintRegion`) — a skirt left in the flat ink
      // would print as a coloured rim around a fill that never had one.
      ctx2d.fillStyle = ramp;
      ctx2d.strokeStyle = ramp;
    }
    paintRegion(
      ctx2d,
      stroke.shape.contours,
      strokeDial(stroke, "feather", 0),
      detail.scale,
    );
  },
};

/** The canvas paint one of these marks is filled with, or `null` for a mark
 *  carrying no ramp (a `region` from the bucket, or one whose ramp came back
 *  degenerate) — which then fills flat, as it always did.
 *
 *  A context that can't make a gradient at all is answered the same way: the
 *  SVG recorder can (see `svg.ts`), but a fake one in a test need not, and a
 *  flat fill beats a thrown export. */
function rampFor(
  ctx2d: CanvasRenderingContext2D,
  gradient: Gradient | undefined,
): CanvasGradient | null {
  if (!gradient || gradient.stops.length === 0) return null;
  const { from, to } = gradient;
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.01) return null;
  if (typeof ctx2d.createLinearGradient !== "function") return null;
  const ramp = ctx2d.createLinearGradient(from.x, from.y, to.x, to.y);
  for (const stop of gradient.stops) {
    ramp.addColorStop(Math.max(0, Math.min(1, stop.at)), stop.color);
  }
  return ramp;
}
