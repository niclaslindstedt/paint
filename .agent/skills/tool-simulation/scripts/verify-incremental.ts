// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The incremental live walk's whole correctness claim, checked cell for cell:
// a gesture advanced a couple of points at a time must lay the same film as
// one full walk of the finished path. Run it after ANY change to the walk —
// the settle frontier, the provisional tail, the reservoir, the waver — and
// before trusting a tuning change; a worst-cell diff above float noise means
// something end-dependent leaked into the settled prefix, which on screen is
// a stale patch that only shows under a live gesture.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/verify-incremental.ts

import { groundProfile } from "../../../../src/app/ground.ts";
import {
  createQuillField,
  inked,
} from "../../../../src/app/plugins/quillField.ts";
import {
  advanceScribe,
  openScribe,
  scribe,
} from "../../../../src/app/plugins/quillSim.ts";
import type { Point } from "../../../../src/app/types.ts";

const ground = groundProfile({ stock: "cold" });
const size = 9;
const angle = -Math.PI / 4;

let failed = false;

for (const load of [1, 0.7, 0.3]) {
  const pts: Point[] = [];
  for (let d = 0; d <= 600; d += 3) {
    pts.push({ x: 30 + d * 0.9, y: 150 + 70 * Math.sin(d / 55) });
  }
  const spec = {
    x: 0,
    y: 0,
    width: 640,
    height: 320,
    cell: 1,
    ground,
    wick: 0.375,
  };

  const whole = createQuillField(spec);
  scribe(whole, pts, size, angle, load, 1);

  const grown = createQuillField(spec);
  const state = openScribe(grown, size, angle, load);
  for (let n = 1; n <= pts.length; n += 3) {
    advanceScribe(state, pts.slice(0, n));
  }
  if (state.points.length !== pts.length) advanceScribe(state, pts.slice());

  const a = inked(whole);
  const b = inked(grown);
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  }
  const ok = worst < 0.001;
  if (!ok) failed = true;
  console.log(
    `load ${load}: worst cell diff ${worst.toFixed(6)} ${ok ? "OK" : "FAIL"}`,
  );
}

process.exit(failed ? 1 : 0);
