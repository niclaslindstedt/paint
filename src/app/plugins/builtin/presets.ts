// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The presets the shipped tools come with — the "must haves" of each medium.
//
// The mechanism is in `plugins/presets.ts`; this is the *set*, kept beside the
// registrations that hand them out, the same way the dials and the gauges are.
//
// **What a preset is for.** A tool here is a width and up to four dials, and a
// beginner opening that panel has no way of knowing which combinations are a
// tool and which are noise. Nobody arrives at dry-brush by dragging the
// hardness down and the load off and seeing what happens; they
// arrive at it by being handed it and told what it is called. So every medium
// ships the handful of ways it is *actually held* — the ones a painter would
// name if you asked them what they use this brush for — and the whole set is
// three or four chips a beginner can work through in a minute.
//
// **What a preset is not.** It is not a width, and it is not a dial one notch
// along. Each one below differs from its neighbours in what the mark *is*: a
// wash that floods against a scumble that skips, a 2H construction line against
// a 6B shadow, a fill with a hard edge against one that fades out over eight
// millimetres. That is also why several tools have none at all — see the foot
// of this file.
//
// **Every set opens with the tool as it ships.** The first chip of each row is
// exactly the plugin's own `defaultSize` and dial defaults, so the panel opens
// with one lit: that is how the row explains itself without a word of help
// text, and it is one press back from a tool tuned into a corner. Changing a
// tool's defaults means changing its first preset to match (there is a test).
//
// Values are the dial ids the tool declares (see `./dials.ts`); anything a
// preset does not name resolves to that dial's own default, so these read as
// "the ways this preset differs from the tool as it comes".

import { mm } from "../../units.ts";
import type { BuiltinPreset } from "../types.ts";

/** The drawing pen. One dial (opacity) and a ladder of ISO widths, so what
 *  varies is the *job*: the line you ink an outline with, the one you write
 *  small with, and the pale one you rule a guide with and then draw over. */
export const PEN_PRESETS: readonly BuiltinPreset[] = [
  { id: "liner", nameKey: "presets.pencil.liner", size: mm(0.5) },
  { id: "fineliner", nameKey: "presets.pencil.fineliner", size: mm(0.25) },
  {
    id: "guide",
    nameKey: "presets.pencil.guide",
    size: mm(0.35),
    dials: { opacity: 0.3 },
  },
];

/** The rubber. Its one dial is how much a pass takes off, and that is exactly
 *  what separates the three ways anyone uses one: the block that clears a
 *  passage, the corner that takes a line out, and the kneaded eraser you *lift*
 *  a highlight back with rather than remove anything. */
export const ERASER_PRESETS: readonly BuiltinPreset[] = [
  { id: "block", nameKey: "presets.eraser.block", size: mm(10) },
  { id: "detail", nameKey: "presets.eraser.detail", size: mm(2) },
  {
    id: "kneaded",
    nameKey: "presets.eraser.kneaded",
    size: mm(20),
    dials: { opacity: 0.25 },
  },
];

/** The rubber. Its dial is how hard you are leaning on it, and a rubber
 *  is one of the few implements where the *size* and the weight really are the
 *  same decision: the three below are three different erasers off a stationer's
 *  shelf, not one at three settings.
 *
 *  The pocket rubber it ships as, worked at an ordinary weight; the putty
 *  kneaded eraser, which is broad and dabbed rather than scrubbed and takes a
 *  highlight back a shade at a time; and the little one on the end of a pencil,
 *  which is small, hard and leant on because there is nothing else to do with
 *  it. */
export const RUBBER_PRESETS: readonly BuiltinPreset[] = [
  { id: "pocket", nameKey: "presets.rubber.pocket", size: mm(5) },
  {
    id: "kneaded",
    nameKey: "presets.rubber.kneaded",
    size: mm(20),
    dials: { pressure: 0.5 },
  },
  {
    id: "top",
    nameKey: "presets.rubber.top",
    size: mm(2),
    dials: { pressure: 1.45 },
  },
];

/** The pencil, which is the tool this whole idea came from: a lead grade and a
 *  width together *are* a pencil, and a sketcher owns three or four of them
 *  rather than one with a slider on it. These are the four in the tin — the HB
 *  you sketch with, the hard pale one you set the construction lines out in,
 *  the soft broad one you lay the shadows in with, and the sharp one you go
 *  back over the detail with.
 *
 *  **The whole row sits a step up its rack from where it used to.** These four
 *  were chosen against a pencil that scattered specks along the path, and that
 *  pencil drew the same line at any width — so the fine end of the tin could be
 *  as fine as a real one is. The simulation is a lead pressed into the page's
 *  own tooth (see `plugins/lead.ts`), and a lead has to be a few grain cells
 *  across before there is any tooth under it to find: below that the mark has no
 *  paper in it, and on a page shown smaller than 1:1, or with the detail slider
 *  down, it falls through to the old painter altogether. A 0.3 mm detail lead
 *  was under that line most of the time it was in anybody's hand. The tin is now
 *  0.5 / 0.7 / 0.9 and a 3 mm face for the shading — every one of them a lead
 *  that draws *this* sheet rather than a hairline that could be drawn on any. */
