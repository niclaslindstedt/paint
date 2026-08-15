// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Watercolour.
//
// The medium is a claim about *water*, and every one of its recognisable
// features follows from that: the wash runs past the hair that laid it, its two
// sides follow the sheet rather than the gesture, the rim dries darkest, and
// nothing covers what is under it. Those are claims about the numbers the
// painter emits, so they can be checked without a canvas — paint onto a
// recording context and measure the outline it traced.

import { describe, expect, it } from "vitest";

import { paintWash } from "../src/app/plugins/aquarelle.ts";
import type { Point } from "../src/app/types.ts";
import { mm } from "../src/app/units.ts";
import { createFakeContext, type FakeContext } from "./support/fakeCanvas.ts";

/** A gentle sampled curve, the shape a hand actually draws. */
function curve(length = 400): Point[] {
  const points: Point[] = [];
  for (let t = 0; t <= length; t += 4) {
    points.push({ x: 60 + t, y: 300 + Math.sin(t / 90) * 20 });
  }
  return points;
}

/** A wash, and every point of the edges it traced.
 *
 *  The wash is drawn as one closed curve through its own samples — water does
 *  not turn corners, so the outline is quadratics rather than straights (see
 *  `pool`) — and each curve's *control* point is the sample it was built from.
 *  Intercepting them is therefore reading the shape of the mark. */
function paint(
  size: number,
  o: { scale?: number; water?: number; pigment?: number; grain?: number } = {},
): { ctx: FakeContext; edge: [number, number][] } {
  const ctx = createFakeContext();
  ctx.globalAlpha = 1;
  const edge: [number, number][] = [];
  const curveTo = ctx.quadraticCurveTo.bind(ctx);
  ctx.quadraticCurveTo = (cx: number, cy: number, x: number, y: number) => {
    edge.push([cx, cy]);
    curveTo(cx, cy, x, y);
  };
  paintWash(
    ctx,
    curve(),
    size,
    o.scale ?? 1,
    o.water ?? 1,
    o.pigment ?? 1,
    o.grain ?? 0.6,
  );
  return { ctx, edge };
}

/** How far the wash reached from the path it was drawn along. */
function reach(edge: readonly [number, number][]): number {
  const points = curve();
  let widest = 0;
  for (const [x, y] of edge) {
    let nearest = Infinity;
    for (const p of points) {
      nearest = Math.min(nearest, Math.hypot(p.x - x, p.y - y));
    }
    widest = Math.max(widest, nearest);
  }
  return widest;
}

