// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the hand does to a crayon mark.
//
// `waxField_test.ts` presses a stick of wax onto a sheet and checks what the
// paper took; this runs a whole *gesture* over one and checks the axes a
// colourer would notice first: bearing down fills the tooth in (coverage, not
// only darkness), a softer stick is a fuller mark, a hurried pass is a shade
// and not a ghost, and the sheet the page is cut from decides how the mark
// breaks up. The claims are read off the pixels the field actually dried
// into (`FakeContext.images`), which is the only place a simulated medium
// leaves one.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SOLID_GROUND, groundProfile } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import { paintCrayon } from "../src/app/plugins/crayon.ts";
import { paintSimulatedWax } from "../src/app/plugins/waxSim.ts";
import { forgetWaxStore } from "../src/app/plugins/waxStore.ts";
import { mm } from "../src/app/units.ts";
import type { Point } from "../src/app/types.ts";
import {
  createFakeCanvas,
  createFakeContext,
  withFakeDocument,
} from "./support/fakeCanvas.ts";

/** A straight run of page, sampled the way the canvas samples one. */
function run(gap: number): Point[] {
  const points: Point[] = [];
  for (let d = 0; d <= 180; d += gap) points.push({ x: 40 + d, y: 60 });
  return points;
}

let dom: ReturnType<typeof withFakeDocument>;

beforeEach(() => {
  forgetWaxStore();
  dom = withFakeDocument();
});

afterEach(() => {
  dom.restore();
  forgetWaxStore();
});

/** How dark the mark came out, and how much of the patch it covered at all. */
type Mark = { mean: number; cover: number };

function draw(
  points: Point[],
  pressure: number,
  soft = 1,
  ground: GroundProfile = SOLID_GROUND,
): Mark {
  const screen = createFakeCanvas(400, 300).ctx;
  expect(
    paintSimulatedWax(
      screen,
      points,
      mm(2.5),
      1,
      pressure,
      soft,
      ground,
      "#7a2018",
    ),
  ).toBe(true);
  const image = dom.created.flatMap((canvas) => canvas.ctx.images).slice(-1)[0];
  expect(image).toBeDefined();
  let sum = 0;
  let marked = 0;
  const cells = image!.width * image!.height;
  for (let at = 0; at < cells; at++) {
    const alpha = image!.data[at * 4 + 3]! / 255;
    sum += alpha;
    if (alpha >= 0.04) marked++;
  }
  return { mean: sum / cells, cover: marked / cells };
}

describe("a hand that bears down", () => {
  it("darkens the mark, and fills the paper in as it does", () => {
    const cold = groundProfile({ stock: "cold" });
    const light = draw(run(3), 0.5, 1, cold);
    const ordinary = draw(run(3), 1, 1, cold);
    const leaning = draw(run(3), 1.5, 1, cold);
    expect(light.mean).toBeLessThan(ordinary.mean);
    expect(ordinary.mean).toBeLessThan(leaning.mean);
    // …and it is a different mark rather than the same one at another
    // darkness: pressing harder reaches tooth the light hand slipped over,
    // which is what an opacity slider cannot do.
    expect(light.cover).toBeLessThan(ordinary.cover);
    expect(ordinary.cover).toBeLessThan(leaning.cover);
  });

  it("leaves broken chains of crumbs under a light hand", () => {
    // The shading pass: wax caught on the crowns in clumps, clean paper
    // between them — visible, and nowhere near a body.
    const light = draw(run(3), 0.5, 1, groundProfile({ stock: "cold" }));
    expect(light.cover).toBeGreaterThan(0.02);
    expect(light.cover).toBeLessThan(0.3);
  });
});

describe("the box of sticks", () => {
  it("draws a fuller, darker mark the softer the stick", () => {
    // The soft dial is the crayon's grade: a china marker breaks on tooth an
    // oil pastel butters straight over. Both numbers have to move — a softer
    // stick that merely darkened would be an opacity slider with a new name.
    const cold = groundProfile({ stock: "cold" });
    const china = draw(run(3), 1, 0.3, cold);
    const wax = draw(run(3), 1, 1, cold);
    const pastel = draw(run(3), 1, 1.7, cold);
    expect(china.mean).toBeLessThan(wax.mean);
    expect(wax.mean).toBeLessThan(pastel.mean);
    expect(china.cover).toBeLessThan(wax.cover);
    expect(wax.cover).toBeLessThan(pastel.cover);
  });
});

describe("the sheet", () => {
  it("breaks the same stroke up more the rougher the stock", () => {
    // The whole reason the crayon is a sheet model: the same stick at the
    // same weight is a different drawing on a different paper.
    const solid = draw(run(3), 1);
    const cold = draw(run(3), 1, 1, groundProfile({ stock: "cold" }));
    const rough = draw(run(3), 1, 1, groundProfile({ stock: "rough" }));
    expect(rough.cover).toBeLessThan(cold.cover);
    expect(cold.cover).toBeLessThan(solid.cover);
  });
});

describe("a hand that hurries", () => {
  it("still leaves the mark it drew", () => {
    // Wax comes off by work done over distance, like graphite: a flick is a
    // shade lighter, never a ghost (see `HURRY_KEEP` in `leadSim.ts` for the
    // argument, hardware included).
    const cold = groundProfile({ stock: "cold" });
    const slow = draw(run(1.5), 1, 1, cold);
    const flicked = draw(run(48), 1, 1, cold);
    expect(flicked.mean).toBeGreaterThan(slow.mean * 0.8);
    expect(flicked.cover).toBeGreaterThan(slow.cover * 0.8);
    expect(flicked.mean).toBeLessThan(slow.mean);
  });
});

describe("the dried-mark shelf", () => {
  it("knows one pressure and one stick from another", () => {
    // Both dials decide the pixels, so both are part of what a mark dried
    // into — a store that ignored either would blit a china-marker line where
    // an oil pastel was asked for (see `Ask` in `waxStore.ts`).
    const screen = createFakeCanvas(400, 300).ctx;
    const points = run(3);
    const worked = () =>
      dom.created.reduce(
        (total, canvas) => total + (canvas.ctx.calls.putImageData ?? 0),
        0,
      );
    paintSimulatedWax(screen, points, mm(2.5), 1, 1, 1, SOLID_GROUND);
    paintSimulatedWax(screen, points, mm(2.5), 1, 1.5, 1, SOLID_GROUND);
    paintSimulatedWax(screen, points, mm(2.5), 1, 1, 0.3, SOLID_GROUND);
    expect(worked()).toBe(3);
    // …and all three are on the shelf now.
    paintSimulatedWax(screen, points, mm(2.5), 1, 1, 1, SOLID_GROUND);
    paintSimulatedWax(screen, points, mm(2.5), 1, 1.5, 1, SOLID_GROUND);
    paintSimulatedWax(screen, points, mm(2.5), 1, 1, 0.3, SOLID_GROUND);
    expect(worked()).toBe(3);
  });
});

describe("the seam", () => {
  it("falls back to the grain painter where no field can run", () => {
    // No DOM to make a surface in: the simulation says no and the geometric
    // painter draws the mark this app has always drawn — inside `paintCrayon`,
    // not at any call site.
    dom.restore();
    const ctx = createFakeContext();
    paintCrayon(ctx, run(1.5), mm(2.5), 1, 1, 1.7);
    expect(ctx.strokes.length).toBeGreaterThan(0);
    dom = withFakeDocument();
  });
});
