// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  inBox,
  offsetTo,
  selectionBox,
  strokesInBox,
  strokesInRegion,
  translateStroke,
} from "../src/app/selection.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

// A selection is arithmetic over the document and nothing else — which marks a
// box caught, how much page they cover, and what one looks like moved. All of
// it is pure, so the whole feature is driveable here without a pointer or a
// canvas.

const stroke = (
  id: string,
  shape: Stroke["shape"],
  layer?: string,
): Stroke => ({
  id,
  tool: "pencil",
  size: 2,
  ...(layer ? { layer } : {}),
  shape,
});

const line = (id: string, x: number, y: number, layer?: string) =>
  stroke(
    id,
    { kind: "segment", from: { x, y }, to: { x: x + 10, y: y + 10 } },
    layer,
  );

const page = (strokes: Stroke[], extra: Partial<Drawing> = {}): Drawing => ({
  id: "d",
  name: "",
  width: 400,
  height: 300,
  strokes,
  ...extra,
});

describe("strokesInBox", () => {
  it("catches what the marquee crosses, not only what it swallows", () => {
    // Dragging right around a long diagonal is a marquee you draw twice.
    const drawing = page([line("a", 0, 0), line("b", 200, 200)]);
    expect(
      strokesInBox(drawing, { x: 5, y: 5, width: 2, height: 2 }).map(
        (s) => s.id,
      ),
    ).toEqual(["a"]);
  });

  it("misses what the marquee never reached", () => {
    const drawing = page([line("a", 0, 0)]);
    expect(
      strokesInBox(drawing, { x: 300, y: 200, width: 20, height: 20 }),
    ).toEqual([]);
  });

  it("keeps the marks in paint order", () => {
    const drawing = page([line("a", 0, 0), line("b", 4, 4), line("c", 8, 8)]);
    expect(
      strokesInBox(drawing, { x: 0, y: 0, width: 100, height: 100 }).map(
        (s) => s.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("never catches a mark on a hidden layer", () => {
    // You cannot select what you cannot see, and deleting something invisible
    // is the worst kind of surprise.
    const drawing = page([line("shown", 0, 0), line("gone", 0, 0, "hidden")], {
      layers: [
        { id: "base", name: "base" },
        { id: "hidden", name: "hidden", hidden: true },
      ],
    });
    expect(
      strokesInBox(drawing, { x: 0, y: 0, width: 100, height: 100 }).map(
        (s) => s.id,
      ),
    ).toEqual(["shown"]);
  });

  it("never catches a mark on a locked layer", () => {
    // A lock that stopped the pencil but let a marquee drag the sheet off the
    // page would not be a lock.
    const drawing = page(
      [line("free", 0, 0), line("held", 0, 0, "background")],
      {
        layers: [
          { id: "background", name: "", locked: true },
          { id: "base", name: "" },
        ],
      },
    );
    expect(
      strokesInBox(drawing, { x: 0, y: 0, width: 100, height: 100 }).map(
        (s) => s.id,
      ),
    ).toEqual(["free"]);
  });

  it("catches everything on a drawing with nothing locked", () => {
    // The default stack locks the sheet, but nothing is *on* the sheet — the
    // marks a fresh drawing holds are all still selectable.
    const drawing = page([line("a", 0, 0), line("b", 4, 4)]);
    expect(
      strokesInBox(drawing, { x: 0, y: 0, width: 100, height: 100 }).map(
        (s) => s.id,
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("strokesInRegion", () => {
  // Every selection tool hands over closed contours, whatever gesture made
  // them, so one test answers for the box, the oval, the lasso and the traced
  // outline alike (see `plugins/builtin/select.ts`).
  const boxContour = (x: number, y: number, w: number, h: number) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];

  it("is the box case of itself when the outline is a rectangle", () => {
    const drawing = page([line("a", 0, 0), line("b", 200, 200)]);
    const box = { x: 5, y: 5, width: 2, height: 2 };
    expect(strokesInRegion(drawing, [boxContour(5, 5, 2, 2)])).toEqual(
      strokesInBox(drawing, box),
    );
  });

  it("catches only what the loop actually covers", () => {
    // The two marks share a bounding box the size of the page, so a marquee
    // over one of them would catch both if the outline were only its box. A
    // lasso down the left-hand side must not.
    const drawing = page([line("left", 0, 0), line("right", 200, 200)]);
    const lasso = [
      { x: -5, y: -5 },
      { x: 60, y: -5 },
      { x: 60, y: 60 },
      { x: 190, y: 190 },
      { x: 190, y: 260 },
      { x: -5, y: 260 },
    ];
    expect(strokesInRegion(drawing, [lasso]).map((s) => s.id)).toEqual([
      "left",
    ]);
  });

  it("catches a mark the outline swallows whole", () => {
    // Nothing crosses the mark's box here — the loop is far bigger than it —
    // so the containment half of the test is the one that has to answer.
    const drawing = page([line("a", 100, 100)]);
    const big = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 150, y: 250 },
    ];
    expect(strokesInRegion(drawing, [big]).map((s) => s.id)).toEqual(["a"]);
  });

  it("leaves a traced area's holes out of the selection", () => {
    // Two contours: an outline and the island inside it, exactly as the bucket
    // traces one. The even-odd rule puts the island outside the selection the
    // same way it leaves it unpainted.
    const drawing = page([line("in", 20, 20), line("hole", 100, 100)]);
    const ring = [boxContour(0, 0, 300, 250), boxContour(90, 90, 120, 120)];
    expect(strokesInRegion(drawing, ring).map((s) => s.id)).toEqual(["in"]);
  });

  it("holds the same locks a box marquee does", () => {
    const drawing = page(
      [line("free", 0, 0), line("held", 0, 0, "background")],
      {
        layers: [
          { id: "background", name: "", locked: true },
          { id: "base", name: "" },
        ],
      },
    );
    expect(
      strokesInRegion(drawing, [boxContour(-10, -10, 200, 200)]).map(
        (s) => s.id,
      ),
    ).toEqual(["free"]);
  });

  it("catches nothing from an outline that encloses nothing", () => {
    const drawing = page([line("a", 0, 0)]);
    expect(strokesInRegion(drawing, [])).toEqual([]);
    expect(strokesInRegion(drawing, [boxContour(300, 200, 20, 20)])).toEqual(
      [],
    );
  });
});

describe("selectionBox", () => {
  it("is null for nothing selected", () => {
    expect(selectionBox([])).toBeNull();
  });

  it("covers every mark in the selection", () => {
    const box = selectionBox([line("a", 0, 0), line("b", 100, 50)])!;
    expect(box.x).toBeLessThanOrEqual(0);
    expect(box.y).toBeLessThanOrEqual(0);
    expect(box.x + box.width).toBeGreaterThanOrEqual(110);
    expect(box.y + box.height).toBeGreaterThanOrEqual(60);
  });
});

describe("inBox", () => {
  const box = { x: 10, y: 10, width: 20, height: 20 };

  it("says yes inside and on the edge", () => {
    expect(inBox(box, { x: 20, y: 20 })).toBe(true);
    expect(inBox(box, { x: 10, y: 30 })).toBe(true);
  });

  it("says no outside", () => {
    expect(inBox(box, { x: 9, y: 20 })).toBe(false);
    expect(inBox(box, { x: 20, y: 31 })).toBe(false);
  });
});

describe("translateStroke", () => {
  it("moves a path point by point", () => {
    const moved = translateStroke(
      stroke("a", {
        kind: "path",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
      }),
      10,
      -3,
    );
    expect(moved.shape).toEqual({
      kind: "path",
      points: [
        { x: 10, y: -3 },
        { x: 15, y: 2 },
      ],
    });
  });

  it("moves the two anchors of a segment, a box and a bitmap", () => {
    for (const kind of ["segment", "box", "image"] as const) {
      const moved = translateStroke(
        stroke("a", {
          kind,
          from: { x: 1, y: 2 },
          to: { x: 3, y: 4 },
          ...(kind === "image" ? { src: "data:," } : {}),
        } as Stroke["shape"]),
        10,
        10,
      );
      expect(moved.shape).toMatchObject({
        from: { x: 11, y: 12 },
        to: { x: 13, y: 14 },
      });
    }
  });

  it("moves every contour of a filled area", () => {
    const moved = translateStroke(
      stroke("a", {
        kind: "region",
        contours: [[{ x: 0, y: 0 }], [{ x: 5, y: 5 }]],
      }),
      1,
      1,
    );
    expect(moved.shape).toEqual({
      kind: "region",
      contours: [[{ x: 1, y: 1 }], [{ x: 6, y: 6 }]],
    });
  });

  it("moves a caption's anchor and keeps its type", () => {
    const moved = translateStroke(
      stroke("a", {
        kind: "text",
        at: { x: 4, y: 4 },
        text: "hi",
        font: "serif",
        bold: true,
      }),
      -4,
      6,
    );
    expect(moved.shape).toEqual({
      kind: "text",
      at: { x: 0, y: 10 },
      text: "hi",
      font: "serif",
      bold: true,
    });
  });

  it("leaves the mark itself alone — only the geometry moves", () => {
    const original = { ...line("a", 0, 0), color: "#ef4444", opacity: 0.5 };
    const moved = translateStroke(original, 5, 5);
    expect(moved.id).toBe("a");
    expect(moved.color).toBe("#ef4444");
    expect(moved.opacity).toBe(0.5);
    // …and the original is untouched, because a stroke is immutable and the
    // canvas's mark cache compares them by identity.
    expect(original.shape).toEqual({
      kind: "segment",
      from: { x: 0, y: 0 },
      to: { x: 10, y: 10 },
    });
  });
});

describe("offsetTo", () => {
  it("puts the marks' top-left corner where the paste was asked for", () => {
    const marks = [line("a", 100, 100), line("b", 140, 140)];
    const box = selectionBox(marks)!;
    const by = offsetTo(marks, { x: 0, y: 0 });
    expect(box.x + by.x).toBeCloseTo(0);
    expect(box.y + by.y).toBeCloseTo(0);
  });

  it("moves nothing when there is nothing to move", () => {
    expect(offsetTo([], { x: 50, y: 50 })).toEqual({ x: 0, y: 0 });
  });
});
