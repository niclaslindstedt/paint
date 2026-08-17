// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the frame cache is for is the work it *doesn't* do, so that is what
// these assert: which frames repaint the document, which append to it, and
// which are served by a blit. Getting this wrong is either a slow canvas or a
// stale one, and neither shows up in any other test.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createCache,
  paintCommitted,
  type CacheSpec,
} from "../src/app/cache.ts";
import { registerPlugin, resetPlugins } from "../src/app/plugins/registry.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";
import {
  createFakeCanvas,
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

/** A tool that paints nothing but says it did — enough to count the strokes a
 *  frame actually reached. */
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
  // The same tool again, but one that takes ink off. What it paints is not the
  // point — that it erased is, because the cache then has to put the sheet back
  // under the hole it left in pixels it is keeping.
  registerPlugin({
    id: "wiper",
    core: true,
    nameKey: "tools.eraser.name",
    descriptionKey: "tools.eraser.description",
    icon: () => null,
    erases: true,
    behaviour: {
      start: (p) => ({
        tool: "wiper",
        size: 1,
        shape: { kind: "path", points: [p] },
      }),
      move: (draft) => draft,
      paint: (_ctx, stroke) => {
        painted.push(stroke);
      },
    },
  });
  // …and one that paints wet: a loaded watercolour brush, as far as the cache
  // is concerned. On a sheet that soaks, its marks mix with their own layer
  // rather than covering the picture, which is the whole reason the wet-append
  // path exists.
  registerPlugin({
    id: "soaker",
    core: true,
    nameKey: "tools.pencil.name",
    descriptionKey: "tools.pencil.description",
    icon: () => null,
    wetness: 1,
    behaviour: {
      start: (p) => ({
        tool: "soaker",
        size: 1,
        shape: { kind: "path", points: [p] },
      }),
      move: (draft) => draft,
      paint: (_ctx, stroke) => {
        painted.push(stroke);
      },
    },
  });
  // …and one that rubs out the way a rubber does: it takes ink off, but only
  // ink a rubber could have lifted. Nothing here is `liftable`, so everything
  // the cache is holding has to be laid back over the hole it leaves.
  registerPlugin({
    id: "lifter",
    core: true,
    nameKey: "tools.eraser.name",
    descriptionKey: "tools.eraser.description",
    icon: () => null,
    erases: true,
    lifts: true,
    behaviour: {
      start: (p) => ({
        tool: "lifter",
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
// Kept well inside the window every case paints, so the viewport cull is never
// the reason a stroke did or didn't reach the painter — except in the one test
// that is about the cull.
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

/** A screen to paint onto, and the canvas element behind it. */
function screen(): { ctx: FakeContext; canvas: HTMLCanvasElement } {
  const ctx = createFakeContext();
  return {
    ctx,
    canvas: { width: 400, height: 300 } as HTMLCanvasElement,
  };
}

describe("the committed marks cache", () => {
  it("paints the document on the first frame", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120), stroke(140)]);
    expect(paintCommitted(ctx, canvas, cache, spec(page))).toBe("repainted");
    expect(painted).toHaveLength(3);
  });

  it("blits an unchanged frame without touching a stroke", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120)]);
    paintCommitted(ctx, canvas, cache, spec(page));
    painted = [];

    // The same document and the same view: every frame of a stroke being drawn.
    for (let i = 0; i < 60; i++) {
      expect(paintCommitted(ctx, canvas, cache, spec(page))).toBe("blitted");
    }
    expect(painted).toHaveLength(0);
    expect(ctx.blits).toHaveLength(60);
  });

  it("blits a document rebuilt into an equal array", () => {
    // The store hands out fresh objects freely; what matters is the strokes.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    painted = [];
    expect(
      paintCommitted(ctx, canvas, cache, spec(drawing([...strokes]))),
    ).toBe("blitted");
    expect(painted).toHaveLength(0);
  });

  it("paints only the new stroke when a gesture commits", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120), stroke(140)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    painted = [];

    const landed = stroke(160);
    expect(
      paintCommitted(ctx, canvas, cache, spec(drawing([...strokes, landed]))),
    ).toBe("appended");
    expect(painted.map((s) => s.id)).toEqual([landed.id]);
  });

  it("lays the sheet back under a rubbing out it appended", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    // The cache's own pixels: a finished picture, sheet and all, copied off the
    // screen. Appending onto them is where a rubbing out would take the page.
    const surface = dom.created[0]!.ctx;
    const before = surface.painted.length;

    const rubbed = { ...stroke(120), tool: "wiper" };
    expect(
      paintCommitted(ctx, canvas, cache, spec(drawing([...strokes, rubbed]))),
    ).toBe("appended");
    expect(
      surface.painted.slice(before).map((p) => `${p.call}@${p.composite}`),
    ).toEqual(["fillRect@destination-over"]);
  });

  it("lays the ink back too when what it appended was a rubber", () => {
    // The other half of the same problem: the cache's pixels are a finished
    // picture and a lifting mark cannot tell what made them, so it takes the
    // marks it could never have lifted with it. They go back over the hole
    // before the sheet goes under it (see `relayFixed`).
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    const surface = dom.created[0]!.ctx;
    const surfaces = dom.created.length;
    painted = [];

    const lifted = { ...stroke(100), tool: "lifter" };
    expect(
      paintCommitted(ctx, canvas, cache, spec(drawing([...strokes, lifted]))),
    ).toBe("appended");
    // Three painter calls for one gesture, and each is a different surface: the
    // rubbing out onto the cache, the mark it took with it onto a surface of
    // its own, and the rubbing out *again* onto a second one — painted the
    // ordinary way round there, which is the mask that says how much went.
    expect(painted.map((s) => s.id)).toEqual([
      lifted.id,
      strokes[0]!.id,
      lifted.id,
    ]);
    expect(dom.created.length).toBe(surfaces + 2);
    // …and the sheet still goes back under the lot, last.
    expect(surface.painted.at(-1)).toMatchObject({
      call: "fillRect",
      composite: "destination-over",
    });
  });

  it("leaves the cache alone when the mark it appended only added ink", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    const surface = dom.created[0]!.ctx;
    const before = surface.painted.length;
    paintCommitted(
      ctx,
      canvas,
      cache,
      spec(drawing([...strokes, stroke(120)])),
    );
    expect(surface.painted).toHaveLength(before);
  });

  it("repaints when a stroke is undone", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120), stroke(140)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    painted = [];
    expect(
      paintCommitted(ctx, canvas, cache, spec(drawing(strokes.slice(0, 2)))),
    ).toBe("repainted");
    expect(painted).toHaveLength(2);
  });

  it("repaints when a stroke already on the cache is rewritten", () => {
    // The dangerous case: the document is the same length and only grew at the
    // end as far as a cheap check could tell, but an earlier mark changed.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120), stroke(140)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    painted = [];

    const edited = strokes.map((s, i) =>
      i === 0 ? { ...s, color: "#f00" } : s,
    );
    expect(
      paintCommitted(
        ctx,
        canvas,
        cache,
        spec(drawing([...edited, stroke(160)])),
      ),
    ).toBe("repainted");
    expect(painted).toHaveLength(4);
  });

  it.each([
    ["a zoom", { view: { scale: 2, tx: 0, ty: 0 } }],
    ["a resize", { width: 500 }],
    ["a pixel ratio change", { dpr: 2 }],
    [
      "a page colour change",
      { options: { pageColor: "#000", defaultInk: "#fff" } },
    ],
    [
      "the grid coming on",
      { options: { pageColor: "#fff", defaultInk: "#000", grid: 40 } },
    ],
  ] as [string, Partial<CacheSpec>][])(
    "repaints after %s",
    (_label, change) => {
      const cache = createCache(400, 300)!;
      const { ctx, canvas } = screen();
      const page = drawing([stroke(100), stroke(120)]);
      paintCommitted(ctx, canvas, cache, spec(page));
      painted = [];
      expect(paintCommitted(ctx, canvas, cache, spec(page, change))).toBe(
        "repainted",
      );
      expect(painted).toHaveLength(2);
    },
  );

  it("repaints when a bitmap finishes decoding", () => {
    // An image stroke paints nothing until its data URL has decoded, and the
    // decode lands without touching the document — so an unchanged document is
    // the one case where "same strokes, same view" is not the same picture.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120)]);
    paintCommitted(ctx, canvas, cache, spec(page, { decodedAt: 1 }));
    painted = [];
    expect(
      paintCommitted(ctx, canvas, cache, spec(page, { decodedAt: 1 })),
    ).toBe("blitted");
    expect(
      paintCommitted(ctx, canvas, cache, spec(page, { decodedAt: 2 })),
    ).toBe("repainted");
    expect(painted).toHaveLength(2);
  });

  it("repaints when a different drawing is opened", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    painted = [];
    const other: Drawing = { ...drawing(strokes), id: "other" };
    expect(paintCommitted(ctx, canvas, cache, spec(other))).toBe("repainted");
    expect(painted).toHaveLength(2);
  });

  it("paints the document straight through when there is no cache", () => {
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120)]);
    expect(paintCommitted(ctx, canvas, null, spec(page))).toBe("repainted");
    expect(paintCommitted(ctx, canvas, null, spec(page))).toBe("repainted");
    expect(painted).toHaveLength(4);
    expect(ctx.blits).toHaveLength(0);
  });

  it("is not created at all without a DOM to create it in", () => {
    dom.restore();
    expect(createCache(400, 300)).toBeNull();
    dom = withFakeDocument();
  });
});

