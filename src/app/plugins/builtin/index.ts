// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The tools this build ships, registered in toolbar order.
//
// Importing this module is what puts them in the registry — `src/main.tsx`
// does it once, before the app mounts. The split between `core` and the rest is
// the whole opt-in story: core tools are always in the toolbar, the others are
// listed under Settings → Tools and join it when switched on.
//
// Adding a tool is: write its behaviour (or reuse a family factory), register
// it here, and add its two catalog strings. Nothing else in the app changes.

import { PencilIcon } from "@niclaslindstedt/oss-framework/components";

import {
  ArrowIcon,
  CircleIcon,
  EraserIcon,
  HighlighterIcon,
  LineIcon,
  MarkerIcon,
  SquareIcon,
} from "../../icons.tsx";
import { registerPlugin } from "../registry.ts";
import { freehandBehaviour } from "./freehand.ts";
import {
  arrowBehaviour,
  ellipseBehaviour,
  lineBehaviour,
  rectangleBehaviour,
} from "./shapes.ts";

/** Register the built-in tools. Idempotent — re-registering an id replaces it
 *  in place, so calling this twice (a hot reload, a test) is harmless. */
export function registerBuiltinPlugins(): void {
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

  registerPlugin({
    id: "line",
    core: true,
    nameKey: "tools.line.name",
    descriptionKey: "tools.line.description",
    icon: LineIcon,
    shortcut: "l",
    behaviour: lineBehaviour,
  });

  registerPlugin({
    id: "rectangle",
    core: true,
    nameKey: "tools.rectangle.name",
    descriptionKey: "tools.rectangle.description",
    icon: SquareIcon,
    shortcut: "r",
    supportsFill: true,
    behaviour: rectangleBehaviour,
  });

  registerPlugin({
    id: "ellipse",
    core: true,
    nameKey: "tools.ellipse.name",
    descriptionKey: "tools.ellipse.description",
    icon: CircleIcon,
    shortcut: "o",
    supportsFill: true,
    behaviour: ellipseBehaviour,
  });

  // --- Opt-in tools (Settings → Tools) ------------------------------------
  // Off by default so the toolbar stays a beginner's five; each one is a
  // one-tap upgrade for someone who wants it.

  registerPlugin({
    id: "arrow",
    nameKey: "tools.arrow.name",
    descriptionKey: "tools.arrow.description",
    icon: ArrowIcon,
    shortcut: "a",
    behaviour: arrowBehaviour,
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
}
