// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The whole page kept as pixels (`overview.ts`) — what "render the whole
// picture" actually renders, when it is allowed to say it is current, and where
// it lands when a frame draws it.
//
// Every one of those is invisible in a picture: an overview that quietly held a
// stale drawing would blit an old page under a zoom out and look like a
// rendering bug, and one drawn at the wrong scale would look like a different
// one. What they leave a trace in is the calls, which is what these count.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CacheSpec } from "../src/app/cache.ts";
import { paintFrame, type Frame } from "../src/app/frame.ts";
import {
  OVERVIEW_PIXELS,
  overviewReady,
  overviewScale,
  paintOverview,
  refreshOverview,
  releaseOverview,
  warmOverview,
  type Overview,
  type OverviewHolder,
} from "../src/app/overview.ts";
import { registerPlugin, resetPlugins } from "../src/app/plugins/registry.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";
import { createTrail } from "../src/app/trail.ts";
import {
  createFakeCanvas,
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

/** A tool that paints nothing but says it did — enough to count the marks a
 *  render actually reached, which is the whole of "the *whole* picture". */
let painted: Stroke[] = [];

let dom: ReturnType<typeof withFakeDocument>;

beforeEach(() => {
  resetPlugins();
  registerPlugin({
    id: "counter",
    core: true,
    nameKey: "tools.pencil.name",
    descriptionKey: "tools.pencil.description",
    icon: () => null,
    behaviour: {
      start: (p) => ({
        tool: "counter",
        size: 1,
        shape: { kind: "path", points: [p] },
      }),
      move: (draft) => draft,
      paint: (_ctx, stroke) => {
        painted.push(stroke);
      },
    },
  });
  painted = [];
  dom = withFakeDocument();
});

afterEach(() => dom.restore());

let next = 0;
function stroke(x = 100): Stroke {
  return {
    id: `s${next++}`,
    tool: "counter",
    size: 4,
    shape: {
      kind: "path",
      points: [
        { x, y: 0 },
        { x: x + 10, y: 10 },
      ],
    },
  };
}

function drawing(strokes: Stroke[]): Drawing {
  return { id: "d", name: "d", width: 400, height: 300, strokes };
}

/** A frame of a 400×300 window onto the page, at 1:1 unless a test says
 *  otherwise — the same spec shape the mark cache is handed. */
function spec(d: Drawing, over: Partial<CacheSpec> = {}): CacheSpec {
  return {
    drawing: d,
    view: { scale: 1, tx: 0, ty: 0 },
    width: 400,
    height: 300,
    dpr: 1,
    options: { pageColor: "#fff", defaultInk: "#000" },
    ...over,
  };
}

/** An overview with pixels on it, and the spec they are of. */
function held(d: Drawing, over: Partial<CacheSpec> = {}): Overview {
  const holder: OverviewHolder = { current: null };
  const at = spec(d, over);
  warmOverview(holder, at);
  const overview = holder.current!;
  refreshOverview(overview, at);
  return overview;
}

describe("how big an overview is", () => {
  it("holds a small page at its own resolution", () => {
    expect(overviewScale({ width: 800, height: 600 })).toBe(1);
  });

  it("holds a page too big for the budget at a fraction of it", () => {
    const page = { width: 6000, height: 4000 };
    const scale = overviewScale(page);
    expect(scale).toBeLessThan(1);
    // Exactly the budget, not merely under it: the point of scaling down is to
    // spend all of what is allowed and no more.
    expect(page.width * scale * (page.height * scale)).toBeCloseTo(
      OVERVIEW_PIXELS,
      -2,
    );
  });

  it("never asks for a surface no browser will make", () => {
    // A page that fits the *area* budget can still be refused on one side —
    // and a refused surface is no overview at all.
    const scale = overviewScale({ width: 60000, height: 40 });
    expect(60000 * scale).toBeLessThanOrEqual(8192);
  });
});

describe("painting the page off to one side", () => {
  it("paints every mark, including the ones no window is showing", () => {
    // The point of the file: the frame culls to the window, and this one
    // deliberately does not. The two marks are 2000 document pixels apart, so
    // no 400-pixel window could hold both.
    const page = drawing([stroke(10), stroke(2000)]);
    held(page);
    expect(painted).toHaveLength(2);
  });

  it("is a picture of the page rather than of the view", () => {
    const page = drawing([stroke(10)]);
    const overview = held(page);
    // The same pixels answer for any view: what was painted is the document,
    // at the overview's own scale.
    expect(overviewReady(overview, spec(page))).toBe(true);
    expect(
      overviewReady(
        overview,
        spec(page, { view: { scale: 4, tx: -80, ty: 5 } }),
      ),
    ).toBe(true);
    expect(
      overviewReady(overview, spec(page, { width: 900, height: 900, dpr: 2 })),
    ).toBe(true);
  });
});

describe("when the held pixels may be shown", () => {
  it("never before anything has been painted", () => {
    const holder: OverviewHolder = { current: null };
    const page = drawing([stroke()]);
    warmOverview(holder, spec(page));
    expect(overviewReady(holder.current, spec(page))).toBe(false);
  });

  it("not once a mark has landed", () => {
    const strokes = [stroke(10)];
    const overview = held(drawing(strokes));
    expect(
      overviewReady(overview, spec(drawing([...strokes, stroke(20)]))),
    ).toBe(false);
  });

  it("not once a stroke it holds has been rewritten", () => {
    // An undo and a document arriving from sync both mint fresh objects, which
    // is exactly what the identity walk is for.
    const page = drawing([stroke(10)]);
    const overview = held(page);
    expect(
      overviewReady(overview, spec(drawing([{ ...page.strokes[0]! }]))),
    ).toBe(false);
  });

  it("not once the page is painted a different colour", () => {
    const page = drawing([stroke(10)]);
    const overview = held(page);
    expect(
      overviewReady(
        overview,
        spec(page, { options: { pageColor: "#000", defaultInk: "#fff" } }),
      ),
    ).toBe(false);
  });

  it("not once a different drawing is open", () => {
    const overview = held(drawing([stroke(10)]));
    const other = { ...drawing([stroke(10)]), id: "other" };
    expect(overviewReady(overview, spec(other))).toBe(false);
  });

  it("again once it has been repainted for the picture in hand", () => {
    const strokes = [stroke(10)];
    const overview = held(drawing(strokes));
    const grown = spec(drawing([...strokes, stroke(20)]));
    refreshOverview(overview, grown);
    expect(overviewReady(overview, grown)).toBe(true);
  });
});

describe("drawing the page under a frame", () => {
  /** The transform the last blit was made under — how big the page came out and
   *  where its corner landed, both in the frame's device pixels. */
  function place(ctx: FakeContext) {
    const { a, e, f } = ctx.draws[ctx.draws.length - 1]!.transform;
    return { scale: a, x: e, y: f };
  }

  it("blits the whole page once, where the view says it sits", () => {
    const page = drawing([stroke(10)]);
    const overview = held(page);
    const ctx = createFakeContext();
    expect(
      paintOverview(
        ctx,
        overview,
        spec(page, { view: { scale: 0.5, tx: 30, ty: 20 }, dpr: 2 }),
      ),
    ).toBe(true);
    expect(ctx.blits).toHaveLength(1);
    const { scale, x, y } = place(ctx);
    // A 400×300 page is under the budget, so the surface is the document
    // itself: one surface pixel per document pixel, and the frame is showing it
    // at half scale on a two-pixel-per-CSS-pixel screen.
    expect(scale).toBeCloseTo(1);
    // …and the page's corner lands where the view puts it, in device pixels.
    expect(x).toBe(60);
    expect(y).toBe(40);
  });

  it("leaves the context where it found it", () => {
    // The frame paints marks after this, in its own transform — a blit that
    // left its scale behind would draw every one of them at the page's.
    const page = drawing([stroke(10)]);
    const overview = held(page);
    const ctx = createFakeContext();
    paintOverview(
      ctx,
      overview,
      spec(page, { view: { scale: 3, tx: 0, ty: 0 } }),
    );
    expect(ctx.getTransform()).toMatchObject({ a: 1, d: 1, e: 0, f: 0 });
  });

  it("draws nothing when there is nothing painted yet", () => {
    const holder: OverviewHolder = { current: null };
    const page = drawing([stroke(10)]);
    warmOverview(holder, spec(page));
    const ctx = createFakeContext();
    expect(paintOverview(ctx, holder.current!, spec(page))).toBe(false);
    expect(ctx.blits).toHaveLength(0);
  });
});

/** A window whose idle callbacks are run by hand, so "queued for later" is
 *  something a test can assert on rather than wait for. */
function withIdle() {
  const jobs: (() => void)[] = [];
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    devicePixelRatio: 1,
    requestIdleCallback: (fn: () => void) => jobs.push(fn),
    cancelIdleCallback: () => {},
  };
  return {
    jobs,
    run: () => {
      const queued = [...jobs];
      jobs.length = 0;
      for (const job of queued) job();
    },
    restore: () => {
      (globalThis as { window?: unknown }).window = previous;
    },
  };
}

