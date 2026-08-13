// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  classifyEdgeDrag,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  EDGE_OPEN_DISTANCE,
  EDGE_ZONE,
  inEdgeZone,
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

// The edge strip is the canvas's half of a gesture the framework's sidebar owns:
// the swipe that opens the drawer starts on the page, and the page must not draw
// it. These pin the arithmetic to the framework's, because the two agreeing is
// the whole point — hold too little and the swipe leaves a line, hold too much
// and marks near the edge go missing.

describe("inEdgeZone", () => {
  it("claims the strip on the watched edge", () => {
    expect(inEdgeZone(4, 400, "left")).toBe(true);
    expect(inEdgeZone(396, 400, "right")).toBe(true);
  });

  it("leaves the rest of the page alone", () => {
    expect(inEdgeZone(EDGE_ZONE + 1, 400, "left")).toBe(false);
    expect(inEdgeZone(200, 400, "right")).toBe(false);
  });

  it("watches one edge at a time", () => {
    expect(inEdgeZone(4, 400, "right")).toBe(false);
    expect(inEdgeZone(396, 400, "left")).toBe(false);
  });
});

describe("classifyEdgeDrag", () => {
  it("holds a press that has barely moved", () => {
    expect(classifyEdgeDrag(0, 0, "left")).toBe("pending");
    expect(classifyEdgeDrag(10, 4, "left")).toBe("pending");
  });

  it("gives the drawer a swipe that has gone far enough inward", () => {
    expect(classifyEdgeDrag(EDGE_OPEN_DISTANCE, 5, "left")).toBe("menu");
    expect(classifyEdgeDrag(-EDGE_OPEN_DISTANCE, 5, "right")).toBe("menu");
  });

  it("releases a drag that is more up-and-down than sideways", () => {
    // The framework disarms on exactly this test, so the press is ours: a
    // vertical line drawn from the edge of the page must still be drawn.
    expect(classifyEdgeDrag(4, 20, "left")).toBe("draw");
    expect(classifyEdgeDrag(-4, -20, "right")).toBe("draw");
  });

  it("never hands the drawer a swipe that runs off its own edge", () => {
    expect(classifyEdgeDrag(-EDGE_OPEN_DISTANCE, 2, "left")).toBe("pending");
    expect(classifyEdgeDrag(EDGE_OPEN_DISTANCE, 2, "right")).toBe("pending");
  });
});