export const PENCIL_PRESETS: readonly BuiltinPreset[] = [
  { id: "sketch", nameKey: "presets.graphite.sketch", size: mm(0.9) },
  {
    id: "construction",
    nameKey: "presets.graphite.construction",
    size: mm(0.7),
    // A 2H under a light hand: the lead rides the crowns of the paper and
    // leaves a line you can draw over and rub out after. The lightness is the
    // *hand* rather than an opacity turned down, which is a different picture
    // at the same greyness — the sheet shows through the mark instead of the
    // mark being faded (see `PRESS` in `./dials.ts`).
    dials: { grade: 0.7, pressure: 0.6 },
  },
  {
    id: "shading",
    nameKey: "presets.graphite.shading",
    size: mm(3),
    // The 6B on its side, leaned on: this is the one the darks go in with, and
    // a shadow laid in at a sketching weight is a shadow you cannot see.
    dials: { grade: 1.68, pressure: 1.35 },
  },
  {
    id: "detail",
    nameKey: "presets.graphite.detail",
    size: mm(0.5),
    dials: { grade: 1.12 },
  },
];

/** The paintbrush. Four *brushes off the rack* rather than four widths — and
 *  two of them used to be a second tool: the round it ships as, the half-inch
 *  one-stroke flat (the flatness dial turned all the way, which is what
 *  replaced the flat brush), the filbert between the two, and the starved
 *  dry brush that scumbles over the paper's grain instead of covering it. */
export const BRUSH_PRESETS: readonly BuiltinPreset[] = [
  { id: "round", nameKey: "presets.paintbrush.round", size: mm(4.8) },
  {
    id: "onestroke",
    nameKey: "presets.paintbrush.onestroke",
    size: mm(12.7),
    dials: { flatness: 1 },
  },
  {
    id: "filbert",
    nameKey: "presets.paintbrush.filbert",
    size: mm(7.9),
    dials: { flatness: 0.55 },
  },
  {
    id: "dry",
    nameKey: "presets.paintbrush.dry",
    size: mm(7.9),
    dials: { hardness: 0.25, load: 0.4 },
  },
];

/** Watercolour. The three things a watercolourist changes between one stroke
 *  and the next are how much water is on the brush, how much colour is in the
 *  water, and what the paper does with it — so the presets are the four
 *  techniques those settings *are*: the ordinary wash, the flood that runs
 *  wet-in-wet, the thin glaze laid over dry paint, and the near-dry brush that
 *  skips across the grain.
 *
 *  **The row sits a step up its rack too, for the pencil's reason one size
 *  larger.** A wash is now water on a sheet that dries a step at a time (see
 *  `plugins/wash.ts`), and everything worth having out of that — the rim that
 *  gathers where the water stopped, the bloom where a wet stroke ran back into
 *  a drying one, the granulation rolling into the paper's dips — is worked out
 *  on a grid pitched to the page rather than to the brush. A #4 dry-brush mark
 *  is a couple of dozen cells across: the rim is a pixel of it and the mottle
 *  reads as noise. The same techniques at a #8 and up have the page in them to
 *  show what the sheet did, which is the entire reason for painting with this
 *  brush. The mop on the wet-in-wet is the expensive end of the box and it is
 *  the right end for a flood — that is the mark that blooms. */
export const WASH_PRESETS: readonly BuiltinPreset[] = [
  { id: "wash", nameKey: "presets.watercolor.wash", size: mm(9.5) },
  {
    id: "wet",
    nameKey: "presets.watercolor.wet",
    size: mm(19),
    dials: { water: 1.7, pigment: 0.55, granulation: 0.9 },
  },
  {
    id: "glaze",
    nameKey: "presets.watercolor.glaze",
    size: mm(9.5),
    // The thinness is all in the pigment, where a glaze's thinness actually is:
    // it used to be half of it and an opacity turned down over the top, and an
    // alpha over the finished mark dims the rim and the granulation along with
    // the stain — the opposite of a glaze, which is *dilute paint on a dry
    // sheet doing everything a full-strength one does*.
    dials: { water: 1.1, pigment: 0.28, granulation: 0.35 },
  },
  {
    id: "dry",
    nameKey: "presets.watercolor.dry",
    size: mm(6.3),
    dials: { water: 0.35, pigment: 1.5, granulation: 0.8 },
  },
];

/** The airbrush, by the three jobs a gun is set up for: the general-purpose
 *  pattern it ships at, the tight low-flow one you pull in close for detail,
 *  and the wide soft one you lay a background in with. */
