// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  anchorOffset,
  cornerAnchor,
  dragCorner,
  keepProportions,
  mirrorDrawing,
  cropDrawing,
  resizeCanvas,
  scaleDrawing,
  turnDrawing,
} from "../src/app/transform.ts";
import { MAX_CANVAS_SIDE, MIN_CANVAS_SIDE } from "../src/app/canvasSize.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

// Turning the whole page around. Every rule is arithmetic over the document, so
// the lot runs here without a canvas — and it is worth pinning, because a
// transform that is subtly wrong is wrong for every mark on the page at once and
// only shows up as a picture that has moved.

const stroke = (over: Partial<Stroke>): Stroke => ({
  id: "s1",
  tool: "pencil",
  size: 4,
  shape: { kind: "path", points: [{ x: 10, y: 20 }] },
  ...over,
});

const drawing = (strokes: Stroke[] = []): Drawing => ({
  id: "d1",
  name: "sketch",
  width: 800,
  height: 600,
  strokes,
});

/** The first point of the first path in an edit. */
const first = (strokes: Stroke[]) => {
  const shape = strokes[0]!.shape;
  if (shape.kind !== "path") throw new Error("expected a path");
  return shape.points[0]!;
};

describe("mirrorDrawing", () => {
  it("crosses every mark and leaves the sheet alone", () => {
    const edit = mirrorDrawing(drawing([stroke({})]), "horizontal");
    expect(first(edit.strokes)).toEqual({ x: 790, y: 20 });
    // The page keeps its size — a mirror is not a turn.
    expect(edit.width).toBeUndefined();
    expect(edit.height).toBeUndefined();
  });

  it("mirrors top to bottom the other way up", () => {
    const edit = mirrorDrawing(drawing([stroke({})]), "vertical");
    expect(first(edit.strokes)).toEqual({ x: 10, y: 580 });
  });

  it("is its own undo — twice is where it started", () => {
    const page = drawing([
      stroke({
        shape: {
          kind: "path",
          points: [
            { x: 10, y: 20 },
            { x: 300, y: 450 },
          ],
        },
      }),
    ]);
    const there = { ...page, ...mirrorDrawing(page, "horizontal") };
    const back = mirrorDrawing(there, "horizontal");
    expect(back.strokes[0]!.shape).toEqual(page.strokes[0]!.shape);
  });

  it("redraws a bitmap rather than leaving it facing the wrong way", () => {
    const edit = mirrorDrawing(
      drawing([
        stroke({
          tool: "image",
          shape: {
            kind: "image",
            from: { x: 0, y: 0 },
            to: { x: 100, y: 100 },
            src: "data:image/png;base64,AAA",
          },
        }),
      ]),
      "horizontal",
      () => "data:image/png;base64,TURNED",
    );
    const shape = edit.strokes[0]!.shape;
    if (shape.kind !== "image") throw new Error("expected an image");
    expect(shape.src).toBe("data:image/png;base64,TURNED");
  });

  it("keeps the bytes it had when there is nothing to redraw with", () => {
    // No canvas (a node test, a document rendered headless): a picture facing
    // the wrong way beats a picture that has gone.
    const edit = mirrorDrawing(
      drawing([
        stroke({
          tool: "image",
          shape: {
            kind: "image",
            from: { x: 0, y: 0 },
            to: { x: 100, y: 100 },
            src: "data:image/png;base64,AAA",
          },
        }),
      ]),
      "horizontal",
      () => null,
    );
    const shape = edit.strokes[0]!.shape;
    if (shape.kind !== "image") throw new Error("expected an image");
    expect(shape.src).toBe("data:image/png;base64,AAA");
  });
});

