// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rubber — what one takes off a page, and what it leaves behind.
//
// The plain eraser is not a medium at all, it is the compositing: a shape
// painted with `destination-out` that removes as much of whatever it covers as
// its alpha says (see `render.ts`). That is a *wipe*, and it is the right model
// for a rubbing out that means "this was a mistake".
//
// This is the other thing a rubber does, and it is a medium. Rub at a pencil
// passage with one and the passage does not go — it goes **paler**, unevenly,
// with the tooth of the sheet showing through what is left, and paler again the
// next time you pass over it. Three facts about the sheet are the whole of why:
//
//   - **Graphite lives on the peaks.** A lead rides the high points of the paper
//     and sheds flakes where it touches; the deep tooth never sees it (see
//     `graphite.ts`).
//   - **A rubber is soft but it is not liquid.** Its face bears down on those
//     same peaks and lifts them clean, and it bridges the dips — the harder you
//     press the further into them it deforms, and never all the way in.
//   - **So what survives a rubbing out is graphite in tooth the rubber could not
//     reach.** That is why a rubbed passage is a grey ghost rather than a clean
//     page, why the ghost is speckled rather than smooth, and why pressing
//     harder *fades* it instead of removing it.
//
// The lattice below is therefore the **pencil's own**: `paperTooth` is imported
// from `graphite.ts` rather than reinvented, because the claim only holds if the
// lead and the rubber are reading the same sheet. Like every other texture in
// this app it is hashed off the position rather than drawn at random, so a
// rubbing out grains identically on every repaint and in the exported PNG, and
// two passes over one patch agree about where the paper is low.
//
// Everything here is painted under `destination-out` (the tool declares
// `erases`), so an alpha of 0.5 in these lanes means *half of what is under it
// goes*, not half a coat of paint. Which is also why there is no colour in this
// file: what a rubbing out looks like is decided by what was under it.
//
// What it will not do is take ink off. The sparing is the renderer's half of
// the story rather than this painter's — a lifting mark takes everything it
// covers, and the marks a rubber could never have lifted are laid back over the
// hole afterwards (see `relayFixed` in `relay.ts`).

