// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paintbrush's paint: the head, the reservoir, and what a stroke costs.
//
// The quill's test file one shelf along, because it is the quill's
// architecture at a third thickness of medium. The walk's claims are the
// brush's: one head is the round and the flat both (the projection), a drag
// spends its dip and runs dry — sooner on paper that drinks — and what a
// starving head still catches is the sheet's own grain. The economies are the
// ones the frame rate rests on: a landed mark is worked out once and blitted
// thereafter, the gesture in flight is walked incrementally to the *same*
// film a single walk would lay, and the lift of a finished stroke is a
// promotion rather than a second walk. And when none of it can run, the
// vector painter still draws.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groundProfile, SOLID_GROUND } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import {
  bearing,
  catching,
  createBristleField,
  paintCoverage,
  painted,
  settling,
  type BristleField,
} from "../src/app/plugins/bristleField.ts";
import {
  advanceDrag,
  drag,
  forgetDriedPaint,
  openDrag,
  paintBristle,
  paintDryness,
  paintFlow,
  paintSimulatedPaint,
  projected,
} from "../src/app/plugins/bristleSim.ts";
import type { Point } from "../src/app/types.ts";
import {
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

const SIZE = 36;

function sheet(stock?: string): GroundProfile {
  return stock ? groundProfile({ stock }) : SOLID_GROUND;
}

function fieldOver(
  width: number,
  height: number,
  ground: GroundProfile = SOLID_GROUND,
): BristleField {
  return createBristleField({
    x: 0,
    y: 0,
    width,
    height,
    cell: 1,
    ground,
    wick: 0,
  });
}

/** A straight stroke along `y = 70`, sampled the way the canvas stores one:
 *  the gap between points *is* the hand's speed. */
function run(length: number, gap: number, from = 30): Point[] {
  const points: Point[] = [];
  for (let x = from; x <= from + length; x += gap) {
    points.push({ x, y: 70 });
  }
  return points;
}

/** Mean film over a column window of the band. */
function meanFilm(field: BristleField, x0: number, x1: number): number {
  const film = painted(field);
  let sum = 0;
  let n = 0;
  for (let y = 45; y < 95; y++) {
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

describe("the head", () => {
  it("is the round and the flat both, by projection", () => {
    // A round lays its width whichever way the path runs…
    expect(projected(18, 1, 1, 0)).toBeCloseTo(18);
    expect(projected(18, 1, 0, 1)).toBeCloseTo(18);
    expect(projected(18, 1, 0.7071, 0.7071)).toBeCloseTo(18, 3);
    // …a flat lays its full width square across itself, closes to the
    // blade's own thickness along its edge, and swells between the two.
    expect(projected(18, 0.14, 1, 0)).toBeCloseTo(18);
    expect(projected(18, 0.14, 0, 1)).toBeCloseTo(18 * 0.14, 3);
    const diagonal = projected(18, 0.14, 0.7071, 0.7071);
    expect(diagonal).toBeGreaterThan(18 * 0.14);
    expect(diagonal).toBeLessThan(18);
  });

  it("lays a band as wide as the projection says on the page", () => {
    // Straight down the page with the blade at -45°: about cos 45° of the
    // head, plus the blade's own body.
    const field = fieldOver(500, 300);
    const points: Point[] = [];
    for (let y = 30; y <= 270; y += 3) points.push({ x: 250, y });
    drag(field, points, SIZE, 1, -Math.PI / 4, 1, 1, 1);
    const film = painted(field);
    let left = Infinity;
    let right = -Infinity;
    for (let x = 0; x < 500; x++) {
      if (film[150 * field.width + x]! > 0.05) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    const band = right - left;
    expect(band).toBeGreaterThan(SIZE * 0.55);
    expect(band).toBeLessThan(SIZE * 0.9);
  });

  it("bears down across the section like a cone, and like a blade squared off", () => {
    // A round curves away from the paper toward its rim, so what it lays
    // falls off across the band and the two sides of the mark are not ruled.
    expect(bearing(0, 1)).toBeCloseTo(1);
    expect(bearing(0.5, 1)).toBeCloseTo(1);
    expect(bearing(0.95, 1)).toBeLessThan(0.5);
    expect(bearing(1, 1)).toBeCloseTo(0);
    // A chisel ferrule is cut square: every hair along the blade meets the
    // sheet with the same length of hair behind it, all the way to the rim.
    for (const u of [0, 0.5, 0.95, 1]) expect(bearing(u, 0)).toBe(1);
    // …and the filbert between them keeps some of each.
    expect(bearing(0.95, 0.5)).toBeGreaterThan(bearing(0.95, 1));
    expect(bearing(0.95, 0.5)).toBeLessThan(1);
  });
});

describe("the two ends of a mark", () => {
  /** How far past `endX` the mark reaches along the row the path ran down. */
  function past(field: BristleField, endX: number, y = 70): number {
    const film = painted(field);
    let far = 0;
    for (let x = endX; x < field.width; x++) {
      if (film[y * field.width + x]! > 0.02) far = x - endX;
    }
    return far;
  }

  it("does not stamp the head's own print at the head of a stroke", () => {
    // A swept touch-down takes the sheet with part of the bundle and opens to
    // the ferrule over the first stretch — so the mark does *not* begin with
    // a disc the diameter of the brush, which is wider than the stroke it
    // would be starting.
    const field = fieldOver(600, 200);
    drag(field, run(400, 14), SIZE, 0, 0, 1, 1, 1);
    const film = painted(field);
    const across = (x: number) => {
      let n = 0;
      for (let y = 0; y < 200; y++) if (film[y * 600 + x]! > 0.02) n++;
      return n;
    };
    // The entry is narrower than the body it opens into…
    expect(across(32)).toBeLessThan(across(200) * 0.85);
    // …and nothing reaches a half-head back behind where the hand touched.
    let behind = 0;
    for (let x = 0; x < 30; x++) if (across(x) > 0) behind = 30 - x;
    expect(behind).toBeLessThan(SIZE * 0.4);
  });

  it("draws the lift out into trailing hairs rather than closing it", () => {
    const field = fieldOver(600, 200);
    const points = run(400, 14);
    drag(field, points, SIZE, 0, 0, 1, 1, 1);
    const end = points[points.length - 1]!.x;
    // Something carries on past the last point the hand reached — the hairs
    // are bent backwards by then and come off the sheet still bent…
    expect(past(field, end)).toBeGreaterThan(2);
    // …and it is a fan out of the middle, not the whole width of the head:
    // the band has already narrowed by the time the hand let go.
    const film = painted(field);
    const wide = (x: number) => {
      let n = 0;
      for (let y = 0; y < 200; y++) if (film[y * 600 + x]! > 0.02) n++;
      return n;
    };
    expect(wide(end - 2)).toBeLessThan(wide(end - Math.round(SIZE)) * 0.9);
  });

  it("prints the whole head for a press, and the same print when it jitters", () => {
    // A finger resting on the glass never holds still. The mark it leaves has
    // to be the mark a still one leaves — a press that shifted two pixels used
    // to lose its whole blot, and before that a quarter of it as a wedge.
    const still = fieldOver(300, 300);
    drag(still, [{ x: 150, y: 150 }], SIZE, 0, 0, 1, 1, 1);
    const moved = fieldOver(300, 300);
    drag(
      moved,
      [
        { x: 150, y: 150 },
        { x: 151, y: 151 },
        { x: 150, y: 152 },
      ],
      SIZE,
      0,
      0,
      1,
      1,
      1,
    );
    const a = painted(still);
    const b = painted(moved);
    let inked = 0;
    let lost = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i]! > 0.02) inked++;
      if (a[i]! > 0.02 && b[i]! <= 0.02) lost++;
    }
    // A press prints the head: a disc about as wide as the ferrule.
    expect(inked).toBeGreaterThan(Math.PI * (SIZE / 2) ** 2 * 0.6);
    // …and the jittered one is the same mark, give or take its rim.
    expect(lost / inked).toBeLessThan(0.15);
  });
});

describe("the paper", () => {
  it("takes fully from a wet head and only its high ground from a dry one", () => {
    // A wet head bridges the whole relief — bar the meniscus shoulder over
    // the very deepest dips, which is an edge and not a refusal.
    expect(catching(0.5, 0)).toBe(1);
    expect(catching(0.1, 0)).toBe(1);
    expect(catching(0.9, 0)).toBeGreaterThan(0.5);
    // A starving one only reaches the high ground.
    expect(catching(0.9, 1)).toBe(0);
    expect(catching(0.5, 1)).toBe(0);
    expect(catching(0.05, 1)).toBeGreaterThan(0);
  });

  it("settles a wet film into its dips, gently", () => {
    const relief = 0.7;
    expect(settling(0.7, 1, relief)).toBeGreaterThan(1);
    expect(settling(0.05, 1, relief)).toBeLessThan(1);
    // Gently: body paint is dense, so the swing that shades an ink would
    // print as seams here (see `SETTLE` in `bristleField.ts`).
    expect(settling(1, 1.4, relief)).toBeLessThanOrEqual(1.45);
    expect(settling(0, 1.4, relief)).toBeGreaterThanOrEqual(0.55);
  });

  it("breaks a starved drag up on the tooth rather than fading it", () => {
    const field = createBristleField({
      x: 0,
      y: 0,
      width: 440,
      height: 160,
      cell: 1,
      ground: sheet("rough"),
      wick: 0,
    });
    drag(field, run(340, 3), SIZE, 0, 0, 1, 0.08, 1);
    expect(paintCoverage(field, 0.1)).toBeLessThan(0.35);
  });
});

describe("the reservoir", () => {
  it("flows freely while charged and starves towards empty", () => {
    expect(paintFlow(1)).toBe(1);
    expect(paintFlow(0.6)).toBe(1);
    expect(paintFlow(0.2)).toBeLessThan(paintFlow(0.4));
    expect(paintFlow(0)).toBeGreaterThan(0.1);
    expect(paintDryness(1)).toBe(0);
    expect(paintDryness(0.6)).toBe(0);
    expect(paintDryness(0.1)).toBeGreaterThan(0);
    expect(paintDryness(0)).toBe(1);
  });

  it("spends itself along the stroke: a low dip thins and gives out", () => {
    const field = fieldOver(2000, 160);
    drag(field, run(1900, 3), SIZE, 0, 0, 1, 0.4, 1);
    const head = meanFilm(field, 100, 300);
    const tail = meanFilm(field, 1600, 1800);
    expect(tail).toBeLessThan(head * 0.35);
  });

  it("shades with the hand: a fast sweep lays less than a slow one", () => {
    const field = fieldOver(1000, 160);
    const points = [
      ...run(266, 2, 50),
      ...run(266, 16, 320),
      ...run(264, 2, 590),
    ];
    drag(field, points, SIZE, 0, 0, 1, 1, 1);
    const slow = meanFilm(field, 120, 280);
    const fast = meanFilm(field, 380, 540);
    expect(fast).toBeLessThan(slow * 0.8);
  });

  it("is drunk faster by a thirsty sheet, so the same dip runs less on paper", () => {
    const onSolid = fieldOver(2000, 160);
    const onCold = createBristleField({
      x: 0,
      y: 0,
      width: 2000,
      height: 160,
      cell: 1,
      ground: sheet("cold"),
      wick: 0,
    });
    const points = run(1900, 3);
    drag(onSolid, points, SIZE, 0, 0, 1, 0.4, 1);
    drag(onCold, points, SIZE, 0, 0, 1, 0.4, 1);
    expect(meanFilm(onCold, 800, 1000)).toBeLessThan(
      meanFilm(onSolid, 800, 1000) * 0.75,
    );
  });

  it("runs about half as far squeezed flat, off the same dip", () => {
    const round = fieldOver(2000, 200);
    const flat = fieldOver(2000, 200);
    const points = run(1900, 3);
    drag(round, points, SIZE, 0, 0, 1, 0.5, 1);
    drag(flat, points, SIZE, 1, 0, 1, 0.5, 1);
    // The blade lies across the travel here (angle 0, path along x), so it
    // lays its full width — off a reservoir the ferrule squeezed in half.
    expect(meanFilm(flat, 900, 1100)).toBeLessThan(
      meanFilm(round, 900, 1100) * 0.8,
    );
  });
});

describe("the gesture in flight", () => {
  it("walked sample by sample, lays the film one whole walk would", () => {
    const points: Point[] = [];
    for (let d = 0; d <= 600; d += 3) {
      points.push({ x: 30 + d * 0.9, y: 150 + 70 * Math.sin(d / 55) });
    }
    for (const [flatness, angle, load] of [
      [0, 0, 1],
      [1, -Math.PI / 4, 0.7],
    ] as const) {
      const spec = {
        x: 0,
        y: 0,
        width: 640,
        height: 320,
        cell: 1,
        ground: sheet("cold"),
        wick: 0.45,
      };
      const whole = createBristleField(spec);
      drag(whole, points, SIZE, flatness, angle, 1, load, 1);

      const grown = createBristleField(spec);
      const state = openDrag(grown, SIZE, flatness, angle, 1, load);
      for (let n = 1; n <= points.length; n += 3) {
        advanceDrag(state, points.slice(0, n));
      }
      if (state.points.length !== points.length) {
        advanceDrag(state, points.slice());
      }

      const a = painted(whole);
      const b = painted(grown);
      let worst = 0;
      for (let i = 0; i < a.length; i++) {
        worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
      }
      expect(worst).toBeLessThan(0.001);
    }
  });

  it("keeps the leaving hairs on the tail, and settles as the end moves on", () => {
    const points = run(700, 3);
    const state = openDrag(fieldOver(800, 200), SIZE, 0, 0, 1, 1);
    advanceDrag(state, points.slice(0, 100));
    // The lift's raggedness rides the provisional tail: it is in the undo
    // log, never in the settled film, so the next advance takes it back out
    // and the walk settles further in.
    expect(state.undo.length).toBeGreaterThan(0);
    const settled = state.settled;
    advanceDrag(state, points.slice(0, 130));
    expect(state.undo.length).toBeGreaterThan(0);
    expect(state.settled).toBeGreaterThan(settled);
  });
});

// --- What a repaint costs ----------------------------------------------------

let dom: ReturnType<typeof withFakeDocument>;
let ctx: FakeContext;

beforeEach(() => {
  forgetDriedPaint();
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
    expect(paintSimulatedPaint(ctx, points, SIZE)).toBe(true);
    const cost = flushes();
    expect(cost).toBeGreaterThan(0);
    expect(paintSimulatedPaint(ctx, points, SIZE)).toBe(true);
    expect(paintSimulatedPaint(ctx, points, SIZE)).toBe(true);
    expect(flushes()).toBe(cost);
  });

  it("dries the same path again when the head or the ink changes", () => {
    const points = run(300, 3);
    paintSimulatedPaint(ctx, points, SIZE);
    const one = flushes();
    paintSimulatedPaint(ctx, points, SIZE, 1, 0.55);
    const two = flushes();
    expect(two).toBeGreaterThan(one);
    paintSimulatedPaint(
      ctx,
      points,
      SIZE,
      1,
      0,
      0,
      1,
      1,
      SOLID_GROUND,
      "#aa2200",
    );
    expect(flushes()).toBeGreaterThan(two);
  });

  it("promotes the gesture in hand at the lift instead of walking it again", () => {
    const points = run(600, 3);
    // The gesture grows live…
    for (let n = 4; n <= points.length; n += 4) {
      paintBristle(ctx, points.slice(0, n), SIZE, { live: true });
    }
    const live = flushes();
    expect(live).toBeGreaterThan(0);
    // …and the landed ask for the finished path is a promotion, not a second
    // walk: at most one small patch for the tail the last live frame had not
    // seen yet, never the whole mark again.
    const landed = points.slice();
    expect(paintSimulatedPaint(ctx, landed, SIZE)).toBe(true);
    const lifted = flushes();
    expect(lifted).toBeLessThanOrEqual(live + 1);
    // A later repaint of the landed mark is a blit of the promoted pixels.
    expect(paintSimulatedPaint(ctx, landed, SIZE)).toBe(true);
    expect(flushes()).toBe(lifted);
  });
});

