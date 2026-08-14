// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { hairLayout, paintBrush } from "../src/app/plugins/bristle.ts";
import type { Point } from "../src/app/types.ts";

import { createFakeContext } from "./support/fakeCanvas.ts";

// What a brush head is made of, pinned.
//
// The one thing that made this tool read as fake was hair that scaled with the
// brush: a wide head came out as a dozen fat noodles, because the strands were
// a *share* of the width. Real filament is milled in a narrow band of gauges —
// a fine sable at about 0.075 mm, the coarsest hog at about 0.3 mm — while
// heads span 4 mm to 50 mm. A head fifteen times as wide carries hair some
// three times as thick and about five times as many streaks.
//
// So these are ratio tests rather than pixel tests: over the app's whole size
// range the hair count has to grow with the head and the hair *gauge* has to
// stay very nearly put. Everything else here is the geometry that the painter
// would otherwise be free to break silently — the strands come out as strokes
// on a recording context, so the whole head can be counted without a canvas.

/** The stroke sizes the app can actually produce: the size picker's 1–96,
 *  times the paintbrush's 2.5 size scale. */
const SIZES = [2.5, 5, 15, 40, 100, 240];

/** The widest a strand may be on the app's widest brush, in document pixels —
 *  about a millimetre of head at a hundred-ish dots to the inch, which is a
 *  clump of house-brush bristle and the coarsest thing that still reads as
 *  hair. The old model drew three times this. */
const size240HairCeiling = 9;

/** A drag, sampled the way the canvas samples a pointer. */
function drag(length: number): Point[] {
  const points: Point[] = [];
  for (let x = 0; x <= length; x += 2) {
    points.push({ x, y: 40 + Math.sin(x / 90) * 6 });
  }
  return points;
}

/** Paint a mark and report every hair that was laid down: how wide it was set
 *  to, and how many there were. */
function hairsOf(size: number, hardness = 0.8, scale = 1) {
  const ctx = createFakeContext();
  const widths: number[] = [];
  const stroke = ctx.stroke.bind(ctx);
  ctx.stroke = () => {
    widths.push(ctx.lineWidth);
    stroke();
  };
  paintBrush(ctx, drag(600), size, hardness, scale);
  return { widths, count: widths.length };
}

describe("hairLayout", () => {
  it("answers a wider head with more hairs, not thicker ones", () => {
    const narrow = hairLayout(15);
    const wide = hairLayout(240);
    expect(wide.count).toBeGreaterThan(narrow.count * 3);
    expect(wide.pitch).toBeLessThan(narrow.pitch * 3);
  });

  it("keeps the hair gauge inside a real filament's range", () => {
    // Sixteen times the head, nowhere near sixteen times the hair: the whole
    // point. Three-ish is what a rack of real brushes does.
    const across = SIZES.map((size) => hairLayout(size).pitch);
    const finest = Math.min(...across);
    const coarsest = Math.max(...across);
    expect(coarsest / finest).toBeLessThan(4);
  });

  it("gives every head enough hairs to be a head, and caps the widest", () => {
    for (const size of SIZES) {
      const { count } = hairLayout(size);
      // Two is the floor, and only the very smallest head reaches it: a mark
      // two pixels across has room for two strands and no more.
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(56);
    }
    expect(hairLayout(15).count).toBeGreaterThanOrEqual(5);
  });

  it("takes the brush off a different rack when the gauge is turned", () => {
    // The dial the size panel offers: same head, different filament. Fine hair
    // means more, thinner streaks; coarse means fewer, broader ones — and
    // neither touches the width of the mark.
    const ordinary = hairLayout(60);
    const fine = hairLayout(60, 1, 0.5);
    const coarse = hairLayout(60, 1, 2);
    expect(fine.pitch).toBeLessThan(ordinary.pitch);
    expect(coarse.pitch).toBeGreaterThan(ordinary.pitch);
    expect(fine.count).toBeGreaterThan(ordinary.count);
    expect(coarse.count).toBeLessThan(ordinary.count);
  });

  it("still gives a coarse head hairs to draw with", () => {
    // The floor holds however extreme the gauge: a head with one strand is a
    // line, not a brush.
    expect(hairLayout(4, 1, 2).count).toBeGreaterThanOrEqual(2);
    expect(hairLayout(240, 1, 0.5).count).toBeLessThanOrEqual(56);
  });

  it("drops hairs a screen cannot resolve and widens what is left", () => {
    // Zoomed out far enough that the head is a few pixels: most of the strands
    // would land inside a pixel another strand already covered.
    const full = hairLayout(100, 1);
    const tiny = hairLayout(100, 0.08);
    expect(tiny.count).toBeLessThan(full.count);
    // What is dropped has to be paid back in width, or the mark would thin out
    // as you pull away from it.
    expect(tiny.count * tiny.merged).toBeCloseTo(full.count * full.merged, 5);
  });
});

describe("paintBrush", () => {
  it("draws finer hairs as the head widens", () => {
    // The regression this whole model exists for: at a share-of-the-width the
    // widest brush drew 15-pixel strands. Hair may coarsen with the head — real
    // hair does — but nothing like in proportion to it.
    const narrow = hairsOf(15);
    const wide = hairsOf(240);
    const widest = (hairs: number[]) => Math.max(...hairs);
    expect(widest(wide.widths)).toBeLessThan(widest(narrow.widths) * 4);
    expect(widest(wide.widths)).toBeLessThan(size240HairCeiling);
  });

  it("lays a wide head down as many strands", () => {
    const counts = SIZES.map((size) => hairsOf(size).count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
    expect(counts[counts.length - 1]!).toBeGreaterThan(counts[0]! * 5);
  });

  it("paints the same mark every time", () => {
    // Every repaint — a pan, an undo, the PNG export — runs this again, so a
    // hair placed at random would shimmer.
    const once = hairsOf(60);
    const twice = hairsOf(60);
    expect(twice.widths).toEqual(once.widths);
  });

  it("collapses to a plain line when the mark is a hairline", () => {
    // A head an eighth of a pixel across has no texture to show; a hundred
    // sub-pixel strands would be arithmetic with nothing to render.
    const ctx = createFakeContext();
    paintBrush(ctx, drag(600), 40, 0.8, 0.003);
    // One pass — the plain line the hairs would have averaged out to — where a
    // resolvable head lays down dozens.
    expect(ctx.calls.stroke ?? 0).toBe(1);
    expect(hairsOf(40, 0.8, 1).count).toBeGreaterThan(5);
  });

  it("leaves a mark for a tap", () => {
    const ctx = createFakeContext();
    paintBrush(ctx, [{ x: 10, y: 10 }], 40, 0.8, 1);
    expect(ctx.calls.fill ?? 0).toBeGreaterThan(0);
  });

  it("paints at the stroke's own opacity", () => {
    // The mark is opaque paint with the hairs' partings scratched through it,
    // not a weave of translucent threads — so no pass may quietly dim itself.
    const ctx = createFakeContext();
    ctx.globalAlpha = 0.6;
    const seen: number[] = [];
    const stroke = ctx.stroke.bind(ctx);
    ctx.stroke = () => {
      seen.push(ctx.globalAlpha);
      stroke();
    };
    paintBrush(ctx, drag(600), 60, 0.8, 1);
    expect(seen.length).toBeGreaterThan(0);
    for (const alpha of seen) expect(alpha).toBeCloseTo(0.6, 10);
  });
});
