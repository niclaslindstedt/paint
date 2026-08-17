// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How this build draws a pencil mark.
//
// The same seam as `wash.ts`, one shelf along, and with the same shape: there
// is one pencil here — the **graphite simulation** (`leadSim.ts` over
// `leadField.ts`), a *sheet* model. There is a piece of paper with a tooth on
// it and a lead being pressed into it, and the mark is whatever the paper kept.
// The broken line on rough stock, the crowns of a canvas weave, the valleys
// filling in under a second pass and the black a pencil cannot go past all come
// out of the arithmetic rather than being drawn.
//
// **The sheet is the whole point.** There used to be a second pencil offered
// beside it — a cheap *stroke* model that scattered specks along the path,
// vetoed by a hashed paper height — and its trouble was that it read the page's
// own fine tooth and nothing else, so a pencil line looked the same on
// hot-pressed paper as on rough, and in life those are two different drawings.
// The simulation reads the ground the page is actually cut from — how coarse it
// is, how deep, and whether it dips at random like paper or goes over and under
// like cloth (see `ground.ts`) — and the grain dial on the page moves it,
// because turning the grain up is turning up the tooth the lead has to climb
// over. `graphite.ts` survives underneath as the **fallback**, which is a
// different thing from a choice — see `paintGraphiteOn`.
//
// What is left of the choice is the one number that was always the honest half
// of it: how finely the field is worked out. It is held here as one app-wide
// value rather than threaded through every caller, because *every surface that
// paints the same document has to agree*: the screen, the mark cache, the layer
// thumbnails, the page the colour dropper reads, and the exported PNG.
//
// **It is a view, like the canvas theme.** It is not recorded on a stroke and
// it is not recorded on a drawing: a mark drawn at one detail redraws at
// whichever is in force when the page is next painted. Persisting it per stroke
// would mean moving the slider orphaned everything drawn before it, which is the
// one thing a rendering choice must never do.
//
// The setting belongs to the *tool*, and that is where it is set: the pencil
// declares it as its **option**, and the panel the size button opens renders it
// under the widths (see `plugins/leadOptions.ts` and `plugins/options.ts`).

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import type { Point } from "../types.ts";
import { HB_LEAD, paintGraphite } from "./graphite.ts";
import {
  DEFAULT_LEAD_DETAIL,
  clampLeadDetail,
  paintSimulatedLead,
} from "./leadSim.ts";

/** How finely the simulation works a mark out, as a share of the field it would
 *  run at full detail — the one setting this module holds.
 *
 *  Declared where the grid it coarsens is (`leadSim.ts`) and re-exported here,
 *  because this is the module everything outside `plugins/` reads the pencil
 *  settings from. */
export {
  MIN_LEAD_DETAIL,
  MAX_LEAD_DETAIL,
  DEFAULT_LEAD_DETAIL,
  clampLeadDetail,
} from "./leadSim.ts";

let inForceDetail: number = DEFAULT_LEAD_DETAIL;

/** How finely the simulation works, for a repaint that was told nothing. */
export function leadDetail(): number {
  return inForceDetail;
}

/** Put a detail in force. Called from the app when the setting loads or
 *  changes; nothing else should touch it. */
export function setLeadDetail(detail: number): void {
  inForceDetail = clampLeadDetail(detail);
}

/** Draw a pencil mark.
 *
 *  The simulation answers whether it actually ran, and a `false` falls through
 *  to the old stroke model here rather than at the call site — which is what
 *  makes "it must fall back rather than fail" a property of the seam instead of
 *  a thing every caller has to remember. A browser with no canvas to work on, a
 *  view pulled back until the mark is a hairline, a lead finer than a couple of
 *  cells: all of them draw, and all of them draw the mark this app has always
 *  drawn.
 *
 *  **That fallback is not the second engine coming back.** Nobody chooses it,
 *  nothing names it, and there is no state in which it is what a pencil *is*:
 *  it is what a lead too fine to find a tooth looks like, and a lead that fine
 *  would have drawn the same line on any sheet anyway.
 *
 *  `detail` is the simulation's alone, which is why it is last but one: it says
 *  how finely to work the field out (see `MIN_LEAD_DETAIL`), and turning it down
 *  is one more way a mark falls through — a lead only a couple of coarse cells
 *  across has no tooth left to find. */
export function paintGraphiteOn(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  grade = HB_LEAD,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  detail = DEFAULT_LEAD_DETAIL,
  clip?: Rect,
  live = false,
): void {
  const drawn = paintSimulatedLead(
    ctx,
    points,
    size,
    scale,
    grade,
    ground,
    color,
    detail,
    clip,
    live,
  );
  if (drawn) return;
  paintGraphite(ctx, points, size, scale, grade);
}