import type { Rect } from "../geometry.ts";
import { createSurface, wipeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import { PAPER_TOOTH, paperTooth } from "./graphite.ts";
import {
  HAIRLINE,
  PIXEL,
  driftNoise,
  hashedRandom,
  normalAt,
  pathLength,
  smoothstep,
  trace,
  type Trace,
} from "./grain.ts";
import { paintPath } from "./ink.ts";

/** The pitch the rubber reads the sheet at — **the pencil's own**, imported
 *  rather than declared, because a rubber that read the paper at its own pitch
 *  would be lifting from a sheet nobody drew on. */
const TOOTH = PAPER_TOOTH;

/** The most grain cells one rubbing out will lay down, past which the grain is
 *  coarsened rather than drawn. A rubber is a broad implement dragged over
 *  broad passages, so the budget is the pencil's — the mark is wider, and the
 *  coarsening below is what pays for it. */
const GRAIN_BUDGET = 26000;

/** The weights a lift is drawn at. Three, as the pencil has: what is being
 *  quantised is the same ramp read backwards. */
const LEVELS = [0.42, 0.72, 1] as const;

/** How much of what it covers one pass takes off where the face bears down
 *  fully — the number that makes this an eraser you rub *with* rather than one
 *  press of a delete key.
 *
 *  Short of 1 on purpose and by a long way: at 0.7 a first pass leaves a third
 *  of the mark, a second an eighth, a fourth a fortieth. That is a passage
 *  fading under your hand over a few strokes, which is what rubbing out
 *  actually feels like, and it is the whole difference from the plain eraser —
 *  whose strength dial reaches 1 and takes the lot in one drag. */
const LIFT = 0.7;

/** How deep into the sheet the face reaches with no weight behind it at all,
 *  and how much further a full press drives it. In the units `paperTooth`
 *  answers in, where a pencil's own deposit runs from about 0 to 1: a rubber
 *  leant on hard clears nearly everything a lead put down, and one held lightly
 *  takes the tops off and leaves the rest. */
const REACH_FLOOR = 0.14;
const REACH_SPAN = 0.78;

/** How abruptly the face stops reaching. Wide — wider than the whole range of
 *  the sheet — which is what makes the lift a *ramp* over the tooth rather than
 *  a depth it clears to and stops at: every cell the rubber touches gives up
 *  some of what it holds, the deep ones give up very little, and passing again
 *  takes the same fraction of what is left. That geometry is the feature. A
 *  mark fades and fades and is never quite gone, exactly as one does under a
 *  real rubber, and no pass anywhere ever multiplies a pixel to nothing. */
const SOFT = 1.1;

/** The rubber's face on the sheet: `lay` offers a press at a point, the paper
 *  decides how much of what is there the face can actually reach, and `paint`
 *  takes that much off the canvas.
 *
 *  Collected into flat coordinate runs and drawn a weight at a time — one
 *  `stroke()` per level rather than one per cell — the same arrangement, and for
 *  the same reason, as the lead in `graphite.ts`. */
function openFace(cell: number, pressure: number) {
  const lanes: number[][] = [[], [], []];
  const paintLevel = (
    ctx: CanvasRenderingContext2D,
    level: number,
    alpha: number,
  ): void => {
    const run = lanes[level]!;
    if (run.length === 0) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A shade *over* the lattice pitch, where the pencil's specks sit a shade
    // under it: a lead leaves separate flakes, a rubber leaves a wiped field
    // with what it missed showing through.
    ctx.lineWidth = cell * 1.15;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < run.length; i += 4) {
      ctx.moveTo(run[i]!, run[i + 1]!);
      ctx.lineTo(run[i + 2]!, run[i + 3]!);
    }
    ctx.stroke();
  };
  return {
    /** Bear down with `weight` (0–1½) at a point, dragging along (`tx`, `ty`). */
    lay(x: number, y: number, tx: number, ty: number, weight: number): void {
      if (weight <= 0.02) return;
      // Which cell of the sheet this is, and how deep the paper falls away in
      // it. Anchored to the page rather than to the mark, so two passes over
      // one patch bridge the same dips and the ghost holds still under a
      // repaint instead of crawling.
      const gx = Math.floor(x / TOOTH);
      const gy = Math.floor(y / TOOTH);
      const tooth = paperTooth(gx, gy);
      // How far into that cell the face is pressed. This one line is the medium.
      const reach = REACH_FLOOR + REACH_SPAN * pressure * weight;
      const lift = Math.min(1, Math.max(0, (reach - tooth) / SOFT));
      if (lift <= 0.02) return;
      // How far the lifted flakes are dragged along before they leave the
      // sheet. Longer than the pencil's scratch — graphite chips off where it
      // lands, but a rubber picks it up and *carries* it — so the cells a pass
      // clears join into a wiped field rather than reading as a dotted screen.
      const drag = cell * (0.4 + lift * 0.9);
      // Nudged off the lattice, so a well-rubbed patch is a rubbed patch and
      // not graph paper.
      const jx = x + (hashedRandom(gx, gy, 71) - 0.5) * cell * 0.7;
      const jy = y + (hashedRandom(gx, gy, 73) - 0.5) * cell * 0.7;
      lanes[
        Math.min(LEVELS.length - 1, Math.floor(lift * LEVELS.length))
      ]!.push(jx - tx * drag, jy - ty * drag, jx + tx * drag, jy + ty * drag);
    },
    /** One weight's lanes, stroked as a single path at `alpha` — a single
     *  `stroke()` covers the union of its lanes once, which is what keeps two
     *  presses overlapping in one pass from lifting twice. The live walk
     *  paints through this a level at a time, opaquely, so its held unions
     *  keep that property across frames (see `paintLiveRubbing`). */
    paintLevel,
    paint(ctx: CanvasRenderingContext2D, alpha: number): void {
      for (let level = 0; level < LEVELS.length; level++) {
        paintLevel(ctx, level, alpha * LIFT * LEVELS[level]!);
      }
    },
  };
}

/** The face dragged along the path: for each step down the mark, a row of
 *  presses laid across the contact patch.
 *
 *  A rubber is held far *less* steadily than a pencil — it is a block worked
 *  back and forth rather than a point placed on a line — so the hand's own
 *  unevenness is turned up here, and the patch fades out over its outer half
 *  instead of ending at an edge. That soft shoulder is what makes a rubbing out
 *  blend into the tone around it rather than cutting a window in it. */
