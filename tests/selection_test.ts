// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { strokeBounds } from "../src/app/bounds.ts";
import {
  boxRegion,
  eraseRegion,
  inBox,
  maskOf,
  moveRegion,
  moveRegionContents,
  offsetTo,
  regionCovers,
  regionHolds,
  scaleRegion,
  selectionBox,
  selectionOf,
  splitRegion,
  translateStroke,
} from "../src/app/selection.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

// A selection is arithmetic over the document and nothing else — where the
// window is, which marks it reaches, and what the three edits through it leave
// behind. All of it is pure, so the whole feature is driveable here without a
// pointer or a canvas.
//
// The one thing it is *not* is a set of marks. Nothing below hands back "what is
// selected": a window holds an area, and what the edits produce is a stroke list
// with windows recorded on the marks the outline cut.

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

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

const page = (strokes: Stroke[], extra: Partial<Drawing> = {}): Drawing => ({
  id: "d",
  name: "",
  width: 400,
  height: 300,
  strokes,
  ...extra,
});

// Every selection tool hands over closed contours, whatever gesture made them,
// so one set of tests answers for the box, the oval, the lasso and the traced
// outline alike (see `plugins/builtin/select.ts`).
const boxContour = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe("the window itself", () => {
  it("is nothing at all for an outline that encloses nothing", () => {
    expect(selectionOf(null)).toBeNull();
    expect(selectionOf([])).toBeNull();
    expect(selectionOf([boxContour(10, 10, 0, 0)])).toBeNull();
  });

  it("carries the box its corner grips hang off", () => {
    const window = selectionOf([boxContour(10, 20, 30, 40)])!;
    expect(window.box).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("holds a point by the even-odd rule, so a traced hole is outside it", () => {
    // An outline with an island in it, exactly as the bucket traces one.
    const ring = [boxContour(0, 0, 200, 200), boxContour(80, 80, 40, 40)];
    expect(regionHolds(ring, { x: 20, y: 20 })).toBe(true);
    expect(regionHolds(ring, { x: 100, y: 100 })).toBe(false);
    expect(regionHolds(ring, { x: 300, y: 20 })).toBe(false);
  });

  it("slides without changing shape", () => {
    const lasso = [
      { x: 0, y: 0 },
      { x: 20, y: 5 },
      { x: 10, y: 30 },
    ];
    expect(moveRegion([lasso], 5, -5)).toEqual([
      [
        { x: 5, y: -5 },
        { x: 25, y: 0 },
        { x: 15, y: 25 },
      ],
    ]);
  });

  it("stretches from its own box when a grip is dragged", () => {
    // A lasso adjusted by a corner is still that lasso — the shape is carried
    // along proportionally rather than replaced by the rectangle.
    const lasso = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    const from = { x: 0, y: 0, width: 10, height: 10 };
    const to = { x: 0, y: 0, width: 20, height: 10 };
    expect(scaleRegion([lasso], from, to)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 10, y: 10 },
      ],
    ]);
  });

  it("leaves a window with no size to scale from alone", () => {
    const region = boxRegion({ x: 0, y: 0, width: 4, height: 4 });
    const flat = { x: 0, y: 0, width: 0, height: 0 };
    expect(scaleRegion(region, flat, { x: 5, y: 5, width: 9, height: 9 })).toBe(
      region,
    );
  });
});

describe("splitRegion", () => {
  it("cuts the marks the outline crosses and keeps the ones it swallows", () => {
    // `across` runs out of the window, `inside` sits well within it, and `away`
    // is nowhere near it.
    const drawing = page([
      stroke("across", {
        kind: "segment",
        from: { x: 40, y: 40 },
        to: { x: 300, y: 40 },
      }),
      line("inside", 40, 60),
      line("away", 300, 200),
    ]);
    const split = splitRegion(drawing, [boxContour(20, 20, 100, 100)]);
    expect([...split.ids]).toEqual(["across", "inside"]);
    // The mark held whole is handed back untouched — nothing to cut it to.
    expect(split.inside.map((s) => s.id)).toEqual(["across", "inside"]);
    expect(split.inside.find((s) => s.id === "inside")!.clip).toBeUndefined();
    // The one the outline crossed is cut both ways: to the window, and to
    // everywhere the window isn't.
    expect(split.inside.find((s) => s.id === "across")!.clip).toHaveLength(1);
    expect(split.outside.map((s) => s.id)).toEqual(["across"]);
    expect(split.outside[0]!.clip![0]!.contours).toHaveLength(2);
  });

  it("only ever reaches the layer being drawn on", () => {
    const drawing = page(
      [line("here", 20, 20), line("below", 20, 20, "under")],
      {
        layers: [
          { id: "under", name: "" },
          { id: "base", name: "" },
        ],
        activeLayerId: "base",
      },
    );
    const split = splitRegion(drawing, [boxContour(0, 0, 200, 200)]);
    expect([...split.ids]).toEqual(["here"]);
  });

  it("reaches nothing at all on a locked layer", () => {
    const drawing = page([line("held", 20, 20, "background")], {
      layers: [{ id: "background", name: "", locked: true }],
      activeLayerId: "background",
    });
    expect(splitRegion(drawing, [boxContour(0, 0, 200, 200)]).ids.size).toBe(0);
  });

  it("reaches nothing from an outline that is nowhere near the ink", () => {
    const drawing = page([line("a", 0, 0)]);
    expect(splitRegion(drawing, [boxContour(300, 200, 20, 20)]).ids.size).toBe(
      0,
    );
  });

  it("stacks a second window rather than replacing the first", () => {
    // A mark drawn inside one selection and then cut by another is cut by both.
    const drawn = {
      ...line("a", 0, 0),
      clip: [maskOf(boxRegion(box(0, 0, 8, 8)))],
    };
    const drawing = page([drawn]);
    const split = splitRegion(drawing, [boxContour(4, 4, 100, 100)]);
    expect(split.inside[0]!.clip).toHaveLength(2);
  });
});

