// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting a stroke with the wet field.
//
// `washField.ts` knows about water and paper and nothing else. This is the part
// that knows about a *gesture*: it opens a field over the patch of page the
// mark can reach, walks the path laying water and pigment into it, runs the
// field until the sheet is dry, and turns what settled into pixels.
//
// Three things about it are worth knowing before reading it.
//
// **The stroke is laid down over time.** The path is split into a handful of
// chunks and the field is stepped between them, so the beginning of a long
// sweep has already started drying by the time the end of it lands. That is not
// a flourish — it is where the blooms come from. Water arriving on paper that
// is damp and still carrying pigment surges outwards and shoves that pigment
// ahead of it, and a stroke that crosses its own earlier part gets exactly the
// cauliflower a real one would. Painted all at once there is no "earlier" and
// no bloom.
//
// **The result is composited, not blitted.** What the field hands back is an
// amount of pigment per cell, and pigment is not a colour — it is something
// light has to get through. So each cell is turned into a transmittance
// (`colour ^ density`, which is Beer–Lambert with the ink's own colour standing
// in for its absorption spectrum) and then into the colour-and-alpha pair that
// composites to the same thing. Under the `multiply` blending a wet mark on
// absorbent paper already uses (see `ground.ts`) that is exact: the page comes
// out as `page × transmittance`, which is what a glaze *is*. Over a white sheet
// with ordinary compositing it is exact too. That is why doubling a wash
// deepens it towards the colour instead of towards black.
//
// **…and which way it runs is the page's to say.** All of the above is a light
// sheet: the ink takes light away from a page that has it. On a dark sheet the
// page is the *absence* of ink, a wet mark composites with `screen` rather than
// `multiply`, and the same arithmetic has to be mirrored — what a pigment stops
// is measured in darkness rather than in light (see `keeping`). It is the same
// call `inkBlend` already makes about the same page, and it is not optional:
// unmirrored, a white wash on a black page lets every channel through at every
// density there is and the engine paints a mark nobody can see.
//
// **The field is worked out on the page, and a mark is worked out once.** The
// grid's pitch is measured in document pixels rather than in screen ones (see
// `PITCH`), so a wash is the same picture at every zoom — and *because* it is,
// the pixels it dried into can be kept and put down again rather than
// re-simulated by every pan, pinch and undo (see the store below `sameMark`).
// Those two are one decision: a mark whose picture depended on the view could
// not be kept, and a repaint of a page carrying twenty washes would go on
// costing twenty simulations.
//
// **It can always say no.** No DOM, no canvas, a mark too small to be worth a
// field, a page-wide sweep whose cells would be wider than the brush: every one
// of those returns `false`, and the caller paints the mark with the simple
// engine instead (see `wash.ts`). A browser that cannot run the simulation must
// still open every drawing and paint every mark.

import { isDarkColor } from "../canvas.ts";
import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import {
  charge,
  createField,
  density,
  step,
  type WashField,
} from "./washField.ts";
import { HAIRLINE, PIXEL, trace } from "./grain.ts";

/** How much page one cell of the field stands for, at full detail: **one
 *  document pixel**.
 *
 *  The field is worked out on the *page*, not on the screen. That is the whole
 *  of what "full detail" can honestly mean here — a drawing is a fixed grid of
 *  document pixels (see `types.ts`), so a cell per document pixel is the finest
 *  grid the mark has anywhere to land on, and the image the field hands back is
 *  then placed pixel for pixel rather than blown up. It is also what makes a
 *  wash **the same picture at every zoom**: the pitch used to be read off the
 *  view, so pulling back re-simulated every mark on a coarser grid and pushing
 *  in re-simulated it again on a finer one — a wash that changed its blooms
 *  because you looked closer, and a repaint that could not be cached across a
 *  pinch (see `kept`). */
const PITCH = PIXEL;

