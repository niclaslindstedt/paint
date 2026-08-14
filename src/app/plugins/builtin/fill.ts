// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paint bucket: tap an empty space and it takes the colour.
//
// A bucket fill is a raster idea and this document has no raster, so the tool
// borrows one for the length of a tap: it asks the canvas probe what area lies
// under the press (`ToolContext.probe`), and files the *outline* that comes
// back as an ordinary vector stroke. From the moment the gesture ends there are
// no pixels left in it — the fill zooms, undoes, exports and syncs exactly like
// a rectangle does. The flood and the tracing live in `flood.ts`; the
// rasterising in `probe.ts`.
//
// It is a press tool, not a drag tool: the area is decided by where the press
// landed, and dragging is a way of changing your mind about which one, so the
// draft is simply recomputed from wherever the pointer is now.

import { paintRegion } from "../brushes.ts";
import { extraDials, strokeDial } from "../dials.ts";
import { applyInk } from "../ink.ts";
import {
  FULL_DETAIL,
  type DraftStroke,
  type ToolBehaviour,
  type ToolContext,
} from "../types.ts";
import type { Point } from "../../types.ts";

/** The smallest area worth filing. A tap on a hairline gap traces a sliver
 *  nobody asked for; below three outline points there is nothing there at all. */
function meaningful(contours: Point[][]): boolean {
  return contours.some((loop) => loop.length >= 3);
}

function draftFor(p: Point, ctx: ToolContext): DraftStroke | null {
  const contours = ctx.probe?.regionAt(p);
  if (!contours || !meaningful(contours)) return null;
  const extra = extraDials(ctx.dials);
  return {
    tool: "",
    // As everywhere else, only a *picked* colour is recorded — an unpicked fill
    // follows the page's default ink when the canvas theme flips.
    ...(ctx.color ? { color: ctx.color } : {}),
    // A fill has no nib, but a stroke carries a width and the renderer's
    // fallback painter would read it, so it records the toolbar's.
    size: ctx.size,
    // Its dials: a wash you can see the marks through, and an edge that fades
    // out instead of stopping (see `plugins/dials.ts`).
    ...(ctx.dials.opacity !== undefined && ctx.dials.opacity < 1
      ? { opacity: ctx.dials.opacity }
      : {}),
    ...(extra ? { dials: extra } : {}),
    shape: { kind: "region", contours },
  };
}

export const fillBehaviour: ToolBehaviour = {
  // No probe (a headless caller, or a browser that refused the pixels) means no
  // fill rather than a wrong one: `start` returning null is the contract's own
  // "ignore this press".
  start: (p, ctx) => draftFor(p, ctx),
  // Dragging re-aims the bucket rather than extending anything, so the preview
  // follows the pointer into whichever area it is over now.
  move: (draft, p, ctx) => draftFor(p, ctx) ?? draft,
  paint: (ctx2d, stroke, detail = FULL_DETAIL) => {
    if (stroke.shape.kind !== "region") return;
    applyInk(ctx2d, stroke);
    // A feathered edge is the one thing here the zoom can price out: past a
    // certain distance the fade is thinner than a pixel (see `paintRegion`).
    paintRegion(
      ctx2d,
      stroke.shape.contours,
      strokeDial(stroke, "feather", 0),
      detail.scale,
    );
  },
};
