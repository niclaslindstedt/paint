// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sheet a drawing is on, and what it does to the marks.
//
// Three things are worth pinning here, and only one of them is arithmetic:
//
//   - **the solid sheet changes nothing.** Every drawing in every install is on
//     it, so a ground mechanism that shifted a single pixel of one of them
//     would be a silent edit to everybody's work. The catalog's numbers, the
//     wash painter's factors and the renderer's compositing all have to come
//     out exactly where they were.
//   - **wetness times absorbency is what decides**, not either alone: a dry
//     tool on blotting paper and a loaded brush on glass both do nothing.
//   - **the compositing**, which is the whole of how a wet mark mixes with what
//     it lands on and leaves no trace in a stroke, a colour or a call count —
//     the same reason `erase_test.ts` is about nothing else.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GROUNDS,
  groundById,
  groundProfile,
  groundStains,
  groundsInFamily,
  inkBlend,
  SOLID_GROUND,
  stains,
  wetting,
} from "../src/app/ground.ts";
import { graininess } from "../src/app/groundPaint.ts";
import { en } from "../src/app/i18n/en.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { pluginById, resetPlugins } from "../src/app/plugins/registry.ts";
import { paintWash } from "../src/app/plugins/aquarelle.ts";
import { anyStains, paintStroke, strokeWetness } from "../src/app/render.ts";
import type { Ground, Stroke } from "../src/app/types.ts";
import { createFakeContext, type FakeContext } from "./support/fakeCanvas.ts";

const LIGHT = { pageColor: "#ffffff", defaultInk: "#111827" };
const DARK = { pageColor: "#161a20", defaultInk: "#ffffff" };

/** A stock by id, failing loudly rather than silently testing the solid sheet. */
function stock(id: string) {
  const found = groundById(id);
  if (!found) throw new Error(`no ground ${id}`);
  return found;
}

const COLD = stock("cold").profile;
const ROUGH = stock("rough").profile;

beforeEach(() => {
  resetPlugins();
  registerBuiltinPlugins();
});

afterEach(() => resetPlugins());

function mark(tool: string, over: Partial<Stroke> = {}): Stroke {
  return {
    id: "s",
    tool,
    size: 40,
    color: "#3366cc",
    shape: {
      kind: "path",
      points: [
        { x: 20, y: 20 },
        { x: 180, y: 60 },
      ],
    },
    ...over,
  };
}

/** How each painting call was composited, in order. */
function composites(ctx: FakeContext): string[] {
  return ctx.painted.map((p) => p.composite);
}

describe("the catalog", () => {
  it("has unique ids and one solid sheet at its head", () => {
    const ids = GROUNDS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(GROUNDS[0]?.id).toBe("solid");
    expect(groundsInFamily("solid")).toHaveLength(1);
  });

  // The shelf is picked from once, in the dialog that makes the drawing, so it
  // has to be comparable at a glance rather than read through. Past this many
  // it stops being a choice and starts being a catalogue — the same call the
  // page-size shelf makes about four named sizes.
  it("stays short enough to compare in one row", () => {
    expect(GROUNDS.length).toBeLessThanOrEqual(6);
  });

  it("names every stock in the catalog, in both halves of the row", () => {
    for (const ground of GROUNDS) {
      for (const key of [ground.nameKey, ground.hintKey]) {
        const text = key
          .split(".")
          .reduce<unknown>(
            (at, part) => (at as Record<string, unknown>)?.[part],
            en,
          );
        expect(typeof text, key).toBe("string");
      }
    }
  });

  it("keeps every stock inside the ranges the painters assume", () => {
    for (const { id, profile } of GROUNDS) {
      expect(profile.absorbency, id).toBeGreaterThanOrEqual(0);
      expect(profile.absorbency, id).toBeLessThanOrEqual(1);
      expect(profile.bite, id).toBeGreaterThanOrEqual(0);
      expect(profile.bite, id).toBeLessThanOrEqual(1);
      expect(profile.tooth, id).toBeGreaterThanOrEqual(0);
      // A stock with a pattern has a grain, and one without has none — a
      // "tooth" nothing draws would be a number that lies.
      expect(profile.tooth > 0, id).toBe(profile.pattern !== "none");
    }
  });

  it("makes primed cloth less thirsty than any paper", () => {
    const thirstiest = (family: "paper" | "canvas") =>
      Math.max(...groundsInFamily(family).map((g) => g.profile.absorbency));
    expect(thirstiest("canvas")).toBeLessThan(thirstiest("paper"));
  });
});

