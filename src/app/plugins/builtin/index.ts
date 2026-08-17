// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The tools this build ships, registered in toolbar order.
//
// Importing this module is what puts them in the registry — `src/main.tsx`
// does it once, before the app mounts. Registration order is the toolbar's
// *default* order, and it is deliberate — but it is no longer Photoshop's
// column, because a phone toolbar is a **row** and a row wants the things you
// reach for next to each other rather than in the order a 1990 tool palette
// happened to stack them.
//
// So it reads: the pen you draw with, then the rest of the media in a shelf of
// their own, then the three things you do to an *area* rather than to a line —
// take it off (the erasers), and fill it (the bucket and the gradient) — then
// the two other families (shapes, then choosing marks), then type — which is
// what you reach for right after picking something out — and last the two tools
// that touch neither the ink nor the document: the dropper that reads a colour
// off the page, and the hand that moves the page. Those two are a pair and they
// belong at the far end together.
//
// The eraser used to sit second, beside the pen it undoes. It sits at the far
// end of the media instead, next to the bucket: it is not something you draw
// *with*, and a hand picking along the marking tools should not have to step
// over the one that takes marks away.
//
// Anyone who disagrees can drag the rows into another order in Settings → Tools,
// and the toolbar follows (see `orderEntries`).
//
// Whether a tool is *in* the toolbar is a separate question from where it sits,
// and it has three answers (see `plugins/types.ts`): `core` tools are always
// there, `defaultOn` ones are there until you switch them off, and the rest
// wait in Settings → Tools until you switch them on. Switching one on slots it
// into its place in the order rather than appending it, so the toolbar never
// depends on the order you discovered it in.
//
// A fourth answer sits above those three: a tool may belong to a **group**, and
// then the group carries the switch and the toolbar button for the whole family.
// Four families are the case — the eleven shapes, the four ways of selecting,
// the two ways of filling an area, and the two ways of taking a mark off — and
// all four are below.
//
// **What a first run finds is the shape of Paint**: a pen, a pencil, an eraser,
// a watercolour brush, an airbrush, a bucket, type, the shapes, the marquee, a
// dropper and the hand — the toolbox anyone who has opened a paint program has
// already used, spray can included, plus the two things that toolbox never had:
// something to sketch with, and something to *paint* with. The rest of the media
// (the round and flat bristle brushes, the marker, the crayon, the highlighter,
// the broad nib) are one tap away in Settings → Tools; they are not what an
// empty page should open holding.
//
// **Every tool that has a width also declares the sizes it is really made in**
// (`gauge`) — the five a shop sells, the range it stocks, and how far past
// either end the slider still goes. A document pixel is one dot of an iPhone's
// screen (see `units.ts`), so those are millimetres you can hold a ruler
// against rather than numbers somebody liked: 0.5 mm of pencil lead, a #6
// round, a 5 mm chisel. See
// `./gauges.ts` for the rack and `../gauge.ts` for what the slider does with it.
//
// Adding a tool is: write its behaviour (or reuse a family factory), register
// it here, and add its two catalog strings. Nothing else in the app changes.
//
// A tool also declares **the width it opens at** (`defaultSize`), because one
// number never suited all of them: six document pixels is a fine pencil line, a
// starved airbrush, and type too small to read. The size is per tool and it
// sticks per tool — picking a fat brush no longer fattens the pencil (see
// `toolSize` in `useAppSettings.ts`).
//
// A tool's `dials` are the same story one level down. The size button opens the
// width — the one control every tool shares — and, behind **Advanced**, the two
// knobs *this* tool has: the paintbrush's hair gauge, the airbrush's flow, the
// crayon's pressure. They are declared here and rendered by a picker that knows
// none of their names; see `./dials.ts` for the set and `../dials.ts` for what
// happens to the numbers.
//
// And a tool's `presets` are the answer to the question those dials raise. Five
// sliders is a tool a professional can build and a beginner cannot: nobody
// arrives at dry-brush by dragging the splay up and the hardness down to see
// what happens. So most tools also declare the handful of settings their medium
// is actually used at — "wet-in-wet", "2H construction line", "hog bristle" —
// and the panel offers them as chips above whatever the user has saved. A tool
// whose must-haves come to a single setting ships **none**, and puts that
// setting in its `defaultSize` and dial defaults instead; see `./presets.ts`
// for the set, the rules, and which tools those are.

