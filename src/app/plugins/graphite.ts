// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The graphite pencil — the sketching tool.
//
// It is a near neighbour of the crayon (`crayon.ts`) and deliberately not the
// same painter, because graphite and wax are not the same medium:
//
//   - **Graphite is a colour, not an ink.** A pencil lays down flakes of a grey
//     mineral, and no amount of choosing a swatch makes one draw in red. So the
//     tool mixes its own colour (see `graphiteInk`) instead of taking the
//     toolbar's, and the only thing that moves is how dark it is.
//   - **The lead has a grade.** 2H is hard, sits on the peaks of the paper and
//     leaves a pale broken line you can still see the sheet through; 6B is soft,
//     crumbles into the valleys and goes down almost black. That one axis is the
//     whole character of a pencil, and it is the tool's dial.
//   - **Graphite does not smear the way wax does.** Wax melts under friction and
//     drags out into little dashes; graphite flakes off and stays where it
//     landed. The specks here are therefore short — barely longer than the
//     paper's grain — which is what makes the mark read as *scratched* rather
//     than as crayoned.
//   - **The tooth is finer.** A pencil finds detail in the sheet that a blunt
//     wax stick rides straight over, so the lattice is worked at a smaller pitch.
//
// Everything else follows the rules every painter in this app follows: the
// scatter is hashed off the position rather than drawn at random, so a mark
// grains identically on every repaint and in the exported PNG, and two crossing
// strokes agree about where the paper is low (see `grain.ts`).

import type { Point } from "../types.ts";
import {
  HAIRLINE,
  PIXEL,
  driftNoise,
  hashedRandom,
  normalAt,
  trace,
  type Trace,
} from "./grain.ts";
import { paintPath } from "./ink.ts";

/** The pitch of the paper's grain as a pencil finds it, in document pixels.
 *
 *  Finer than the crayon's (1.7): a sharp lead reaches into tooth that a blunt
 *  wax face bridges over, and the difference between the two speckles is most
 *  of what tells a pencil line from a crayon one at the same width. */
const TOOTH = 1.15;

/** The most grain cells one mark will lay down. Past this the grain is
 *  coarsened rather than drawn (see `grainCell`) — a page-long sweep with a
 *  broad lead would otherwise ask for hundreds of thousands of specks. */
const GRAIN_BUDGET = 26000;

/** The weights graphite is laid down at. Three rather than the crayon's four:
 *  a pencil's ramp from bare paper to burnished black is shorter, because the
 *  lead never fills a valley the way melted wax does. */
const LEVELS = [0.42, 0.72, 1] as const;

/** How dark a fully-covered patch of graphite is against the page. Short of
 *  solid on purpose — even 6B leaves a sheen rather than ink. */
const DENSITY = 0.86;