describe("resolving a drawing's ground", () => {
  it("reads an absent one, and an unknown stock, as the solid sheet", () => {
    expect(groundProfile(undefined)).toEqual(SOLID_GROUND);
    expect(groundProfile({ stock: "papyrus" })).toEqual(SOLID_GROUND);
  });

  // A stock id is persisted on the drawing, so shortening the shelf must never
  // drop a finished painting onto the plain sheet — every sort this build
  // stopped offering reads as the survivor nearest it in how much it drinks.
  it("keeps a page made on a retired stock on a sheet, not on glass", () => {
    for (const [retired, replacement] of [
      ["laid", "cartridge"],
      ["kraft", "cold"],
      ["newsprint", "rough"],
      ["linen", "cotton"],
    ] as const) {
      expect(groundById(retired)?.id, retired).toBe(replacement);
      expect(groundProfile({ stock: retired }), retired).toEqual(
        stock(replacement).profile,
      );
      expect(groundStains(groundProfile({ stock: retired })), retired).toBe(
        true,
      );
    }
    // …and the shelf itself offers none of them, so nothing writes one back.
    expect(GROUNDS.map((g) => g.id)).not.toContain("newsprint");
  });

  it("scales how far the grain shows, and nothing else", () => {
    const half = groundProfile({ stock: "cold", texture: 0.5 });
    expect(half.bite).toBeCloseTo(COLD.bite / 2);
    // Turning the grain down does not make thirsty paper behave like glass.
    expect(half.absorbency).toBe(COLD.absorbency);
    expect(half.tooth).toBe(COLD.tooth);
    expect(groundProfile({ stock: "cold", texture: 0 }).bite).toBe(0);
    expect(groundProfile({ stock: "cold" })).toEqual(COLD);
  });
});

describe("wetness times absorbency", () => {
  it("is nothing when either end is", () => {
    expect(wetting(0, ROUGH)).toBe(0);
    expect(wetting(1, SOLID_GROUND)).toBe(0);
    expect(stains(1, SOLID_GROUND)).toBe(false);
    expect(groundStains(SOLID_GROUND)).toBe(false);
    expect(groundStains(COLD)).toBe(true);
  });

  it("leaves a pen dry on sized paper and lets it feather on rough", () => {
    const pen = pluginById("pencil")?.wetness ?? 0;
    expect(stains(pen, stock("cartridge").profile)).toBe(false);
    expect(stains(pen, stock("cold").profile)).toBe(false);
    expect(stains(pen, ROUGH)).toBe(true);
  });

  it("has watercolour soak into every paper there is", () => {
    const wash = pluginById("watercolor")?.wetness ?? 0;
    expect(wash).toBe(1);
    for (const ground of GROUNDS) {
      if (ground.family === "solid") continue;
      expect(stains(wash, ground.profile), ground.id).toBe(true);
    }
  });

  it("keeps the dry media dry", () => {
    for (const id of ["graphite", "crayon", "eraser"]) {
      expect(pluginById(id)?.wetness ?? 0, id).toBe(0);
    }
  });
});

describe("how a mark lands", () => {
  it("lies on the surface of a solid sheet however wet it is", () => {
    const blend = inkBlend(1, SOLID_GROUND, LIGHT.pageColor);
    expect(blend).toEqual({ mode: "source-over", lift: 0, spread: 1 });
  });

  it("stains a light page down and a dark page up", () => {
    expect(inkBlend(1, COLD, LIGHT.pageColor).mode).toBe("multiply");
    expect(inkBlend(1, COLD, DARK.pageColor).mode).toBe("screen");
  });

  it("lifts and spreads more the thirstier the sheet", () => {
    const cold = inkBlend(1, COLD, LIGHT.pageColor);
    const rough = inkBlend(1, ROUGH, LIGHT.pageColor);
    expect(rough.lift).toBeGreaterThan(cold.lift);
    expect(rough.spread).toBeGreaterThan(cold.spread);
    expect(cold.spread).toBeGreaterThan(1);
  });
});

