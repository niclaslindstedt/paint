// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Two watercolour engines behind one seam.
//
// The field simulation itself is checked in `washField_test.ts`. What matters
// here is the promise around it: the choice is a value with a default, it is
// never recorded on a mark, and — the load-bearing one — **a browser that
// cannot run the simulation still paints the wash.** These tests run in node
// with no DOM at all, which is exactly the case the fallback exists for, so a
// wash asked for with the simulation in force has to come out as a wash.

import { describe, expect, it } from "vitest";

import { groundProfile } from "../src/app/ground.ts";
import { paintWash } from "../src/app/plugins/aquarelle.ts";
import {
  keeping,
  paintSimulatedWash,
  washFilm,
} from "../src/app/plugins/washSim.ts";
import {
  DEFAULT_WASH_DETAIL,
  DEFAULT_WASH_ENGINE,
  MIN_WASH_DETAIL,
  isWashEngine,
  paintWashWith,
  setWashDetail,
  setWashEngine,
  washDetail,
  washEngine,
  WASH_ENGINES,
} from "../src/app/plugins/wash.ts";
import { defaultSettings, parseSettings } from "../src/app/useAppSettings.ts";
import type { Point } from "../src/app/types.ts";
import { mm } from "../src/app/units.ts";
import { createFakeContext } from "./support/fakeCanvas.ts";

/** A sampled sweep, the shape a hand actually draws. */
function sweep(): Point[] {
  const points: Point[] = [];
  for (let t = 0; t <= 400; t += 4) {
    points.push({ x: 60 + t, y: 300 + Math.sin(t / 90) * 20 });
  }
  return points;
}

const SIZE = mm(6.3);

/** Everything one wash put on the page, however it was painted. */
function paintedWith(engine: "simple" | "simulation") {
  const ctx = createFakeContext();
  ctx.globalAlpha = 1;
  paintWashWith(
    engine,
    ctx as unknown as CanvasRenderingContext2D,
    sweep(),
    SIZE,
    1,
    1,
    1,
    0.6,
    groundProfile({ stock: "cold" }),
    "#2563eb",
  );
  return ctx;
}

describe("the watercolour engine setting", () => {
  it("offers both engines and opens on the simple one", () => {
    expect(WASH_ENGINES.map((engine) => engine.id)).toEqual([
      "simple",
      "simulation",
    ]);
    expect(DEFAULT_WASH_ENGINE).toBe("simple");
    expect(defaultSettings().washEngine).toBe("simple");
  });

  it("recognises an engine and refuses anything else", () => {
    expect(isWashEngine("simulation")).toBe(true);
    expect(isWashEngine("watercolor")).toBe(false);
    expect(isWashEngine(undefined)).toBe(false);
  });

  it("falls back to the default for a blob naming an engine we don't ship", () => {
    // Unlike a tool id, which is kept in case a downgrade wants it: there is
    // nothing to paint a wash with but the engines that are here.
    expect(
      parseSettings(JSON.stringify({ washEngine: "quantum" })).washEngine,
    ).toBe("simple");
    expect(parseSettings(JSON.stringify({})).washEngine).toBe("simple");
    expect(
      parseSettings(JSON.stringify({ washEngine: "simulation" })).washEngine,
    ).toBe("simulation");
  });

  it("opens at the whole of the simulation's field", () => {
    // Anything less would be a build quietly painting a coarser wash than its
    // own sample shows. Turning it down is the user's trade to make.
    expect(DEFAULT_WASH_DETAIL).toBe(1);
    expect(defaultSettings().washDetail).toBe(1);
  });

  it("pulls a stored detail back onto the slider's own track", () => {
    expect(parseSettings(JSON.stringify({ washDetail: 0.5 })).washDetail).toBe(
      0.5,
    );
    // A tenth is the floor: below it a "field" is a handful of cells the size
    // of the brush. Above one there is nothing more to resolve.
    expect(parseSettings(JSON.stringify({ washDetail: 0 })).washDetail).toBe(
      MIN_WASH_DETAIL,
    );
    expect(parseSettings(JSON.stringify({ washDetail: 4 })).washDetail).toBe(1);
    expect(
      parseSettings(JSON.stringify({ washDetail: "half" })).washDetail,
    ).toBe(1);
  });

  it("holds one detail in force beside the engine", () => {
    try {
      setWashDetail(0.4);
      expect(washDetail()).toBe(0.4);
      // Clamped on the way in as well, so nothing downstream has to re-check.
      setWashDetail(0);
      expect(washDetail()).toBe(MIN_WASH_DETAIL);
    } finally {
      setWashDetail(DEFAULT_WASH_DETAIL);
    }
    expect(washDetail()).toBe(1);
  });

  it("holds one engine in force for the whole app", () => {
    // It is app-wide rather than threaded, so that the screen, the cache, the
    // thumbnails, the dropper's snapshot and the export cannot disagree.
    try {
      setWashEngine("simulation");
      expect(washEngine()).toBe("simulation");
    } finally {
      setWashEngine(DEFAULT_WASH_ENGINE);
    }
    expect(washEngine()).toBe("simple");
  });
});

