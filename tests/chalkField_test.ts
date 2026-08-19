// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chalk field.
//
// A field model looks plausible whatever it is doing, so the claims checked
// here are the ones the engine actually makes, every one as a number the
// field emits rather than a picture somebody looked at:
//
//   - the same scrub comes out the same every time, and two fields cut from
//     different origins agree about the same patch of page;
//   - bearing down moves *coverage*, not only brightness;
//   - a second pass fills what the first broke over — and then it stops,
//     because a cell holds only so much;
//   - even the heaviest band keeps its pinholes, because the sparkle is the
//     medium (see the reference photographs in the tool-simulation skill);
//   - the dust sprinkle lands sparse specks in its ring and nothing outside
//     it;
//   - and none of it happens where the stick never went.
//
// None of them needs a canvas, which is the whole point of splitting the
// field off from the gesture (see `chalkSim.ts`).

import { describe, expect, it } from "vitest";

import { groundProfile, SOLID_GROUND } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import {
  chalkCoverage,
  createChalkField,
  dusted,
  scrub,
  sprinkle,
  type ChalkField,
  type FaceGrain,
} from "../src/app/plugins/chalkField.ts";

const CELL = 1;
const SPAN = 80;

function sheet(stock?: string): GroundProfile {
  return stock ? groundProfile({ stock }) : SOLID_GROUND;
}

function field(o: { stock?: string; x?: number; y?: number } = {}): ChalkField {
  return createChalkField({
    x: o.x ?? 0,
    y: o.y ?? 0,
    width: SPAN,
    height: SPAN,
    cell: CELL,
    ground: sheet(o.stock),
  });
}

/** A stick swept across the middle of a field, `passes` times over, spaced
 *  and shared the way `chalkSim.ts` spaces and shares its dabs. */
function stroke(f: ChalkField, force = 0.8, passes = 1, half = 9): void {
  const fray = Math.min(half * 0.35, 1.2 + half * 0.06);
  const spacing = Math.max(CELL * 0.9, half / 3);
  const share = 1 / Math.max(1, (2 * half) / spacing);
  for (let pass = 0; pass < passes; pass++) {
    for (let x = 14; x <= SPAN - 14; x += spacing) {
      scrub(f, x, SPAN / 2, half, fray, force, share);
    }
  }
}

/** How much chalk the sweep left in total. */
function weight(f: ChalkField): number {
  let sum = 0;
  for (const held of dusted(f)) sum += held;
  return sum;
}

/** The loads down the middle of the swept band. */
function bandLoads(f: ChalkField): number[] {
  const loads = dusted(f);
  const band: number[] = [];
  for (let y = SPAN / 2 - 6; y <= SPAN / 2 + 6; y++) {
    for (let x = 20; x <= SPAN - 20; x++) band.push(loads[y * SPAN + x]!);
  }
  return band;
}

describe("the board", () => {
  it("is the same board every time", () => {
    const a = field({ stock: "cold" });
    const b = field({ stock: "cold" });
    stroke(a);
    stroke(b);
    expect(dusted(a)).toEqual(dusted(b));
  });

  it("agrees with a field cut from another origin about the same page", () => {
    // Two marks that cross must skip the same slick spots and catch the same
    // crumbs, or the page reads as a pile of separately-textured decals. The
    // grain is anchored to the page, so a field opened 20 px to the left
    // works the shared cells out identically.
    const a = field({ stock: "cold" });
    const b = field({ stock: "cold", x: -20 });
    stroke(a);
    // The same page positions, reached through b's shifted lattice.
    const half = 9;
    const fray = Math.min(half * 0.35, 1.2 + half * 0.06);
    const spacing = Math.max(CELL * 0.9, half / 3);
    const share = 1 / Math.max(1, (2 * half) / spacing);
    for (let x = 14; x <= SPAN - 14; x += spacing) {
      scrub(b, x, SPAN / 2, half, fray, 0.8, share);
    }
    const loadsA = dusted(a);
    const loadsB = dusted(b);
    const row = SPAN / 2;
    for (let x = 20; x < 50; x++) {
      const atA = row * SPAN + x;
      const atB = row * SPAN + (x + 20);
      expect(loadsB[atB]).toBeCloseTo(loadsA[atA]!, 5);
    }
  });

  it("takes nothing where the stick never went", () => {
    const f = field({ stock: "cold" });
    stroke(f);
    const loads = dusted(f);
    for (let x = 0; x < SPAN; x++) {
      expect(loads[x]).toBe(0); // the top row is far outside the band
    }
  });
});