/** The most cells one mark is simulated at, at full detail — a *landed* mark,
 *  and one still under the hand.
 *
 *  A field is arithmetic on every cell, thirty-two times over, so the cell
 *  count is the bill. Past the budget the grid is coarsened instead, and the
 *  image is then drawn up to the patch of page it stands for: that upscaling is
 *  exactly what the budget buys, and it is why a page-covering sweep still
 *  softens where a stroke the size of a hand does not. At one cell per document
 *  pixel a sweep across an A4 page is some eight million cells and a dozen
 *  seconds — there is no setting of this number that simulates that mark at
 *  full resolution, only settings that pretend to.
 *
 *  **A landed mark is worked out once and kept** (see `kept`), so it can afford
 *  a bill a frame cannot. A mark still under the hand is re-simulated from its
 *  first point on every pointer sample, which is the one place the cost is paid
 *  per frame rather than per mark, so it gets a much smaller field — and then
 *  settles into the full one the moment the brush lifts. Below the smaller of
 *  the two the marks are identical: a field is only coarsened when it is over
 *  budget, so anything under it resolves at the pitch either way, which is
 *  every mark short of a sweep across the page. */
const BUDGET = 120_000;
const LIVE_BUDGET = 20_000;

/** How much of the field to actually run, as a share of the two numbers above:
 *  1 is the whole of it, 0.1 a tenth of the resolution in each direction.
 *
 *  It is the one wash setting that changes nothing about *what a wash is* — only
 *  how finely it is worked out. What a coarser grid costs is the fine half of
 *  the picture: the rim thins, the mottle broadens, and a small brush stops
 *  being worth a field at all and falls through to the stroke model. What it
 *  buys is the square of itself, which is why it is worth a slider at all — the
 *  simulation is the expensive engine, and this is the one control that decides
 *  how expensive.
 *
 *  A tenth is the floor because a field coarser than that is not a wash being
 *  simulated badly, it is a handful of cells the size of the brush. */
export const MIN_WASH_DETAIL = 0.1;
export const MAX_WASH_DETAIL = 1;

/** What it resolves at untouched: all of it. Anything less is a trade the user
 *  has to have made — a build that quietly painted a coarser wash than the one
 *  its own sample showed would be lying about its picture. */
export const DEFAULT_WASH_DETAIL = MAX_WASH_DETAIL;

/** A stored detail pulled into range. A blob written by another build (or by
 *  hand) is the only way a bad one gets here, and the slider cannot recover
 *  from a value off its own track. */
export function clampWashDetail(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WASH_DETAIL;
  }
  return Math.max(MIN_WASH_DETAIL, Math.min(MAX_WASH_DETAIL, value));
}

/** Both of the numbers above, at the detail the setting is turned to.
 *
 *  Detail is a share of the field's *resolution*, and that is what the pitch
 *  takes: half detail, cells twice as wide across the page. An ordinary mark
 *  then costs a quarter as much, because a grid coarsened in both directions
 *  holds a quarter as many cells over the same paper — which is what makes the
 *  setting worth a slider at all. It is quadratic in the thing that costs, so a
 *  small step down is a large step down the bill.
 *
 *  **The budget comes down more slowly than that, and deliberately.** It is the
 *  cap on the worst case rather than a second resolution, and it binds only for
 *  the big marks — a page-wide sweep. Bringing it down as the square too would
 *  coarsen those a second time, past the point where a head is a few cells
 *  across, and the mark would fall through to the stroke model: the bottom of
 *  the slider would quietly be an off switch rather than a coarse simulation,
 *  which is not what it says on it. Linear keeps a big wash simulated — blockily,
 *  which is what was asked for — and still a tenth of the cost at a tenth of the
 *  detail.
 *
 *  At 1 both are exactly the constants above, which is what keeps a wash painted
 *  by a build that had no such setting painting the same today. */
function grid(
  detail: number,
  live: boolean,
): { pitch: number; budget: number } {
  const share = Math.max(MIN_WASH_DETAIL, Math.min(1, detail));
  return {
    pitch: PITCH / share,
    budget: (live ? LIVE_BUDGET : BUDGET) * share,
  };
}

/** How many cells the brush has to be across before a field is worth running.
 *  Below it the simulation has nothing to resolve — the head is a cell wide —
 *  and the simple engine draws a better mark than a two-pixel puddle. */
const LEAST_HEAD = 3;

/** How many steps a wash is run for. It is a fixed number and it has to be:
 *  time in this app is step count, never the clock (see `washField.ts`). */
const STEPS = 32;

/** The most separate brushfuls one mark is laid down in. More would be finer
 *  grained in time and no different to look at; fewer and a long sweep lands
 *  all at once and cannot bloom into itself. */
const CHUNKS = 10;

/** How much water and pigment a fully-charged brush leaves per unit of path.
 *
 *  Both are divided by how far the water reached as the path is walked, so a
 *  wide brush and a narrow one lay the same *depth* of wash rather than the
 *  wide one laying more — a mop and a rigger differ in how much page they
 *  cover, not in how strong the colour comes out. */
