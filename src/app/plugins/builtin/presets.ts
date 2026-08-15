// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The presets the shipped tools come with — the "must haves" of each medium.
//
// The mechanism is in `plugins/presets.ts`; this is the *set*, kept beside the
// registrations that hand them out, the same way the dials and the gauges are.
//
// **What a preset is for.** A tool here is a width and up to five dials, and a
// beginner opening that panel has no way of knowing which combinations are a
// tool and which are noise. Nobody arrives at dry-brush by dragging the splay
// up, the hardness down and the opacity off and seeing what happens; they
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

/** The pencil, which is the tool this whole idea came from: a lead grade and a
 *  width together *are* a pencil, and a sketcher owns three or four of them
 *  rather than one with a slider on it. These are the four in the tin — the HB
 *  you sketch with, the hard pale one you set the construction lines out in,
 *  the soft broad one you lay the shadows in with, and the sharp one you go
 *  back over the detail with. */
export const PENCIL_PRESETS: readonly BuiltinPreset[] = [
  { id: "sketch", nameKey: "presets.graphite.sketch", size: mm(0.7) },
  {
    id: "construction",
    nameKey: "presets.graphite.construction",
    size: mm(0.5),
    // A 2H, laid in light enough to draw over and rub out after.
    dials: { grade: 0.7, opacity: 0.55 },
  },
  {
    id: "shading",
    nameKey: "presets.graphite.shading",
    size: mm(2),
    // The 6B on its side.
    dials: { grade: 1.68 },
  },
  {
    id: "detail",
    nameKey: "presets.graphite.detail",
    size: mm(0.3),
    dials: { grade: 1.12 },
  },
];

/** The round bristle brush. Four heads rather than four widths: the one it
 *  ships as, a coarse hog that leaves the streaks in, a splayed dry head that
 *  skips over the tooth, and a big soft one loaded thin enough to glaze over
 *  what is already there. */
export const BRUSH_PRESETS: readonly BuiltinPreset[] = [
  { id: "round", nameKey: "presets.paintbrush.round", size: mm(4.8) },
  {
    id: "hog",
    nameKey: "presets.paintbrush.hog",
    size: mm(7.9),
    dials: { hardness: 0.6, hair: 1.7, splay: 0.9 },
  },
  {
    id: "dry",
    nameKey: "presets.paintbrush.dry",
    size: mm(7.9),
    dials: { opacity: 0.6, hardness: 0.25, hair: 1.3, splay: 1.6 },
  },
  {
    id: "glaze",
    nameKey: "presets.paintbrush.glaze",
    size: mm(12.7),
    dials: { opacity: 0.25, hair: 0.8, splay: 0.5, bleed: 0.7 },
  },
];

/** The flat. A blade is held at an angle and that angle is most of what it is
 *  for: the half-inch one-stroke at the italic tilt, the small one held nearer
 *  square that letters a sign, and the inch flat opened up and wet for laying a
 *  wash across a whole sky. */
export const FLAT_BRUSH_PRESETS: readonly BuiltinPreset[] = [
  { id: "onestroke", nameKey: "presets.flatbrush.onestroke", size: mm(12.7) },
  {
    id: "lettering",
    nameKey: "presets.flatbrush.lettering",
    size: mm(6.4),
    dials: { angle: -30, splay: 0.4 },
  },
  {
    id: "wash",
    nameKey: "presets.flatbrush.wash",
    size: mm(25.4),
    dials: { opacity: 0.75, hardness: 0.5, splay: 0.7, bleed: 0.8 },
  },
];

/** Watercolour. The three things a watercolourist changes between one stroke
 *  and the next are how much water is on the brush, how much colour is in the
 *  water, and what the paper does with it — so the presets are the four
 *  techniques those settings *are*: the ordinary wash, the flood that runs
 *  wet-in-wet, the thin glaze laid over dry paint, and the near-dry brush that
 *  skips across the grain. */
export const WASH_PRESETS: readonly BuiltinPreset[] = [
  { id: "wash", nameKey: "presets.watercolor.wash", size: mm(6.3) },
  {
    id: "wet",
    nameKey: "presets.watercolor.wet",
    size: mm(9.5),
    dials: { water: 1.7, pigment: 0.55, granulation: 0.9 },
  },
  {
    id: "glaze",
    nameKey: "presets.watercolor.glaze",
    size: mm(6.3),
    dials: { opacity: 0.55, water: 1.1, pigment: 0.4, granulation: 0.35 },
  },
  {
    id: "dry",
    nameKey: "presets.watercolor.dry",
    size: mm(3.2),
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
    dials: { opacity: 0.75, pressure: 0.6 },
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
// A preset row of one chip is a worse default than a default. Three families
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
//   - **The hand, the dropper and the selection tools.** They have no dials and
//     leave no mark. There is nothing to preset.
