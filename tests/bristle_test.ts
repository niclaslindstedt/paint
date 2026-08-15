// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { mm } from "../src/app/units.ts";

import {
  capacityOf,
  coreShare,
  hairLayout,
  loadAt,
  paintBrush,
  type BrushHead,
} from "../src/app/plugins/bristle.ts";
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

/** How much of a mark actually reaches the paper.
 *
 *  Every sample a hair is down for is one `quadraticCurveTo` into that hair's
 *  path (see `openStrand`), and every sample it has lifted for is none. So the
 *  tally of them over a whole head, against the samples that head *could* have
 *  covered, is the coverage of the mark — which is the one number the reference
 *  photo is a series of, and the one this painter used to hold nearly constant
 *  while the dial moved. */
function coverageOf(size: number, hardness: number, length = 600): number {
  const ctx = createFakeContext();
  paintBrush(ctx, drag(length), size, hardness, 1);
  return ctx.calls.quadraticCurveTo ?? 0;
}

/** The same thing as a fraction of what that head lays down fully charged, so
 *  two different sizes can be compared without the hair count deciding it. */
function coverageShare(size: number, hardness: number): number {
  return coverageOf(size, hardness) / coverageOf(size, 1);
}

/** How far across the drag a head of a given shape actually reaches — the
 *  width of the mark, read off the hairs it laid rather than off any number the
 *  painter was handed. */
