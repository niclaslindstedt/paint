// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  combineRegion,
  fillGap,
  fillRegion,
  maskFor,
  maskRegion,
  stampPath,
} from "../src/app/regionMask.ts";
import { regionHolds } from "../src/app/selection.ts";
import type { Point } from "../src/app/types.ts";

// The raster half of the selection pencil: a selection's contours filled into a
// bitmap, a stroke stamped over them, and the result traced back out. The
// whole pipeline is pure — buffers in, points out — so a gesture's worth of
// region arithmetic can be held to account here with no canvas anywhere.

const square = (
  x: number,
  y: number,
  w: number,
  h: number,
): readonly Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe("maskFor / fillRegion / maskRegion", () => {
  it("round-trips a square through the mask within a pixel", () => {
    const region = [square(10, 10, 40, 40)];
    const made = maskFor({ x: 10, y: 10, width: 40, height: 40 }, 4)!;
    fillRegion(made.mask, made.frame, region);
    const out = maskRegion(made.mask, made.frame)!;
    expect(out).toHaveLength(1);
    // The traced outline is the raster's read of the same square: every corner
    // of it within a cell of where the geometry put it.
    for (const p of [
      { x: 10, y: 10 },
      { x: 50, y: 50 },
    ]) {
      const near = out[0]!.some(
        (q) => Math.abs(q.x - p.x) <= 1.5 && Math.abs(q.y - p.y) <= 1.5,
      );
      expect(near).toBe(true);
    }
    expect(regionHolds(out, { x: 30, y: 30 })).toBe(true);
    expect(regionHolds(out, { x: 5, y: 30 })).toBe(false);
  });

  it("keeps a hole a hole — the even-odd read the selection is painted with", () => {
    // A loop inside a loop is a hole in the window, so the fill must leave the
    // island empty and the trace must hand the island's outline back.
    const region = [square(0, 0, 60, 60), square(20, 20, 20, 20)];
    const made = maskFor({ x: 0, y: 0, width: 60, height: 60 }, 4)!;
    fillRegion(made.mask, made.frame, region);
    const out = maskRegion(made.mask, made.frame)!;
    expect(out.length).toBe(2);
    expect(regionHolds(out, { x: 10, y: 30 })).toBe(true);
    expect(regionHolds(out, { x: 30, y: 30 })).toBe(false);
  });

  it("answers null for a mask nothing was filled into", () => {
    const made = maskFor({ x: 0, y: 0, width: 20, height: 20 }, 2)!;
    expect(maskRegion(made.mask, made.frame)).toBeNull();
  });
});

describe("stampPath", () => {
  it("stamps a dab for a single point", () => {
    const made = maskFor({ x: 0, y: 0, width: 40, height: 40 }, 8)!;
    stampPath(made.mask, made.frame, [{ x: 20, y: 20 }], 6, 1);
    const out = maskRegion(made.mask, made.frame)!;
    expect(regionHolds(out, { x: 20, y: 20 })).toBe(true);
    expect(regionHolds(out, { x: 20, y: 24 })).toBe(true);
    expect(regionHolds(out, { x: 20, y: 30 })).toBe(false);
  });

  it("leaves no gaps between far-apart samples", () => {
    // Two pointer samples forty pixels apart are one continuous capsule: the
    // walk between them is the stamp's own, not the pointer's.
    const made = maskFor({ x: 0, y: 0, width: 60, height: 20 }, 8)!;
    stampPath(
      made.mask,
      made.frame,
      [
        { x: 5, y: 10 },
        { x: 45, y: 10 },
      ],
      4,
      1,
    );
    const out = maskRegion(made.mask, made.frame)!;
    expect(out).toHaveLength(1);
    for (let x = 5; x <= 45; x += 5) {
      expect(regionHolds(out, { x, y: 10 })).toBe(true);
    }
  });
});

