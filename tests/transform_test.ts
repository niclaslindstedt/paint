// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  anchorOffset,
  keepProportions,
  mirrorDrawing,
  resizeCanvas,
  scaleDrawing,
  turnDrawing,
} from "../src/app/transform.ts";
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
