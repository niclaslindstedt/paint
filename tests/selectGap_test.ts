// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  fillSelectionGaps,
  gapsWorthOffering,
  selectionGaps,
} from "../src/app/selectGap.ts";
import { regionHolds, type SelectionRegion } from "../src/app/selection.ts";
import type { Point } from "../src/app/types.ts";

// The middle of a shape you only went round — found on the way out of the
// gesture (see `selectGap.ts`). Pure contour arithmetic, so the whole of it
// drives here: rings in, pockets out, and the fill is contours dropped rather
// than pixels flooded.

const square = (x: number, y: number, side: number): readonly Point[] => [
  { x, y },
  { x: x + side, y },
  { x: x + side, y: y + side },
  { x, y: y + side },
];

/** A ring: an outer square with a smaller one inside it, which is what a
 *  circle drawn with the selection pencil comes back as. */
const ring = (outer: number, inner: number): SelectionRegion => [
  square(0, 0, outer),
  square((outer - inner) / 2, (outer - inner) / 2, inner),
];

describe("selectionGaps", () => {
  it("finds the middle of a ring", () => {
    const gaps = selectionGaps(ring(100, 60));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.loop).toBe(1);
    expect(gaps[0]!.area).toBeCloseTo(3600, 5);
  });

  it("seeds the fill at a point really inside the pocket", () => {
    const region = ring(100, 60);
    const at = selectionGaps(region)[0]!.at;
    // Inside the hole's own outline, and so *outside* the selection — which is
    // the whole definition of a pocket.
    expect(regionHolds(region, at)).toBe(false);
    expect(at.x).toBeGreaterThan(20);
    expect(at.x).toBeLessThan(80);
  });

  it("finds a point inside a pocket whose middle is not in it", () => {
    // A horseshoe-shaped hole: its bounding box's centre lies on the tongue of
    // selection poking into it, so a centroid would seed the fill in the wrong
    // place. The scan has to find the roomiest crossing instead.
    const region: SelectionRegion = [
      square(0, 0, 100),
      [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 80 },
        { x: 20, y: 80 },
        { x: 20, y: 60 },
        { x: 60, y: 60 },
        { x: 60, y: 40 },
        { x: 20, y: 40 },
      ],
    ];
    const at = selectionGaps(region)[0]!.at;
    expect(regionHolds(region, at)).toBe(false);
  });

  it("says nothing about a shape with no pocket", () => {
    expect(selectionGaps([square(0, 0, 100)])).toEqual([]);
  });

  it("leaves an island inside a pocket out of the pockets", () => {
    // Outer, hole, island: the island is at depth 2 and is chosen, so it is not
    // itself a pocket.
    const region: SelectionRegion = [
      square(0, 0, 100),
      square(10, 10, 80),
      square(40, 40, 20),
    ];
    expect(selectionGaps(region).map((gap) => gap.loop)).toEqual([1]);
  });
});

describe("gapsWorthOffering", () => {
  it("offers the middle of a ring", () => {
    expect(gapsWorthOffering(ring(100, 80))).toHaveLength(1);
  });

  it("says nothing about a shape whose holes are incidental", () => {
    // A traced face with two eyes in it: the holes are there, but they are not
    // what the gesture was about, and an app that piped up here would be an app
    // pointing out something you can see.
    const region: SelectionRegion = [
      square(0, 0, 400),
      square(100, 100, 20),
      square(280, 100, 20),
    ];
    expect(gapsWorthOffering(region)).toEqual([]);
  });

  it("says nothing about a pocket too small to be the point", () => {
    expect(gapsWorthOffering(ring(20, 12))).toEqual([]);
  });

  it("says nothing about a window in more pieces than a hand drew", () => {
    // A colour select over a photograph. Not a shape anybody went round.
    const region: SelectionRegion = Array.from({ length: 80 }, (_, i) =>
      square(i * 10, 0, 8),
    );
    expect(gapsWorthOffering(region)).toEqual([]);
  });
});

describe("fillSelectionGaps", () => {
  it("fills the middle by dropping its contour", () => {
    const region = ring(100, 60);
    const filled = fillSelectionGaps(region, selectionGaps(region));
    expect(filled).toHaveLength(1);
    expect(regionHolds(filled, { x: 50, y: 50 })).toBe(true);
  });

  it("leaves the outline it drew exactly where it was", () => {
    const region = ring(100, 60);
    const filled = fillSelectionGaps(region, selectionGaps(region));
    // The point of dropping a contour rather than re-flooding the window: no
    // half-pixel creep along the border the hand actually drew.
    expect(filled[0]).toEqual(region[0]);
  });

  it("takes an island inside the pocket with it", () => {
    // Fill the middle and the middle is filled — an island left behind would
    // flip from chosen to a hole the moment the water round it came in.
    const region: SelectionRegion = [
      square(0, 0, 100),
      square(10, 10, 80),
      square(40, 40, 20),
    ];
    const filled = fillSelectionGaps(region, selectionGaps(region));
    expect(filled).toHaveLength(1);
    expect(regionHolds(filled, { x: 50, y: 50 })).toBe(true);
  });

  it("hands back the window unchanged when there is nothing to fill", () => {
    const region = [square(0, 0, 100)];
    expect(fillSelectionGaps(region, [])).toBe(region);
  });
});