/** The smooth 0→1 ramp between two edges. */
function smoothstep(from: number, to: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** The paper's height at one grain cell, centred on 0. Three octaves, the same
 *  arrangement the crayon's sheet uses — speck, clump and island — because it
 *  is the same sheet, only read at a finer pitch. */
function toothAt(gx: number, gy: number): number {
  const speck = hashedRandom(gx, gy, 23);
  const clump = hashedRandom(gx >> 1, gy >> 1, 29);
  const island = hashedRandom(gx >> 2, gy >> 2, 31);
  return 0.9 * speck + 0.5 * clump + 0.38 * island - 0.39;
}

/** How coarse to work the grain at: the paper's own tooth, or the device pixel
 *  once the view is pulled back far enough that the tooth is finer than one.
 *  Marks big enough to blow the budget coarsen by exactly the factor that
 *  brings them back inside it. */
function grainCell(length: number, size: number, scale: number): number {
  const cell = Math.max(TOOTH, PIXEL / scale);
  const wanted = ((length + size) * (size + 2 * cell)) / (cell * cell);
  if (wanted <= GRAIN_BUDGET) return cell;
  return cell * Math.sqrt(wanted / GRAIN_BUDGET);
}

/** The length of the sampled path, needed before it is resampled so the grain
 *  can be sized to what the whole mark will cost. */
function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Graphite coming off the lead: `lay` offers a deposit at a point, the paper
 *  decides whether any of it sticks, and `paint` puts what stuck on the canvas.
 *
 *  Collected into flat coordinate runs and drawn a weight at a time — one
 *  `stroke()` per level rather than one per speck, which is the difference
 *  between a mark that costs three path fills and one that costs thirty
 *  thousand. */
function openLead(cell: number) {
  const lanes: number[][] = [[], [], []];
  return {
    /** Offer `deposit` (0–1) of graphite at a point, scratched along
     *  (`tx`, `ty`). */
    lay(x: number, y: number, tx: number, ty: number, deposit: number): void {
      if (deposit <= 0.02) return;
      // Which cell of the sheet this is, and how high the paper stands in it.
      // Anchored to the page rather than to the mark, so the grain holds still
      // under a repaint and two crossing strokes skip the same valleys.
      const gx = Math.floor(x / TOOTH);
      const gy = Math.floor(y / TOOTH);
      const paper = toothAt(gx, gy);
      // The valley the lead never reached. This one line is the medium.
      if (paper >= deposit) return;
      const bite = Math.min(1, (deposit - paper) / 0.3);
      // How far the flake is scratched along. Short — well under the crayon's,
      // because graphite chips off rather than smearing — so a well-covered
      // patch still reads as a field of specks and not as a solid ribbon.
      const reach = cell * (0.28 + bite * 0.5);
      // Nudged off the lattice so a dense field is graphite and not graph paper.
      const jx = x + (hashedRandom(gx, gy, 5) - 0.5) * cell * 0.7;
      const jy = y + (hashedRandom(gx, gy, 6) - 0.5) * cell * 0.7;
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
      // A shade under the lattice pitch, so neighbouring specks nearly meet and
      // the valleys between them stay the colour of the page.
      ctx.lineWidth = cell * 0.9;
      for (const [level, run] of lanes.entries()) {
        if (run.length === 0) continue;
        ctx.globalAlpha = alpha * DENSITY * LEVELS[level]!;
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

/** The lead dragged along the path: for each step down the mark, a row of
 *  deposits laid across the contact patch.
 *
 *  A pencil is held far more steadily than a crayon — it is a hard point, not a
 *  worn face — so there is no lean and no ploughed furrow here. What is left is
 *  the two things a hand does: it hurries, and it bears down and eases off. */
function dragLead(
  lead: ReturnType<typeof openLead>,
  along: readonly Trace[],
  half: number,
  cell: number,
  grade: number,
): void {
  const count = along.length;
  const span = along[count - 1]!.at;
  // How far in from each end the lead takes to settle. Short: a pencil line
  // starts nearly where you put it down, unlike a stick of wax.
  const ramp = Math.max(0.5, Math.min(span * 0.25, 1.5 + half));

  for (let i = 0; i < count; i++) {
    const p = along[i]!;
    const { nx, ny } = normalAt(along, i);
    // Along the mark — the direction a flake is scratched in.
    const tx = -ny;
    const ty = nx;

    const settled = Math.sqrt(Math.min(1, Math.min(p.at, span - p.at) / ramp));
    // The hand bearing down and easing off over a few centimetres of travel.
    const bearing = 0.78 + 0.22 * driftNoise(p.at / 26, 43);
    // Dragged fast, the lead has less time to shed.
    const hurry = Math.max(0.5, 1 / (1 + p.speed / 42));
    const press = Math.max(0.05, bearing * settled * hurry * grade);

    // The contact patch. A soft lead flattens and covers a touch wider than a
    // hard one, which is the other half of what a grade means.
    const w = half * (0.9 + 0.1 * driftNoise(p.at / 34, 11));
    // How ragged the edges are — a couple of grain cells, whatever the width,
    // because a chipped edge is a chipped edge.
    const fray = Math.min(w * 0.55, 0.7 + w * 0.08);
    const core = Math.max(w - fray, cell * 0.4);

    // Walked outwards from the axis, so however fine the lead is there is
    // always a deposit offered down the middle of it. The rows slide sideways
    // as the mark travels, which keeps them from lining up into visible lanes.
    const phase = (driftNoise(p.at / 9, 67) - 0.5) * cell;
    const steps = Math.ceil((w + cell) / cell);
    for (let k = -steps; k <= steps; k++) {
      const u = k * cell + phase;
      const across = Math.abs(u);
      const shape = 1 - smoothstep(core, w + fray * 0.5, across);
      if (shape <= 0) continue;
      lead.lay(p.x + nx * u, p.y + ny * u, tx, ty, shape * press);
    }
  }
}

/** The lead pressed down and lifted: a patch of grain rather than a dot. */
function stampLead(
  lead: ReturnType<typeof openLead>,
  at: Point,
  half: number,
  cell: number,
  grade: number,
): void {
  const w = half * 0.92;
  const fray = Math.min(w * 0.55, 0.7 + w * 0.08);
  const core = Math.max(w - fray, cell * 0.4);
  const angle = hashedRandom(at.x, at.y, 3) * Math.PI * 2;
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  for (let dy = -w - cell; dy <= w + cell; dy += cell) {
    for (let dx = -w - cell; dx <= w + cell; dx += cell) {
      const across = Math.hypot(dx, dy);
      const shape = 1 - smoothstep(core, w + fray * 0.5, across);
      if (shape <= 0) continue;
      lead.lay(at.x + dx, at.y + dy, tx, ty, shape * 0.92 * grade);
    }
  }
}

/** The graphite a pencil draws in on a given page.
 *
 *  Never the toolbar's ink: a pencil is a mineral, and the only choice it
 *  offers is how dark. What it *does* have to answer to is the sheet — graphite
 *  on a dark page is the silverpoint sheen you get drawing on black paper, not
 *  a mark that has vanished — so the tone flips with the page's own lightness
 *  and stays grey either way. */
export function graphiteInk(background: string): string {
  return pageIsLight(background) ? "#333338" : "#c8c8cf";
}

/** Whether a page colour is a light sheet. Deliberately crude — the only
 *  question here is which side of the middle the paper sits on. */
function pageIsLight(background: string): boolean {
  const hex = background.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return true;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Rec. 601 luma — close enough to perceived lightness for a yes/no.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/** Paint a pencil mark: graphite scratched onto the page's tooth along a path.
 *
 *  `grade` is the lead, as a fraction of an HB: below 1 is the H end — hard,
 *  pale, riding the peaks — and above it the B end, soft and dark. It reaches
 *  only the *deposit*, never the geometry, so a 6B is a blacker line and not a
 *  wider one. */
export function paintGraphite(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  grade = 1,
): void {
  const first = points[0];
  if (!first) return;
  const alpha = ctx.globalAlpha;
  const lead = Math.max(0.05, grade);

  if (size * scale < HAIRLINE) {
    // Pulled back far enough that the whole mark is inside one pixel: the
    // grain is finer than that, so what is left of a pencil is a line at the
    // weight the specks average out to.
    ctx.globalAlpha = alpha * Math.min(1, 0.72 * lead);
    paintPath(ctx, points, size);
    ctx.globalAlpha = alpha;
    return;
  }

  const cell = grainCell(pathLength(points), size, scale);
  // A lead finer than the paper's grain still has to put a speck down.
  const half = Math.max(cell * 0.5, size / 2);
  const marks = openLead(cell);
  const along = trace(points, cell * 0.85);
  if (along.length < 2) stampLead(marks, first, half, cell, lead);
  else dragLead(marks, along, half, cell, lead);
  marks.paint(ctx, alpha);
  ctx.globalAlpha = alpha;
}
