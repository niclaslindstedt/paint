// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the page is painted as while a filter's sliders are still moving.
//
// The preview is only worth having if it is the *same* change Apply makes, and
// only affordable if it leaves the marks alone — the frame cache decides whether
// it can blit by comparing strokes one by one (see `cache.ts`), so a preview
// that copied them would repaint the document on every pointer sample of a
// drag. Both are checked here, along with the rule that keeps it a preview: the
// drawing it was made from is never touched.
import { describe, expect, it } from "vitest";

import { previewFilter } from "../src/app/filterPreview.ts";
import { activeFilters } from "../src/app/filters.ts";
import { BACKGROUND_LAYER_ID, BASE_LAYER_ID } from "../src/app/layers.ts";
import type { Drawing, Filter, Stroke } from "../src/app/types.ts";

const mark: Stroke = {
  id: "s1",
  tool: "pencil",
  size: 4,
  shape: { kind: "path", points: [{ x: 0, y: 0 }] },
};

function drawing(over: Partial<Drawing> = {}): Drawing {
  return {
    id: "d1",
    name: "sketch",
    width: 800,
    height: 600,
    strokes: [mark],
    ...over,
  };
}

const blur: Filter = { kind: "blur", radius: 6 };
const noise: Filter = { kind: "noise", amount: 0.35, grain: 2 };

describe("previewing a page filter", () => {
  it("shows the draft on a page that carries nothing", () => {
    const page = drawing();
    expect(activeFilters(previewFilter(page, { kind: "blur" }, blur))).toEqual([
      blur,
    ]);
    // …and the drawing it was made from is exactly the drawing it was.
    expect(page.filters).toBeUndefined();
  });

  it("moves the filter already there rather than stacking a second", () => {
    const page = drawing({ filters: [{ kind: "blur", radius: 2 }, noise] });
    const seen = activeFilters(
      previewFilter(page, { kind: "blur" }, { kind: "blur", radius: 30 }),
    );
    expect(seen).toEqual([{ kind: "blur", radius: 30 }, noise]);
    expect(page.filters?.[0]).toEqual({ kind: "blur", radius: 2 });
  });

  it("hands the marks back as the same objects", () => {
    const page = drawing();
    const previewed = previewFilter(page, { kind: "noise" }, noise);
    expect(previewed.strokes).toBe(page.strokes);
    expect(previewed.strokes[0]).toBe(mark);
  });
});

describe("previewing a layer's filter", () => {
  it("puts it on that layer and no other", () => {
    const page = drawing({
      layers: [
        { id: BACKGROUND_LAYER_ID, name: "", locked: true },
        { id: BASE_LAYER_ID, name: "" },
      ],
    });
    const previewed = previewFilter(
      page,
      { kind: "blur", layerId: BASE_LAYER_ID },
      blur,
    );
    expect(previewed.layers?.[0]?.filters).toBeUndefined();
    expect(previewed.layers?.[1]?.filters).toEqual([blur]);
    // The page's own filters are a different setting and stay off.
    expect(previewed.filters).toBeUndefined();
    expect(page.layers?.[1]?.filters).toBeUndefined();
  });

  it("materialises the implicit stack, as applying one would", () => {
    const page = drawing();
    const previewed = previewFilter(
      page,
      { kind: "blur", layerId: BASE_LAYER_ID },
      blur,
    );
    expect(previewed.layers?.map((layer) => layer.id)).toEqual([
      BACKGROUND_LAYER_ID,
      BASE_LAYER_ID,
    ]);
    expect(previewed.layers?.[1]?.filters).toEqual([blur]);
    expect(page.layers).toBeUndefined();
  });

  it("previews nothing for a layer the stack no longer has", () => {
    const page = drawing();
    expect(previewFilter(page, { kind: "blur", layerId: "gone" }, blur)).toBe(
      page,
    );
  });
});
