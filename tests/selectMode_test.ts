// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { mergeRegion } from "../src/app/regionMask.ts";
import { regionHolds } from "../src/app/selection.ts";
import {
  applySelectMode,
  effectiveMode,
  heldMode,
  SELECT_MODES,
} from "../src/app/selectMode.ts";
import type { Point } from "../src/app/types.ts";

// What a selection gesture's answer is *worth* — the family-wide Replace / Add
// / Subtract (see `selectMode.ts`). Pure arithmetic over contours and a pair of
// keys, so the whole of it drives here with no canvas: the window a second
// gesture leaves behind is decided by these two functions and nothing else.

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

/** The window as it stands: a 40×40 square with its top-left at (10, 10). */
const base = [square(10, 10, 40, 40)];

describe("heldMode", () => {
  it("reads Shift as adding and Alt as taking away", () => {
    expect(heldMode({ shift: false, alt: false })).toBeNull();
    expect(heldMode({ shift: true, alt: false })).toBe("add");
    expect(heldMode({ shift: false, alt: true })).toBe("subtract");
  });

  it("gives both keys to Alt rather than inventing a fourth answer", () => {
    expect(heldMode({ shift: true, alt: true })).toBe("subtract");
  });
});

describe("effectiveMode", () => {
  it("lets a held key win over the sticky mode, and only while it is held", () => {
    expect(effectiveMode("replace", "add")).toBe("add");
    expect(effectiveMode("add", "subtract")).toBe("subtract");
    expect(effectiveMode("add", null)).toBe("add");
    expect(effectiveMode("replace", null)).toBe("replace");
  });
});

describe("applySelectMode", () => {
  it("replaces, which is what every gesture used to do", () => {
    const chose = [square(60, 60, 20, 20)];
    const next = applySelectMode(base, chose, "replace")!;
    expect(regionHolds(next, { x: 70, y: 70 })).toBe(true);
    expect(regionHolds(next, { x: 30, y: 30 })).toBe(false);
  });

  it("adds a disjoint area, keeping both", () => {
    const next = applySelectMode(base, [square(60, 10, 20, 20)], "add")!;
    expect(regionHolds(next, { x: 30, y: 30 })).toBe(true);
    expect(regionHolds(next, { x: 70, y: 20 })).toBe(true);
    // …and nothing in the gap between them, which a naive concatenation of
    // contours would get right and an even-odd read of overlapping ones would
    // not (see `mergeRegion`).
    expect(regionHolds(next, { x: 55, y: 20 })).toBe(false);
  });

  it("adds an overlapping area without punching a hole in the overlap", () => {
    // The failure this whole raster round-trip exists to prevent: two contours
    // handed over together are read even-odd, so the overlap would come back
    // *unselected*.
    const next = applySelectMode(base, [square(30, 30, 40, 40)], "add")!;
    expect(regionHolds(next, { x: 40, y: 40 })).toBe(true);
    expect(regionHolds(next, { x: 20, y: 20 })).toBe(true);
    expect(regionHolds(next, { x: 60, y: 60 })).toBe(true);
  });

  it("takes an area out of the window under subtract", () => {
    const next = applySelectMode(base, [square(30, 0, 40, 60)], "subtract")!;
    expect(regionHolds(next, { x: 20, y: 30 })).toBe(true);
    expect(regionHolds(next, { x: 40, y: 30 })).toBe(false);
  });

  it("answers null once a subtraction takes the last of the window", () => {
    expect(
      applySelectMode(base, [square(0, 0, 80, 80)], "subtract"),
    ).toBeNull();
  });

  it("subtracts nothing from what was never selected", () => {
    expect(
      applySelectMode(null, [square(0, 0, 20, 20)], "subtract"),
    ).toBeNull();
  });

  it("adds to nothing by handing back the gesture's own answer, exactly", () => {
    // Not rasterised: the first gesture of a drawing costs the same in Add as
    // it does in Replace, and a box stays the box it drew.
    const chose = [square(10, 10, 20, 20)];
    const next = applySelectMode(null, chose, "add")!;
    expect(next).toEqual(chose);
  });

  it("keeps the window when a gesture chose nothing — except under replace, where a tap still clears it", () => {
    for (const mode of ["add", "subtract"] as const) {
      const next = applySelectMode(base, null, mode)!;
      expect(regionHolds(next, { x: 30, y: 30 })).toBe(true);
    }
    expect(applySelectMode(base, null, "replace")).toBeNull();
    expect(applySelectMode(base, [], "replace")).toBeNull();
  });

  it("hands back a fresh region every time, so the screen can compare windows by identity", () => {
    for (const mode of SELECT_MODES) {
      const next = applySelectMode(base, [square(60, 60, 10, 10)], mode);
      expect(next).not.toBe(base);
      expect(next?.[0]).not.toBe(base[0]);
    }
  });
});

describe("mergeRegion", () => {
  it("bounds a subtraction by what is already chosen", () => {
    // A gesture that wandered a long way off the window costs a mask the size
    // of the *window*: nothing outside it can be taken away, so nothing outside
    // it is rasterised, and the answer is still exact.
    const next = mergeRegion(base, [square(-4000, 20, 8000, 10)], true)!;
    expect(regionHolds(next, { x: 30, y: 25 })).toBe(false);
    expect(regionHolds(next, { x: 30, y: 45 })).toBe(true);
    for (const loop of next) {
      for (const p of loop) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(60);
      }
    }
  });

  it("has nothing to say about two empty regions", () => {
    expect(mergeRegion([], [], false)).toBeNull();
  });
});