describe("turnDrawing", () => {
  it("swaps the sheet's sides", () => {
    const edit = turnDrawing(drawing(), "right");
    expect(edit.width).toBe(600);
    expect(edit.height).toBe(800);
  });

  it("sends the top-left corner to the top-right, turning right", () => {
    const edit = turnDrawing(
      drawing([stroke({ shape: { kind: "path", points: [{ x: 0, y: 0 }] } })]),
      "right",
    );
    // The new page is 600 wide, so the old origin lands on its right edge.
    expect(first(edit.strokes)).toEqual({ x: 600, y: 0 });
  });

  it("sends it to the bottom-left, turning left", () => {
    const edit = turnDrawing(
      drawing([stroke({ shape: { kind: "path", points: [{ x: 0, y: 0 }] } })]),
      "left",
    );
    expect(first(edit.strokes)).toEqual({ x: 0, y: 800 });
  });

  it("comes back after four", () => {
    let page = drawing([stroke({})]);
    for (let i = 0; i < 4; i++)
      page = { ...page, ...turnDrawing(page, "left") };
    expect(page.width).toBe(800);
    expect(page.height).toBe(600);
    expect(first(page.strokes)).toEqual({ x: 10, y: 20 });
  });

  it("keeps a caption upright — type is not a shape you can turn over", () => {
    const edit = turnDrawing(
      drawing([
        stroke({
          tool: "text",
          size: 32,
          shape: { kind: "text", at: { x: 100, y: 100 }, text: "hello" },
        }),
      ]),
      "right",
    );
    const shape = edit.strokes[0]!.shape;
    if (shape.kind !== "text") throw new Error("expected a caption");
    // It moved with the page…
    expect(shape.at).not.toEqual({ x: 100, y: 100 });
    // …and it is still the words it was, at the size it was.
    expect(shape.text).toBe("hello");
    expect(edit.strokes[0]!.size).toBe(32);
  });
});

describe("scaleDrawing", () => {
  it("grows the page, the marks and the nib together", () => {
    const edit = scaleDrawing(drawing([stroke({ size: 4 })]), {
      width: 1600,
      height: 1200,
    });
    expect(edit.width).toBe(1600);
    expect(first(edit.strokes)).toEqual({ x: 20, y: 40 });
    expect(edit.strokes[0]!.size).toBe(8);
  });

  it("rides the sampling choice onto the pictures and nothing else", () => {
    const page = drawing([
      stroke({
        tool: "image",
        shape: {
          kind: "image",
          from: { x: 0, y: 0 },
          to: { x: 10, y: 10 },
          src: "data:image/png;base64,AAA",
        },
      }),
      stroke({ id: "s2" }),
    ]);
    const crisp = scaleDrawing(page, { width: 1600, height: 1200 }, "nearest");
    const image = crisp.strokes[0]!.shape;
    if (image.kind !== "image") throw new Error("expected an image");
    expect(image.smoothing).toBe("nearest");
    // …and taken off again when the next resize asks for smoothing.
    const smooth = scaleDrawing(
      { ...page, ...crisp },
      { width: 800, height: 600 },
      "smooth",
    );
    const back = smooth.strokes[0]!.shape;
    if (back.kind !== "image") throw new Error("expected an image");
    expect(back.smoothing).toBeUndefined();
  });
});

describe("resizeCanvas", () => {
  it("changes the sheet and leaves the marks where they are", () => {
    const edit = resizeCanvas(
      drawing([stroke({})]),
      { width: 1000, height: 600 },
      "top-left",
    );
    expect(edit.width).toBe(1000);
    expect(first(edit.strokes)).toEqual({ x: 10, y: 20 });
    expect(edit.strokes[0]!.size).toBe(4);
  });

  it("shifts them when the old page is anchored somewhere else", () => {
    const edit = resizeCanvas(
      drawing([stroke({})]),
      { width: 1000, height: 800 },
      "center",
    );
    // 200 wider and 200 taller, centred: everything moves half of each.
    expect(first(edit.strokes)).toEqual({ x: 110, y: 120 });
  });

  it("crops by cutting the sheet, keeping what falls outside it", () => {
    // Nothing is deleted: a crop is a smaller window on the same document, so
    // growing the page again brings the marks back rather than needing undo.
    const edit = resizeCanvas(
      drawing([
        stroke({ shape: { kind: "path", points: [{ x: 700, y: 20 }] } }),
      ]),
      { width: 400, height: 600 },
      "top-left",
    );
    expect(edit.width).toBe(400);
    expect(edit.strokes).toHaveLength(1);
    expect(first(edit.strokes)).toEqual({ x: 700, y: 20 });
  });

  it("hands the strokes back untouched when nothing moved", () => {
    // Same array, by reference: the canvas's frame cache compares strokes one by
    // one, so a fresh copy of the same marks would cost a repaint for nothing.
    const page = drawing([stroke({})]);
    const edit = resizeCanvas(page, { width: 1000, height: 800 }, "top-left");
    expect(edit.strokes).toBe(page.strokes);
  });
});

