// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The calligraphy pen's ink: the reservoir, and what a stroke costs.
//
// The picture the field takes is checked next door in `quillField_test.ts`;
// this file is about the walk over it and the two economies above it. The
// walk's claims are the pen's: ink shading follows the hand, a dip has a
// bead, a stroke spends its reservoir and runs dry — sooner on paper that
// drinks. The economies are the ones the frame rate rests on: a landed mark
// is worked out once and blitted thereafter, the gesture in flight is walked
// incrementally to the *same* film a single walk would lay, and the lift of a
// finished stroke is a promotion rather than a second walk. And when none of
// it can run, the flat nib still draws.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groundProfile, SOLID_GROUND } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import {
  createQuillField,
  inkCoverage,
  inked,
  type QuillField,
} from "../src/app/plugins/quillField.ts";
import {
  advanceScribe,
  forgetDriedInk,
  inkDryness,
  inkFlow,
  openScribe,
  paintInk,
  paintSimulatedInk,
  scribe,
} from "../src/app/plugins/quillSim.ts";
import type { Point } from "../src/app/types.ts";
import {
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

const ANGLE = -Math.PI / 4;
const SIZE = 9;

function sheet(stock?: string): GroundProfile {
  return stock ? groundProfile({ stock }) : SOLID_GROUND;
}

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
    wick: 0,
  });
}

/** A straight stroke along `y = 60`, sampled the way the canvas stores one:
 *  the gap between points *is* the hand's speed. */
function run(length: number, gap: number, from = 20): Point[] {
  const points: Point[] = [];
  for (let x = from; x <= from + length; x += gap) {
    points.push({ x, y: 60 });
  }
  return points;
}