import {
  ArrowIcon,
  BrushIcon,
  BucketIcon,
  CircleIcon,
  CrayonIcon,
  DiamondIcon,
  DoubleArrowIcon,
  DropperIcon,
  EraserIcon,
  FlatBrushIcon,
  GradientIcon,
  HandIcon,
  HexagonIcon,
  HighlighterIcon,
  ImageIcon,
  LassoIcon,
  LineIcon,
  MarkerIcon,
  NibIcon,
  PenIcon,
  PencilIcon,
  PentagonIcon,
  RoundSquareIcon,
  RubberIcon,
  SelectIcon,
  SelectOvalIcon,
  ShapesIcon,
  SprayIcon,
  SquareIcon,
  StarShapeIcon,
  TextIcon,
  TraceSelectIcon,
  TriangleIcon,
  WashBrushIcon,
} from "../../icons.tsx";
import { mm } from "../../units.ts";
import { graphiteInk } from "../graphite.ts";
import { registerGroup, registerPlugin } from "../registry.ts";
import type { PaintPlugin } from "../types.ts";
import {
  ANGLE,
  BLEED,
  CHISEL,
  CHISEL_FLAT,
  FEATHER,
  FLOW,
  GRADE,
  GRANULATION,
  HAIR,
  HARDNESS,
  OPACITY,
  PIGMENT,
  PRESSURE,
  RUB,
  SAMPLE,
  SPLAY,
  STRENGTH,
  WATER,
} from "./dials.ts";
import {
  BRUSH_PRESETS,
  CRAYON_PRESETS,
  ERASER_PRESETS,
  FILL_PRESETS,
  FLAT_BRUSH_PRESETS,
  HIGHLIGHTER_PRESETS,
  MARKER_PRESETS,
  NIB_PRESETS,
  PEN_PRESETS,
  PENCIL_PRESETS,
  RUBBER_PRESETS,
  SPRAY_PRESETS,
  WASH_PRESETS,
} from "./presets.ts";
import {
  CRAYON_GAUGE,
  ERASER_GAUGE,
  FLAT_BRUSH_GAUGE,
  HIGHLIGHTER_GAUGE,
  MARKER_GAUGE,
  NIB_GAUGE,
  PEN_GAUGE,
  PENCIL_GAUGE,
  ROUND_BRUSH_GAUGE,
  SPRAY_GAUGE,
  STROKE_GAUGE,
  TYPE_GAUGE,
  WASH_GAUGE,
} from "./gauges.ts";
import { LEAD_OPTIONS } from "../leadOptions.ts";
import { WASH_OPTIONS } from "../washOptions.ts";
import { dropperBehaviour } from "./dropper.ts";
import { fillBehaviour } from "./fill.ts";
import {
  FILL_GROUP_ID,
  GRADIENT_SWATCHES,
  GRADIENT_TOOL_ID,
  gradientBehaviour,
} from "./gradient.ts";
import { freehandBehaviour } from "./freehand.ts";
import { handBehaviour } from "./hand.ts";
import { imageBehaviour, IMAGE_TOOL_ID } from "./image.ts";
import {
  selectBehaviour,
  selectLassoBehaviour,
  selectOvalBehaviour,
  selectTraceBehaviour,
  SELECT_GROUP_ID,
  SELECT_LASSO_TOOL_ID,
  SELECT_OVAL_TOOL_ID,
  SELECT_TOOL_ID,
  SELECT_TRACE_TOOL_ID,
} from "./select.ts";
import {
  arrowBehaviour,
  SHAPES_GROUP_ID,
  diamondBehaviour,
  doubleArrowBehaviour,
  ellipseBehaviour,
  hexagonBehaviour,
  lineBehaviour,
  pentagonBehaviour,
  rectangleBehaviour,
  roundRectBehaviour,
  starBehaviour,
  triangleBehaviour,
} from "./shapes.ts";
import { DEFAULT_TEXT_SIZE, TEXT_TOOL_ID, textBehaviour } from "./text.ts";

/** The shapes, in the order the picker lays them out: the four a paint program
 *  has always had first — rectangle, ellipse, line, arrow — then the ones a
 *  diagram wants, closed shapes before open ones.
 *
 *  Only those four carry a keyboard shortcut. A letter each for eleven shapes
 *  would eat most of the alphabet for marks that are one press apart in the
 *  picker anyway; the four that had one keep it. */
const SHAPES: readonly Omit<
  PaintPlugin,
  "group" | "defaultSize" | "gauge" | "dials"
>[] = [
  {
    id: "rectangle",
    nameKey: "tools.rectangle.name",
    descriptionKey: "tools.rectangle.description",
    icon: SquareIcon,
    shortcut: "r",
    supportsFill: true,
    behaviour: rectangleBehaviour,
  },
  {
    id: "ellipse",
    nameKey: "tools.ellipse.name",
    descriptionKey: "tools.ellipse.description",
    icon: CircleIcon,
    shortcut: "o",
    supportsFill: true,
    behaviour: ellipseBehaviour,
  },
  {
    id: "line",
    nameKey: "tools.line.name",
    descriptionKey: "tools.line.description",
    icon: LineIcon,
    shortcut: "l",
    behaviour: lineBehaviour,
  },
  {
    id: "arrow",
    nameKey: "tools.arrow.name",
    descriptionKey: "tools.arrow.description",
    icon: ArrowIcon,
    shortcut: "a",
    behaviour: arrowBehaviour,
  },
  {
    id: "roundrect",
    nameKey: "tools.roundrect.name",
    descriptionKey: "tools.roundrect.description",
    icon: RoundSquareIcon,
    supportsFill: true,
    behaviour: roundRectBehaviour,
  },
  {
    id: "triangle",
    nameKey: "tools.triangle.name",
    descriptionKey: "tools.triangle.description",
    icon: TriangleIcon,
    supportsFill: true,
    behaviour: triangleBehaviour,
  },
  {
    id: "diamond",
    nameKey: "tools.diamond.name",
    descriptionKey: "tools.diamond.description",
    icon: DiamondIcon,
    supportsFill: true,
    behaviour: diamondBehaviour,
  },
  {
    id: "pentagon",
    nameKey: "tools.pentagon.name",
    descriptionKey: "tools.pentagon.description",
    icon: PentagonIcon,
    supportsFill: true,
    behaviour: pentagonBehaviour,
  },
  {
    id: "hexagon",
    nameKey: "tools.hexagon.name",
    descriptionKey: "tools.hexagon.description",
    icon: HexagonIcon,
    supportsFill: true,
    behaviour: hexagonBehaviour,
  },
  {
    id: "star",
    nameKey: "tools.star.name",
    descriptionKey: "tools.star.description",
    icon: StarShapeIcon,
    supportsFill: true,
    behaviour: starBehaviour,
  },
  {
    id: "doublearrow",
    nameKey: "tools.doublearrow.name",
    descriptionKey: "tools.doublearrow.description",
    icon: DoubleArrowIcon,
    behaviour: doubleArrowBehaviour,
  },
];