describe("keeping it current without being felt", () => {
  it("paints nothing on the frame that asks — only at idle", () => {
    const idle = withIdle();
    try {
      const holder: OverviewHolder = { current: null };
      const page = drawing([stroke(10)]);
      warmOverview(holder, spec(page));
      expect(painted).toHaveLength(0);
      idle.run();
      expect(painted).toHaveLength(1);
      expect(overviewReady(holder.current, spec(page))).toBe(true);
    } finally {
      idle.restore();
    }
  });

  it("costs one repaint however many frames ask for it", () => {
    const idle = withIdle();
    try {
      const holder: OverviewHolder = { current: null };
      const strokes = [stroke(10)];
      // Five frames, each with one more mark on the page — a gesture's worth of
      // staleness, which must not be five document repaints queued up.
      for (let i = 0; i < 5; i++) {
        strokes.push(stroke(20 + i));
        warmOverview(holder, spec(drawing([...strokes])));
      }
      expect(idle.jobs).toHaveLength(1);
      idle.run();
      // And what it painted is the *newest* picture asked for, not the first.
      expect(painted).toHaveLength(strokes.length);
    } finally {
      idle.restore();
    }
  });

  it("queues nothing at all while the pixels are current", () => {
    const idle = withIdle();
    try {
      const holder: OverviewHolder = { current: null };
      const page = drawing([stroke(10)]);
      warmOverview(holder, spec(page));
      idle.run();
      painted = [];
      for (let i = 0; i < 3; i++) warmOverview(holder, spec(page));
      expect(idle.jobs).toHaveLength(0);
      idle.run();
      expect(painted).toHaveLength(0);
    } finally {
      idle.restore();
    }
  });

  it("gives the pixels back when the setting is switched off", () => {
    const idle = withIdle();
    try {
      const holder: OverviewHolder = { current: null };
      const page = drawing([stroke(10)]);
      warmOverview(holder, spec(page));
      idle.run();
      releaseOverview(holder);
      expect(holder.current).toBe(null);
    } finally {
      idle.restore();
    }
  });
});