const WATER_LOAD = 0.62;
const PIGMENT_LOAD = 0.5;

/** How much colour one unit of settled pigment is worth — the number that turns
 *  the field's arithmetic into an optical density.
 *
 *  Set so that one pass of a fully-loaded brush reads as a real one-pass wash:
 *  strong enough to see, thin enough that a second pass over it visibly
 *  deepens. Glazing is how the medium is actually worked, and a first wash that
 *  came out opaque would take that away. */
const DENSITY = 0.62;

/** How far the water carries past the hair at `water = 1`, as a share of the
 *  head's half-width — the same figure the simple engine uses, because the two
 *  engines have to agree about what the dial means.
 *
 *  The field is charged out to *there* rather than out to the hair, and that is
 *  deliberate: the water running past the head is not something the sheet does
 *  over time, it is what a loaded brush does the instant it touches down. What
 *  the field adds past it is the fraying, the rim and the blooms. */
const SPREAD = 0.22;

/** …and how much page to leave around the mark for the water to run into. The
 *  field is bounded, and water that reaches the edge simply stops there, so the
 *  margin has to be wider than anything the wash will actually do. */
const MARGIN_CELLS = 10;

/** The least alpha worth writing into a pixel. Below half a level of an 8-bit
 *  channel there is nothing to see and the byte rounds to zero anyway. */
const FAINT = 1 / 512;

/** What a mark asks the simulation for — everything that decides what it dries
 *  into, and nothing that doesn't.
 *
 *  The zoom is not in here, and that is the point: the field is worked out on
 *  the page (see `PITCH`), so the same mark at 40% and at 400% is the same
 *  arithmetic and the same pixels. */
type Ask = {
  points: readonly Point[];
  size: number;
  water: number;
  pigment: number;
  granulation: number;
  ground: GroundProfile;
  color: string;
  page: string;
  detail: number;
  /** Whether this is the mark under the hand rather than one that has landed —
   *  which is the other half of how big a field it gets (see `BUDGET`). */
  live: boolean;
};

/** A held path: dereferences to the points, or to `undefined` once nothing
 *  else in the app holds them — the shape of a `WeakRef`, which is what it is
 *  wherever the runtime has one (see `weakly`). */
type PointsHeld = { deref(): readonly Point[] | undefined };

/** A mark that has dried, the pixels it dried into, and where on the page they
 *  go. The path is held weakly — it is the store's *key*, matched by identity,
 *  and a path the rest of the app has let go of is a key no ask can ever
 *  present again (see the note on the store below). */
type Dried = Omit<Ask, "points"> & {
  points: PointsHeld;
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
  surface: Surface;
};

/** Whether a held mark is the one being asked for — the points by identity,
 *  because a repaint hands the painter the document's own array and every later
 *  call for the same stroke hands it the same one. */
function sameMark(a: Dried, b: Ask): boolean {
  return (
    a.points.deref() === b.points &&
    a.size === b.size &&
    a.water === b.water &&
    a.pigment === b.pigment &&
    a.granulation === b.granulation &&
    a.color === b.color &&
    // The page as well as the ink: it decides which way the pigment reads (see
    // `keeping`), so the same mark over a sheet that flipped is a different
    // picture and must not be blitted from the last one.
    a.page === b.page &&
    a.detail === b.detail &&
    a.live === b.live &&
    a.ground.absorbency === b.ground.absorbency &&
    a.ground.tooth === b.ground.tooth &&
    a.ground.bite === b.ground.bite &&
    a.ground.pattern === b.ground.pattern
  );
}

