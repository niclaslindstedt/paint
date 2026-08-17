// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The calligraphy pen's ink field.
//
// A field model looks plausible whatever it is doing, so the claims checked
// here are the ones the engine actually makes, each as a number the field
// emits rather than a picture somebody looked at:
//
//   - the same touch leaves the same film every time;
//   - a charged edge writes a solid ribbon on any stock, and the film still
//     settles into the stock's grain — deeper grain, rougher ribbon;
//   - a starving edge rails — corners over centre — and breaks up on the
//     paper's tooth, more broken the rougher the sheet;
//   - the feather wicks past the corners only where the sheet drinks.
//
// None of it needs a canvas, which is the whole point of splitting the field
// off from the gesture (see `quillSim.ts`).

import { describe, expect, it } from "vitest";

import { groundProfile, SOLID_GROUND } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import {
  createQuillField,
  edge,
  inkCoverage,
  inked,
  pooled,
  railing,
  taking,
  type QuillField,
} from "../src/app/plugins/quillField.ts";

const SPAN = 120;

function sheet(stock?: string): GroundProfile {
  return stock ? groundProfile({ stock }) : SOLID_GROUND;
}

function field(o: { stock?: string; wick?: number } = {}): QuillField {
  return createQuillField({
    x: 0,
    y: 0,
    width: SPAN,
    height: SPAN,
    cell: 1,
    ground: sheet(o.stock),
    wick: o.wick ?? 0,
  });
}

/** A horizontal run of touches across the middle of the field: a 16px edge
 *  held vertical, so the band is a clean horizontal ribbon that windows can be
 *  cut from without geometry. */
function sweep(f: QuillField, dry: number, film = 1): void {
  for (let x = 20; x <= 100; x += 0.8) {
    edge(f, x, 60, 0, 8, film, dry, 0.8);
  }
}

/** Mean film over a window, counting only cells that hold any. */
function meanFilm(
  f: QuillField,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number {
  const film = inked(f);
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const held = film[y * SPAN + x]!;
      if (held > 0) {
        sum += held;
        n++;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

describe("the ink field", () => {
  it("leaves the same film for the same touch, every time", () => {
    const a = field({ stock: "rough" });
    const b = field({ stock: "rough" });
    sweep(a, 0.6);
    sweep(b, 0.6);
    expect(Array.from(inked(a))).toEqual(Array.from(inked(b)));
  });

  it("writes a solid ribbon when the nib is charged, on any stock", () => {
    for (const stock of [undefined, "cold", "rough", "cotton"]) {
      const f = field({ stock });
      sweep(f, 0);
      expect(inkCoverage(f, 0.2)).toBeGreaterThan(0.9);
    }
  });

  it("settles the film into the stock's grain, so the ribbon follows the sheet", () => {
    // Not "is the film uneven" — an even walk over a cell grid is a little
    // uneven whatever it lands on — but the claim that makes paper paper: on
    // a grained stock the film is *correlated* with the sheet, more of it
    // where the sheet dips. On the sealed page the sheet is never even read.
    // Both sides are smoothed over the walk's own sampling grain first: the
    // paper's relief lives at the stock's tooth pitch — several cells — where
    // the walk's cell-quantisation noise is white, so a small box average is
    // what lets the claim be about the paper rather than about the walk.
    const f = field({ stock: "rough" });
    sweep(f, 0);
    const film = inked(f);
    const smoothAt = (data: Float32Array, x: number, y: number) => {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += data[(y + dy) * SPAN + (x + dx)]!;
        }
      }
      return sum / 9;
    };
    let n = 0;
    let sumF = 0;
    let sumD = 0;
    let sumFF = 0;
    let sumDD = 0;
    let sumFD = 0;
    for (let y = 56; y < 64; y++) {
      for (let x = 30; x < 90; x++) {
        if (f.ready[y * SPAN + x] !== 1) continue;
        const held = smoothAt(film, x, y);
        const dip = smoothAt(f.dip, x, y);
        n++;
        sumF += held;
        sumD += dip;
        sumFF += held * held;
        sumDD += dip * dip;
        sumFD += held * dip;
      }
    }
    const covariance = sumFD / n - (sumF / n) * (sumD / n);
    const spread = Math.sqrt(
      (sumFF / n - (sumF / n) ** 2) * (sumDD / n - (sumD / n) ** 2),
    );
    expect(n).toBeGreaterThan(300);
    expect(covariance / spread).toBeGreaterThan(0.3);

    // …and the sealed page's field never consults the sheet at all.
    const solid = field();
    sweep(solid, 0);
    expect(solid.ready.every((cell) => cell === 0)).toBe(true);
  });

  it("rails as it starves: the corners keep writing over the centre", () => {
    expect(railing(0, 0)).toBe(1);
    expect(railing(1, 0)).toBe(1);
    expect(railing(0, 0.9)).toBeLessThan(railing(1, 0.9));
    expect(railing(0, 0.9)).toBeLessThan(0.5);
    // …and on the field: a starving sweep holds more ink along the band's rim
    // than down its middle.
    const f = field();
    sweep(f, 0.75);
    const rim = (meanFilm(f, 30, 90, 52, 55) + meanFilm(f, 30, 90, 65, 68)) / 2;
    const middle = meanFilm(f, 30, 90, 58, 62);
    expect(middle).toBeLessThan(rim * 0.85);
  });

  it("breaks up on the tooth as it runs dry — and the sheet decides where", () => {
    expect(taking(0.3, 0)).toBe(1);
    expect(taking(0.3, 1)).toBeLessThan(taking(0.05, 1));
    const smooth = field();
    const rough = field({ stock: "rough" });
    sweep(smooth, 0.95, 0.2);
    sweep(rough, 0.95, 0.2);
    // The same starving pass: the rough sheet keeps a more broken line.
    expect(inkCoverage(rough, 0.05)).toBeLessThan(inkCoverage(smooth, 0.05));
  });

  it("pools a wet film into the dips and thins it over the peaks", () => {
    expect(pooled(0.5, 0, 1)).toBe(1);
    expect(pooled(0.9, 0.6, 1)).toBeGreaterThan(1);
    expect(pooled(0.1, 0.6, 1)).toBeLessThan(1);
  });

  it("feathers past the corners only where the sheet drinks", () => {
    const dry = field({ stock: "cold", wick: 0 });
    const wet = field({ stock: "cold", wick: 0.5 });
    sweep(dry, 0);
    sweep(wet, 0);
    // Ink beyond the edge's own reach: the corner sits at y = 60 ± 8, so
    // anything past ±9 is the feather's.
    const fringe = (f: QuillField) =>
      meanFilm(f, 30, 90, 40, 50) + meanFilm(f, 30, 90, 70, 80);
    expect(fringe(dry)).toBe(0);
    expect(fringe(wet)).toBeGreaterThan(0);
  });

  it("puts nothing where the nib never went", () => {
    const f = field({ stock: "rough", wick: 0.5 });
    sweep(f, 0.4);
    expect(meanFilm(f, 0, SPAN, 0, 30)).toBe(0);
    expect(meanFilm(f, 0, SPAN, 90, SPAN)).toBe(0);
  });
});
