// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which watercolour this build paints with.
//
// There are two engines, and they are two different answers to the same
// question rather than an old one and its replacement:
//
//   - **simple** (`aquarelle.ts`) — a *stroke* model. A wash is a closed path
//     with a dried rim, a gathered inner ribbon and a mottle hashed off the
//     page. Cheap, exact, and the default.
//   - **simulation** (`washSim.ts` over `washField.ts`) — a *field* model.
//     There is water on a sheet of paper and pigment in the water, and the mark
//     is whatever is left when it dries. Blooms, backruns and the dark rim come
//     out of the arithmetic rather than being drawn; it costs a good deal more.
//
// Both read the same three dials — `water`, `pigment`, `granulation` — and the
// same sheet, so moving a slider and then switching engine is a change of
// *rendering* and not of settings. That is the rule the whole seam is built to
// keep.
//
// **The engine is a view, like the canvas theme.** It is not recorded on a
// stroke and it is not recorded on a drawing: a mark drawn with one paints with
// whichever is in force when the page is next painted. Persisting it per stroke
// would mean switching the setting orphaned everything drawn before it, which is
// the one thing a rendering choice must never do. (If a document should ever
// pin its own engine, that is a `Drawing` field and a migration note — a
// deliberate decision, not this one by accident.)
//
// It is held here as one app-wide value rather than threaded through every
// caller, because *every surface that paints the same document has to agree*:
// the screen, the mark cache, the layer thumbnails, the page the colour dropper
// reads, and the exported PNG. A setting passed from hand to hand is a setting
// one of those forgets to pass, and a dropper sampling a page painted by the
// other engine is a bug nobody would find. `RenderOptions.washEngine` overrides
// it where a caller genuinely wants a named engine — the brush's own panel
// paints a sample of each, side by side.
//
// Both of the settings here belong to the *tool*, and that is where they are
// set: the watercolour plugin declares them as its **options**, and the panel
// the size button opens renders them under the widths (see
// `plugins/washOptions.ts` and `plugins/options.ts`). Picking an engine is
// something you do with the brush in your hand, not on a page in a dialog.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { TKey } from "../i18n/index.ts";
import type { Point } from "../types.ts";
import { paintWash } from "./aquarelle.ts";
import {
  DEFAULT_WASH_DETAIL,
  clampWashDetail,
  paintSimulatedWash,
} from "./washSim.ts";

/** Which of the two is painting. */
export type WashEngine = "simple" | "simulation";

/** How finely the simulation resolves a wash, as a share of the field it would
 *  run at full detail — the second half of the choice this module holds, and
 *  the simulation's alone (the stroke model has no field to coarsen).
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

/** One engine as the brush's own panel offers it. Named the way the stocks in
 *  `ground.ts` are, and for the same reason: the picker renders whatever is
 *  declared here rather than knowing either engine by name (see
 *  `plugins/washOptions.ts`, which wraps these as the tool's options). */
export type WashEngineDescriptor = {
  id: WashEngine;
  nameKey: TKey;
  /** The one line under the name saying what this engine is for — including
   *  what it costs, which is the honest half of the choice. */
  hintKey: TKey;
};

/** Both of them, in the order the picker lays them out: the default first. */
export const WASH_ENGINES: readonly WashEngineDescriptor[] = [
  {
    id: "simple",
    nameKey: "options.washSimple",
    hintKey: "options.washSimpleHint",
  },
  {
    id: "simulation",
    nameKey: "options.washSimulation",
    hintKey: "options.washSimulationHint",
  },
];

/** The one a fresh install paints with. The simulation is opt-in: it is
 *  heavier, and a tool that is slow out of the box is a tool nobody keeps. */
export const DEFAULT_WASH_ENGINE: WashEngine = "simple";

/** …and whether a value off a persisted blob is one of them. */
export function isWashEngine(value: unknown): value is WashEngine {
  return WASH_ENGINES.some((engine) => engine.id === value);
}

let inForce: WashEngine = DEFAULT_WASH_ENGINE;
let inForceDetail: number = DEFAULT_WASH_DETAIL;

/** The engine every repaint uses unless it was told otherwise. */
export function washEngine(): WashEngine {
  return inForce;
}

/** Put an engine in force. Called once from the app when the setting loads or
 *  changes; nothing else should touch it. */
export function setWashEngine(engine: WashEngine): void {
  inForce = engine;
}

/** How finely the simulation resolves, for a repaint that was told nothing. */
export function washDetail(): number {
  return inForceDetail;
}

/** Put a detail in force — the other half of `setWashEngine`, set from the same
 *  place at the same time. */
export function setWashDetail(detail: number): void {
  inForceDetail = clampWashDetail(detail);
}

/** Paint a wash with the engine named.
 *
 *  The simulation answers whether it actually ran, and a `false` falls through
 *  to the simple engine here rather than at the call site — which is what makes
 *  "it must fall back rather than fail" a property of the seam instead of a
 *  thing every caller has to remember. A browser with no canvas to simulate on,
 *  a mark too small to be worth a field, a page-wide sweep whose cells would be
 *  wider than the brush: all of them paint, and all of them paint the same mark
 *  this app has always painted.
 *
 *  `detail` is the simulation's alone, which is why it is last: it says how much
 *  of the field to run (see `MIN_WASH_DETAIL`), and turning it down is one more
 *  way a mark falls through — a head only a couple of coarse cells across has
 *  nothing left for a field to resolve. */
export function paintWashWith(
  engine: WashEngine,
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  water = 1,
  pigment = 1,
  granulation = 0.6,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  detail = DEFAULT_WASH_DETAIL,
): void {
  if (engine === "simulation") {
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
      detail,
    );
    if (painted) return;
  }
  paintWash(ctx, points, size, scale, water, pigment, granulation, ground);
}
