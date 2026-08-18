// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paintbrush's exercise sheet: every behaviour the paint engine claims,
// drawn straight from the field with no DOM — judge it against reference
// photographs of a real round, crop with `zoom.ts`, and retune.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/brush-sheet.ts
//
// Adapted from `ink-sheet.ts` (the worked example): same shape, this medium's
// field and walk, and one row per claim about a *round* head — the shape whose
// whole character is that it lays the same mark whichever way you pull it.
//
// The paths are sampled the way the canvas stores them: the gap between stored
// points IS the hand's speed (see `trace` in `grain.ts`).

import { groundProfile, SOLID_GROUND } from "../../../../src/app/ground.ts";
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

const W = 1500;
const H = 1180;
// Keep these in step with `bristleSim.ts` / `quillShade.ts` — the harness
// composites the film itself so it can run with no canvas anywhere.
const DENSITY = 2.1;
const KEEP_FLOOR = 0.06;
const PAINT = "#1c2b3a";

/** A #6 round: the brush the tool opens on. */
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

type Mark = {
  points: Point[];
  size?: number;
  flatness?: number;
  hardness?: number;
  load?: number;
  ground: GroundProfile;
  claim: string;
};

const cold = groundProfile({ stock: "cold" });

const marks: Mark[] = [
  {
    claim: "a tap: the print of a loaded round",
    ground: cold,
    points: [{ x: 120, y: 110 }],
  },
  {
    claim: "…and the same tap held still, a few samples of jitter",
    ground: cold,
    points: [
      { x: 330, y: 110 },
      { x: 331, y: 111 },
      { x: 330, y: 112 },
    ],
  },
  {
    claim: "a short dab pulled a head-width",
    ground: cold,
    points: pathOf((t) => ({ x: 540 + 90 * t, y: 110, speed: 4 }), 60),
  },
  {
    claim: "the ends: a slow straight drag, landing and lift",
    ground: cold,
    points: pathOf((t) => ({ x: 820 + 560 * t, y: 110, speed: 5 })),
  },
  {
    claim: "an unhurried drag over the sheet",
    ground: cold,
    points: pathOf((t) => ({
      x: 120 + 1260 * t,
      y: 300 + 40 * Math.sin(2 * Math.PI * t),
      speed: 6,
    })),
  },
  {
    claim: "a fast scribble (the phone gesture): speed 30–45 px a sample",
    ground: cold,
    points: pathOf(
      (t) => ({
        x: 120 + 1260 * t,
        y: 470 + 70 * Math.sin(5 * Math.PI * t),
        speed: 38,
      }),
      900,
    ),
  },
  {
    claim: "a round taken round a corner: the width must not change",
    ground: cold,
    points: pathOf((t) => ({
      x: 220 + 420 * Math.cos(Math.PI * (1.4 * t - 0.2)),
      y: 800 + 300 * Math.sin(Math.PI * (1.4 * t - 0.2)),
      speed: 7,
    })),
  },
  {
    claim: "the dry-brush preset: hardness 0.25, load 0.4",
    ground: cold,
    hardness: 0.25,
    load: 0.4,
    points: pathOf((t) => ({ x: 760 + 620 * t, y: 700, speed: 7 })),
  },
  {
    claim: "the same drag with a full flat, for comparison",
    ground: cold,
    flatness: 1,
    points: pathOf((t) => ({ x: 760 + 620 * t, y: 900, speed: 7 })),
  },
  {
    claim: "a small round (#2) on the sealed page",
    ground: SOLID_GROUND,
    size: mm(1.6),
    points: pathOf((t) => ({
      x: 760 + 620 * t,
      y: 1060 + 30 * Math.sin(2 * Math.PI * t),
      speed: 5,
    })),
  },
  {
    claim: "…and a #6 on the sealed page",
    ground: SOLID_GROUND,
    points: pathOf((t) => ({ x: 120, y: 1060 + 0 * t, speed: 5 }), 1),
  },
];

const page = whitePage(W, H);
const kept = keeping(PAINT, false);
const keep: [number, number, number] = [
  Math.max(KEEP_FLOOR, kept[0]),
  Math.max(KEEP_FLOOR, kept[1]),
  Math.max(KEEP_FLOOR, kept[2]),
];

for (const mark of marks) {
  if (mark.claim) console.log("row:", mark.claim);
  const field = createBristleField({
    x: 0,
    y: 0,
    width: W,
    height: H,
    cell: 1,
    ground: mark.ground,
    wick: 0.6 * Math.max(0, Math.min(1, mark.ground.absorbency)),
  });
  drag(
    field,
    mark.points,
    mark.size ?? SIX,
    mark.flatness ?? 0,
    -Math.PI / 4,
    mark.hardness ?? 1,
    mark.load ?? 1,
    1,
  );
  const film = painted(field);
  for (let at = 0; at < film.length; at++) {
    const held = film[at]!;
    if (held <= 0) continue;
    const shade = washFilm(keep, held * DENSITY, false);
    if (shade) compositeCell(page, at, shade);
  }
}

const out = "brush-sheet.png";
writePng(pageToRgb(page), W, H, out);
console.log(`wrote ${out}`);
