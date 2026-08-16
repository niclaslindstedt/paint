// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page's scale, and the slider that walks a tool's own rack.
//
// Two claims are worth pinning down here, and both are arithmetic rather than
// pixels. The first is that a document pixel is a **real distance**: one dot of
// an iPhone's screen, which is what makes 0.5 mm of pencil lead a distance you
// can hold a ruler against rather than a number somebody liked. The second is the shape of the
// size slider — three geometric bands, most of the travel spent among widths
// that exist, and an exact inverse so opening the panel lands the thumb on the
// nib already in your hand.

import { describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  FINE_BAND,
  MAX_SIZE,
  MIN_SIZE,
  REAL_BAND,
  formatSize,
  gaugeCeiling,
  gaugeFloor,
  gaugeSizes,
  isRealSize,
  positionOf,
  sizeAt,
  stepNote,
  type SizeGauge,
} from "../src/app/plugins/gauge.ts";
import { sizePresets } from "../src/app/canvasSize.ts";
import { allPlugins, pluginById } from "../src/app/plugins/registry.ts";
import {
  DPI,
  PX_PER_MM,
  formatMm,
  formatPt,
  mm,
  pt,
  toMm,
  toPt,
} from "../src/app/units.ts";
import { gaugeFor } from "../src/app/useAppSettings.ts";

registerBuiltinPlugins();

/** A rack with round numbers in it, so the arithmetic is readable: 1 mm to
 *  10 mm of real implement, a floor a sixth of that and a ceiling at 24×. */
const RACK: SizeGauge = {
  min: mm(1),
  max: mm(10),
  steps: [
    { px: mm(1) },
    { px: mm(2), note: "#2" },
    { px: mm(4) },
    { px: mm(7) },
    { px: mm(10) },
  ],
};

describe("the page's scale", () => {
  it("makes a document pixel one dot of an iPhone's screen", () => {
    // The calibration is the *screen*, not a printer: this is a page you draw
    // on with a finger, so the sheet it is laid against is the glass. 460 ppi
    // is the whole current iPhone line.
    expect(DPI).toBe(460);
    expect(PX_PER_MM).toBeCloseTo(18.11, 2);
    // …and the default sheet, which is a postcard held landscape.
    expect(Math.round(toMm(3200))).toBe(177);
  });

  it("keeps the A4 preset at a printer's resolution, not the page's", () => {
    // The two are different questions, and the preset answers the second: how
    // many pixels a sheet of A4 needs to *print* sharply. Photo labs and
    // consumer inkjets want 300 ppi of image data — the 1440 and 5760 dpi on
    // the box are ink droplets — so A4 is 2480 × 3508 however the page itself
    // is scaled (see `canvasSize.ts`).
    // Asked for upright, because that is how a sheet of paper is quoted — the
    // shelf stands every size whichever way the screen is, and turning A4 on
    // its side is still 2480 × 3508 of paper (see `canvasSize.ts`).
    const a4 = sizePresets({ width: 1000, height: 1000 }, "portrait").find(
      (p) => p.id === "print",
    )!;
    expect(a4.size).toEqual({ width: 2480, height: 3508 });
    expect(Math.round(2480 / (210 / 25.4))).toBe(300);
  });

  it("sets type in points and everything else in millimetres", () => {
    // 72 points to the inch, so a 12 pt caption is 76.7 document pixels.
    expect(pt(12)).toBeCloseTo(460 / 6, 6);
    expect(toPt(pt(12))).toBeCloseTo(12, 6);
  });

  it("prints a width to about three figures and no further", () => {
    expect(formatMm(mm(0.18))).toBe("0.18");
    expect(formatMm(mm(1.5))).toBe("1.5");
    expect(formatMm(mm(12.7))).toBe("13");
    // A round number reads as one — 5.0 mm is 5 mm.
    expect(formatMm(mm(5))).toBe("5");
    expect(formatPt(pt(12))).toBe("12");
    expect(formatPt(pt(7.5))).toBe("7.5");
  });
});

