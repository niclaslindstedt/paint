// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How this build draws a chalk mark.
//
// The pencil's seam (`lead.ts`), one shelf along: there is one chalk here —
// the **board simulation** (`chalkSim.ts` over `chalkField.ts`), a *sheet*
// model. There is a page with a tooth on it and a soft stick being scrubbed
// over it, and the mark is whatever the page kept. The sparkle that never
// closes into solid colour, the dust falling past the edge, the streaks down a
// broad drag and the second pass that bolds a letter all come out of the
// arithmetic rather than being drawn.
//
// The simulation answers whether it actually ran, and a `false` falls through
// **here** rather than at the call site — which is what makes "it must fall
// back rather than fail" a property of the seam instead of a thing every
// caller has to remember. The cases are the sizes at which chalk's character
// cannot show anyway: a browser with no canvas to work in, a view pulled back
// until the mark is a couple of pixels, a stick finer than a couple of cells.
// What catches them is a plain path at the weight the dust averages out to —
// paled by the hand the mark was drawn with, so a stroke that falls through
// on a zoom keeps the weight it was drawn at rather than snapping solid.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import type { Point } from "../types.ts";
import { paintPath } from "./ink.ts";
import { paintSimulatedChalk } from "./chalkSim.ts";

/** How dark the fallback line is, as a share of the ink, at an ordinary hand.
 *  The number a simulated mark's alpha averages out to mid-pressure — kept
 *  near the simulation's own so the switch is invisible (see `DENSITY` and
 *  `SHOW` in `chalkSim.ts`). */
const FALLBACK_WEIGHT = 0.62;

/** Draw a chalk mark.
 *
 *  `press` is how hard the hand bore down (see `PRESSURE` in
 *  `builtin/dials.ts`), and **both** engines take it: a mark that fell
 *  through because the view was pulled back has to keep the weight it was
 *  drawn with, or a zoom would re-press every line on the page. */
export function paintChalkOn(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  press = 1,
  ground: GroundProfile = SOLID_GROUND,
  color = "#f5f2ea",
  clip?: Rect,
  live = false,
): void {
  const drawn = paintSimulatedChalk(
    ctx,
    points,
    size,
    scale,
    press,
    ground,
    color,
    clip,
    live,
  );
  if (drawn) return;
  // The grain, the fray and the dust are all smaller than what is left of the
  // mark here, so what is left of chalk is a line at the weight the dust
  // averages out to.
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * Math.min(1, FALLBACK_WEIGHT * Math.max(0, press));
  paintPath(ctx, points, size);
  ctx.globalAlpha = alpha;
}
