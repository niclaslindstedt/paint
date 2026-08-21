// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  PIXEL_GRID_FROM,
  PIXEL_GRID_FULL,
  paintPixelGrid,
  pixelGridAlpha,
} from "../src/app/pixelGrid.ts";
import type { CanvasView } from "../src/app/viewport.ts";
import { MAX_SCALE } from "../src/app/viewport.ts";

// The pixel grid is two decisions, and both are arithmetic: *whether* to rule
// the lattice at this zoom, and *where* its lines fall in device pixels. The
// first is a pure function. The second only needs a context that writes down
// the rectangles it is handed — the grid paints nothing else — so the whole of
// it can be checked here, without a canvas and without pixels.

/** A 2D context that records the boxes filled through it. Enough for the grid:
 *  it lays every line as a `rect` on one path and fills it once. */
function recorder() {
  const rects: { x: number; y: number; width: number; height: number }[] = [];
  const transforms: number[][] = [];
  let fills = 0;
  let depth = 0;
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    rects,
    transforms,
    get fills() {
      return fills;
    },
    /** How many `save()`s are still open — the grid must leave none. */
    get depth() {
      return depth;
    },
    save() {
      depth += 1;
    },
    restore() {
      depth -= 1;
    },
    setTransform(
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
    ) {
      transforms.push([a, b, c, d, e, f]);
    },
    beginPath() {},
    rect(x: number, y: number, width: number, height: number) {
      rects.push({ x, y, width, height });
    },
    fill() {
      fills += 1;
    },
  };
  return ctx as unknown as CanvasRenderingContext2D & typeof ctx;
}

const PAGE = { width: 60, height: 40 };
const WINDOW = { width: 800, height: 600 };

/** The view that shows the page's top-left corner at `deviceScale` device
 *  pixels per document pixel, with the sheet's corner at the window's. */
function zoomedTo(deviceScale: number, dpr = 1): CanvasView {
  return { scale: deviceScale / dpr, tx: 0, ty: 0 };
}

describe("pixelGridAlpha", () => {
  it("rules nothing at the zooms the canvas actually lives at", () => {
    // The whole reason for the band: a one-device-pixel line is a third of the
    // cell at 300%, so ruling it there would tint the page rather than mark it.
    for (const percent of [10, 100, 200, 300, 400, 500, 700, 800]) {
      expect(pixelGridAlpha(percent / 100)).toBe(0);
    }
  });

  it("fades in across the band instead of switching on", () => {
    const half = pixelGridAlpha((PIXEL_GRID_FROM + PIXEL_GRID_FULL) / 2);
    const full = pixelGridAlpha(PIXEL_GRID_FULL);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
    expect(half).toBeCloseTo(full / 2, 9);
  });

  it("is at full strength from 1000% on, and stays there", () => {
    const full = pixelGridAlpha(PIXEL_GRID_FULL);
    expect(pixelGridAlpha(10)).toBe(full);
    expect(pixelGridAlpha(16)).toBe(full);
    expect(pixelGridAlpha(1000)).toBe(full);
    // …and it is an ink, not a curtain: the picture reads straight through it.
    expect(full).toBeLessThan(0.5);
  });

  it("survives a nonsense zoom", () => {
    expect(pixelGridAlpha(Number.NaN)).toBe(0);
    expect(pixelGridAlpha(Number.POSITIVE_INFINITY)).toBe(0);
    expect(pixelGridAlpha(-4)).toBe(0);
  });

  it("is reachable on a screen that is not retina", () => {
    // The readout counts device pixels, so a 1× monitor tops out at
    // `MAX_SCALE * 100`%. A grid nobody at 1× can zoom to is not a feature.
    expect(MAX_SCALE).toBeGreaterThan(PIXEL_GRID_FULL);
    expect(pixelGridAlpha(MAX_SCALE)).toBeGreaterThan(0);
  });
});

