// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the watercolour brush offers past its width and its dials: which of the
// two engines paints a wash, and how finely the heavier one resolves.
//
// Both are `ToolOption`s — app-wide rendering settings declared by the tool they
// are about (see `plugins/options.ts`) — so they are set in the panel the size
// button opens, with the brush in your hand and the page you are painting
// behind it. They used to be a section of Settings → Tools, which was the wrong
// room for them twice over: a wash engine is a property of the brush rather than
// of the app, and it is a choice nobody can make by reading about it.
//
// **The engines are shown, not described.** The difference between a stroke
// model and a pigment simulation is a picture — a rim that was stroked round a
// path against one that dried there — and a paragraph claiming "more realistic"
// is worth nothing beside two swatches of the same stroke. So each answer paints
// the same wash, on the same paper, in the ink the toolbar is holding, through
// the app's own renderer: what you press is what you get. It is the same call
// the surface picker makes about paper stocks.

import { renderDrawing } from "../render.ts";
import type { Drawing, Stroke } from "../types.ts";
import { mm } from "../units.ts";
import {
  MAX_WASH_DETAIL,
  MIN_WASH_DETAIL,
  DEFAULT_WASH_DETAIL,
  DEFAULT_WASH_ENGINE,
  WASH_ENGINES,
  type WashEngine,
} from "./wash.ts";
import type { ToolOption, ToolOptionAnswer } from "./types.ts";

/** The page a swatch is a picture of, in document pixels. Big enough that a
 *  real brush width and a real paper grain are both themselves at the size the
 *  swatch is actually drawn at. */
const SAMPLE = { width: 460, height: 292 };

/** The marks on every swatch.
 *
 *  Two washes that cross, and deliberately: one stroke shows the wet edge and
 *  the dried rim, and where the second crosses the first is where the two
 *  engines differ most — glazing on one, a wet mark meeting a drying one on the
 *  other. Painted on cold-pressed paper, the sheet most watercolour is painted
 *  on, so both have a tooth to granulate into. */
function sampleMarks(wash: string): Stroke[] {
  return [
    {
      id: "a",
      tool: "watercolor",
      color: wash,
      size: mm(7),
      shape: {
        kind: "path" as const,
        points: [
          { x: 50, y: 96 },
          { x: 170, y: 128 },
          { x: 300, y: 104 },
          { x: 410, y: 146 },
        ],
      },
    },
    {
      id: "b",
      tool: "watercolor",
      color: wash,
      size: mm(5.5),
      shape: {
        kind: "path" as const,
        points: [
          { x: 262, y: 40 },
          { x: 232, y: 140 },
          { x: 246, y: 246 },
        ],
      },
    },
  ];
}

/** One engine, as the marks it makes.
 *
 *  Through the app's own renderer, with this engine *named* rather than the one
 *  in force — the one place in the app that paints an engine it was told to
 *  instead of the one the setting says (see `RenderOptions`). The detail is
 *  deliberately **not** named: the heavy swatch is painted at whatever the
 *  slider beside it is set to, so turning that down is a change you watch
 *  happen. */
function swatch(engine: WashEngine) {
  return (
    ctx: CanvasRenderingContext2D,
    look: { color: string; background: string },
  ) => {
    const drawing: Drawing = {
      id: "wash-swatch",
      name: "",
      width: SAMPLE.width,
      height: SAMPLE.height,
      strokes: sampleMarks(look.color),
      ground: { stock: "cold" },
    };
    renderDrawing(ctx, drawing, null, {
      pageColor: look.background,
      defaultInk: look.color,
      washEngine: engine,
    });
  };
}

/** The two engines as answers, built from the descriptors themselves so the
 *  option cannot drift from the set (see `WASH_ENGINES`). */
const ENGINE_ANSWERS: readonly ToolOptionAnswer[] = WASH_ENGINES.map(
  (engine) => ({
    value: engine.id,
    nameKey: engine.nameKey,
    hintKey: engine.hintKey,
    preview: swatch(engine.id),
  }),
);

/** Which watercolour paints a wash. */
export const WASH_ENGINE_OPTION: ToolOption = {
  kind: "choice",
  id: "washEngine",
  nameKey: "options.washEngine",
  answers: ENGINE_ANSWERS,
  default: DEFAULT_WASH_ENGINE,
  sample: SAMPLE,
};

/** …and how much of the simulation's field to actually run.
 *
 *  Shown only while the simulation is the one painting, because it is a setting
 *  about *that engine's* arithmetic and the stroke model has no field to
 *  coarsen — a slider that moved nothing would be the panel telling a lie about
 *  itself.
 *
 *  A twentieth at a time: the cost goes as the square, so the useful part of the
 *  track is the bottom of it, and a step there has to be small enough to find
 *  the point where a page still paints fast enough. */
export const WASH_DETAIL_OPTION: ToolOption = {
  kind: "range",
  id: "washDetail",
  nameKey: "options.washDetail",
  hintKey: "options.washDetailHint",
  min: MIN_WASH_DETAIL,
  max: MAX_WASH_DETAIL,
  step: 0.05,
  default: DEFAULT_WASH_DETAIL,
  shownWhen: { option: "washEngine", is: "simulation" },
};

/** Both of them, in the order the panel lays them out: what is painting, and
 *  then how hard it is working. */
export const WASH_OPTIONS: readonly ToolOption[] = [
  WASH_ENGINE_OPTION,
  WASH_DETAIL_OPTION,
];