describe("a frame painted with the setting on", () => {
  /** One canvas painted frame after frame, exactly as `PaintCanvas` paints it —
   *  the seam this feature actually runs through. */
  function harness(fullRender: boolean) {
    const canvas = createFakeCanvas(400, 300);
    const cache = { current: null };
    const overview: OverviewHolder = { current: null };
    const trail = createTrail();
    // One document, held across the frames: a fresh object every frame would be a
    // changed picture, and every frame would repaint.
    const page = drawing([stroke(10)]);
    const paint = (over: Partial<Frame> = {}) =>
      paintFrame({
        canvas: canvas as unknown as HTMLCanvasElement,
        view: { scale: 1, tx: 0, ty: 0 },
        viewport: { width: 400, height: 300 },
        drawing: page,
        pageColor: "#fff",
        defaultInk: "#000",
        showGrid: false,
        showPixelGrid: false,
        checker: ["#eee", "#ddd"],
        washDetail: 1,
        leadDetail: 1,
        decodedAt: 0,
        preview: null,
        zooming: false,
        draft: null,
        selection: null,
        moving: null,
        loupe: null,
        aiming: null,
        cache,
        fullRender,
        overview,
        trail,
        ...over,
      });
    return { ctx: canvas.ctx, overview, paint };
  }

  it("keeps the page warm and puts it under a zoom out", () => {
    const idle = withIdle();
    try {
      const { ctx, overview, paint } = harness(true);
      // A settled frame asks for the page; the page is painted at idle.
      paint();
      expect(idle.jobs).toHaveLength(1);
      idle.run();
      const page = overview.current!.surface.canvas;
      ctx.blits.length = 0;

      // …and the next frame of a pinch that is spreading the page out puts it
      // under the pixels the carry is shrinking.
      paint({ view: { scale: 0.5, tx: 100, ty: 75 }, zooming: true });
      expect(ctx.blits).toContain(page);
    } finally {
      idle.restore();
    }
  });

  it("asks for nothing at all with the setting off", () => {
    const idle = withIdle();
    try {
      const { overview, paint } = harness(false);
      paint();
      expect(idle.jobs).toHaveLength(0);
      paint({ view: { scale: 0.5, tx: 100, ty: 75 }, zooming: true });
      expect(overview.current).toBe(null);
    } finally {
      idle.restore();
    }
  });

  it("gives the page back when the setting is switched off", () => {
    const idle = withIdle();
    try {
      const { overview, paint } = harness(true);
      paint();
      idle.run();
      expect(overview.current).not.toBe(null);
      paint({ fullRender: false });
      expect(overview.current).toBe(null);
    } finally {
      idle.restore();
    }
  });
});
