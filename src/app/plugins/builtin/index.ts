// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The tools this build ships, registered in toolbar order.
//
// Importing this module is what puts them in the registry — `src/main.tsx`
// does it once, before the app mounts. Registration order *is* toolbar order,
// and it is deliberate: the hand sits at the far left, where the tool that
// moves the page rather than marking it is out of the way of the ones that do;
// the eraser sits at the far right, opposite it, because it is the tool you
// reach for by feel. Everything that draws lives between them.
//
// Whether a tool is *in* the toolbar is a separate question from where it sits,
// and it has three answers (see `plugins/types.ts`): `core` tools are always
// there, `defaultOn` ones are there until you switch them off, and the rest
// wait in Settings → Tools until you switch them on. Switching one on slots it
// into its registration position rather than appending it, so the toolbar's
// order never depends on the order you discovered it in.
//
// Adding a tool is: write its behaviour (or reuse a family factory), register
// it here, and add its two catalog strings. Nothing else in the app changes.

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
  DropperIcon,
  EraserIcon,
  GlowIcon,
  HandIcon,
  HighlighterIcon,
  LineIcon,
  MarkerIcon,
  NibIcon,
  SprayIcon,
  SquareIcon,
} from "../../icons.tsx";
import { registerPlugin } from "../registry.ts";
import { dropperBehaviour } from "./dropper.ts";
import { fillBehaviour } from "./fill.ts";
import { freehandBehaviour } from "./freehand.ts";
import { handBehaviour } from "./hand.ts";
import { imageBehaviour, IMAGE_TOOL_ID } from "./image.ts";
import {
  arrowBehaviour,
  ellipseBehaviour,
  lineBehaviour,
  rectangleBehaviour,
} from "./shapes.ts";

/** Register the built-in tools. Idempotent — re-registering an id replaces it
 *  in place, so calling this twice (a hot reload, a test) is harmless. */
export function registerBuiltinPlugins(): void {
  // --- The far left: the tool that moves the page --------------------------

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

  // --- The drawing tools ---------------------------------------------------

  registerPlugin({
    id: "pencil",
    core: true,
    nameKey: "tools.pencil.name",
    descriptionKey: "tools.pencil.description",
    icon: PencilIcon,
    shortcut: "p",
    behaviour: freehandBehaviour(),
  });

  registerPlugin({
    id: "paintbrush",
    defaultOn: true,
    nameKey: "tools.paintbrush.name",
    descriptionKey: "tools.paintbrush.description",
    icon: BrushIcon,
    shortcut: "b",
    supportsHardness: true,
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
    supportsHardness: true,
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
    behaviour: freehandBehaviour({ sizeScale: 3 }),
  });

  registerPlugin({
    id: "highlighter",
    nameKey: "tools.highlighter.name",
    descriptionKey: "tools.highlighter.description",
    icon: HighlighterIcon,
    shortcut: "h",
    behaviour: freehandBehaviour({ sizeScale: 6, opacity: 0.35 }),
  });

  registerPlugin({
    id: "crayon",
    nameKey: "tools.crayon.name",
    descriptionKey: "tools.crayon.description",
    icon: CrayonIcon,
    shortcut: "c",
    behaviour: freehandBehaviour({ sizeScale: 2, style: "crayon" }),
  });

  registerPlugin({
    id: "calligraphy",
    nameKey: "tools.calligraphy.name",
    descriptionKey: "tools.calligraphy.description",
    icon: NibIcon,
    shortcut: "k",
    behaviour: freehandBehaviour({ sizeScale: 1.5, style: "calligraphy" }),
  });

  registerPlugin({
    id: "glow",
    nameKey: "tools.glow.name",
    descriptionKey: "tools.glow.description",
    icon: GlowIcon,
    shortcut: "n",
    behaviour: freehandBehaviour({ sizeScale: 1.5, style: "glow" }),
  });

  // --- The shape tools -----------------------------------------------------
  // Off out of the box. A sketchpad is opened to draw on, not to diagram in,
  // and four shape buttons on a phone toolbar crowd out the brushes for
  // something a minority of sessions ever reaches for. One tap in Settings →
  // Tools brings back whichever of them you actually want.

  registerPlugin({
    id: "line",
    nameKey: "tools.line.name",
    descriptionKey: "tools.line.description",
    icon: LineIcon,
    shortcut: "l",
    behaviour: lineBehaviour,
  });

  registerPlugin({
    id: "arrow",
    nameKey: "tools.arrow.name",
    descriptionKey: "tools.arrow.description",
    icon: ArrowIcon,
    shortcut: "a",
    behaviour: arrowBehaviour,
  });

  registerPlugin({
    id: "rectangle",
    nameKey: "tools.rectangle.name",
    descriptionKey: "tools.rectangle.description",
    icon: SquareIcon,
    shortcut: "r",
    supportsFill: true,
    behaviour: rectangleBehaviour,
  });

  registerPlugin({
    id: "ellipse",
    nameKey: "tools.ellipse.name",
    descriptionKey: "tools.ellipse.description",
    icon: CircleIcon,
    shortcut: "o",
    supportsFill: true,
    behaviour: ellipseBehaviour,
  });

  // --- The colour tools ----------------------------------------------------

  registerPlugin({
    id: "filler",
    defaultOn: true,
    nameKey: "tools.filler.name",
    descriptionKey: "tools.filler.description",
    icon: BucketIcon,
    shortcut: "f",
    behaviour: fillBehaviour,
  });

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

  // --- The far right: the eraser -------------------------------------------

  registerPlugin({
    id: "eraser",
    core: true,
    nameKey: "tools.eraser.name",
    descriptionKey: "tools.eraser.description",
    icon: EraserIcon,
    shortcut: "e",
    // The eraser paints the page colour rather than removing strokes: a vector
    // document has no pixels to clear, and painting over is what makes an
    // eraser stroke undoable like any other mark.
    usesBackground: true,
    behaviour: freehandBehaviour({ useBackground: true, sizeScale: 2.5 }),
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