describe("falling back", () => {
  it("says no when there is no canvas to simulate on", () => {
    // No DOM here, so no surface — which is the whole point: the engine has to
    // be able to answer "not me" rather than throw.
    const ctx = createFakeContext();
    expect(
      paintSimulatedWash(
        ctx as unknown as CanvasRenderingContext2D,
        sweep(),
        SIZE,
        1,
        1,
        1,
        0.6,
        groundProfile({ stock: "cold" }),
        "#2563eb",
      ),
    ).toBe(false);
  });

  it("paints the wash anyway", () => {
    // The claim that matters. Ask for the simulation where it cannot run and a
    // wash still lands — the same one the simple engine has always painted.
    const simulated = paintedWith("simulation");
    const simple = paintedWith("simple");
    const fills = (ctx: typeof simulated) =>
      ctx.painted.filter((call) => call.call === "fill").length;
    expect(fills(simulated)).toBeGreaterThan(0);
    expect(fills(simulated)).toBe(fills(simple));
    expect(simulated.strokes).toEqual(simple.strokes);
  });

  it("says no to a mark too small to be worth a field", () => {
    // Pulled back far enough that the whole wash is inside a pixel there is
    // nothing for a field to resolve, and the simple engine draws a better
    // mark than a two-cell puddle would be.
    const ctx = createFakeContext();
    expect(
      paintSimulatedWash(
        ctx as unknown as CanvasRenderingContext2D,
        sweep(),
        SIZE,
        0.001,
      ),
    ).toBe(false);
  });

  it("says no to a mark with nothing in it", () => {
    const ctx = createFakeContext();
    const target = ctx as unknown as CanvasRenderingContext2D;
    expect(paintSimulatedWash(target, [], SIZE)).toBe(false);
    expect(paintSimulatedWash(target, sweep(), 0)).toBe(false);
  });
});