describe("combineRegion", () => {
  it("adds a stroke's capsule to the selection as it stands", () => {
    const base = [square(0, 0, 20, 20)];
    const out = combineRegion(
      base,
      [
        { x: 30, y: 10 },
        { x: 50, y: 10 },
      ],
      5,
      false,
    )!;
    // Both areas are held, and they are two islands — the stroke never touched
    // the square.
    expect(out.length).toBe(2);
    expect(regionHolds(out, { x: 10, y: 10 })).toBe(true);
    expect(regionHolds(out, { x: 40, y: 10 })).toBe(true);
    expect(regionHolds(out, { x: 25.5, y: 2 })).toBe(false);
  });

  it("merges an overlapping stroke into one area rather than flipping it out", () => {
    // The whole reason this is raster arithmetic: concatenated contours read
    // even-odd would turn the overlap into a hole.
    const base = [square(0, 0, 20, 20)];
    const out = combineRegion(
      base,
      [
        { x: 15, y: 10 },
        { x: 40, y: 10 },
      ],
      5,
      false,
    )!;
    expect(out.length).toBe(1);
    expect(regionHolds(out, { x: 17, y: 10 })).toBe(true);
    expect(regionHolds(out, { x: 35, y: 10 })).toBe(true);
  });

  it("erases a stroke's capsule out of the selection", () => {
    const base = [square(0, 0, 60, 30)];
    const out = combineRegion(
      base,
      [
        { x: 30, y: -5 },
        { x: 30, y: 35 },
      ],
      6,
      true,
    )!;
    // The stroke cut the square in two.
    expect(out.length).toBe(2);
    expect(regionHolds(out, { x: 10, y: 15 })).toBe(true);
    expect(regionHolds(out, { x: 50, y: 15 })).toBe(true);
    expect(regionHolds(out, { x: 30, y: 15 })).toBe(false);
  });

  it("answers null once the last of the selection is erased away", () => {
    const base = [square(10, 10, 10, 10)];
    expect(
      combineRegion(
        base,
        [
          { x: 15, y: 15 },
          { x: 15, y: 15.5 },
        ],
        20,
        true,
      ),
    ).toBeNull();
  });

  it("answers null for an erase over nothing", () => {
    expect(
      combineRegion(
        [],
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        4,
        true,
      ),
    ).toBeNull();
  });
});

describe("fillGap", () => {
  const page = { width: 200, height: 140 };
  /** A ring: a square with a square hole in it, read even-odd — what going
   *  round a shape with the pencil or the trace actually leaves you with. */
  const ring = [square(40, 30, 100, 80), square(70, 55, 40, 30)];

  it("fills the middle a selection has only gone round", () => {
    const filled = fillGap(ring, page, { x: 90, y: 70 })!;
    // The hole is inside the window now, and the ring's own ink still is.
    expect(regionHolds(filled, { x: 90, y: 70 })).toBe(true);
    expect(regionHolds(filled, { x: 45, y: 35 })).toBe(true);
    // …and nothing outside it came along.
    expect(regionHolds(filled, { x: 10, y: 10 })).toBe(false);
    expect(regionHolds(filled, { x: 190, y: 130 })).toBe(false);
  });

  it("chooses the whole page when nothing is selected yet", () => {
    // An unmarked sheet has no gaps in it, so all of it is one.
    const filled = fillGap([], page, { x: 12, y: 12 })!;
    for (const p of [
      { x: 1, y: 1 },
      { x: 100, y: 70 },
      { x: 199, y: 139 },
    ]) {
      expect(regionHolds(filled, p)).toBe(true);
    }
  });

  it("takes the part of the page outside the selection, and stops at it", () => {
    const filled = fillGap([square(40, 30, 100, 80)], page, { x: 5, y: 5 })!;
    expect(regionHolds(filled, { x: 5, y: 5 })).toBe(true);
    expect(regionHolds(filled, { x: 190, y: 130 })).toBe(true);
    // The selection is *also* in the window — a fill adds, it never takes
    // away — so the whole page is chosen by the time this press has landed.
    expect(regionHolds(filled, { x: 90, y: 70 })).toBe(true);
  });

  it("hands the selection back untouched from a press inside it", () => {
    // There is no pocket under that press, and retracing the window through
    // the mask would move every corner of it by a fraction for nothing.
    expect(fillGap(ring, page, { x: 45, y: 35 })).toEqual(ring);
  });

  it("chooses nothing from a press off the page", () => {
    expect(fillGap(ring, page, { x: -5, y: 70 })).toBeNull();
    expect(fillGap(ring, page, { x: 90, y: 999 })).toBeNull();
    // …and with nothing selected either, there is still nothing to hand back
    // rather than a window at a press that never landed.
    expect(fillGap([], page, { x: 999, y: 999 })).toBeNull();
  });

  it("keeps what it traces on the page", () => {
    const filled = fillGap([], page, { x: 100, y: 70 })!;
    for (const p of filled.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(page.width);
      expect(p.y).toBeLessThanOrEqual(page.height);
    }
  });
});