describe("layers", () => {
  const stack = [
    { id: "base", name: "" },
    { id: "top", name: "Layer 2" },
  ];
  const layered = (strokes: Stroke[], hideTop = false): Drawing => ({
    ...drawing(strokes),
    layers: hideTop ? [stack[0]!, { ...stack[1]!, hidden: true }] : stack,
  });

  it("appends a mark landing on the top layer", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const under = { ...stroke(100), layer: "base" };
    paintCommitted(ctx, canvas, cache, spec(layered([under])));
    painted = [];
    const landed = { ...stroke(120), layer: "top" };
    expect(
      paintCommitted(ctx, canvas, cache, spec(layered([under, landed]))),
    ).toBe("appended");
    expect(painted.map((s) => s.id)).toEqual([landed.id]);
  });

  it("lays the sheet back under a rubbing out it appended", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    // The cache's own pixels: a finished picture, sheet and all, copied off the
    // screen. Appending onto them is where a rubbing out would take the page.
    const surface = dom.created[0]!.ctx;
    const before = surface.painted.length;

    const rubbed = { ...stroke(120), tool: "wiper" };
    expect(
      paintCommitted(ctx, canvas, cache, spec(drawing([...strokes, rubbed]))),
    ).toBe("appended");
    expect(
      surface.painted.slice(before).map((p) => `${p.call}@${p.composite}`),
    ).toEqual(["fillRect@destination-over"]);
  });

  it("leaves the cache alone when the mark it appended only added ink", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    const surface = dom.created[0]!.ctx;
    const before = surface.painted.length;
    paintCommitted(
      ctx,
      canvas,
      cache,
      spec(drawing([...strokes, stroke(120)])),
    );
    expect(surface.painted).toHaveLength(before);
  });

  it("repaints when a mark lands *under* what is already painted", () => {
    // The case the append shortcut must not take: the new mark belongs below
    // the marks the cache is holding, so compositing it on top would put it on
    // the wrong side of them.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const above = { ...stroke(100), layer: "top" };
    paintCommitted(ctx, canvas, cache, spec(layered([above])));
    painted = [];
    const landed = { ...stroke(120), layer: "base" };
    expect(
      paintCommitted(ctx, canvas, cache, spec(layered([above, landed]))),
    ).toBe("repainted");
    expect(painted.map((s) => s.id)).toEqual([landed.id, above.id]);
  });

  it("repaints when a layer is hidden, and paints only what is left", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const under = { ...stroke(100), layer: "base" };
    const over = { ...stroke(120), layer: "top" };
    paintCommitted(ctx, canvas, cache, spec(layered([under, over])));
    painted = [];
    expect(
      paintCommitted(ctx, canvas, cache, spec(layered([under, over], true))),
    ).toBe("repainted");
    expect(painted.map((s) => s.id)).toEqual([under.id]);
  });

  it("blits when the stack changed but the picture didn't", () => {
    // A new layer with nothing on it paints the same page — and the cheapest
    // correct answer to "same picture" is to say nothing happened.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const marks = [{ ...stroke(100), layer: "base" }];
    paintCommitted(ctx, canvas, cache, spec(layered(marks)));
    painted = [];
    expect(
      paintCommitted(ctx, canvas, cache, {
        ...spec(layered(marks)),
        drawing: {
          ...layered(marks),
          layers: [...stack, { id: "x", name: "" }],
        },
      }),
    ).toBe("blitted");
    expect(painted).toHaveLength(0);
  });
});

