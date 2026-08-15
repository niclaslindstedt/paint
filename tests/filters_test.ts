// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  activeFilters,
  BLUR_TAIL,
  filterReach,
  layerFilterOf,
  orderedFilters,
  controlReadout,
  controlValue,
  filterDescriptor,
  filterOf,
  filterReadout,
  FILTERS,
  GRAIN_CEILING,
  scaleFilters,
  svgFilter,
  switchValue,
  withControl,
  withFilter,
  withoutFilter,
  withSwitch,
} from "../src/app/filters.ts";
import type { Drawing, Filter } from "../src/app/types.ts";

// What a filter *is*, kept honest without a canvas.
//
// The pixels are `filterPaint.ts`'s and need a real 2D context to say anything
// about; everything that decides what lands in the document — one of each kind,
// a fixed order, what a control writes, what survives a page being scaled — is
// arithmetic over plain objects and belongs here. It is worth pinning because a
// filter is *persisted*: a field written under the wrong name is a setting that
// silently stops applying, on every drawing that carries it.

const blur: Filter = { kind: "blur", radius: 6 };
const noise: Filter = { kind: "noise", amount: 0.35, grain: 2 };

const drawing = (filters?: Filter[]): Drawing => ({
  id: "d1",
  name: "sketch",
  width: 800,
  height: 600,
  strokes: [],
  ...(filters ? { filters } : {}),
});

describe("the catalog", () => {
  it("gives every filter a preset its own controls can hold", () => {
    for (const descriptor of FILTERS) {
      expect(descriptor.preset.kind).toBe(descriptor.kind);
      for (const control of descriptor.controls) {
        const value = controlValue(descriptor.preset, control.id);
        expect(value).toBeGreaterThanOrEqual(control.min);
        expect(value).toBeLessThanOrEqual(control.max);
      }
      // The row's readout has to name a control that exists, or the panel shows
      // a filter with nothing to say for itself.
      expect(descriptor.controls.some((c) => c.id === descriptor.readout)).toBe(
        true,
      );
    }
  });

  it("ships blur and noise, blur first", () => {
    expect(FILTERS.map((f) => f.kind)).toEqual(["blur", "noise"]);
    expect(filterDescriptor("noise")?.nameKey).toBe("filters.noise.name");
    expect(filterDescriptor("sepia")).toBeUndefined();
  });
});

describe("keeping a drawing's filters", () => {
  it("holds one of each kind — a second blur is the first one moved", () => {
    const once = withFilter(undefined, blur);
    const again = withFilter(once, { kind: "blur", radius: 20 });
    expect(again).toEqual([{ kind: "blur", radius: 20 }]);
  });

  it("keeps the declared order however they were switched on", () => {
    const filters = withFilter(withFilter(undefined, noise), blur);
    expect(filters.map((f) => f.kind)).toEqual(["blur", "noise"]);
  });

  it("carries no field at all once the last one is off", () => {
    const filters = withFilter(withFilter(undefined, noise), blur);
    expect(withoutFilter(filters, "blur")).toEqual([noise]);
    expect(withoutFilter([blur], "blur")).toBeUndefined();
    // Switching off something that was never on changes nothing.
    expect(withoutFilter(undefined, "noise")).toBeUndefined();
  });

  it("reads back in paint order and ignores a kind it doesn't know", () => {
    const page = drawing([noise, { kind: "sepia" } as unknown as Filter, blur]);
    expect(activeFilters(page).map((f) => f.kind)).toEqual(["blur", "noise"]);
    expect(activeFilters(drawing())).toEqual([]);
    expect(filterOf(page, "blur")).toEqual(blur);
    expect(filterOf(drawing(), "blur")).toBeUndefined();
  });
});

describe("the controls", () => {
  it("reads and writes an option by the field it names", () => {
    expect(controlValue(blur, "radius")).toBe(6);
    expect(controlValue(blur, "amount")).toBe(0);
    expect(withControl(blur, "radius", 12)).toEqual({
      kind: "blur",
      radius: 12,
    });
  });

  it("drops a switch turned off rather than writing it false", () => {
    const on = withSwitch(noise, "color", true);
    expect(switchValue(on, "color")).toBe(true);
    expect(withSwitch(on, "color", false)).toEqual(noise);
    expect(switchValue(noise, "color")).toBe(false);
  });

  it("reads a strength as a percentage and a distance as pixels", () => {
    const [radius] = filterDescriptor("blur")!.controls;
    const [amount] = filterDescriptor("noise")!.controls;
    expect(controlReadout(radius!, 6)).toBe(6);
    expect(controlReadout(amount!, 0.35)).toBe(35);
    expect(filterReadout(blur)).toBe("6 px");
    expect(filterReadout(noise)).toBe("35%");
  });
});

