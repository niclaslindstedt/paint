// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the pencil offers past its width and its dials: how finely the graphite
// simulation works a mark out.
//
// It is a `ToolOption` — an app-wide rendering setting declared by the tool it
// is about (see `plugins/options.ts`) — so it is set in the panel the size
// button opens, with the pencil in your hand and the page you are drawing on
// behind it. The same room the wash's detail is set in, for the same reason: it
// is a property of the implement rather than of the app.
//
// **This file used to hold a second option, and losing it is the point.** The
// build shipped two pencils — a stroke model and the graphite simulation —
// offered here as a picker with a drawn swatch under each answer, on
// cold-pressed stock because the sheet is what separated them. That was the
// right way to ask the question and it was still a question nobody should have
// had to answer. There is one pencil now (see `plugins/lead.ts`), so there is
// nothing to show side by side and no answer to give — only the slider below,
// which is about what the mark *costs* rather than about what it is.

import {
  DEFAULT_LEAD_DETAIL,
  MAX_LEAD_DETAIL,
  MIN_LEAD_DETAIL,
} from "./lead.ts";
import type { ToolOption } from "./types.ts";

/** How finely the simulation actually works a mark out.
 *
 *  It matters more here than it does on the brush, and that is worth saying: a
 *  wash is a handful of marks on a page and a pencil drawing is a thousand, so
 *  the pencil is the tool where "how much of the machine do I want to pay for"
 *  is a question somebody actually has to answer. A twentieth at a time, because
 *  the cost goes as the square and the useful part of the track is the bottom of
 *  it. */
export const LEAD_DETAIL_OPTION: ToolOption = {
  kind: "range",
  id: "leadDetail",
  nameKey: "options.leadDetail",
  hintKey: "options.leadDetailHint",
  min: MIN_LEAD_DETAIL,
  max: MAX_LEAD_DETAIL,
  step: 0.05,
  default: DEFAULT_LEAD_DETAIL,
};

/** The pencil's options — one of them, now. Still a list, for the reason the
 *  brush's is (see `plugins/washOptions.ts`). */
export const LEAD_OPTIONS: readonly ToolOption[] = [LEAD_DETAIL_OPTION];