describe("culling", () => {
  it("skips the marks the window cannot reach", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const onScreen = stroke(100);
    const offScreen: Stroke = {
      ...stroke(100),
      shape: { kind: "path", points: [{ x: 5000, y: 5000 }] },
    };
    paintCommitted(ctx, canvas, cache, spec(drawing([onScreen, offScreen])));
    expect(painted.map((s) => s.id)).toEqual([onScreen.id]);
  });
});

describe("dragging the page", () => {
  it("scrolls the marks it already has and paints only the new edge", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    // One mark in the middle of the window, one off to the left that a drag
    // to the right is about to pull into view.
    const middle = stroke(200);
    const incoming = stroke(-60);
    const page = drawing([middle, incoming]);
    paintCommitted(ctx, canvas, cache, spec(page));
    painted = [];

    const dragged = spec(page, { view: { scale: 1, tx: 80, ty: 0 } });
    expect(paintCommitted(ctx, canvas, cache, dragged)).toBe("scrolled");
    // The strip that came into view holds the incoming mark and not the one
    // already blitted across from the last frame.
    expect(painted.map((s) => s.id)).toEqual([incoming.id]);
  });

  it("repaints when the drag clears the whole window", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100)]);
    paintCommitted(ctx, canvas, cache, spec(page));
    painted = [];
    expect(
      paintCommitted(
        ctx,
        canvas,
        cache,
        spec(page, { view: { scale: 1, tx: 900, ty: 0 } }),
      ),
    ).toBe("repainted");
  });

  it("repaints rather than scrolling when the zoom changed too", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100)]);
    paintCommitted(ctx, canvas, cache, spec(page));
    painted = [];
    expect(
      paintCommitted(
        ctx,
        canvas,
        cache,
        spec(page, { view: { scale: 1.5, tx: -20, ty: 0 } }),
      ),
    ).toBe("repainted");
  });

  it("repaints rather than scrolling when a stroke landed in the same frame", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    painted = [];
    expect(
      paintCommitted(
        ctx,
        canvas,
        cache,
        spec(drawing([...strokes, stroke(120)]), {
          view: { scale: 1, tx: -20, ty: 0 },
        }),
      ),
    ).toBe("repainted");
  });
});