function dragFace(
  face: ReturnType<typeof openFace>,
  along: readonly Trace[],
  half: number,
  cell: number,
  clip?: Rect,
  // The slice of presses to actually lay, for the live walk that lays each
  // exactly once (see `paintLiveRubbing`). Everything about a press still
  // reads off the whole mark — the settle, the bearing, the span — so a slice
  // lays exactly what a full drag would have laid at those points.
  from = 0,
  upto = along.length,
): void {
  const count = along.length;
  const span = along[count - 1]!.at;
  // How far in from each end the face takes to settle. Longer than the lead's:
  // a rubber rocks onto the sheet and rocks off it, and a rubbing out that
  // started at full weight would leave a step across the passage.
  const ramp = Math.max(1, Math.min(span * 0.3, 2 + half));
  // How far a press at one point of the path can possibly land grain from it:
  // across the contact patch, plus the lattice jitter, the drag the flakes are
  // carried on, and the lane's own width. A couple of cells of slack on a box
  // hundreds of pixels wide, which is the price of never dropping a cell that
  // would have landed inside it (see `PaintDetail.clip`).
  const slack = half + cell * 5;

  for (let i = from; i < upto; i++) {
    const p = along[i]!;
    // A press that cannot reach the patch being kept costs nothing but this
    // test. Everything about the presses that *are* laid is untouched — the
    // settle, the bearing and the grain all read off the whole mark and the
    // page — so the clip drops draws and never changes one.
    if (
      clip &&
      (p.x < clip.x - slack ||
        p.x > clip.x + clip.width + slack ||
        p.y < clip.y - slack ||
        p.y > clip.y + clip.height + slack)
    ) {
      continue;
    }
    const { nx, ny } = normalAt(along, i);
    // Along the mark — the direction the lifted graphite is carried in.
    const tx = -ny;
    const ty = nx;

    const settled = Math.sqrt(Math.min(1, Math.min(p.at, span - p.at) / ramp));
    // The hand leaning in and easing off as it works. A wider swing than the
    // pencil's, over a shorter distance, because that is the difference between
    // drawing a line and scrubbing at one.
    const bearing = 0.68 + 0.32 * driftNoise(p.at / 18, 53);
    // Swept fast, the face has less time to lift.
    const hurry = Math.max(0.45, 1 / (1 + p.speed / 52));
    const press = bearing * settled * hurry;

    // The contact patch, wobbling as the block rides over the sheet.
    const w = half * (0.92 + 0.08 * driftNoise(p.at / 30, 19));
    // The shoulder: the outer half of the face carries less and less weight,
    // because a rubber's corners are rounded off within a day of owning it.
    const core = w * 0.45;
    const shoulder = Math.max(cell, w - core);

    const phase = (driftNoise(p.at / 9, 37) - 0.5) * cell;
    const steps = Math.ceil((w + cell) / cell);
    for (let k = -steps; k <= steps; k++) {
      const u = k * cell + phase;
      const shape = 1 - smoothstep(core, core + shoulder, Math.abs(u));
      if (shape <= 0) continue;
      face.lay(p.x + nx * u, p.y + ny * u, tx, ty, shape * press);
    }
  }
}

/** The face pressed down and lifted straight off — a dab rather than a rub, and
 *  the whole of what a kneaded eraser is used for. */
function stampFace(
  face: ReturnType<typeof openFace>,
  at: Point,
  half: number,
  cell: number,
): void {
  const w = half * 0.92;
  const core = w * 0.45;
  const shoulder = Math.max(cell, w - core);
  const angle = hashedRandom(at.x, at.y, 3) * Math.PI * 2;
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  for (let dy = -w - cell; dy <= w + cell; dy += cell) {
    for (let dx = -w - cell; dx <= w + cell; dx += cell) {
      const shape = 1 - smoothstep(core, core + shoulder, Math.hypot(dx, dy));
      if (shape <= 0) continue;
      face.lay(at.x + dx, at.y + dy, tx, ty, shape * 0.85);
    }
  }
}