describe("eraseRegion", () => {
  it("takes what the window holds and cuts what it only crosses", () => {
    const drawing = page([
      stroke("across", {
        kind: "segment",
        from: { x: 40, y: 40 },
        to: { x: 300, y: 40 },
      }),
      line("inside", 40, 60),
      line("away", 300, 200),
    ]);
    const strokes = eraseRegion(drawing, [boxContour(20, 20, 100, 100)])!;
    expect(strokes.map((s) => s.id)).toEqual(["across", "away"]);
    // What is left of the mark the window crossed is the whole mark, held to
    // everywhere the window wasn't — so one undo brings all of it back.
    expect(strokes[0]!.clip).toHaveLength(1);
    expect(strokes[0]!.shape).toEqual(drawing.strokes[0]!.shape);
  });

  it("is nothing to do when the window holds nothing", () => {
    const drawing = page([line("a", 0, 0)]);
    expect(eraseRegion(drawing, [boxContour(300, 200, 20, 20)])).toBeNull();
  });
});

describe("moveRegionContents", () => {
  const mint = () => {
    let n = 0;
    return () => `new${++n}`;
  };

  it("carries a mark the window holds whole, id and all", () => {
    const drawing = page([line("a", 40, 40)]);
    const strokes = moveRegionContents(
      drawing,
      [boxContour(20, 20, 100, 100)],
      10,
      5,
      mint(),
    )!;
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.id).toBe("a");
    expect(strokes[0]!.shape).toEqual({
      kind: "segment",
      from: { x: 50, y: 45 },
      to: { x: 60, y: 55 },
    });
  });

  it("cuts a mark the window crosses in two, the travelling half on top", () => {
    const drawing = page([
      stroke("across", {
        kind: "segment",
        from: { x: 40, y: 40 },
        to: { x: 300, y: 40 },
      }),
    ]);
    const strokes = moveRegionContents(
      drawing,
      [boxContour(20, 20, 100, 100)],
      0,
      50,
      mint(),
    )!;
    expect(strokes.map((s) => s.id)).toEqual(["across", "new1"]);
    // The half that stayed keeps its geometry and is held to everywhere the
    // window wasn't; the half that travelled is the same mark, moved, held to
    // where the window went.
    expect(strokes[0]!.shape).toEqual(drawing.strokes[0]!.shape);
    expect(strokes[0]!.clip![0]!.contours).toHaveLength(2);
    expect(strokes[1]!.shape).toMatchObject({ from: { x: 40, y: 90 } });
    // …and its window travelled with it, or the ink would slide out from under
    // its own cut.
    expect(strokes[1]!.clip![0]!.contours[0]![0]).toEqual({ x: 20, y: 70 });
  });

  it("is nothing to do for a drag that went nowhere", () => {
    const drawing = page([line("a", 40, 40)]);
    expect(
      moveRegionContents(drawing, [boxContour(20, 20, 100, 100)], 0, 0, mint()),
    ).toBeNull();
  });
});

describe("a mark's window", () => {
  it("shrinks what the mark is measured to cover", () => {
    const wide = stroke("a", {
      kind: "segment",
      from: { x: 0, y: 50 },
      to: { x: 400, y: 50 },
    });
    const cut = { ...wide, clip: [maskOf(boxRegion(box(0, 0, 100, 100)))] };
    expect(strokeBounds(wide)!.width).toBeGreaterThan(300);
    expect(strokeBounds(cut)!.width).toBeLessThanOrEqual(100);
  });

  it("makes a mark that lands nowhere measure as nothing at all", () => {
    const cut = {
      ...line("a", 0, 0),
      clip: [maskOf(boxRegion(box(200, 200, 20, 20)))],
    };
    expect(strokeBounds(cut)).toBeNull();
  });

  it("travels with the mark", () => {
    const cut = {
      ...line("a", 0, 0),
      clip: [maskOf(boxRegion(box(0, 0, 20, 20)))],
    };
    const moved = translateStroke(cut, 5, 7);
    expect(moved.clip![0]!.contours[0]![0]).toEqual({ x: 5, y: 7 });
  });
});

describe("regionCovers", () => {
  it("is yes only when the whole box is inside the outline", () => {
    const window = [boxContour(0, 0, 100, 100)];
    expect(regionCovers(window, box(10, 10, 20, 20))).toBe(true);
    expect(regionCovers(window, box(90, 90, 40, 40))).toBe(false);
    expect(regionCovers(window, box(200, 200, 10, 10))).toBe(false);
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