// A pinch used to repaint the whole document per frame — on a page of
// simulated marks, seconds of work per frame of a gesture whose next frame
// threw it away. While the view is declared to be under the fingers
// (`CacheSpec.zooming`), a frame that differs only by the view is served by
// carrying the held pixels there: one resampled blit, paid off by the sharp
// repaint the caller owes when the gesture settles.

describe("zooming while the view is under the fingers", () => {
  it("carries the held pixels instead of repainting the document", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120), stroke(140)]);
    paintCommitted(ctx, canvas, cache, spec(page));
    painted = [];
    ctx.blits.length = 0;

    for (const scale of [1.1, 1.3, 1.7, 2.2]) {
      expect(
        paintCommitted(
          ctx,
          canvas,
          cache,
          spec(page, { view: { scale, tx: -30, ty: -20 }, zooming: true }),
        ),
      ).toBe("carried");
    }
    // Four frames of pinch: not one stroke repainted, one blit per frame.
    expect(painted).toHaveLength(0);
    expect(ctx.blits).toHaveLength(4);
  });

  it("resamples the last real repaint, never a carried frame", () => {
    // Every carried frame must be one resample of the pixels the last real
    // repaint captured — a carry that re-captured the screen would blit blits,
    // and a long pinch would smear the page into mush.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100)]);
    paintCommitted(ctx, canvas, cache, spec(page));
    const before = cache.painted;

    paintCommitted(ctx, canvas, cache, {
      ...spec(page),
      view: { scale: 2, tx: -50, ty: -50 },
      zooming: true,
    });
    // The cache still holds the frame the carry was cut from, so the settle
    // frame — and every carried one before it — starts from the same pixels.
    expect(cache.painted).toBe(before);
  });

  it("repaints for real once the gesture settles", () => {
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120)]);
    paintCommitted(ctx, canvas, cache, spec(page));
    const zoomed = { scale: 2, tx: -50, ty: -50 };
    paintCommitted(
      ctx,
      canvas,
      cache,
      spec(page, { view: zoomed, zooming: true }),
    );
    painted = [];

    // The same view asked for without the flag: the settle frame the caller
    // owes, painted from the document and captured for the frames after it.
    expect(
      paintCommitted(ctx, canvas, cache, spec(page, { view: zoomed })),
    ).toBe("repainted");
    expect(painted).toHaveLength(2);
    expect(
      paintCommitted(ctx, canvas, cache, spec(page, { view: zoomed })),
    ).toBe("blitted");
  });

  it("repaints rather than carrying when the document changed too", () => {
    // A stroke landing mid-gesture (a wheel zoom under a stylus) must show:
    // a carried frame can only stand in for the picture it was cut from.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100)];
    paintCommitted(ctx, canvas, cache, spec(drawing(strokes)));
    painted = [];
    expect(
      paintCommitted(
        ctx,
        canvas,
        cache,
        spec(drawing([...strokes, stroke(120)]), {
          view: { scale: 2, tx: -50, ty: 0 },
          zooming: true,
        }),
      ),
    ).toBe("repainted");
  });

  it("still scrolls exactly when only the pan moved", () => {
    // A two-finger drag that never spreads keeps the scroll path's exact
    // strips — carrying is only for the frames a scroll cannot serve.
    const cache = createCache(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(200)]);
    paintCommitted(ctx, canvas, cache, spec(page));
    expect(
      paintCommitted(
        ctx,
        canvas,
        cache,
        spec(page, { view: { scale: 1, tx: 40, ty: 0 }, zooming: true }),
      ),
    ).toBe("scrolled");
  });
});

