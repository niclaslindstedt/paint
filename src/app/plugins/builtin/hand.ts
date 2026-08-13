// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hand: the one tool that draws nothing.
//
// It exists because the page is bigger than the screen and a one-finger drag was
// already spoken for by drawing. Two fingers pan, but that is a gesture you have
// to know, it needs a second hand on a phone, and a mouse hasn't got it at all.
// With the hand picked, a plain drag moves the page and a double-tap fits it.
//
// The behaviour is deliberately inert rather than absent: the hand is a plugin
// like every other tool, so the toolbar, the shortcut table, and Settings → Tools
// pick it up with no special case. What makes it pan is the `navigates` flag on
// its descriptor, which `PaintCanvas` reads — never the tool's id.

import type { ToolBehaviour } from "../types.ts";

/** A behaviour that begins no stroke and paints nothing. `start` returning
 *  `null` is the contract's own "ignore this press", so a hand gesture can never
 *  reach the draft, the document, or the undo history. */
export const handBehaviour: ToolBehaviour = {
  start: () => null,
  move: (draft) => draft,
  paint: () => {},
};
