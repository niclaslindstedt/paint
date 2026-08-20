// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Merging layers is the one edit to the stack that has to *interleave* marks:
// two layers becoming one means the marks that were painted apart end up in one
// bucket, and the order they come out in is the order they were painted, not
// the order they happened to sit in the flat array. That, plus the three rules
// that say what may be merged with what, is what this file guards.
import { describe, expect, it } from "vitest";

import {
  BACKGROUND_LAYER_ID,
  BASE_LAYER_ID,
  groupByLayer,
  visibleStrokes,
} from "../src/app/layers.ts";
import {
  canMergeAnything,
  canMergeFrom,
  canMergeInto,
  canMergeLayers,
  flattenedStack,
  isFlattened,
  mergedStack,
} from "../src/app/merge.ts";
import type { Drawing, Layer, Stroke } from "../src/app/types.ts";

let next = 0;

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
  return { id: "d", name: "d", width: 100, height: 100, strokes: [], ...over };
}

/** A three-layer stack: the sheet, the base, and one above it. */
function stack(over: Partial<Layer>[] = []): Layer[] {
  return [
    { id: BACKGROUND_LAYER_ID, name: "", locked: true, ...over[0] },
    { id: BASE_LAYER_ID, name: "", ...over[1] },
    { id: "top", name: "Layer 2", ...over[2] },
  ];
}

const ids = (strokes: readonly Stroke[]) => strokes.map((s) => s.id);

describe("what may be merged", () => {
  const doc = drawing({ layers: stack() });

  it("never merges the sheet away", () => {
    // It carries the page colour: a stack with no background is a drawing with
    // no page, which is not a thing this dialog gets to make.
    expect(canMergeFrom(doc, BACKGROUND_LAYER_ID)).toBe(false);
    expect(canMergeInto(doc, BACKGROUND_LAYER_ID)).toBe(false); // locked here
  });

  it("merges onto the sheet once it is unlocked", () => {
    const open = drawing({ layers: stack([{ locked: false }]) });
    expect(canMergeInto(open, BACKGROUND_LAYER_ID)).toBe(true);
    expect(canMergeFrom(open, BACKGROUND_LAYER_ID)).toBe(false);
  });

  it("refuses a sheet that is switched off", () => {
    // A transparent page: everything merged onto it would be on the one layer
    // nothing paints.
    const clear = drawing({
      layers: stack([{ locked: false, hidden: true }]),
    });
    expect(canMergeInto(clear, BACKGROUND_LAYER_ID)).toBe(false);
  });

  it("leaves a locked layer out of it, both ways", () => {
    const held = drawing({ layers: stack([{}, {}, { locked: true }]) });
    expect(canMergeFrom(held, "top")).toBe(false);
    expect(canMergeInto(held, "top")).toBe(false);
  });

  it("takes hidden layers, which is the whole no-lost-marks rule", () => {
    const dark = drawing({ layers: stack([{}, {}, { hidden: true }]) });
    expect(canMergeFrom(dark, "top")).toBe(true);
    expect(canMergeInto(dark, "top")).toBe(true);
  });

  it("wants two layers and the destination among them", () => {
    expect(canMergeLayers(doc, [BASE_LAYER_ID], BASE_LAYER_ID)).toBe(false);
    expect(canMergeLayers(doc, [BASE_LAYER_ID, "top"], "gone")).toBe(false);
    expect(canMergeLayers(doc, [BASE_LAYER_ID, "top"], "top")).toBe(true);
  });

  it("has nothing to offer a one-layer drawing", () => {
    expect(canMergeAnything(drawing())).toBe(false);
    expect(canMergeAnything(doc)).toBe(true);
  });
});