// --- The marks that have already dried ---------------------------------------
//
// **Drying a wash is the most expensive thing this app does, and a repaint asks
// for it again every time.** A pan off the cache, a pinch, an undo, a layer
// hidden, a window resized — every one of those is a full repaint (see
// `cache.ts`), and on a sheet that soaks so is **every landed stroke**: a wet
// mark mixes with its own layer rather than with the finished picture, so the
// mark cache cannot absorb it and repaints the page instead. A full repaint of
// a page carrying twenty washes used to be twenty simulations. That is why
// zooming a heavy watercolour crawled while *painting* one felt fine: painting
// a stroke blits the committed marks and simulates the one under your hand,
// where zooming — and landing — simulates all of them.
//
// So a dried mark is kept, with its pixels, and a repaint that asks for the same
// mark again gets a blit. Nothing about the picture changes — the field is a
// pure function of the ask (see `Ask`), so a held mark and a re-run one are the
// same pixels by construction, which is what makes keeping them safe rather
// than a second source of truth.
//
// It is bounded twice over, by count and by pixels, because the marks are not
// all the same size: a page of small washes should not stop being held after a
// handful, and a page of page-wide ones must not hold a hundred megabytes of
// canvas.
//
// **A full store refuses a new mark rather than evicting a held one for it**,
// and that rule is what a session of real painting comes down to. A repaint
// asks for every wash on the page, oldest first, every time — and against that
// access pattern an evict-the-oldest store one mark too small forgets every
// mark moments before it is asked for again: the page crosses the store's size
// and every repaint goes from all blits to all simulations at once, which read
// as the app freezing for seconds per stroke. Holding what it has instead
// keeps the held majority a blit forever, and costs a simulation per repaint
// only for the marks past the bound — a page over the store's size gets slower
// by one wash at a time instead of falling off a cliff. The oldest marks are
// the right ones to hold, not merely the easiest: marks only ever leave the
// page from the *end* (an undo pops the newest stroke), so the front of the
// paint order is the part of the page that is still there tomorrow.
//
// **A mark whose stroke is gone for good is let go**, and "for good" is exact
// rather than guessed: a held mark keeps its path by `WeakRef`, and the store
// matches asks against paths *by identity* — so a path the rest of the app has
// dropped (a wash undone and then drawn past, a page since closed) is a mark
// no repaint can ever name again, and the collector saying so is the proof.
// They are swept when a new mark wants room, which is the moment it matters.
//
// **Two marks are held apart from the store, one slot each.** The mark under
// the hand: a gesture is a *different mark on every pointer sample* — one more
// point on the path — so held in the store it would mint an entry a frame and
// flood out a page's worth of landed washes in the length of one stroke. And
// the newest landed mark a full store turned away: a wet mark is asked for
// twice back to back within one repaint (once to cut its bleed to its own
// shape and once for real, see `wet.ts`), and without a slot to sit in between
// those two asks an unheld mark would cost two simulations per repaint instead
// of one.

/** The most landed marks held, and the most cells between them (four bytes
 *  each — the ceiling is ~32 MB of pixels, which a modern phone holds without
 *  noticing and a session of real painting actually needs: a page stops
 *  fitting the store only past a couple of hundred washes). */
export const KEPT_MARKS = 256;
export const KEPT_CELLS = 8_000_000;

/** The bounds in force — the constants above, except in a test that has asked
 *  for a smaller store (see `forgetDriedWashes`). */
let keptMarks = KEPT_MARKS;
let keptCells = KEPT_CELLS;

/** The landed marks, in the order they were admitted — which is the page's own
 *  paint order, near enough: nothing reorders the store, because nothing is
 *  evicted by recency (see the note above). */
const kept: Dried[] = [];

/** The one still under the hand… */
let inHand: Dried | null = null;

/** …and the newest landed mark a full store turned away. */
let turnedAway: Dried | null = null;

/** A held mark, or `null` if this one hasn't dried here yet. */
function heldMark(ask: Ask): Dried | null {
  if (ask.live) return inHand && sameMark(inHand, ask) ? inHand : null;
  for (const mark of kept) {
    if (sameMark(mark, ask)) return mark;
  }
  if (turnedAway && sameMark(turnedAway, ask)) return turnedAway;
  return null;
}

/** Whether the store has room for one more mark this size — after sweeping out
 *  the marks nothing can ever ask for again — and any canvas the sweep freed,
 *  for the newcomer to take over. */
