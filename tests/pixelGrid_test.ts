// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  PIXEL_GRID_FROM,
  PIXEL_GRID_FULL,
  paintPixelGrid,
  pixelGridAlpha,
  showsPixels,
} from "../src/app/pixelGrid.ts";
import { detailFor } from "../src/app/render.ts";
import type { CanvasView } from "../src/app/viewport.ts";
import { MAX_SCALE } from "../src/app/viewport.ts";

// The pixel grid is two decisions, and both are arithmetic: *whether* to rule
// the lattice at this zoom, and *where* its lines fall in device pixels. The
// first is a pure function. The second only needs a context that writes down
// the rectangles it is handed — the grid paints nothing else — so the whole of
// it can be checked here, without a canvas and without pixels.
//
// The one that is easy to get wrong, and was got wrong first, is *which* zoom
// the band is measured in: the view's CSS-pixel scale (how big a cell looks,
// the same on every screen) rather than the readout's device-pixel percentage
// (how big it is in that screen's own dots). On a 3× phone the two differ by
// three, which is the difference between a lattice and a wash.

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

/** The view that shows the page's top-left corner with each document pixel
 *  `scale` CSS pixels across, the sheet's corner on the window's. */
function zoomedTo(scale: number): CanvasView {
  return { scale, tx: 0, ty: 0 };
}

describe("pixelGridAlpha", () => {
  it("rules nothing at the zooms the canvas actually lives at", () => {
    // The whole reason for the band: below it the lines are too close together
    // to resolve into squares, so ruling them tints the page rather than marks
    // it.
    for (const cell of [0.1, 1, 2, 3, 4, 4.5, 5]) {
      expect(pixelGridAlpha(cell)).toBe(0);
    }
  });

  it("is measured in how big a cell looks, not in what the readout says", () => {
    // The bug this is here to stop. The readout counts device pixels, so on a
    // 3× phone it says 1500% where a laptop says 500% — and both show a cell
    // five CSS pixels across, which is the thing that decides whether there is
    // a lattice on screen or a wash. Same view scale, same grid, whatever the
    // pixel ratio underneath it.
    const cell = 5.8;
    const onePixelRatio = pixelGridAlpha(cell);
    expect(onePixelRatio).toBeGreaterThan(0);
    for (const dpr of [1, 2, 2.625, 3, 4]) {
      // What a device-pixel band would have used instead: the same view, read
      // through the screen's ratio. It must make no difference here.
      expect(pixelGridAlpha(cell)).toBe(onePixelRatio);
      expect(pixelGridAlpha(cell * dpr)).not.toBe(0);
    }
    // …and the readout's own number is emphatically not the input: a 3× phone
    // at 690% has a cell of 2.3 CSS pixels, which is a wash and gets nothing,
    // even though 6.9 device pixels would have been most of the way up a band
    // measured that way.
    expect(pixelGridAlpha(6.9 / 3)).toBe(0);
  });

  it("fades in across the band instead of switching on", () => {
    const half = pixelGridAlpha((PIXEL_GRID_FROM + PIXEL_GRID_FULL) / 2);
    const full = pixelGridAlpha(PIXEL_GRID_FULL);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
    expect(half).toBeCloseTo(full / 2, 9);
  });

  it("is at full strength from a seven-pixel cell on, and stays there", () => {
    const full = pixelGridAlpha(PIXEL_GRID_FULL);
    expect(pixelGridAlpha(8)).toBe(full);
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

  it("leaves every screen the same room to work inside it", () => {
    // `MAX_SCALE` is in the band's own units, so this holds on a phone exactly
    // as it does on a monitor: the ceiling clears the top of the band by more
    // than twice over, and a cell up there is a square you can aim at.
    expect(MAX_SCALE).toBeGreaterThanOrEqual(PIXEL_GRID_FULL * 2);
    expect(pixelGridAlpha(MAX_SCALE)).toBe(pixelGridAlpha(PIXEL_GRID_FULL));
  });
});

describe("showsPixels", () => {
  it("turns over where the grid opens, and not somewhere else", () => {
    // The two have to agree. A grid ruled over a smoothly interpolated bitmap
    // is a lattice over a blur: there are no pixel edges in the picture for it
    // to line up with, and the grid gets blamed for it.
    expect(showsPixels(PIXEL_GRID_FROM - 0.01)).toBe(false);
    expect(showsPixels(PIXEL_GRID_FROM)).toBe(true);
    expect(showsPixels(PIXEL_GRID_FULL)).toBe(true);
    expect(showsPixels(1)).toBe(false);
    expect(showsPixels(Number.NaN)).toBe(false);
  });

  it("is a step where the grid is a fade", () => {
    // Nothing can half-interpolate, so this one cannot ramp. It turns over at
    // the bottom of the band, where the grid is still drawing nothing.
    expect(showsPixels(PIXEL_GRID_FROM)).toBe(true);
    expect(pixelGridAlpha(PIXEL_GRID_FROM)).toBe(0);
  });

  it("reaches the painter that has to act on it", () => {
    // The whole chain from a view to a bitmap's filtering: the frame reads the
    // scale, the options carry it, and the detail is what the painter is told.
    const ctx = recorder();
    expect(
      detailFor(ctx, { pageColor: "#fff", defaultInk: "#000", scale: 1 })
        .pixels,
    ).toBeUndefined();
    expect(
      detailFor(ctx, {
        pageColor: "#fff",
        defaultInk: "#000",
        scale: 1,
        pixels: true,
      }).pixels,
    ).toBe(true);
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
    // A cell that is not a whole number of *device* pixels — 5.3 CSS pixels on
    // a 2× screen — where the boundaries genuinely fall between pixels and
    // something has to give.
    paintPixelGrid(ctx, PAGE, zoomedTo(5.3), 2, WINDOW);
    expect(ctx.rects.length).toBeGreaterThan(0);
    for (const r of ctx.rects) {
      expect(Number.isInteger(r.x)).toBe(true);
      expect(Number.isInteger(r.y)).toBe(true);
    }
    // …and the give is spacing that wobbles by a pixel, never a line that
    // drifts: each is within half a pixel of where the boundary really is.
    const columns = ctx.rects.filter((r) => r.width === 1).map((r) => r.x);
    columns.forEach((at, i) => {
      expect(Math.abs(at - (i + 1) * 5.3 * 2)).toBeLessThanOrEqual(0.5);
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