/** The selection tools, in the order the picker lays them out: the box marquee
 *  every paint program opens with, the oval beside it, then the two that follow
 *  something — the loop your hand drew, and the contours the page itself has.
 *
 *  Only the box carries a shortcut, for the shapes' reason: the four are one
 *  press apart in the picker, and the letter the marquee has always answered to
 *  belongs to the one it has always meant. */
const SELECTIONS: readonly Omit<
  PaintPlugin,
  "group" | "selects" | "defaultSize" | "gauge" | "dials"
>[] = [
  {
    id: SELECT_TOOL_ID,
    nameKey: "tools.select.name",
    descriptionKey: "tools.select.description",
    icon: SelectIcon,
    shortcut: "v",
    behaviour: selectBehaviour,
  },
  {
    id: SELECT_OVAL_TOOL_ID,
    nameKey: "tools.selectOval.name",
    descriptionKey: "tools.selectOval.description",
    icon: SelectOvalIcon,
    behaviour: selectOvalBehaviour,
  },
  {
    id: SELECT_LASSO_TOOL_ID,
    nameKey: "tools.selectLasso.name",
    descriptionKey: "tools.selectLasso.description",
    icon: LassoIcon,
    behaviour: selectLassoBehaviour,
  },
  {
    id: SELECT_TRACE_TOOL_ID,
    nameKey: "tools.selectTrace.name",
    descriptionKey: "tools.selectTrace.description",
    icon: TraceSelectIcon,
    behaviour: selectTraceBehaviour,
  },
];

/** The id the rubbing-out family shares.
 *
 *  It is the **eraser's own plugin id**, exactly as the fill family took the
 *  bucket's and the selection family took the lone marquee's: that is the id
 *  every settings blob already has in its enabled list and its toolbar order, so
 *  an install carries straight into the family rather than losing its button.
 *
 *  Declared here rather than in a module of the family's own — where
 *  `SHAPES_GROUP_ID`, `SELECT_GROUP_ID` and `FILL_GROUP_ID` live — because both
 *  its members are `freehandBehaviour` with different ink and neither has a
 *  module to put it in. */
export const ERASER_GROUP_ID = "eraser";

/** Register the built-in tools. Idempotent — re-registering an id replaces it
 *  in place, so calling this twice (a hot reload, a test) is harmless. */
