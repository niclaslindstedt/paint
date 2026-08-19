// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dials the shipped tools offer, past the width they all share.
//
// The mechanism is in `plugins/dials.ts`; this is the *set*, kept beside the
// registrations that hand them out. Two rules hold it together:
//
//   - **A dial is a fraction of the tool's own normal.** 1 is always "the way
//     this tool draws", so every one of them reads out as a percentage and an
//     untouched dial is simply absent from the mark (see `plugins/dials.ts`).
//   - **A tool gets as many as its mark has axes, and no more.** The size panel
//     is opened mid-drawing, with one thumb, over the page you are working on,
//     so the bar is high: a dial has to change what the mark *is*, not restyle
//     what another dial already did. For most tools that is one or two. The
//     paintbrush is the exception and earns it — a head of hair is loaded or
//     dry, milled fine or coarse, new or worn open, on paper that wicks or
//     paper that does not, and no one of those four is any of the others.
//
// Each one is wired to something a painter actually does. A slider that scales
// a number nobody can see is worse than no slider.

import { mm } from "../../units.ts";
import { HARDEST_LEAD, SOFTEST_LEAD } from "../graphite.ts";
import { HARDEST_WAX, SOFTEST_WAX, WAX_CRAYON } from "../waxField.ts";
import type { ToolDial } from "../types.ts";

/** How much of the page shows through. The dial the *drawn* tools offer,
 *  because it is the one thing a drawn mark has: it lands on `Stroke.opacity`,
 *  multiplied into whatever the tool's own ink already was, so a highlighter
 *  turned down to a third is a third of a highlighter.
 *
 *  **The simulated media do not offer it.** The pencil, the paintbrush, the
 *  watercolour brush, the crayon and the broad nib each work their mark out
 *  from a physical model — how far the lead is driven into the sheet's tooth,
 *  how much paint is left on the head, how much colour is dissolved in the
 *  water, how much of the dip the nib has spent — and every one of them
 *  already carries the dial that makes a mark lighter *the way that medium
 *  does*. A flat alpha over the finished mark is a different picture at the
 *  same greyness (see `PRESS`): it fades the paper back out of the mark, which
 *  is the one thing those simulations exist to put in. Two ways to lighten a
 *  stroke, one of them undoing the tool, is worse than one — so they carry the
 *  medium's own and leave this to the tools whose mark is ink on a path.
 *
 *  Marks already drawn are untouched: `Stroke.opacity` is read by every
 *  painter exactly as it was, so a wash laid down at 55% still paints at 55%.
 *  What went is the slider that made new ones. */
export const OPACITY: ToolDial = {
  id: "opacity",
  nameKey: "dials.opacity.name",
  hintKey: "dials.opacity.hint",
  min: 0.1,
  max: 1,
  step: 0.05,
};

/** How much of a mark one pass of the eraser takes off.
 *
 *  The same number as `OPACITY` and deliberately the same dial *id*: an erasing
 *  mark is painted with `destination-out`, where the ink's alpha is exactly how
 *  much of what is underneath goes away (see `render.ts`). So a rubbing out at
 *  half opacity is a rubbing out at half strength, and nothing new had to be
 *  wired for it — only the word, because "opacity" is not what anyone would
 *  call it on a rubber. Turned down, it is the pencil eraser you feather a
 *  highlight in with rather than the one that takes the page back to white in a
 *  single drag. */
export const STRENGTH: ToolDial = {
  id: "opacity",
  nameKey: "dials.strength.name",
  hintKey: "dials.strength.hint",
  min: 0.05,
  max: 1,
  step: 0.05,
};

/** How hard the rubber is bearing down.
 *
 *  The same id as the crayon's `PRESSURE` and a different word for it, the way
 *  `STRENGTH` is `OPACITY` — a dial is stored per tool, so two implements can
 *  both have a hand leaning on them without either reading the other's number.
 *
 *  What it reaches is how far into the sheet's tooth the rubber's face deforms
 *  (see `rubber.ts`), which is the one thing pressing harder actually changes: a
 *  light hand takes the graphite off the peaks and leaves the dips full, and a
 *  heavy one gets down into them. So it fades the ghost rather than widening the
 *  mark — and it never reaches a clean page, because no rubber does.
 *
 *  Deliberately *not* the eraser's `STRENGTH`. That one is an alpha and answers
 *  "how much of this goes"; this one is a depth, and what goes follows from it. */
