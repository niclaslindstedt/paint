// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The second pencil engine.
//
// A field model is exactly the kind of thing that is easy to write and hard to
// be sure of: it looks plausible whatever it is doing, and "that seems about
// right" is not a test. So the claims checked here are the ones the engine
// actually makes, and every one of them is a number the field emits rather than
// a picture somebody looked at:
//
//   - the same sheet comes out the same every time, and a rougher stock really
//     is deeper than a smoother one;
//   - a hard lead reaches the peaks and a soft one the valleys, so the *sheet*
//     decides how broken a line is;
//   - a second pass fills in what the first could not reach…
//   - …and then it stops, because a cell holds only so much;
//   - and none of it happens where the lead never went.
//
// None of them needs a canvas, which is the whole point of splitting the field
// off from the gesture (see `leadSim.ts`).

import { describe, expect, it } from "vitest";

import { groundProfile, SOLID_GROUND } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import {
  HARDEST_LEAD,
  HB_LEAD,
  SOFTEST_LEAD,
} from "../src/app/plugins/graphite.ts";
import {
  bear,
  coverage,
  createLeadField,
  laid,
  sheetDip,
  type LeadField,
} from "../src/app/plugins/leadField.ts";

/** A document pixel a cell, which is what the simulation works at on a screen
 *  at 1:1 (see `leadSim.ts`). */
const CELL = 1;
const SPAN = 80;

function sheet(stock?: string): GroundProfile {
  return stock ? groundProfile({ stock }) : SOLID_GROUND;
}

function field(o: { stock?: string; grade?: number } = {}): LeadField {
  return createLeadField({
    x: 0,
    y: 0,
    width: SPAN,
    height: SPAN,
    cell: CELL,
    ground: sheet(o.stock),
    grade: o.grade ?? HB_LEAD,
  });
}

/** A 0.7 mm lead swept across the middle of a field, `passes` times over.
 *
 *  The dabs are spaced and shared exactly as `leadSim.ts` spaces and shares
 *  them, because what is under test is the arithmetic that engine drives — a
 *  test that laid one enormous dab would be testing something nobody draws. */
function stroke(f: LeadField, passes = 1, half = 6.35): void {
  const fray = Math.min(half * 0.55, 0.7 + half * 0.08);
  const spacing = Math.max(CELL * 0.9, half / 3);
  const share = 1 / Math.max(1, (2 * half) / spacing);
  for (let pass = 0; pass < passes; pass++) {
    for (let x = 14; x <= SPAN - 14; x += spacing) {
      bear(f, x, SPAN / 2, half, fray, 0.9, share);
    }
  }
}

/** How much graphite the sweep left, per cell of the band it went down. */
function weight(f: LeadField): number {
  let sum = 0;
  for (const held of laid(f)) sum += held;
  return sum;
}

/** The mean depth of a sheet's tooth over a decent patch of it. */
function depth(ground: GroundProfile): number {
  let sum = 0;
  for (let y = 0; y < 120; y++) {
    for (let x = 0; x < 120; x++) sum += sheetDip(x, y, ground);
  }
  return sum / (120 * 120);
}

describe("the sheet a pencil is pressed into", () => {
  it("is the same sheet every time, and everywhere between 0 and 1", () => {
    // A mark repaints on every pan, undo and export, so a sheet drawn from
    // `Math.random` would shimmer. Same place, same paper, for ever.
    const cold = sheet("cold");
    expect(sheetDip(31, 47, cold)).toBe(sheetDip(31, 47, cold));
    expect(sheetDip(31, 47, cold)).not.toBe(sheetDip(31, 48.5, cold));
    for (let i = 0; i < 400; i++) {
      const dip = sheetDip(i * 1.7, i * 2.3, cold);
      expect(dip).toBeGreaterThanOrEqual(0);
      expect(dip).toBeLessThanOrEqual(1);
    }
  });

  it("gets deeper the rougher the stock is", () => {
    // The whole reason this engine exists: the stocks are not decoration, they
    // are different surfaces, and they have to come out in that order.
    const order = ["solid", "hot", "cartridge", "cold", "rough"].map((stock) =>
      depth(sheet(stock === "solid" ? undefined : stock)),
    );
    for (let i = 1; i < order.length; i++) {
      expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    }
  });

  it("has a tooth even on the plain page, because the lead has one", () => {
    // A surface with no stock still breaks a pencil line up — that is the
    // graphite, not the paper — so the solid sheet must not come out flat.
    expect(depth(SOLID_GROUND)).toBeGreaterThan(0.1);
  });

  it("holds more graphite the more tooth it has", () => {
    // A hollow is somewhere for the stuff to go. It is why a tonal drawing is
    // made on rough paper and not on plate.
    expect(field({ stock: "rough" }).cap).toBeGreaterThan(
      field({ stock: "hot" }).cap,
    );
    expect(field({ stock: "hot" }).cap).toBeGreaterThan(field().cap);
  });
});

