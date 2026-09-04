// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What an undo steps back through — the half of it that is this app's.
//
// The two stacks themselves are the framework's (`history`): pure, immutable,
// and generic in what a rung holds. What is generic there is exactly the part
// that was never about drawing, and what is left here is the part that is:
// **a rung holds two things, and the second one is not in the document.**
//
// A drawing is vector, so a step back is a *value* rather than a photograph of
// the screen. But the window a selection has cut is not in that value — it is
// never saved and never synced — and something you did that cannot be taken
// back is a trap. Painting a selection is the case that proves it: the
// draw-select tool builds a window up stroke by stroke, so a stroke that went
// where you didn't mean it to used to cost you the whole selection to fix,
// because the only key that could have helped reached past it to the marks
// underneath. So the two ride one timeline, and ⌘/Ctrl+Z steps back through
// whichever of them last changed — the way it does in every other program that
// has both.

import {
  clearTimeline,
  type Timeline as FrameworkTimeline,
} from "@niclaslindstedt/oss-framework/history";

import type { Selection } from "./selection.ts";
import type { AppData } from "./types.ts";

export {
  committed,
  undone,
  redone,
  type Stepped,
} from "@niclaslindstedt/oss-framework/history";

/** A window, and the page it was cut in.
 *
 *  The page id travels with it because the timeline outlives the page you are
 *  looking at: a window is only ever *shown* over the page it was cut in (see
 *  {@link windowOn}), so stepping back through an edit made on another drawing
 *  can never drop a stranger's outline onto this one — and stepping back onto
 *  that drawing brings its own window back with it. */
export type PageWindow = { page: string; selection: Selection };

/** One rung of the timeline: everything a step back has to put back. */
export type Rung = { data: AppData; window: PageWindow | null };

/** This app's timeline: the framework's stacks over this app's rung. */
export type Timeline = FrameworkTimeline<Rung>;

/** A timeline with nothing on it — a document that has just been loaded, or a
 *  sketchbook that has just been opened. */
export const CLEAR: Timeline = clearTimeline<Rung>();

/** The window `page` actually has — the one cut in it, and never another
 *  page's.
 *
 *  This is the whole of "a window is dropped when you open another drawing": it
 *  is not dropped at all, it simply isn't that page's. Opening the drawing it
 *  was cut in again finds it where you left it, and — because the timeline
 *  carries the page id too — a step back can restore a window without the
 *  screen having to work out whether it is still looking at the right page. */
export function windowOn(
  window: PageWindow | null,
  page: string | undefined,
): Selection | null {
  if (!window || !page || window.page !== page) return null;
  return window.selection;
}

/** The window an edit leaves behind, as the timeline keeps it: `null` for an
 *  edit that puts the window away (a crop moves every mark out from under it),
 *  and a page-stamped one for an edit that leaves a new one up (a paste lands
 *  its marks selected). */
export function windowOf(
  selection: Selection | null,
  page: string,
): PageWindow | null {
  return selection ? { page, selection } : null;
}
