// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { MAX_IMPORT_EDGE, storedSize } from "../src/app/images.ts";

// What a dropped picture is *kept* at, which since the pixel grid arrived is
// also what it is *drawn* at — the two have to be the same number or the
// document claims a resolution it does not hold, and the grid rules squares the
// picture has nothing to put in them.
//
// The bug this is the regression test for: a phone screenshot (1179 × 2556) was
// stored at 923 × 2000 by a 2000-pixel cap and placed at its original size, so
// one stored pixel covered 1.2774 document pixels. Zoomed in among the pixels
// that reads as grey blocks of uneven width, and no filtering downstream can
// fix it — the detail was resampled away before anything was drawn.

/** The screens people actually screenshot. */
const PHONES = [
  ["iPhone 15/16 Pro", 1179, 2556],
  ["iPhone Pro Max", 1290, 2796],
  ["iPhone 11 / XR", 828, 1792],
  ["a tall Android", 1440, 3120],
  ["an older Android", 1080, 2400],
] as const;

describe("storedSize", () => {
  it("leaves a phone screenshot alone, whichever phone", () => {
    // The one import whose whole point is its pixels. Inside the cap the bytes
    // are kept as they arrived, so every pixel of the screenshot is a document
    // pixel and the grid rules the squares it is genuinely made of.
    for (const [name, width, height] of PHONES) {
      const kept = storedSize(width, height);
      expect({ name, ...kept }).toEqual({ name, width, height });
    }
  });

  it("caps a picture that is genuinely huge", () => {
    const kept = storedSize(6000, 4000);
    expect(Math.max(kept.width, kept.height)).toBe(MAX_IMPORT_EDGE);
    // …keeping its shape, to within the rounding of a whole pixel.
    expect(kept.width / kept.height).toBeCloseTo(6000 / 4000, 2);
  });

  it("never leaves a picture with no pixels in it", () => {
    // A sliver — 20000 × 3 — rounds its short edge to nothing without the
    // floor, and a zero-width bitmap is not a picture.
    const kept = storedSize(20000, 3);
    expect(kept.width).toBeGreaterThan(0);
    expect(kept.height).toBeGreaterThan(0);
  });

  it("is idempotent: what is stored stays stored", () => {
    // The invariant the placement rests on. A picture is placed at the size it
    // is kept at, so re-asking about that size has to give the same answer —
    // otherwise a round trip through the document would shrink it again.
    for (const [, width, height] of [
      ...PHONES,
      ["huge", 6000, 4000] as const,
    ]) {
      const once = storedSize(width, height);
      expect(storedSize(once.width, once.height)).toEqual(once);
    }
  });

  it("no longer resamples the screenshot that started this", () => {
    // The exact numbers from the report. Under the old 2000-pixel cap an
    // iPhone screenshot was stored at 923 × 2000 and placed at 1179 × 2556, so
    // one stored pixel covered 1.2774 document pixels — its own pixels could
    // not land on the document's lattice at any zoom, and the resampling had
    // already turned its hard edges to grey. Now it is not touched at all.
    const OLD_CAP = 2000;
    const oldScale = OLD_CAP / 2556;
    const oldStoredWidth = Math.round(1179 * oldScale);
    expect(oldStoredWidth).toBe(923);
    expect(1179 / oldStoredWidth).toBeCloseTo(1.2774, 3);

    expect(storedSize(1179, 2556)).toEqual({ width: 1179, height: 2556 });
  });
});