describe("what a lead leaves on it", () => {
  it("goes only where the lead went", () => {
    const f = field({ stock: "cold" });
    stroke(f);
    const load = laid(f);
    // Well clear of the band the sweep went down, and well clear of both ends.
    for (const [col, row] of [
      [40, 4],
      [40, 74],
      [2, 40],
      [78, 40],
    ]) {
      expect(load[row! * SPAN + col!]).toBe(0);
    }
    expect(weight(f)).toBeGreaterThan(0);
  });

  it("covers less of a sheet the rougher it is", () => {
    // Same lead, same pressure, same gesture: the paper is the only thing that
    // changed, and it is what decides how broken the line is.
    const covered = ["hot", "cartridge", "cold", "rough"].map((stock) => {
      const f = field({ stock });
      stroke(f);
      return coverage(f);
    });
    for (let i = 1; i < covered.length; i++) {
      expect(covered[i]!).toBeLessThan(covered[i - 1]!);
    }
  });

  it("reaches the peaks with a hard lead and the valleys with a soft one", () => {
    const hard = field({ stock: "cold", grade: HARDEST_LEAD });
    const soft = field({ stock: "cold", grade: SOFTEST_LEAD });
    stroke(hard);
    stroke(soft);
    expect(coverage(soft)).toBeGreaterThan(coverage(hard) * 1.5);
    // …and lays down a great deal more of itself once it is there, which is the
    // other half of what a grade is.
    expect(weight(soft)).toBeGreaterThan(weight(hard) * 3);
  });

  it("is the geometry that changed and never the width", () => {
    // The grade reaches the deposit and the reach, never the mark's size — a
    // 6B is a blacker line, not a wider one. The same claim the stroke model
    // makes (see `graphite_test.ts`), checked on the other engine.
    const edge = (grade: number): number => {
      const f = field({ grade });
      stroke(f);
      const load = laid(f);
      let widest = 0;
      for (let row = 0; row < SPAN; row++) {
        for (let col = 0; col < SPAN; col++) {
          if (load[row * SPAN + col]! > 0) {
            widest = Math.max(widest, Math.abs(row - SPAN / 2));
          }
        }
      }
      return widest;
    };
    expect(edge(SOFTEST_LEAD)).toBe(edge(HARDEST_LEAD));
  });
});

describe("shading over the same patch", () => {
  it("fills in what the first pass could not reach", () => {
    // The thing a scattered speckle cannot do: graphite in a valley stands the
    // surface up, so the second pass reaches ground the first one missed.
    const once = field({ stock: "rough" });
    const twice = field({ stock: "rough" });
    stroke(once, 1);
    stroke(twice, 3);
    expect(coverage(twice)).toBeGreaterThan(coverage(once) * 1.15);
  });

  it("stops, because a cell only holds so much", () => {
    // Burnishing: past a point the lead polishes what is there rather than
    // adding to it, which is why a real pencil has a black it cannot pass.
    const some = field({ stock: "cold" });
    const lots = field({ stock: "cold" });
    stroke(some, 8);
    stroke(lots, 40);
    // Five times the shading is nowhere near five times the graphite…
    expect(weight(lots)).toBeLessThan(weight(some) * 1.7);
    // …and nothing anywhere is over what a cell holds.
    for (const held of laid(lots)) expect(held).toBeLessThanOrEqual(lots.cap);
  });
});

describe("cloth", () => {
  // Cotton duck is not paper with a deeper tooth, and the difference has to
  // survive into the mark or a drawing on canvas is only a drawing on coarse
  // paper. A weave is *periodic*: threads run the length of the cloth and cross
  // at a fixed pitch, so the surface has a rhythm the random dip of paper has
  // nothing like.

  const PITCH = groundProfile({ stock: "cotton" }).tooth;

  /** The mean depth over a lattice of points offset `(dx, dy)` into each cell
   *  of the weave — the crown of a thread at the middle, the gap between two
   *  at the corner. */
  function atPhase(ground: GroundProfile, dx: number, dy: number): number {
    let sum = 0;
    let n = 0;
    for (let gy = 0; gy < 40; gy++) {
      for (let gx = 0; gx < 40; gx++) {
        sum += sheetDip((gx + dx) * PITCH, (gy + dy) * PITCH, ground);
        n++;
      }
    }
    return sum / n;
  }

  it("stands up in the middle of a thread and dips where two cross", () => {
    const cotton = sheet("cotton");
    expect(atPhase(cotton, 0.5, 0.5)).toBeLessThan(atPhase(cotton, 0.02, 0.02));
  });

  it("…which paper does not, because paper is not woven", () => {
    // The same measurement on a sheet with a comparable tooth finds nothing,
    // which is what says the rhythm above is the weave rather than the
    // measurement.
    const rough = sheet("rough");
    const middle = atPhase(rough, 0.5, 0.5);
    const corner = atPhase(rough, 0.02, 0.02);
    expect(Math.abs(middle - corner)).toBeLessThan(0.05);
  });

  it("keeps a lead off the troughs however long it is worked", () => {
    // The useful half of that: shading a canvas fills the crowns and leaves the
    // weave showing, where the same shading on paper of the same weight closes
    // up. Measured as how *unevenly* the graphite ended up lying.
    const spread = (stock: string): number => {
      const f = field({ stock, grade: HB_LEAD });
      stroke(f, 12);
      const load = laid(f);
      const marked = [...load].filter((held) => held > 0);
      const mean = marked.reduce((a, b) => a + b, 0) / marked.length;
      const variance =
        marked.reduce((a, b) => a + (b - mean) * (b - mean), 0) / marked.length;
      return Math.sqrt(variance) / mean;
    };
    expect(spread("cotton")).toBeGreaterThan(spread("cold"));
  });
});
