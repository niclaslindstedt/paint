// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The colour dropper: the second tool that draws nothing.
//
// Press anywhere and the colour under the pointer becomes the ink — the way you
// pick a shade back up half an hour after mixing it, without hunting for it in
// the palette. It reads the *painted* page rather than the document, so it can
// sample a colour that only exists where two translucent passes overlap.
//
// Like the hand, it is a plugin whose behaviour is deliberately inert: the
// toolbar, the shortcut table and Settings → Tools pick it up with no special
// case, and what makes the press sample instead of draw is the `picksColor`
// flag on its descriptor, which `PaintCanvas` reads. Nothing branches on its id.

import type { ToolBehaviour } from "../types.ts";

/** Begins no stroke, paints nothing — a sampled colour is a change to the
 *  toolbar, not a mark on the page, so nothing must reach the document or the
 *  undo history. */
export const dropperBehaviour: ToolBehaviour = {
  start: () => null,
  move: (draft) => draft,
  paint: () => {},
};
