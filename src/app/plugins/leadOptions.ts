// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the pencil offers past its width and its dials: which of the two engines
// draws a graphite mark.
//
// It is a `ToolOption` — an app-wide rendering setting declared by the tool it
// is about (see `plugins/options.ts`) — so it is set in the panel the size
// button opens, with the pencil in your hand and the page you are drawing on
// behind it. The same room the wash engine is set in, for the same reason: an
// engine is a property of the implement rather than of the app, and it is a
// choice nobody can make by reading about it.
//
// **The engines are shown, not described.** The difference between a scatter of
// specks and a lead pressed into a sheet is a picture — a line that breaks up
// where *this paper* is low, against one that breaks up because the painter
// hashed it that way — and a paragraph claiming "more realistic" is worth
// nothing beside two swatches of the same shading. So each answer draws the same
// marks, on the same paper, with the same lead, through the app's own renderer:
// what you press is what you get.
//
// The sample is on **cold-pressed** stock, and that is the whole demonstration.
// On the plain digital page the two engines draw very nearly the same line,
// because there is no tooth for the second one to find; it is the sheet that
// separates them, so the swatch is drawn on a sheet with one. Cold-pressed
// rather than rough, which separates them further still: a swatch is shown
// about a hundred pixels wide, and rough stock at that size is a scatter of
// specks that reads as a fault rather than as paper.

import { renderDrawing } from "../render.ts";
import type { Drawing, Stroke } from "../types.ts";
import { mm } from "../units.ts";
import { graphiteInk } from "./graphite.ts";
import {
  DEFAULT_LEAD_DETAIL,
  DEFAULT_LEAD_ENGINE,
  LEAD_ENGINES,
  MAX_LEAD_DETAIL,
  MIN_LEAD_DETAIL,
  type LeadEngine,
} from "./lead.ts";
import type { ToolOption, ToolOptionAnswer } from "./types.ts";

/** The page a swatch is a picture of, in document pixels. The same size the
 *  wash's is, so the two options in the app read as one control at two sizes of
 *  brush rather than as two designs. */
const SAMPLE = { width: 460, height: 292 };

/** A block of shading and a line, which between them are the whole of what a
 *  pencil does.
 *
 *  The block is a zigzag scribble laid the way a hand shades — over and back,
 *  crossing what it has already put down — because **filling in** is the thing
 *  the two engines disagree about most: the stroke model lays a second speckle
 *  over the first, and the simulation puts graphite where the sheet still has
 *  room for it and nowhere else. The line beside it is the other half: one pass
 *  with a soft lead, where all you see is which parts of the paper the lead
 *  reached.
 *
 *  A 2 mm clutch lead, which is what a block of tone is actually shaded with,
 *  and soft — a 4B. A hard lead on rough paper is a beautiful thing and it is
 *  almost invisible at swatch size. */
function sampleMarks(lead: string): Stroke[] {
  const shading: { x: number; y: number }[] = [];
  for (let i = 0; i <= 44; i++) {
    // Over and back across the block, dropping a row each pass. Close enough
    // together that the rows overlap two or three deep, because a swatch is
    // shown a hundred pixels wide and a *single* pass of anything reads as
    // "faint" there rather than as "this is what the paper did" — what has to
    // survive the shrinking is the tooth showing through a built-up tone.
    shading.push({ x: i % 2 === 0 ? 46 : 214, y: 54 + i * 4 });
  }
  return [
    {
      id: "a",
      tool: "graphite",
      color: lead,
      size: mm(2),
      dials: { grade: 1.5 },
      shape: { kind: "path" as const, points: shading },
    },
    {
      id: "b",
      tool: "graphite",
      color: lead,
      size: mm(2),
      dials: { grade: 1.5 },
      shape: {
        kind: "path" as const,
        points: [
          { x: 268, y: 232 },
          { x: 318, y: 96 },
          { x: 372, y: 210 },
          { x: 424, y: 74 },
        ],
      },
    },
  ];
}

/** One engine, as the marks it makes.
 *
 *  Through the app's own renderer, with this engine *named* rather than the one
 *  in force — the same override the wash's swatches use, and the only place in
 *  the app that draws an engine it was told to instead of the one the setting
 *  says (see `RenderOptions`). */
function swatch(engine: LeadEngine) {
  return (
    ctx: CanvasRenderingContext2D,
    look: { color: string; background: string },
  ) => {
    const drawing: Drawing = {
      id: "lead-swatch",
      name: "",
      width: SAMPLE.width,
      height: SAMPLE.height,
      // A pencil mixes its own grey off the page rather than taking the
      // toolbar's ink, so the swatch does too: what a swatch is for is showing
      // the mark this answer makes, and on a dark page that mark is the
      // silverpoint sheen rather than a dark scratch nobody can see.
      strokes: sampleMarks(graphiteInk(look.background, 1.5)),
      ground: { stock: "cold" },
    };
    // The detail is deliberately **not** named: the heavy swatch is drawn at
    // whatever the slider beside it is set to, so turning that down is a change
    // you watch happen.
    renderDrawing(ctx, drawing, null, {
      pageColor: look.background,
      defaultInk: look.color,
      leadEngine: engine,
    });
  };
}

/** The two engines as answers, built from the descriptors themselves so the
 *  option cannot drift from the set (see `LEAD_ENGINES`). */
const ENGINE_ANSWERS: readonly ToolOptionAnswer[] = LEAD_ENGINES.map(
  (engine) => ({
    value: engine.id,
    nameKey: engine.nameKey,
    hintKey: engine.hintKey,
    preview: swatch(engine.id),
  }),
);

/** Which pencil draws a graphite mark. */
export const LEAD_ENGINE_OPTION: ToolOption = {
  kind: "choice",
  id: "leadEngine",
  nameKey: "options.leadEngine",
  answers: ENGINE_ANSWERS,
  default: DEFAULT_LEAD_ENGINE,
  sample: SAMPLE,
};

/** …and how finely the simulation actually works a mark out.
 *
 *  Shown only while the simulation is the one drawing, because it is a setting
 *  about *that engine's* arithmetic and the stroke model has no field to
 *  coarsen — a slider that moved nothing would be the panel telling a lie about
 *  itself.
 *
 *  It matters more here than it does on the brush, and that is worth saying: a
 *  wash is a handful of marks on a page and a pencil drawing is a thousand, so
 *  the pencil is the tool where "how much of the machine do I want to pay for"
 *  is a question somebody actually has to answer. A twentieth at a time, because
 *  the cost goes as the square and the useful part of the track is the bottom of
 *  it. */
export const LEAD_DETAIL_OPTION: ToolOption = {
  kind: "range",
  id: "leadDetail",
  nameKey: "options.leadDetail",
  hintKey: "options.leadDetailHint",
  min: MIN_LEAD_DETAIL,
  max: MAX_LEAD_DETAIL,
  step: 0.05,
  default: DEFAULT_LEAD_DETAIL,
  shownWhen: { option: "leadEngine", is: "simulation" },
};

/** Both of them, in the order the panel lays them out: what is drawing, and then
 *  how hard it is working. */
export const LEAD_OPTIONS: readonly ToolOption[] = [
  LEAD_ENGINE_OPTION,
  LEAD_DETAIL_OPTION,
];