describe("mergedStack", () => {
  it("keeps every mark, in the order it was painted", () => {
    const under = stroke(BASE_LAYER_ID);
    const over = stroke("top");
    const alsoUnder = stroke(BASE_LAYER_ID);
    const doc = drawing({
      layers: stack(),
      // Drawn base, top, base — so the flat array's order is *not* the paint
      // order, and a merge that just filtered would put the top mark last.
      strokes: [under, over, alsoUnder],
    });
    const merged = mergedStack(doc, [BASE_LAYER_ID, "top"], "top")!;
    expect(ids(merged.strokes)).toEqual([under.id, alsoUnder.id, over.id]);
    expect(merged.strokes.every((s) => s.layer === "top")).toBe(true);
    expect(merged.layers.map((l) => l.id)).toEqual([
      BACKGROUND_LAYER_ID,
      "top",
    ]);
    expect(merged.activeLayerId).toBe("top");
  });

  it("paints the same picture it did before", () => {
    const doc = drawing({
      layers: stack(),
      strokes: [stroke(BASE_LAYER_ID), stroke("top"), stroke(BASE_LAYER_ID)],
    });
    const before = ids(visibleStrokes(doc));
    const merged = mergedStack(doc, [BASE_LAYER_ID, "top"], BASE_LAYER_ID)!;
    expect(ids(visibleStrokes({ ...doc, ...merged }))).toEqual(before);
  });

  it("brings a hidden layer's marks out where they can be seen", () => {
    const hidden = stroke("top");
    const doc = drawing({
      layers: stack([{}, {}, { hidden: true }]),
      strokes: [stroke(BASE_LAYER_ID), hidden],
    });
    const merged = mergedStack(doc, [BASE_LAYER_ID, "top"], BASE_LAYER_ID)!;
    const after = { ...doc, ...merged };
    expect(ids(visibleStrokes(after))).toContain(hidden.id);
  });

  it("switches the destination's own eye back on", () => {
    const doc = drawing({
      layers: stack([{}, {}, { hidden: true }]),
      strokes: [stroke(BASE_LAYER_ID), stroke("top")],
    });
    const merged = mergedStack(doc, [BASE_LAYER_ID, "top"], "top")!;
    expect(merged.layers.find((l) => l.id === "top")!.hidden).toBeUndefined();
  });

  it("leaves marks on layers nobody ticked exactly as they were", () => {
    const kept = stroke("top");
    const doc = drawing({
      layers: [...stack(), { id: "extra", name: "Layer 3" }],
      strokes: [kept, stroke("extra"), stroke(BASE_LAYER_ID)],
    });
    const merged = mergedStack(doc, [BASE_LAYER_ID, "extra"], "extra")!;
    expect(merged.strokes.find((s) => s.id === kept.id)).toBe(kept);
  });

  it("hands back nothing for a merge the rules refuse", () => {
    const doc = drawing({ layers: stack() });
    expect(mergedStack(doc, [BASE_LAYER_ID, BACKGROUND_LAYER_ID], "top")).toBe(
      null,
    );
  });
});

describe("flattenedStack", () => {
  it("puts a page with a sheet on the sheet, unlocked", () => {
    const doc = drawing({
      layers: stack(),
      strokes: [stroke("top"), stroke(BASE_LAYER_ID)],
    });
    const flat = flattenedStack(doc)!;
    expect(flat.layers).toEqual([{ id: BACKGROUND_LAYER_ID, name: "" }]);
    expect(flat.activeLayerId).toBe(BACKGROUND_LAYER_ID);
    expect(flat.strokes.every((s) => s.layer === BACKGROUND_LAYER_ID)).toBe(
      true,
    );
    expect(isFlattened({ ...doc, ...flat })).toBe(true);
  });

  it("keeps painting the marks in the order the stack painted them", () => {
    const bottom = stroke(BASE_LAYER_ID);
    const top = stroke("top");
    const alsoBottom = stroke(BASE_LAYER_ID);
    const doc = drawing({
      layers: stack(),
      strokes: [top, bottom, alsoBottom],
    });
    const flat = flattenedStack(doc)!;
    expect(ids(flat.strokes)).toEqual([bottom.id, alsoBottom.id, top.id]);
  });

  it("ignores a lock, because the panel that unlocks is what is going", () => {
    const doc = drawing({
      layers: stack([{}, {}, { locked: true }]),
      strokes: [stroke("top")],
    });
    const flat = flattenedStack(doc)!;
    expect(flat.layers).toHaveLength(1);
    expect(
      groupByLayer({ ...doc, ...flat }).get(BACKGROUND_LAYER_ID),
    ).toHaveLength(1);
  });

  it("keeps a transparent page transparent, and its marks on show", () => {
    // The sheet being switched off *is* the page having no sheet, so it stays
    // switched off — and the drawing lands on the layer above it rather than
    // going invisible.
    const mark = stroke("top");
    const doc = drawing({
      layers: stack([{ hidden: true }]),
      strokes: [mark],
    });
    const flat = flattenedStack(doc)!;
    expect(flat.layers.map((l) => l.id)).toEqual([
      BACKGROUND_LAYER_ID,
      BASE_LAYER_ID,
    ]);
    expect(flat.layers[0]!.hidden).toBe(true);
    expect(flat.activeLayerId).toBe(BASE_LAYER_ID);
    expect(ids(visibleStrokes({ ...doc, ...flat }))).toEqual([mark.id]);
  });

  it("says nothing to do for a drawing already down to one layer", () => {
    const flat = drawing({
      layers: [{ id: BACKGROUND_LAYER_ID, name: "" }],
      strokes: [stroke(BACKGROUND_LAYER_ID)],
    });
    expect(isFlattened(flat)).toBe(true);
    expect(flattenedStack(flat)).toBe(null);
    // …and a fresh drawing, whose stack is only implied, is *not* one of them:
    // its sheet is locked and there is a layer above it.
    expect(isFlattened(drawing())).toBe(false);
    expect(flattenedStack(drawing())).not.toBe(null);
  });
});
