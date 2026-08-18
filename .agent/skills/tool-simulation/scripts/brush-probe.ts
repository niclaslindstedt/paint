// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Numbers instead of squinting, for the paintbrush: how wide the head actually
// lays, how even a solid passage is, how much of a mark is the ends, and what
// a simulation costs. Re-run it after every retune — "the streaks look better"
// is a feeling, `parting contrast: 0.31` is a fact.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/brush-probe.ts

import { groundProfile, SOLID_GROUND } from "../../../../src/app/ground.ts";
import type { GroundProfile } from "../../../../src/app/ground.ts";
import {
  createBristleField,
  paintCoverage,
  painted,
  type BristleField,
} from "../../../../src/app/plugins/bristleField.ts";
import {
  advanceDrag,
  drag,
  openDrag,
} from "../../../../src/app/plugins/bristleSim.ts";
import type { Point } from "../../../../src/app/types.ts";
import { mm } from "../../../../src/app/units.ts";

/** A #6 round — the brush the tool opens on. */
const SIX = mm(4.8);

function fieldOver(
  width: number,
  height: number,
  ground: GroundProfile = SOLID_GROUND,
): BristleField {
  return createBristleField({
    x: 0,
    y: 0,
    width,
    height,
    cell: 1,
    ground,
    wick: 0.6 * Math.max(0, Math.min(1, ground.absorbency)),
  });
}

function run(length: number, gap: number, from = 120, y = 150): Point[] {
  const points: Point[] = [];
  for (let x = from; x <= from + length; x += gap) points.push({ x, y });
  return points;
}

/** How wide the band is at one column, in cells holding any film at all. */
function bandAt(field: BristleField, x: number, least = 0.02): number {
  const film = painted(field);
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = 0; y < field.height; y++) {
    if (film[y * field.width + x]! > least) {
      if (y < top) top = y;
      bottom = y;
    }
  }
  return bottom < top ? 0 : bottom - top + 1;
}

/** Mean and spread of the film down one column — the number that says whether
 *  a passage is one slab (low spread) or a set of ribbons (high). */
function column(
  field: BristleField,
  x: number,
): { mean: number; sd: number; least: number } {
  const film = painted(field);
  const held: number[] = [];
  for (let y = 0; y < field.height; y++) {
    const at = film[y * field.width + x]!;
    if (at > 0.02) held.push(at);
  }
  if (held.length === 0) return { mean: 0, sd: 0, least: 0 };
  const mean = held.reduce((a, b) => a + b, 0) / held.length;
  const sd = Math.sqrt(
    held.reduce((a, b) => a + (b - mean) ** 2, 0) / held.length,
  );
  // The middle of the band only — the two rims are supposed to fall away.
  const core = held.slice(
    Math.floor(held.length * 0.25),
    Math.ceil(held.length * 0.75),
  );
  return { mean, sd, least: Math.min(...core) / mean };
}

/** How far past the last point of the path the mark reaches — the head's own
 *  print, which is what makes a round end round. */
function reachPast(field: BristleField, endX: number, y: number): number {
  const film = painted(field);
  let far = 0;
  for (let x = endX; x < field.width; x++) {
    if (film[y * field.width + x]! > 0.02) far = x - endX;
  }
  return far;
}

console.log(`#6 round: ${SIX.toFixed(1)} document pixels across the ferrule`);

for (const stock of [undefined, "cold"] as const) {
  const ground = stock ? groundProfile({ stock }) : SOLID_GROUND;
  const field = fieldOver(900, 300, ground);
  const points = run(500, 4);
  drag(field, points, SIX, 0, 0, 1, 1, 1);
  const at = column(field, 350);
  console.log(
    `${stock ?? "solid"}: band ${bandAt(field, 350)} px (head ${SIX.toFixed(0)}), ` +
      `mean film ${at.mean.toFixed(2)}, sd/mean ${(at.sd / at.mean).toFixed(2)}, ` +
      `faintest lane in the core ${(at.least * 100).toFixed(0)}% of mean, ` +
      `coverage ${(paintCoverage(field) * 100).toFixed(0)}%`,
  );
  console.log(
    `  the print past the lift: ${reachPast(field, 620, 150)} px ` +
      `(half a head is ${(SIX / 2).toFixed(0)})`,
  );
}

// The dry brush: the preset that has to keep its open comb.
{
  const field = fieldOver(900, 300, groundProfile({ stock: "cold" }));
  drag(field, run(500, 4), SIX, 0, 0, 0.25, 0.4, 1);
  const at = column(field, 250);
  console.log(
    `dry brush: mean film ${at.mean.toFixed(2)}, sd/mean ${(at.sd / at.mean).toFixed(2)}, ` +
      `faintest lane ${(at.least * 100).toFixed(0)}% — the comb must stay OPEN here`,
  );
}

// A press, and a press that moved two pixels: the same mark, or the tool
// blinks when a finger shifts on the glass.
{
  const still = fieldOver(400, 400);
  drag(still, [{ x: 200, y: 200 }], SIX, 0, 0, 1, 1, 1);
  const moved = fieldOver(400, 400);
  drag(
    moved,
    [
      { x: 200, y: 200 },
      { x: 201, y: 201 },
      { x: 200, y: 202 },
    ],
    SIX,
    0,
    0,
    1,
    1,
    1,
  );
  const a = painted(still);
  const b = painted(moved);
  let inked = 0;
  let bare = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! > 0.02) inked++;
    if (a[i]! > 0.02 && b[i]! <= 0.02) bare++;
  }
  console.log(
    `press: ${inked} cells inked, ${bare} of them lost when the finger ` +
      `shifts two pixels (must be ~0)`,
  );
}

// What it costs.
for (const [what, length] of [
  ["a short stroke", 200],
  ["a long stroke", 1600],
] as const) {
  const points = run(length, 4, 40, 150);
  const field = fieldOver(length + 300, 300, groundProfile({ stock: "cold" }));
  const started = process.hrtime.bigint();
  drag(field, points, SIX, 0, 0, 1, 1, 1);
  const took = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`${what} (${length} px): one whole walk ${took.toFixed(1)} ms`);
}

// …and what one frame of the gesture in flight costs, which is the number the
// frame rate actually rests on.
{
  const points = run(1600, 4, 40, 150);
  const field = fieldOver(1900, 300, groundProfile({ stock: "cold" }));
  const state = openDrag(field, SIX, 0, 0, 1, 1);
  let worst = 0;
  for (let n = 2; n <= points.length; n += 2) {
    const started = process.hrtime.bigint();
    advanceDrag(state, points.slice(0, n));
    worst = Math.max(worst, Number(process.hrtime.bigint() - started) / 1e6);
  }
  console.log(
    `live: worst single advance ${worst.toFixed(2)} ms (16.7 is one frame)`,
  );
}
