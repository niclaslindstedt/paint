// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  initialPlacement,
  movePlacement,
  resizePlacement,
  MIN_PLACEMENT,
} from "../src/app/placement.ts";

// The dropped image's floating frame. The whole interaction is arithmetic on a
// box (`ImagePlacement.tsx` only supplies the pointers), so a drop, a drag and
// a corner pull all run here with no DOM.

const page = { width: 800, height: 600 };
const image = (width: number, height: number) => ({
  src: "data:image/png;base64,AAA",
  width,
  height,
});

describe("initialPlacement", () => {
  it("centres a picture that fits on where you were looking", () => {
    const placed = initialPlacement(image(200, 100), page, { x: 400, y: 300 });
    expect(placed.box).toEqual({ x: 300, y: 250, width: 200, height: 100 });
  });

  it("nudges one dropped near the edge back onto the sheet", () => {
    const placed = initialPlacement(image(200, 100), page, { x: 780, y: 20 });
    expect(placed.box).toEqual({ x: 600, y: 0, width: 200, height: 100 });
  });

  it("centres on the page when nothing says where you were looking", () => {
    const placed = initialPlacement(image(200, 100), page, null);
    expect(placed.box).toEqual({ x: 300, y: 250, width: 200, height: 100 });
  });

  it("lands a picture bigger than the page at the origin, full size", () => {
    // Settling it grows the page to fit, so the picture becomes the sheet.
    const placed = initialPlacement(image(1600, 1200), page, {
      x: 400,
      y: 300,
    });
    expect(placed.box).toEqual({ x: 0, y: 0, width: 1600, height: 1200 });
  });

  it("records the source aspect ratio for the corner drags", () => {
    expect(initialPlacement(image(200, 100), page, null).aspect).toBe(2);
  });
});

describe("movePlacement", () => {
  it("shifts by the drag", () => {
    expect(
      movePlacement({ x: 100, y: 100, width: 50, height: 50 }, 25, -40),
    ).toEqual({ x: 125, y: 60, width: 50, height: 50 });
  });

  it("stops at the page origin — the sheet only ever grows the other way", () => {
    expect(
      movePlacement({ x: 10, y: 10, width: 50, height: 50 }, -80, -80),
    ).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });

  it("lets a picture hang off the right and the bottom", () => {
    expect(
      movePlacement({ x: 700, y: 500, width: 200, height: 200 }, 400, 400),
    ).toEqual({ x: 1100, y: 900, width: 200, height: 200 });
  });
});

describe("resizePlacement", () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it("pins the opposite corner when the south-east handle is pulled", () => {
    const next = resizePlacement(box, "se", { x: 500, y: 250 }, 2);
    expect(next.x).toBe(100);
    expect(next.y).toBe(100);
    expect(next.width).toBe(400);
    expect(next.height).toBe(200);
  });

  it("keeps the aspect ratio however the pointer is dragged", () => {
    const next = resizePlacement(box, "se", { x: 140, y: 900 }, 2);
    expect(next.width / next.height).toBeCloseTo(2);
  });

  it("moves the origin when a top-left corner is pulled", () => {
    const next = resizePlacement(box, "nw", { x: 100, y: 150 }, 2);
    // The south-east corner (300, 200) stays put.
    expect(next.x + next.width).toBeCloseTo(300);
    expect(next.y + next.height).toBeCloseTo(200);
    expect(next.width).toBeCloseTo(200);
  });

  it("stops a top-left drag at the page origin rather than off it", () => {
    const next = resizePlacement(box, "nw", { x: -400, y: -400 }, 2);
    expect(next.x).toBe(0);
    expect(next.y).toBeGreaterThanOrEqual(0);
    expect(next.width / next.height).toBeCloseTo(2);
  });

  it("refuses to shrink past a grabbable size", () => {
    const next = resizePlacement(box, "se", { x: 100, y: 100 }, 2);
    expect(Math.min(next.width, next.height)).toBeGreaterThanOrEqual(
      MIN_PLACEMENT,
    );
    expect(next.width / next.height).toBeCloseTo(2);
  });
});
