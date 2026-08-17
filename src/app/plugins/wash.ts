// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How this build paints a wash.
//
// There is one watercolour here — the **pigment simulation** (`washSim.ts` over
// `washField.ts`), a *field* model: there is water on a sheet of paper and
// pigment in the water, and the mark is whatever is left when it dries. Blooms,
// backruns and the dark rim come out of the arithmetic rather than being drawn.
//
// There used to be two, and the other one was offered beside it as a choice —
// a cheap *stroke* model where a wash was a closed path with a dried rim, a
// gathered inner ribbon and a mottle hashed off the page. It is gone as an
// answer anyone has to give: a build that ships two watercolours is a build
// asking the user to judge a rendering engine from a swatch, and the one worth
// painting with won. `aquarelle.ts` survives underneath as the **fallback**,
// which is a different thing from a choice — see `paintWashOn`.
//
// What is left of the choice is the one number that was always the honest half
// of it: how finely the field resolves. It is held here as one app-wide value
// rather than threaded through every caller, because *every surface that paints
// the same document has to agree*: the screen, the mark cache, the layer
// thumbnails, the page the colour dropper reads, and the exported PNG. A
// setting passed from hand to hand is a setting one of those forgets to pass.
//
// **It is a view, like the canvas theme.** It is not recorded on a stroke and
// it is not recorded on a drawing: a mark painted at one detail repaints at
// whichever is in force when the page is next painted. Persisting it per stroke
// would mean moving the slider orphaned everything painted before it, which is
// the one thing a rendering choice must never do.
//
// The setting belongs to the *tool*, and that is where it is set: the
// watercolour plugin declares it as its **option**, and the panel the size
// button opens renders it under the widths (see `plugins/washOptions.ts` and
// `plugins/options.ts`).

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Point } from "../types.ts";
import { paintWash } from "./aquarelle.ts";
import {
  DEFAULT_WASH_DETAIL,
  clampWashDetail,
  paintSimulatedWash,
} from "./washSim.ts";

/** How finely the simulation resolves a wash, as a share of the field it would
 *  run at full detail — the one setting this module holds.
 *
 *  Declared where the grid it coarsens is (`washSim.ts`) and re-exported here,
 *  because this is the module everything outside `plugins/` reads the wash
 *  settings from. */
export {
  MIN_WASH_DETAIL,
  MAX_WASH_DETAIL,
  DEFAULT_WASH_DETAIL,
  clampWashDetail,
} from "./washSim.ts";

let inForceDetail: number = DEFAULT_WASH_DETAIL;

/** How finely the simulation resolves, for a repaint that was told nothing. */
export function washDetail(): number {
  return inForceDetail;
}

/** Put a detail in force. Called from the app when the setting loads or
 *  changes; nothing else should touch it. */
export function setWashDetail(detail: number): void {
  inForceDetail = clampWashDetail(detail);
}

/** Paint a wash.
 *
 *  The simulation answers whether it actually ran, and a `false` falls through
 *  to the old stroke model here rather than at the call site — which is what
 *  makes "it must fall back rather than fail" a property of the seam instead of
 *  a thing every caller has to remember. A browser with no canvas to simulate
 *  on, a mark too small to be worth a field, a page-wide sweep whose cells would
 *  be wider than the brush: all of them paint, and all of them paint the same
 *  mark this app has always painted.
 *
 *  **That fallback is not the second engine coming back.** Nobody chooses it,
 *  nothing names it, and there is no state in which it is what a wash *is*: it
 *  is what a mark too small to dry looks like, which is a wash small enough that
 *  no rim, bloom or granulation would have survived the drying anyway.
 *
 *  `page` and `detail` are the simulation's alone, which is why they are last.
 *  The page is the colour the mark is landing on, and the simulation needs it
 *  for one decision: a wash is pigment stopping light, and on a dark sheet the
 *  page is the *absence* of ink so the arithmetic runs the other way round (see
 *  `washSim.ts`). It is the same reading of the same page `inkBlend` makes when
 *  it picks `multiply` or `screen` for the mark. `detail` says how much of the
 *  field to run (see `MIN_WASH_DETAIL`), and turning it down is one more way a
 *  mark falls through — a head only a couple of coarse cells across has nothing
 *  left for a field to resolve.
 *
 *  `live` says the mark is still under the hand, which the simulation reads as
 *  a smaller field: it is re-run from its first point on every pointer sample,
 *  so it is the one mark whose cost is paid per frame rather than per mark (see
 *  `BUDGET`). */
export function paintWashOn(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  water = 1,
  pigment = 1,
  granulation = 0.6,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  page = "#ffffff",
  detail = DEFAULT_WASH_DETAIL,
  live = false,
): void {
  const painted = paintSimulatedWash(
    ctx,
    points,
    size,
    scale,
    water,
    pigment,
    granulation,
    ground,
    color,
    page,
    detail,
    live,
  );
  if (painted) return;
  paintWash(ctx, points, size, scale, water, pigment, granulation, ground);
}
