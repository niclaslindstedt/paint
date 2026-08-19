// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the hand's own dial does to a brush mark: the numbers behind the
// pressure knob (`BEARING` in `plugins/builtin/dials.ts`). One row per claim —
// a pressed round lays a wider band than its ferrule, a pressed flat barely
// widens at all, a pressed head is rougher rather than merely bigger, and it
// empties sooner because more paint is coming off it.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/brush-press.ts
//
// The claim to check first is the one that is not about pressure: at press 1
// every number here must be *bit-identical* to the same run before the dial
// existed. A widening term that leaks into the rest is a tool that changed
// under everyone who never opened the panel.

import { groundProfile, SOLID_GROUND } from "../../../../src/app/ground.ts";
import type { GroundProfile } from "../../../../src/app/ground.ts";
import {
  createBristleField,
  paintCoverage,
  painted,
  type BristleField,
} from "../../../../src/app/plugins/bristleField.ts";
import { drag, splayOf } from "../../../../src/app/plugins/bristleSim.ts";
import type { Point } from "../../../../src/app/types.ts";
import { mm } from "../../../../src/app/units.ts";

/** A #6 round — the brush the tool opens on. */
const SIX = mm(4.8);
const PRESSURES = [0.3, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

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

/** Mean and spread of the film down one column, and the faintest lane in the
 *  core — how much of the mark is parting rather than paint. */
function column(field: BristleField, x: number) {
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
  const core = held.slice(
    Math.floor(held.length * 0.25),
    Math.ceil(held.length * 0.75),
  );
  return { mean, sd, least: Math.min(...core) / mean };
}

/** How far along the path the band still holds paint — where the dip gave out
 *  (the residue trail included, which is why it is read at a low threshold). */
function ranTo(field: BristleField, y: number, from: number): number {
  const film = painted(field);
  let far = from;
  for (let x = from; x < field.width; x++) {
    for (let dy = -40; dy <= 40; dy++) {
      if (film[(y + dy) * field.width + x]! > 0.02) {
        far = x;
        break;
      }
    }
  }
  return far - from;
}

/** The two sides of the band down a stretch of it: how far from parallel they
 *  run, which is the wander a leaned-on head has and a light one has not. */
function wander(field: BristleField, from: number, to: number): number {
  const widths: number[] = [];
  for (let x = from; x <= to; x += 4) widths.push(bandAt(field, x));
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const sd = Math.sqrt(
    widths.reduce((a, b) => a + (b - mean) ** 2, 0) / widths.length,
  );
  return sd / mean;
}

const cold = groundProfile({ stock: "cold" });

console.log(
  `#6 round: ${SIX.toFixed(1)} document pixels across the ferrule, on cold-pressed\n`,
);

for (const [what, flat] of [
  ["round", 0],
  ["filbert", 0.55],
  ["flat", 1],
] as const) {
  console.log(`${what} (flatness ${flat}):`);
  for (const press of PRESSURES) {
    const field = fieldOver(1400, 300, cold);
    const points = run(900, 4);
    drag(field, points, SIX, flat, 0, 1, 1, 1, press);
    const at = column(field, 350);
    console.log(
      `  press ${press.toFixed(2)}  splay ${splayOf(press, flat).toFixed(2)}  ` +
        `band ${String(bandAt(field, 350)).padStart(2)} px  ` +
        `film ${at.mean.toFixed(2)}  sd/mean ${(at.sd / at.mean).toFixed(2)}  ` +
        `faintest lane ${String(Math.round(at.least * 100)).padStart(3)}%  ` +
        `wander ${wander(field, 200, 600).toFixed(3)}  ` +
        `ran ${String(ranTo(field, 150, 120)).padStart(3)} px  ` +
        `coverage ${String(Math.round(paintCoverage(field) * 100)).padStart(2)}%`,
    );
  }
  console.log("");
}

// What a frame of it costs: a pressed head is a wider band, and a wider band
// is more cells per touch — the one place the dial can cost anything.
for (const press of [1, 2] as const) {
  const points = run(1600, 4, 40, 150);
  const field = fieldOver(1900, 300, cold);
  const started = process.hrtime.bigint();
  drag(field, points, SIX, 0, 0, 1, 1, 1, press);
  const took = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(
    `press ${press}: one whole walk of 1600 px ${took.toFixed(1)} ms`,
  );
}