// An effect being previewed is the second document edit the cache cannot see in
// the strokes (the first is the sheet's eye) — and it isn't a document edit at
// all, which is exactly why it needs pinning. Moving the dialog's slider
// repaints a layer without adding, removing or reordering a mark; and a layer
// under a preview cannot take an appended stroke, because it is composited as a
// unit and the whole of it has to be softened again with the new mark inside.
//
// The point of it being a *preview* rather than something on the layer is that
// this is the only time the cache gives up its shortcuts. An effect that has
// been applied is a bitmap on the page and appends exactly like anything else,
// which is the whole reason rubbing out on a softened layer stopped being slow.

describe("a stack with an effect being previewed on it", () => {
  const page = (strokes: Stroke[]): Drawing => ({
    id: "d",
    name: "d",
    width: 400,
    height: 300,
    strokes,
    layers: [
      { id: "base", name: "" },
      { id: "top", name: "Top" },
    ],
  });

  /** A spec whose options carry a preview at `radius`. One object per radius,
   *  because the cache compares it by identity — which is the contract the
   *  screen keeps too (see `CanvasScreen`). */
  const previewing = (
    d: Drawing,
    radius: number | null,
    over: Partial<CacheSpec> = {},
  ): CacheSpec =>
    spec(d, {
      ...over,
      options: {
        pageColor: "#fff",
        defaultInk: "#000",
        ...(radius === null
          ? {}
          : {
              preview: {
                effect: { kind: "blur" as const, radius },
                layerIds: new Set(["top"]),
              },
            }),
      },
    });

  it("repaints when the slider moves, though not a mark changed", () => {
    const marks = [stroke()];
    const { ctx, canvas } = screen();
    const cache = createCache(400, 300);
    expect(paintCommitted(ctx, canvas, cache, previewing(page(marks), 6))).toBe(
      "repainted",
    );
    // The very same marks, in the very same order — only the radius differs.
    expect(
      paintCommitted(ctx, canvas, cache, previewing(page(marks), 24)),
    ).toBe("repainted");
    // …and closing the dialog is a change too.
    expect(
      paintCommitted(ctx, canvas, cache, previewing(page(marks), null)),
    ).toBe("repainted");
  });

  it("blits when nothing at all changed", () => {
    const d = page([stroke()]);
    const held = previewing(d, 6);
    const { ctx, canvas } = screen();
    const cache = createCache(400, 300);
    paintCommitted(ctx, canvas, cache, held);
    expect(paintCommitted(ctx, canvas, cache, { ...held })).toBe("blitted");
  });

  it("repaints rather than appending a landed stroke", () => {
    const first = stroke();
    const { ctx, canvas } = screen();
    const cache = createCache(400, 300);
    const held = previewing(page([first]), 6);
    paintCommitted(ctx, canvas, cache, held);
    // On a page with no dialog open this is the append the whole module exists
    // for.
    expect(
      paintCommitted(ctx, canvas, cache, {
        ...held,
        drawing: page([first, stroke()]),
      }),
    ).toBe("repainted");
  });

  it("still appends when no effect is being previewed", () => {
    const first = stroke();
    const { ctx, canvas } = screen();
    const cache = createCache(400, 300);
    paintCommitted(ctx, canvas, cache, previewing(page([first]), null));
    expect(
      paintCommitted(
        ctx,
        canvas,
        cache,
        previewing(page([first, stroke()]), null),
      ),
    ).toBe("appended");
  });

  it("repaints rather than scrolling a pan", () => {
    const d = page([stroke()]);
    const held = previewing(d, 6);
    const { ctx, canvas } = screen();
    const cache = createCache(400, 300);
    paintCommitted(ctx, canvas, cache, held);
    // Correct either way — but each strip would re-run the effect over a
    // canvas-sized surface, so two strips a frame costs more than the repaint
    // it avoids.
    expect(
      paintCommitted(ctx, canvas, cache, {
        ...held,
        view: { scale: 1, tx: 20, ty: 0 },
      }),
    ).toBe("repainted");
  });
});