/** Mean film over a column window of the band. */
function meanFilm(field: QuillField, x0: number, x1: number): number {
  const film = inked(field);
  let sum = 0;
  let n = 0;
  for (let y = 45; y < 75; y++) {
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

describe("the reservoir", () => {
  it("flows freely while charged and starves towards empty", () => {
    expect(inkFlow(1)).toBe(1);
    expect(inkFlow(0.6)).toBe(1);
    expect(inkFlow(0.2)).toBeLessThan(inkFlow(0.4));
    expect(inkFlow(0)).toBeGreaterThan(0.1);
    expect(inkDryness(1)).toBe(0);
    expect(inkDryness(0.6)).toBe(0);
    expect(inkDryness(0.2)).toBeGreaterThan(0);
    expect(inkDryness(0)).toBe(1);
  });

  it("spends itself along the stroke: a low dip pales and breaks by the end", () => {
    const field = fieldOver(1500, 120);
    scribe(field, run(1400, 3), SIZE, ANGLE, 0.35, 1);
    const head = meanFilm(field, 100, 300);
    const tail = meanFilm(field, 1150, 1350);
    expect(tail).toBeLessThan(head * 0.45);
  });

  it("shades with the hand: a slow passage holds more ink than a fast one", () => {
    const field = fieldOver(900, 120);
    // Slow for a third, fast through the middle, slow home.
    const points = [
      ...run(266, 2, 50),
      ...run(266, 16, 320),
      ...run(264, 2, 590),
    ];
    scribe(field, points, SIZE, ANGLE, 1, 1);
    const slow = meanFilm(field, 120, 280);
    const fast = meanFilm(field, 380, 540);
    expect(fast).toBeLessThan(slow * 0.8);
  });

  it("beads where a charged nib first touches down", () => {
    const field = fieldOver(900, 120);
    scribe(field, run(800, 4), SIZE, ANGLE, 1, 1);
    const touch = meanFilm(field, 20, 34);
    const cruise = meanFilm(field, 300, 500);
    expect(touch).toBeGreaterThan(cruise * 1.2);
  });

  it("is drunk faster by a thirsty sheet, so the same dip writes less on paper", () => {
    const onSolid = fieldOver(1500, 120);
    const onCold = createQuillField({
      x: 0,
      y: 0,
      width: 1500,
      height: 120,
      cell: 1,
      ground: sheet("cold"),
      wick: 0,
    });
    const points = run(1400, 3);
    scribe(onSolid, points, SIZE, ANGLE, 0.5, 1);
    scribe(onCold, points, SIZE, ANGLE, 0.5, 1);
    expect(meanFilm(onCold, 1150, 1350)).toBeLessThan(
      meanFilm(onSolid, 1150, 1350) * 0.75,
    );
  });

  it("still scratches a broken trace when nearly empty, not a pale ribbon", () => {
    const field = createQuillField({
      x: 0,
      y: 0,
      width: 400,
      height: 120,
      cell: 1,
      ground: sheet("rough"),
      wick: 0,
    });
    scribe(field, run(340, 3), SIZE, ANGLE, 0.08, 1);
    expect(inkCoverage(field, 0.1)).toBeLessThan(0.5);
  });
});

describe("the gesture in flight", () => {
  it("walked sample by sample, lays the film one whole walk would", () => {
    const points = run(700, 3);
    const whole = fieldOver(800, 140);
    scribe(whole, points, SIZE, ANGLE, 0.7, 1);

    const grown = fieldOver(800, 140);
    const state = openScribe(grown, SIZE, ANGLE, 0.7);
    for (let n = 1; n <= points.length; n += 2) {
      advanceScribe(state, points.slice(0, n));
    }
    if (state.points.length !== points.length) {
      advanceScribe(state, points.slice());
    }

    const a = inked(whole);
    const b = inked(grown);
    let worst = 0;
    for (let i = 0; i < a.length; i++) {
      worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
    }
    expect(worst).toBeLessThan(0.001);
  });

  it("carries the lift pool on the tail, so it follows the pen and settles at the lift", () => {
    const points = run(700, 3);
    const state = openScribe(fieldOver(800, 140), SIZE, ANGLE, 1);
    advanceScribe(state, points.slice(0, 100));
    // The pool rides the provisional tail: it is in the undo log, never in
    // the settled film, so the next advance takes it back out and the walk
    // settles further in.
    expect(state.undo.length).toBeGreaterThan(0);
    const settled = state.settled;
    advanceScribe(state, points.slice(0, 110));
    expect(state.undo.length).toBeGreaterThan(0);
    expect(state.settled).toBeGreaterThan(settled);
  });
});

// --- What a repaint costs ----------------------------------------------------

let dom: ReturnType<typeof withFakeDocument>;
let ctx: FakeContext;

beforeEach(() => {
  forgetDriedInk();
  dom = withFakeDocument();
  ctx = createFakeContext();
});

afterEach(() => {
  dom.restore();
  vi.unstubAllGlobals();
});

/** How many simulations have actually been flushed to pixels — a blit of a
 *  held mark writes no image data, so this is the bill. */
function flushes(): number {
  return dom.created.reduce(
    (count, canvas) => count + (canvas.ctx.calls.putImageData ?? 0),
    0,
  );
}

describe("the dried-mark store", () => {
  it("works a landed mark out once and blits it thereafter", () => {
    const points = run(300, 3);
    expect(paintSimulatedInk(ctx, points, SIZE)).toBe(true);
    const cost = flushes();
    expect(cost).toBeGreaterThan(0);
    expect(paintSimulatedInk(ctx, points, SIZE)).toBe(true);
    expect(paintSimulatedInk(ctx, points, SIZE)).toBe(true);
    expect(flushes()).toBe(cost);
  });

  it("dries the same path again when the ink or the page changes", () => {
    const points = run(300, 3);
    paintSimulatedInk(ctx, points, SIZE);
    const one = flushes();
    paintSimulatedInk(ctx, points, SIZE, 1, ANGLE, 1, SOLID_GROUND, "#aa2200");
    expect(flushes()).toBeGreaterThan(one);
  });

  it("promotes the gesture in hand at the lift instead of walking it again", () => {
    const points = run(600, 3);
    // The gesture grows live…
    for (let n = 4; n <= points.length; n += 4) {
      expect(
        paintInk(
          ctx,
          points.slice(0, n),
          SIZE,
          1,
          ANGLE,
          1,
          SOLID_GROUND,
          "#000000",
          "#ffffff",
          true,
        ),
      ).toBeUndefined();
    }
    const live = flushes();
    // …and the landed ask for the finished path is a promotion, not a second
    // walk: at most one small patch for the tail the last live frame had not
    // seen yet, never the whole mark again.
    const landed = points.slice();
    expect(paintSimulatedInk(ctx, landed, SIZE)).toBe(true);
    const lifted = flushes();
    expect(lifted).toBeLessThanOrEqual(live + 1);
    // A later repaint of the landed mark is a blit of the promoted pixels.
    expect(paintSimulatedInk(ctx, landed, SIZE)).toBe(true);
    expect(flushes()).toBe(lifted);
  });
});

describe("the fall-through", () => {
  it("draws the flat nib where no field can run, at the reservoir's pallor", () => {
    dom.restore();
    vi.unstubAllGlobals();
    const bare = createFakeContext();
    paintInk(bare, run(120, 3), SIZE, 1, ANGLE, 0.3);
    // The flat quads were filled…
    expect(bare.calls.fill ?? 0).toBeGreaterThan(0);
    // …and the borrowed alpha was put back.
    expect(bare.globalAlpha).toBe(1);
  });

  it("never opens a field for a hairline", () => {
    expect(paintSimulatedInk(ctx, run(120, 3), SIZE, 0.02)).toBe(false);
    expect(paintSimulatedInk(ctx, run(120, 3), 1)).toBe(false);
  });
});
