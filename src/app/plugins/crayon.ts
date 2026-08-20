// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The crayon.
//
// **How this build draws one:** the wax simulation (`waxSim.ts` over
// `waxField.ts`) — a sheet model, like the pencil's. There is a piece of paper
// with a tooth on it and a stick of wax dragged over it, and the mark is
// whatever the paper kept: the clumped speckle of a light pass, the valleys
// filling in under a second one, the near-solid a leaned-on stick burnishes
// to, and the same stroke coming out differently on rough stock and
// hot-pressed. The `soft` dial picks the stick — china marker to wax crayon
// to oil pastel — the way the pencil's grade picks the lead.
//
// What is below is the **fallback**: the geometric grain painter this app
// drew crayons with before the simulation, kept because the engine must be
// able to say no — no DOM, a view pulled back until the mark is a hairline, a
// face under a few cells — and every one of those must still draw. The
// fallback fires at sizes where the medium's character cannot show, which is
// what makes falling back invisible; the seam is `paintCrayon` at the foot of
// this file, so "it must fall back rather than fail" is a property of the
// seam instead of a thing every caller has to remember.
//
// A crayon mark is not a line with a rough edge. It is **wax pressed onto a
// textured sheet**, and almost everything that makes one recognisable follows
// from that one fact:
//
//   - Paper has a *tooth* — a field of microscopic peaks and valleys. The stick
//     is dragged across the peaks and leaves wax on them; the valleys never
//     touch it and stay the colour of the page. That speckle is the whole
//     signature of the medium, and it is why a crayon can never be flat colour.
//   - **The tooth belongs to the paper, not to the stick.** A fat crayon and a
//     thin one grain at exactly the same size, because they are drawing on the
//     same sheet. This is the thing a naive implementation gets wrong: scale a
//     thin crayon's wobble up with its width and a broad mark turns into a
//     lumpy sausage, when what it should be is a *wider band of the same fine
//     speckle*. Every length below is therefore either fixed in document pixels
//     (the grain, the fray at the edge) or deliberately sub-linear in the
//     stick's width (the furrows) — see `TOOTH`.
//   - The contact patch is a blunt, worn face, so the edges of the mark are
//     ragged and fray outwards into loose specks rather than stopping.
//   - Wax comes off under pressure and friction, so the mark's density drifts
//     as the hand bears down and lifts, thins where the hand hurried, and fades
//     in and out at the two ends instead of starting square.
//
// Everything is hashed off the position rather than drawn at random, so the
// same stroke grains identically on every repaint and in the exported PNG (the
// rule every painter follows — see `grain.ts`, which this shares its hashes and
// its path walk with). And because two strokes that cross look up the *same*
// lattice, they agree about where the paper is low — the sheet reads as one
// sheet rather than as a pile of separately-textured decals.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import type { Point } from "../types.ts";
import { mm } from "../units.ts";
import { paintSimulatedWax } from "./waxSim.ts";
import { WAX_CRAYON } from "./waxField.ts";
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

/** The pitch of the paper's grain, in document pixels.
 *
 *  The single most important number in this file, and the one that has to stay
 *  a *constant* rather than a fraction of the stroke's width: it is a property
 *  of the sheet. Cartridge paper's tooth is around a fifth of a millimetre —
 *  which, now that a document pixel is a real distance, is simply what it says
 *  (see `units.ts`) rather than the two-and-a-bit pixels it was guessed at. */
const TOOTH = mm(0.2);

/** The most grain cells one mark will lay down. A full-page scribble with a
 *  broad crayon would otherwise ask for hundreds of thousands of them; past
 *  this the grain is coarsened instead (see `grainCell`), which costs the mark
 *  some fineness and keeps the page at frame rate. */
const GRAIN_BUDGET = 30000;

/** The four weights wax is laid down at. Grain is drawn a bucket at a time —
 *  one path and one stroke per level — because a mark is tens of thousands of
 *  specks and a `stroke()` apiece would cost more than the rest of the page put
 *  together. Four is enough that the ramp from bare paper to solid wax reads as
 *  a ramp; a fifth is not visible. */
const LEVELS = [0.4, 0.63, 0.83, 1] as const;

/** The paper's height at one grain cell, centred on 0.5.
 *
 *  Three octaves of blocky value noise: single cells for the speck, pairs of
 *  cells for the clumps, quads for the islands of paper a crayon rides straight
 *  over. Real tooth is clumped like that, and a single octave of white noise
 *  reads as television static instead.
 *
 *  The weights sum to more than one and the sum is re-centred, which *widens*
 *  the distribution on purpose. Three averaged octaves pile up into a bell so
 *  narrow that every part of a mark comes out either solid or bare, with no
 *  grain in between; stretched, the same lattice gives a speckled core, a
 *  fraying edge, and everything between them. */