describe("a sheet that soaks", () => {
  // Cold-pressed paper: thirsty enough that a wet mark stains, which used to
  // mean every landed wash repainted the whole document. On the drawing,
  // because the sheet is the drawing's own — and on the options too, which is
  // how the canvas hands it to the cache (see `frame.ts`).
  const ground = { stock: "cold" };

  function paper(strokes: Stroke[]): Drawing {
    return { ...drawing(strokes), ground };
  }

  function wetSpec(d: Drawing, over: Partial<CacheSpec> = {}): CacheSpec {
    return spec(d, {
      options: { pageColor: "#fff", defaultInk: "#000", ground },
      ...over,
    });
  }

  function wash(x = 100): Stroke {
    return { ...stroke(x), tool: "soaker" };
  }

  /** A screen whose context knows its canvas — the wet path lifts the layer
   *  onto a surface of its own, and a context with no canvas behind it cannot
   *  say how big that surface should be. */
  function wetScreen(): { ctx: FakeContext; canvas: HTMLCanvasElement } {
    const canvas = createFakeCanvas(400, 300);
    return { ctx: canvas.ctx, canvas: canvas as never };
  }

  /** The marks the painter was actually handed, de-duplicated: a wet mark is
   *  laid twice by design — once to cut its bleed to its own shape and once
   *  for real (see `wet.ts`) — and that doubling is not what these tests are
   *  about. */
  function reached(): string[] {
    return [...new Set(painted.map((s) => s.id))];
  }

  it("lands a wet mark for the cost of one stroke, not the document", () => {
    const washes = [wash(40), wash(80), wash(120)];
    const page = paper(washes);
    const first = wetScreen();
    const cache = createCache(400, 300);
    // The first frame repaints — and keeps the wet layer's pixels on the way.
    expect(paintCommitted(first.ctx, first.canvas, cache, wetSpec(page))).toBe(
      "repainted",
    );
    const next = wash(160);
    const grown = { ...page, strokes: [...washes, next] };
    painted = [];
    const second = wetScreen();
    const work = paintCommitted(
      second.ctx,
      second.canvas,
      cache,
      wetSpec(grown),
    );
    expect(work).toBe("appended");
    // The three washes already dry were never painted again.
    expect(reached()).toEqual([next.id]);
    // …and the screen was put back together from the two kept halves — what
    // stood below the layer, and the layer itself — rather than repainted.
    expect(second.ctx.blits.length).toBe(2);
  });

  it("keeps a dry mark on the wet layer inside the layer's surface too", () => {
    const page = paper([wash(40)]);
    const first = wetScreen();
    const cache = createCache(400, 300);
    paintCommitted(first.ctx, first.canvas, cache, wetSpec(page));
    // A pencil line on the same layer: painted onto the finished picture it
    // would sit outside the surface the next wash mixes on, so it lands on the
    // layer's own pixels exactly as the wet marks do.
    const line = stroke(200);
    const grown = { ...page, strokes: [...page.strokes, line] };
    painted = [];
    const second = wetScreen();
    expect(
      paintCommitted(second.ctx, second.canvas, cache, wetSpec(grown)),
    ).toBe("appended");
    expect(reached()).toEqual([line.id]);
    expect(second.ctx.blits.length).toBe(2);
  });

  it("gives the kept layer up when the view moves, and takes it back", () => {
    const washes = [wash(40), wash(80)];
    const page = paper(washes);
    const cache = createCache(400, 300);
    const a = wetScreen();
    paintCommitted(a.ctx, a.canvas, cache, wetSpec(page));
    // A pan serves the frame by scrolling, and the kept pixels are in the view
    // they were painted in — so the wash landing after it costs the repaint it
    // always did…
    const b = wetScreen();
    expect(
      paintCommitted(
        b.ctx,
        b.canvas,
        cache,
        wetSpec(page, {
          view: { scale: 1, tx: 20, ty: 0 },
        }),
      ),
    ).toBe("scrolled");
    const landed = wash(120);
    const grownOnce = { ...page, strokes: [...washes, landed] };
    const c = wetScreen();
    expect(
      paintCommitted(
        c.ctx,
        c.canvas,
        cache,
        wetSpec(grownOnce, {
          view: { scale: 1, tx: 20, ty: 0 },
        }),
      ),
    ).toBe("repainted");
    // …and that repaint kept the layer again, so the one after it is absorbed.
    const again = wash(160);
    const grownTwice = { ...grownOnce, strokes: [...grownOnce.strokes, again] };
    painted = [];
    const d = wetScreen();
    expect(
      paintCommitted(
        d.ctx,
        d.canvas,
        cache,
        wetSpec(grownTwice, {
          view: { scale: 1, tx: 20, ty: 0 },
        }),
      ),
    ).toBe("appended");
    expect(reached()).toEqual([again.id]);
  });

  it("keeps only the topmost layer, and repaints a wash landing lower", () => {
    // Washes on the middle layer of a stack: a mark there lands under pixels
    // the kept surfaces cannot reconstruct, so it costs a repaint — the price
    // of painting below your own top layer, not of the page being paper.
    const layered = (strokes: Stroke[]): Drawing => ({
      ...paper(strokes),
      layers: [
        { id: "base", name: "" },
        { id: "top", name: "Top" },
      ],
    });
    const washes = [
      { ...wash(40), layer: "base" },
      { ...wash(80), layer: "base" },
    ];
    const page = layered(washes);
    const s = wetScreen();
    const cache = createCache(400, 300);
    paintCommitted(s.ctx, s.canvas, cache, wetSpec(page));
    const grown = layered([...washes, { ...wash(120), layer: "base" }]);
    const t = wetScreen();
    expect(paintCommitted(t.ctx, t.canvas, cache, wetSpec(grown))).toBe(
      "repainted",
    );
  });

  it("still blits a frame where nothing changed at all", () => {
    const page = paper([wash(40)]);
    const held = wetSpec(page);
    const s = wetScreen();
    const cache = createCache(400, 300);
    paintCommitted(s.ctx, s.canvas, cache, held);
    expect(paintCommitted(s.ctx, s.canvas, cache, { ...held })).toBe("blitted");
  });
});
