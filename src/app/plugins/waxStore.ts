// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The crayon marks that have already landed.
//
// The pencil's store, one shelf along, and for the same reason (see
// `leadStore.ts` for the full argument): a landed crayon mark is a *field* — a
// sheet worked by a stick of wax, cell by cell, written through
// `putImageData` — and a repaint asks for every mark on the page again. Each
// mark dries once per view and is blitted for as long as the page keeps
// asking for the same picture.
//
// Like the pencil's, a crayon field is worked at the *device's* pitch, so the
// cell is part of the ask and a zoom that settles at a new scale dries every
// mark again, once. The rules are the same: refuse-not-evict when full, a
// `WeakRef` sweep of paths the rest of the app has let go of, marks compared
// by the identity of their points, and no turned-away slot because a wax mark
// is dry the moment it lands.
//
// Every dial that changes the pixels is in the `Ask` — the pressure and the
// softness both — because a store that ignored one would blit a china-marker
// line where an oil pastel was asked for.

import type { GroundProfile } from "../ground.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import { sameSheet } from "./leadStore.ts";

/** The most landed marks held, and the most cells between them. Fewer marks
 *  than the pencil's shelf but a bigger cell allowance per mark: a crayon is
 *  the broadest stick in the box, so a page holds fewer, larger fields. */
export const KEPT_MARKS = 256;
export const KEPT_CELLS = 8_000_000;

let keptMarks = KEPT_MARKS;
let keptCells = KEPT_CELLS;

/** What a landed mark asks the simulation for — everything that decides what
 *  it dries into, and nothing that doesn't. The page colour is not in here:
 *  wax is a colour at an alpha, not a glaze, so the page shows through the
 *  compositing rather than through the field (see `drawInto` in
 *  `waxSim.ts`). */
export type Ask = {
  points: readonly Point[];
  size: number;
  /** How hard the hand was bearing down — the crayon's first axis. */
  pressure: number;
  /** …and which stick is in it — the second (see `SOFT` in
   *  `builtin/dials.ts`). */
  soft: number;
  ground: GroundProfile;
  color: string;
  /** The pitch the field was worked at — the one input that carries the
   *  zoom, which changes the pixels. */
  cell: number;
};

/** A held path — the shape of a `WeakRef`, which is what it is wherever the
 *  runtime has one (see `weakly`). */
type PointsHeld = { deref(): readonly Point[] | undefined };

/** A mark that has dried, the pixels it dried into, and where they go. */
export type Dried = Omit<Ask, "points"> & {
  points: PointsHeld;
  x: number;
  y: number;
  width: number;
  height: number;
  surface: Surface;
};

/** Whether a held mark is the one being asked for — the points by identity,
 *  because a repaint hands the painter the document's own array. */
function sameMark(a: Dried, b: Ask): boolean {
  return (
    a.points.deref() === b.points &&
    a.size === b.size &&
    a.pressure === b.pressure &&
    a.soft === b.soft &&
    a.color === b.color &&
    a.cell === b.cell &&
    sameSheet(a.ground, b.ground)
  );
}

/** The landed marks, in the order they were admitted. */
const kept: Dried[] = [];

/** A held mark, or `null` if this one hasn't dried here yet. */
export function heldMark(ask: Ask): Dried | null {
  for (const mark of kept) {
    if (sameMark(mark, ask)) return mark;
  }
  return null;
}

/** Whether the store has room for one more mark this size — after sweeping
 *  out the marks nothing can ever ask for again — and any canvas the sweep
 *  freed. */
export function roomFor(
  width: number,
  height: number,
): { admit: boolean; spare: Surface | null } {
  let cells = width * height;
  for (const mark of kept) cells += mark.width * mark.height;
  let spare: Surface | null = null;
  for (let at = kept.length - 1; at >= 0; at--) {
    if (kept.length < keptMarks && cells <= keptCells) break;
    const mark = kept[at]!;
    if (mark.points.deref() !== undefined) continue;
    kept.splice(at, 1);
    cells -= mark.width * mark.height;
    spare = mark.surface;
  }
  return { admit: kept.length < keptMarks && cells <= keptCells, spare };
}

/** A canvas for a field this size: one freed by the sweep where there is one,
 *  and a fresh one otherwise. `null` where there is no DOM to make one in. */
export function surfaceFor(
  width: number,
  height: number,
  room: { spare: Surface | null },
): Surface | null {
  if (!room.spare) return createSurface(width, height);
  resizeSurface(room.spare, width, height);
  return room.spare;
}

/** Hold a mark that has just dried. */
export function keep(mark: Dried): void {
  kept.push(mark);
}

/** A path held so the collector can still take it. The fallback holder — for
 *  an environment with no `WeakRef` — holds it for ever, which merely means
 *  dead marks wait for the bounds instead of for the sweep. */
export function weakly(points: readonly Point[]): PointsHeld {
  if (typeof WeakRef === "function") return new WeakRef(points);
  return { deref: () => points };
}

/** Let go of every mark held, so the next ask for one works it out again —
 *  and, when asked, hold the store to smaller bounds from here on. Tests
 *  only: nothing a mark dries into depends on anything the app can change
 *  without changing the ask. */
export function forgetWaxStore(bounds?: {
  marks?: number;
  cells?: number;
}): void {
  kept.length = 0;
  keptMarks = bounds?.marks ?? KEPT_MARKS;
  keptCells = bounds?.cells ?? KEPT_CELLS;
}
