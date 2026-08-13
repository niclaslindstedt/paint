// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tap arithmetic: what counts as a tap, and what counts as two of them.
//
// The browser's own `dblclick` is not enough here. On touch it is synthesised
// inconsistently, it arrives *after* the two presses that produced it — by which
// time a drawing tool has already laid down two marks — and it says nothing
// about how far the finger travelled. So the canvas detects taps from the
// pointer stream it is already handling, and this module is the pure half of
// that: no DOM, no refs, driveable from a node test.
//
// Deliberately conservative. A double-tap only ever *fits the page*, so a missed
// one costs a second try, while a false positive on a drag would yank the view
// out from under someone who was panning.

import type { Point } from "./types.ts";
import { distance } from "./viewport.ts";

/** How long after a tap a second one still pairs with it, in milliseconds.
 *  Roughly the platform double-click threshold. */
export const DOUBLE_TAP_MS = 320;

/** How far apart the two taps may land, in CSS pixels. Generous enough for a
 *  thumb on a phone, tight enough that two deliberate taps in different places
 *  stay two taps. */
export const DOUBLE_TAP_SLOP = 32;

/** How far a pointer may travel between press and release and still be a tap
 *  rather than a drag. Below a finger's own wobble. */
export const TAP_SLOP = 8;

/** A press that has been released without wandering. */
export type Tap = { time: number; point: Point };

/** Whether `tap` closes a double-tap with `previous` — near enough in both time
 *  and place. A `null` previous (no earlier tap, or one already consumed) is
 *  never a pair. */
export function isDoubleTap(previous: Tap | null, tap: Tap): boolean {
  if (!previous) return false;
  if (tap.time - previous.time > DOUBLE_TAP_MS) return false;
  return distance(previous.point, tap.point) <= DOUBLE_TAP_SLOP;
}

/** Whether a press that began at `from` and has reached `to` still counts as a
 *  tap. Once it doesn't, it is a drag for good — the canvas drops the tap rather
 *  than re-testing it when the finger wanders back. */
export function isTap(from: Point, to: Point): boolean {
  return distance(from, to) <= TAP_SLOP;
}