describe("the size slider", () => {
  it("gives the real rack the middle four tenths of the travel", () => {
    // The whole design: a professional lives between the narrowest implement
    // and the widest, so that is where the thumb has room.
    expect(sizeAt(RACK, FINE_BAND)).toBeCloseTo(RACK.min, 6);
    expect(sizeAt(RACK, REAL_BAND)).toBeCloseTo(RACK.max, 6);
    expect(REAL_BAND - FINE_BAND).toBeGreaterThan(FINE_BAND);
  });

  it("runs finer than they are made below that, and to the absurd above", () => {
    expect(sizeAt(RACK, 0)).toBeCloseTo(gaugeFloor(RACK), 6);
    expect(sizeAt(RACK, 1)).toBeCloseTo(gaugeCeiling(RACK), 6);
    // The top of a 10 mm rack wants to be twenty-four times wider than
    // anything anybody sells — and runs into the page-wide ceiling first,
    // which is where every generous rack ends up. Nobody needs a nib that
    // wide, and a slider that refuses to draw one is a slider arguing with
    // you.
    expect(toMm(sizeAt(RACK, 1))).toBeCloseTo(210, 6);
    // A narrow rack reaches its own twenty-four times over instead.
    const fine: SizeGauge = { ...RACK, min: mm(0.1), max: mm(1) };
    expect(toMm(sizeAt(fine, 1))).toBeCloseTo(24, 6);
  });

  it("climbs faster past the rack than inside it", () => {
    // Same span of thumb, either side of the seam: the half above has to open
    // out, or the top of the slider is not a different kind of place.
    const inside = sizeAt(RACK, 0.4) / sizeAt(RACK, 0.3);
    const beyond = sizeAt(RACK, 0.7) / sizeAt(RACK, 0.6);
    expect(beyond).toBeGreaterThan(inside);
  });

  it("climbs by ratio rather than by difference", () => {
    // Width is a ratio quantity: the step from 1 to 2 mm is the same *kind* of
    // step as the one from 5 to 10, and a linear slider makes the first
    // invisible and the second enormous.
    const a = sizeAt(RACK, 0.2) / sizeAt(RACK, 0.15);
    const b = sizeAt(RACK, 0.45) / sizeAt(RACK, 0.4);
    expect(a).toBeCloseTo(b, 6);
  });

  it("is monotonic all the way up", () => {
    let last = -1;
    for (let i = 0; i <= 200; i++) {
      const size = sizeAt(RACK, i / 200);
      expect(size).toBeGreaterThan(last);
      last = size;
    }
  });

  it("opens on the nib already in your hand", () => {
    // `positionOf` is the exact inverse, which is what lets the panel put the
    // thumb where the tool is instead of at some rounded-off approximation.
    for (const at of [0, 0.05, 0.1, 0.3, 0.5, 0.72, 1]) {
      expect(positionOf(RACK, sizeAt(RACK, at))).toBeCloseTo(at, 6);
    }
  });

  it("clamps rather than running off either end", () => {
    expect(positionOf(RACK, 0)).toBe(0);
    expect(positionOf(RACK, 1e9)).toBe(1);
    expect(positionOf(RACK, Number.NaN)).toBe(0);
  });

  it("stops at a nib as wide as the page, however greedy the gauge", () => {
    const huge: SizeGauge = { ...RACK, ceiling: mm(10_000) };
    expect(gaugeCeiling(huge)).toBe(MAX_SIZE);
    expect(gaugeFloor({ ...RACK, floor: 0 })).toBe(MIN_SIZE);
  });

  it("says whether a width is one anybody makes", () => {
    expect(isRealSize(RACK, mm(4))).toBe(true);
    expect(isRealSize(RACK, mm(0.3))).toBe(false);
    expect(isRealSize(RACK, mm(40))).toBe(false);
  });

  it("knows the trade's name for a width where there is one", () => {
    expect(stepNote(RACK, mm(2))).toBe("#2");
    // Still, after a round trip through a settings blob that rounded it.
    expect(stepNote(RACK, Math.round(mm(2)))).toBe("#2");
    // …and nothing for a width that is merely near a named one.
    expect(stepNote(RACK, mm(3))).toBeUndefined();
    expect(stepNote(RACK, mm(4))).toBeUndefined();
  });

  it("prints a type gauge in points and everything else in millimetres", () => {
    expect(formatSize(RACK, mm(4))).toBe("4");
    expect(formatSize({ ...RACK, unit: "pt" }, pt(18))).toBe("18");
  });
});

