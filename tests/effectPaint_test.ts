// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How a blur reaches the pixels — and, more to the point, that it reaches them
// on a browser whose `ctx.filter` does nothing.
//
// `effects_test.ts` covers what an effect *is*; this covers the one thing about
// painting one that a pure test can still see. `ctx.filter` is the obvious way
// to blur a canvas and is unavailable in Safari — where it is not missing but
// **inert**: the property takes a value, hands it back, and changes nothing
// that gets drawn. A painter that sets it and blits is therefore not a blur
// that degrades on Safari, it is a blur that silently does nothing, on every
// iPhone and every Mac. That is worth a test, because nothing else in the suite
// would notice it coming back.
//
// What a blur leaves behind in a recording context is a *shape*: the fast path
// is one full-size `drawImage`, and the fallback shrinks the picture and climbs
// back, so it draws at sizes smaller than the region it is filling. Counting
// those is enough to tell the two apart without any pixels.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetFilterSupport, paintEffect } from "../src/app/effectPaint.ts";
import type { Effect } from "../src/app/effects.ts";
import {
  withFakeDocument,
  type FakeContext,
  type FilterSupport,
} from "./support/fakeCanvas.ts";

const blur: Effect = { kind: "blur", radius: 12 };

const paint = {
  page: { x: 0, y: 0, width: 800, height: 600 },
  scale: 1,
  pageColor: "#ffffff",
};

let dom: ReturnType<typeof withFakeDocument>;

/** The draw that filled the page — the last thing to land on the screen. */
const lastDraw = (ctx: FakeContext) => ctx.draws[ctx.draws.length - 1];

/** A draw that came out smaller than the region being filled — the one trace a
 *  shrink-and-climb blur leaves in a context that records rather than paints. */
const shrunken = (draw: { width?: number }) =>
  draw.width !== undefined && draw.width < paint.page.width;

/** Paint a blur onto a fresh screen context, on a browser of the given kind.
 *
 *  The shrinking happens on the working surfaces rather than on the screen, so
 *  `offscreen` gathers every draw made anywhere — that is where the fallback's
 *  climb is visible. */
function paintBlurOn(filter: FilterSupport, effect: Effect | null = blur) {
  dom = withFakeDocument(filter);
  const mint = (
    document as unknown as {
      createElement: (tag: string) => { ctx: FakeContext };
    }
  ).createElement;
  const screen = mint("canvas");
  const ctx = screen.ctx;
  if (effect) paintEffect(ctx, effect, paint);
  return {
    ctx,
    /** Every draw onto a surface that is not the screen. */
    offscreen: dom.created
      .filter((canvas) => canvas.ctx !== ctx)
      .flatMap((canvas) => canvas.ctx.draws),
  };
}

beforeEach(() => forgetFilterSupport());

afterEach(() => {
  dom?.restore();
  forgetFilterSupport();
});

describe("a browser whose ctx.filter works", () => {
  it("blurs in the blit itself", () => {
    const { ctx, offscreen } = paintBlurOn("honoured");
    // The filter is in force on the draw that fills the page — that *is* the
    // blur on this path.
    expect(lastDraw(ctx).filter).toContain("blur(");
    // …and nothing was resampled to get there. The one working surface is the
    // copy the blit reads from, taken at full size.
    expect(offscreen.filter(shrunken)).toHaveLength(0);
  });
});

describe("a browser whose ctx.filter is inert (Safari)", () => {
  it("still blurs, by shrinking the picture and climbing back", () => {
    const { ctx, offscreen } = paintBlurOn("inert");
    // The give-away of the fallback: the picture was drawn at sizes well under
    // the region, then drawn back out to fill it.
    expect(offscreen.filter(shrunken).length).toBeGreaterThan(0);
    // Whatever it took to get there, what lands on the screen covers the page.
    expect(lastDraw(ctx).width).toBe(paint.page.width);
    expect(lastDraw(ctx).height).toBe(paint.page.height);
  });

  it("never leans on the property it cannot trust", () => {
    const { ctx } = paintBlurOn("inert");
    // Setting it would be harmless here and misleading everywhere else: a
    // context that ignores `filter` must be handed a picture that is already
    // soft.
    expect(lastDraw(ctx).filter).not.toContain("blur(");
  });

  it("leaves the page alone when there is no effect to paint", () => {
    const { ctx } = paintBlurOn("inert", null);
    expect(ctx.draws).toHaveLength(0);
  });

  it("asks the browser once, however many frames it paints", () => {
    const { ctx } = paintBlurOn("inert");
    const asked = ctx.calls.getImageData ?? 0;
    for (let frame = 0; frame < 5; frame += 1) paintEffect(ctx, blur, paint);
    // The probe costs a `getImageData`, which is the one thing in this file
    // that stalls the GPU. Once per session, not once per frame.
    expect(ctx.calls.getImageData ?? 0).toBe(asked);
  });
});

describe("a colour adjustment", () => {
  it("reads the window back and writes it again, rather than compositing", () => {
    // The one path in this file that touches pixels directly. A curve is a
    // lookup and no compositing mode expresses one, so the give-away is the
    // pair of calls — and the absence of any draw.
    const { ctx } = paintBlurOn("honoured", {
      kind: "desaturate",
      amount: 1,
    });
    expect(ctx.calls.getImageData ?? 0).toBe(1);
    expect(ctx.calls.putImageData ?? 0).toBe(1);
    expect(ctx.draws).toHaveLength(0);
  });

  it("stays inside the part of the page that is on the canvas", () => {
    // Same bound every other effect here works to: the sheet is usually far
    // bigger than the window, and a pass over the whole of it would be pixels
    // nobody is looking at.
    const { ctx } = paintBlurOn("honoured", {
      kind: "brightness",
      brightness: 0.2,
      contrast: 0,
    });
    const wrote = ctx.images[ctx.images.length - 1];
    expect(wrote).toBeDefined();
    expect(wrote!.width).toBeLessThanOrEqual(paint.page.width);
    expect(wrote!.height).toBeLessThanOrEqual(paint.page.height);
  });
});
