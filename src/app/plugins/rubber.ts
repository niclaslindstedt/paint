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
// hole afterwards (see `relayFixed` in `render.ts`).

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
    paint(ctx: CanvasRenderingContext2D, alpha: number): void {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // A shade *over* the lattice pitch, where the pencil's specks sit a shade
      // under it: a lead leaves separate flakes, a rubber leaves a wiped field
      // with what it missed showing through.
      ctx.lineWidth = cell * 1.15;
      for (const [level, run] of lanes.entries()) {
        if (run.length === 0) continue;
        ctx.globalAlpha = alpha * LIFT * LEVELS[level]!;
        ctx.beginPath();
        for (let i = 0; i < run.length; i += 4) {
          ctx.moveTo(run[i]!, run[i + 1]!);
          ctx.lineTo(run[i + 2]!, run[i + 3]!);
        }
        ctx.stroke();
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
): void {
  const count = along.length;
  const span = along[count - 1]!.at;
  // How far in from each end the face takes to settle. Longer than the lead's:
  // a rubber rocks onto the sheet and rocks off it, and a rubbing out that
  // started at full weight would leave a step across the passage.
  const ramp = Math.max(1, Math.min(span * 0.3, 2 + half));

  for (let i = 0; i < count; i++) {
    const p = along[i]!;
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
 *  the same relationship the pencil's grade has to its line. */
export function paintRubbing(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  pressure = 1,
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

  const cell = grainCell(pathLength(points), size, scale);
  // A rubber narrower than the sheet's grain still has to lift a cell.
  const half = Math.max(cell * 0.5, size / 2);
  const face = openFace(cell, press);
  const along = trace(points, cell * 0.85);
  if (along.length < 2) stampFace(face, first, half, cell);
  else dragFace(face, along, half, cell);
  face.paint(ctx, alpha);
  ctx.globalAlpha = alpha;
}