describe("the fall-through", () => {
  it("hands a landed mark no field can draw to the vector painter", () => {
    dom.restore();
    vi.unstubAllGlobals();
    const bare = createFakeContext();
    paintBristle(bare, run(120, 3), SIZE, { load: 0.6 });
    // The hairs were stroked…
    expect(bare.calls.stroke ?? 0).toBeGreaterThan(0);
    // …and the borrowed alpha was put back.
    expect(bare.globalAlpha).toBe(1);
  });

  it("draws a live gesture it cannot field as a plain line, not stale hairs", () => {
    dom.restore();
    vi.unstubAllGlobals();
    const bare = createFakeContext();
    paintBristle(bare, run(120, 3), SIZE, { live: true });
    // One path, not a head of them: the vector painter's texture is fitted
    // to the whole mark, which is exactly what a growing gesture repainted a
    // patch at a time cannot use (see `PaintPlugin.grows`).
    expect(bare.calls.stroke ?? 0).toBe(1);
    expect(bare.globalAlpha).toBe(1);
  });

  it("never opens a field for a hairline", () => {
    expect(paintSimulatedPaint(ctx, run(120, 3), SIZE, 0.01)).toBe(false);
    expect(paintSimulatedPaint(ctx, run(120, 3), 1)).toBe(false);
  });
});
