// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pressure dial's own sheet: the SAME gesture at seven pressures, for a
// round and then for a flat, and last the stroke the dial exists for — a
// tapering sweep laid on its point and one leaned on.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/brush-press-sheet.ts
//
// What to look for, in the order the reference photographs make the claims:
//
//   - the round's band runs from well inside its ferrule to half again past
//     it; the flat's barely moves, because the collar holds its hairs;
//   - a leaned-on band's two sides stop being parallel, and its partings stay
//     open where a light one's close over;
//   - it is still ONE mark at the top of the range — a bundle out of shape
//     scatters, it does not come apart into wires.

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

const W = 1000;
const H = 1900;
const DENSITY = 2.1;
const KEEP_FLOOR = 0.06;
const PAINT = "#1c2b3a";
const SIX = mm(4.8);
const PRESSURES = [0.3, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

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
const marks: {
  points: Point[];
  flatness: number;
  press: number;
  load?: number;
}[] = [];

// The round, one pressure per row — the same drag every time, so the only
// thing that differs down the sheet is the hand.
PRESSURES.forEach((press, i) => {
  const y = 100 + i * 145;
  marks.push({
    press,
    flatness: 0,
    points: pathOf((t) => ({ x: 90 + 800 * t + i * 0.37, y, speed: 7 })),
  });
});

// …and the flat, which should hardly notice.
PRESSURES.forEach((press, i) => {
  const y = 1170 + i * 72;
  marks.push({
    press,
    flatness: 1,
    points: pathOf((t) => ({ x: 90 + 800 * t + i * 0.41, y, speed: 7 })),
  });
});

// The stroke the dial is for: a sweep on the point, and the same sweep leaned
// on — the two marks one round brush makes.
[0.4, 1.6].forEach((press, i) => {
  const y = 1710 + i * 130;
  marks.push({
    press,
    flatness: 0,
    points: pathOf((t) => ({
      x: 90 + 800 * t,
      y: y + Math.sin(t * Math.PI) * -26,
      speed: 6 + 10 * t,
    })),
  });
});

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
    ground: cold,
    wick: 0.6 * Math.max(0, Math.min(1, cold.absorbency)),
  });
  drag(
    field,
    mark.points,
    SIX,
    mark.flatness,
    -Math.PI / 4,
    1,
    mark.load ?? 1,
    1,
    mark.press,
  );
  const film = painted(field);
  for (let at = 0; at < film.length; at++) {
    const held = film[at]!;
    if (held <= 0) continue;
    const shade = washFilm(keep, held * DENSITY, false);
    if (shade) compositeCell(page, at, shade);
  }
}

const out = process.argv[2] ?? "press-sheet.png";
writePng(pageToRgb(page), W, H, out);
console.log(`wrote ${out}`);
