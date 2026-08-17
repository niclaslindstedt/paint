// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The calligraphy pen's exercise sheet: every behaviour the ink engine claims,
// drawn straight from the field with no DOM — judge it against the reference
// scans, crop with `zoom.ts`, and retune.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/ink-sheet.ts
//
// It is also the worked example of a simulation harness. Adapting it to
// another field-based medium is: swap the imports for that medium's field and
// walk, and rewrite `marks` so each row is one claim the engine makes — a
// behaviour you can point at in a reference photograph, not "a stroke".
//
// The paths are sampled the way the canvas stores them: the gap between
// stored points IS the hand's speed, so a harness path encodes "slow here,
// fast there" in its spacing (see `trace` in `grain.ts`).

import { groundProfile, SOLID_GROUND } from "../../../../src/app/ground.ts";
import type { GroundProfile } from "../../../../src/app/ground.ts";
import {
  createQuillField,
  inked,
} from "../../../../src/app/plugins/quillField.ts";
import { scribe } from "../../../../src/app/plugins/quillSim.ts";
import { keeping, washFilm } from "../../../../src/app/plugins/washSim.ts";
import type { Point } from "../../../../src/app/types.ts";
import { compositeCell, pageToRgb, whitePage, writePng } from "./pngio.ts";

const W = 900;
const H = 900;
// Keep these two in step with `quillShade.ts` — the harness composites the
// film itself so it can run with no canvas anywhere.
const DENSITY = 0.55;
const KEEP_FLOOR = 0.06;
const INK = "#1c4b7a";

/** A path from a parametric position+speed function, stored at the spacing
 *  the speed asks for — the same encoding the app's canvas uses. */
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
  load: number;
  ground: GroundProfile;
  /** What this row is supposed to show — printed, so the sheet reads as the
   *  checklist it is. */
  claim: string;
};

const cold = groundProfile({ stock: "cold" });
const rough = groundProfile({ stock: "rough" });
const cotton = groundProfile({ stock: "cotton" });

const marks: Mark[] = [
  {
    claim: "ink shading: slow ends dark, fast crest pale",
    load: 1,
    ground: cold,
    points: pathOf((t) => ({
      x: 60 + 700 * t,
      y: 80 - 50 * Math.sin(Math.PI * t),
      speed: 2 + 14 * Math.sin(Math.PI * t),
    })),
  },
  {
    claim: "running dry: a low dip pales, rails, breaks up",
    load: 0.4,
    ground: cold,
    points: pathOf(
      (t) => ({
        x: 60 + 760 * t,
        y: 220 + 50 * Math.sin(4 * Math.PI * t),
        speed: 3 + 6 * Math.abs(Math.cos(2 * Math.PI * t)),
      }),
      900,
    ),
  },
  {
    claim: "crossings dry darker (film adds)",
    load: 1,
    ground: cold,
    points: pathOf((t) => ({ x: 100 + 250 * t, y: 320 + 120 * t, speed: 4 })),
  },
  {
    claim: "",
    load: 1,
    ground: cold,
    points: pathOf((t) => ({ x: 350 - 250 * t, y: 340 + 90 * t, speed: 4 })),
  },
  {
    claim: "touch bead and lift pool on an overfilled nib",
    load: 1.3,
    ground: cold,
    points: pathOf((t) => ({ x: 480 + 340 * t, y: 400 - 30 * t, speed: 5 })),
  },
  {
    claim: "papers: same stroke on solid / cold / rough / cotton",
    load: 1,
    ground: SOLID_GROUND,
    points: pathOf((t) => ({
      x: 60 + 740 * t,
      y: 540 + 30 * Math.sin(2 * Math.PI * t),
      speed: 2 + 8 * Math.sin(Math.PI * t),
    })),
  },
  {
    claim: "",
    load: 1,
    ground: cold,
    points: pathOf((t) => ({
      x: 60 + 740 * t,
      y: 640 + 30 * Math.sin(2 * Math.PI * t),
      speed: 2 + 8 * Math.sin(Math.PI * t),
    })),
  },
  {
    claim: "",
    load: 1,
    ground: rough,
    points: pathOf((t) => ({
      x: 60 + 740 * t,
      y: 740 + 30 * Math.sin(2 * Math.PI * t),
      speed: 2 + 8 * Math.sin(Math.PI * t),
    })),
  },
  {
    claim: "",
    load: 1,
    ground: cotton,
    points: pathOf((t) => ({
      x: 60 + 740 * t,
      y: 840 + 30 * Math.sin(2 * Math.PI * t),
      speed: 2 + 8 * Math.sin(Math.PI * t),
    })),
  },
];

const page = whitePage(W, H);
const kept = keeping(INK, false);
const keep: [number, number, number] = [
  Math.max(KEEP_FLOOR, kept[0]),
  Math.max(KEEP_FLOOR, kept[1]),
  Math.max(KEEP_FLOOR, kept[2]),
];

for (const mark of marks) {
  if (mark.claim) console.log("row:", mark.claim);
  const field = createQuillField({
    x: 0,
    y: 0,
    width: W,
    height: H,
    cell: 1,
    ground: mark.ground,
    wick: 0.5 * Math.max(0, Math.min(1, mark.ground.absorbency)),
  });
  scribe(field, mark.points, 9, -Math.PI / 4, mark.load, 1);
  const film = inked(field);
  for (let at = 0; at < film.length; at++) {
    const held = film[at]!;
    if (held <= 0) continue;
    const shade = washFilm(keep, held * DENSITY, false);
    if (shade) compositeCell(page, at, shade);
  }
}

const out = "ink-sheet.png";
writePng(pageToRgb(page), W, H, out);
console.log(`wrote ${out}`);
