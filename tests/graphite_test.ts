// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pencil.
//
// Two claims about it are worth pinning down, and neither needs pixels:
//
//   - **It only ever draws grey**, and which grey depends on the sheet rather
//     than on the toolbar. That is `graphiteInk`, and it is what makes the tool
//     a pencil rather than a textured pen.
//   - **The grade reaches the deposit and not the geometry.** A 6B is a blacker
//     line, never a wider one — which is a statement about the numbers the
//     painter emits, so it can be measured off a recording context the way the
//     crayon's tooth is.

import { describe, expect, it } from "vitest";

import { graphiteInk, paintGraphite } from "../src/app/plugins/graphite.ts";
import { hexToHsv } from "../src/app/color.ts";
import type { Point } from "../src/app/types.ts";
import { createFakeContext, type FakeContext } from "./support/fakeCanvas.ts";

/** A gentle sampled curve, the shape a hand actually draws. */
function curve(length = 200, at = 150): Point[] {
  const points: Point[] = [];
  for (let t = 0; t <= length; t += 1.5) {
    points.push({ x: 40 + t, y: at + Math.sin(t / 50) * 12 });
  }
  return points;
}

/** Every speck a mark laid down, across all of its weight buckets. */
function specks(ctx: FakeContext): [number, number, number, number][] {
  return ctx.strokes.flatMap((stroke) => stroke.runs);
}

/** How much graphite went down in total — specks weighted by the alpha of the
 *  bucket they landed in. The one number that stands for "how dark". */
function deposit(ctx: FakeContext): number {
  let total = 0;
  for (const stroke of ctx.strokes) total += stroke.runs.length * stroke.alpha;
  return total;
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

function drawn(size: number, grade: number): FakeContext {
  const ctx = createFakeContext();
  ctx.globalAlpha = 1;
  paintGraphite(ctx, curve(), size, 1, grade);
  return ctx;
}

describe("the graphite a pencil draws in", () => {
  it("is a dark grey on a light sheet and a light one on a dark sheet", () => {
    const onWhite = graphiteInk("#ffffff");
    const onBlack = graphiteInk("#111827");
    expect(hexToHsv(onWhite).v).toBeLessThan(0.5);
    expect(hexToHsv(onBlack).v).toBeGreaterThan(0.5);
  });

  it("is grey either way — a pencil has no colour to pick", () => {
    for (const page of ["#ffffff", "#111827", "#ef4444", "#22c55e"]) {
      // Not literally r === g === b (graphite is a touch cool), but nowhere
      // near a colour anyone would call one.
      expect(hexToHsv(graphiteInk(page)).s).toBeLessThan(0.12);
    }
  });

  it("reads a page colour it cannot parse as a light sheet", () => {
    // A drawing whose background was hand-edited, or written by a build that
    // stored something else. Drawing dark on white is the safer wrong answer.
    expect(graphiteInk("not a colour")).toBe(graphiteInk("#ffffff"));
  });
});

describe("the lead's grade", () => {
  it("darkens the mark", () => {
    // A soft lead crumbles into the paper's valleys; a hard one rides the
    // peaks and leaves the sheet showing through.
    expect(deposit(drawn(4, 1.7))).toBeGreaterThan(deposit(drawn(4, 0.4)));
  });

  it("never widens it", () => {
    // The whole rule: a 6B is a blacker line, not a fatter one.
    const points = curve();
    const soft = createFakeContext();
    const hard = createFakeContext();
    paintGraphite(soft, points, 6, 1, 1.7);
    paintGraphite(hard, points, 6, 1, 0.5);
    expect(spread(soft, points)).toBeCloseTo(spread(hard, points), 0);
  });
});

describe("the pencil's tooth", () => {
  it("belongs to the page, not to the lead", () => {
    // The crayon's rule, and for the crayon's reason: a fat pencil and a thin
    // one are drawing on the same sheet, so the speckle is the same size and
    // only the band it covers grows.
    const lengths = (size: number) => {
      const ctx = drawn(size, 1);
      const all = specks(ctx)
        .map(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1))
        .sort((a, b) => a - b);
      return all[Math.floor(all.length / 2)] ?? 0;
    };
    expect(lengths(16)).toBeCloseTo(lengths(3), 0);
  });

  it("grains the same way twice, so a repaint cannot shimmer", () => {
    const once = specks(drawn(6, 1));
    const again = specks(drawn(6, 1));
    expect(once).toEqual(again);
    expect(once.length).toBeGreaterThan(0);
  });

  it("collapses to a plain line once the mark is inside a pixel", () => {
    // Pulled right back: the grain is finer than the screen, so drawing it is
    // arithmetic with nothing to show for it.
    const ctx = createFakeContext();
    paintGraphite(ctx, curve(), 2, 0.05, 1);
    expect(ctx.strokes).toHaveLength(1);
    expect(ctx.strokes[0]!.runs.length).toBeLessThan(4);
  });
});
