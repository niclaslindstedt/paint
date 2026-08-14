// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The tools this build ships, registered in toolbar order.
//
// Importing this module is what puts them in the registry — `src/main.tsx`
// does it once, before the app mounts. Registration order is the toolbar's
// *default* order, and it is deliberate: it reads down Photoshop's tool column,
// so a hand that already knows one toolbar finds this one where it expects to.
// Sample, then paint, then erase, then fill, then type, then the shapes, then
// the marquee, and the tool that moves the view last of all — that column with
// the gaps closed up, since crop and pen paths are tools this app has no
// business shipping. Anyone who disagrees can drag the rows into another order
// in Settings → Tools, and the toolbar follows (see `orderEntries`).
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
// The eleven shapes are the case — see the shapes block below.
//
// **What a first run finds is the shape of Paint**: a nib, an airbrush, a
// rubber, a bucket, a dropper, type, the shapes and the marquee — the toolbox
// anyone who has opened a paint program has already used, spray can included.
// The rest of the media (the bristle brush, the marker, the crayon, the chalk
// nib, the highlighter) are the app's own additions and are one tap away in
// Settings → Tools; they are not what an empty page should open holding.
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
  ImageUpIcon,
  PencilIcon,
} from "@niclaslindstedt/oss-framework/components";

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
  HandIcon,
  HexagonIcon,
  HighlighterIcon,
  LineIcon,
  MarkerIcon,
  NibIcon,
  PentagonIcon,
  RoundSquareIcon,
  SelectIcon,
  ShapesIcon,
  SprayIcon,
  SquareIcon,
  StarShapeIcon,
  TextIcon,
  TriangleIcon,
} from "../../icons.tsx";
import { registerGroup, registerPlugin } from "../registry.ts";
import type { PaintPlugin } from "../types.ts";
import {
  BLEED,
  FEATHER,
  FLOW,
  HAIR,
  HARDNESS,
  OPACITY,
  PRESSURE,
  SPLAY,
} from "./dials.ts";
import { dropperBehaviour } from "./dropper.ts";
import { fillBehaviour } from "./fill.ts";
import { freehandBehaviour } from "./freehand.ts";
import { handBehaviour } from "./hand.ts";
import { imageBehaviour, IMAGE_TOOL_ID } from "./image.ts";
import { selectBehaviour, SELECT_TOOL_ID } from "./select.ts";
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
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZES,
  TEXT_TOOL_ID,
  textBehaviour,
} from "./text.ts";

/** The shapes, in the order the picker lays them out: the four a paint program
 *  has always had first — rectangle, ellipse, line, arrow — then the ones a
 *  diagram wants, closed shapes before open ones.
 *
 *  Only those four carry a keyboard shortcut. A letter each for eleven shapes
 *  would eat most of the alphabet for marks that are one press apart in the
 *  picker anyway; the four that had one keep it. */