export const RUB: ToolDial = {
  id: "pressure",
  nameKey: "dials.rub.name",
  hintKey: "dials.rub.hint",
  min: 0.3,
  max: 1.6,
  step: 0.05,
};

/** How chiselled a felt tip is: 0 is a round bullet, 1 very nearly the flat of
 *  the calligraphy nib.
 *
 *  It is what separates the marker from the highlighter, which for a long time
 *  differed by width and opacity and nothing else. A bullet tip draws the same
 *  weight whichever way you pull it; a chisel lays a band across the page and a
 *  hairline down it, and that asymmetry is the entire reason a highlighter looks
 *  like a highlighter (see `paintNib`).
 *
 *  Two tools offer it at two different rests — a marker is mostly round, a
 *  highlighter mostly flat — so each declares its own descriptor below and the
 *  painter is handed the matching fallback. */
export const CHISEL: ToolDial = {
  id: "chisel",
  nameKey: "dials.chisel.name",
  hintKey: "dials.chisel.hint",
  min: 0,
  max: 1,
  step: 0.05,
  default: 0.35,
};

/** The highlighter's chisel: the same dial resting most of the way over, because
 *  a highlighter with a round tip is a fat translucent marker. */
export const CHISEL_FLAT: ToolDial = { ...CHISEL, default: 0.85 };

/** Which way a flat nib is turned, in degrees off the horizontal.
 *
 *  The one dial here measured in neither a percentage nor a distance, because a
 *  nib angle is neither: it is the tilt a hand holds the pen at, and −45° — up
 *  to the right — is what a right-handed italic hand does. Turn it to 0 and the
 *  broad edge lies flat, which is the stroke that swells on the verticals
 *  instead of the diagonals. */
export const ANGLE: ToolDial = {
  id: "angle",
  nameKey: "dials.angle.name",
  hintKey: "dials.angle.hint",
  min: -90,
  max: 90,
  step: 5,
  default: -45,
  unit: "deg",
};

/** How much ink the calligraphy pen's nib is dipped with, per stroke.
 *
 *  The same dial id as the brushes' `LOAD` and a different word for it, the way
 *  `STRENGTH` is `OPACITY` — a dial is stored per tool, so the pen and the
 *  brush can both have a dip without either reading the other's number. It is
 *  the whole reservoir the ink simulation spends (see `quillSim.ts`): a full
 *  nib writes a flourished word before it thins; a half-charged one pales,
 *  rails and breaks up within a long swell, which is a mark calligraphers make
 *  on purpose; past full is an overdipped nib that blobs where it first
 *  touches down. It rests at a full dip, so an untouched pen writes the way a
 *  pen fresh from the well does — and its track is shorter than the brushes',
 *  because a nib holds one bead of ink and there is no ferrule to overcharge. */
export const INK: ToolDial = {
  id: "load",
  nameKey: "dials.ink.name",
  hintKey: "dials.ink.hint",
  min: 0.2,
  max: 1.3,
  step: 0.05,
  default: 1,
};

/** The pencil's lead, by its grade.
 *
 *  A pencil has exactly one axis and this is it: the H end is hard, pale and
 *  rides the peaks of the paper, the B end is soft and dark and fills the tooth
 *  in. It reaches the *deposit* only, so a 6B is a blacker line and never a
 *  wider one (see `graphite.ts`).
 *
 *  **It is pressed, not dragged.** There is nothing between a 2B and a 3B —
 *  they are two boxes on a shelf — and a slider that has to be hunted along
 *  until the readout says "4B" is asking someone to search for a value they
 *  could have named. So the dial carries `choices` and the panel renders the
 *  ladder (see `ToolDial.choices`).
 *
 *  The stored number is still what it always was: how much darker than an HB
 *  this lead lays down. That is what keeps every pencil line already drawn
 *  drawing exactly as it did — the grade is a *label on a number*, not a new
 *  number. The ladder below is the fifteen grades a shop actually sells, at the
 *  darkness each of them measures against an HB. */
