// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The gesture in flight, repainted only where it has just been.
//
// `cache.ts` made the *committed* marks cheap: a hundred strokes already on the
// page are the same hundred strokes a millisecond later, so they are kept as
// pixels and blitted. What it left alone is the one stroke that genuinely does
// change every frame — the one under your finger — and that stroke was being
// painted from its first point, every frame, for as long as the gesture lasted.
//
// For a pencil that is nothing. For a textured painter it is the whole cost of
// the app. An airbrush stroke is a cone stamped every fifth of its radius, so a
// mark that has crossed the screen a couple of times is a few hundred
// full-radius gradient fills — and repainting all of them per frame makes a
// gesture cost the *square* of its own length: the mark you have drawn so far
// is redrawn once per new sample of it. On a phone that is a stroke that starts
// crisp and is crawling ten seconds later, which is exactly what it felt like.
//
// The fix is the observation the cache is built on, applied one level in.
// Almost none of the gesture changed either. Two points arrived; everything
// behind them is the same mark it was last frame, and it is *already on the
// screen* — a canvas keeps its pixels. So a frame of a growing gesture is:
//
//   1. the box the new points can possibly have painted in — where they went,
//      grown by how far the tool's nib reaches past its path (`runBounds`);
//   2. clear that box, blit the committed marks back into it, and repaint the
//      whole stroke **clipped to it**;
//   3. leave every other pixel on the screen exactly as it was.
//
// Step 2 repaints the whole stroke rather than only its new tail, and that is
// deliberate: it keeps the frame a pure function of the document, so the patch
// is pixel-for-pixel what a full repaint would have put there. A stroke that
// doubles back over itself lands the same ink either way, which appending the
// tail over the pixels already there would not. The painters are handed the
// same box (`PaintDetail.clip`) so the stamps outside it cost nothing but a
// bounds test, and what is left is the work the new ink actually needs.
//
// **What has to be true for this to be safe** is one thing, and it is the whole
// of the risk: the new points must not change any pixel outside the box. That
// is a property of the painter, not of the canvas — a brush whose run-out is
// measured back from the end of the stroke, or a crayon whose grain coarsens as
// the mark grows, repaints *differently all the way back to its first point*
// when you add a sample. So it is declared on the tool (`PaintPlugin.grows`)
// and it is opt-in: a tool that says nothing gets the full repaint it always
// had. Two more are ruled out here whatever they declare — a mark that rubs out
// and a mark that soaks into the sheet both read the pixels they land on, and
// neither can be reasoned about a patch at a time.
//
// This module is the *decision*: what a frame can get away with, and what it
// has to remember to decide the next one. The painting is `frame.ts`, which is
// where all the painting is.

import { sameFrame, type CacheSpec } from "./cache.ts";
import { runBounds, type Rect } from "./geometry.ts";
import { groundProfile } from "./ground.ts";
import type { CutAim } from "./cutAim.ts";
import { pluginById } from "./plugins/registry.ts";
import { strokeStains } from "./render.ts";
import type { Selection } from "./selection.ts";
import type { Stroke } from "./types.ts";

/** What the frame before this one painted, and what it painted it from. */
type Painted = {
  spec: CacheSpec;
  /** The gesture as it was then, or `null` when there wasn't one. */
  draft: Stroke | null;
  /** The selection as it was then. It is chrome rather than a mark, but a patch
   *  frame redraws its outline inside its own box, so a change to it is a change
   *  to the picture like any other. Compared by identity: the screen holds one
   *  selection object for as long as the window doesn't move. */
  outline: Selection | null;
  /** The cut being aimed through that selection, or `null`. Chrome too, and
   *  drawn inside the patch box the same way the outline is — so a band that
   *  has widened under a slider is a change to the picture, and compared by
   *  identity for the reason the outline is. */
  aiming: CutAim | null;
};

/** What one canvas remembers between frames, so a gesture can be painted
 *  a patch at a time. Held by the canvas for the life of the element and
 *  emptied by any frame that isn't a patch. */
export type Trail = { painted: Painted | null };

export function createTrail(): Trail {
  return { painted: null };
}

/** Record what this frame painted — every frame, patch or not. A frame that
 *  isn't remembered is one the next frame has to repaint in full. */
export function trailPainted(
  trail: Trail,
  spec: CacheSpec,
  draft: Stroke | null,
  outline: Selection | null,
  aiming: CutAim | null,
): void {
  trail.painted = { spec, draft, outline, aiming };
}

