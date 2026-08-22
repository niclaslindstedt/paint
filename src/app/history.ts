// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What an undo steps back through.
//
// A drawing is vector, so a step back is a *value* rather than a photograph of
// the screen: the document as it was. All this module holds is the arithmetic of
// the two stacks those values sit on — pure, so the whole of undo and redo can
// be driven in a test with no store, no React and no DOM (see
// `tests/history_test.ts`). The store keeps one `Timeline` in a ref and does as
// it is told (see `usePaintStore.ts`).
//
// A rung holds **two** things, and that is the part worth arguing about: the
// document, and the window a selection has cut in it. The window is not in the
// document — it is never saved and never synced — but it is something you *did*,
// and something you did that cannot be taken back is a trap. Painting a
// selection is the case that proves it: the draw-select tool builds a window up
// stroke by stroke, so a stroke that went where you didn't mean it to used to
// cost you the whole selection to fix, because the only key that could have
// helped reached past it to the marks underneath. So the two ride one timeline,
// and ⌘/Ctrl+Z steps back through whichever of them last changed — the way it
// does in every other program that has both.

import type { Selection } from "./selection.ts";
import type { AppData } from "./types.ts";

/** A window, and the page it was cut in.
 *
 *  The page id travels with it because the timeline outlives the page you are
 *  looking at: a window is only ever *shown* over the page it was cut in (see
 *  `windowOn`), so stepping back through an edit made on another drawing can
 *  never drop a stranger's outline onto this one — and stepping back onto that
 *  drawing brings its own window back with it. */
export type PageWindow = { page: string; selection: Selection };

/** One rung of the timeline: everything a step back has to put back. */
export type Rung = { data: AppData; window: PageWindow | null };

/** What is behind the present, and what stepping back has taken off it.
 *
 *  Immutable: every verb below answers with a new timeline rather than pushing
 *  and popping in place, which is what makes them testable as arithmetic. The
 *  rungs themselves are shared, not copied — a document is a value the edit
 *  before it already shares most of. */
export type Timeline = { past: readonly Rung[]; future: readonly Rung[] };

/** A timeline with nothing on it — a document that has just been loaded, or a
 *  sketchbook that has just been opened. Nothing to step back to, and nothing
 *  the last step took off. */
export const CLEAR: Timeline = { past: [], future: [] };

/** Put `present` behind us, making room for whatever the caller is about to
 *  make the present instead.
 *
 *  A new rung forfeits the future, which is what every undo stack anyone has
 *  used does: step back three times, draw something else, and the three you
 *  stepped back through are gone rather than waiting to be redone into the
 *  middle of an edit they never followed. */
export function committed(timeline: Timeline, present: Rung): Timeline {
  return { past: [...timeline.past, present], future: [] };
}

/** Where a step lands: the timeline as it now stands, and the rung that should
 *  become the present. */
export type Stepped = { timeline: Timeline; present: Rung };

/** Step back, or `null` when there is nothing behind us. */
export function undone(timeline: Timeline, present: Rung): Stepped | null {
  const prev = timeline.past.at(-1);
  if (!prev) return null;
  return {
    timeline: {
      past: timeline.past.slice(0, -1),
      future: [...timeline.future, present],
    },
    present: prev,
  };
}

/** Step forward again, or `null` when nothing was stepped back through. */
export function redone(timeline: Timeline, present: Rung): Stepped | null {
  const next = timeline.future.at(-1);
  if (!next) return null;
  return {
    timeline: {
      past: [...timeline.past, present],
      future: timeline.future.slice(0, -1),
    },
    present: next,
  };
}

/** The window `page` actually has — the one cut in it, and never another page's.
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