describe("the shipped racks", () => {
  it("puts every tool's five buttons inside the range it is made in", () => {
    for (const plugin of allPlugins()) {
      const gauge = plugin.gauge;
      if (!gauge) continue;
      for (const step of gauge.steps) {
        expect(isRealSize(gauge, step.px)).toBe(true);
      }
    }
  });

  it("keeps every rack in order, and inside the app's own bounds", () => {
    for (const plugin of allPlugins()) {
      const gauge = plugin.gauge;
      if (!gauge) continue;
      expect(gauge.max).toBeGreaterThan(gauge.min);
      expect(gaugeFloor(gauge)).toBeGreaterThanOrEqual(MIN_SIZE);
      expect(gaugeCeiling(gauge)).toBeLessThanOrEqual(MAX_SIZE);
      const sizes = gaugeSizes(gauge);
      expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    }
  });

  it("opens every tool on one of its own five buttons", () => {
    // A default off the five is a fresh install whose size row has nothing
    // lit up in it — the panel opens saying "none of these", which is both
    // untrue and the first thing a new user sees. It is also the check that
    // catches a default chosen as a round number rather than as an implement:
    // the airbrush opened at 8 mm for a while, which is a pattern no gun on
    // its own rack throws.
    for (const plugin of allPlugins()) {
      if (plugin.defaultSize === undefined || !plugin.gauge) continue;
      const steps = gaugeSizes(plugin.gauge);
      expect(
        steps.some((step) => Math.abs(step - plugin.defaultSize!) < 0.05),
      ).toBe(true);
    }
  });

  it("opens each tool at the size it is reached for most of the time", () => {
    // Not the middle of the rack — the one a professional actually spends the
    // day on. A spot check of the four that are least obvious.
    const opensAt = (id: string) => toMm(pluginById(id)!.defaultSize!);
    // The liner that outsells all the others put together.
    expect(opensAt("pencil")).toBeCloseTo(0.5, 6);
    // 0.5 is the lead a shop sells most of, but this is a tool for sketching,
    // and a sketching hand wants the blunter point.
    expect(opensAt("graphite")).toBeCloseTo(0.7, 6);
    // The bullet on the marker in everybody's drawer.
    expect(opensAt("marker")).toBeCloseTo(2, 6);
    // A general-purpose gun at the distance an arm holds it — between the
    // detail work below it and the backgrounds above.
    expect(opensAt("airspray")).toBeCloseTo(12, 6);
  });

  it("measures each tool the way its trade measures it", () => {
    // A spot check that the racks are real implements rather than numbers
    // somebody liked: the ISO pen ladder, the four leads a mechanical pencil
    // takes, and the standard round-brush series.
    const pen = gaugeSizes(gaugeFor(pluginById("pencil"))).map(toMm);
    expect(pen.map((v) => Math.round(v * 100) / 100)).toEqual([
      0.18, 0.25, 0.35, 0.5, 0.7,
    ]);
    const lead = gaugeSizes(gaugeFor(pluginById("graphite"))).map(toMm);
    expect(lead.map((v) => Math.round(v * 10) / 10)).toEqual([
      0.3, 0.5, 0.7, 0.9, 2,
    ]);
    const brush = gaugeFor(pluginById("paintbrush"));
    expect(stepNote(brush, mm(4.8))).toBe("#6");
    // …and the watercolour rack is a watercolourist's, not a decorator's.
    expect(stepNote(gaugeFor(pluginById("watercolor")), mm(6.3))).toBe("#8");
  });
});