describe("cropDrawing", () => {
  it("makes the page the box and brings every mark with it", () => {
    const edit = cropDrawing(
      drawing([
        stroke({ shape: { kind: "path", points: [{ x: 300, y: 250 }] } }),
      ]),
      { x: 200, y: 150, width: 400, height: 300 },
    );
    expect(edit.width).toBe(400);
    expect(edit.height).toBe(300);
    // The mark keeps its place in the picture: 100 in from the new left edge.
    expect(first(edit.strokes)).toEqual({ x: 100, y: 100 });
    expect(edit.strokes[0]!.size).toBe(4);
  });

  it("keeps what the crop cut off rather than deleting it", () => {
    // The same rule the sheet resize follows: undo is not the only way back,
    // and a page grown again brings the mark into view.
    const edit = cropDrawing(drawing([stroke({})]), {
      x: 400,
      y: 300,
      width: 200,
      height: 200,
    });
    expect(edit.strokes).toHaveLength(1);
    expect(first(edit.strokes)).toEqual({ x: -390, y: -280 });
  });

  it("hands the strokes back untouched for a crop that moved nothing", () => {
    const page = drawing([stroke({})]);
    const edit = cropDrawing(page, { x: 0, y: 0, width: 400, height: 300 });
    expect(edit.strokes).toBe(page.strokes);
  });

  it("clamps the sides to what a page is allowed to be", () => {
    const edit = cropDrawing(drawing(), { x: 0, y: 0, width: 4, height: 4 });
    expect(edit.width).toBe(MIN_CANVAS_SIDE);
    expect(edit.height).toBe(MIN_CANVAS_SIDE);
  });
});

describe("anchorOffset", () => {
  const from = { width: 100, height: 100 };
  const to = { width: 200, height: 300 };

  it("puts the old page where the anchor says", () => {
    expect(anchorOffset(from, to, "top-left")).toEqual({ x: 0, y: 0 });
    expect(anchorOffset(from, to, "bottom-right")).toEqual({ x: 100, y: 200 });
    expect(anchorOffset(from, to, "center")).toEqual({ x: 50, y: 100 });
    expect(anchorOffset(from, to, "top")).toEqual({ x: 50, y: 0 });
    expect(anchorOffset(from, to, "left")).toEqual({ x: 0, y: 100 });
  });

  it("works the same way when the new sheet is smaller — that is a crop", () => {
    expect(anchorOffset(to, from, "bottom-right")).toEqual({
      x: -100,
      y: -200,
    });
  });
});