function toothAt(gx: number, gy: number): number {
  const speck = hashedRandom(gx, gy, 7);
  const clump = hashedRandom(gx >> 1, gy >> 1, 11);
  const island = hashedRandom(gx >> 2, gy >> 2, 13);
  return 0.85 * speck + 0.55 * clump + 0.42 * island - 0.41;
}

/** How coarse to work the grain at, in document pixels: the paper's own tooth,
 *  or the device pixel when the view is pulled back far enough that the tooth
 *  is finer than one — grain drawn smaller than a pixel is arithmetic with
 *  nothing to show for it. Marks big enough to blow the budget coarsen further,
 *  by exactly the factor that brings them back inside it. */
function grainCell(length: number, size: number, scale: number): number {
  const cell = Math.max(TOOTH, PIXEL / scale);
  const wanted = ((length + size) * (size + 2 * cell)) / (cell * cell);
  if (wanted <= GRAIN_BUDGET) return cell;
  return cell * Math.sqrt(wanted / GRAIN_BUDGET);
}

/** Wax being laid onto the sheet: `lay` offers a deposit at a point, the paper
 *  decides whether any of it sticks, and `paint` puts what stuck on the canvas.
 *
 *  The specks are collected into flat coordinate runs rather than drawn as they
 *  are worked out, which is what makes one mark four `stroke()` calls instead of
 *  thirty thousand. They are capsules — a short segment under a round cap —
 *  because that is both the cheapest thing a path can hold and the right shape:
 *  wax smears *along* the direction of travel, which is why a crayon's speckle
 *  is made of little dashes and not of dots. */