export const GRADE: ToolDial = {
  id: "grade",
  nameKey: "dials.grade.name",
  hintKey: "dials.grade.hint",
  // The ends are the medium's rather than this table's: the same two numbers
  // pick the grey the lead lays down (see `graphiteInk`), and a ladder that ran
  // past them would be naming leads the tin does not hold.
  min: HARDEST_LEAD,
  max: SOFTEST_LEAD,
  step: 0.01,
  choices: [
    { value: 0.38, label: "8H" },
    { value: 0.45, label: "6H" },
    { value: 0.55, label: "4H" },
    { value: 0.62, label: "3H" },
    { value: 0.7, label: "2H" },
    { value: 0.8, label: "H" },
    { value: 0.9, label: "F" },
    { value: 1, label: "HB" },
    { value: 1.12, label: "B" },
    { value: 1.25, label: "2B" },
    { value: 1.38, label: "3B" },
    { value: 1.5, label: "4B" },
    { value: 1.68, label: "6B" },
    { value: 1.8, label: "8B" },
    { value: 1.9, label: "9B" },
  ],
};

/** How hard the hand is bearing down on the pencil.
 *
 *  The same id as the crayon's `PRESSURE` and the rubber's `RUB`, and the third
 *  implement with a hand leaning on it — a dial is stored per tool, so none of
 *  the three reads either of the others' number.
 *
 *  It is the axis a pencil has that the grade is not. The grade is *which lead
 *  is in your hand*; this is what you are doing with it, and no sketcher draws
 *  at one weight: a construction line is laid on with the side of a light hand
 *  and rides the crowns of the paper, and the dark that goes in last is the same
 *  lead leaned on until it reaches the bottom of the tooth. What it moves is how
 *  far into the sheet the lead is driven (see `leadField.ts`), so bearing down
 *  fills the paper's valleys in and eases the mark from broken to solid — and
 *  never makes the line one pixel wider.
 *
 *  **It is why there is no opacity beside it.** An alpha over the finished mark
 *  and a hand eased off are two different pictures at the same greyness: a pale
 *  heavy mark is solid and low-contrast, a pale light one is the sheet showing
 *  through — and the second is what a guide line laid in to trace over actually
 *  looks like. A simulated medium can draw it, so this is the dial the pencil
 *  offers and the flat alpha is not (see `OPACITY`).
 *
 *  It goes past 1 as far as it goes under it, because leaning on a pencil is
 *  what half of drawing with one is — and when a stylus one day reports its own
 *  pressure, this is the number it will be moving. */
export const PRESS: ToolDial = {
  id: "pressure",
  nameKey: "dials.press.name",
  hintKey: "dials.press.hint",
  min: 0.3,
  max: 1.6,
  step: 0.05,
};

/** Edge crispness — the dial that used to live in the open under the width, and
 *  the reason this whole seam exists: it was only ever right for two tools, and
 *  it meant something different to each of them. Soft is a splayed dry head on
 *  the paintbrush and a wide fading cone on the airbrush; hard is a loaded head
 *  and a tight core. */
export const HARDNESS: ToolDial = {
  id: "hardness",
  nameKey: "dials.hardness.name",
  hintKey: "dials.hardness.hint",
  min: 0,
  max: 1,
  step: 0.05,
};

/** How far the paintbrush's head is squeezed toward a blade.
 *
 *  At rest it is the round — a cone of hair that lays the same width
 *  whichever way you pull it. Turned all the way up it is the one-stroke
 *  flat: a chisel ferrule that lays its full width square across itself and
 *  closes to a heavy hairline along its own edge, which is the stroke that
 *  swells and thins round a curve without the hand doing anything. The
 *  middle of the range is the filbert on every rack between the two.
 *
 *  It used to be two tools — you picked up a different brush — and the two
 *  are one brush with this dial now: what the blade *does* is a projection
 *  the simulation works out per touch (see `projected` in
 *  `plugins/bristleSim.ts`), so nothing but this number separates them. */
