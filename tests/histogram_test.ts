// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  autoLevels,
  gammaAt,
  gammaFraction,
  MIN_LEVELS_SPAN,
} from "../src/app/adjust.ts";
import { emptyHistogram, tally, TONES } from "../src/app/histogram.ts";

// The picture behind the levels handles, and the arithmetic that places them.
//
// Both halves are pure: counting tones is a function of a pixel buffer, and
// where a handle sits is a function of three numbers. The part that needs a
// browser — painting the target layers onto an off-screen surface — is one
// wrapper around the first of these, so everything worth being sure of is
// reachable from node.
//
// Three things are worth pinning, because all three would go wrong quietly:
//
//   - **Emptiness is not black.** A layer arrives as marks on a transparent
//     surface, so most of it is nothing at all. Counting that nothing as tone 0
//     would bury every real picture under one bar at the left edge and make the
//     black handle unplaceable.
//   - **The middle handle is neutral in the middle.** A levels bar that opened
//     with the gamma handle a pixel off centre would be quietly telling you the
//     picture was already graded.
//   - **Auto lands on the data.** It is the whole point of drawing the shape.

/** A buffer of `n` pixels, all the same colour and opacity. */
function pixels(
  n: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

describe("tally", () => {
  it("counts a flat grey into one bin", () => {
    const counted = tally(pixels(10, 128, 128, 128));
    expect(counted.count).toBe(10);
    expect(counted.bins[128]).toBe(10);
    expect(counted.peak).toBe(10);
    expect(counted.low).toBe(128);
    expect(counted.high).toBe(128);
  });

  it("skips the transparent pixels a layer is mostly made of", () => {
    const data = new Uint8ClampedArray([
      // one solid black mark…
      0, 0, 0, 255,
      // …and three pixels of the nothing around it.
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4,
    ]);
    const counted = tally(data);
    expect(counted.count).toBe(1);
    expect(counted.bins[0]).toBe(1);
  });

  it("answers an empty count for a buffer with nothing in it", () => {
    const counted = tally(new Uint8ClampedArray(40));
    expect(counted.count).toBe(0);
    expect(counted.peak).toBe(0);
    expect(counted.bins).toHaveLength(TONES);
  });

  it("reads the light rather than one channel", () => {
    // A saturated blue is near-black to the eye and must not land at the top of
    // the range just because one of its channels is at 255.
    const counted = tally(pixels(1, 0, 0, 255));
    expect(counted.low).toBeLessThan(60);
  });

  it("finds where the data starts and ends", () => {
    const data = new Uint8ClampedArray([
      40, 40, 40, 255, 128, 128, 128, 255, 200, 200, 200, 255,
    ]);
    const counted = tally(data);
    expect(counted.low).toBe(40);
    expect(counted.high).toBe(200);
  });
});

describe("emptyHistogram", () => {
  it("spans the whole range so a bar with no shape is still placeable", () => {
    const none = emptyHistogram();
    expect(none.count).toBe(0);
    expect(none.low).toBe(0);
    expect(none.high).toBe(TONES - 1);
  });
});

describe("the middle levels handle", () => {
  const MIN = 0.1;
  const MAX = 3;

  it("is neutral dead centre", () => {
    expect(gammaAt(0.5, MIN, MAX)).toBeCloseTo(1, 6);
    expect(gammaFraction(1, MIN, MAX)).toBeCloseTo(0.5, 6);
  });

  it("reaches each end of the declared range at each end of its travel", () => {
    expect(gammaAt(0, MIN, MAX)).toBeCloseTo(MAX, 6);
    expect(gammaAt(1, MIN, MAX)).toBeCloseTo(MIN, 6);
  });

  it("lifts the midtones toward the shadows, which is the way a hand reads", () => {
    expect(gammaAt(0.3, MIN, MAX)).toBeGreaterThan(1);
    expect(gammaAt(0.7, MIN, MAX)).toBeLessThan(1);
  });

  it("round-trips, so dragging and reading back land on the same handle", () => {
    for (const at of [0.05, 0.2, 0.5, 0.62, 0.9]) {
      expect(gammaFraction(gammaAt(at, MIN, MAX), MIN, MAX)).toBeCloseTo(at, 6);
    }
  });

  it("clamps a gamma from outside the range onto the rail", () => {
    expect(gammaFraction(99, MIN, MAX)).toBe(0);
    expect(gammaFraction(0.001, MIN, MAX)).toBe(1);
  });
});

describe("autoLevels", () => {
  const range = {
    black: { min: 0, max: 0.9 },
    white: { min: 0.1, max: 1 },
  };

  it("puts the two ends on the ends of the data", () => {
    const found = autoLevels({ count: 10, low: 51, high: 204 }, range);
    expect(found?.black).toBeCloseTo(0.2, 3);
    expect(found?.white).toBeCloseTo(0.8, 3);
  });

  it("has nothing to say about a page with no tones counted", () => {
    expect(autoLevels(null, range)).toBeNull();
    expect(autoLevels({ count: 0, low: 0, high: 255 }, range)).toBeNull();
  });

  it("refuses a page too flat to open out", () => {
    expect(autoLevels({ count: 10, low: 128, high: 129 }, range)).toBeNull();
  });

  it("stays inside what the controls allow", () => {
    const found = autoLevels({ count: 10, low: 250, high: 255 }, range);
    expect(found).not.toBeNull();
    expect(found!.black).toBeLessThanOrEqual(range.black.max);
    expect(found!.white - found!.black).toBeGreaterThanOrEqual(MIN_LEVELS_SPAN);
  });
});