describe("keepProportions", () => {
  it("follows the other side", () => {
    const from = { width: 1600, height: 900 };
    expect(keepProportions(from, "width", 800)).toEqual({
      width: 800,
      height: 450,
    });
    expect(keepProportions(from, "height", 450)).toEqual({
      width: 800,
      height: 450,
    });
  });

  it("hands back what it was given for a page with no size", () => {
    expect(keepProportions({ width: 0, height: 0 }, "width", 10)).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe("pulling a corner", () => {
  const start = { width: 1000, height: 500 };

  it("holds the opposite corner still", () => {
    // The whole gesture in one line: which corner you have decides which way a
    // positive drag grows the page.
    expect(cornerAnchor("bottom-right")).toBe("top-left");
    expect(cornerAnchor("top-left")).toBe("bottom-right");
    expect(cornerAnchor("top-right")).toBe("bottom-left");
    expect(cornerAnchor("bottom-left")).toBe("top-right");
  });

  it("grows the page away from the anchor and shrinks it back", () => {
    expect(dragCorner(start, "bottom-right", { x: 200, y: 100 })).toEqual({
      width: 1200,
      height: 600,
    });
    // The same drag on the top-left corner pulls the page the other way: down
    // and right is *smaller* when the bottom-right is pinned.
    expect(dragCorner(start, "top-left", { x: 200, y: 100 })).toEqual({
      width: 800,
      height: 400,
    });
    expect(dragCorner(start, "top-right", { x: 200, y: 100 })).toEqual({
      width: 1200,
      height: 400,
    });
    expect(dragCorner(start, "bottom-left", { x: 200, y: 100 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("is reversible — out and back is the size it was", () => {
    const out = dragCorner(start, "bottom-right", { x: 340, y: -60 });
    expect(dragCorner(out, "bottom-right", { x: -340, y: 60 })).toEqual(start);
  });

  it("keeps the proportions, and puts the corner where the drag points", () => {
    // A drag straight along the diagonal keeps the proportions on its own, so
    // the corner lands exactly where it was pulled to.
    expect(
      dragCorner(
        start,
        "bottom-right",
        { x: 500, y: 250 },
        { keepRatio: true },
      ),
    ).toEqual({ width: 1500, height: 750 });
    // Anywhere else it is held to the shape the page began with, and to the
    // point on that ray nearest the pointer — so a pull that is mostly
    // sideways is mostly a widening, and takes the height with it a little.
    expect(
      dragCorner(start, "bottom-right", { x: 500, y: 10 }, { keepRatio: true }),
    ).toEqual({ width: 1404, height: 702 });
    // Both corners of one drag read the same: pulling the top-left up and left
    // grows the page by the same amount pulling the bottom-right down and right
    // does.
    expect(
      dragCorner(start, "top-left", { x: -500, y: -10 }, { keepRatio: true }),
    ).toEqual({ width: 1404, height: 702 });
  });

  it("never multiplies a drag on a page far from square", () => {
    // The bug this rule replaced, in one case: a phone-shaped page is 2.2 times
    // taller than it is wide, so scaling by whichever axis moved further *in
    // proportion* let a sideways nudge outvote a longer pull downwards and
    // multiply it — the corner left the pointer and the sides jumped by
    // thousands. Whatever the drag, the answer is now the page nearest to it.
    const tall = { width: 1179, height: 2556 };
    const delta = { x: 300, y: 400 };
    const out = dragCorner(tall, "bottom-right", delta, { keepRatio: true });
    expect(out.width / out.height).toBeCloseTo(tall.width / tall.height, 2);
    const away = (size: { width: number; height: number }) =>
      Math.hypot(
        size.width - (tall.width + delta.x),
        size.height - (tall.height + delta.y),
      );
    // The two answers the axis-leading rule could give are both further from
    // where the pointer actually went than this one is.
    const ledByWidth = { width: 1479, height: 3206 };
    const ledByHeight = { width: 1364, height: 2956 };
    expect(away(out)).toBeLessThan(away(ledByWidth));
    expect(away(out)).toBeLessThan(away(ledByHeight));
    // …and it is not a lever. A projection can only ever be shorter than what
    // it projects, so the corner cannot travel further than the hand did — the
    // one property the old rule broke, and the one that made it feel like a
    // bug rather than a handle.
    expect(
      Math.hypot(out.width - tall.width, out.height - tall.height),
    ).toBeLessThanOrEqual(Math.hypot(delta.x, delta.y) + 1);
    // The width-led answer did travel further: 300 across and 650 down, for a
    // drag of 500.
    expect(
      Math.hypot(
        ledByWidth.width - tall.width,
        ledByWidth.height - tall.height,
      ),
    ).toBeGreaterThan(Math.hypot(delta.x, delta.y));
  });

  it("holds a wild drag to the proportions as well as to the range", () => {
    // Clamping each side on its own would hand back a square page from a 2:1
    // one, which is the one thing "keep proportions" promises not to do.
    expect(
      dragCorner(
        start,
        "bottom-right",
        { x: 99999, y: 99999 },
        { keepRatio: true },
      ),
    ).toEqual({ width: MAX_CANVAS_SIDE, height: MAX_CANVAS_SIDE / 2 });
    expect(
      dragCorner(
        start,
        "bottom-right",
        { x: -99999, y: -99999 },
        { keepRatio: true },
      ),
    ).toEqual({ width: MIN_CANVAS_SIDE * 2, height: MIN_CANVAS_SIDE });
  });

  it("holds a wild drag inside the sizes a page can be", () => {
    expect(dragCorner(start, "bottom-right", { x: -99999, y: -99999 })).toEqual(
      {
        width: MIN_CANVAS_SIDE,
        height: MIN_CANVAS_SIDE,
      },
    );
    expect(dragCorner(start, "bottom-right", { x: 99999, y: 99999 })).toEqual({
      width: MAX_CANVAS_SIDE,
      height: MAX_CANVAS_SIDE,
    });
  });
});
