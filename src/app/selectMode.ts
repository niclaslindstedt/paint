// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a selection gesture *does to the window that is already up*.
//
// Every selection tool answers one question — "what did this gesture choose?"
// (see `plugins/builtin/select.ts`) — and until now the answer always landed
// the same way: it became the window, and whatever had been chosen before it
// was gone. That is one of three things a person means by a second gesture, and
// it is the least useful of them. The subject of a photograph is not a lasso
// loop; it is a lasso loop, plus the ear the loop missed, minus the sky that
// came in with the shoulder. Every paint program answers this the same way and
// has for thirty years: the gesture is unchanged, and a *mode* says what its
// answer is worth.
//
//   - **replace** — the window is what this gesture chose. The way it has
//     always worked, and where the app opens.
//   - **add** — this gesture's area, and the window's, together.
//   - **subtract** — the window, with this gesture's area taken out of it.
//
// It is one mode for the *family* rather than a setting on each tool, which is
// the whole point: draw a box, add a lasso to it, take a traced shape out of
// that. Nothing here knows which tool ran — the arithmetic is over contours, so
// a box, an oval, a traced outline and a painted band all combine with each
// other (see `regionMask.ts` for why that cannot be done by concatenating
// them).
//
// **Two ways to say which mode you mean, because two kinds of machine.** A
// desktop hangs it off the keyboard the way Photoshop does — Shift adds, Alt
// takes away, for as long as the key is down — and a finger has no keyboard, so
// the mode is also *sticky*: hold the selection button down and pick one, and
// it stays picked until you put it back (see `useSelectMode.ts`). The held key
// wins while it is held, so a sticky Add plus a held Alt is one subtracting
// gesture and then Add again, which is what a hand that has used any of these
// programs expects.
//
// The mode is **not** document state and not a setting: it belongs to the
// session the way the window itself does. Everything here is pure.

import { mergeRegion } from "./regionMask.ts";
import type { Point } from "./types.ts";

/** What a gesture's answer does to the window already up. */
export type SelectMode = "replace" | "add" | "subtract";

/** The three, in the order they are offered — the one the app opens in first. */
export const SELECT_MODES: readonly SelectMode[] = [
  "replace",
  "add",
  "subtract",
];

/** Which mode the keyboard is asking for right now, or `null` when it is asking
 *  for nothing and the sticky one stands.
 *
 *  Shift adds and Alt takes away, which is what every editor that has this
 *  gesture uses. Both together mean *intersect* elsewhere; this app has no such
 *  mode, and rather than inventing a fourth answer for a pair of keys someone
 *  is holding by accident, Alt wins — the destructive one is the one you can
 *  see happening before you let go. */
export function heldMode(keys: {
  shift: boolean;
  alt: boolean;
}): SelectMode | null {
  if (keys.alt) return "subtract";
  if (keys.shift) return "add";
  return null;
}

/** The mode a gesture starting now would run in: the key being held, or the
 *  sticky one when no key is. */
export function effectiveMode(
  sticky: SelectMode,
  held: SelectMode | null,
): SelectMode {
  return held ?? sticky;
}

/** A copy of `region`, so an answer that is "what was already there" is still a
 *  new object — the screen compares windows by identity to decide what it can
 *  keep on the page (see `trail.ts`). */
function copyRegion(region: readonly (readonly Point[])[]): Point[][] {
  return region.map((loop) => loop.map((p) => ({ ...p })));
}

/** The window a gesture leaves behind: what it `chose`, worked into `base`
 *  according to `mode`. `null` means no window, which is what a gesture that
 *  chose nothing has always meant.
 *
 *  The three modes agree about the empty cases rather than each having their
 *  own: a gesture that chose nothing leaves the window exactly as it was under
 *  add and subtract (a stray tap is not a reason to lose the selection you have
 *  been building) and clears it under replace (which is how a tap has always
 *  put a window away). Adding to nothing is the gesture's own answer, and
 *  taking anything out of nothing is still nothing — neither costs a
 *  rasterisation, so the first gesture of a drawing is exactly as cheap in Add
 *  mode as it is in Replace. */
export function applySelectMode(
  base: readonly (readonly Point[])[] | null | undefined,
  chose: readonly (readonly Point[])[] | null,
  mode: SelectMode,
): Point[][] | null {
  const had = base && base.length > 0 ? base : null;
  const got = chose && chose.length > 0 ? chose : null;
  if (mode === "replace") return got ? copyRegion(got) : null;
  if (!got) return had ? copyRegion(had) : null;
  if (!had) return mode === "add" ? copyRegion(got) : null;
  return mergeRegion(had, got, mode === "subtract");
}
