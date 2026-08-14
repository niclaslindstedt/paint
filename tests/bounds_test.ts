// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  clipToPage,
  drawingBounds,
  pageFitting,
  strokeBounds,
} from "../src/app/bounds.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

// What a mark covers. Two features lean on these numbers — cropping a download
// to the marks, and growing the page around a dropped image — and both are
// wrong in a way you only notice in the finished file, so they are pinned here.

const stroke = (over: Partial<Stroke>): Stroke => ({
  id: "s1",
  tool: "pencil",
  size: 4,
  shape: { kind: "path", points: [{ x: 10, y: 10 }] },
  ...over,
});

const drawing = (strokes: Stroke[]): Drawing => ({
  id: "d1",
  name: "sketch",
  width: 800,
  height: 600,
  strokes,
});

describe("strokeBounds", () => {
  it("includes half the nib on every side of a path", () => {
    const box = strokeBounds(
      stroke({
        size: 10,
        shape: {
          kind: "path",
          points: [
            { x: 20, y: 30 },
            { x: 60, y: 50 },
          ],
        },
      }),
    );
    expect(box).toEqual({ x: 15, y: 25, width: 50, height: 30 });
  });

  it("normalises a shape dragged up and to the left", () => {
    const box = strokeBounds(
      stroke({
        size: 2,
        shape: { kind: "box", from: { x: 90, y: 80 }, to: { x: 40, y: 20 } },
      }),
    );
    expect(box).toEqual({ x: 39, y: 19, width: 52, height: 62 });
  });

  it("gives an image exactly its own frame — a bitmap has no nib", () => {
    const box = strokeBounds(
      stroke({
        tool: "image",
        size: 1,
        shape: {
          kind: "image",
          from: { x: 100, y: 50 },
          to: { x: 300, y: 200 },
          src: "data:image/png;base64,AAA",
        },
      }),
    );
    expect(box).toEqual({ x: 100, y: 50, width: 200, height: 150 });
  });

  it("has nothing to say about an empty path", () => {
    expect(strokeBounds(stroke({ shape: { kind: "path", points: [] } }))).toBe(
      null,
    );
  });
});

describe("drawingBounds", () => {
  it("unions every mark", () => {
    const box = drawingBounds(
      drawing([
        stroke({
          size: 2,
          shape: { kind: "path", points: [{ x: 50, y: 50 }] },
        }),
        stroke({
          size: 2,
          shape: {
            kind: "segment",
            from: { x: 200, y: 100 },
            to: { x: 300, y: 400 },
          },
        }),
      ]),
    );
    expect(box).toEqual({ x: 49, y: 49, width: 252, height: 352 });
  });

  it("is null for a blank page, so a caller can fall back to the sheet", () => {
    expect(drawingBounds(drawing([]))).toBe(null);
  });

  it("ignores a hidden layer, so a crop is around what you can see", () => {
    // A hidden layer is not in the file. Measuring it would crop the download
    // to a mark that isn't there — a margin of blank page with nothing in it.
    const shown = stroke({
      id: "shown",
      size: 2,
      layer: "base",
      shape: { kind: "path", points: [{ x: 50, y: 50 }] },
    });
    const hidden = stroke({
      id: "hidden",
      size: 2,
      layer: "top",
      shape: { kind: "path", points: [{ x: 600, y: 500 }] },
    });
    const page: Drawing = {
      ...drawing([shown, hidden]),
      layers: [
        { id: "base", name: "" },
        { id: "top", name: "Layer 2", hidden: true },
      ],
    };
    expect(drawingBounds(page)).toEqual({
      x: 49,
      y: 49,
      width: 2,
      height: 2,
    });
  });
});

describe("clipToPage", () => {
  it("keeps a box to the sheet it was painted on", () => {
    expect(
      clipToPage(
        { x: -40, y: 500, width: 200, height: 300 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 0, y: 500, width: 160, height: 100 });
  });

  it("collapses a box that is entirely off the page", () => {
    const clipped = clipToPage(
      { x: 900, y: 900, width: 50, height: 50 },
      { width: 800, height: 600 },
    );
    expect(clipped.width).toBe(0);
    expect(clipped.height).toBe(0);
  });
});

describe("pageFitting", () => {
  it("grows right and down to hold the box", () => {
    expect(
      pageFitting(
        { width: 800, height: 600 },
        { x: 700, y: 100, width: 400.5, height: 100 },
      ),
    ).toEqual({ width: 1101, height: 600 });
  });

  it("never shrinks the page, and never moves its origin", () => {
    expect(
      pageFitting(
        { width: 800, height: 600 },
        { x: 10, y: 10, width: 20, height: 20 },
      ),
    ).toEqual({ width: 800, height: 600 });
  });
});
