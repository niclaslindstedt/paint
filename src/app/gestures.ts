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

// --- The drawer's open-swipe --------------------------------------------
//
// On a phone in "Edge swipe" mode the sidebar opens on an inward swipe that
// starts at the screen edge — and that swipe lands on the canvas, which would
// otherwise take it for a stroke and leave a line across the page behind the
// opening drawer.
//
// The canvas can't ask the framework's hook what it is thinking, so it repeats
// its arithmetic here: same strip, same distance, same "a vertical drag isn't a
// swipe" rule. A press that starts in the strip is **held** rather than drawn —
// it becomes a stroke the moment it proves it isn't the drawer's, and it is
// replayed from where it began, so nothing is lost by the wait.

/** The side of the screen the drawer opens from. */
export type MenuEdge = "left" | "right";

/** How far in from the watched edge a press may land and still be a candidate
 *  for the drawer's swipe, in CSS pixels. The framework's `edgeZone` default. */
export const EDGE_ZONE = 30;

/** How far inward such a press must travel before the drawer opens. The
 *  framework's `openDistance` default. */
export const EDGE_OPEN_DISTANCE = 48;

/** Whether a press at `x` (in viewport coordinates, on a viewport `width` wide)
 *  begins in the strip the drawer watches. */
export function inEdgeZone(x: number, width: number, edge: MenuEdge): boolean {
  return edge === "left" ? x <= EDGE_ZONE : x >= width - EDGE_ZONE;
}

/** What a held press has turned out to be:
 *
 *  - `pending` — still undecided; keep holding.
 *  - `draw` — not the drawer's swipe, so it is the tool's press after all.
 *  - `menu` — the inward swipe fired and the drawer is opening; drop it. */
export type EdgeVerdict = "pending" | "draw" | "menu";

/** Classify a held press from how far it has travelled since it landed.
 *
 *  A drag that is more vertical than horizontal is never the drawer's — the
 *  framework disarms on exactly that test — so it is released to the tool at
 *  once. Otherwise it stays held until it has gone far enough inward to open the
 *  drawer; short of that it is still anyone's, and the release (or the finger
 *  lifting) decides. */
export function classifyEdgeDrag(
  dx: number,
  dy: number,
  edge: MenuEdge,
): EdgeVerdict {
  if (Math.abs(dy) > Math.abs(dx)) return "draw";
  const inward = edge === "left" ? dx : -dx;
  return inward >= EDGE_OPEN_DISTANCE ? "menu" : "pending";
}
