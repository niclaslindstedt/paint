// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rubber's medium — a block worked over a sheet somebody drew on.
//
// The claims worth pinning are the ones that make it a rubber rather than a
// hole, and every one of them is a statement about the numbers the painter
// emits, so they can be read off a recording context exactly as the pencil's
// grade is:
//
//   - **One pass never takes everything.** No lane is painted at full alpha, so
//     however hard the hand leans there is always something left underneath.
//   - **Pressure reaches the depth, not the width.** Leaning on a rubber gets it
//     further into the sheet's tooth; it does not make the rubber bigger.
//   - **The tooth belongs to the page**, so a wide rubber is a wider band of the
//     same speckle rather than a small one blown up — and it grains identically
//     on every repaint, or a rubbed patch would crawl as you panned.

import { describe, expect, it } from "vitest";

import { paperTooth } from "../src/app/plugins/graphite.ts";
import { dropHeldRubbing, paintRubbing } from "../src/app/plugins/rubber.ts";
import type { Point } from "../src/app/types.ts";
import {
  createFakeCanvas,
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

/** A gentle sampled curve, the shape a hand actually rubs along. */
function curve(length = 200, at = 150): Point[] {
  const points: Point[] = [];
  for (let t = 0; t <= length; t += 1.5) {
    points.push({ x: 40 + t, y: at + Math.sin(t / 50) * 12 });
  }
  return points;
}

/** Every cell the face lifted from, across all of its weight buckets. */
function lifts(ctx: FakeContext): [number, number, number, number][] {
  return ctx.strokes.flatMap((stroke) => stroke.runs);
}

/** How much came off in total — cells weighted by the alpha of the bucket they
 *  landed in. The one number that stands for "how much paler". */
function taken(ctx: FakeContext): number {
  let total = 0;
  for (const stroke of ctx.strokes) total += stroke.runs.length * stroke.alpha;
  return total;
}

/** How far the rubbing reaches across the path it was worked along. */
function spread(ctx: FakeContext, points: readonly Point[]): number {
  let widest = 0;
  for (const [x1, y1] of lifts(ctx)) {
    let nearest = Infinity;
    for (const p of points) {
      nearest = Math.min(nearest, Math.hypot(p.x - x1, p.y - y1));
    }
    widest = Math.max(widest, nearest);
  }
  return widest;
}

function rubbed(size: number, pressure: number, scale = 1): FakeContext {
  const ctx = createFakeContext();
  ctx.globalAlpha = 1;
  paintRubbing(ctx, curve(), size, scale, pressure);
  return ctx;
}

describe("one pass of a rubber", () => {
  it("never takes all of what is under it", () => {
    // The whole difference from the eraser, whose strength dial reaches 1 and
    // takes the page back to white in a drag. Under `destination-out` the alpha
    // *is* the fraction removed, so a lane at 1 would be a hole.
    for (const pressure of [0.3, 1, 1.6]) {
      for (const stroke of rubbed(10, pressure).strokes) {
        expect(stroke.alpha).toBeGreaterThan(0);
        expect(stroke.alpha).toBeLessThan(0.75);
      }
    }
  });

  it("leaves less behind the harder you lean on it", () => {
    // …and it is a ramp rather than a switch: every step up the dial gets the
    // face further into the sheet.
    expect(taken(rubbed(10, 1.6))).toBeGreaterThan(taken(rubbed(10, 1)));
    expect(taken(rubbed(10, 1))).toBeGreaterThan(taken(rubbed(10, 0.4)));
  });

  it("fades what is left instead of clearing it", () => {
    // Two passes take more than one and less than twice one: what a pass
    // removes is a *fraction* of what is there, so the mark halves and halves
    // and never reaches nothing. Read off the strongest lane, which is the
    // fastest any pixel under this can be going.
    const strongest = Math.max(...rubbed(10, 1).strokes.map((s) => s.alpha));
    const left = (passes: number) => (1 - strongest) ** passes;
    expect(left(1)).toBeGreaterThan(0.2);
    expect(left(4)).toBeLessThan(left(1));
    expect(left(20)).toBeGreaterThan(0);
  });
});

describe("the hand on the rubber", () => {
  it("reaches the depth and never the width", () => {
    // The pencil's rule for its grade, said about the other end of the same
    // sheet: leaning on a rubber does not make it a bigger rubber.
    const points = curve();
    const hard = createFakeContext();
    const light = createFakeContext();
    paintRubbing(hard, points, 12, 1, 1.6);
    paintRubbing(light, points, 12, 1, 0.4);
    expect(spread(hard, points)).toBeCloseTo(spread(light, points), 0);
  });
});

describe("the sheet the rubber reads", () => {
  it("is the one the pencil wrote on", () => {
    // Not a claim about this painter so much as about the pair: the ghost a
    // rubbing out leaves is graphite in tooth the face could not reach, and
    // that is only true while both implements agree where the tooth is. The
    // shared lattice is `paperTooth`, and it is deterministic — the property
    // both of them are built on.
    expect(paperTooth(3, 7)).toBe(paperTooth(3, 7));
    expect(paperTooth(3, 7)).not.toBe(paperTooth(4, 7));
  });

  it("belongs to the page, not to the rubber", () => {
    const lengths = (size: number) => {
      const all = lifts(rubbed(size, 1))
        .map(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1))
        .sort((a, b) => a - b);
      return all[Math.floor(all.length / 2)] ?? 0;
    };
    expect(lengths(20)).toBeCloseTo(lengths(4), 0);
  });

  it("grains the same way twice, so a rubbed patch cannot crawl", () => {
    const once = lifts(rubbed(8, 1));
    const again = lifts(rubbed(8, 1));
    expect(once).toEqual(again);
    expect(once.length).toBeGreaterThan(0);
  });

  it("collapses to a plain line once the mark is inside a pixel", () => {
    // Pulled right back: the grain is finer than the screen, so what is left of
    // a rubbing out is a line taking off what the cells average out to.
    const ctx = createFakeContext();
    paintRubbing(ctx, curve(), 2, 0.05, 1);
    expect(ctx.strokes).toHaveLength(1);
    expect(ctx.strokes[0]!.runs.length).toBeLessThan(4);
    expect(ctx.strokes[0]!.alpha).toBeLessThan(1);
  });

  it("lays only the presses that can reach the patch it is handed", () => {
    // The clip is a permission to skip, never an instruction to change: every
    // cell it keeps is a cell the unclipped paint laid, bit for bit — the
    // grain reads off the whole mark and the page, not off the box — and every
    // cell that lands inside the box is kept. What the live canvas leans on
    // when it repaints a rubbing out only where there is pencil under it.
    const points = curve();
    const whole = createFakeContext();
    paintRubbing(whole, points, 12, 1, 1);
    const clip = { x: 90, y: 130, width: 70, height: 50 };
    const kept = createFakeContext();
    paintRubbing(kept, points, 12, 1, 1, clip);

    const all = lifts(whole);
    const inside = lifts(kept);
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.length).toBeLessThan(all.length);

    const cell = (run: readonly number[]) => run.join(",");
    const laid = new Set(all.map(cell));
    for (const run of inside) expect(laid.has(cell(run))).toBe(true);

    const within = ([x1, y1, x2, y2]: [number, number, number, number]) =>
      [x1, x2].every((x) => x >= clip.x && x <= clip.x + clip.width) &&
      [y1, y2].every((y) => y >= clip.y && y <= clip.y + clip.height);
    const keptCells = new Set(inside.map(cell));
    for (const run of all.filter(within)) {
      expect(keptCells.has(cell(run))).toBe(true);
    }
  });

  it("dabs rather than drags when the gesture never moved", () => {
    // A kneaded eraser pressed onto a highlight and lifted straight off. One
    // point is a patch of grain, not a dot and not nothing.
    const at = { x: 100, y: 100 };
    const ctx = createFakeContext();
    paintRubbing(ctx, [at], 12, 1, 1);
    // A patch of the sheet rather than one cell of it, and reaching most of the
    // way out to the width the rubber was set to.
    expect(lifts(ctx).length).toBeGreaterThan(8);
    expect(spread(ctx, [at])).toBeGreaterThan(3);
  });
});

