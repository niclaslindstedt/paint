// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  isDoubleTap,
  isTap,
  TAP_SLOP,
} from "../src/app/gestures.ts";

// Double-tap is detected from the pointer stream rather than from `dblclick`,
// so the thresholds are ours to get right — and getting them wrong is felt, not
// seen: too loose and a pan snaps the view away mid-drag, too tight and the
// gesture just seems broken. These pin both edges.

describe("isTap", () => {
  it("accepts a press that only wobbled", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 102 })).toBe(true);
  });

  it("rejects a press that travelled", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_SLOP + 2, y: 100 })).toBe(
      false,
    );
  });
});

describe("isDoubleTap", () => {
  const first = { time: 1000, point: { x: 50, y: 50 } };

  it("pairs two taps close in time and place", () => {
    expect(isDoubleTap(first, { time: 1150, point: { x: 56, y: 54 } })).toBe(
      true,
    );
  });

  it("rejects a second tap that came too late", () => {
    expect(
      isDoubleTap(first, {
        time: first.time + DOUBLE_TAP_MS + 1,
        point: first.point,
      }),
    ).toBe(false);
  });

  it("rejects a second tap somewhere else on the page", () => {
    expect(
      isDoubleTap(first, {
        time: 1100,
        point: { x: 50 + DOUBLE_TAP_SLOP + 5, y: 50 },
      }),
    ).toBe(false);
  });

  it("never pairs with nothing — a consumed or absent first tap", () => {
    expect(isDoubleTap(null, { time: 1100, point: { x: 50, y: 50 } })).toBe(
      false,
    );
  });
});