export const SPRAY_PRESETS: readonly BuiltinPreset[] = [
  { id: "general", nameKey: "presets.airspray.general", size: mm(12) },
  {
    id: "detail",
    nameKey: "presets.airspray.detail",
    size: mm(2),
    dials: { flow: 0.7 },
  },
  {
    id: "background",
    nameKey: "presets.airspray.background",
    size: mm(50),
    dials: { hardness: 0.1, flow: 1.6 },
  },
];

/** The felt tip, by its nib: the bullet in everybody's drawer, the chisel that
 *  lays a band one way and a hairline the other, and the fineliner. */
export const MARKER_PRESETS: readonly BuiltinPreset[] = [
  { id: "marker", nameKey: "presets.marker.marker", size: mm(2) },
  {
    id: "chisel",
    nameKey: "presets.marker.chisel",
    size: mm(5),
    dials: { chisel: 0.9 },
  },
  {
    id: "fineliner",
    nameKey: "presets.marker.fineliner",
    size: mm(0.5),
    dials: { chisel: 0 },
  },
];

/** The highlighter has one job and two sizes of it: a line of type, and the
 *  block you drag down the margin of a whole paragraph. */
export const HIGHLIGHTER_PRESETS: readonly BuiltinPreset[] = [
  { id: "text", nameKey: "presets.highlighter.text", size: mm(5) },
  {
    id: "broad",
    nameKey: "presets.highlighter.broad",
    size: mm(12),
    dials: { chisel: 0.95 },
  },
];

/** The crayon, by how hard it is bearing down: the flat laid on for colouring
 *  in, the light broad pass that leaves the paper's speckle showing, and the
 *  corner leant on until the mark goes solid. */
export const CRAYON_PRESETS: readonly BuiltinPreset[] = [
  { id: "coloring", nameKey: "presets.crayon.coloring", size: mm(8) },
  {
    id: "shading",
    nameKey: "presets.crayon.shading",
    size: mm(12),
    // A light hand and nothing else. It carried an opacity too, and a faded
    // crayon mark is not a light one — the speckle is the paper coming through
    // the wax, which is what easing the hand off the rest of the way gives.
    dials: { pressure: 0.5 },
  },
  {
    id: "solid",
    nameKey: "presets.crayon.solid",
    size: mm(5),
    dials: { pressure: 1.45 },
  },
];

/** The broad nib, by the hand you are writing. A calligrapher does not change
 *  the pen, they change the angle they hold it at and the nib they put in it —
 *  and those two numbers are the difference between an italic, a foundational
 *  and an uncial, which are the three hands anyone is taught. */
export const NIB_PRESETS: readonly BuiltinPreset[] = [
  { id: "italic", nameKey: "presets.calligraphy.italic", size: mm(2.5) },
  {
    id: "foundational",
    nameKey: "presets.calligraphy.foundational",
    size: mm(2.5),
    dials: { angle: -30 },
  },
  {
    id: "uncial",
    nameKey: "presets.calligraphy.uncial",
    size: mm(3.8),
    dials: { angle: -15 },
  },
];

/** The paint bucket — the one set here with no width in it, because the tool
 *  has none (see `PresetSettings`). What it fills with is the whole question:
 *  a flat colour, a fill with a soft edge that sits behind a sketch without
 *  cutting it out, and a pale wash you can read the drawing through. */
export const FILL_PRESETS: readonly BuiltinPreset[] = [
  { id: "flat", nameKey: "presets.filler.flat" },
  {
    id: "soft",
    nameKey: "presets.filler.soft",
    dials: { feather: mm(3) },
  },
  {
    id: "wash",
    nameKey: "presets.filler.wash",
    dials: { opacity: 0.45, feather: mm(8) },
  },
];

// --- The tools that ship none, and why ---------------------------------------
//
// A preset row of one chip is a worse default than a default. Several families
// have exactly one setting worth handing anybody, so they carry it where a
// setting that good belongs — in `defaultSize` and the dial defaults — and
// offer no row at all:
//
//   - **The shapes.** Eleven tools with one dial (opacity) between them. A
//     rectangle is a rectangle; what varies is the width of the line it is
//     ruled with, and the width row is already five buttons of exactly that.
//     Half a millimetre is the line you draw a box on a page with, and it is
//     where they all open.
//   - **Text.** Same shape of answer: the size row is the preset row here, and
//     twelve point is body copy. The choices that would make a type preset
//     worth having — the face, the weight, the slant — are not dials at all;
//     they live in the toolbar beside the caption you are typing.
//   - **The hand and the selection tools.** They have no dials and leave no
//     mark. There is nothing to preset.
//   - **The dropper.** It has a dial now — how much page one press reads — and
//     that dial is already a row of chips (see `SAMPLE`). A preset row over it
//     would be a second row of the same five answers.
//   - **The gradient.** Its two dials are the bucket's, and it could wear the
//     bucket's row unchanged — but what a gradient *is* is decided by the
//     colours on its own panel rather than by a dial, so a chip called "Flat"
//     over a ramp would be naming the wrong axis. Its swatch row is its preset
//     row.
