// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { mm } from "../src/app/units.ts";

import { paintBrush } from "../src/app/plugins/bristle.ts";
import {
  capacityOf,
  coreShare,
  hairLayout,
  loadAt,
  type BrushHead,
} from "../src/app/plugins/head.ts";
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

/** A dead-straight drag, sampled the way the canvas samples a slow hand — so
 *  anything the mark measures across is the head's doing and not the path's. */
function straight(length: number, y = 400): Point[] {
  const points: Point[] = [];
  for (let x = 0; x <= length; x += 1.5) points.push({ x, y });
  return points;
}

/** Every point the painter put on a path, with the pen it was about to be
 *  stroked with.
 *
 *  The fake context records a run as the chord between its two ends (see
 *  `FakeStroke.runs`), which is enough to count hairs and nothing like enough
 *  to measure one: a hair's whole excursion across the head is in the curve
 *  between them. So the path calls themselves are what is read here. */
function pathOf(paint: (ctx: ReturnType<typeof createFakeContext>) => void) {
  const ctx = createFakeContext();
  const at: { x: number; y: number; pen: number }[] = [];
  const put = (x: number, y: number) =>
    at.push({ x, y, pen: ctx.lineWidth as number });
  const moveTo = ctx.moveTo.bind(ctx);
  const lineTo = ctx.lineTo.bind(ctx);
  const curveTo = ctx.quadraticCurveTo.bind(ctx);
  ctx.moveTo = (x: number, y: number) => {
    put(x, y);
    moveTo(x, y);
  };
  ctx.lineTo = (x: number, y: number) => {
    put(x, y);
    lineTo(x, y);
  };
  ctx.quadraticCurveTo = (cx: number, cy: number, x: number, y: number) => {
    put(x, y);
    curveTo(cx, cy, x, y);
  };
  paint(ctx);
  return { ctx, at };
}

/** How wide a mark actually comes out, from the outer edge of one side's
 *  outermost hair to the other's — hair thickness included, because that is
 *  where the ink stops. */
function widthOf(size: number, hardness = 1, fray = 1): number {
  const { at } = pathOf((ctx) =>
    paintBrush(ctx, straight(900), size, hardness, 1, 1, fray),
  );
  const top = Math.min(...at.map((p) => p.y - p.pen / 2));
  const bottom = Math.max(...at.map((p) => p.y + p.pen / 2));
  return bottom - top;
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

  it("lays a mark the width of the head, whatever the dials", () => {
    // The contract the size button makes. Everything that ruffles the edge of a
    // brushed stroke — the clump, the wander, the twist, the fray, the
    // thickness of the outermost strand — used to be *added* to a lane already
    // sitting on the rim, so a #6 round set to 4.8 mm measured nearer 6.7. It
    // is budgeted out of the head now (see "The width of the mark"), and the
    // whole rack has to keep to it.
    for (const size of [mm(1), mm(4.8), mm(12.7), mm(50)]) {
      for (const hard of [0.2, 0.6, 1]) {
        const width = widthOf(size, hard);
        // A hair in the fray strays past the rim by a percent or two at the odd
        // moment, which is what a strand straying out of a bundle does. What it
        // may not do is make the mark another size.
        expect(width).toBeLessThan(size * 1.05);
        // …and not by shrinking away from it either: a mark half the size on
        // the button is the same complaint the other way round.
        expect(width).toBeGreaterThan(size * 0.72);
      }
    }
  });

  it("keeps a worn head inside the head as well", () => {
    // The fray dial opens the bundle a little and that little is `splay`; what
    // it must never do is make the mark another size. A fringe frays *inwards*.
    for (const worn of [0, 1, 2]) {
      expect(widthOf(mm(12.7), 0.8, worn)).toBeLessThan(mm(12.7) * 1.2);
    }
  });

  it("runs a head out inside a drawing rather than across two of them", () => {
    // What ends a brushed stroke is the paint going, and a head that lasted a
    // hundred and fifty millimetres never ran out inside a page — so every mark
    // was the solid end of the stroke and the far end coming apart into hairs
    // was something you had to cross the sheet twice to see.
    const spent = capacityOf(mm(4.8), 1);
    expect(spent).toBeGreaterThan(mm(20));
    expect(spent).toBeLessThan(mm(60));
    // Which shows up as a mark: the far half of a long drag has appreciably
    // less hair on the paper than its first half.
    const { at } = pathOf((ctx) =>
      paintBrush(ctx, straight(spent * 2), mm(4.8), 1, 1),
    );
    const near = at.filter((p) => p.x < spent).length;
    const far = at.filter((p) => p.x >= spent).length;
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(near * 0.75);
  });

  it("costs the patch it is asked for rather than the whole drag", () => {
    // A brush is one path per *hair*, so a mark that crosses the window cannot
    // be culled a stroke at a time the way the airbrush's cones can — the hair
    // lifts over the stretches that are off screen instead. That is the
    // difference between a zoomed-in pan costing the strip of page it exposed
    // and costing every mark that crosses it end to end.
    const patch = { x: 400, y: 380, width: 80, height: 60 };
    const whole = pathOf((ctx) =>
      paintBrush(ctx, straight(3000), mm(4.8), 0.9, 1),
    );
    const cut = pathOf((ctx) =>
      paintBrush(
        ctx,
        straight(3000),
        mm(4.8),
        0.9,
        1,
        1,
        1,
        0,
        undefined,
        patch,
      ),
    );
    expect(cut.at.length).toBeGreaterThan(0);
    expect(cut.at.length).toBeLessThan(whole.at.length * 0.1);

    // …and nothing it did draw is anywhere the patch could not see. A head
    // reaches half its width off the path it follows and a sample either side
    // of that, which the padding here is comfortably outside.
    const pad = mm(4.8) * 1.5;
    for (const { x, y } of cut.at) {
      expect(x).toBeGreaterThan(patch.x - pad);
      expect(x).toBeLessThan(patch.x + patch.width + pad);
      expect(y).toBeGreaterThan(patch.y - pad);
      expect(y).toBeLessThan(patch.y + patch.height + pad);
    }
  });

  it("paints the same mark inside a patch as it does without one", () => {
    // The other half of that, and the one that makes it safe: what a patch
    // frame puts on the screen has to be what a full repaint would have put
    // there. So every point the culled mark laid down inside the patch has to
    // be a point the whole mark laid down, exactly.
    //
    // Inside the patch and not in the ring of slack around it: out there a hair
    // is cut short and a band is squared off, both of which land somewhere the
    // caller is not keeping. That is the whole reason the slack is there.
    const patch = { x: 300, y: 300, width: 240, height: 200 };
    const whole = pathOf((ctx) =>
      paintBrush(ctx, straight(1200), mm(4.8), 0.9, 1),
    );
    const cut = pathOf((ctx) =>
      paintBrush(
        ctx,
        straight(1200),
        mm(4.8),
        0.9,
        1,
        1,
        1,
        0,
        undefined,
        patch,
      ),
    );
    const key = (p: { x: number; y: number; pen: number }) =>
      `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.pen.toFixed(6)}`;
    const drawn = new Set(whole.at.map(key));
    const inside = cut.at.filter(
      (p) => p.x > patch.x && p.x < patch.x + patch.width,
    );
    expect(inside.length).toBeGreaterThan(50);
    for (const point of inside) expect(drawn.has(key(point))).toBe(true);
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
