// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The calligraphy marks that have already dried.
//
// The wash's store, one shelf along, and for the same reason (see `washSim.ts`
// for the full argument): a repaint asks for every mark on the page again, and
// a page of lettering is hundreds of marks — so a dried one is kept with its
// pixels, a full store refuses a newcomer rather than evicting a held mark,
// and a mark whose path the rest of the app has let go of is swept when a new
// one wants room. One slot sits apart from the store: the newest landed mark a
// full store turned away, because a wet mark is asked for twice back to back
// per repaint (see `wet.ts`). The gesture under the hand is not here at all —
// it is not a dried mark, it is one still being written, and it has a room of
// its own in `quillSim.ts`.
//
// The bounds are the store's own rather than the wash's: lettering is many
// small marks where washes are few big ones, so it holds more of them and
// fewer cells.

import type { GroundProfile } from "../ground.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";

/** The most landed marks held, and the most cells between them. */
export const KEPT_MARKS = 384;
export const KEPT_CELLS = 6_000_000;

let keptMarks = KEPT_MARKS;
let keptCells = KEPT_CELLS;

/** What a landed mark asks the simulation for — everything that decides what
 *  it dries into, and nothing that doesn't. The zoom is not in here, and that
 *  is the point (see `PITCH` in `quillSim.ts`). */
export type Ask = {
  points: readonly Point[];
  size: number;
  angle: number;
  load: number;
  ground: GroundProfile;
  color: string;
  page: string;
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
  cell: number;
  surface: Surface;
};

/** Whether a held mark is the one being asked for — the points by identity,
 *  because a repaint hands the painter the document's own array. */
function sameMark(a: Dried, b: Ask): boolean {
  return (
    a.points.deref() === b.points &&
    a.size === b.size &&
    a.angle === b.angle &&
    a.load === b.load &&
    a.color === b.color &&
    // The page as well as the ink: it decides which way the film reads (see
    // `keeping`), so the same mark over a sheet that flipped is a different
    // picture and must not be blitted from the last one.
    a.page === b.page &&
    sameGround(a.ground, b.ground)
  );
}

/** Whether two sheets are the same paper to write on — shared with the live
 *  path's own validity check (see `quillSim.ts`). */
export function sameGround(a: GroundProfile, b: GroundProfile): boolean {
  return (
    a.absorbency === b.absorbency &&
    a.tooth === b.tooth &&
    a.bite === b.bite &&
    a.pattern === b.pattern
  );
}

/** The landed marks, in the order they were admitted — the page's own paint
 *  order, near enough, and the front of it is the part of the page that is
 *  still there tomorrow. */
const kept: Dried[] = [];

/** The newest landed mark a full store turned away. */
let turnedAway: Dried | null = null;

/** A held mark, or `null` if this one hasn't dried here yet. */
export function heldMark(ask: Ask): Dried | null {
  for (const mark of kept) {
    if (sameMark(mark, ask)) return mark;
  }
  if (turnedAway && sameMark(turnedAway, ask)) return turnedAway;
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

/** A canvas for a field this size: one freed by whatever this mark is
 *  replacing where there is one, and a fresh one otherwise. */
export function surfaceFor(
  width: number,
  height: number,
  room: { admit: boolean; spare: Surface | null },
): Surface | null {
  const spare = room.spare ?? (room.admit ? null : turnedAwaySurface());
  if (!spare) return createSurface(width, height);
  resizeSurface(spare, width, height);
  return spare;
}

/** The turned-away slot's canvas, freed by whatever was in it — a full store
 *  replaces one turned-away mark with the next, so the canvas changes hands. */
function turnedAwaySurface(): Surface | null {
  const held = turnedAway;
  turnedAway = null;
  return held?.surface ?? null;
}

/** Hold a mark that has just dried. */
export function keep(mark: Dried, admitted: boolean): void {
  if (admitted) kept.push(mark);
  else turnedAway = mark;
}

/** A path held so the collector can still take it. The fallback holder — for
 *  an environment with no `WeakRef` — holds it for ever, which merely means
 *  dead marks wait for the bounds instead of for the sweep. */
export function weakly(points: readonly Point[]): PointsHeld {
  if (typeof WeakRef === "function") return new WeakRef(points);
  return { deref: () => points };
}

/** Let go of every mark held, so the next ask for one works it out again —
 *  and, when asked, hold the store to smaller bounds from here on. Reached
 *  through `forgetDriedInk` (see `quillSim.ts`), which also lets go of the
 *  gesture in hand. */
export function forgetStore(bounds?: { marks?: number; cells?: number }): void {
  kept.length = 0;
  turnedAway = null;
  keptMarks = bounds?.marks ?? KEPT_MARKS;
  keptCells = bounds?.cells ?? KEPT_CELLS;
}

/** Put a held canvas onto the page, at the patch of document it stands for.
 *  At the pitch a mark inside its budget is worked at, a cell is a document
 *  pixel and this is a plain blit; a coarsened mark is drawn up and smoothed,
 *  which for a liquid is the right way round. */
export function place(
  ctx: CanvasRenderingContext2D,
  at: {
    surface: Surface;
    x: number;
    y: number;
    width: number;
    height: number;
    cell: number;
  },
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    at.surface.canvas,
    0,
    0,
    at.width,
    at.height,
    at.x,
    at.y,
    at.width * at.cell,
    at.height * at.cell,
  );
  ctx.restore();
}
