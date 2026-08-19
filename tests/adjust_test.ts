// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  addCurvePoint,
  adjustLut,
  adjustPixels,
  curveLut,
  curvesAreStraight,
  moveCurvePoint,
  MIN_CURVE_GAP,
  normalizeCurve,
  removeCurvePoint,
  sampleCurve,
  straightCurves,
  toHsl,
  toneWeight,
  toRgb,
  luma,
  STRAIGHT,
  type Adjustment,
  type CurvePoint,
} from "../src/app/adjust.ts";

// What a colour adjustment *does*, without a canvas.
//
// Every one of them is a function from bytes to bytes, so the whole Colour
// section can be driven here the way a tool behaviour can be driven without a
// pointer: hand it four pixels, read the four back. `effectPaint.ts` owns
// getting the pixels off a context and putting them back, and that is the only
// part of this that needs a DOM.
//
// Two things are worth pinning above the arithmetic, because they are the ones
// that would go wrong quietly:
//
//   - **The line never turns back on itself.** A tone curve drawn through an
//     ordinary spline overshoots, and an overshoot on a tone curve is a bright
//     band with dark edges either side of the handle you dragged.
//   - **Nothing touches alpha, and nothing touches an empty pixel.** A layer
//     arrives here as its marks on a transparent surface, so most of it is
//     nothing at all — and an adjustment that wrote to those would put a
//     rectangle of colour around the ink.

/** One pixel as four bytes, for reading an adjustment's answer back. */
const pixel = (r: number, g: number, b: number, a = 255) =>
  new Uint8ClampedArray([r, g, b, a]);

const run = (data: Uint8ClampedArray, adjustment: Adjustment) => {
  adjustPixels(data, adjustment);
  return [...data];
};

describe("the tone curve", () => {
  it("is the identity when it is straight", () => {
    for (const v of [0, 0.25, 0.5, 0.9, 1]) {
      expect(sampleCurve(STRAIGHT, v)).toBeCloseTo(v, 5);
    }
    const lut = curveLut(STRAIGHT);
    expect([...lut].every((out, at) => out === at)).toBe(true);
    expect(curvesAreStraight(straightCurves())).toBe(true);
  });

  it("passes through every handle", () => {
    const points: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.7 },
      { x: 1, y: 1 },
    ];
    expect(sampleCurve(points, 0.3)).toBeCloseTo(0.7, 5);
    expect(sampleCurve(points, 0)).toBeCloseTo(0, 5);
    expect(sampleCurve(points, 1)).toBeCloseTo(1, 5);
  });

  it("never turns back on itself between two handles", () => {
    // The case an ordinary cubic gets wrong: one handle yanked far above its
    // neighbours. A spline that overshoots dips *below* the handle on the way
    // in, which on a picture reads as a dark edge against a bright band.
    const spike: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.4, y: 0.05 },
      { x: 0.5, y: 0.95 },
      { x: 0.6, y: 0.96 },
      { x: 1, y: 1 },
    ];
    let last = -1;
    for (let i = 0; i <= 200; i += 1) {
      const y = sampleCurve(spike, i / 200);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      last = y;
    }
  });

  it("holds a tone outside the square at the nearest end", () => {
    const lifted: CurvePoint[] = [
      { x: 0, y: 0.2 },
      { x: 1, y: 0.8 },
    ];
    expect(sampleCurve(lifted, -1)).toBeCloseTo(0.2, 5);
    expect(sampleCurve(lifted, 2)).toBeCloseTo(0.8, 5);
  });
});

