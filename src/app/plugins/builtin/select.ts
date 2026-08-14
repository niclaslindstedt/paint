// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The selection tool — the drag that chooses marks instead of making one.
//
// It is deliberately an *ordinary* two-corner gesture: `start` / `move` / `end`
// build the same `box` draft a rectangle does, and the painter below draws it as
// a marquee. That is the whole trick — the drag pipeline, the abandon-on-pinch
// rule, the edge-swipe hold and the frame coalescing are the ones every tool
// already goes through, and this tool inherits them by being one.
//
// What is different is where the box *lands*. The descriptor carries `selects`,
// and the canvas reads that flag to hand the finished box to the screen as a
// selection rather than filing it as a stroke — the same shape `entersText` and
// `picksColor` take. Nothing in the canvas, the store or the renderer knows what
// a selection tool is called, and no stroke ever carries this plugin's id.
//
// What you can then do with the marks is the screen's business (see
// `selection.ts` and `CanvasScreen.tsx`): move them with the hand, and copy, cut
// or delete them from the keyboard or the menu a right-click or a long press
// opens.

import type { Point } from "../../types.ts";
import { normalizeBox } from "../ink.ts";
import type { DraftStroke, ToolBehaviour } from "../types.ts";

/** The plugin id the selection tool registers under. It is never persisted on a
 *  stroke — the tool commits nothing — but it is the id the toolbar and the
 *  settings blob hold, so it is fixed all the same. */
export const SELECT_TOOL_ID = "select";

/** How long a dashed marquee's dashes are, in **device** pixels. Divided by the
 *  render scale before it reaches the context, so the ants stay the same size on
 *  screen at any zoom — a dash measured in document pixels disappears when you
 *  pull back and turns into a picket fence when you zoom in. */
const DASH = 6;

export const selectBehaviour: ToolBehaviour = {
  start: (p: Point): DraftStroke => ({
    tool: SELECT_TOOL_ID,
    // A marquee is chrome rather than ink: it carries no colour (so nothing
    // resolves one against the page) and the width is the hairline the painter
    // below overrides anyway.
    size: 1,
    shape: { kind: "box", from: p, to: p },
  }),
  move: (draft, p) => {
    if (draft.shape.kind !== "box") return draft;
    return { ...draft, shape: { kind: "box", from: draft.shape.from, to: p } };
  },
  // Every gesture is kept, a stray tap included: a tap inside the marquee tool
  // means "select nothing", and dropping it would leave the last selection
  // hanging around after an obvious attempt to clear it.
  end: (draft) => draft,
  paint: (ctx2d, stroke, detail) => {
    if (stroke.shape.kind !== "box") return;
    const box = normalizeBox(stroke.shape.from, stroke.shape.to);
    const scale = detail?.scale ?? 1;
    paintMarquee(ctx2d, box, scale);
  },
};

/** Draw a marching-ants rectangle at `box`, in document coordinates.
 *
 *  Shared with the canvas, which outlines the *settled* selection with the same
 *  ants so the marquee you dragged and the selection you got read as one thing.
 *  Two passes — a pale solid line under a dark dashed one — so the outline is
 *  visible over a dark drawing and over a light one without knowing which it is
 *  on. */
export function paintMarquee(
  ctx2d: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  scale: number,
): void {
  const hairline = 1 / Math.max(scale, 0.0001);
  ctx2d.globalAlpha = 1;
  ctx2d.lineWidth = hairline;
  // `setLineDash` is the one 2D call outside the export recorder's vocabulary
  // (see `svg.ts`), and it can be: a marquee is chrome and never exports. Guard
  // it anyway so a painter called with a stand-in context still draws a box.
  const dashes =
    typeof ctx2d.setLineDash === "function"
      ? ctx2d.setLineDash.bind(ctx2d)
      : null;
  dashes?.([]);
  ctx2d.strokeStyle = "rgba(255,255,255,0.85)";
  ctx2d.strokeRect(box.x, box.y, box.width, box.height);
  dashes?.([DASH * hairline, DASH * hairline]);
  ctx2d.strokeStyle = "rgba(17,24,39,0.9)";
  ctx2d.strokeRect(box.x, box.y, box.width, box.height);
  dashes?.([]);
}
