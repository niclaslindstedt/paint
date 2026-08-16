// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which pencil this build draws with.
//
// The same seam as `wash.ts`, one shelf along, and for the same reason: there
// are two engines, and they are two different answers to the same question
// rather than an old one and its replacement.
//
//   - **simple** (`graphite.ts`) — a *stroke* model. Specks of graphite
//     scattered along the path, each vetoed by a hashed paper height. Cheap,
//     exact, and the default.
//   - **simulation** (`leadSim.ts` over `leadField.ts`) — a *sheet* model.
//     There is a piece of paper with a tooth on it and a lead being pressed into
//     it, and the mark is whatever the paper kept. The broken line on rough
//     stock, the crowns of a canvas weave, the valleys filling in under a second
//     pass and the black a pencil cannot go past all come out of the arithmetic
//     rather than being drawn.
//
// **The difference between them is the sheet.** That is the whole point of the
// second one: the stroke model reads the page's own fine tooth and nothing else,
// so a pencil line looks the same on hot-pressed paper as on rough, and in life
// those are two different drawings. The simulation reads the ground the page is
// actually cut from — how coarse it is, how deep, and whether it dips at random
// like paper or goes over and under like cloth (see `ground.ts`) — and the
// grain dial on the page moves it, because turning the grain up is turning up
// the tooth the lead has to climb over.
//
// Both read the same grade dial and the same sheet, so moving the dial and then
// switching engine is a change of *rendering* and not of settings. That is the
// rule this seam is built to keep.
//
// **The engine is a view, like the canvas theme.** It is not recorded on a
// stroke and it is not recorded on a drawing: a mark drawn with one draws with
// whichever is in force when the page is next painted. Persisting it per stroke
// would mean switching the setting orphaned everything drawn before it, which is
// the one thing a rendering choice must never do.
//
// It is held here as one app-wide value rather than threaded through every
// caller, because *every surface that paints the same document has to agree*:
// the screen, the mark cache, the layer thumbnails, the page the colour dropper
// reads, and the exported PNG. `RenderOptions.leadEngine` overrides it where a
// caller genuinely wants a named engine — the pencil's own panel draws a sample
// of each, side by side.
//
// The setting belongs to the *tool*, and that is where it is set: the pencil
// declares it as its **option**, and the panel the size button opens renders it
// under the widths (see `plugins/leadOptions.ts` and `plugins/options.ts`).
// Picking an engine is something you do with the pencil in your hand.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import type { TKey } from "../i18n/index.ts";
import type { Point } from "../types.ts";
import { HB_LEAD, paintGraphite } from "./graphite.ts";
import {
  DEFAULT_LEAD_DETAIL,
  clampLeadDetail,
  paintSimulatedLead,
} from "./leadSim.ts";

/** How finely the simulation works a mark out, as a share of the field it would
 *  run at full detail — the second half of the choice this module holds, and
 *  the simulation's alone (the stroke model has no field to coarsen).
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

/** Which of the two is drawing. */
export type LeadEngine = "simple" | "simulation";

/** One engine as the pencil's own panel offers it. Named the way the stocks in
 *  `ground.ts` are, and for the same reason: the picker renders whatever is
 *  declared here rather than knowing either engine by name. */
export type LeadEngineDescriptor = {
  id: LeadEngine;
  nameKey: TKey;
  /** The one line under the name saying what this engine is for — including
   *  what it costs, which is the honest half of the choice. */
  hintKey: TKey;
};

/** Both of them, in the order the picker lays them out: the default first. */
export const LEAD_ENGINES: readonly LeadEngineDescriptor[] = [
  {
    id: "simple",
    nameKey: "options.leadSimple",
    hintKey: "options.leadSimpleHint",
  },
  {
    id: "simulation",
    nameKey: "options.leadSimulation",
    hintKey: "options.leadSimulationHint",
  },
];

/** The one a fresh install draws with. The simulation is opt-in: it is heavier,
 *  and a tool that is slow out of the box is a tool nobody keeps. */
export const DEFAULT_LEAD_ENGINE: LeadEngine = "simple";

/** …and whether a value off a persisted blob is one of them. */
export function isLeadEngine(value: unknown): value is LeadEngine {
  return LEAD_ENGINES.some((engine) => engine.id === value);
}

let inForce: LeadEngine = DEFAULT_LEAD_ENGINE;
let inForceDetail: number = DEFAULT_LEAD_DETAIL;

/** The engine every repaint uses unless it was told otherwise. */
export function leadEngine(): LeadEngine {
  return inForce;
}

/** Put an engine in force. Called once from the app when the setting loads or
 *  changes; nothing else should touch it. */
export function setLeadEngine(engine: LeadEngine): void {
  inForce = engine;
}

/** How finely the simulation works, for a repaint that was told nothing. */
export function leadDetail(): number {
  return inForceDetail;
}

/** Put a detail in force — the other half of `setLeadEngine`, set from the same
 *  place at the same time. */
export function setLeadDetail(detail: number): void {
  inForceDetail = clampLeadDetail(detail);
}

/** Draw a pencil mark with the engine named.
 *
 *  The simulation answers whether it actually ran, and a `false` falls through
 *  to the stroke model here rather than at the call site — which is what makes
 *  "it must fall back rather than fail" a property of the seam instead of a
 *  thing every caller has to remember. A browser with no canvas to work on, a
 *  view pulled back until the mark is a hairline, a lead finer than a couple of
 *  cells: all of them draw, and all of them draw the mark this app has always
 *  drawn.
 *
 *  `detail` is the simulation's alone, which is why it is last but one: it says
 *  how finely to work the field out (see `MIN_LEAD_DETAIL`), and turning it down
 *  is one more way a mark falls through — a lead only a couple of coarse cells
 *  across has no tooth left to find. */
export function paintGraphiteWith(
  engine: LeadEngine,
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  grade = HB_LEAD,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  detail = DEFAULT_LEAD_DETAIL,
  clip?: Rect,
): void {
  if (engine === "simulation") {
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
    );
    if (drawn) return;
  }
  paintGraphite(ctx, points, size, scale, grade);
}