describe("pigment on a sheet of some colour", () => {
  /** What one cell of settled pigment leaves of a page of this colour, per
   *  channel — the compositing the browser is about to do, done here. */
  function composited(
    ink: string,
    page: number,
    density: number,
    dark: boolean,
  ): number[] {
    const film = washFilm(keeping(ink, dark), density, dark);
    if (!film) return [page, page, page];
    const [r, g, b, a] = film;
    // `multiply` on a light sheet, `screen` on a dark one — what `inkBlend`
    // picks for a wet mark, and what this arithmetic is written to be exact
    // under (see `ground.ts`).
    return [r, g, b].map((c) =>
      dark ? page + a * c * (1 - page) : page * (1 - a + a * c),
    );
  }

  it("paints a light wash on a dark page", () => {
    // The regression. Beer–Lambert with the ink as its own absorption says a
    // white pigment stops nothing — true on white paper, and nonsense on a
    // black page, where the mark is the *only* thing lighting the sheet. Left
    // unmirrored this came out at half a percent of alpha: the engine ran, the
    // wash dried, and nothing whatever appeared on the canvas.
    const film = washFilm(keeping("#ffffff", true), 0.6, true);
    expect(film).not.toBeNull();
    expect(film![3]).toBeGreaterThan(0.5);
    // …and it is white, rather than the near-black the unmirrored maths made
    // of it.
    expect(film![0]).toBeGreaterThan(0.99);
  });

  it("reads a dark page as the mirror of a light one", () => {
    // The same physics run the other way, so the same wash of the page's
    // opposite has to come out at the same strength on either sheet.
    for (const density of [0.2, 0.8, 2]) {
      const onWhite = washFilm(keeping("#000000", false), density, false);
      const onBlack = washFilm(keeping("#ffffff", true), density, true);
      expect(onBlack![3]).toBeCloseTo(onWhite![3], 6);
    }
  });

  it("composites to the transmittance it worked out", () => {
    // The claim the whole conversion rests on: the colour-and-alpha pair is
    // the one that lands on the page as `keep ^ density`, so a second wash
    // over a first deepens towards the colour rather than towards grey.
    for (const [ink, dark, page] of [
      ["#2563eb", false, 1],
      ["#e8b923", false, 1],
      ["#2563eb", true, 0],
      ["#ffffff", true, 0],
    ] as const) {
      const keep = keeping(ink, dark);
      const out = composited(ink, page, 1.3, dark);
      for (let c = 0; c < 3; c++) {
        const left = Math.pow(keep[c]!, 1.3);
        expect(out[c]!).toBeCloseTo(dark ? 1 - left : left, 6);
      }
    }
  });

  it("glazes: two passes deepen towards the ink", () => {
    // One wash and then another over it is how the medium is actually worked,
    // and on either sheet the pair has to land where one wash of twice the
    // pigment would.
    for (const [ink, dark, page] of [
      ["#2563eb", false, 1],
      ["#2563eb", true, 0],
    ] as const) {
      const once = composited(ink, page, 0.9, dark);
      const film = washFilm(keeping(ink, dark), 0.9, dark)!;
      const twice = once.map((channel, c) =>
        dark
          ? channel + film[3] * film[c]! * (1 - channel)
          : channel * (1 - film[3] + film[3] * film[c]!),
      );
      const deep = composited(ink, page, 1.8, dark);
      for (let c = 0; c < 3; c++) expect(twice[c]!).toBeCloseTo(deep[c]!, 6);
    }
  });

  it("has nothing to put down where nothing settled", () => {
    expect(washFilm(keeping("#000000", false), 0, false)).toBeNull();
    // …nor where a wash is fainter than a byte of alpha can hold.
    expect(washFilm(keeping("#000000", false), 1e-6, false)).toBeNull();
  });

  it("leaves a pigment the page's own colour alone", () => {
    // White on white and black on black are both "no ink at all" — which is
    // what `multiply` and `screen` respectively do with them, so the film has
    // to agree rather than paint a ghost.
    expect(washFilm(keeping("#ffffff", false), 1, false)![3]).toBeLessThan(
      0.01,
    );
    expect(washFilm(keeping("#000000", true), 1, true)![3]).toBeLessThan(0.01);
  });
});

describe("one set of dials, two engines", () => {
  it("hands both engines the same three numbers", () => {
    // Moving a slider and then switching engine has to be a change of
    // rendering and not of settings, so the simple engine painted directly and
    // painted through the seam must be the same mark.
    const direct = createFakeContext();
    direct.globalAlpha = 1;
    paintWash(
      direct as unknown as CanvasRenderingContext2D,
      sweep(),
      SIZE,
      1,
      1.4,
      0.8,
      1.2,
      groundProfile({ stock: "rough" }),
    );
    const seam = createFakeContext();
    seam.globalAlpha = 1;
    paintWashWith(
      "simple",
      seam as unknown as CanvasRenderingContext2D,
      sweep(),
      SIZE,
      1,
      1.4,
      0.8,
      1.2,
      groundProfile({ stock: "rough" }),
      "#2563eb",
    );
    expect(seam.painted).toEqual(direct.painted);
    expect(seam.strokes).toEqual(direct.strokes);
  });
});
