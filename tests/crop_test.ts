// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  cropRatio,
  cropsAnything,
  dragCrop,
  fitCropToRatio,
  initialCrop,
  moveCrop,
  roundCrop,
  simplifyRatio,
  CROP_RATIO_ORDER,
  MIN_CROP,
} from "../src/app/crop.ts";

// Aiming a crop. The frame over the canvas only supplies the pointers
// (`CropFrame.tsx`), so every rule — the grips, the shape lock, the edges of the
// sheet — is driven here with no DOM at all.
//
// It is worth pinning hard: a crop is one gesture with one chance to be right,
// and a box that is a few pixels off, or that quietly changed shape while a
// ratio was supposedly locked, is a picture cut wrong.

const page = { width: 800, height: 600 };
const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const shape = (b: { width: number; height: number }) => b.width / b.height;

describe("cropRatio", () => {
  it("keeps the page's own shape", () => {
    expect(cropRatio("keep", page)).toBeCloseTo(800 / 600);
  });

  it("means no shape at all for a free crop", () => {
    expect(cropRatio("free", page)).toBeNull();
  });

  it("reads a named ratio off its name", () => {
    expect(cropRatio("16:9", page)).toBeCloseTo(16 / 9);
    expect(cropRatio("9:16", page)).toBeCloseTo(9 / 16);
  });

  it("takes two typed numbers", () => {
    expect(cropRatio("custom", page, { w: 5, h: 4 })).toBeCloseTo(1.25);
  });

  it("treats a half-typed custom ratio as no constraint", () => {
    // Better an unconstrained drag than a box collapsed to a line.
    expect(cropRatio("custom", page, { w: 3, h: 0 })).toBeNull();
  });

  it("offers keep first and custom last", () => {
    expect(CROP_RATIO_ORDER[0]).toBe("keep");
    expect(CROP_RATIO_ORDER[CROP_RATIO_ORDER.length - 1]).toBe("custom");
  });
});

describe("simplifyRatio", () => {
  it("writes a page size the way a ratio is quoted", () => {
    expect(simplifyRatio(1920, 1080)).toEqual({ w: 16, h: 9 });
    expect(simplifyRatio(800, 600)).toEqual({ w: 4, h: 3 });
  });
});

describe("initialCrop", () => {
  it("opens on the whole page when nothing constrains it", () => {
    expect(initialCrop(page, null)).toEqual(box(0, 0, 800, 600));
  });

  it("opens on the whole page for the page's own shape", () => {
    const opened = initialCrop(page, 800 / 600);
    expect(opened.width).toBeCloseTo(800);
    expect(opened.height).toBeCloseTo(600);
  });

  it("centres the largest box of a shape the page hasn't got", () => {
    const opened = initialCrop(page, 1);
    expect(opened).toEqual(box(100, 0, 600, 600));
  });
});

