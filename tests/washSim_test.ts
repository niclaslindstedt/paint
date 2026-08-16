// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the wash simulation *costs*, and what decides it.
//
// The picture the field paints is checked next door, in `washField_test.ts`,
// where it needs no canvas. This file is about the three decisions the layer
// above the field makes — how fine a grid a mark gets, what that grid is
// measured against, and which marks are worked out twice — and every one of
// them is invisible in the pixels. They show up instead in canvases minted and
// simulations run, which is what the fake document counts.
//
// They matter because they are the difference between a heavy watercolour page
// that pans and pinches at frame rate and one that re-dries every mark on it
// per frame.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SOLID_GROUND } from "../src/app/ground.ts";
import {
  forgetDriedWashes,
  paintSimulatedWash,
} from "../src/app/plugins/washSim.ts";
import type { Point } from "../src/app/types.ts";
import { mm } from "../src/app/units.ts";
import {
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

let dom: ReturnType<typeof withFakeDocument>;
let ctx: FakeContext;

beforeEach(() => {
  forgetDriedWashes();
  dom = withFakeDocument();
  ctx = createFakeContext();
});

afterEach(() => dom.restore());

/** A stroke, as a run of samples `span` document pixels long. A fresh array
 *  every time, because the store compares paths by identity — which is exactly
 *  what a repaint's "the same mark again" means. */
function sweep(span: number, at = 400): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= 12; i++) {
    points.push({ x: at + (span * i) / 12, y: at });
  }
  return points;
}

/** Paint one wash, and hand back the field it was worked out on — the canvas
 *  the simulation minted for it, in cells. `null` where it reused one it was
 *  already holding, which is the whole point of the store. */
function paint(
  points: readonly Point[],
  o: { size?: number; scale?: number; live?: boolean } = {},
): { width: number; height: number } | null {
  const before = dom.created.length;
  const painted = paintSimulatedWash(
    ctx,
    points,
    o.size ?? mm(6),
    o.scale ?? 1,
    1,
    1,
    0.6,
    SOLID_GROUND,
    "#3050c0",
    "#ffffff",
    1,
    o.live ?? false,
  );
  expect(painted).toBe(true);
  const minted = dom.created.slice(before);
  const canvas = minted[minted.length - 1];
  return canvas ? { width: canvas.width, height: canvas.height } : null;
}

describe("the wash simulation's grid", () => {
  it("is measured on the page rather than on the screen", () => {
    // The same mark, looked at from four times as close. A field pitched off
    // the view would resolve it four times as finely and paint a different set
    // of blooms; pitched off the page it is the same arithmetic, so there is
    // nothing left to work out.
    const points = sweep(mm(8));
    const field = paint(points, { scale: 1 });
    expect(field).not.toBeNull();
    expect(paint(points, { scale: 4 })).toBeNull();
    expect(paint(points, { scale: 0.3 })).toBeNull();
  });

  it("resolves a mark that fits its budget at one cell per document pixel", () => {
    // Small enough that nothing coarsens it: the field is then as wide in cells
    // as the patch of page it covers is in pixels, and the image is *placed*
    // rather than blown up.
    const points = sweep(mm(4));
    const field = paint(points, { size: mm(3) });
    expect(field).not.toBeNull();
    // The path plus the water either side of it, to the cell — within a couple
    // of cells for the rounding out to whole ones.
    expect(field!.height).toBeGreaterThan(mm(3) * 0.9);
    expect(field!.height).toBeLessThan(mm(3) * 2 + 40);
  });

  it("coarsens a sweep too big for its budget rather than refusing it", () => {
    // A mark across a page is millions of cells at a cell per pixel, which is
    // seconds. It still simulates — it is simply worked out on a coarser grid
    // and drawn up to the page, which is the trade the budget exists to make.
    const wide = paint(sweep(mm(160)), { size: mm(20) });
    expect(wide).not.toBeNull();
    expect(wide!.width * wide!.height).toBeLessThan(200_000);
    // …and it is a field rather than a token: the head is still many cells
    // across, or the mark would have fallen through to the stroke engine.
    expect(wide!.height).toBeGreaterThan(8);
  });
});

describe("the marks it is holding", () => {
  it("dries a mark once, however many repaints ask for it", () => {
    const points = sweep(mm(8));
    expect(paint(points)).not.toBeNull();
    // A pan, a pinch, an undo, the second of the two coats a wet mark is
    // painted in: all of them ask for the same mark, and none of them costs a
    // simulation.
    for (let again = 0; again < 5; again++) expect(paint(points)).toBeNull();
    expect(ctx.calls.drawImage).toBe(6);
  });

  it("gives the mark under the hand a smaller field than the one it lands on", () => {
    // A gesture is re-simulated on every pointer sample, so it is the one mark
    // charged per frame rather than per mark — and it settles into the full
    // field the moment the brush lifts.
    const span = sweep(mm(120));
    const live = paint(span, { size: mm(20), live: true });
    const landed = paint(span, { size: mm(20) });
    expect(live).not.toBeNull();
    expect(landed).not.toBeNull();
    expect(live!.width * live!.height).toBeLessThan(
      landed!.width * landed!.height,
    );
  });

  it("holds the gesture in flight one deep, so it cannot evict what has landed", () => {
    const landed = sweep(mm(8), 100);
    expect(paint(landed)).not.toBeNull();
    // Every sample of a gesture is a different mark — one more point on the
    // path. Held in the same store they would turn it over in the length of one
    // stroke; held apart they reuse the one canvas between them.
    for (let sample = 0; sample < 40; sample++) {
      paint(sweep(mm(8 + sample), 900), { live: true });
    }
    expect(dom.created.length).toBe(2);
    // …and the mark that landed before all of them is still there.
    expect(paint(landed)).toBeNull();
  });
});