describe("paintPixelGrid", () => {
  it("paints nothing below the band", () => {
    const ctx = recorder();
    paintPixelGrid(ctx, PAGE, zoomedTo(4), 1, WINDOW);
    expect(ctx.rects).toHaveLength(0);
    expect(ctx.fills).toBe(0);
  });

  it("rules one line per document pixel, a device pixel wide", () => {
    const ctx = recorder();
    paintPixelGrid(ctx, PAGE, zoomedTo(12), 1, WINDOW);
    const columns = ctx.rects.filter((r) => r.width === 1);
    const rows = ctx.rects.filter((r) => r.height === 1);
    // Every boundary inside the sheet, and neither of its own edges — those
    // belong to the chrome's hairline.
    expect(columns).toHaveLength(PAGE.width - 1);
    expect(rows).toHaveLength(PAGE.height - 1);
    expect(ctx.fills).toBe(1);
  });

  it("lands every line on a whole device pixel", () => {
    const ctx = recorder();
    // A zoom whose cell is not a whole number of device pixels — 1060%, where
    // the boundaries genuinely fall between pixels and something has to give.
    paintPixelGrid(ctx, PAGE, zoomedTo(10.6, 2), 2, WINDOW);
    expect(ctx.rects.length).toBeGreaterThan(0);
    for (const r of ctx.rects) {
      expect(Number.isInteger(r.x)).toBe(true);
      expect(Number.isInteger(r.y)).toBe(true);
    }
    // …and the give is spacing that wobbles by a pixel, never a line that
    // drifts: each is within half a pixel of where the boundary really is.
    const columns = ctx.rects.filter((r) => r.width === 1).map((r) => r.x);
    columns.forEach((at, i) => {
      expect(Math.abs(at - (i + 1) * 10.6)).toBeLessThanOrEqual(0.5);
    });
  });

  it("rules the sheet and not the desk around it", () => {
    const ctx = recorder();
    // The page pushed to the middle of the window, and small enough that there
    // is desk on every side of it.
    const view: CanvasView = { scale: 10, tx: 120, ty: 90 };
    paintPixelGrid(ctx, PAGE, view, 1, WINDOW);
    const right = 120 + PAGE.width * 10;
    const bottom = 90 + PAGE.height * 10;
    for (const r of ctx.rects) {
      expect(r.x).toBeGreaterThanOrEqual(120);
      expect(r.y).toBeGreaterThanOrEqual(90);
      expect(r.x + r.width).toBeLessThanOrEqual(right);
      expect(r.y + r.height).toBeLessThanOrEqual(bottom);
    }
    expect(ctx.rects.length).toBe(PAGE.width - 1 + (PAGE.height - 1));
  });

  it("costs the window rather than the page", () => {
    const ctx = recorder();
    // A big page at a deep zoom: the lattice has a million boundaries in it and
    // the window can see a couple of hundred. Only those are laid down.
    const huge = { width: 4000, height: 3000 };
    paintPixelGrid(ctx, huge, { scale: 12, tx: -9000, ty: -7000 }, 1, WINDOW);
    expect(ctx.rects.length).toBeLessThan(
      WINDOW.width / 12 + WINDOW.height / 12 + 4,
    );
    for (const r of ctx.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(WINDOW.width);
      expect(r.y + r.height).toBeLessThanOrEqual(WINDOW.height);
    }
  });

  it("paints nothing for a page the window has been panned off", () => {
    const ctx = recorder();
    paintPixelGrid(ctx, PAGE, { scale: 12, tx: -5000, ty: -5000 }, 1, WINDOW);
    expect(ctx.rects).toHaveLength(0);
  });

  it("hands the document transform back", () => {
    // The grid works in device pixels, in the middle of chrome that works in
    // document ones — the selection's outline is painted straight after it.
    const ctx = recorder();
    paintPixelGrid(ctx, PAGE, zoomedTo(12), 1, WINDOW);
    expect(ctx.depth).toBe(0);
    expect(ctx.transforms).toEqual([[1, 0, 0, 1, 0, 0]]);
  });
});
