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
    id: "rubber",
    core: true,
    nameKey: "tools.eraser.name",
    descriptionKey: "tools.eraser.description",
    icon: () => null,
    erases: true,
    behaviour: {
      start: (p) => ({
        tool: "rubber",
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

    const rubbed = { ...stroke(120), tool: "rubber" };
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

    const rubbed = { ...stroke(120), tool: "rubber" };
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
