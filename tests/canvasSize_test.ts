// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  canvasPresets,
  clampCanvasSize,
  clampSide,
  currentScreenCanvasSize,
  matchPreset,
  previewScale,
  sameCanvasSize,
  screenCanvasSize,
} from "../src/app/canvasSize.ts";
import { DEFAULT_CANVAS } from "../src/app/types.ts";

// The size a new page is made at. Every rule the new-drawing dialog leans on
// lives in the module under test, so the whole choice can be driven here
// without a browser: what "this screen" resolves to, what the list offers, and
// how big each of them is *drawn* — the dialog compares them as rectangles, so
// the scale they share is part of the answer rather than part of the paint.

describe("clampSide", () => {
  it("rounds to whole pixels", () => {
    expect(clampSide(1920.4)).toBe(1920);
    expect(clampSide(1920.6)).toBe(1921);
  });

  it("holds sides inside the supported range", () => {
    expect(clampSide(1)).toBe(MIN_CANVAS_SIDE);
    expect(clampSide(999999)).toBe(MAX_CANVAS_SIDE);
  });

  it("falls back to the minimum for a non-number", () => {
    expect(clampSide(Number.NaN)).toBe(MIN_CANVAS_SIDE);
    expect(clampSide(Number.POSITIVE_INFINITY)).toBe(MIN_CANVAS_SIDE);
  });

  it("leaves a usable size alone", () => {
    expect(clampCanvasSize({ width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });
});

describe("screenCanvasSize", () => {
  it("multiplies CSS pixels by the device's pixel ratio", () => {
    expect(
      screenCanvasSize({ width: 1512, height: 982, pixelRatio: 2 }),
    ).toEqual({ width: 3024, height: 1964 });
  });

  it("keeps a portrait phone portrait", () => {
    const size = screenCanvasSize({ width: 390, height: 844, pixelRatio: 3 });
    expect(size).toEqual({ width: 1170, height: 2532 });
  });

  it("treats a missing or nonsense ratio as 1", () => {
    const plain = { width: 1280, height: 800 };
    expect(screenCanvasSize({ ...plain, pixelRatio: 0 })).toEqual(plain);
    expect(screenCanvasSize({ ...plain, pixelRatio: Number.NaN })).toEqual(
      plain,
    );
  });

  it("scales a screen past the ceiling whole, keeping its shape", () => {
    // A 6K panel at 2× is 12032 × 6768 — over the ceiling on the long edge.
    const size = screenCanvasSize({
      width: 6016,
      height: 3384,
      pixelRatio: 2,
    });
    expect(size.width).toBe(MAX_CANVAS_SIDE);
    expect(size.height / size.width).toBeCloseTo(6768 / 12032, 3);
  });

  it("falls back to the default sheet for a screen of no size", () => {
    expect(screenCanvasSize({ width: 0, height: 0, pixelRatio: 2 })).toEqual({
      width: DEFAULT_CANVAS.width,
      height: DEFAULT_CANVAS.height,
    });
  });
});

describe("currentScreenCanvasSize", () => {
  it("falls back to the default sheet with no window to ask", () => {
    // The tests run in node — there is no `window`, which is exactly the
    // "rendered outside the browser" case the fallback exists for.
    expect(currentScreenCanvasSize()).toEqual({
      width: DEFAULT_CANVAS.width,
      height: DEFAULT_CANVAS.height,
    });
  });
});

describe("canvasPresets", () => {
  it("offers this screen first — it is the default answer", () => {
    const presets = canvasPresets({ width: 2560, height: 1440 });
    expect(presets[0]).toEqual({
      id: "screen",
      size: { width: 2560, height: 1440 },
    });
  });

  it("offers four sizes and no more — they are compared, not read", () => {
    expect(
      canvasPresets({ width: 2560, height: 1440 }).map((p) => p.id),
    ).toEqual(["screen", "hd", "uhd", "print"]);
  });

  it("lists a named size that is also the screen size only once", () => {
    const presets = canvasPresets({ width: 1920, height: 1080 });
    const hd = presets.filter((p) =>
      sameCanvasSize(p.size, { width: 1920, height: 1080 }),
    );
    expect(hd).toHaveLength(1);
    expect(hd[0]?.id).toBe("screen");
  });

  it("clamps a screen size it is handed before offering it", () => {
    const presets = canvasPresets({ width: 12000, height: 12000 });
    expect(presets[0]?.size).toEqual({
      width: MAX_CANVAS_SIDE,
      height: MAX_CANVAS_SIDE,
    });
  });

  it("finds the preset a size came from", () => {
    const presets = canvasPresets({ width: 2560, height: 1440 });
    expect(matchPreset(presets, { width: 3840, height: 2160 })?.id).toBe("uhd");
    expect(matchPreset(presets, { width: 1234, height: 567 })).toBeUndefined();
  });
});

describe("previewScale", () => {
  const presets = canvasPresets({ width: 2560, height: 1440 });
  const sizes = presets.map((p) => p.size);

  it("fits the largest page in the box, in whichever direction it is largest", () => {
    const box = { width: 100, height: 60 };
    const scale = previewScale(sizes, box);
    for (const preset of presets) {
      expect(preset.size.width * scale).toBeLessThanOrEqual(box.width + 0.001);
      expect(preset.size.height * scale).toBeLessThanOrEqual(
        box.height + 0.001,
      );
    }
    // …and one of them actually reaches an edge, or the shelf is drawn smaller
    // than it needs to be.
    const touches = presets.some(
      (p) =>
        Math.abs(p.size.width * scale - box.width) < 0.001 ||
        Math.abs(p.size.height * scale - box.height) < 0.001,
    );
    expect(touches).toBe(true);
  });

  it("is one scale for the whole shelf, so the sizes can be compared", () => {
    // 4K is exactly twice Full HD on each side, and it has to *draw* twice as
    // big — a per-cell fit would make them identical, which is the one thing a
    // picture of a page size must not do.
    const scale = previewScale(sizes, { width: 100, height: 60 });
    const hd = presets.find((p) => p.id === "hd")!;
    const uhd = presets.find((p) => p.id === "uhd")!;
    expect(uhd.size.width * scale).toBeCloseTo(hd.size.width * scale * 2, 6);
  });
});
