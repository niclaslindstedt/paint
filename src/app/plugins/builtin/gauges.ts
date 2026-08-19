// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sizes the shipped tools are made in.
//
// The mechanism is in `plugins/gauge.ts`; this is the *rack*, kept beside the
// registrations that hand it out — the same arrangement the dials use. Every
// number below is a real implement, and most of them are a number printed on a
// box: the ISO ladder a technical pen is drawn to, the four lead gauges a
// mechanical pencil takes, the ferrule sizes a round brush is numbered by, the
// inch fractions a flat is sold in, the points a caption is set in.
//
// Three things are declared per tool, and the middle one is the one that
// matters most:
//
//   - **`steps`** — five widths worth a button. Five, because that is what a
//     thumb can hit without reading and what a real rack of one implement holds
//     between "fine" and "broad". They carry the trade's own designation where
//     it has one, because a painter asks for a #6 and not for 4.8 mm.
//   - **`min` / `max`** — the range the thing is actually manufactured in. It
//     is the middle four tenths of the slider, so most of the travel is spent
//     among widths that exist (see `plugins/gauge.ts`).
//   - **`floor` / `ceiling`** — how far off the rack the slider still goes.
//     Mostly left to the defaults, which is a sixth of the narrowest and
//     twenty-four times the widest.
//
// A tool's `defaultSize` is chosen from its own steps: the one you would pick
// up first. That is the third step for most of them — the middle of the rack —
// and deliberately not for a few (a pen defaults finer, because you write with
// it; a highlighter defaults to the width of a line of type).

import { mm, pt } from "../../units.ts";
import type { SizeGauge } from "../gauge.ts";

/** The drawing pen: the ISO ladder every technical pen and fineliner is drawn
 *  to, from a map-maker's hairline to a marker pen's stroke. */
export const PEN_GAUGE: SizeGauge = {
  min: mm(0.1),
  max: mm(2),
  steps: [
    { px: mm(0.18) },
    { px: mm(0.25) },
    { px: mm(0.35) },
    { px: mm(0.5) },
    { px: mm(0.7) },
  ],
};

/** The pencil: the four leads a mechanical pencil is sold in, plus the 2 mm
 *  clutch lead a draughtsman sharpens on a block. The range runs on to 8 mm
 *  because a sketching pencil laid on its side draws with the whole of the
 *  lead, which is the widest mark a pencil can make. */
export const PENCIL_GAUGE: SizeGauge = {
  min: mm(0.2),
  max: mm(8),
  steps: [
    { px: mm(0.3) },
    { px: mm(0.5) },
    { px: mm(0.7) },
    { px: mm(0.9) },
    { px: mm(2) },
  ],
};

/** The rubber: a pencil-top eraser, a pocket one, a block, and the two sizes of
 *  slab a draughtsman sweeps a whole passage back with. */
export const ERASER_GAUGE: SizeGauge = {
  min: mm(1.5),
  max: mm(50),
  steps: [
    { px: mm(2) },
    { px: mm(5) },
    { px: mm(10) },
    { px: mm(20) },
    { px: mm(40) },
  ],
};

/** The paintbrush — one rack for the round it rests as and the flat its
 *  flatness dial squeezes it into. The bottom of it is the round series (a #6
 *  measures 4.8 mm across the ferrule), the top is where brushes stop being
 *  numbered and start being sold in fractions of an inch, which is how every
 *  flat is; the range runs on to the two-inch one-stroke, past which a
 *  painter's brush becomes a decorator's. */
export const BRUSH_GAUGE: SizeGauge = {
  min: mm(1),
  max: mm(100),
  steps: [
    { px: mm(2), note: "#2" },
    { px: mm(4.8), note: "#6" },
    { px: mm(7.9), note: "#10" },
    { px: mm(12.7), note: '½"' },
    { px: mm(25.4), note: '1"' },
  ],
};

/** The watercolour round. The same numbering as any other round, but the rack a
 *  watercolourist owns is a narrower and softer one — a #1 for a rigger's
 *  detail, a #8 for most of a painting, and a mop for the sky. */
