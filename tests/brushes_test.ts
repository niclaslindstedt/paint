// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stylistic painters, checked through the geometry they emit.
//
// Most of what makes a brush read as a brush is texture, and texture is not
// something a test can assert on without pixels. The calligraphy nib is the
// exception: it is plain geometry — a run of quads filled in one pass — and
// that one pass is filled by the nonzero rule, so the *direction* each quad is
// wound decides whether an overlap paints or cancels. That is testable, and it
// is the difference between a doubled-back stroke and a hole in the drawing.

import { describe, expect, it } from "vitest";

import { paintCalligraphy, paintRegion } from "../src/app/plugins/brushes.ts";
import type { Point } from "../src/app/types.ts";

import { createFakeContext } from "./support/fakeCanvas.ts";

/** A 2D context that records the path it is given, split into subpaths. */
function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  subpaths: Point[][];
} {
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  const ctx = {
    globalAlpha: 1,
    lineWidth: 1,
    beginPath() {
      subpaths.length = 0;
      current = [];
    },
    moveTo(x: number, y: number) {
      current = [{ x, y }];
      subpaths.push(current);
    },
    lineTo(x: number, y: number) {
      current.push({ x, y });
    },
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, subpaths };
}

/** Twice the signed area of a polygon: positive one way round, negative the
 *  other. Its sign is the winding the canvas's nonzero rule counts with. */
function signedArea(loop: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

describe("the calligraphy nib", () => {
  /** The stroke that showed the bug: up the page and back down over itself,
   *  the way a stylistic `l` is drawn. */
  const doubledBack: Point[] = [
    { x: 100, y: 300 },
    { x: 100, y: 200 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 100, y: 300 },
  ];

  it("winds every quad the same way when a stroke doubles back", () => {
    const { ctx, subpaths } = recordingContext();
    paintCalligraphy(ctx, doubledBack, 12);

    const areas = subpaths.map(signedArea).filter((area) => area !== 0);
    expect(areas.length).toBeGreaterThan(1);
    // A mixture of signs is exactly what cancels under the nonzero rule, and
    // the hole it leaves is what read as the nib erasing the stroke beneath it.
    expect(areas.every((area) => area > 0)).toBe(true);
  });

  it("winds them the same way whichever direction the stroke runs", () => {
    for (const points of [
      doubledBack,
      [...doubledBack].reverse(),
      // Across the nib rather than along it, and back.
      [
        { x: 100, y: 100 },
        { x: 220, y: 100 },
        { x: 100, y: 100 },
      ],
      // A loop that crosses itself.
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
        { x: 150, y: 100 },
        { x: 150, y: 250 },
      ],
    ]) {
      const { ctx, subpaths } = recordingContext();
      paintCalligraphy(ctx, points, 12);
      const areas = subpaths.map(signedArea).filter((area) => area !== 0);
      expect(areas.every((area) => area > 0)).toBe(true);
    }
  });

  it("still lays a nib-shaped quad down per step", () => {
    const { ctx, subpaths } = recordingContext();
    paintCalligraphy(ctx, doubledBack, 12);
    expect(subpaths.length).toBeGreaterThan(0);
    for (const loop of subpaths) expect(loop).toHaveLength(4);
  });
});

describe("a feathered fill", () => {
  /** A square area, as the bucket would have traced it. */
  const square: Point[][] = [
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  ];

  it("is a hard edge until it is asked for one", () => {
    const ctx = createFakeContext();
    paintRegion(ctx, square);
    // One fill, no skirt: the mark a bucket has always left.
    expect(ctx.strokes).toHaveLength(0);
    expect(ctx.calls.fill).toBe(1);
  });

  it("lays a skirt that widens as it fades", () => {
    const ctx = createFakeContext();
    ctx.globalAlpha = 1;
    paintRegion(ctx, square, 8);
    expect(ctx.strokes.length).toBeGreaterThan(1);
    // Widest and faintest first, so each pass lands inside the last: that
    // ordering *is* the ramp from the page to the solid fill.
    for (let i = 1; i < ctx.strokes.length; i++) {
      expect(ctx.strokes[i]!.lineWidth).toBeLessThan(
        ctx.strokes[i - 1]!.lineWidth,
      );
      expect(ctx.strokes[i]!.alpha).toBeGreaterThan(ctx.strokes[i - 1]!.alpha);
    }
    // The widest pass is centred on the outline, so it reaches a feather past
    // it and no further.
    expect(ctx.strokes[0]!.lineWidth).toBeCloseTo(16);
    // …and the solid fill still goes down over the top of it.
    expect(ctx.calls.fill).toBe(1);
  });

  it("fades a fraction of the ink, so a wash feathers translucently", () => {
    const ctx = createFakeContext();
    ctx.globalAlpha = 0.5;
    paintRegion(ctx, square, 8);
    for (const pass of ctx.strokes) expect(pass.alpha).toBeLessThan(0.5);
    // And the ink is left as it was found, for the fill that follows.
    expect(ctx.globalAlpha).toBe(0.5);
  });

  it("skips a fade the screen is too far away to show", () => {
    const ctx = createFakeContext();
    // Pulled back until eight document pixels of skirt is a fraction of one
    // device pixel: four passes of the same outline, for nothing.
    paintRegion(ctx, square, 8, 0.02);
    expect(ctx.strokes).toHaveLength(0);
    expect(ctx.calls.fill).toBe(1);
  });
});