// --- The rubbing under the hand, laid once -----------------------------------
//
// A rubbing out is repainted twice per pointer sample — once as the hole, once
// as the relay's mask (see `relay.ts`) — and the full drag above walks the
// whole gesture both times, so a long scrub cost the square of its own length
// and settled around two full grain budgets per frame. The live walk below is
// the quill's arrangement (see `openScribe` in `quillSim.ts`) worked in lanes
// instead of cells: a press whose weight can no longer change is laid **once**
// into a held union of lanes per weight, and each frame lays only the tail the
// end can still lighten — the rock-off ramp, and the couple of samples whose
// smoothed speed is still moving. A frame of scrubbing then costs the presses
// that arrived, not the presses that ever were.
//
// The unions are held *opaque*, one surface per weight, and given their alpha
// only as they are blitted — because a level's lanes must lift as one pass,
// however many frames laid them (see `paintLevel`), and an opaque union is the
// one thing a canvas accumulates idempotently. Blitting the three levels
// through the caller's compositing is then exactly the three strokes the full
// drag would have made.
//
// One honest difference from the full drag: the live walk works at the finest
// cell rather than coarsening past `GRAIN_BUDGET` — a budget is a cap on work
// *per paint*, and the live walk's work per paint is the tail. A rubbing long
// enough to be coarsened therefore refines a shade when it lands and repaints
// through the budgeted path; the trade the budget bought before was the whole
// mark re-graining continuously *while* rubbed, which was worse.

/** How many raw samples back the smoothed speed can still change (`trace`
 *  smooths over ±2), so no press whose hurry could move is ever laid for
 *  good — the quill's own window, for the quill's own reason. */
const SPEED_WINDOW = 2;

/** The most cells the held surfaces may span — a cell is a device pixel, near
 *  enough, so this is roughly two full screens. Past it the walk gives up and
 *  the gesture pays the full drag it always did. */
const LIVE_SPAN = 4_194_304;

/** How much room the held surfaces are opened with beyond the gesture so far,
 *  in cells on every side, so growing is an occasional copy rather than one
 *  per frame. */
const HEADROOM = 96;

/** The rubbing still under the hand: which gesture it is, how much of it has
 *  been laid for good, and the patch of page the unions cover. */
type HeldRub = {
  points: readonly Point[];
  size: number;
  scale: number;
  press: number;
  alpha: number;
  cell: number;
  /** Presses laid for good, as a count into the trace lattice. */
  settled: number;
  /** The patch the surfaces cover: origin on the cell lattice (document
   *  coordinates), extent in cells. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** One opaque union of lanes per weight (see `LEVELS`). */
  levels: readonly [Surface, Surface, Surface];
};

let heldRub: HeldRub | null = null;
/** …and the surface a level's union is combined with the tail on, reused
 *  across frames and levels for the allocator's sake. */
let rubScratch: Surface | null = null;

/** Drop the held walk. Tests only — the app holds it for its lifetime, the
 *  way the relay holds its surfaces. */
export function dropHeldRubbing(): void {
  heldRub = null;
  rubScratch = null;
}

/** Whether `next` is `prior` with more on the end — the samples compared by
 *  identity, exactly as the trail and the quill compare them: a gesture
 *  appends immutable points, so anything rebuilt fails and the walk starts
 *  over, which costs a relay rather than a wrong mark. */
function grownBy(prior: readonly Point[], next: readonly Point[]): boolean {
  if (next.length < prior.length) return false;
  for (let i = 0; i < prior.length; i++) {
    if (prior[i] !== next[i]) return false;
  }
  return true;
}

/** Point a surface's context at the patch: document coordinates in, cells
 *  out. */
function latticeTransform(
  surface: Surface,
  held: {
    x: number;
    y: number;
    cell: number;
  },
): void {
  surface.ctx.setTransform(
    1 / held.cell,
    0,
    0,
    1 / held.cell,
    -held.x / held.cell,
    -held.y / held.cell,
  );
}

/** The arc length through raw sample `upto` — how far along the mark the
 *  speeds can no longer change. */
