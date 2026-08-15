// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The colour dropper: the second tool that draws nothing.
//
// Press anywhere and the colour under the pointer becomes the ink — the way you
// pick a shade back up half an hour after mixing it, without hunting for it in
// the palette. It reads the *painted* page rather than the document, so it can
// sample a colour that only exists where two translucent passes overlap.
//
// Like the hand, it is a plugin whose behaviour lays nothing down: the toolbar,
// the shortcut table and Settings → Tools pick it up with no special case, and
// what makes the press sample instead of draw is the `picksColor` flag on its
// descriptor, which `PaintCanvas` reads. Nothing branches on its id.
//
// What it *does* answer is `pick` — what a press reads off the page — and that
// is where its one setting lives. A dropper set to sample more than a point
// averages the disc under it (`SAMPLE`), which is the difference between
// sampling an airbrushed passage and sampling one speck of the spray that made
// it. The radius is read off the tool's own dials here rather than in the
// canvas, because a dial's name belongs to the plugin that declared it.

import type { ToolBehaviour, ToolContext } from "../types.ts";
import type { Point } from "../../types.ts";

/** How wide a sample this press takes, in document pixels. Absent means the
 *  point — and it has to agree with `SAMPLE.default`, which is what an untuned
 *  dropper resolves to. */
function sampleRadius(ctx: ToolContext): number {
  const at = ctx.dials.sample;
  return typeof at === "number" && Number.isFinite(at) && at > 0 ? at : 0;
}

/** Begins no stroke, paints nothing — a sampled colour is a change to the
 *  toolbar, not a mark on the page, so nothing must reach the document or the
 *  undo history. */
export const dropperBehaviour: ToolBehaviour = {
  start: () => null,
  move: (draft) => draft,
  paint: () => {},
  // No probe (a headless caller, or a browser that refused the pixels) means no
  // colour rather than a wrong one, and the ink is left as it was.
  pick: (p: Point, ctx) => ctx.probe?.colorAt(p, sampleRadius(ctx)) ?? null,
};