const SHAPES: readonly Omit<PaintPlugin, "group" | "defaultSize" | "dials">[] =
  [
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

/** Register the built-in tools. Idempotent — re-registering an id replaces it
 *  in place, so calling this twice (a hot reload, a test) is harmless. */
export function registerBuiltinPlugins(): void {
  // --- Sample first --------------------------------------------------------
  // Photoshop's eyedropper sits above the paint tools, on the reading that you
  // choose the colour before you lay it down. Ours is the first button for the
  // same reason — and being the leftmost tool costs nothing, because it draws
  // nothing and `picksColor` keeps the canvas from ever falling back onto it.

  registerPlugin({
    id: "dropper",
    defaultOn: true,
    nameKey: "tools.dropper.name",
    descriptionKey: "tools.dropper.description",
    icon: DropperIcon,
    shortcut: "i",
    // Reads the page instead of marking it — the canvas samples the colour
    // under the press and pins it as the ink (see `dropper.ts`).
    picksColor: true,
    behaviour: dropperBehaviour,
  });

  // --- Then the tools that lay ink down ------------------------------------
  // Photoshop's brush block, in the same place in the column: the hard nib
  // first, then the soft ones, then the media, then the effect.

  registerPlugin({
    id: "pencil",
    core: true,
    nameKey: "tools.pencil.name",
    descriptionKey: "tools.pencil.description",
    icon: PencilIcon,
    shortcut: "p",
    // A pencil draws at the width it says it does, so this is the mark itself:
    // fine enough to write with, wide enough to see on a 4K page.
    defaultSize: 3,
    dials: [OPACITY],
    behaviour: freehandBehaviour(),
  });

  registerPlugin({
    id: "paintbrush",
    nameKey: "tools.paintbrush.name",
    descriptionKey: "tools.paintbrush.description",
    icon: BrushIcon,
    shortcut: "b",
    // 6 × 2.5 — a loaded round brush about fifteen pixels across, which is the
    // width a bristle head's streaks actually read at.
    defaultSize: 6,
    // A head of hair, and the four things about one that change the mark: how
    // wet and gathered it is, what gauge the hair is, how far the bundle has
    // worn open, and whether the paper under it wicks. Plus the opacity every
    // marking tool offers.
    dials: [OPACITY, HARDNESS, HAIR, SPLAY, BLEED],
    behaviour: freehandBehaviour({
      sizeScale: 2.5,
      style: "brush",
      useHardness: true,
    }),
  });

  registerPlugin({
    id: "airspray",
    defaultOn: true,
    nameKey: "tools.airspray.name",
    descriptionKey: "tools.airspray.description",
    icon: SprayIcon,
    shortcut: "s",
    // 8 × 3 — a cone two dozen pixels wide. A spray narrower than that is a
    // grainy pencil, which is not what anyone reaches for an airbrush to get.
    defaultSize: 8,
    // A spray cone: how tight its core is, and how much paint the trigger lets
    // through per pass.
    dials: [HARDNESS, FLOW],
    behaviour: freehandBehaviour({
      sizeScale: 3,
      style: "spray",
      useHardness: true,
    }),
  });

  registerPlugin({
    id: "marker",
    nameKey: "tools.marker.name",
    descriptionKey: "tools.marker.description",
    icon: MarkerIcon,
    shortcut: "m",
    // 6 × 3 — a chisel marker's broad edge.
    defaultSize: 6,
    dials: [OPACITY],
    behaviour: freehandBehaviour({ sizeScale: 3 }),
  });

  registerPlugin({
    id: "highlighter",
    nameKey: "tools.highlighter.name",
    descriptionKey: "tools.highlighter.description",
    icon: HighlighterIcon,
    shortcut: "h",
    // 4 × 6 — a band wide enough to cover a line of writing in one pass.
    defaultSize: 4,
    dials: [OPACITY],
    behaviour: freehandBehaviour({ sizeScale: 6, opacity: 0.35 }),
  });

  registerPlugin({
    id: "crayon",
    nameKey: "tools.crayon.name",
    descriptionKey: "tools.crayon.description",
    icon: CrayonIcon,
    shortcut: "c",
    // 6 × 2 — a wax stick's flat, and wide enough for the paper's tooth to
    // show through the mark rather than swallow it.
    defaultSize: 6,
    dials: [OPACITY, PRESSURE],
    behaviour: freehandBehaviour({ sizeScale: 2, style: "crayon" }),
  });

  registerPlugin({
    id: "calligraphy",
    nameKey: "tools.calligraphy.name",
    descriptionKey: "tools.calligraphy.description",
    icon: NibIcon,
    shortcut: "k",
    // 8 × 1.5 — a broad nib. Below about ten pixels across, the difference
    // between the flat and the edge is the difference the tool is *for*, and it
    // disappears.
    defaultSize: 8,
    dials: [OPACITY],
    behaviour: freehandBehaviour({ sizeScale: 1.5, style: "calligraphy" }),
  });

  // --- Then taking ink off again -------------------------------------------
  // Directly under the brushes, where Photoshop keeps it. It used to sit at the
  // far right, opposite the hand; next to the tools whose marks it undoes is
  // both the more familiar place and the shorter trip.

  registerPlugin({
    id: "eraser",
    core: true,
    nameKey: "tools.eraser.name",
    descriptionKey: "tools.eraser.description",
    icon: EraserIcon,
    shortcut: "e",
    // 8 × 2.5 — a rubber you can actually rub something out with. An eraser the
    // width of the pencil takes as many passes as the drawing took.
    defaultSize: 8,
    // The eraser paints the page colour rather than removing strokes: a vector
    // document has no pixels to clear, and painting over is what makes an
    // eraser stroke undoable like any other mark.
    usesBackground: true,
    // Rubbing out one mark and wiping the page are the same intent at two
    // scales, so they share a button: press the eraser a second time and it
    // offers both. That is what took the bin out of the header.
    clearsPage: true,
    behaviour: freehandBehaviour({ useBackground: true, sizeScale: 2.5 }),
  });

  // --- Then filling an area ------------------------------------------------
  // Photoshop's gradient/bucket slot: below the eraser, above the vector tools.

  registerPlugin({
    id: "filler",
    defaultOn: true,
    nameKey: "tools.filler.name",
    descriptionKey: "tools.filler.description",
    icon: BucketIcon,
    shortcut: "f",
    // A wash you can see through, and an edge that fades out rather than
    // stopping — the two things that separate a bucket from a paint pot.
    dials: [OPACITY, FEATHER],
    behaviour: fillBehaviour,
  });

  // --- Then typing ---------------------------------------------------------
  // Photoshop's type tool sits between the fill tools and the shapes, and so
  // does this one. It is the only tool whose mark is entered rather than drawn:
  // `entersText` is what tells the canvas to open a caret instead of beginning a
  // stroke (see `text.ts`).

  registerPlugin({
    id: TEXT_TOOL_ID,
    defaultOn: true,
    nameKey: "tools.text.name",
    descriptionKey: "tools.text.description",
    icon: TextIcon,
    shortcut: "t",
    entersText: true,
    // The width *is* the type size here, so the tool brings its own scale: the
    // three nib widths every other tool shares are all unreadable as type.
    defaultSize: DEFAULT_TEXT_SIZE,
    sizes: TEXT_SIZES,
    dials: [OPACITY],
    behaviour: textBehaviour,
  });

  // --- Then the shapes, behind one button ----------------------------------
  // Photoshop's shape slot, in its place near the bottom of the column — and,
  // like Photoshop's, it is one button with the family behind it rather than a
  // row of near-identical squares.
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
      // An outline you can see without zooming in, on a page that is bigger
      // than the screen. The same for every shape — they draw at the width they
      // are given, so the number is the line.
      defaultSize: 4,
      dials: [OPACITY],
      ...member,
    });
  }

  // --- Then choosing marks rather than making them --------------------------
  // Photoshop keeps its marquee at the very top; this one sits beside the hand,
  // because the two are a pair here: you select with one and move what you
  // selected with the other.

  registerPlugin({
    id: SELECT_TOOL_ID,
    defaultOn: true,
    nameKey: "tools.select.name",
    descriptionKey: "tools.select.description",
    icon: SelectIcon,
    shortcut: "v",
    // The drag chooses marks instead of leaving one: the canvas reads the flag
    // and hands the box to the screen rather than the document (see
    // `select.ts`).
    selects: true,
    behaviour: selectBehaviour,
  });

  // --- Last: the tool that moves the view ----------------------------------
  // The hand is the bottom of Photoshop's column, under everything that touches
  // the document, and it is the end of the row here for the same reason: the
  // one tool that moves the page rather than marking it belongs out of the way
  // of the ones that do.

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
    icon: ImageUpIcon,
    behaviour: imageBehaviour,
  });
}