describe("a wash", () => {
  it("dries the same way every time", () => {
    // Every repaint — a pan, an undo, the PNG export — repaints from the
    // document, so a wash whose edge wandered at random would shimmer.
    const once = paint(mm(6)).edge;
    const again = paint(mm(6)).edge;
    expect(once.length).toBeGreaterThan(50);
    expect(again).toEqual(once);
  });

  it("spreads past the hair that laid it, and further the wetter it is", () => {
    // The first thing anyone touching the medium learns: it is water you are
    // painting with, and the pigment goes where the water takes it.
    const dry = reach(paint(mm(6), { water: 0.2 }).edge);
    const wet = reach(paint(mm(6), { water: 2 }).edge);
    expect(wet).toBeGreaterThan(dry * 1.2);
    // …and even dry it is a brush of that width, not a hairline.
    expect(dry).toBeGreaterThan(mm(6) / 4);
  });

  it("gives its two sides minds of their own", () => {
    // A width that wobbles symmetrically is a sausage: the two edges mirror
    // each other and the eye reads the centreline as a drawn path. Water does
    // not know where the centreline is, so one edge can bulge while the other
    // holds straight.
    const points = curve();
    const { edge } = paint(mm(8), { water: 1.6 });
    const sides: [number[], number[]] = [[], []];
    for (const [x, y] of edge) {
      let nearest = Infinity;
      let at = points[0]!;
      for (const p of points) {
        const gap = Math.hypot(p.x - x, p.y - y);
        if (gap < nearest) {
          nearest = gap;
          at = p;
        }
      }
      sides[y < at.y ? 0 : 1]!.push(nearest);
    }
    const spread = (list: number[]) =>
      Math.max(...list) - Math.min(...list.filter((v) => v > 0.5));
    expect(sides[0]!.length).toBeGreaterThan(10);
    expect(sides[1]!.length).toBeGreaterThan(10);
    // Neither side is a constant offset from the path — a wet edge is not a
    // ruled one.
    expect(spread(sides[0]!)).toBeGreaterThan(mm(0.4));
    expect(spread(sides[1]!)).toBeGreaterThan(mm(0.4));
  });

  it("lays every pass down thin, because nothing in watercolour covers", () => {
    // The sheet is the white, and every layer is a filter over what is under
    // it — so a single pass must never be opaque, or glazing cannot deepen it
    // and the medium is gouache.
    const { ctx } = paint(mm(6));
    // Several passes — the water that ran ahead, the wash, the rim, the
    // pigment that gathered — and not one of them near opaque.
    expect(ctx.calls.fill).toBeGreaterThan(2);
    for (const stroke of ctx.strokes) {
      expect(stroke.alpha).toBeLessThan(0.5);
      expect(stroke.alpha).toBeGreaterThan(0);
    }
  });

  it("dries darkest at the rim", () => {
    // A pool evaporates fastest at its edge and the pigment travels out to
    // replace what left. That line is what makes a laid wash look laid rather
    // than airbrushed, so it is stroked over the very outline the fill closed.
    const { ctx } = paint(mm(6));
    expect(ctx.strokes.length).toBeGreaterThan(0);
    // Thin and hard against the wash it edges: it is where the pigment ended
    // up, not where it was laid.
    expect(ctx.strokes[0]!.lineWidth).toBeLessThan(mm(6) / 3);
    expect(ctx.strokes[0]!.lineWidth).toBeGreaterThan(0);
  });

  it("settles pigment into the sheet, and only when asked to", () => {
    // Granulation is the paper and the colour rather than the brush: rough
    // stock and a mineral pigment mottle enough to see across a room, and a
    // hot-pressed sheet does not mottle at all.
    const mottled = paint(mm(10), { grain: 1.5 }).ctx.calls.arc ?? 0;
    const smooth = paint(mm(10), { grain: 0 }).ctx.calls.arc ?? 0;
    expect(mottled).toBeGreaterThan(50);
    expect(smooth).toBe(0);
  });

  it("stops drawing detail the screen cannot show", () => {
    // Pulled back far enough and the whole wash is inside a pixel: a stain
    // that small is a line, and it is painted as one at the weight the wash
    // would have dried to, so the page does not lighten as you zoom out of it.
    const near = paint(mm(6), { scale: 1 });
    const pulled = paint(mm(6), { scale: 0.02 });
    expect(pulled.edge.length).toBeLessThan(near.edge.length / 3);
    // The mottle goes first — a pool finer than a pixel is arithmetic with
    // nothing to show for it.
    expect(pulled.ctx.calls.arc ?? 0).toBe(0);
    // …and past the point where the whole wash is inside one pixel, the mark
    // is simply a line: no outline is traced and nothing is filled.
    const far = paint(mm(6), { scale: 0.005 });
    expect(far.ctx.calls.fill ?? 0).toBe(0);
    expect(far.ctx.strokes.length).toBeGreaterThan(0);
  });

  it("leaves a blot for a touch of the brush rather than a disc", () => {
    // Wet paper takes the shape of the sheet under it, so the one thing a
    // single touch must not be is a circle.
    const ctx = createFakeContext();
    paintWash(ctx, [{ x: 50, y: 50 }], mm(8));
    expect(ctx.calls.fill).toBe(1);
    // Traced as a ragged loop rather than arced — a blot is a polygon the
    // sheet decided the shape of, so there is no `arc` anywhere in it.
    expect(ctx.calls.arc ?? 0).toBe(0);
    expect(ctx.calls.lineTo ?? 0).toBeGreaterThan(10);
  });
});