describe("editing a curve", () => {
  it("sorts, clamps and pins both ends", () => {
    const messy = normalizeCurve([
      { x: 0.8, y: 1.4 },
      { x: 0.2, y: -0.3 },
    ]);
    expect(messy[0]!.x).toBe(0);
    expect(messy[messy.length - 1]!.x).toBe(1);
    expect(messy.every((p) => p.y >= 0 && p.y <= 1)).toBe(true);
    expect([...messy].sort((a, b) => a.x - b.x)).toEqual(messy);
  });

  it("drops handles too close together to tell apart", () => {
    const crowded = normalizeCurve([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 0.5 + MIN_CURVE_GAP / 4, y: 0.9 },
      { x: 1, y: 1 },
    ]);
    expect(crowded).toHaveLength(3);
  });

  it("keeps the ends on their ends and an inner handle between its neighbours", () => {
    const points: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ];
    // The ends travel vertically only — they are what the curve's black and
    // white are.
    expect(moveCurvePoint(points, 0, { x: 0.7, y: 0.4 })).toEqual([
      { x: 0, y: 0.4 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ]);
    // …and an inner one cannot be dragged past a neighbour, so the line never
    // reorders itself under the hand.
    const shoved = moveCurvePoint(points, 1, { x: 5, y: 0.9 });
    expect(shoved[1]!.x).toBeLessThanOrEqual(1 - MIN_CURVE_GAP);
    expect(shoved[1]!.y).toBe(0.9);
  });

  it("grabs a handle already there rather than crowding the line", () => {
    const points = [...STRAIGHT];
    const near = addCurvePoint(points, { x: MIN_CURVE_GAP / 2, y: 0.5 });
    expect(near.points).toHaveLength(2);
    expect(near.index).toBe(0);
    const fresh = addCurvePoint(points, { x: 0.5, y: 0.9 });
    expect(fresh.points).toHaveLength(3);
    expect(fresh.index).toBe(1);
  });

  it("will not throw away the two ends", () => {
    const points: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.9 },
      { x: 1, y: 1 },
    ];
    expect(removeCurvePoint(points, 1)).toHaveLength(2);
    expect(removeCurvePoint(points, 0)).toHaveLength(3);
    expect(removeCurvePoint(points, 2)).toHaveLength(3);
  });
});

describe("the tables", () => {
  it("leaves a picture alone when nothing is asked for", () => {
    const flat: Adjustment = { kind: "brightness", brightness: 0, contrast: 0 };
    const lut = adjustLut(flat)!;
    expect([...lut.r].every((out, at) => Math.abs(out - at) <= 1)).toBe(true);
  });

  it("lifts toward white rather than by a flat offset", () => {
    // The difference matters at the top of the range: a flat offset clips the
    // highlights to white long before the shadows have moved.
    const lut = adjustLut({
      kind: "brightness",
      brightness: 0.5,
      contrast: 0,
    })!;
    expect(lut.r[0]!).toBeGreaterThan(100);
    expect(lut.r[200]!).toBeGreaterThan(200);
    expect(lut.r[255]!).toBe(255);
    // Monotone throughout: brightening may not fold two tones into one order.
    for (let v = 1; v < 256; v += 1) {
      expect(lut.r[v]!).toBeGreaterThanOrEqual(lut.r[v - 1]!);
    }
  });

  it("pushes the tones apart around mid grey", () => {
    const up = adjustLut({ kind: "brightness", brightness: 0, contrast: 0.5 })!;
    expect(up.r[64]!).toBeLessThan(64);
    expect(up.r[192]!).toBeGreaterThan(192);
    expect(up.r[128]!).toBeCloseTo(128, -1);
    const down = adjustLut({
      kind: "brightness",
      brightness: 0,
      contrast: -0.5,
    })!;
    expect(down.r[0]!).toBeGreaterThan(0);
    expect(down.r[255]!).toBeLessThan(255);
  });

  it("maps the black and white points onto black and white", () => {
    const lut = adjustLut({
      kind: "levels",
      black: 0.2,
      white: 0.8,
      gamma: 1,
    })!;
    expect(lut.r[Math.round(0.2 * 255)]!).toBe(0);
    expect(lut.r[Math.round(0.8 * 255)]!).toBe(255);
    expect(lut.r[0]!).toBe(0);
    expect(lut.r[255]!).toBe(255);
  });

  it("lifts the midtones above one and drops them below", () => {
    const light = adjustLut({ kind: "levels", black: 0, white: 1, gamma: 2 })!;
    const dark = adjustLut({ kind: "levels", black: 0, white: 1, gamma: 0.5 })!;
    expect(light.r[128]!).toBeGreaterThan(128);
    expect(dark.r[128]!).toBeLessThan(128);
    // The ends are the ends whatever the gamma is.
    expect(light.r[0]!).toBe(0);
    expect(light.r[255]!).toBe(255);
  });

  it("runs a channel's curve before the composite one", () => {
    // Bending red alone and then lifting RGB has to compose in that order, or
    // a grade stops meaning what every other curve editor means by it.
    const lut = adjustLut({
      kind: "curves",
      channel: "rgb",
      curves: {
        ...straightCurves(),
        r: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.75 },
          { x: 1, y: 1 },
        ],
        rgb: [
          { x: 0, y: 0.1 },
          { x: 1, y: 1 },
        ],
      },
    })!;
    const own = curveLut([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.75 },
      { x: 1, y: 1 },
    ]);
    const composite = curveLut([
      { x: 0, y: 0.1 },
      { x: 1, y: 1 },
    ]);
    expect(lut.r[128]!).toBe(composite[own[128]!]!);
    // Green was never bent, so it is the composite alone.
    expect(lut.g[128]!).toBe(composite[128]!);
  });

  it("aims a colour-balance shift at one end of the range", () => {
    // Overlapping windows: a shift meant for the shadows has to fade out
    // through the midtones rather than stop at a boundary and band.
    expect(toneWeight("shadows", 0)).toBeCloseTo(1, 5);
    expect(toneWeight("shadows", 1)).toBeCloseTo(0, 5);
    expect(toneWeight("highlights", 1)).toBeCloseTo(1, 5);
    expect(toneWeight("midtones", 0.5)).toBeCloseTo(1, 5);
    expect(toneWeight("midtones", 0)).toBeCloseTo(0, 5);

    const lut = adjustLut({
      kind: "balance",
      range: "shadows",
      red: 1,
      green: 0,
      blue: 0,
    })!;
    expect(lut.r[16]!).toBeGreaterThan(16 + 100);
    expect(lut.r[240]!).toBeLessThan(240 + 4);
    // The channels the sliders were left alone on are untouched.
    expect([...lut.g].every((out, at) => out === at)).toBe(true);
  });
});

