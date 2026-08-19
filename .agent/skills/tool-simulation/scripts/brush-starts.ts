// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two ends of a brushed mark, repeated — the sheet a medium that draws
// every stroke identically cannot pass.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/brush-starts.ts
//
// `brush-sheet.ts` lays one of everything, which is exactly the sheet that
// hides a simulation with one brush in it: hashed traits are reproducible by
// design, so every mark it draws is the same mark and no row of *different*
// marks can show you that. This is three rows of the SAME mark instead —
// six identical drags, then six entry speeds, then six lift speeds — so what
// the stroke keeps of the gesture, and what it keeps of nothing at all, are
// side by side where they can be compared.

import { groundProfile } from "../../../../src/app/ground.ts";
import type { GroundProfile } from "../../../../src/app/ground.ts";
import {
  createBristleField,
  painted,
} from "../../../../src/app/plugins/bristleField.ts";
import { drag } from "../../../../src/app/plugins/bristleSim.ts";
import { keeping, washFilm } from "../../../../src/app/plugins/washSim.ts";
import type { Point } from "../../../../src/app/types.ts";
import { mm } from "../../../../src/app/units.ts";
import { compositeCell, pageToRgb, whitePage, writePng } from "./pngio.ts";

const W = 900;
const H = 1460;
const DENSITY = 2.1;
const KEEP_FLOOR = 0.06;
const PAINT = "#1c2b3a";
const SIX = mm(4.8);

function pathOf(
  fn: (t: number) => { x: number; y: number; speed: number },
  n = 600,
): Point[] {
  const pts: Point[] = [];
  let { x, y } = fn(0);
  pts.push({ x, y });
  for (let i = 1; i <= n; i++) {
    const p = fn(i / n);
    if (Math.hypot(p.x - x, p.y - y) >= Math.max(1.5, p.speed)) {
      pts.push({ x: p.x, y: p.y });
      x = p.x;
      y = p.y;
    }
  }
  return pts;
}

const cold = groundProfile({ stock: "cold" });
const marks: { points: Point[]; ground: GroundProfile }[] = [];

// Six identical drags, one under the other, entering at the same speed.
for (let i = 0; i < 6; i++) {
  const y = 70 + i * 66;
  marks.push({
    ground: cold,
    points: pathOf((t) => ({ x: 90 + 700 * t + i * 0.37, y, speed: 7 })),
  });
}

// Six drags entered at six different speeds: placed at the top, swept on at
// the bottom.
for (let i = 0; i < 6; i++) {
  const y = 540 + i * 70;
  const entry = [2, 6, 11, 18, 27, 38][i]!;
  marks.push({
    ground: cold,
    points: pathOf((t) => ({
      x: 90 + 700 * t + i * 0.53,
      y,
      speed: 7 + (entry - 7) * Math.max(0, 1 - t / 0.35),
    })),
  });
}

// Six drags lifted at six different speeds: the hand slows to a stop at the
// top and flicks off the page at the bottom.
for (let i = 0; i < 6; i++) {
  const y = 1000 + i * 70;
  const endSpeed = 3 + i * 9;
  marks.push({
    ground: cold,
    points: pathOf((t) => ({
      x: 90 + 700 * t + i * 0.71,
      y,
      speed: 7 + (endSpeed - 7) * Math.max(0, (t - 0.6) / 0.4),
    })),
  });
}

const page = whitePage(W, H);
const kept = keeping(PAINT, false);
const keep: [number, number, number] = [
  Math.max(KEEP_FLOOR, kept[0]),
  Math.max(KEEP_FLOOR, kept[1]),
  Math.max(KEEP_FLOOR, kept[2]),
];

for (const mark of marks) {
  const field = createBristleField({
    x: 0,
    y: 0,
    width: W,
    height: H,
    cell: 1,
    ground: mark.ground,
    wick: 0.6 * Math.max(0, Math.min(1, mark.ground.absorbency)),
  });
  drag(field, mark.points, SIX, 0, -Math.PI / 4, 1, 1, 1);
  const film = painted(field);
  for (let at = 0; at < film.length; at++) {
    const held = film[at]!;
    if (held <= 0) continue;
    const shade = washFilm(keep, held * DENSITY, false);
    if (shade) compositeCell(page, at, shade);
  }
}

const out = process.argv[2] ?? "starts-sheet.png";
writePng(pageToRgb(page), W, H, out);
console.log(`wrote ${out}`);