function spreadOf(head: BrushHead, size = mm(12)): number {
  const ctx = createFakeContext();
  const points = drag(600);
  const ys: number[] = [];
  const to = ctx.quadraticCurveTo.bind(ctx);
  ctx.quadraticCurveTo = (cx: number, cy: number, x: number, y: number) => {
    ys.push(y);
    to(cx, cy, x, y);
  };
  paintBrush(ctx, points, size, 0.8, 1, 1, 1, 0, head);
  // Against the path's own middle, so the drag's own wave doesn't count as
  // width.
  const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
  return Math.max(...ys.map((y) => Math.abs(y - mid)));
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

  it("lays a pressure series down, not five copies of one mark", () => {
    // The regression this whole model exists for, and the one a reference sheet
    // makes obvious: dry brush, light, medium, heavy and loaded are the *same*
    // brush at five loads, and what separates them is how much paper is left
    // showing. Before this they came out as one solid slab five times over,
    // because the dial moved the hairs' wobble and almost nothing else.
    const series = [0.05, 0.3, 0.6, 0.85, 1].map((hard) =>
      coverageOf(90, hard),
    );
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!).toBeGreaterThan(series[i - 1]!);
    }
    // And the two ends have to be far apart, not merely ordered: a dry head
    // leaves under half what a charged one does.
    expect(series[0]!).toBeLessThan(series[series.length - 1]! * 0.5);
  });

  it("leaves a dry head a mark rather than nothing", () => {
    // The other side of it. A brush with a dry patch is not a brush with no
    // paint, and a stroke the user cannot see is a stroke they cannot undo
    // their way out of having drawn.
    expect(coverageShare(90, 0)).toBeGreaterThan(0.2);
  });

  it("keeps the small heads people actually draw with solid", () => {
    // The paper's grain does not shrink with the brush: a head narrower than
    // the dips a wide one skips over rides the sheet instead of catching on
    // it. Applied flat, the same skip rate turns a liner into a dashed ghost.
    //
    // Measured across the range where the *paper* is what decides it — a
    // spotter's third of a millimetre against a #2 round — because `grainShare`
    // saturates at about three millimetres of head and past that it is the hair
    // count (capped at `MAX_HAIRS`) that sets this ratio rather than the sheet.
    // A one-inch flat therefore reads solid again, which is a property of the
    // strand budget and not a claim about paper.
    expect(coverageShare(mm(0.3), 0.5)).toBeGreaterThan(
      coverageShare(mm(2), 0.5),
    );
    // A charged head that small is a line, near enough — it has no room for a
    // texture and should not pretend to.
    expect(coverageShare(mm(0.3), 0.9)).toBeGreaterThan(0.9);
  });

  it("spends a wide head's load over a wide head's distance", () => {
    // A loaded brush plateaus and then gives out; a dry one is spent almost at
    // once. Both are the same curve at different exponents, and the ordering is
    // what makes a lifted stroke read as solid-then-hair rather than as a fade.
    const far = capacityOf(80, 1) * 0.6;
    expect(loadAt(far, capacityOf(80, 1), 1)).toBeGreaterThan(0.5);
    expect(loadAt(far, capacityOf(80, 0), 0)).toBeLessThan(0.35);
    // A bigger head holds more, and a charged one holds more than a spent one.
    expect(capacityOf(200, 1)).toBeGreaterThan(capacityOf(20, 1));
    expect(capacityOf(80, 1)).toBeGreaterThan(capacityOf(80, 0) * 3);
  });

  it("pools a body only under a head that has one, and never a slab", () => {
    // The pooled middle is the difference between the top of the series and the
    // rest of it. It has to reach nothing at the dry end — a light mark is hairs
    // and paper, with no body under it — and it must never cover the whole head,
    // because every gap it covers is a parting that does not get drawn and the
    // partings are the entire texture.
    expect(coreShare(0)).toBe(0);
    expect(coreShare(0.2)).toBe(0);
    expect(coreShare(1)).toBeGreaterThan(0.4);
    expect(coreShare(1)).toBeLessThan(0.7);
    expect(coreShare(1)).toBeGreaterThan(coreShare(0.6));
  });

  it("frays the head as far as the splay dial asks and no further", () => {
    // The dial is the *state* of the bundle, not its make: a new flat cuts a
    // crisp side, a worn one has a fringe. It may widen the mark a little —
    // a splayed brush is wider — but a fringe is not a wider brush, so the
    // outermost hair stays within a whisker of the head it belongs to.
    const spread = (fray: number) => {
      const ctx = createFakeContext();
      paintBrush(ctx, drag(600), 80, 0.8, 1, 1, fray);
      const ys = ctx.strokes.flatMap((s) =>
        s.runs.flatMap((r) => [r[1], r[3]]),
      );
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread(2)).toBeGreaterThan(spread(0));
    // The path itself wanders (see `drag`), so this is the head's own width
    // plus that — generous, and still nowhere near a mark twice its size.
    expect(spread(2)).toBeLessThan(80 * 2);
  });

  it("bleeds only when asked, and softens rather than restating the mark", () => {
    // Paper that wicks is not the ordinary case, so a mark carrying no dial
    // paints exactly what it did before the dial existed.
    const dry = createFakeContext();
    paintBrush(dry, drag(600), 60, 0.8, 1, 1, 1, 0);
    const wet = createFakeContext();
    paintBrush(wet, drag(600), 60, 0.8, 1, 1, 1, 1);
    expect(wet.calls.stroke!).toBeGreaterThan(dry.calls.stroke!);
    // The halo is drawn under the mark and faint. Nothing may be laid down at
    // *more* than the stroke's own opacity, or a bled edge would print darker
    // than the mark it surrounds.
    const halo = wet.strokes.filter((s) => s.alpha < 1);
    expect(halo.length).toBeGreaterThan(0);
    for (const pass of halo) expect(pass.alpha).toBeLessThan(0.35);
    expect(dry.strokes.every((s) => s.alpha === 1)).toBe(true);
  });

  it("closes a flat down to its edge, and holds a round's width", () => {
    // A chisel ferrule squeezes the bundle into a blade: pull it square across
    // itself and it lays its whole width, pull it along its own edge and it
    // lays the thickness of the hair. That single projection is the entire
    // reason a sign-writer owns one, and it is what a round — a cone of hair —
    // cannot do.
    //
    // The drag below runs left to right, so a blade held *across* it (90°) is
    // at full width and one held *along* it (0°) is on its edge.
    const across = spreadOf({ shape: "flat", angle: Math.PI / 2 });
    const along = spreadOf({ shape: "flat", angle: 0 });
    expect(along).toBeLessThan(across * 0.4);
    // Not to nothing, though: a bundle of hair still has a body, and an
    // edge-on flat leaves a line you can letter with.
    expect(along).toBeGreaterThan(across * 0.05);
    // A round is the same mark whichever way it is turned.
    expect(spreadOf({ shape: "round", angle: 0 })).toBeCloseTo(
      spreadOf({ shape: "round", angle: Math.PI / 2 }),
      6,
    );
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