export function registerBuiltinPlugins(): void {
  // --- The pen -------------------------------------------------------------
  // The tool a blank page has to have, and the one every other row here is
  // measured against: whatever else is switched off, this is what is left (with
  // the erasers and the hand, which are core for reasons of their own).
  //
  // The pen used to be called the pencil and is still `pencil` on every stroke
  // ever drawn with it — an id is persisted and renaming one orphans marks, so
  // the *name* moved and the id stayed. What it draws has not changed: a plain
  // line at the width you set it to. The thing that actually looks like a
  // pencil is `graphite`, below.

  registerPlugin({
    id: "pencil",
    core: true,
    nameKey: "tools.pencil.name",
    descriptionKey: "tools.pencil.description",
    icon: PenIcon,
    shortcut: "p",
    // The ISO ladder every technical pen is drawn to, opening at 0.5 mm — the
    // liner that outsells all the others put together, and the one most hands
    // reach for without thinking (see `gauges.ts`). A pen draws at the width it
    // says it does, so the number is the mark.
    gauge: PEN_GAUGE,
    defaultSize: mm(0.5),
    // Liquid ink, but only just: a technical pen is dry the moment it leaves
    // the nib on any sized paper, and the one stock it feathers on is
    // newsprint — which is exactly what this number times an absorbency comes
    // out saying (see `PaintPlugin.wetness`).
    wetness: 0.18,
    // A line: every point of it is drawn where the path goes and nowhere else,
    // so a longer stroke repaints as the shorter one plus its new end (see
    // `PaintPlugin.grows`) and it reaches half its width past the path.
    grows: true,
    reach: 1,
    dials: [OPACITY],
    // The three lines a drawing pen is actually asked for — see `./presets.ts`
    // for what a preset is and for why several tools below have none.
    presets: PEN_PRESETS,
    behaviour: freehandBehaviour(),
  });

  // --- Then the media shelf ------------------------------------------------
  // Everything else that lays something down, sketching tool first.

  registerPlugin({
    id: "graphite",
    defaultOn: true,
    nameKey: "tools.graphite.name",
    descriptionKey: "tools.graphite.description",
    icon: PencilIcon,
    shortcut: "g",
    // The four leads a mechanical pencil takes, plus the 2 mm clutch lead. It
    // opens on 0.9 — 0.5 is the lead a shop sells most of, but this is a tool
    // for *sketching*, and a sketching hand wants the blunter point and the
    // lead that does not snap when it is leaned on. It opened on 0.7 back when
    // a pencil mark was specks scattered along the path; a lead pressed into
    // the page's tooth needs a face wide enough for the tooth to show in it
    // (see `./presets.ts`).
    gauge: PENCIL_GAUGE,
    defaultSize: mm(0.9),
    // The one axis a pencil has — how soft the lead is — and the opacity every
    // marking tool offers, for laying a light guide line in.
    dials: [GRADE, OPACITY],
    // The four pencils in the tin: a grade and a width together *are* a pencil,
    // which is the case this whole feature was built on.
    presets: PENCIL_PRESETS,
    // Graphite sits on the sheet rather than soaking into it, so a rubber takes
    // it off again — which is what the rubber reads to know a pencil line
    // from an inked one. It is the medium saying what it is made of, not a tool
    // recognising another tool by name.
    liftable: true,
    // Graphite is a mineral, not an ink: there is one colour in a pencil and it
    // came in the lead. So the toolbar's swatch is struck through while this is
    // in hand rather than opening a palette that changes nothing (see
    // `PaintPlugin.fixedInk`) — the grade below is the only colour control a
    // pencil has, and it is already on the panel.
    fixedInk: true,
    // …and, under the dials, the one rendering setting a pencil has: how finely
    // the simulation works a mark out (see `plugins/lead.ts`). A pencil presses
    // a lead into *this page's own sheet* and draws what the paper kept, and
    // that costs a field per mark — so how much of the field to run is the
    // pencil's option and not a setting somewhere about paper.
    options: LEAD_OPTIONS,
    behaviour: freehandBehaviour({
      style: "graphite",
      // The other half of that: the grey the lead is. The grade picks it, the
      // same grade that picks how much of it goes down — an 8H is a pale cool
      // scratch, a 9B nearly black — and the sheet flips the whole ladder, so
      // dark paper gets the silverpoint sheen rather than an invisible mark.
      ink: (ctx) => graphiteInk(ctx.background, ctx.dials.grade),
    }),
  });

  registerPlugin({
    id: "paintbrush",
    nameKey: "tools.paintbrush.name",
    descriptionKey: "tools.paintbrush.description",
    icon: BrushIcon,
    shortcut: "b",
    // The round, numbered the way the rack is — and it opens on a #6, which is
    // the brush most people would pick up first (see `gauges.ts`). A head lays
    // down exactly as wide a mark as it is, so there is no scale on it any
    // more; it used to be multiplied by two and a half, from before the number
    // on the button was a distance.
    gauge: ROUND_BRUSH_GAUGE,
    defaultSize: mm(4.8),
    // A head lays down a mark the width of the head (see the width budget in
    // `bristle.ts`), plus whatever the paper wicks past its edge — under a
    // whole width all told, where the unstated default assumes four. That is
    // the difference between a zoomed-in page painting the marks it is showing
    // and painting every mark within four brush-widths of the window.
    reach: 1,
    // A head of hair, and the four things about one that change the mark: how
    // wet and gathered it is, what gauge the hair is, how far the bundle has
    // worn open, and whether the paper under it wicks. Plus the opacity every
    // marking tool offers.
    // Body colour off a loaded head: wet enough to mix into what it is painted
    // over on any paper, nowhere near as wet as a wash.
    wetness: 0.6,
    dials: [OPACITY, HARDNESS, HAIR, SPLAY, BLEED],
    // Four heads rather than four widths — the hog, the dry brush and the
    // glaze are what those five dials are *for*.
    presets: BRUSH_PRESETS,
    behaviour: freehandBehaviour({
      style: "brush",
      useHardness: true,
    }),
  });

  // …and the other brush anyone owns. A flat is not a wide round: the ferrule
  // squeezes the bundle into a blade, so it lays its whole width square across
  // itself and closes to the thickness of the hair on its edge. That is one
  // stroke that swells and thins as it goes round a curve without the hand
  // doing anything, and it is why a sign-writer, a letterer and anyone laying a
  // flat wash owns one. It is a *different brush* rather than a setting on the
  // round, which is why it registers separately and carries the angle dial the
  // round has no use for (see `BrushHead`).

  registerPlugin({
    id: "flatbrush",
    nameKey: "tools.flatbrush.name",
    descriptionKey: "tools.flatbrush.description",
    icon: FlatBrushIcon,
    // Sold in fractions of an inch, opening on the half-inch one-stroke.
    gauge: FLAT_BRUSH_GAUGE,
    defaultSize: mm(12.7),
    // The round's box, for the round's reason — a blade is never wider than its
    // own width either.
    reach: 1,
    // The round's dials, plus the one thing a blade has that a cone does not:
    // which way it is turned. Held at −45° out of the box, the same tilt the
    // broad nib rests at, because it is the same right-handed wrist.
    wetness: 0.6,
    dials: [OPACITY, HARDNESS, ANGLE, SPLAY, BLEED],
    presets: FLAT_BRUSH_PRESETS,
    behaviour: freehandBehaviour({
      style: "brush",
      head: "flat",
      useHardness: true,
      angle: -45,
    }),
  });

  // --- Watercolour ---------------------------------------------------------
  // The one medium here where what you are painting with is *water*, and the
  // colour only goes where the water took it. It is a round brush like the one
  // above and nothing else about it is the same: the mark spreads past the hair
  // that laid it, both its edges follow the sheet rather than the gesture, the
  // rim dries darkest, the pigment settles into the paper's dips, and no layer
  // covers what is under it. See `plugins/aquarelle.ts`.

  registerPlugin({
    id: "watercolor",
    defaultOn: true,
    nameKey: "tools.watercolor.name",
    descriptionKey: "tools.watercolor.description",
    icon: WashBrushIcon,
    shortcut: "w",
    // A watercolourist's rack: rounds from a rigger's #1 to a #12, and a mop
    // for the sky. It opens on a #12 — it used to open on the #8 that is most
    // of a painting, and a wash that is *dried* rather than stroked wants the
    // page in it for the rim and the granulation to happen on (see
    // `./presets.ts`).
    gauge: WASH_GAUGE,
    defaultSize: mm(9.5),
    // Three things, and a watercolourist changes exactly these between one
    // stroke and the next: how much water is on the brush, how much colour is
    // in the water, and what the sheet does with what is left behind.
    // The wettest thing in the box, and the tool the whole ground mechanism
    // was built for: on paper a wash mixes with the colour it lands on, drags
    // a little of it into its own wet edge, and spreads past the hair further
    // the thirstier the sheet is. On the solid sheet it does none of that and
    // paints exactly as it always has.
    wetness: 1,
    dials: [OPACITY, WATER, PIGMENT, GRANULATION],
    // …and the one setting that is about the *painting* rather than about the
    // next mark: how finely the simulation resolves. It lives under the widths
    // with the dials, because it is judged by painting with it (see
    // `plugins/washOptions.ts`).
    options: WASH_OPTIONS,
    // Wet-in-wet, glaze and dry brush: the techniques those three dials are the
    // controls for, under the names a watercolourist already uses.
    presets: WASH_PRESETS,
    behaviour: freehandBehaviour({ style: "wash" }),
  });

  registerPlugin({
    id: "airspray",
    defaultOn: true,
    nameKey: "tools.airspray.name",
    descriptionKey: "tools.airspray.description",
    icon: SprayIcon,
    shortcut: "s",
    // **A width means the same thing here as everywhere else.** The airbrush
    // used to take its number times three and then spread a cone over 1.6 times
    // *that*, so a spray set to 8 came out nearly five times as wide as a pen
    // set to 8 — the one tool in the box where the number on the button did not
    // describe the mark. The scale below undoes exactly that: the painter
    // throws a cone 3.2 times what it is handed, so it is handed a 3.2nd of the
    // pattern being asked for. Old marks are untouched — the painter's maths
    // did not change, only how much of it a new stroke asks for.
    //
    // The number is now the *pattern width*, and it is measured the way a
    // sprayed one is: a gun set to 12 mm throws a 12 mm cone at the distance an
    // arm holds it. That is the general-purpose setting — the one an airbrush
    // spends most of its life on, between the detail work below it and the
    // backgrounds above.
    gauge: SPRAY_GAUGE,
    defaultSize: mm(12),
    // A spray cone: how tight its core is, and how much paint the trigger lets
    // through per pass.
    // Atomised: it has crossed a foot of air before it lands and most of the
    // solvent is gone by then, so it dries almost on contact.
    wetness: 0.15,
    // Cones stamped along the path, each one a function of where it sits and
    // of nothing that comes after it — so the canvas repaints a spray in flight
    // only where the hand has just been (see `PaintPlugin.grows`). It is the
    // tool that most needs it: a spray covering the screen is a few hundred
    // full-radius gradient fills, and it used to pay all of them every frame.
    grows: true,
    // The cone is 1.6 times the width, and the grain lands inside it. The
    // slack is deliberate and small: this is the number that decides how much
    // screen one frame of a spray repaints (see `PaintPlugin.reach`).
    reach: 2,
    dials: [HARDNESS, FLOW],
    presets: SPRAY_PRESETS,
    behaviour: freehandBehaviour({
      sizeScale: 1 / 3.2,
      style: "spray",
      useHardness: true,
    }),
  });

  // The marker and the highlighter used to be one tool twice: the same round
  // painter, told apart by a width and an opacity. They are two different pens
  // in the hand and now they are two different pens here — a felt tip is a
  // *shape*, and `paintNib` is what draws one (see `plugins/brushes.ts`).

  registerPlugin({
    id: "marker",
    nameKey: "tools.marker.name",
    descriptionKey: "tools.marker.description",
    icon: MarkerIcon,
    shortcut: "m",
    // A felt tip, from a fineliner up to the king-size one that labels a
    // packing crate — opening on the two-millimetre bullet, which is the tip on
    // the marker in everybody's drawer and the one it spends its life on. The
    // nib painter lays a mark exactly as wide as it is told, so there is no
    // scale on it any more (it used to be doubled).
    gauge: MARKER_GAUGE,
    defaultSize: mm(2),
    // Spirit ink: it soaks in rather than sitting on top, so a second pass over
    // the same line darkens it the way a real marker does.
    // Spirit ink, and the reason a marker on newsprint is a fat furry line and
    // a marker on layout paper is a crisp one.
    wetness: 0.5,
    // A nib stamped along the path — one more stamp on the end, and nothing
    // behind it moves (see `PaintPlugin.grows`) — and it is an ellipse half the
    // width across, whichever way it is turned.
    grows: true,
    reach: 1,
    dials: [OPACITY, CHISEL],
    presets: MARKER_PRESETS,
    behaviour: freehandBehaviour({
      opacity: 0.88,
      style: "nib",
      // Mostly round out of the box, and it has to agree with `CHISEL.default`
      // — that is what an untuned mark resolves to.
      chisel: 0.35,
      angle: -45,
    }),
  });

  registerPlugin({
    id: "highlighter",
    nameKey: "tools.highlighter.name",
    descriptionKey: "tools.highlighter.description",
    icon: HighlighterIcon,
    shortcut: "h",
    // Five millimetres of chisel — which is a line of type, and the whole job.
    // It used to be four multiplied by six, which came to about two millimetres
    // of page: a highlighter that could not cover the word it was over.
    gauge: HIGHLIGHTER_GAUGE,
    defaultSize: mm(5),
    wetness: 0.45,
    grows: true,
    reach: 1,
    dials: [OPACITY, CHISEL_FLAT],
    presets: HIGHLIGHTER_PRESETS,
    behaviour: freehandBehaviour({
      opacity: 0.35,
      style: "nib",
      // A wide flat wedge, held square across the page: an underline drawn left
      // to right gets the full band, a stroke drawn down the page gets the
      // hairline. That asymmetry is what a highlighter *is*, and it is the one
      // thing the old round painter could not say.
      chisel: 0.85,
      angle: 90,
    }),
  });

  registerPlugin({
    id: "crayon",
    nameKey: "tools.crayon.name",
    descriptionKey: "tools.crayon.description",
    icon: CrayonIcon,
    shortcut: "c",
    // The flat of a standard wax stick, eight millimetres across — wide enough
    // for the paper's tooth to show through the mark rather than swallow it,
    // and the face a crayon actually presents once it has been used twice.
    gauge: CRAYON_GAUGE,
    defaultSize: mm(8),
    // No wetness at all, which is the point of wax: a crayon on the wettest
    // paper there is behaves exactly as it does on glass, and a wash laid over
    // one goes round it. (Resisting the water is what a wax resist *is* — see
    // `docs/features/surface.md`.)
    dials: [OPACITY, PRESSURE],
    presets: CRAYON_PRESETS,
    // Wax is caught on the tooth the same way graphite is, and comes away the
    // same way — worse, in fact, since it smears. The other lifting medium.
    liftable: true,
    behaviour: freehandBehaviour({ style: "crayon" }),
  });

  registerPlugin({
    id: "calligraphy",
    nameKey: "tools.calligraphy.name",
    descriptionKey: "tools.calligraphy.description",
    icon: NibIcon,
    shortcut: "k",
    // A broad nib, sold by the width of its edge — from a Mitchell 6 up to the
    // poster nibs, opening on the 2.5 mm most italic hands are written with.
    // The painter draws a nib twice the number it is handed, so it is handed
    // half: the width on the button is the edge you would measure with a rule.
    gauge: NIB_GAUGE,
    defaultSize: mm(2.5),
    // The one thing a writer actually changes about a broad nib is the angle
    // they hold it at — turn it towards flat and the stroke that swells is the
    // vertical instead of the diagonal.
    // A broad nib carries a bead of ink and puts most of it on the page at
    // once, which is why writing on the wrong paper feathers.
    wetness: 0.5,
    // The nib is drawn a full width either side of the path (the tool halves
    // what the button says, so the edge is the number on the button).
    grows: true,
    reach: 1.5,
    dials: [OPACITY, ANGLE],
    // The three hands anyone is taught. A calligrapher changes the nib and the
    // angle they hold it at, and that is the whole difference between them.
    presets: NIB_PRESETS,
    behaviour: freehandBehaviour({
      sizeScale: 0.5,
      style: "calligraphy",
      // Agrees with `ANGLE.default`, which is what an untuned mark resolves to.
      angle: -45,
    }),
  });

  // --- Then taking a mark off ----------------------------------------------
  // The end of the media shelf, and the first of the three tools that work on
  // an *area* rather than on a line: rub one out, then fill what is left.
  //
  // The two rubbing-out tools share one button, the way the fills and the
  // shapes do. They are not two tools you choose between so much as one
  // question — *how much of this should go* — with two honest answers, and a
  // toolbar that spent a second permanent button on the second one would be
  // charging every user for a tool most of them will reach for twice a year.
  //
  // A second press on the eraser is exactly where the rubber belongs, and it is
  // what makes it findable at all: nobody goes looking in Settings → Tools for
  // an eraser they do not know exists.

  registerGroup({
    id: ERASER_GROUP_ID,
    // Core, because the eraser was: a canvas with no way to take a mark off is
    // not a canvas, and the family inherits the switch its first member had.
    core: true,
    nameKey: "tools.erasers.name",
    descriptionKey: "tools.erasers.description",
    icon: EraserIcon,
  });

  registerPlugin({
    id: "eraser",
    group: ERASER_GROUP_ID,
    nameKey: "tools.eraser.name",
    descriptionKey: "tools.eraser.description",
    icon: EraserIcon,
    shortcut: "e",
    // A block rubber, ten millimetres across the face — the one in a pencil
    // case, and wide enough that taking a passage out is one pass rather than
    // twenty. The scale is 1 because a rubber rubs out exactly as wide as it
    // is; it used to be 2.5, from before the number on the button was a
    // distance anyone could check.
    gauge: ERASER_GAUGE,
    defaultSize: mm(10),
    // Its width shows as a plain circle rather than as a press. Every other
    // tool previews the mark it leaves, but an eraser's mark is a *hole*: on
    // the bare page a preview is, it lifts nothing and shows nothing, and the
    // only way to picture it was to fabricate a blot of ink underneath for the
    // press to bite into — a mark nobody made, standing in for one you can't
    // see. The nib is round and the number is the nib, so the circle is both
    // the simpler drawing and the truer one.
    sizePreview: "circle",
    // How much one pass takes off. It is the ink's own alpha under
    // `destination-out` — see `STRENGTH` — so turning it down gives the pencil
    // eraser you knock a highlight back with, rather than the one that takes
    // the page to white in a single drag.
    dials: [STRENGTH],
    // A block, a corner, and the kneaded eraser you lift a highlight back with.
    presets: ERASER_PRESETS,
    // It takes ink *off*: the mark is painted with `destination-out`, so what
    // it covers is removed from the picture and the sheet comes back through
    // the hole (see `render.ts`). It used to paint the page colour instead,
    // which read the same on an opaque sheet and was wrong everywhere else — a
    // transparent export came out with page-coloured smears where the rubbing
    // out had been, and hiding the background layer showed them too.
    //
    // The stroke is still an ordinary mark in the document, so a rubbing out
    // undoes, syncs and re-renders exactly like the line it took off.
    erases: true,
    behaviour: freehandBehaviour({ erases: true }),
  });

  // …and the **rubber**, which is the other one of those and is a *medium*
  // rather than a hole. The two are named apart the way a stationer names them:
  // the eraser is the thing that removes a mistake, the rubber is the thing you
  // work a pencil drawing back with.
  //
  // The eraser above is indifferent to what is under it, because a hole is
  // indifferent: it goes through a pencil line and a marker line at the same
  // rate, and at full strength it takes the page back to white in one drag.
  // That is the tool you want for a mistake and it is not what a rubber does to
  // a drawing. Rub at a pencil passage with one and the passage does not go — it
  // goes paler, unevenly, with the sheet's tooth showing through what is left,
  // and paler again next time. Meanwhile the ink you drew *over* that pencil is
  // exactly where it was, because it soaked into the paper and no amount of
  // rubbing lifts it.
  //
  // Both halves are declared rather than coded anywhere: `lifts` says this
  // rubbing out only takes what a rubber could take, `liftable` on the pencil
  // and the crayon says what that is, and the renderer lays everything else back
  // over the hole (see `relayFixed` in `render.ts`). Which means the tool that
  // finally makes "sketch it, ink it, rub the sketch out" work is two flags, a
  // painter, and nothing else in the app.

  registerPlugin({
    id: "rubber",
    group: ERASER_GROUP_ID,
    nameKey: "tools.rubber.name",
    descriptionKey: "tools.rubber.description",
    icon: RubberIcon,
    // No shortcut. The letters near it are spoken for — **e** is the eraser it
    // shares a button with and **r** the rectangle — and the family is one press
    // away from a key that already works, which is the arrangement every other
    // grouped tool here has.
    //
    // The same rack the eraser is sold on, opening two steps down it: a rubber
    // you work a passage back with is held like a pencil rather than swept like
    // a board eraser, and 5 mm is the pocket one in a pencil case.
    gauge: ERASER_GAUGE,
    defaultSize: mm(5),
    // Its width shows as a circle, for the eraser's reason: a preview of a
    // rubbing out on a bare page has nothing to lift and nothing to show.
    sizePreview: "circle",
    // One dial, and it is the hand rather than the ink: how hard you lean on it,
    // which is how deep into the sheet the face reaches. See `RUB`.
    dials: [RUB],
    presets: RUBBER_PRESETS,
    erases: true,
    lifts: true,
    behaviour: freehandBehaviour({ erases: true, style: "rubber" }),
  });

  // --- …and then filling one ------------------------------------------------
  // Beside the erasers, above the vector tools.
  //
  // Two ways of filling one, behind one button — the shapes' arrangement, for a
  // reason of its own: the gradient is not a second tool so much as the bucket's
  // *other answer*. Same press, same flood, same area; poured from a ramp
  // instead of from one flat colour (see `gradient.ts`). A second press on the
  // bucket is where that belongs, and it costs the toolbar nothing.
  //
  // The group takes the bucket's own plugin id, exactly as the selection family
  // took the lone marquee's: that is the id an existing settings blob has in its
  // enabled list and its toolbar order, so an install that had the bucket
  // switched on gets the pair in the same slot rather than losing its button.

  registerGroup({
    id: FILL_GROUP_ID,
    defaultOn: true,
    nameKey: "tools.fills.name",
    descriptionKey: "tools.fills.description",
    icon: BucketIcon,
  });

  registerPlugin({
    id: "filler",
    group: FILL_GROUP_ID,
    nameKey: "tools.filler.name",
    descriptionKey: "tools.filler.description",
    icon: BucketIcon,
    shortcut: "f",
    // A bucket has no nib. It fills the area it traced, and it fills exactly
    // that area whether the width is set to two or to ninety-six — so it is
    // offered no width at all, and the toolbar puts a cog beside the ink for
    // the settings it does have instead (see `plugins/controls.ts`).
    sizeless: true,
    // A wash you can see through, and an edge that fades out rather than
    // stopping — the two things that separate a bucket from a paint pot.
    // It lays a wash rather than a coat, so on paper it mixes with the marks
    // it floods over instead of hiding them.
    wetness: 0.3,
    dials: [OPACITY, FEATHER],
    // The one set with no width in it, because the tool has none.
    presets: FILL_PRESETS,
    behaviour: fillBehaviour,
  });

  registerPlugin({
    id: GRADIENT_TOOL_ID,
    group: FILL_GROUP_ID,
    nameKey: "tools.gradient.name",
    descriptionKey: "tools.gradient.description",
    icon: GradientIcon,
    shortcut: "y",
    // A bucket's reason for having no width, and a bucket's two dials — what
    // separates them is what the area is filled *with*.
    sizeless: true,
    dials: [OPACITY, FEATHER],
    // …and that is this: the tool carries its own inks rather than drawing with
    // the toolbar's, which is also what dims the ink button while it is in hand
    // (see `plugins/swatches.ts`). Two ends and a middle that is off unless you
    // ask for it.
    swatches: GRADIENT_SWATCHES,
    behaviour: gradientBehaviour,
  });

  // --- Then the shapes, behind one button ----------------------------------
  // One button with the family behind it rather than a row of near-identical
  // squares.
  //
  // Eleven shapes as eleven buttons would be most of a phone's toolbar spent on
  // one idea, and eleven switches in Settings → Tools for a question nobody asks
  // eleven times. So they share a `ToolGroup`: the button wears the shape you
  // last held, a second press on it opens the rest of the family (and the fill
  // toggle), and Settings offers the lot as one row.
  //
  // Grouping is only about how they are *offered*. Each shape is still its own
  // plugin with its own painter, its own width and its own persisted id, so
  // every rectangle ever drawn in this app still says `rectangle` and still
  // paints — merging the buttons was not a change to the document.

  registerGroup({
    id: SHAPES_GROUP_ID,
    defaultOn: true,
    nameKey: "tools.shapes.name",
    descriptionKey: "tools.shapes.description",
    icon: ShapesIcon,
  });

  // The order below is the order the picker lays them out in: the four a paint
  // program has always had first — rectangle, ellipse, line, arrow — then the
  // ones a diagram wants, closed shapes before open ones.
  //
  // Only these four carry a keyboard shortcut. A letter each for eleven shapes
  // would eat most of the alphabet for marks that are one press apart in the
  // picker anyway; the four that had one keep it.

  for (const member of SHAPES) {
    registerPlugin({
      group: SHAPES_GROUP_ID,
      // A half-millimetre line: an outline you can see without zooming in, on
      // a page that is bigger than the screen. The same for every shape — they
      // draw at the width they are given, so the number is the line.
      gauge: STROKE_GAUGE,
      defaultSize: mm(0.5),
      dials: [OPACITY],
      // …and no presets. A rectangle is a rectangle: what varies is the width
      // of the line it is ruled with, and that is the width row already. The
      // one setting worth handing anybody is the half-millimetre line above,
      // which is where a setting that good belongs (see `./presets.ts`).
      ...member,
    });
  }

  // --- Then choosing marks rather than making them --------------------------
  // The marquee sits near the hand, because the two are a pair here: you select
  // with one and move what you selected with the other.
  //
  // Four ways of choosing, behind one button — the shapes' arrangement, for the
  // shapes' reason. Which *shape* you pick marks out with is a smaller question
  // than which tool you are holding, and four buttons for it would be four
  // slots of a phone's toolbar spent on one idea. The group keeps the id the
  // lone marquee had, so an install that had the marquee switched on gets the
  // family in the same slot (see `select.ts`).

  registerGroup({
    id: SELECT_GROUP_ID,
    defaultOn: true,
    nameKey: "tools.selection.name",
    descriptionKey: "tools.selection.description",
    icon: SelectIcon,
  });

  for (const member of SELECTIONS) {
    registerPlugin({
      group: SELECT_GROUP_ID,
      // The gesture chooses marks instead of leaving one: the canvas reads the
      // flag, asks the behaviour what was chosen, and hands the outline to the
      // screen rather than the document (see `select.ts`).
      selects: true,
      ...member,
    });
  }

  // --- Then typing ---------------------------------------------------------
  // Straight after the marquee, because that is the order a hand actually uses
  // them in: pick something out, then label it. It is the only tool whose mark
  // is entered rather than drawn — `entersText` is what tells the canvas to open
  // a caret instead of beginning a stroke (see `text.ts`).

  registerPlugin({
    id: TEXT_TOOL_ID,
    defaultOn: true,
    nameKey: "tools.text.name",
    descriptionKey: "tools.text.description",
    icon: TextIcon,
    shortcut: "t",
    entersText: true,
    // The width *is* the type size here, so the tool brings its own scale —
    // and its own *unit*: type is set in points everywhere outside this app,
    // and a caption measured in millimetres of page is a caption nobody can
    // compare against anything (see `TYPE_GAUGE`).
    gauge: TYPE_GAUGE,
    defaultSize: DEFAULT_TEXT_SIZE,
    dials: [OPACITY],
    // No presets, for the shapes' reason with one of its own on top: the size
    // row *is* the preset row for type, and the choices that would make a type
    // preset worth having — the face, the weight, the slant — are not dials at
    // all. They sit in the toolbar beside the caption you are typing.
    behaviour: textBehaviour,
  });

  // --- Last: the two that touch neither the ink nor the document -----------
  // The dropper reads a colour off the page and the hand moves the page, and
  // neither leaves a mark. They are the same kind of thing, they are the two you
  // reach for least, and they belong at the far end of the row together.
  //
  // The dropper used to open the toolbar, on Photoshop's reading that you choose
  // a colour before you lay it down. On a phone that put the one tool that draws
  // nothing under the thumb that reaches best.

  registerPlugin({
    id: "dropper",
    defaultOn: true,
    nameKey: "tools.dropper.name",
    descriptionKey: "tools.dropper.description",
    icon: DropperIcon,
    shortcut: "i",
    // Reads the page instead of marking it — the press asks the tool what it
    // sampled and the answer is pinned as the ink (see `dropper.ts`).
    picksColor: true,
    // How much page one press reads. It is the only setting a dropper has ever
    // had anywhere, and it is the difference between sampling an airbrushed
    // passage and sampling one speck of the spray that made it — so the tool
    // that used to carry no button at all now carries the cog (see
    // `plugins/controls.ts`).
    dials: [SAMPLE],
    behaviour: dropperBehaviour,
  });

  registerPlugin({
    id: "hand",
    core: true,
    nameKey: "tools.hand.name",
    descriptionKey: "tools.hand.description",
    icon: HandIcon,
    shortcut: "d",
    // The one tool that moves the view instead of the document: drag to pan,
    // double-tap to fit. See `hand.ts` for why it is a plugin at all.
    navigates: true,
    behaviour: handBehaviour,
  });

  // --- The painter with no button ------------------------------------------
  // A dropped bitmap is a stroke like any other, so it names a plugin; there is
  // simply no gesture that draws one, and `hidden` keeps it out of the toolbar
  // and out of Settings → Tools. See `image.ts`.

  registerPlugin({
    id: IMAGE_TOOL_ID,
    hidden: true,
    nameKey: "tools.image.name",
    descriptionKey: "tools.image.description",
    icon: ImageIcon,
    behaviour: imageBehaviour,
  });
}