describe("running an adjustment over pixels", () => {
  it("leaves an empty pixel empty and never writes alpha", () => {
    const data = new Uint8ClampedArray([
      10,
      20,
      30,
      0, // nothing here — a layer is mostly this
      10,
      20,
      30,
      128,
    ]);
    run(data, { kind: "desaturate", amount: 1 });
    expect([...data.slice(0, 4)]).toEqual([10, 20, 30, 0]);
    expect(data[7]).toBe(128);
    expect(data[4]).toBe(data[5]);
    expect(data[5]).toBe(data[6]);
  });

  it("mixes toward grey rather than replacing with it", () => {
    const half = run(pixel(200, 100, 0), { kind: "desaturate", amount: 0.5 });
    const grey = luma(200, 100, 0);
    expect(half[0]).toBeCloseTo(200 + (grey - 200) * 0.5, 0);
    expect(half[1]).toBeCloseTo(100 + (grey - 100) * 0.5, 0);
    // Rec. 709 rather than an average: a saturated blue is nearly black.
    const blue = run(pixel(0, 0, 255), { kind: "desaturate", amount: 1 });
    expect(blue[0]).toBeLessThan(30);
  });

  it("turns the wheel and wraps round it", () => {
    // Red plus a third of a turn is green, and a full turn is where it began.
    const third = run(pixel(255, 0, 0), {
      kind: "hue",
      hue: 120,
      saturation: 0,
      lightness: 0,
    });
    expect(third[1]).toBeGreaterThan(240);
    expect(third[0]).toBeLessThan(15);
    const round = run(pixel(200, 40, 90), {
      kind: "hue",
      hue: 360,
      saturation: 0,
      lightness: 0,
    });
    expect(round[0]).toBeCloseTo(200, -1);
    expect(round[2]).toBeCloseTo(90, -1);
  });

  it("drains a colour to grey at the bottom of the saturation slider", () => {
    const grey = run(pixel(200, 40, 90), {
      kind: "hue",
      hue: 0,
      saturation: -1,
      lightness: 0,
    });
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
  });

  it("keeps a pixel's brightness when it is asked to", () => {
    const before = pixel(120, 120, 120);
    const was = luma(before[0]!, before[1]!, before[2]!);
    const shifted = run(before, {
      kind: "balance",
      range: "midtones",
      red: 0.6,
      green: 0,
      blue: -0.4,
      luminosity: true,
    });
    const now = luma(shifted[0]!, shifted[1]!, shifted[2]!);
    // The colour moved…
    expect(shifted[0]).toBeGreaterThan(shifted[2]!);
    // …and the light stayed where it was, which is the whole point of the
    // switch: warming a picture is not the same as lightening it.
    expect(now).toBeCloseTo(was, 0);
  });
});

describe("HSL", () => {
  it("comes back out where it went in", () => {
    for (const [r, g, b] of [
      [0, 0, 0],
      [1, 1, 1],
      [0.2, 0.6, 0.9],
      [0.9, 0.1, 0.4],
      [0.5, 0.5, 0.5],
    ]) {
      const hsl = toHsl(r!, g!, b!);
      const back = toRgb(hsl.h, hsl.s, hsl.l);
      expect(back.r).toBeCloseTo(r!, 5);
      expect(back.g).toBeCloseTo(g!, 5);
      expect(back.b).toBeCloseTo(b!, 5);
    }
  });
});