function arcThrough(points: readonly Point[], upto: number): number {
  let span = 0;
  for (let i = 1; i <= upto && i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    span += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return span;
}

/** The held walk for this gesture — validated, opened, or regrown to cover
 *  it. `null` when a live walk cannot run (no DOM, a gesture past the span
 *  cap), and the caller pays the full drag. */
function heldFor(
  points: readonly Point[],
  size: number,
  scale: number,
  press: number,
  alpha: number,
  cell: number,
  half: number,
): HeldRub | null {
  // Everything a press's lanes read besides the path itself; a change means
  // these pixels describe some other rubbing.
  const valid =
    heldRub !== null &&
    heldRub.size === size &&
    heldRub.scale === scale &&
    heldRub.press === press &&
    heldRub.alpha === alpha &&
    heldRub.cell === cell &&
    grownBy(heldRub.points, points);
  const held = valid ? heldRub! : null;

  // The patch the gesture needs: its box, plus how far a press can land grain
  // from the path — the same slack the drag's clip test allows.
  const pad = half + cell * 6;
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
  const wantX = Math.floor((left - pad) / cell) * cell;
  const wantY = Math.floor((top - pad) / cell) * cell;
  const wantW = Math.ceil((right + pad - wantX) / cell);
  const wantH = Math.ceil((bottom + pad - wantY) / cell);
  if (
    held &&
    wantX >= held.x &&
    wantY >= held.y &&
    wantX + wantW * cell <= held.x + held.width * cell &&
    wantY + wantH * cell <= held.y + held.height * cell
  ) {
    return held;
  }

  // Open fresh — or regrow around what is already laid, carrying the unions
  // over so nothing is ever laid twice.
  const room = HEADROOM * cell;
  const x = Math.min(held?.x ?? Infinity, wantX - room);
  const y = Math.min(held?.y ?? Infinity, wantY - room);
  const width = Math.ceil(
    (Math.max(
      held ? held.x + held.width * cell : -Infinity,
      wantX + wantW * cell + room,
    ) -
      x) /
      cell,
  );
  const height = Math.ceil(
    (Math.max(
      held ? held.y + held.height * cell : -Infinity,
      wantY + wantH * cell + room,
    ) -
      y) /
      cell,
  );
  if (width * height > LIVE_SPAN) {
    heldRub = null;
    return null;
  }
  const levels: Surface[] = [];
  for (let level = 0; level < LEVELS.length; level++) {
    const surface = createSurface(width, height);
    if (!surface) {
      heldRub = null;
      return null;
    }
    levels.push(surface);
  }
  const next: HeldRub = {
    points,
    size,
    scale,
    press,
    alpha,
    cell,
    settled: held?.settled ?? 0,
    x,
    y,
    width,
    height,
    levels: levels as unknown as readonly [Surface, Surface, Surface],
  };
  for (let level = 0; level < LEVELS.length; level++) {
    const surface = levels[level]!;
    if (held) {
      // The old unions, slid to their new places — whole cells, so the copy
      // is lossless.
      surface.ctx.drawImage(
        held.levels[level]!.canvas,
        Math.round((held.x - x) / cell),
        Math.round((held.y - y) / cell),
      );
    }
    latticeTransform(surface, next);
  }
  heldRub = next;
  return next;
}

/** The combining surface, sized to the held patch. */
function scratchFor(width: number, height: number): Surface | null {
  const held = rubScratch ?? createSurface(width, height);
  if (!held) return null;
  rubScratch = held;
  return wipeSurface(held, width, height);
}

/** Paint the rubbing under the hand by advancing the held walk: settle the
 *  presses whose weight can no longer change, lay the still-changing tail
 *  over a copy of the unions, and blit the three weights through whatever
 *  compositing the caller has in force — the hole and the relay's mask are
 *  the same three blits. `false` when a live walk cannot run, and the caller
 *  pays the full drag, exactly as every frame did before this existed. */
function paintLiveRubbing(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale: number,
  press: number,
  alpha: number,
): boolean {
  const cell = Math.max(TOOTH, PIXEL / scale);
  const half = Math.max(cell * 0.5, size / 2);
  const along = trace(points, cell * 0.85);
  if (along.length < 2) return false;
  const held = heldFor(points, size, scale, press, alpha, cell, half);
  if (!held) return false;
  const scratch = scratchFor(held.width, held.height);
  if (!scratch) {
    heldRub = null;
    return false;
  }

  const count = along.length;
  const span = along[count - 1]!.at;
  const ramp = Math.max(1, Math.min(span * 0.3, 2 + half));
  // A press is only laid for good once nothing after it can change it: the
  // settle ramp has stopped moving with the span, the end's rock-off can no
  // longer reach it, and its smoothed speed is final.
  let frontier = held.settled;
  if (span * 0.3 >= 2 + half) {
    const safe = Math.min(
      span - ramp - cell,
      arcThrough(points, points.length - 1 - SPEED_WINDOW),
    );
    let upto = frontier;
    while (upto < count && along[upto]!.at <= safe) upto++;
    if (upto > frontier) {
      const face = openFace(cell, press);
      dragFace(face, along, half, cell, undefined, frontier, upto);
      for (let level = 0; level < LEVELS.length; level++) {
        face.paintLevel(held.levels[level]!.ctx, level, 1);
      }
      frontier = upto;
    }
  }
  held.settled = frontier;
  held.points = points;

  // The tail the end still owns, collected once…
  const tail = openFace(cell, press);
  dragFace(tail, along, half, cell, undefined, frontier, count);
  // …and each weight blitted as the union of its settled and tail lanes, at
  // the alpha the full drag would have stroked it with.
  const kept = ctx.globalAlpha;
  for (let level = 0; level < LEVELS.length; level++) {
    wipeSurface(scratch, held.width, held.height);
    scratch.ctx.drawImage(held.levels[level]!.canvas, 0, 0);
    latticeTransform(scratch, held);
    tail.paintLevel(scratch.ctx, level, 1);
    scratch.ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * LIFT * LEVELS[level]!;
    ctx.drawImage(
      scratch.canvas,
      0,
      0,
      held.width,
      held.height,
      held.x,
      held.y,
      held.width * cell,
      held.height * cell,
    );
  }
  ctx.globalAlpha = kept;
  return true;
}

/** How coarse to work the grain at: the sheet's own tooth, or the device pixel
 *  once the view is pulled back far enough that the tooth is finer than one.
 *  Marks big enough to blow the budget coarsen by exactly the factor that brings
 *  them back inside it. */
function grainCell(length: number, size: number, scale: number): number {
  const cell = Math.max(TOOTH, PIXEL / scale);
  const wanted = ((length + size) * (size + 2 * cell)) / (cell * cell);
  if (wanted <= GRAIN_BUDGET) return cell;
  return cell * Math.sqrt(wanted / GRAIN_BUDGET);
}

/** Paint a rubbing out: a rubber worked along a path, taking off as much as it
 *  can reach of whatever is under it.
 *
 *  `pressure` is how hard the hand is bearing down, as a fraction of an ordinary
 *  rub. It reaches how *deep into the sheet* the face gets and nothing else — so
 *  leaning on the rubber fades the ghost rather than widening the mark, which is
 *  the same relationship the pencil's grade has to its line.
 *
 *  `clip` is the patch the caller is actually keeping (see `PaintDetail.clip`):
 *  presses that cannot reach it are never laid, and the ones that are grain
 *  identically to an unclipped paint — the cell, the lattice and the hand all
 *  read off the whole mark and the page, never off the box.
 *
 *  `live` says this is the gesture still under the hand (see
 *  `PaintDetail.live`), which is the one paint that happens per pointer sample
 *  rather than per mark: it goes through the held walk above, laying each
 *  press once instead of the whole gesture twice a frame. */
export function paintRubbing(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  pressure = 1,
  clip?: Rect,
  live = false,
): void {
  const first = points[0];
  if (!first) return;
  const alpha = ctx.globalAlpha;
  const press = Math.max(0.05, pressure);

  if (size * scale < HAIRLINE) {
    // Pulled back far enough that the whole mark lands inside one pixel. The
    // grain is finer than that, so what is left of a rubbing out is a line
    // taking off what the cells average out to.
    ctx.globalAlpha = alpha * Math.min(1, LIFT * 0.75 * press);
    paintPath(ctx, points, size);
    ctx.globalAlpha = alpha;
    return;
  }

  if (live && paintLiveRubbing(ctx, points, size, scale, press, alpha)) {
    ctx.globalAlpha = alpha;
    return;
  }

  const cell = grainCell(pathLength(points), size, scale);
  // A rubber narrower than the sheet's grain still has to lift a cell.
  const half = Math.max(cell * 0.5, size / 2);
  const face = openFace(cell, press);
  const along = trace(points, cell * 0.85);
  if (along.length < 2) stampFace(face, first, half, cell);
  else dragFace(face, along, half, cell, clip);
  face.paint(ctx, alpha);
  ctx.globalAlpha = alpha;
}