describe("a hand that bears down", () => {
  it("covers more board, not only brighter dust", () => {
    const light = field({ stock: "cold" });
    const heavy = field({ stock: "cold" });
    stroke(light, 0.4);
    stroke(heavy, 1.2);
    expect(chalkCoverage(heavy)).toBeGreaterThan(chalkCoverage(light) * 1.3);
    expect(weight(heavy)).toBeGreaterThan(weight(light) * 2);
  });
});

describe("a second pass", () => {
  it("fills in what the first broke over", () => {
    const once = field({ stock: "rough" });
    const twice = field({ stock: "rough" });
    stroke(once, 0.7, 1);
    stroke(twice, 0.7, 2);
    expect(chalkCoverage(twice, 0.15)).toBeGreaterThan(
      chalkCoverage(once, 0.15),
    );
  });

  it("and then stops, because a cell holds only so much", () => {
    const f = field({ stock: "cold" });
    stroke(f, 1.2, 30);
    for (const held of dusted(f)) {
      expect(held).toBeLessThanOrEqual(f.cap);
    }
    // Thirty passes is burnishing, not thirty strokes of weight.
    const g = field({ stock: "cold" });
    stroke(g, 1.2, 3);
    expect(weight(f)).toBeLessThan(weight(g) * 4);
  });
});

describe("the sparkle", () => {
  it("keeps dark pinholes open in an ordinary band", () => {
    // The reference photographs' one constant: a covered chalk passage still
    // glitters around spots that took almost nothing. The grip's low tail is
    // what holds them open.
    const f = field({ stock: "cold" });
    stroke(f, 0.9, 1);
    const band = bandLoads(f);
    const sorted = [...band].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    expect(p90).toBeGreaterThan(0.3);
    const pinholes = band.filter((held) => held < p90 * 0.15).length;
    expect(pinholes / band.length).toBeGreaterThan(0.03);
  });

  it("still sparkles after a heavy hand has scrubbed it", () => {
    // Scrubbing narrows the spread — the valleys fill in — but never flattens
    // it: the brightest crumbs and the slickest spots stay apart.
    const f = field({ stock: "cold" });
    stroke(f, 1.2, 3);
    const band = bandLoads(f);
    const sorted = [...band].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)]!;
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    expect(p90).toBeGreaterThan(0.8);
    expect(p10).toBeLessThan(p90 * 0.75);
  });
});

describe("the face's grain", () => {
  it("modulates the deposit lane by lane", () => {
    // The streaks a broad drag is made of: a lane whose gain is low leaves a
    // paler stripe than a lane at full weight, at the same touch.
    const f = field({ stock: "cold" });
    const gains = new Float32Array([1, 1, 0.1, 1, 1]);
    const grain: FaceGrain = { nx: 0, ny: 1, gains, mid: 2, pitch: 3 };
    for (let x = 14; x <= SPAN - 14; x += 3) {
      scrub(f, x, SPAN / 2, 9, 2, 0.8, 0.2, grain);
    }
    const loads = dusted(f);
    let starved = 0;
    let fed = 0;
    for (let x = 20; x <= SPAN - 20; x++) {
      starved += loads[(SPAN / 2) * SPAN + x]!; // the 0.1 lane, on the axis
      fed += loads[(SPAN / 2 + 4) * SPAN + x]!; // a full lane, one out
    }
    expect(starved).toBeLessThan(fed * 0.5);
  });
});

describe("the dust", () => {
  it("lands sparse specks in its ring and nothing outside it", () => {
    const f = field({ stock: "cold" });
    sprinkle(f, SPAN / 2, SPAN / 2, 10, 20, 1, 0.06, 1);
    const loads = dusted(f);
    let inRing = 0;
    let cells = 0;
    for (let y = 0; y < SPAN; y++) {
      for (let x = 0; x < SPAN; x++) {
        const away = Math.hypot(x + 0.5 - SPAN / 2, y + 0.5 - SPAN / 2);
        const held = loads[y * SPAN + x]!;
        if (away < 10 || away >= 20) {
          expect(held).toBe(0);
        } else {
          cells++;
          if (held > 0) inRing++;
        }
      }
    }
    // Specks, not a band: a few percent of the ring catches a crumb.
    expect(inRing).toBeGreaterThan(0);
    expect(inRing / cells).toBeLessThan(0.2);
  });
});
