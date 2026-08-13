// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the layer cache is for is the work it *doesn't* do, so that is what
// these assert: which frames repaint the document, which append to it, and
// which are served by a blit. Getting this wrong is either a slow canvas or a
// stale one, and neither shows up in any other test.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLayer,
  paintCommitted,
  type LayerSpec,
} from "../src/app/layer.ts";
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

function spec(d: Drawing, over: Partial<LayerSpec> = {}): LayerSpec {
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

describe("the committed layer", () => {
  it("paints the document on the first frame", () => {
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120), stroke(140)]);
    expect(paintCommitted(ctx, canvas, layer, spec(page))).toBe("repainted");
    expect(painted).toHaveLength(3);
  });

  it("blits an unchanged frame without touching a stroke", () => {
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120)]);
    paintCommitted(ctx, canvas, layer, spec(page));
    painted = [];

    // The same document and the same view: every frame of a stroke being drawn.
    for (let i = 0; i < 60; i++) {
      expect(paintCommitted(ctx, canvas, layer, spec(page))).toBe("blitted");
    }
    expect(painted).toHaveLength(0);
    expect(ctx.blits).toHaveLength(60);
  });

  it("blits a document rebuilt into an equal array", () => {
    // The store hands out fresh objects freely; what matters is the strokes.
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120)];
    paintCommitted(ctx, canvas, layer, spec(drawing(strokes)));
    painted = [];
    expect(
      paintCommitted(ctx, canvas, layer, spec(drawing([...strokes]))),
    ).toBe("blitted");
    expect(painted).toHaveLength(0);
  });

  it("paints only the new stroke when a gesture commits", () => {
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120), stroke(140)];
    paintCommitted(ctx, canvas, layer, spec(drawing(strokes)));
    painted = [];

    const landed = stroke(160);
    expect(
      paintCommitted(ctx, canvas, layer, spec(drawing([...strokes, landed]))),
    ).toBe("appended");
    expect(painted.map((s) => s.id)).toEqual([landed.id]);
  });

  it("repaints when a stroke is undone", () => {
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120), stroke(140)];
    paintCommitted(ctx, canvas, layer, spec(drawing(strokes)));
    painted = [];
    expect(
      paintCommitted(ctx, canvas, layer, spec(drawing(strokes.slice(0, 2)))),
    ).toBe("repainted");
    expect(painted).toHaveLength(2);
  });

  it("repaints when a stroke already on the layer is rewritten", () => {
    // The dangerous case: the document is the same length and only grew at the
    // end as far as a cheap check could tell, but an earlier mark changed.
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120), stroke(140)];
    paintCommitted(ctx, canvas, layer, spec(drawing(strokes)));
    painted = [];

    const edited = strokes.map((s, i) =>
      i === 0 ? { ...s, color: "#f00" } : s,
    );
    expect(
      paintCommitted(
        ctx,
        canvas,
        layer,
        spec(drawing([...edited, stroke(160)])),
      ),
    ).toBe("repainted");
    expect(painted).toHaveLength(4);
  });

  it.each([
    ["a pan", { view: { scale: 1, tx: -40, ty: 0 } }],
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
  ] as [string, Partial<LayerSpec>][])(
    "repaints after %s",
    (_label, change) => {
      const layer = createLayer(400, 300)!;
      const { ctx, canvas } = screen();
      const page = drawing([stroke(100), stroke(120)]);
      paintCommitted(ctx, canvas, layer, spec(page));
      painted = [];
      expect(paintCommitted(ctx, canvas, layer, spec(page, change))).toBe(
        "repainted",
      );
      expect(painted).toHaveLength(2);
    },
  );

  it("repaints when a different drawing is opened", () => {
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const strokes = [stroke(100), stroke(120)];
    paintCommitted(ctx, canvas, layer, spec(drawing(strokes)));
    painted = [];
    const other: Drawing = { ...drawing(strokes), id: "other" };
    expect(paintCommitted(ctx, canvas, layer, spec(other))).toBe("repainted");
    expect(painted).toHaveLength(2);
  });

  it("paints the document straight through when there is no layer", () => {
    const { ctx, canvas } = screen();
    const page = drawing([stroke(100), stroke(120)]);
    expect(paintCommitted(ctx, canvas, null, spec(page))).toBe("repainted");
    expect(paintCommitted(ctx, canvas, null, spec(page))).toBe("repainted");
    expect(painted).toHaveLength(4);
    expect(ctx.blits).toHaveLength(0);
  });

  it("is not created at all without a DOM to create it in", () => {
    dom.restore();
    expect(createLayer(400, 300)).toBeNull();
    dom = withFakeDocument();
  });
});

describe("culling", () => {
  it("skips the marks the window cannot reach", () => {
    const layer = createLayer(400, 300)!;
    const { ctx, canvas } = screen();
    const onScreen = stroke(100);
    const offScreen: Stroke = {
      ...stroke(100),
      shape: { kind: "path", points: [{ x: 5000, y: 5000 }] },
    };
    paintCommitted(ctx, canvas, layer, spec(drawing([onScreen, offScreen])));
    expect(painted.map((s) => s.id)).toEqual([onScreen.id]);
  });
});