describe("scaleFilters", () => {
  it("grows a page distance with the sheet and leaves a strength alone", () => {
    const scaled = scaleFilters([blur, noise], 2)!;
    expect(scaled[0]).toEqual({ kind: "blur", radius: 12 });
    expect(scaled[1]).toEqual({ kind: "noise", amount: 0.35, grain: 4 });
  });

  it("clamps to what the dialog can offer, however wild the scale", () => {
    const huge = scaleFilters([blur, noise], 100)!;
    const radius = filterDescriptor("blur")!.controls[0]!;
    expect(controlValue(huge[0]!, "radius")).toBe(radius.max);
    const tiny = scaleFilters([blur], 0.01)!;
    expect(controlValue(tiny[0]!, "radius")).toBe(radius.min);
  });

  it("answers with nothing for a page that carries none", () => {
    expect(scaleFilters(undefined, 2)).toBeUndefined();
    expect(scaleFilters([], 2)).toBeUndefined();
  });
});

describe("svgFilter", () => {
  it("leaves an unfiltered page alone", () => {
    expect(svgFilter([])).toBeNull();
  });

  it("writes the blur as the same Gaussian the canvas paints", () => {
    const filter = svgFilter([{ kind: "blur", radius: 6 }])!;
    expect(filter.markup).toContain('stdDeviation="6"');
    expect(filter.markup).toContain(`id="${filter.id}"`);
  });

  it("chains the grain onto whatever came before it", () => {
    const filter = svgFilter([blur, noise])!;
    // The blur's result is what the grain is composited over, rather than the
    // source: a page carrying both is blurred *then* grained, exactly as the
    // canvas paints it.
    expect(filter.markup).toContain('<feGaussianBlur in="SourceGraphic"');
    expect(filter.markup).toContain('result="f1"');
    expect(filter.markup).toContain('in2="f1"');
    expect(filter.markup).toContain('baseFrequency="0.5"');
    // One speck per `grain` document pixels, whatever the grain is set to.
    expect(svgFilter([{ ...noise, grain: 4 }])!.markup).toContain(
      'baseFrequency="0.25"',
    );
  });

  it("grains in sRGB, in two coats, at the strength the canvas uses", () => {
    const filter = svgFilter([noise])!;
    // A canvas speck is either lighter or darker than what it lands on, so the
    // file needs both coats — one grey veil would only wash the page out.
    expect(filter.markup).toContain('color-interpolation-filters="sRGB"');
    expect(filter.markup.match(/feComposite/g)).toHaveLength(2);
    expect(filter.markup).toContain(
      `slope="${Math.round(0.35 * GRAIN_CEILING * 1000) / 1000}"`,
    );
    // Coloured specks keep the turbulence's own colours and take one coat.
    const colored = svgFilter([withSwitch(noise, "color", true)])!;
    expect(colored.markup.match(/feComposite/g)).toHaveLength(1);
  });
});

// The layer half. A filter on a layer is the same value in a different place,
// so the ordering and the reading-back are shared code — what is worth pinning
// is that they *are* shared, and the one number the renderer needs that a
// page-wide filter never did.

describe("orderedFilters", () => {
  it("puts a layer's filters in the same order a page's go in", () => {
    const jumbled = [noise, blur];
    expect(orderedFilters(jumbled).map((f) => f.kind)).toEqual([
      "blur",
      "noise",
    ]);
    // The declared order, whichever owner they came off — a page and a sheet
    // of it must not soften and grain in opposite orders.
    expect(orderedFilters(jumbled)).toEqual(
      activeFilters(drawing([noise, blur])),
    );
  });

  it("drops a kind this build has never heard of", () => {
    const future = { kind: "kaleidoscope", turns: 3 } as unknown as Filter;
    expect(orderedFilters([blur, future])).toEqual([blur]);
    expect(orderedFilters(undefined)).toEqual([]);
  });
});

describe("filterReach", () => {
  it("is how far a blur can move ink, and nothing for the rest", () => {
    // What a repaint pads its window cull by: a mark this far outside the
    // window still fogs its way in, and culling it would leave the edge of a
    // filtered layer lighter than its middle.
    expect(filterReach([blur])).toBe(blur.radius * BLUR_TAIL);
    // Grain lands on the pixel it is over, so it moves nothing.
    expect(filterReach([noise])).toBe(0);
    expect(filterReach([])).toBe(0);
    // The widest wins rather than the sum — they are applied one after the
    // other, not stacked into one kernel.
    expect(filterReach([blur, noise])).toBe(filterReach([blur]));
  });
});

describe("layerFilterOf", () => {
  const layered: Drawing = {
    id: "d1",
    name: "sketch",
    width: 800,
    height: 600,
    strokes: [],
    layers: [
      { id: "base", name: "" },
      { id: "photo", name: "Photo", filters: [blur] },
    ],
  };

  it("finds a layer's filter, and answers nothing for anything else", () => {
    expect(layerFilterOf(layered, "photo", "blur")).toEqual(blur);
    expect(layerFilterOf(layered, "photo", "noise")).toBeUndefined();
    expect(layerFilterOf(layered, "base", "blur")).toBeUndefined();
    // A row deleted out from under an open dialog is not a crash.
    expect(layerFilterOf(layered, "gone", "blur")).toBeUndefined();
  });
});

describe("svgFilter ids", () => {
  it("takes an id, so one file can carry a filter per layer", () => {
    expect(svgFilter([blur])?.id).toBe("page-filter");
    const layer = svgFilter([blur], "layer-filter-2");
    expect(layer?.id).toBe("layer-filter-2");
    expect(layer?.markup).toContain('id="layer-filter-2"');
  });
});
