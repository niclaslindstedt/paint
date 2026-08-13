// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape family: tools where the gesture is a drag from one anchor to
// another and the mark is recomputed from those two points on every move. They
// share the drag bookkeeping and differ only in what they paint.

import {
  applyInk,
  isMeaningfulDrag,
  paintArrow,
  paintEllipse,
  paintRect,
  paintSegment,
} from "../ink.ts";
import type { DraftStroke, ToolBehaviour, ToolContext } from "../types.ts";

/** Which geometry a shape tool records — `segment` for the two-point tools
 *  (line, arrow), `box` for the two-corner ones (rectangle, ellipse). */
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

  return {
    start: (p, ctx: ToolContext) => ({
      tool: "",
      // Only a picked colour is recorded; otherwise the mark follows the
      // canvas theme's default ink (see `Stroke.color`).
      ...(ctx.color ? { color: ctx.color } : {}),
      size: ctx.size,
      ...(options.supportsFill && ctx.filled ? { filled: true } : {}),
      shape: { kind, from: p, to: p },
    }),
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

export const lineBehaviour = shapeBehaviour("segment", (ctx2d, s) =>
  paintSegment(ctx2d, s.from, s.to),
);

export const arrowBehaviour = shapeBehaviour("segment", (ctx2d, s) =>
  paintArrow(ctx2d, s.from, s.to, s.size),
);

export const rectangleBehaviour = shapeBehaviour(
  "box",
  (ctx2d, s) => paintRect(ctx2d, s.from, s.to, s.filled),
  { supportsFill: true },
);

export const ellipseBehaviour = shapeBehaviour(
  "box",
  (ctx2d, s) => paintEllipse(ctx2d, s.from, s.to, s.filled),
  { supportsFill: true },
);
