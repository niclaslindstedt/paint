// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The crayon's grain.
//
// A crayon mark is wax caught on the paper's tooth, and the property that makes
// it read as one is that **the tooth belongs to the page, not to the stick**.
// That is a claim about the *numbers* a painter emits and not about how the
// mark looks, so it can be tested without a canvas: paint onto a recording
// context and measure the specks.

import { describe, expect, it } from "vitest";

import { paintCrayon } from "../src/app/plugins/crayon.ts";
import type { Point } from "../src/app/types.ts";
import { createFakeContext, type FakeContext } from "./support/fakeCanvas.ts";

/** A gentle sampled curve, the shape a hand actually draws. */
function curve(length = 300, at = 200): Point[] {
  const points: Point[] = [];
  for (let t = 0; t <= length; t += 1.5) {
    points.push({ x: 40 + t, y: at + Math.sin(t / 60) * 18 });
  }
  return points;
}

/** Every speck a mark laid down, across all of its weight buckets. */
function specks(ctx: FakeContext): [number, number, number, number][] {
  return ctx.strokes.flatMap((stroke) => stroke.runs);
}

/** How long the specks are, typically — the size of the grain. */
function medianLength(ctx: FakeContext): number {
  const lengths = specks(ctx)
    .map(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1))
    .sort((a, b) => a - b);
  return lengths[Math.floor(lengths.length / 2)] ?? 0;
}

/** How far the mark reaches across the path it was drawn along. */
function spread(ctx: FakeContext, points: readonly Point[]): number {
  let widest = 0;
  for (const [x1, y1] of specks(ctx)) {
    let nearest = Infinity;
    for (const p of points) {
      nearest = Math.min(nearest, Math.hypot(p.x - x1, p.y - y1));
    }
    widest = Math.max(widest, nearest);
  }
  return widest;
}

function paint(points: readonly Point[], size: number, scale = 1): FakeContext {
  const ctx = createFakeContext();
  paintCrayon(ctx, points, size, scale);
  return ctx;
}

describe("the crayon", () => {
  it("paints the same grain every time", () => {
    // Every repaint — a pan, an undo, the PNG export — repaints from the
    // document, so a mark that grained at random would shimmer.
    const once = specks(paint(curve(), 12));
    const again = specks(paint(curve(), 12));
    expect(once.length).toBeGreaterThan(100);
    expect(again).toEqual(once);
  });

  it("grains a fat stick exactly as finely as a thin one", () => {
    // The whole point. The tooth is a property of the sheet, so a broad mark is
    // a *wider band of the same speckle* — not a thin mark scaled up, which is
    // what turns a fat crayon into a lumpy sausage.
    const thin = paint(curve(), 6);
    const fat = paint(curve(), 60);

    const fine = medianLength(thin);
    expect(fine).toBeGreaterThan(0);
    // A ten-times-wider stick, within a few percent of the same speck. (Not
    // exactly equal: the two marks draw different numbers of specks off
    // different parts of the sheet, so their medians land on different ones.)
    expect(medianLength(fat) / fine).toBeGreaterThan(0.95);
    expect(medianLength(fat) / fine).toBeLessThan(1.05);
    // The width the specks are drawn at is the grain's pitch outright, and that
    // is exact.
    expect(fat.strokes[0]!.lineWidth).toBeCloseTo(
      thin.strokes[0]!.lineWidth,
      9,
    );
  });

  it("spends a wider stick on covering more paper", () => {
    // The width has to go somewhere, and where it goes is more grain across the
    // mark rather than bigger grain.
    const thin = paint(curve(), 6);
    const fat = paint(curve(), 60);
    expect(specks(fat).length).toBeGreaterThan(specks(thin).length * 4);
    expect(spread(fat, curve())).toBeGreaterThan(spread(thin, curve()) * 3);
  });

  it("keeps the fray at the edge a few pixels however wide the stick", () => {
    // A chipped edge is a chipped edge. If the fray were a fraction of the
    // width, a broad crayon would read as an airbrushed ribbon.
    const points = curve();
    const overhang = (size: number) =>
      spread(paint(points, size), points) - size / 2;
    expect(overhang(60)).toBeLessThan(overhang(16) + 4);
  });

  it("lays wax down the middle of a stick finer than the grain", () => {
    // A crayon narrower than the paper's tooth is a line with nicks in it. It
    // used to come out as a dotted line, because every row it offered landed in
    // the fray at the rim and the middle was never sampled at all.
    const points = curve(200);
    const marked = specks(paint(points, 2)).length;
    expect(marked).toBeGreaterThan(points.length / 2);
  });

  it("thins its detail when the view is pulled back", () => {
    // Grain finer than a device pixel is arithmetic with nothing to show for
    // it, and a page full of it is the difference between panning and not.
    const points = curve();
    expect(specks(paint(points, 24, 0.25)).length).toBeLessThan(
      specks(paint(points, 24, 1)).length / 2,
    );
  });

  it("collapses to a plain line once the whole mark is sub-pixel", () => {
    const ctx = paint(curve(), 1, 0.2);
    // One path for the line, rather than a bucket per weight of grain.
    expect(ctx.strokes).toHaveLength(1);
    expect(ctx.calls.quadraticCurveTo).toBeGreaterThan(0);
  });

  it("leaves a grained patch for a tap rather than a disc", () => {
    const ctx = paint([{ x: 100, y: 100 }], 40);
    const laid = specks(ctx);
    expect(laid.length).toBeGreaterThan(50);
    // Nowhere near the perfect circle `arc` would have drawn.
    expect(ctx.calls.arc ?? 0).toBe(0);
  });

  it("stays inside its budget on a mark that covers the page", () => {
    // A full-page scribble with a broad crayon would ask for hundreds of
    // thousands of specks; the grain coarsens instead so the page keeps up.
    const points: Point[] = [];
    for (let row = 0; row < 14; row++) {
      for (let t = 0; t <= 900; t += 1.5) {
        points.push({ x: row % 2 ? 900 - t : t, y: row * 30 });
      }
    }
    expect(specks(paint(points, 64)).length).toBeLessThan(60000);
  });
});