describe("the renderer's compositing", () => {
  it("covers on the solid sheet and mixes on paper", () => {
    const solid = createFakeContext();
    paintStroke(solid, mark("watercolor"), LIGHT, { scale: 1 });
    expect(composites(solid)).not.toContain("multiply");

    const paper = createFakeContext();
    paintStroke(paper, mark("watercolor"), LIGHT, { scale: 1, ground: COLD });
    expect(composites(paper).every((c) => c === "multiply")).toBe(true);
  });

  it("leaves a dry mark alone on the thirstiest paper there is", () => {
    const ctx = createFakeContext();
    paintStroke(ctx, mark("graphite"), LIGHT, {
      scale: 1,
      ground: ROUGH,
    });
    expect(composites(ctx).every((c) => c === "source-over")).toBe(true);
  });

  it("goes on rubbing out rather than mixing, however wet the paper", () => {
    const ctx = createFakeContext();
    paintStroke(ctx, mark("eraser", { color: undefined }), LIGHT, {
      scale: 1,
      ground: ROUGH,
    });
    expect(composites(ctx).every((c) => c === "destination-out")).toBe(true);
  });

  it("asks nothing of a page nobody has put on a sheet", () => {
    expect(anyStains([mark("watercolor")], SOLID_GROUND)).toBe(false);
    expect(anyStains([mark("watercolor")], COLD)).toBe(true);
    expect(anyStains([mark("graphite")], ROUGH)).toBe(false);
    expect(strokeWetness(mark("nothing-ships-this"))).toBe(0);
  });
});

describe("the wash on a sheet", () => {
  const PATH = [
    { x: 40, y: 120 },
    { x: 200, y: 160 },
    { x: 380, y: 130 },
  ];

  /** A broad wash, painted on one ground, as the calls it made. Broad because
   *  granulation needs a mark wider than the sheet's own pools to show in — a
   *  rigger line on rough paper cannot mottle, here or in life. */
  function washOn(ground = SOLID_GROUND) {
    const ctx = createFakeContext();
    paintWash(ctx, PATH, 220, 1, 1, 1, 0.6, ground);
    return ctx;
  }

  it("paints exactly what it always did on the solid sheet", () => {
    // The default argument and the solid sheet are the same page, and both are
    // the wash this painter laid before grounds existed.
    const asked = washOn(SOLID_GROUND);
    const untold = createFakeContext();
    paintWash(untold, PATH, 220, 1, 1, 1, 0.6);
    expect(asked.calls).toEqual(untold.calls);
    expect(asked.strokes).toEqual(untold.strokes);
  });

  it("pools at the sheet's own pitch rather than at one fixed one", () => {
    // Granulation is drawn as one dab per pool that held enough pigment, so
    // the count is the lattice: a fine sheet has many small pools and a rough
    // one has fewer, bigger ones. The solid page keeps the painter's own pitch,
    // which is what makes it the baseline both are measured against.
    const solid = washOn(SOLID_GROUND).calls.arc ?? 0;
    const smooth = washOn(stock("hot").profile).calls.arc ?? 0;
    const rough = washOn(ROUGH).calls.arc ?? 0;
    expect(solid).toBeGreaterThan(0);
    expect(smooth).toBeGreaterThan(solid);
    expect(rough).toBeLessThan(solid);
    expect(rough).toBeGreaterThan(0);
  });

  it("runs further past the hair the thirstier the sheet", () => {
    // The wash is one closed path traced out along one edge and back along the
    // other, so how far the water got is how far the path went: more curve
    // segments on a sheet the water ran further into.
    const dry = washOn(SOLID_GROUND).calls.quadraticCurveTo ?? 0;
    const wet = washOn(ROUGH).calls.quadraticCurveTo ?? 0;
    expect(wet).toBeGreaterThanOrEqual(dry);
  });
});

describe("the grain at a distance", () => {
  it("fades out rather than blinking off as the page is pulled away", () => {
    expect(graininess(0.2)).toBe(0);
    expect(graininess(4)).toBe(1);
    const near = graininess(1.4);
    const far = graininess(0.9);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

describe("what a document carries", () => {
  it("is two fields, both optional", () => {
    const ground: Ground = { stock: "rough", texture: 0.5 };
    expect(JSON.parse(JSON.stringify(ground))).toEqual(ground);
    expect(groundProfile(JSON.parse(JSON.stringify(ground)))).toEqual(
      groundProfile(ground),
    );
  });
});
