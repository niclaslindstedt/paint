// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  isRectangular,
  reshapeRegion,
  selectionHandles,
} from "../src/app/selectHandles.ts";
import { boxRegion, type SelectionRegion } from "../src/app/selection.ts";
import type { Point } from "../src/app/types.ts";

// Grips on the outline itself, and the bend dragging one puts in it (see
// `selectHandles.ts`). Pure geometry, so a whole adjustment drives here with no
// canvas: contours and a spacing in, grips out; a grip and a place to put it
// in, a bent contour out.

/** A circle as a polyline, which is what a lasso or a traced ring arrives as. */
const circle = (radius: number, steps = 64): readonly Point[] =>
  Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });

/** An L: five right angles and one reflex one, all of them corners. */
const ell: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 40, y: 40 },
  { x: 40, y: 100 },
  { x: 0, y: 100 },
];

describe("isRectangular", () => {
  it("knows a box marquee's window", () => {
    expect(
      isRectangular(boxRegion({ x: 5, y: 7, width: 40, height: 30 })),
    ).toBe(true);
  });

  it("allows the repeated closing point", () => {
    const box = boxRegion({ x: 0, y: 0, width: 10, height: 10 })[0]!;
    expect(isRectangular([[...box, { ...box[0]! }]])).toBe(true);
  });

  it("knows a lasso is not one", () => {
    expect(isRectangular([circle(50)])).toBe(false);
  });

  it("knows a rotated rectangle is not one", () => {
    expect(
      isRectangular([
        [
          { x: 0, y: 10 },
          { x: 10, y: 0 },
          { x: 20, y: 10 },
          { x: 10, y: 20 },
        ],
      ]),
    ).toBe(false);
  });

  it("knows a window in two pieces is not one", () => {
    expect(
      isRectangular([
        ...boxRegion({ x: 0, y: 0, width: 10, height: 10 }),
        ...boxRegion({ x: 40, y: 0, width: 10, height: 10 }),
      ]),
    ).toBe(false);
  });
});

describe("selectionHandles", () => {
  it("puts a grip on every sharp corner of an outline", () => {
    const grips = selectionHandles([ell], 30);
    const corners = grips.filter((grip) => grip.corner).map((grip) => grip.at);
    for (const corner of ell) {
      expect(corners).toContainEqual(corner);
    }
  });

  it("spaces the rest along the line", () => {
    const grips = selectionHandles([circle(200)], 40);
    // A circle of radius 200 is about 1257 long, so roughly thirty grips at a
    // spacing of forty — and no two of them on top of each other.
    expect(grips.length).toBeGreaterThan(20);
    const seen = new Set(grips.map((grip) => grip.index));
    expect(seen.size).toBe(grips.length);
  });

  it("puts them on the outline and nowhere else", () => {
    const loop = circle(120);
    for (const grip of selectionHandles([loop], 40)) {
      expect(loop[grip.index]).toEqual(grip.at);
    }
  });

  it("thins out as the picture is zoomed out", () => {
    const loop = [circle(200)];
    const near = selectionHandles(loop, 20);
    const far = selectionHandles(loop, 120);
    expect(far.length).toBeLessThan(near.length);
  });

  it("leaves specks alone", () => {
    // A three-pixel crumb picked up by a colour select is not a thing anybody
    // adjusts by hand.
    expect(selectionHandles([circle(1.5)], 40)).toEqual([]);
  });

  it("never puts more grips on the page than a hand can use", () => {
    const many: SelectionRegion = Array.from({ length: 40 }, (_, i) =>
      circle(60).map((p) => ({ x: p.x + i * 200, y: p.y })),
    );
    expect(selectionHandles(many, 20).length).toBeLessThanOrEqual(64);
  });

  it("keeps the corners when the cap bites", () => {
    const many: SelectionRegion = Array.from({ length: 40 }, (_, i) =>
      ell.map((p) => ({ x: p.x + i * 200, y: p.y })),
    );
    const grips = selectionHandles(many, 20);
    expect(grips.every((grip) => grip.corner)).toBe(true);
  });
});

describe("reshapeRegion", () => {
  const loop = circle(100, 64);

  it("puts the grip exactly where the finger is", () => {
    const bent = reshapeRegion(
      [loop],
      { loop: 0, index: 0 },
      { x: 140, y: 0 },
      50,
    );
    expect(bent[0]![0]).toEqual({ x: 140, y: 0 });
  });

  it("keeps every point of the outline", () => {
    const bent = reshapeRegion(
      [loop],
      { loop: 0, index: 0 },
      { x: 140, y: 0 },
      50,
    );
    // A grip's address has to stay good for the whole drag, so the bend moves
    // points and never adds or drops one.
    expect(bent[0]).toHaveLength(loop.length);
  });

  it("carries the neighbours less and less", () => {
    const bent = reshapeRegion(
      [loop],
      { loop: 0, index: 0 },
      { x: 140, y: 0 },
      100,
    );
    const moved = (i: number) =>
      Math.hypot(bent[0]![i]!.x - loop[i]!.x, bent[0]![i]!.y - loop[i]!.y);
    expect(moved(0)).toBeCloseTo(40, 5);
    expect(moved(1)).toBeLessThan(moved(0));
    expect(moved(2)).toBeLessThan(moved(1));
  });

  it("leaves the far side of the loop exactly where it was", () => {
    const bent = reshapeRegion(
      [loop],
      { loop: 0, index: 0 },
      { x: 140, y: 0 },
      50,
    );
    // Half way round is far past one reach, so nothing there has moved.
    expect(bent[0]![32]).toEqual(loop[32]);
  });

  it("feels the pull from both ways round a closed loop", () => {
    const bent = reshapeRegion(
      [loop],
      { loop: 0, index: 0 },
      { x: 140, y: 0 },
      100,
    );
    // The point *before* the grip is as near it as the one after: a loop has no
    // end for a bend to stop dead at.
    const before = bent[0]![loop.length - 1]!;
    const after = bent[0]![1]!;
    expect(before.x - loop[loop.length - 1]!.x).toBeCloseTo(
      after.x - loop[1]!.x,
      5,
    );
  });

  it("leaves the other contours alone", () => {
    const region: SelectionRegion = [loop, circle(30)];
    const bent = reshapeRegion(
      region,
      { loop: 0, index: 0 },
      { x: 140, y: 0 },
      50,
    );
    expect(bent[1]).toBe(region[1]);
  });

  it("hands the window back when nothing moved", () => {
    const region: SelectionRegion = [loop];
    expect(reshapeRegion(region, { loop: 0, index: 0 }, loop[0]!, 50)).toBe(
      region,
    );
  });

  it("hands the window back for a grip that is not there", () => {
    const region: SelectionRegion = [loop];
    expect(
      reshapeRegion(region, { loop: 3, index: 0 }, { x: 0, y: 0 }, 50),
    ).toBe(region);
  });
});
