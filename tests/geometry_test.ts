// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  overlaps,
  strokeBounds,
  strokeVisible,
  type Rect,
} from "../src/app/geometry.ts";
import type { Stroke } from "../src/app/types.ts";

const path = (points: { x: number; y: number }[], size = 4): Stroke => ({
  id: "s",
  tool: "pencil",
  size,
  shape: { kind: "path", points },
});

describe("stroke bounds", () => {
  it("wraps a path's extent, padded for how far a painter can spread", () => {
    const box = strokeBounds(
      path([
        { x: 100, y: 100 },
        { x: 200, y: 140 },
      ]),
    )!;
    // The mark itself is 100×40; the padding is generous on purpose, because a
    // mark culled while a corner of it is on screen pops out of existence.
    expect(box.x).toBeLessThan(100);
    expect(box.y).toBeLessThan(100);
    expect(box.x + box.width).toBeGreaterThan(200);
    expect(box.y + box.height).toBeGreaterThan(140);
  });

  it("grows the padding with the stroke width", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const thin = strokeBounds(path(points, 2))!;
    const fat = strokeBounds(path(points, 40))!;
    expect(fat.width).toBeGreaterThan(thin.width);
  });

  it("covers every shape a tool can emit", () => {
    const shapes: Stroke["shape"][] = [
      { kind: "segment", from: { x: 0, y: 0 }, to: { x: 50, y: 20 } },
      { kind: "box", from: { x: 5, y: 5 }, to: { x: 60, y: 40 } },
      {
        kind: "region",
        contours: [
          [
            { x: 0, y: 0 },
            { x: 9, y: 0 },
            { x: 9, y: 9 },
          ],
        ],
      },
      { kind: "text", at: { x: 10, y: 10 }, text: "hello" },
    ];
    for (const shape of shapes) {
      const box = strokeBounds({ id: "s", tool: "t", size: 3, shape });
      expect(box, shape.kind).not.toBeNull();
      expect(box!.width, shape.kind).toBeGreaterThan(0);
    }
  });

  it("has no box for a stroke with no geometry", () => {
    expect(strokeBounds(path([]))).toBeNull();
  });

  it("measures a stroke once and remembers it", () => {
    const stroke = path([{ x: 1, y: 2 }]);
    expect(strokeBounds(stroke)).toBe(strokeBounds(stroke));
  });
});

describe("visibility", () => {
  const window_: Rect = { x: 0, y: 0, width: 100, height: 100 };

  it("overlaps counts a touching edge", () => {
    expect(overlaps(window_, { x: 100, y: 0, width: 10, height: 10 })).toBe(
      true,
    );
    expect(overlaps(window_, { x: 101, y: 0, width: 10, height: 10 })).toBe(
      false,
    );
  });

  it("keeps a mark that reaches the window and drops one that cannot", () => {
    expect(strokeVisible(path([{ x: 50, y: 50 }]), window_)).toBe(true);
    expect(strokeVisible(path([{ x: 4000, y: 4000 }]), window_)).toBe(false);
  });

  it("keeps a mark whose spread reaches in even though its geometry doesn't", () => {
    // A fat stroke just off the edge still paints inside it.
    expect(strokeVisible(path([{ x: 112, y: 50 }], 20), window_)).toBe(true);
  });

  it("paints everything when there is no window to clip against", () => {
    expect(strokeVisible(path([{ x: 9000, y: 9000 }]), undefined)).toBe(true);
  });
});