describe("dragCrop", () => {
  const full = box(0, 0, 800, 600);

  it("pulls one corner and holds the opposite one still", () => {
    const pulled = dragCrop(full, "se", { x: -200, y: -100 }, page, null);
    expect(pulled).toEqual(box(0, 0, 600, 500));
  });

  it("moves only the edge a side grip owns", () => {
    expect(dragCrop(full, "w", { x: 120, y: 40 }, page, null)).toEqual(
      box(120, 0, 680, 600),
    );
  });

  it("stops at the sheet rather than running off it", () => {
    expect(dragCrop(full, "n", { x: 0, y: -50 }, page, null)).toEqual(full);
    expect(dragCrop(full, "e", { x: 200, y: 0 }, page, null)).toEqual(full);
  });

  it("keeps a floor's worth of box under the pointer", () => {
    const pulled = dragCrop(full, "se", { x: -900, y: -900 }, page, null);
    expect(pulled.width).toBe(MIN_CROP);
    expect(pulled.height).toBe(MIN_CROP);
  });

  it("holds the shape through a corner drag", () => {
    const start = box(100, 100, 400, 300);
    const pulled = dragCrop(start, "se", { x: -100, y: 0 }, page, 4 / 3);
    expect(shape(pulled)).toBeCloseTo(4 / 3);
    // The top-left corner is the one in the other hand.
    expect(pulled.x).toBeCloseTo(100);
    expect(pulled.y).toBeCloseTo(100);
  });

  it("follows the axis pulled furthest under a locked shape", () => {
    const start = box(0, 0, 400, 400);
    // Mostly downwards: the height leads and the width is derived from it.
    const pulled = dragCrop(start, "se", { x: 10, y: 200 }, page, 1);
    expect(pulled.width).toBeCloseTo(600);
    expect(pulled.height).toBeCloseTo(600);
  });

  it("shrinks from a side grip even with a shape locked", () => {
    // The untouched axis must not out-vote the one being dragged, or an inward
    // pull on the right edge would move nothing at all.
    const start = box(0, 0, 400, 400);
    const pulled = dragCrop(start, "e", { x: -100, y: 0 }, page, 1);
    expect(pulled.width).toBeCloseTo(300);
    expect(pulled.height).toBeCloseTo(300);
    expect(pulled.x).toBeCloseTo(0);
  });

  it("opens a side grip's other axis about the middle", () => {
    const start = box(0, 100, 400, 400);
    const pulled = dragCrop(start, "e", { x: -100, y: 0 }, page, 1);
    // 400 → 300 tall, centred on the same middle: 50 off each end.
    expect(pulled.y).toBeCloseTo(150);
  });

  it("never leaves the sheet under a locked shape", () => {
    const start = box(600, 400, 200, 200);
    const pulled = dragCrop(start, "se", { x: 400, y: 400 }, page, 1);
    expect(pulled.x + pulled.width).toBeLessThanOrEqual(page.width + 0.001);
    expect(pulled.y + pulled.height).toBeLessThanOrEqual(page.height + 0.001);
    expect(shape(pulled)).toBeCloseTo(1);
  });
});

describe("moveCrop", () => {
  it("slides the whole box", () => {
    expect(moveCrop(box(100, 100, 200, 200), { x: 50, y: -40 }, page)).toEqual(
      box(150, 60, 200, 200),
    );
  });

  it("stops at the edges rather than hanging off them", () => {
    expect(moveCrop(box(700, 500, 100, 100), { x: 200, y: 200 }, page)).toEqual(
      box(700, 500, 100, 100),
    );
    expect(moveCrop(box(0, 0, 100, 100), { x: -200, y: -200 }, page)).toEqual(
      box(0, 0, 100, 100),
    );
  });
});

describe("fitCropToRatio", () => {
  it("fits the new shape inside the box you had, on the same middle", () => {
    const fitted = fitCropToRatio(box(100, 100, 400, 400), 2, page);
    expect(fitted).toEqual(box(100, 200, 400, 200));
  });

  it("never hands back more of the picture than you had aimed at", () => {
    const aimed = box(200, 200, 300, 200);
    const fitted = fitCropToRatio(aimed, 1, page);
    expect(fitted.width).toBeLessThanOrEqual(aimed.width);
    expect(fitted.height).toBeLessThanOrEqual(aimed.height);
  });

  it("leaves a free crop exactly as it was", () => {
    const aimed = box(10, 20, 300, 200);
    expect(fitCropToRatio(aimed, null, page)).toBe(aimed);
  });
});

describe("roundCrop", () => {
  it("hands back whole pixels inside the page", () => {
    expect(roundCrop(box(10.4, 20.6, 300.5, 200.4), page)).toEqual(
      box(10, 21, 301, 200),
    );
  });
});

describe("cropsAnything", () => {
  it("is false for a box that is still the whole sheet", () => {
    expect(cropsAnything(box(0, 0, 800, 600), page)).toBe(false);
  });

  it("is true the moment an edge comes in", () => {
    expect(cropsAnything(box(0, 0, 799, 600), page)).toBe(true);
    expect(cropsAnything(box(1, 0, 799, 600), page)).toBe(true);
  });
});
