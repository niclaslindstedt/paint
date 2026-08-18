// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One stroke, big, shaped like the reference photograph of a real loaded round
// — the sweep that runs left to right and pales as the dip is spent. For
// holding the engine's mark up against the photograph rather than against a
// memory of it.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/brush-shot.ts

import { groundProfile } from "../../../../src/app/ground.ts";
import {
  createBristleField,
  painted,
} from "../../../../src/app/plugins/bristleField.ts";
import { drag } from "../../../../src/app/plugins/bristleSim.ts";
import { keeping, washFilm } from "../../../../src/app/plugins/washSim.ts";
import type { Point } from "../../../../src/app/types.ts";
import { mm } from "../../../../src/app/units.ts";
import { compositeCell, pageToRgb, whitePage, writePng } from "./pngio.ts";

const W = 1200;
const H = 620;
const DENSITY = 2.1;
const KEEP_FLOOR = 0.06;
// The photograph's paint: a red the reference sheet was painted in.
const PAINT = "#c0394b";

const SIZE = mm(4.8);

/** The photograph's path: down and up and away, left to right, at the speed a
 *  hand actually sweeps one. */
function sweep(): Point[] {
  const pts: Point[] = [];
  let last = { x: 0, y: 0 };
  for (let i = 0; i <= 900; i++) {
    const t = i / 900;
    const p = {
      x: 120 + 940 * t,
      y: 300 + 150 * Math.sin(Math.PI * 2.1 * t) * (0.4 + 0.6 * t),
    };
    const speed = 9 + 16 * t;
    if (i === 0 || Math.hypot(p.x - last.x, p.y - last.y) >= speed) {
      pts.push(p);
      last = p;
    }
  }
  return pts;
}

const field = createBristleField({
  x: 0,
  y: 0,
  width: W,
  height: H,
  cell: 1,
  ground: groundProfile({ stock: "cold" }),
  wick: 0.6 * groundProfile({ stock: "cold" }).absorbency,
});
drag(field, sweep(), SIZE, 0, 0, 1, 1, 1);

const page = whitePage(W, H);
const kept = keeping(PAINT, false);
const keep: [number, number, number] = [
  Math.max(KEEP_FLOOR, kept[0]),
  Math.max(KEEP_FLOOR, kept[1]),
  Math.max(KEEP_FLOOR, kept[2]),
];
const film = painted(field);
for (let at = 0; at < film.length; at++) {
  if (film[at]! <= 0) continue;
  const shade = washFilm(keep, film[at]! * DENSITY, false);
  if (shade) compositeCell(page, at, shade);
}

writePng(pageToRgb(page), W, H, "brush-shot.png");
console.log("wrote brush-shot.png");