// The rubbing under the hand goes through a held walk — each press laid once
// into a union per weight, the still-changing tail laid over a copy per frame
// (see `paintLiveRubbing`). The one claim that matters is that the arrangement
// is invisible: at any frame, the lanes on screen are exactly the lanes the
// full drag would have laid for the same gesture. A press laid too early, laid
// twice, or laid at a weight the end could still have changed all move or
// duplicate lane endpoints, so comparing the endpoint multiset catches every
// way the walk could drift.

describe("the rubbing under the hand", () => {
  /** Every lane laid across a set of surfaces, as rounded endpoint keys. */
  function laneKeys(
    runs: readonly [number, number, number, number][],
  ): string[] {
    return runs.map((run) => run.map((v) => v.toFixed(4)).join(","));
  }

  it("lays exactly the lanes the full drag would have", () => {
    const dom = withFakeDocument();
    dropHeldRubbing();
    try {
      const points = curve(80);
      const live = createFakeCanvas(400, 300).ctx;
      live.globalAlpha = 1;

      // The gesture, advanced a few samples at a time — every prefix shares
      // its point objects with the full path, exactly as a draft does.
      const frames: Point[][] = [];
      for (let upto = 2; upto < points.length; upto += 3) {
        frames.push(points.slice(0, upto));
      }
      frames.push(points);
      let tailFrom = 0;
      for (const prefix of frames) {
        // Where the combining surface's record stood before the last frame,
        // so its final tail can be read off the end.
        tailFrom = dom.created[3]?.ctx.strokes.length ?? 0;
        paintRubbing(live, prefix, 14, 1, 1, undefined, true);
      }

      // The lanes on screen after the last frame: everything settled into the
      // weight unions — however many frames laid them, and across a regrow —
      // plus the tail the last frame laid over them.
      const settled = dom.created
        .filter((_, at) => at !== 3)
        .flatMap((surface) => surface.ctx.strokes.flatMap((s) => s.runs));
      const tail = dom.created[3]!.ctx.strokes.slice(tailFrom).flatMap(
        (s) => s.runs,
      );

      // …and the lanes one full drag lays for the same gesture.
      const whole = createFakeContext();
      whole.globalAlpha = 1;
      paintRubbing(whole, points, 14, 1, 1);
      const wanted = whole.strokes.flatMap((s) => s.runs);

      expect(settled.length + tail.length).toBe(wanted.length);
      expect([...laneKeys(settled), ...laneKeys(tail)].sort()).toEqual(
        laneKeys(wanted).sort(),
      );
    } finally {
      dropHeldRubbing();
      dom.restore();
    }
  });

  it("costs the presses that arrived, not the presses that ever were", () => {
    const dom = withFakeDocument();
    dropHeldRubbing();
    try {
      const points = curve(200);
      const live = createFakeCanvas(400, 300).ctx;
      live.globalAlpha = 1;
      paintRubbing(
        live,
        points.slice(0, points.length - 3),
        14,
        1,
        1,
        undefined,
        true,
      );
      const settledOnce = dom.created
        .filter((_, at) => at !== 3)
        .map((surface) => surface.ctx.strokes.flatMap((s) => s.runs).length);

      // One more frame near the end of a long scrub: the unions gain at most
      // the few presses that settled, never the gesture again.
      paintRubbing(live, points, 14, 1, 1, undefined, true);
      const settledTwice = dom.created
        .filter((_, at) => at !== 3)
        .map((surface) => surface.ctx.strokes.flatMap((s) => s.runs).length);
      const grewBy =
        settledTwice.reduce((a, b) => a + b, 0) -
        settledOnce.reduce((a, b) => a + b, 0);
      expect(grewBy).toBeGreaterThan(0);
      expect(grewBy).toBeLessThan(400);
    } finally {
      dropHeldRubbing();
      dom.restore();
    }
  });

  it("pays the full drag wherever a held walk cannot run", () => {
    // No DOM to hold the unions in: the live paint is the whole drag it
    // always was, and nothing on the page changes.
    const ctx = createFakeContext();
    ctx.globalAlpha = 1;
    paintRubbing(ctx, curve(80), 14, 1, 1, undefined, true);
    expect(lifts(ctx).length).toBeGreaterThan(0);
  });
});
