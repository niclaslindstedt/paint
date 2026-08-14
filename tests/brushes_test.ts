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

import { paintCalligraphy } from "../src/app/plugins/brushes.ts";
import type { Point } from "../src/app/types.ts";

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
