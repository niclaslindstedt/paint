// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Numbers instead of squinting: the film a stroke lays under controlled
// conditions, and what a simulation costs. Every retune should re-run this —
// "the fast section looks paler now" is a feeling, `fast mid film: 0.62` is a
// fact. Adapt the windows and claims to the medium being probed.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/probe-ink.ts

import { groundProfile, SOLID_GROUND } from "../../../../src/app/ground.ts";
import type { GroundProfile } from "../../../../src/app/ground.ts";
import {
  createQuillField,
  inkCoverage,
  inked,
  type QuillField,
} from "../../../../src/app/plugins/quillField.ts";
import {
  advanceScribe,
  openScribe,
  scribe,
} from "../../../../src/app/plugins/quillSim.ts";
import type { Point } from "../../../../src/app/types.ts";

const SIZE = 9;
const ANGLE = -Math.PI / 4;

function fieldOver(
  width: number,
  height: number,
  ground: GroundProfile = SOLID_GROUND,
): QuillField {
  return createQuillField({
    x: 0,
    y: 0,
    width,
    height,
    cell: 1,
    ground,
    wick: 0.5 * Math.max(0, Math.min(1, ground.absorbency)),
  });
}

function run(length: number, gap: number, from = 20): Point[] {
  const points: Point[] = [];
  for (let x = from; x <= from + length; x += gap) points.push({ x, y: 60 });
  return points;
}

function meanFilm(field: QuillField, x0: number, x1: number): number {
  const film = inked(field);
  let sum = 0;
  let n = 0;
  for (let y = 40; y < 80; y++) {
    for (let x = x0; x < x1; x++) {
      const held = film[y * field.width + x]!;
      if (held > 0) {
        sum += held;
        n++;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

// --- Ink shading: slow / fast / slow along one straight band -----------------
{
  const f = fieldOver(900, 140);
  const pts = [...run(266, 2, 50), ...run(266, 16, 320), ...run(264, 2, 590)];
  scribe(f, pts, SIZE, ANGLE, 1, 1);
  console.log("slow head film:", meanFilm(f, 120, 280).toFixed(3));
  console.log("fast mid  film:", meanFilm(f, 380, 540).toFixed(3));
  console.log("slow tail film:", meanFilm(f, 620, 780).toFixed(3));
}

// --- Running dry, and the paper drinking the reservoir -----------------------
for (const stock of [undefined, "cold"]) {
  const g = stock ? groundProfile({ stock }) : SOLID_GROUND;
  const f = fieldOver(1500, 140, g);
  scribe(f, run(1400, 3), SIZE, ANGLE, 0.4, 1);
  console.log(
    `load 0.4 on ${stock ?? "solid"}: head`,
    meanFilm(f, 100, 300).toFixed(3),
    "tail",
    meanFilm(f, 1150, 1350).toFixed(3),
  );
}

// --- Break-up on the tooth when starved --------------------------------------
for (const stock of [undefined, "rough"]) {
  const g = stock ? groundProfile({ stock }) : SOLID_GROUND;
  const f = fieldOver(400, 140, g);
  scribe(f, run(340, 3), SIZE, ANGLE, 0.08, 1);
  console.log(
    `starved coverage on ${stock ?? "solid"}:`,
    inkCoverage(f, 0.1).toFixed(3),
  );
}

// --- Cost: one-shot walks, and the incremental live walk ---------------------
function time(label: string, iters: number, work: () => void): void {
  work(); // warm
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) work();
  console.log(label, ((performance.now() - t0) / iters).toFixed(2), "ms");
}

const g = groundProfile({ stock: "cold" });
time("letter stroke (300px) one-shot:", 30, () => {
  const f = fieldOver(400, 140, g);
  scribe(f, run(300, 2), SIZE, ANGLE, 1, 1);
});
time("flourish (1200px) one-shot:", 10, () => {
  const f = fieldOver(1300, 140, g);
  scribe(f, run(1200, 2), SIZE, ANGLE, 1, 1);
});
{
  // The per-frame cost of the live walk, deep into a long gesture — the
  // number that decides whether drawing stays at frame rate.
  const pts = run(2700, 3);
  const f = fieldOver(2800, 140, g);
  const state = openScribe(f, SIZE, ANGLE, 1);
  let t0 = 0;
  let frames = 0;
  for (let n = 2; n <= pts.length; n += 2) {
    if (n === Math.floor(pts.length / 2)) t0 = performance.now();
    advanceScribe(state, pts.slice(0, n));
    if (n >= Math.floor(pts.length / 2)) frames++;
  }
  console.log(
    "live advance deep into 2700px:",
    ((performance.now() - t0) / frames).toFixed(3),
    "ms/frame",
  );
}