function roomFor(
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
function surfaceFor(
  ask: Ask,
  width: number,
  height: number,
  room: { admit: boolean; spare: Surface | null } | null,
): Surface | null {
  const spare = ask.live
    ? handSurface()
    : (room?.spare ?? (room?.admit ? null : turnedAwaySurface()));
  if (!spare) return createSurface(width, height);
  resizeSurface(spare, width, height);
  return spare;
}

/** The live slot's canvas, freed by whatever was in it. */
function handSurface(): Surface | null {
  const held = inHand;
  inHand = null;
  return held?.surface ?? null;
}

/** …and the turned-away slot's, the same way — a full store replaces one
 *  turned-away mark with the next, so the canvas simply changes hands. */
function turnedAwaySurface(): Surface | null {
  const held = turnedAway;
  turnedAway = null;
  return held?.surface ?? null;
}

/** Hold a mark that has just dried — in the store if it was admitted, and in
 *  the one turned-away slot if the store was full. */
function keep(mark: Dried, admitted: boolean): void {
  if (mark.live) inHand = mark;
  else if (admitted) kept.push(mark);
  else turnedAway = mark;
}

/** A path held so the collector can still take it (see the note on the store).
 *  The fallback holder — for an environment with no `WeakRef` — holds it for
 *  ever, which is today's behaviour everywhere and merely means dead marks
 *  wait for the bounds instead of for the sweep. */
function weakly(points: readonly Point[]): PointsHeld {
  if (typeof WeakRef === "function") return new WeakRef(points);
  return { deref: () => points };
}

/** Let go of every mark held, so the next ask for one dries it again — and,
 *  when asked, hold the store to smaller bounds from here on.
 *
 *  Changes no picture — a held mark and a re-run one are the same pixels — so
 *  there is nothing in the app that has to call it. It exists so a test can ask
 *  "how much did this cost", which is a question about work done rather than
 *  about pixels and is otherwise unanswerable from outside. The bounds are for
 *  the same asker: what a full store *does* is behaviour worth pinning down,
 *  and filling a real few-hundred-mark store to reach it would cost a suite
 *  minutes of drying. Called with none they go back to the real ones. */
export function forgetDriedWashes(bounds?: {
  marks?: number;
  cells?: number;
}): void {
  kept.length = 0;
  inHand = null;
  turnedAway = null;
  keptMarks = bounds?.marks ?? KEPT_MARKS;
  keptCells = bounds?.cells ?? KEPT_CELLS;
}

/** Put the held canvas onto the page, at the patch of document it stands for.
 *
 *  At the pitch a mark that fits its budget is worked out at, one cell *is* one
 *  document pixel and this places the image rather than stretching it. A mark
 *  too big for its budget was coarsened (see `BUDGET`), and is then drawn *up*
 *  to the patch it stands for with the browser's own resampling to smooth it —
 *  which is the right way round for what is being upscaled: water has no hard
 *  detail in it, and the hard detail, the sheet's grain, is painted at full
 *  resolution underneath and reads through the wash. */
function place(ctx: CanvasRenderingContext2D, at: Dried): void {
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

/** Paint a wash by simulating it. `false` when this engine could not — the
 *  caller then paints the mark with the simple one, which is never a failure,
 *  only a different picture.
 *
 *  `scale` is read for one thing only: whether the mark is big enough on this
 *  device to be worth a field at all. It decides nothing about the field
 *  itself, which is worked out on the page (see `PITCH`).
 *
 *  `live` says this is the mark under the hand rather than one that has landed,
 *  which is how large a field it is allowed (see `BUDGET`). */
export function paintSimulatedWash(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  water = 1,
  pigment = 1,
  granulation = 0.6,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  page = "#ffffff",
  detail = DEFAULT_WASH_DETAIL,
  live = false,
): boolean {
  if (points.length === 0 || size <= 0) return false;
  // A mark that has already dried here — the renderer painting a wet one twice
  // (once to cut its bleed to its own shape and once for real, see `wet.ts`),
  // or any of the repaints a pan, a pinch or an undo asks for. It dried the way
  // it dried; put it down again.
  const asked: Ask = {
    points,
    size,
    water,
    pigment,
    granulation,
    ground,
    color,
    page,
    detail,
    live,
  };
  const held = heldMark(asked);
  if (held) {
    place(ctx, held);
    return true;
  }
  const soak = Math.max(0, Math.min(1, ground.absorbency));
  // The sheet drinks: the same charge of water on cold-pressed paper runs
  // further than it does on a sealed surface. The same reading the simple
  // engine makes of the same two numbers.
  const wet = Math.max(0, Math.min(2.4, water * (1 + soak * 0.6)));
  const load = Math.max(0.1, Math.min(2, pigment));
  const half = size / 2;
  const reach = half * (1 + SPREAD * wet);
  if (reach * 2 * scale < HAIRLINE) return false;

  // How coarse to work: the page's own pitch, coarsened only where the field
  // would otherwise blow the budget — and both of those measured at the detail
  // the setting is turned to, so turning it down coarsens the grid rather than
  // running a finer one fewer times. The zoom is not consulted: the field is
  // worked out on the page (see `PITCH`).
  const { pitch, budget } = grid(detail, live);
  const box = bounds(points);
  let cell = pitch;
  const margin = () => reach + MARGIN_CELLS * cell;
  for (let tries = 0; tries < 8; tries++) {
    const pad = margin();
    const wide = Math.ceil((box.width + pad * 2) / cell);
    const tall = Math.ceil((box.height + pad * 2) / cell);
    if (wide * tall <= budget) break;
    cell *= Math.sqrt((wide * tall) / budget);
  }
  // A head no wider than a few cells has nothing for a field to resolve.
  if (half / cell < LEAST_HEAD / 2) return false;

  const pad = margin();
  const x = box.x - pad;
  const y = box.y - pad;
  const width = Math.ceil((box.width + pad * 2) / cell);
  const height = Math.ceil((box.height + pad * 2) / cell);
  if (width < 4 || height < 4 || width * height > budget * 2) return false;

  const room = live ? null : roomFor(width, height);
  const surface = surfaceFor(asked, width, height, room);
  if (!surface) return false;

  const field = createField({
    x,
    y,
    width,
    height,
    cell,
    ground,
    granulation,
  });
  lay(field, points, reach, cell, wet, load);
  const settled = density(field);
  if (!drawInto(surface, field, settled, color, page)) return false;
  const at: Dried = {
    ...asked,
    points: weakly(points),
    x,
    y,
    width,
    height,
    cell,
    surface,
  };
  keep(at, room?.admit ?? true);
  place(ctx, at);
  return true;
}

/** The box the path itself covers, before anything is added for the water. */
function bounds(points: readonly Point[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of points) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Walk the path, laying water and pigment into the field and stepping it as we
 *  go — the part that makes the mark a thing that *happened* rather than a
 *  shape that was filled.
 *
 *  The hand's speed thins the load, for the reason a dry brush thins: a brush
 *  dragged quickly leaves less of itself per inch of paper than one that
 *  dawdled. That is read straight off the samples the canvas stored, so it
 *  costs nothing and it is the difference between a stroke that pools where you
 *  slowed into a corner and a stroke of even weight. */
function lay(
  field: WashField,
  points: readonly Point[],
  reach: number,
  cell: number,
  wet: number,
  load: number,
): void {
  // Dabs close enough together that they overlap in the field, and never finer
  // than one cell — there is nothing between two adjacent cells to resolve.
  const spacing = Math.max(cell * 0.8, reach / 6);
  const along = trace(points, spacing);
  if (along.length === 0) return;
  // Per dab rather than per stroke, so a brush laying a long sweep and one
  // dabbing a spot leave the same depth of wash behind them.
  //
  // A point under a sweeping brush is passed over about `2·reach / spacing`
  // times, so that is what each dab is divided by — and a *tap*, which is one
  // dab and no sweep at all, is divided by one. Without that second half a
  // touch of a loaded brush comes out a tenth the weight of a stroke made with
  // the same brush, which is the one thing anybody would notice immediately.
  const passes = Math.min((2 * reach) / spacing, along.length);
  const perDab = 2 / Math.max(1, passes);
  const chunk = Math.max(1, Math.ceil(along.length / CHUNKS));
  let laid = 0;
  let stepped = 0;
  for (let i = 0; i < along.length; i++) {
    const p = along[i]!;
    // A brush that is moving fast is leaving less water behind it.
    const flow = 1 / (1 + (p.speed / 90) * wet);
    charge(
      field,
      p.x,
      p.y,
      reach,
      WATER_LOAD * wet * perDab * flow,
      PIGMENT_LOAD * load * perDab * flow,
    );
    laid++;
    if (laid % chunk === 0 && stepped < CHUNKS) {
      // The wash starts drying while the rest of it is still being painted.
      // This is what a bloom needs: somewhere damp to arrive.
      step(field);
      stepped++;
    }
  }
  for (; stepped < STEPS; stepped++) step(field);
}

/** Turn what settled into the field canvas's pixels.
 *
 *  Each cell becomes a transmittance rather than a colour, and then the
 *  colour-and-alpha pair that composites to the same thing (see `washFilm`).
 *
 *  `false` where the browser will not give us an image to write into, which
 *  drops the mark back to the simple engine. */
function drawInto(
  surface: Surface,
  field: WashField,
  settled: Float32Array,
  color: string,
  page: string,
): boolean {
  // Which way round the pigment reads, decided once for the whole mark: it is
  // a property of the sheet, and every cell of one wash has to agree about it.
  const dark = isDarkColor(page);
  const keep = keeping(color, dark);
  let image: ImageData;
  try {
    image = surface.ctx.createImageData(field.width, field.height);
  } catch {
    return false;
  }
  const pixels = image.data;
  for (let at = 0; at < settled.length; at++) {
    const film = washFilm(keep, settled[at]! * DENSITY, dark);
    const out = at * 4;
    if (!film) {
      pixels[out + 3] = 0;
      continue;
    }
    pixels[out] = byte(film[0]);
    pixels[out + 1] = byte(film[1]);
    pixels[out + 2] = byte(film[2]);
    pixels[out + 3] = byte(film[3]);
  }
  surface.ctx.putImageData(image, 0, 0);
  return true;
}

/** The least and the most of a channel one unit of pigment may leave.
 *
 *  Clamped off both ends: a channel left at zero would swallow the page at any
 *  density at all, and one left at exactly 1 would never shift it however much
 *  pigment landed. Neither is a pigment — the whitest white in a paintbox still
 *  absorbs something, and the blackest black still lets a little through. */
const KEEP_LEAST = 0.02;
const KEEP_MOST = 0.995;

/** How much of the page one unit of settled pigment leaves, per channel.
 *
 *  On a light sheet that is the ink's own colour: a pigment is something light
 *  has to get through, and what it lets through it goes on letting through
 *  however much of it lands. **On a dark sheet the page is the absence of ink**
 *  and the same physics runs the other way — the mark composites with `screen`
 *  rather than `multiply` (see `ground.ts`), so what the pigment eats into is
 *  the dark, and what it leaves is measured as the ink's complement.
 *
 *  Getting that wrong is not a subtlety. A white wash on a black page has a
 *  transmittance of ~1 in every channel, so unmirrored it stops nothing, comes
 *  out at half a percent of alpha, and the whole simulation paints an invisible
 *  mark — which is exactly what a dark canvas with the default white ink is. */
export function keeping(
  color: string,
  dark: boolean,
): [number, number, number] {
  const raw = channels(color);
  const keep = (v: number) =>
    Math.max(KEEP_LEAST, Math.min(KEEP_MOST, dark ? 1 - v : v));
  return [keep(raw[0]), keep(raw[1]), keep(raw[2])];
}

/** One cell of settled pigment as pixels: the colour and alpha, each 0–1, that
 *  composite to what `keeping` says is left of the page under it. `null` for a
 *  film too faint to be worth a pixel.
 *
 *  `keep ^ density` is Beer–Lambert with the ink standing in for its own
 *  absorption spectrum: a channel the pigment lets through stays let through
 *  however much of it there is, and a channel it stops falls away
 *  exponentially. That is what makes two passes of a yellow deepen towards
 *  yellow instead of drifting towards grey, and it is *exact* under the
 *  blending a wet mark on absorbent paper already uses — `multiply` on a light
 *  page comes out as `page × transmittance`, which is what a glaze is, and
 *  `screen` on a dark one comes out as its mirror.
 *
 *  Pure, and exported for the tests: this is the arithmetic the engine's whole
 *  picture rests on and it needs no canvas to check. */
export function washFilm(
  keep: readonly [number, number, number],
  density: number,
  dark: boolean,
): [number, number, number, number] | null {
  if (!(density > 0)) return null;
  const r = Math.pow(keep[0]!, density);
  const g = Math.pow(keep[1]!, density);
  const b = Math.pow(keep[2]!, density);
  // The alpha is what the *most* affected channel lost: any less and the colour
  // below would have to leave the 0–1 range to make up the difference.
  const alpha = 1 - Math.min(r, Math.min(g, b));
  if (alpha < FAINT) return null;
  // …and the colour that composites to those three, measured the same way
  // round `keep` was — so a dark page's film is turned back into ink here.
  const shade = (left: number) => {
    const ink = 1 - (1 - left) / alpha;
    return dark ? 1 - ink : ink;
  };
  return [shade(r), shade(g), shade(b), alpha];
}

/** A `#rrggbb` as three channel values in 0–1. */
function channels(color: string): [number, number, number] {
  const raw = color.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = /^[0-9a-fA-F]{6}$/.test(full) ? Number.parseInt(full, 16) : 0;
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
