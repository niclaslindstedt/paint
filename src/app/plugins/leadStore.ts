// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pencil marks that have already landed.
//
// The quill's store, one shelf along, and for the pencil's own version of the
// same reason (see `washSim.ts` for the full argument): a repaint asks for
// every mark on the page again, and a landed pencil mark is a *field* — a
// sheet pressed by a lead, worked out cell by cell and written through
// `putImageData` — that used to be worked out again on every one of them. A
// pan over a page of sketch strokes re-ran the graphite simulation for every
// mark crossing every strip, every frame; now each mark dries once per view
// and is blitted for as long as the page keeps asking for the same picture.
//
// The one honest difference from the inks: a pencil field is worked at the
// *device's* pitch rather than the document's (see `grid` in `leadSim.ts`), so
// the cell is part of the ask and a zoom that settles at a new scale dries
// every mark again, once. That is the price of grain that is always as fine as
// the screen can show, and it is paid once per zoom instead of once per frame.
//
// The store's rules are the quill's: refuse-not-evict when full, a `WeakRef`
// sweep of paths the rest of the app has let go of, and marks compared by the
// identity of their points — the document hands the painter its own array, so
// the same array is the same mark. There is no turned-away slot because a
// pencil mark is dry the moment it lands: nothing asks for one twice in a
// frame.

import type { GroundProfile } from "../ground.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";

/** The most landed marks held, and the most cells between them. A sketch is
 *  many small marks — more marks than the quill holds, and a bigger cell
 *  budget, because every stroke of a pencil drawing goes through here. */
export const KEPT_MARKS = 512;
export const KEPT_CELLS = 8_000_000;

let keptMarks = KEPT_MARKS;
let keptCells = KEPT_CELLS;

/** What a landed mark asks the simulation for — everything that decides what
 *  it dries into, and nothing that doesn't. The page colour is not in here:
 *  graphite is a grey at an alpha, not a glaze, so the page shows through the
 *  compositing rather than through the field (see `drawInto`). */
export type Ask = {
  points: readonly Point[];
  size: number;
  grade: number;
  ground: GroundProfile;
  color: string;
  /** The pitch the field was worked at — the one input that carries the zoom
   *  and the detail slider, both of which change the pixels. */
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
    a.grade === b.grade &&
    a.color === b.color &&
    a.cell === b.cell &&
    sameSheet(a.ground, b.ground)
  );
}

/** Whether two sheets are the same paper to draw on. */
export function sameSheet(a: GroundProfile, b: GroundProfile): boolean {
  return (
    a.absorbency === b.absorbency &&
    a.tooth === b.tooth &&
    a.bite === b.bite &&
    a.pattern === b.pattern
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

/** Whether the store has room for one more mark this size — after sweeping out
 *  the marks nothing can ever ask for again — and any canvas the sweep freed. */
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
export function forgetLeadStore(bounds?: {
  marks?: number;
  cells?: number;
}): void {
  kept.length = 0;
  keptMarks = bounds?.marks ?? KEPT_MARKS;
  keptCells = bounds?.cells ?? KEPT_CELLS;
}