function openWax(cell: number) {
  const lanes: number[][] = [[], [], [], []];
  return {
    /** Offer `deposit` (0–1) of wax at a point, smearing along (`tx`, `ty`). */
    lay(x: number, y: number, tx: number, ty: number, deposit: number): void {
      if (deposit <= 0.02) return;
      // Which cell of the sheet this is, and how high the paper stands in it.
      // Anchored to the page rather than to the mark, so the grain holds still
      // under a repaint and two crossing strokes skip the same valleys.
      const gx = Math.floor(x / TOOTH);
      const gy = Math.floor(y / TOOTH);
      const paper = toothAt(gx, gy);
      // The valley the stick never reached. This one line is the medium.
      if (paper >= deposit) return;
      const bite = Math.min(1, (deposit - paper) / 0.32);
      // How far the speck is dragged, which is the difference between wax and
      // stipple. Well over the lattice pitch, so specks run into their
      // neighbours down the mark and a well-covered patch closes into solid wax
      // whose *gaps* are streaks. Longer where the wax is going on thick and
      // short at the fraying edge, because a peak the stick barely grazed has
      // nothing on it to smear. Overlap is free: a run is one `stroke()`, so a
      // path crossing itself composites once however often it laps over.
      const reach = cell * (0.6 + bite * 1.1 + hashedRandom(gx, gy, 3) * 0.9);
      // Nudged off the lattice so a dense field is wax and not graph paper.
      const jx = x + (hashedRandom(gx, gy, 5) - 0.5) * cell * 0.6;
      const jy = y + (hashedRandom(gx, gy, 6) - 0.5) * cell * 0.6;
      lanes[
        Math.min(LEVELS.length - 1, Math.floor(bite * LEVELS.length))
      ]!.push(
        jx - tx * reach,
        jy - ty * reach,
        jx + tx * reach,
        jy + ty * reach,
      );
    },
    paint(ctx: CanvasRenderingContext2D, alpha: number): void {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Exactly the lattice pitch, so neighbouring specks meet without
      // overrunning each other. The specks are long and no wider than this on
      // purpose: wax that spread sideways as far as it smears forwards would
      // paint over the valleys either side of it, and the valleys showing
      // through are the entire point.
      ctx.lineWidth = cell;
      for (const [level, run] of lanes.entries()) {
        if (run.length === 0) continue;
        ctx.globalAlpha = alpha * LEVELS[level]!;
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

/** The stick dragged along the path: for each step down the mark, a row of
 *  deposits laid across the contact patch.
 *
 *  The row is where the medium's asymmetries live. Across the patch: the lean
 *  that puts the weight on one side of the face, furrows ploughed by the worn
 *  facets of the tip, and two independently ragged edges that fray outwards
 *  over a band a few document pixels wide *however wide the stick is*. Along
 *  it: the hand's pressure drifting, less wax where it hurried, and both ends
 *  fading in rather than starting square. */
function dragTip(
  wax: ReturnType<typeof openWax>,
  along: readonly Trace[],
  half: number,
  size: number,
  cell: number,
  bearDown: number,
): void {
  const count = along.length;
  const span = along[count - 1]!.at;
  // How far in from each end the stick takes to settle onto the page. A long
  // sweep fades in over a centimetre; a short dash can't spend more than a
  // third of itself on it.
  const ramp = Math.max(1, Math.min(span * 0.3, 4 + size * 0.7));
  // The furrows the tip's worn facets plough along the mark. Their pitch grows
  // with the stick — a broad crayon lays down a few wide ones — but only
  // slowly, and never so fine that it becomes a second grain competing with the
  // paper's.
  const furrow = Math.max(2.4, Math.min(7, size * 0.16));

  for (let i = 0; i < count; i++) {
    const p = along[i]!;
    const { nx, ny } = normalAt(along, i);
    // Along the mark — the direction wax smears in.
    const tx = -ny;
    const ty = nx;

    const settled = Math.sqrt(Math.min(1, Math.min(p.at, span - p.at) / ramp));
    // The hand bearing down and easing off, over a few centimetres of travel.
    const bearing = 0.74 + 0.26 * driftNoise(p.at / 30, 3);
    // Which part of the face is carrying the weight. Nobody holds a crayon
    // square to the page: it leans, and the lean wanders as the hand turns
    // through a stroke, so one side of a broad mark is solid wax while the
    // other is frayed — and which side that is changes as the mark travels.
    // On a thin stick this is invisible; on a fat one it is most of the
    // difference between a crayon and an airbrushed ribbon.
    const lean = (driftNoise(p.at / 45, 29) - 0.5) * 1.1;
    // Wax needs friction and time; dragged fast, the stick leaves less of it.
    const hurry = Math.max(0.45, 1 / (1 + p.speed / 30));
    // …and how hard the hand is bearing down over the whole mark, which is the
    // one part of this the user sets. It multiplies the *deposit*, so a heavy
    // hand fills the paper's valleys in until the mark closes up and a light
    // one leaves the sheet showing through — never a wider or a darker line.
    const press = Math.max(0.1, bearing * settled * hurry * bearDown);

    // The contact patch, rocking a little as the stick travels. It narrows at
    // the ends far less than it fades — the face of the stick is the width it
    // is, it just arrives with less weight behind it.
    const w =
      half * (0.86 + 0.14 * driftNoise(p.at / 40, 7)) * (0.82 + 0.18 * settled);
    // How ragged the two edges are, in document pixels. Nearly constant at
    // width — a worn face is a couple of pixels of chipped, whatever the stick
    // — but never more than a third of a thin crayon, which would be all there
    // is of it.
    const chip = Math.min(w * 0.34, 1.3 + w * 0.05);
    const left = w + (driftNoise(p.at / 6.5, 41) - 0.5) * 2 * chip;
    const right = w + (driftNoise(p.at / 6.5, 59) - 0.5) * 2 * chip;

    // Walked outwards from the axis rather than from one rim, so however fine
    // the stick is there is always a deposit offered *down the middle* of it —
    // a crayon narrower than the paper's grain is a line with nicks in it, not
    // a dotted line. The rows are slid sideways by up to half a cell as the
    // mark travels, which is what keeps them from lining up into visible lanes
    // along a straight stroke.
    const phase = (driftNoise(p.at / 11, 71) - 0.5) * cell;
    const steps = Math.ceil((Math.max(left, right) + cell) / cell);
    for (let k = -steps; k <= steps; k++) {
      const u = k * cell + phase;
      const edge = u < 0 ? left : right;
      if (edge <= 0) continue;
      const across = Math.abs(u);
      // The band the mark frays over. Held to a few document pixels rather than
      // a fraction of the width, because a chipped edge is a chipped edge: this
      // is what stops a broad crayon reading as an airbrushed ribbon. The core
      // it leaves is never allowed below one grain cell, or a thin crayon would
      // be all fray and no mark.
      const fray = Math.min(edge * 0.6, 1.5 + edge * 0.1);
      const core = Math.max(edge - fray, cell * 0.45);
      const shape =
        1 -
        smoothstep(
          core,
          Math.max(core + cell * 0.5, edge + fray * 0.5),
          across,
        );
      if (shape <= 0) continue;
      const weight = 1 - 0.34 * Math.min(1, ((u / edge - lean) / 1.15) ** 2);
      const streak = 0.78 + 0.22 * driftNoise(u / furrow + p.at / 300, 19);
      wax.lay(
        p.x + nx * u,
        p.y + ny * u,
        tx,
        ty,
        shape * weight * streak * press,
      );
    }
  }
}

/** The stick pressed down and lifted: a patch of grain rather than a dot.
 *
 *  A tap is a whole stroke's worth of medium in one place, so it gets the same
 *  things a dragged mark does — a skid in one hashed direction for the wax to
 *  smear along, a lean so one side of the patch carries the weight, and the
 *  furrows of the tip's face across it. Without them the widest crayon's tap
 *  comes out as a flat disc, which is the one shape wax on paper never makes. */
function stampTip(
  wax: ReturnType<typeof openWax>,
  at: Point,
  half: number,
  size: number,
  cell: number,
  bearDown: number,
): void {
  const w = half * 0.94;
  const fray = Math.min(w * 0.6, 1.5 + w * 0.1);
  const furrow = Math.max(2.4, Math.min(7, size * 0.16));
  const angle = hashedRandom(at.x, at.y, 3) * Math.PI * 2;
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  const lean = (hashedRandom(at.x, at.y, 9) - 0.5) * 1.1;
  for (let dy = -w - cell; dy <= w + cell; dy += cell) {
    for (let dx = -w - cell; dx <= w + cell; dx += cell) {
      const across = Math.hypot(dx, dy);
      const shape = 1 - smoothstep(w - fray, w + fray * 0.5, across);
      if (shape <= 0) continue;
      // How far across the skid this is — the tap's equivalent of the offset
      // along the nib that a dragged mark's rows are laid out on.
      const off = dx * -ty + dy * tx;
      const weight = 1 - 0.32 * Math.min(1, ((off / w - lean) / 1.15) ** 2);
      const streak = 0.78 + 0.22 * driftNoise(off / furrow, 19);
      wax.lay(
        at.x + dx,
        at.y + dy,
        tx,
        ty,
        shape * weight * streak * 0.94 * bearDown,
      );
    }
  }
}

/** Paint a crayon mark: wax pressed onto the page's tooth along a path.
 *
 *  The seam. The simulation answers whether it actually ran, and a `false`
 *  falls through to the geometric grain painter here rather than at the call
 *  site — a browser with no canvas to work on, a view pulled back until the
 *  mark is a hairline, a face finer than a couple of cells: all of them draw,
 *  and all of them draw the mark this app has always drawn.
 *
 *  `pressure` is how hard the hand bears down — a fraction of the ordinary,
 *  1 being it. It reaches only the *deposit*, never the geometry: bearing down
 *  fills the paper's valleys in, easing off leaves the sheet showing through,
 *  and neither makes the stick any wider. `soft` is which stick is in the
 *  hand — china marker to oil pastel, wax crayon at 1 — and **both** engines
 *  take both, so a mark that fell through keeps the stick and the weight it
 *  was drawn with (see `SOFT` in `builtin/dials.ts`). */
export function paintCrayon(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  pressure = 1,
  soft = WAX_CRAYON,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  clip?: Rect,
  live = false,
): void {
  const first = points[0];
  if (!first) return;
  if (
    paintSimulatedWax(
      ctx,
      points,
      size,
      scale,
      pressure,
      soft,
      ground,
      color,
      clip,
      live,
    )
  ) {
    return;
  }
  const alpha = ctx.globalAlpha;

  // The fallback keeps the stick's grade the honest way it can without a
  // sheet to dig into: a softer stick sheds more onto the same tooth, so the
  // grade rides the deposit beside the hand's own weight.
  const bearDown = Math.max(0, pressure) * (0.72 + 0.28 * Math.max(0, soft));

  if (size * scale < HAIRLINE) {
    // Pulled back far enough that the whole mark is inside one pixel. The
    // grain, the fray and the furrows are all smaller than that, so what is
    // left of a crayon here is a line at the weight the wax averages out to.
    ctx.globalAlpha = alpha * Math.min(1, 0.8 * bearDown);
    paintPath(ctx, points, size);
    ctx.globalAlpha = alpha;
    return;
  }

  const cell = grainCell(pathLength(points), size, scale);
  // A crayon narrower than the paper's grain still has to put a speck down.
  const half = Math.max(cell * 0.5, size / 2);
  const wax = openWax(cell);
  const along = trace(points, cell);
  if (along.length < 2) stampTip(wax, first, half, size, cell, bearDown);
  else dragTip(wax, along, half, size, cell, bearDown);
  wax.paint(ctx, alpha);
  ctx.globalAlpha = alpha;
}
