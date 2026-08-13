// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Layers are a *view* of one flat stroke list, so every question about them is
// arithmetic over that list: which layer a mark is on, what order the marks
// come out in, and what survives a delete. The two rules worth guarding are the
// ones nothing else in the app re-states — a mark that names no layer belongs
// to the base wherever the base has been dragged to, and a mark naming a layer
// that isn't there is still a mark on the page.
import { describe, expect, it } from "vitest";

import {
  BASE_LAYER_ID,
  activeLayer,
  activeLayerId,
  countByLayer,
  drawingLayers,
  hasLayers,
  nextLayerName,
  reorderLayers,
  strokeLayer,
  strokesExcept,
  visibleStrokes,
} from "../src/app/layers.ts";
import type { Drawing, Layer, Stroke } from "../src/app/types.ts";

let next = 0;

/** A mark, optionally filed onto a layer. */
function stroke(layer?: string): Stroke {
  return {
    id: `s${next++}`,
    tool: "pencil",
    size: 4,
    ...(layer ? { layer } : {}),
    shape: { kind: "path", points: [{ x: 0, y: 0 }] },
  };
}

function drawing(over: Partial<Drawing> = {}): Drawing {
  return {
    id: "d",
    name: "d",
    width: 100,
    height: 100,
    strokes: [],
    ...over,
  };
}

const base: Layer = { id: BASE_LAYER_ID, name: "" };
const top: Layer = { id: "top", name: "Layer 2" };

describe("the implicit stack", () => {
  it("reads a drawing with no layers as one unnamed layer", () => {
    const page = drawing({ strokes: [stroke(), stroke()] });
    expect(hasLayers(page)).toBe(false);
    expect(drawingLayers(page)).toEqual([{ id: BASE_LAYER_ID, name: "" }]);
    // …and stamps nothing on the marks it draws, so a one-layer document is
    // byte-for-byte what this app has always written.
    expect(activeLayerId(page)).toBeUndefined();
  });

  it("hands back the document's own stroke array, uncopied", () => {
    // The frame cache compares strokes by identity, so a fresh copy per call
    // would cost an allocation on every frame of every gesture.
    const strokes = [stroke(), stroke()];
    expect(visibleStrokes(drawing({ strokes }))).toBe(strokes);
    expect(visibleStrokes(drawing({ strokes, layers: [base] }))).toBe(strokes);
  });
});

describe("paint order", () => {
  it("paints the stack bottom up, in drawn order within a layer", () => {
    const first = stroke(BASE_LAYER_ID);
    const second = stroke("top");
    const third = stroke(BASE_LAYER_ID);
    const page = drawing({
      strokes: [first, second, third],
      layers: [base, top],
    });
    expect(visibleStrokes(page).map((s) => s.id)).toEqual([
      first.id,
      third.id,
      second.id,
    ]);
  });

  it("leaves a hidden layer's marks out entirely", () => {
    const under = stroke(BASE_LAYER_ID);
    const over = stroke("top");
    const page = drawing({
      strokes: [under, over],
      layers: [base, { ...top, hidden: true }],
    });
    expect(visibleStrokes(page).map((s) => s.id)).toEqual([under.id]);
    // Including when the hidden one is the only layer there is.
    expect(
      visibleStrokes(
        drawing({ strokes: [under], layers: [{ ...base, hidden: true }] }),
      ),
    ).toEqual([]);
  });

  it("carries the marks that name no layer with the base, not with the bottom", () => {
    // The case a minted base id would get wrong: legacy marks name nothing, so
    // raising the base has to lift them over the layer they were under.
    const legacy = stroke();
    const above = stroke("top");
    const page = drawing({
      strokes: [legacy, above],
      layers: [top, base],
    });
    expect(visibleStrokes(page).map((s) => s.id)).toEqual([
      above.id,
      legacy.id,
    ]);
    expect(strokeLayer(legacy, page).id).toBe(BASE_LAYER_ID);
  });

  it("paints a mark whose layer is gone rather than dropping it", () => {
    const orphan = stroke("deleted-elsewhere");
    const page = drawing({ strokes: [orphan], layers: [base, top] });
    expect(visibleStrokes(page)).toEqual([orphan]);
    expect(strokeLayer(orphan, page).id).toBe(BASE_LAYER_ID);
  });
});

describe("what the panel counts", () => {
  it("counts the marks on each layer, hidden ones included", () => {
    const page = drawing({
      strokes: [stroke(), stroke("top"), stroke(BASE_LAYER_ID)],
      layers: [base, { ...top, hidden: true }],
    });
    expect([...countByLayer(page)]).toEqual([
      [BASE_LAYER_ID, 2],
      ["top", 1],
    ]);
  });

  it("counts every layer, empty ones included", () => {
    expect([...countByLayer(drawing({ layers: [base, top] }))]).toEqual([
      [BASE_LAYER_ID, 0],
      ["top", 0],
    ]);
  });
});

describe("deleting a layer", () => {
  it("takes the marks on it, and the homeless ones with the base", () => {
    const legacy = stroke();
    const filed = stroke(BASE_LAYER_ID);
    const above = stroke("top");
    const page = drawing({
      strokes: [legacy, filed, above],
      layers: [base, top],
    });
    expect(strokesExcept(page, "top")).toEqual([legacy, filed]);
    expect(strokesExcept(page, BASE_LAYER_ID)).toEqual([above]);
  });
});

describe("the selected layer", () => {
  it("falls back to the top of the stack", () => {
    const page = drawing({ layers: [base, top] });
    expect(activeLayer(page).id).toBe("top");
    expect(activeLayer({ ...page, activeLayerId: "gone" }).id).toBe("top");
    expect(activeLayer({ ...page, activeLayerId: BASE_LAYER_ID }).id).toBe(
      BASE_LAYER_ID,
    );
    expect(activeLayerId({ ...page, activeLayerId: BASE_LAYER_ID })).toBe(
      BASE_LAYER_ID,
    );
  });
});

describe("reordering", () => {
  const stack = [base, top, { id: "third", name: "Layer 3" }];

  it("moves one layer and keeps the rest in order", () => {
    expect(reorderLayers(stack, 0, 2).map((l) => l.id)).toEqual([
      "top",
      "third",
      BASE_LAYER_ID,
    ]);
    expect(reorderLayers(stack, 2, 1).map((l) => l.id)).toEqual([
      BASE_LAYER_ID,
      "third",
      "top",
    ]);
  });

  it("hands the stack back untouched for a move that goes nowhere", () => {
    for (const [from, to] of [
      [1, 1],
      [-1, 0],
      [0, 3],
      [3, 0],
    ]) {
      expect(reorderLayers(stack, from!, to!)).toEqual(stack);
    }
  });
});

describe("naming a new layer", () => {
  const name = (n: number) => `Layer ${n}`;

  it("numbers past the end of the stack", () => {
    expect(nextLayerName([base], name)).toBe("Layer 2");
    expect(nextLayerName([base, top], name)).toBe("Layer 3");
  });

  it("skips a number still in use after a delete", () => {
    // Two layers, but "Layer 3" is one of them: numbering by count alone would
    // hand out a name the panel is already showing.
    expect(nextLayerName([base, { id: "x", name: "Layer 3" }], name)).toBe(
      "Layer 4",
    );
  });
});
