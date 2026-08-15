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
// So it reads: the pen you draw with, the rubber that undoes it, then the rest
// of the media in a shelf of their own, then the fills, then the two other
// families (shapes, then choosing marks), then type — which is what you reach for
// right after picking something out — and last the two tools that touch neither
// the ink nor the document: the dropper that reads a colour off the page, and
// the hand that moves the page. Those two are a pair and they belong at the far
// end together.
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
// Three families are the case — the eleven shapes, the four ways of selecting,
// and the two ways of filling an area — and all three are below.
//
// **What a first run finds is the shape of Paint**: a pen, a pencil, a rubber,
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
  SAMPLE,
  SPLAY,
  STRENGTH,
  WATER,
} from "./dials.ts";
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

/** Register the built-in tools. Idempotent — re-registering an id replaces it
 *  in place, so calling this twice (a hot reload, a test) is harmless. */
export function registerBuiltinPlugins(): void {
  // --- The pen, and the rubber that undoes it ------------------------------
  // The two tools a blank page has to have, and the two the user asked to have
  // beside each other: whatever else is switched off, these are what is left.
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
    // The ISO ladder every technical pen is drawn to, opening at 0.35 mm —
    // which is the one you write with (see `gauges.ts`). A pen draws at the
    // width it says it does, so the number is the mark.
    gauge: PEN_GAUGE,
    defaultSize: mm(0.35),
    dials: [OPACITY],
    behaviour: freehandBehaviour(),
  });

  registerPlugin({
    id: "eraser",
    core: true,
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

  // --- Then the media shelf ------------------------------------------------
  // Everything else that lays something down, sketching tool first.

  registerPlugin({
    id: "graphite",
    defaultOn: true,
    nameKey: "tools.graphite.name",
    descriptionKey: "tools.graphite.description",
    icon: PencilIcon,
    shortcut: "g",
    // The four leads a mechanical pencil takes, plus the 2 mm clutch lead, and
    // it opens on the 0.5 mm everybody sketches with. A sharp lead draws at the
    // width it says it is.
    gauge: PENCIL_GAUGE,
    defaultSize: mm(0.5),
    // The one axis a pencil has — how soft the lead is — and the opacity every
    // marking tool offers, for laying a light guide line in.
    dials: [GRADE, OPACITY],
    behaviour: freehandBehaviour({
      style: "graphite",
      // Graphite is a mineral, not an ink: the tool mixes its own grey and the
      // toolbar's colour means nothing to it. Which grey depends on the sheet
      // — dark paper gets the silverpoint sheen rather than an invisible mark.
      ink: (ctx) => graphiteInk(ctx.background),
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
    // A head of hair, and the four things about one that change the mark: how
    // wet and gathered it is, what gauge the hair is, how far the bundle has
    // worn open, and whether the paper under it wicks. Plus the opacity every
    // marking tool offers.
    dials: [OPACITY, HARDNESS, HAIR, SPLAY, BLEED],
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
    // The round's dials, plus the one thing a blade has that a cone does not:
    // which way it is turned. Held at −45° out of the box, the same tilt the
    // broad nib rests at, because it is the same right-handed wrist.
    dials: [OPACITY, HARDNESS, ANGLE, SPLAY, BLEED],
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
    // for the sky. It opens on a #8, which is most of a painting.
    gauge: WASH_GAUGE,
    defaultSize: mm(6.3),
    // Three things, and a watercolourist changes exactly these between one
    // stroke and the next: how much water is on the brush, how much colour is
    // in the water, and what the sheet does with what is left behind.
    dials: [OPACITY, WATER, PIGMENT, GRANULATION],
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
    // sprayed one is: a gun set to 8 mm throws an 8 mm cone at the distance an
    // arm holds it, which is the general-purpose setting.
    gauge: SPRAY_GAUGE,
    defaultSize: mm(8),
    // A spray cone: how tight its core is, and how much paint the trigger lets
    // through per pass.
    dials: [HARDNESS, FLOW],
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
    // packing crate — opening on a one-millimetre bullet, which is what most
    // people mean by "a marker" and what most people want to write with. The
    // nib painter lays a mark exactly as wide as it is told, so there is no
    // scale on it any more (it used to be doubled).
    gauge: MARKER_GAUGE,
    defaultSize: mm(1),
    // Spirit ink: it soaks in rather than sitting on top, so a second pass over
    // the same line darkens it the way a real marker does.
    dials: [OPACITY, CHISEL],
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
    dials: [OPACITY, CHISEL_FLAT],
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
    dials: [OPACITY, PRESSURE],
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
    dials: [OPACITY, ANGLE],
    behaviour: freehandBehaviour({
      sizeScale: 0.5,
      style: "calligraphy",
      // Agrees with `ANGLE.default`, which is what an untuned mark resolves to.
      angle: -45,
    }),
  });

  // --- Then filling an area ------------------------------------------------
  // Below the media, above the vector tools.
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
    dials: [OPACITY, FEATHER],
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