export const WASH_GAUGE: SizeGauge = {
  min: mm(0.8),
  max: mm(40),
  steps: [
    { px: mm(1.5), note: "#1" },
    { px: mm(3.2), note: "#4" },
    { px: mm(6.3), note: "#8" },
    { px: mm(9.5), note: "#12" },
    { px: mm(19), note: "Mop" },
  ],
};

/** The airbrush, by the pattern it throws rather than by the needle: a detail
 *  gun holds a line a couple of millimetres wide, a general-purpose one covers
 *  a couple of centimetres, and a spray can is the top of the range. */
export const SPRAY_GAUGE: SizeGauge = {
  min: mm(1),
  max: mm(80),
  steps: [
    { px: mm(2) },
    { px: mm(6) },
    { px: mm(12) },
    { px: mm(25) },
    { px: mm(50) },
  ],
};

/** The felt tip: a fineliner, a bullet tip, a standard chisel, a broad chisel
 *  and the king-size one that labels a packing crate. */
export const MARKER_GAUGE: SizeGauge = {
  min: mm(0.3),
  max: mm(20),
  steps: [
    { px: mm(0.5) },
    { px: mm(1) },
    { px: mm(2) },
    { px: mm(5) },
    { px: mm(10) },
  ],
};

/** The highlighter, which is a chisel and nothing else. The middle step is the
 *  width of a line of type, which is the whole job. */
export const HIGHLIGHTER_GAUGE: SizeGauge = {
  min: mm(2),
  max: mm(20),
  steps: [
    { px: mm(2) },
    { px: mm(3.5) },
    { px: mm(5) },
    { px: mm(8) },
    { px: mm(12) },
  ],
};

/** The wax stick, by the face it presents: a sharpened corner, a worn tip, the
 *  flat of a standard crayon, and the two sizes of chunky stick made for a fist
 *  rather than a hand. */
export const CRAYON_GAUGE: SizeGauge = {
  min: mm(2),
  max: mm(25),
  steps: [
    { px: mm(3) },
    { px: mm(5) },
    { px: mm(8) },
    { px: mm(12) },
    { px: mm(20) },
  ],
};

/** The chalk, by the face it presents: a fresh corner, a worn tip, the full
 *  face of the standard 9.5 mm board stick, the flat a stick wears once it is
 *  written with at an angle, and the chunky playground stick. */
export const CHALK_GAUGE: SizeGauge = {
  min: mm(2),
  max: mm(30),
  steps: [
    { px: mm(4) },
    { px: mm(6) },
    { px: mm(9.5) },
    { px: mm(14) },
    { px: mm(24) },
  ],
};

/** The broad nib, by the width of its edge — the way a calligraphy nib has
 *  always been sold, from a Mitchell 6 up through the poster nibs. */
export const NIB_GAUGE: SizeGauge = {
  min: mm(0.4),
  max: mm(15),
  steps: [
    { px: mm(0.75) },
    { px: mm(1.5) },
    { px: mm(2.5) },
    { px: mm(3.8) },
    { px: mm(6) },
  ],
};

/** The line a shape is drawn with. A pen ladder, cut coarser at the top: a
 *  diagram's box is ruled with something you can see across a room, which no
 *  technical pen is. */
export const STROKE_GAUGE: SizeGauge = {
  min: mm(0.1),
  max: mm(10),
  steps: [
    { px: mm(0.25) },
    { px: mm(0.5) },
    { px: mm(1) },
    { px: mm(2) },
    { px: mm(4) },
  ],
};

/** Type, in points — the one gauge here that is not a width at all, and the
 *  only one measured in something other than millimetres. Ten for a caption,
 *  twelve for body copy, and up through the sizes a heading is set in. */
export const TYPE_GAUGE: SizeGauge = {
  min: pt(6),
  max: pt(96),
  unit: "pt",
  steps: [
    { px: pt(10) },
    { px: pt(12) },
    { px: pt(18) },
    { px: pt(24) },
    { px: pt(48) },
  ],
};