/** The patch of page this frame differs from the one before it in, when the
 *  only thing that changed is the gesture in flight getting longer — in
 *  document coordinates.
 *
 *  `null` means "paint the whole window", which is the answer for every frame
 *  that isn't a growing gesture: the first frame of one, a pan, a zoom, a
 *  landed stroke, an undo, a tool that doesn't `grow`. It is the conservative
 *  answer everywhere, and every test that isn't sure returns it. */
export function trailAhead(
  trail: Trail,
  spec: CacheSpec,
  draft: Stroke | null,
  outline: Selection | null,
  aiming: CutAim | null,
): Rect | null {
  const was = trail.painted;
  if (!was || !draft || !was.draft) return null;
  // The committed picture, pixel for pixel. Compared by the drawing's identity
  // rather than mark by mark: the store mints a new document for every edit, so
  // the same object is the same marks — and the *rest* of what a frame depends
  // on is exactly what the mark cache already knows how to compare.
  if (was.spec.drawing !== spec.drawing) return null;
  if (!sameFrame(was.spec, spec)) return null;
  if (was.outline !== outline) return null;
  if (was.aiming !== aiming) return null;

  const plugin = pluginById(draft.tool);
  if (!plugin?.grows) return null;
  // A rubbing out is a hole in the pixels underneath, and a wet mark mixes with
  // them. Both are functions of what they land on rather than of the stroke
  // alone, and the frame has a whole second act for each of them (see
  // `underlay` and `relayFixed`) which a patch cannot stand in for.
  if (plugin.erases) return null;
  if (strokeStains(draft, groundProfile(spec.options.ground))) return null;

  const from = grownFrom(was.draft, draft);
  if (from === null) return null;
  const points = draft.shape.kind === "path" ? draft.shape.points : null;
  if (!points) return null;
  return runBounds(draft, points.slice(from));
}

/** How many points back from the end of the painted path a new sample can still
 *  move the ink.
 *
 *  One is not enough, and the tool that proves it is the plain pencil. A
 *  freehand line is smoothed by curving through the *midpoints* of its samples
 *  (see `paintPath`), with the last sample joined to squarely — so appending a
 *  point re-shapes the run from the midpoint *before* the old end, which is up
 *  to a whole sample back. Two covers it with a sample to spare, and it is two
 *  samples of slack on a box that is hundreds of pixels wide.
 *
 *  Measured rather than reasoned: repainting from one point back and comparing
 *  the screen against a full repaint left a fifth of a percent of the canvas
 *  differing, by up to 238 of 255 — a visible sliver of stale line at every
 *  join. From two it is a thousand channels differing by four, which is the
 *  rasteriser's own antialiasing noise. */
const JOIN_SLACK = 2;

/** Where `now` starts saying something `before` didn't: a couple of points back
 *  from the end of what was painted, so the run covers the join as well as the
 *  new samples. `null` when this is not the same gesture grown — a different
 *  tool, ink that changed under it, or a path that was rewritten rather than
 *  appended to.
 *
 *  The points are compared **by identity**. A sample is an immutable
 *  `{x, y}` the gesture keeps for ever (`freehandBehaviour.move` appends to a
 *  copy of the array and leaves the points alone), so the same object is the
 *  same sample, and anything that rebuilt the path fails the test — which is
 *  the answer that costs a repaint rather than a stale screen. */
function grownFrom(before: Stroke, now: Stroke): number | null {
  if (
    before.tool !== now.tool ||
    before.size !== now.size ||
    before.color !== now.color ||
    before.opacity !== now.opacity ||
    before.hardness !== now.hardness ||
    before.filled !== now.filled ||
    before.layer !== now.layer ||
    // The dials ride along on the draft untouched for the whole gesture, so
    // identity is the honest comparison and a fresh object is a changed mark.
    before.dials !== now.dials
  ) {
    return null;
  }
  if (before.shape.kind !== "path" || now.shape.kind !== "path") return null;
  const was = before.shape.points;
  const has = now.shape.points;
  if (has.length < was.length) return null;
  for (let i = 0; i < was.length; i++) {
    if (was[i] !== has[i]) return null;
  }
  // Back from the end of what was painted rather than from the first new point:
  // the mark over the join is drawn by both, and the smoothing reaches further
  // back than the join (see `JOIN_SLACK`).
  return Math.max(0, was.length - JOIN_SLACK);
}
