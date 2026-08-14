// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape family: tools where the gesture is a drag from one anchor to
// another and the mark is recomputed from those two points on every move. They
// share the drag bookkeeping and differ only in what they paint.

import type { Point } from "../../types.ts";
import { extraDials } from "../dials.ts";
import {
  applyInk,
  isMeaningfulDrag,
  paintArrow,
  paintDoubleArrow,
  paintEllipse,
  paintPolygon,
  paintRect,
  paintRoundRect,
  paintSegment,
  polygonCorners,
  starCorners,
} from "../ink.ts";
import type { DraftStroke, ToolBehaviour, ToolContext } from "../types.ts";

/** The id of the group every shape tool is offered under — one toolbar button
 *  and one switch for the family (see `plugins/types.ts`). It names no stroke:
 *  a rectangle still records `rectangle`. */
export const SHAPES_GROUP_ID = "shapes";

/** Which geometry a shape tool records — `segment` for the two-point tools
 *  (line, arrow), `box` for the two-corner ones (rectangle, ellipse, and every
 *  polygon, which is inscribed in the box the drag describes). */
type ShapeKind = "segment" | "box";

type ShapePainter = (
  ctx2d: CanvasRenderingContext2D,
  stroke: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    size: number;
    filled: boolean;
  },
) => void;

/** Build a shape tool behaviour: a drag between two points, painted by
 *  `painter`, discarded when the drag never went anywhere. */
export function shapeBehaviour(
  kind: ShapeKind,
  painter: ShapePainter,
  options: { supportsFill?: boolean } = {},
): ToolBehaviour {
  const anchors = (draft: DraftStroke) =>
    draft.shape.kind === "segment" || draft.shape.kind === "box"
      ? { from: draft.shape.from, to: draft.shape.to }
      : null;

  const start = (p: Point, ctx: ToolContext): DraftStroke => {
    // Anything this tool was tuned with, past the two dials that have a stroke
    // field of their own (see `plugins/dials.ts`).
    const extra = extraDials(ctx.dials);
    return {
      tool: "",
      // Only a picked colour is recorded; otherwise the mark follows the
      // canvas theme's default ink (see `Stroke.color`).
      ...(ctx.color ? { color: ctx.color } : {}),
      size: ctx.size,
      // The opacity dial, when it has been turned down — a shape is ink like
      // any other mark.
      ...(ctx.dials.opacity !== undefined && ctx.dials.opacity < 1
        ? { opacity: ctx.dials.opacity }
        : {}),
      ...(extra ? { dials: extra } : {}),
      ...(options.supportsFill && ctx.filled ? { filled: true } : {}),
      shape: { kind, from: p, to: p },
    };
  };

  return {
    start,
    move: (draft, p) => {
      const a = anchors(draft);
      if (!a) return draft;
      return { ...draft, shape: { kind, from: a.from, to: p } };
    },
    // A press that never moved is a mis-tap, not a zero-size shape: drop it so
    // the page doesn't collect invisible marks (and the undo stack doesn't
    // collect empty steps).
    end: (draft) => {
      const a = anchors(draft);
      return a && isMeaningfulDrag(a.from, a.to) ? draft : null;
    },
    paint: (ctx2d, stroke) => {
      if (stroke.shape.kind !== kind) return;
      const { from, to } = stroke.shape as {
        from: { x: number; y: number };
        to: { x: number; y: number };
      };
      applyInk(ctx2d, stroke);
      painter(ctx2d, {
        from,
        to,
        size: stroke.size,
        filled: stroke.filled ?? false,
      });
    },
  };
}

// --- The two-point tools -----------------------------------------------------

export const lineBehaviour = shapeBehaviour("segment", (ctx2d, s) =>
  paintSegment(ctx2d, s.from, s.to),
);

export const arrowBehaviour = shapeBehaviour("segment", (ctx2d, s) =>
  paintArrow(ctx2d, s.from, s.to, s.size),
);

export const doubleArrowBehaviour = shapeBehaviour("segment", (ctx2d, s) =>
  paintDoubleArrow(ctx2d, s.from, s.to, s.size),
);

// --- The two-corner tools ----------------------------------------------------
//
// Every one of them is a `box`: the drag gives two corners and the shape is
// whatever fits inside them, stretched to fill. That is what lets a hexagon be a
// hexagon dragged square and a squashed one dragged wide, with no second field
// on the stroke and no new shape kind in the document — the geometry is a
// property of the *painter*, and the painter is chosen by the stroke's tool id
// exactly as it always was.

/** A shape drawn as a regular polygon inscribed in the drag box. */
function polygonBehaviour(sides: number, turn = 0): ToolBehaviour {
  return shapeBehaviour(
    "box",
    (ctx2d, s) =>
      paintPolygon(ctx2d, polygonCorners(s.from, s.to, sides, turn), s.filled),
    { supportsFill: true },
  );
}

export const rectangleBehaviour = shapeBehaviour(
  "box",
  (ctx2d, s) => paintRect(ctx2d, s.from, s.to, s.filled),
  { supportsFill: true },
);

export const roundRectBehaviour = shapeBehaviour(
  "box",
  (ctx2d, s) => paintRoundRect(ctx2d, s.from, s.to, s.filled),
  { supportsFill: true },
);

export const ellipseBehaviour = shapeBehaviour(
  "box",
  (ctx2d, s) => paintEllipse(ctx2d, s.from, s.to, s.filled),
  { supportsFill: true },
);

export const triangleBehaviour = polygonBehaviour(3);

/** A square on its corner — the flowchart decision, and the one polygon whose
 *  name is about how it is standing rather than how many sides it has. */
export const diamondBehaviour = polygonBehaviour(4);

export const pentagonBehaviour = polygonBehaviour(5);

/** Turned a twelfth so it stands on a flat edge rather than a point, which is
 *  the hexagon everyone draws. */
export const hexagonBehaviour = polygonBehaviour(6, 1 / 12);

export const starBehaviour = shapeBehaviour(
  "box",
  (ctx2d, s) => paintPolygon(ctx2d, starCorners(s.from, s.to), s.filled),
  { supportsFill: true },
);