export const FLATNESS: ToolDial = {
  id: "flatness",
  nameKey: "dials.flatness.name",
  hintKey: "dials.flatness.hint",
  min: 0,
  max: 1,
  step: 0.05,
  default: 0,
};

/** How much paint the brush is dipped with — the charge the whole drag spends
 *  (see `capacityOf` in `plugins/head.ts`).
 *
 *  1 is one ordinary dip of this brush, and the run before the head goes dry
 *  scales straight off it: turned down toward a quarter the head is barely
 *  touched to the paint and scratches dry within a stroke or two, turned up
 *  toward three it is charged heavily enough to cross most of a page. It moves
 *  *distance* and nothing else — the mark's width, streaks and edge belong to
 *  `HARDNESS` and the head — and it multiplies what the ferrule already holds,
 *  which is why the round outlasts the flat with both dials at rest: a cone
 *  keeps about twice the dip a chisel ferrule does (see `FLAT_RESERVOIR` in
 *  `plugins/bristleSim.ts`). */
export const LOAD: ToolDial = {
  id: "load",
  nameKey: "dials.load.name",
  hintKey: "dials.load.hint",
  min: 0.25,
  max: 3,
  step: 0.05,
};

/** How much paint the airbrush lets through per pass. Coverage there is built
 *  from overlap rather than from one opaque dab, so this is the trigger: low
 *  builds up over many passes, high covers in one. */
export const FLOW: ToolDial = {
  id: "flow",
  nameKey: "dials.flow.name",
  hintKey: "dials.flow.hint",
  min: 0.4,
  max: 2.5,
  step: 0.05,
};

/** How hard the crayon is bearing down. Wax only sticks to the peaks it is
 *  pressed onto, so a light hand leaves the paper's speckle showing through and
 *  a heavy one fills the valleys in until the mark is solid — which is the
 *  crayon's own way of drawing a pale mark, and why it offers no opacity (the
 *  same argument as the pencil's `PRESS`). */
export const PRESSURE: ToolDial = {
  id: "pressure",
  nameKey: "dials.pressure.name",
  hintKey: "dials.pressure.hint",
  min: 0.5,
  max: 1.5,
  step: 0.05,
};

/** Which stick of wax is in the crayon — its grade, the way `GRADE` is the
 *  pencil's.
 *
 *  A crayon has exactly one axis past the hand and this is it: the hard end
 *  is a china marker (hardened wax on a point — a dense, sticky line that
 *  still breaks on the tooth), 1 is the classroom wax crayon, and the soft
 *  end is an oil pastel — nearly butter, digging to the bottom of the tooth
 *  and slabbing colour on at a light touch. It reaches how far the face digs
 *  and how freely it crumbles (see `waxField.ts`), so a softer stick is a
 *  fuller, creamier mark and never a wider one.
 *
 *  A slider rather than the grade's ladder of chips, because wax is blended,
 *  not boxed: there is a whole shelf between a crayon and a pastel, and the
 *  presets already hand out the three sticks anyone would name (see
 *  `CRAYON_PRESETS`). The ends are the medium's own, so the dial and the
 *  field cannot drift apart. */
export const SOFT: ToolDial = {
  id: "soft",
  nameKey: "dials.soft.name",
  hintKey: "dials.soft.hint",
  min: HARDEST_WAX,
  max: SOFTEST_WAX,
  step: 0.05,
  default: WAX_CRAYON,
};

/** How far the paint bucket's edge fades out past the outline it traced, in
 *  millimetres of page.
 *
 *  The one dial that measures the *page* rather than a fraction of a tool, and
 *  the one whose rest is nothing: a bucket fills to a hard edge unless you ask
 *  it not to. It is what turns the tool from a flat-colour bucket into a way of
 *  laying a soft wash behind a sketch — and it stays a vector fill, so the fade
 *  survives a zoom to eight hundred percent.
 *
 *  The number on the stroke is still document pixels, exactly as it was; what
 *  changed is that the panel now reads it out in the millimetres it has always
 *  been (see `units.ts`), and that the reach goes to two centimetres, which is
 *  a soft edge you can see on a page a foot across rather than three pixels of
 *  one. */
