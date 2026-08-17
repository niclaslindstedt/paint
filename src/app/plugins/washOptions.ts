// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the watercolour brush offers past its width and its dials: how finely
// the pigment simulation resolves.
//
// It is a `ToolOption` — an app-wide rendering setting declared by the tool it
// is about (see `plugins/options.ts`) — so it is set in the panel the size
// button opens, with the brush in your hand and the page you are painting
// behind it. It used to be a section of Settings → Tools, which was the wrong
// room for it: how a wash is worked out is a property of the brush rather than
// of the app, and it is a choice nobody can make by reading about it.
//
// **This file used to hold a second option, and losing it is the point.** The
// build shipped two watercolours — a stroke model and the pigment simulation —
// offered here as a picker with a painted swatch under each answer, because the
// difference between them is a picture and no paragraph claiming "more
// realistic" is worth anything beside two swatches of the same stroke. That was
// the right way to ask the question and it was still a question nobody should
// have had to answer. There is one watercolour now (see `plugins/wash.ts`), so
// there is nothing to show side by side and no answer to give — only the slider
// below, which is about what the mark *costs* rather than about what it is.

import {
  MAX_WASH_DETAIL,
  MIN_WASH_DETAIL,
  DEFAULT_WASH_DETAIL,
} from "./wash.ts";
import type { ToolOption } from "./types.ts";

/** How much of the simulation's field to actually run.
 *
 *  A twentieth at a time: the cost goes as the square, so the useful part of the
 *  track is the bottom of it, and a step there has to be small enough to find
 *  the point where a page still paints fast enough. */
export const WASH_DETAIL_OPTION: ToolOption = {
  kind: "range",
  id: "washDetail",
  nameKey: "options.washDetail",
  hintKey: "options.washDetailHint",
  min: MIN_WASH_DETAIL,
  max: MAX_WASH_DETAIL,
  step: 0.05,
  default: DEFAULT_WASH_DETAIL,
};

/** The brush's options — one of them, now. Still a list, because that is what a
 *  plugin declares and what the panel renders (see `plugins/options.ts`); a
 *  tool growing a second one back should not be a change to the seam. */
export const WASH_OPTIONS: readonly ToolOption[] = [WASH_DETAIL_OPTION];
