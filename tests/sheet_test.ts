// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Marks belong to the page, not to the desk it is lying on.
//
// The canvas element is a *window* onto a page that is usually smaller than it
// (see `PaintCanvas.tsx`), so there is grey around the sheet, and a gesture that
// began or wandered out there used to paint on it: ink floating off the paper on
// screen that then vanished from the exported file, because an export
// rasterises the page and nothing else. The screen and the file disagreed about
// the drawing, and the screen was the one that was wrong.
//
// A clip leaves nothing behind in a recording context, so what is asserted here
// is the box it was set from and the order it was set in — which is the whole of
// the rule: the sheet's own rectangle, established before any mark goes down,
// on every surface that paints marks (see `onSheet`).

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { paintCommitted, type CacheSpec } from "../src/app/cache.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { resetPlugins } from "../src/app/plugins/registry.ts";
import { renderDrawing } from "../src/app/render.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";
import {
  createFakeCanvas,
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

const ink = { pageColor: "#fffdf5", defaultInk: "#111827" };

const PAGE = { width: 400, height: 300 };

let dom: ReturnType<typeof withFakeDocument>;

beforeEach(() => {
  resetPlugins();
  registerBuiltinPlugins();
  dom = withFakeDocument();
});

afterEach(() => {
  dom.restore();
  resetPlugins();
});

let next = 0;

/** A pencil line, drawn wherever it is put — including off the page, which is
 *  the case this file exists for. */
function line(from: [number, number], to: [number, number]): Stroke {
  return {
    id: `s${next++}`,
    tool: "pencil",
    size: 8,
    shape: {
      kind: "path",
      points: [
        { x: from[0], y: from[1] },
        { x: to[0], y: to[1] },
      ],
    },
  };
}

function drawing(strokes: Stroke[]): Drawing {
  return { id: "d", name: "d", ...PAGE, strokes };
}

/** The sheet's own rectangle among the clips a context was given, if it is
 *  there. */
function sheetClip(ctx: FakeContext) {
  return ctx.clips.find(
    ({ box }) =>
      box !== null &&
      box.x === 0 &&
      box.y === 0 &&
      box.width === PAGE.width &&
      box.height === PAGE.height,
  );
}

describe("a repaint", () => {
  it("holds the marks to the sheet", () => {
    const ctx = createFakeCanvas(800, 600).ctx;
    renderDrawing(ctx, drawing([line([20, 20], [80, 60])]), null, ink);
    expect(sheetClip(ctx)).toBeTruthy();
  });

  it("sets it before the first mark goes down", () => {
    const ctx = createFakeCanvas(800, 600).ctx;
    renderDrawing(ctx, drawing([line([20, 20], [80, 60])]), null, ink);
    // A clip established after the ink is no clip at all. The mark did land —
    // otherwise this would pass on a renderer that painted nothing — and the
    // clip was already standing when it did.
    const inked = ctx.painted.findIndex((call) => call.call === "stroke");
    expect(inked).toBeGreaterThanOrEqual(0);
    expect(sheetClip(ctx)!.after).toBeLessThanOrEqual(inked);
  });

  it("holds the gesture in flight to it too", () => {
    const ctx = createFakeCanvas(800, 600).ctx;
    // A draft that is entirely out on the desk still goes through the same
    // clip: what is off the page is not on the drawing, wherever it came from.
    renderDrawing(ctx, drawing([]), line([-300, -300], [-200, -240]), ink);
    expect(sheetClip(ctx)).toBeTruthy();
  });
});

describe("the mark cache", () => {
  const view = { scale: 1, tx: 0, ty: 0 };

  function spec(page: Drawing): CacheSpec {
    return {
      drawing: page,
      view,
      width: 800,
      height: 600,
      dpr: 1,
      options: { ...ink },
    };
  }

  it("holds an appended mark to the sheet as well", () => {
    const canvas = createFakeCanvas(800, 600);
    const cache = {
      surface: { canvas: canvas as never, ctx: canvas.ctx },
      painted: null,
      strokes: [] as Stroke[],
      count: 0,
      wet: null,
    };
    const first = drawing([line([20, 20], [80, 60])]);
    // One repaint to fill the cache, then a mark landing on top of it — the
    // append path, which paints onto pixels it is keeping rather than through
    // `renderDrawing`, and so needs the clip of its own.
    paintCommitted(createFakeContext(), canvas as never, cache, spec(first));
    const grown = {
      ...first,
      strokes: [...first.strokes, line([9, 9], [1, 1])],
    };
    canvas.ctx.clips.length = 0;
    const work = paintCommitted(
      createFakeContext(),
      canvas as never,
      cache,
      spec(grown),
    );
    expect(work).toBe("appended");
    expect(sheetClip(canvas.ctx)).toBeTruthy();
  });
});