export const FEATHER: ToolDial = {
  id: "feather",
  nameKey: "dials.feather.name",
  hintKey: "dials.feather.hint",
  min: 0,
  max: mm(20),
  step: mm(0.2),
  default: 0,
  unit: "mm",
};

/** How much page the colour dropper reads at once, as the radius of the disc it
 *  averages — in document pixels, like every other distance a mark carries.
 *
 *  A dropper that reads one pixel is honest and frequently useless. Half of what
 *  is on this page is *textured*: an airbrush is a cloud of specks, a crayon
 *  skips over the tooth of the paper, a watercolour granulates. Aim at any of
 *  them and the single pixel under the pointer is one speck of one of the
 *  colours there — usually the page showing between them — where what you were
 *  pointing at is the colour the passage *reads* as. That is what an average
 *  over a disc gives you, and it is why every other eyedropper has this setting.
 *
 *  Pressed rather than dragged (see `ToolDial.choices`): a sample size is a
 *  handful of answers, and "the point" is a different kind of answer from the
 *  rest rather than the bottom of a slider. The labels are the width of the disc
 *  on the page, because that is what the pointer ring draws around it. */
export const SAMPLE: ToolDial = {
  id: "sample",
  nameKey: "dials.sample.name",
  hintKey: "dials.sample.hint",
  min: 0,
  max: mm(5),
  step: mm(0.1),
  default: 0,
  unit: "mm",
  choices: [
    { value: 0, label: "1 px" },
    { value: mm(0.5), label: "1 mm" },
    { value: mm(1), label: "2 mm" },
    { value: mm(2), label: "4 mm" },
    { value: mm(4), label: "8 mm" },
  ],
};

// --- Watercolour --------------------------------------------------------------
//
// The three below belong to the wash tool, and they are three different things
// rather than three ways of saying "more". A watercolourist changes exactly
// these between one stroke and the next: how much water is on the brush, how
// much colour is in the water, and what the paper does with what is left.

/** How charged the brush is.
 *
 *  The first thing anyone touching watercolour learns: it is water you are
 *  painting with, and the pigment goes where the water takes it. Turned up, the
 *  mark spreads past the hair that laid it, both its edges wander off the
 *  gesture, and what is left in the middle is dilute — a wet-in-wet wash.
 *  Turned down it is nearly dry-brush, and the stroke keeps the shape of the
 *  head. */
export const WATER: ToolDial = {
  id: "water",
  nameKey: "dials.water.name",
  hintKey: "dials.water.hint",
  min: 0.2,
  max: 2,
  step: 0.05,
};

/** How much colour is in that water — a pale tint you can read a pencil line
 *  through, or a full-strength stain. It is how a wash is made pale here, and
 *  the reason the brush needs no opacity: turning a mark down dims the rim and
 *  the granulation with it, while thinning the pigment leaves the sheet's own
 *  work at full strength and only the stain weaker, which is what a glaze is. */
export const PIGMENT: ToolDial = {
  id: "pigment",
  nameKey: "dials.pigment.name",
  hintKey: "dials.pigment.hint",
  min: 0.2,
  max: 2,
  step: 0.05,
};

/** How heavily the pigment settles into the sheet.
 *
 *  The one dial here that is the *paper* and the colour rather than the brush —
 *  ultramarine on rough stock mottles enough to see across a room, phthalo on
 *  hot-pressed does not mottle at all. It rests part way up, because a wash
 *  with no granulation in it whatsoever is the one thing that reads as printed
 *  rather than painted. */
export const GRANULATION: ToolDial = {
  id: "granulation",
  nameKey: "dials.granulation.name",
  hintKey: "dials.granulation.hint",
  min: 0,
  max: 1.6,
  step: 0.05,
  default: 0.6,
};
