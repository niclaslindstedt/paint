// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the hand does to a chalk mark.
//
// `chalkField_test.ts` scrubs a stick onto a board and checks what the board
// took; this runs a whole *gesture* over one and checks what the hand
// contributes — read off the pixels the field actually dried into
// (`FakeContext.images`), which is the only place a simulated medium leaves
// any: it strokes nothing, it writes a patch.
//
//   **The same gesture is the same mark, for ever.** A repaint, the export
//   and the store each work the mark out separately, so a chalk stroke that
//   shimmered between them would be three different marks.
//
//   **Bearing down is what makes a bold.** The chalk's one dial: a light hand
//   leaves a chain of specks the board shows through, a heavy one packs the
//   tooth nearly full — coverage moves, not only brightness.
//
//   **A hurried line is still a line.** Chalk comes off by abrasion — work
//   over distance, not time — so a flick may skip a little and no more.
//
//   **And it can always say no.** A hairline mark falls through to the plain
//   painter inside the seam (`chalk.ts`), paled by the same hand, so a zoom
//   never re-presses a line.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SOLID_GROUND, groundProfile } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import { paintChalkOn } from "../src/app/plugins/chalk.ts";
import { paintSimulatedChalk } from "../src/app/plugins/chalkSim.ts";
import { forgetChalkStore } from "../src/app/plugins/chalkStore.ts";
import { mm } from "../src/app/units.ts";
import type { Point } from "../src/app/types.ts";
import { createFakeCanvas, withFakeDocument } from "./support/fakeCanvas.ts";

/** A straight run of page, sampled the way the canvas samples one: a point
 *  every `gap` document pixels (see `MIN_SAMPLE_DISTANCE` in
 *  `builtin/freehand.ts`). */
function run(gap: number): Point[] {
  const points: Point[] = [];
  for (let d = 0; d <= 180; d += gap) points.push({ x: 40 + d, y: 100 });
  return points;
}

let dom: ReturnType<typeof withFakeDocument>;

beforeEach(() => {
  forgetChalkStore();
  dom = withFakeDocument();
});

afterEach(() => {
  dom.restore();
  forgetChalkStore();
});

/** How bright the mark came out, and how much of the patch it covered. */
type Mark = { mean: number; cover: number; bytes: Uint8ClampedArray };

function draw(
  points: Point[],
  press: number,
  ground: GroundProfile = SOLID_GROUND,
  live = false,
): Mark {
  const screen = createFakeCanvas(400, 300).ctx;
  expect(
    paintSimulatedChalk(
      screen,
      points,
      mm(5),
      1,
      press,
      ground,
      "#f5f2ea",
      undefined,
      live,
    ),
  ).toBe(true);
  // The engine holds one field canvas across marks (`boardFor`), so the
  // pixels are read off the *blit's own source* rather than off whichever
  // fake document happened to create it.
  const source = screen.blits.slice(-1)[0] as {
    getContext: () => {
      images: { width: number; height: number; data: Uint8ClampedArray }[];
    };
  };
  expect(source).toBeDefined();
  const image = source.getContext().images.slice(-1)[0];
  expect(image).toBeDefined();
  let sum = 0;
  let marked = 0;
  const cells = image!.width * image!.height;
  for (let at = 0; at < cells; at++) {
    const alpha = image!.data[at * 4 + 3]! / 255;
    sum += alpha;
    if (alpha >= 0.04) marked++;
  }
  return {
    mean: sum / cells,
    cover: marked / cells,
    bytes: image!.data,
  };
}

describe("the same gesture", () => {
  it("is the same mark every time it is worked out", () => {
    // The seed is the mark's own (hashed off its first point), never drawn:
    // the live walk, the landed repaint and the export all agree pixel for
    // pixel.
    const points = run(3);
    const a = draw(points, 1, SOLID_GROUND, true);
    const b = draw(points, 1, SOLID_GROUND, true);
    expect(a.bytes).toEqual(b.bytes);
  });

  it("drawn elsewhere is another stick, not a stamp of this one", () => {
    // Real strokes never repeat exactly: the streak lanes and the lean are
    // hashed off the mark as well as the page, so the same shape drawn a page
    // apart carries its own grain. (The pixels differ; the weight is close.)
    const here = draw(run(3), 1, SOLID_GROUND, true);
    const there = draw(
      run(3).map((p) => ({ x: p.x + 97, y: p.y + 53 })),
      1,
      SOLID_GROUND,
      true,
    );
    expect(there.mean).toBeGreaterThan(here.mean * 0.8);
    expect(there.mean).toBeLessThan(here.mean * 1.25);
    expect(there.bytes).not.toEqual(here.bytes);
  });
});

describe("a hand that bears down", () => {
  it("bolds the mark, and fills the board in as it does", () => {
    const light = draw(run(3), 0.55);
    const ordinary = draw(run(3), 1);
    const leaning = draw(run(3), 1.45);
    expect(light.mean).toBeLessThan(ordinary.mean);
    expect(ordinary.mean).toBeLessThan(leaning.mean);
    // …and it is a different mark rather than the same one at another
    // brightness: pressing harder reaches tooth the light hand rode over.
    expect(light.cover).toBeLessThan(ordinary.cover);
    expect(ordinary.cover).toBeLessThan(leaning.cover);
  });

  it("is what a light hand's chain of specks is made of", () => {
    const light = draw(run(3), 0.45, groundProfile({ stock: "rough" }));
    expect(light.cover).toBeLessThan(0.5);
    expect(light.mean).toBeGreaterThan(0);
  });
});

describe("a hand that hurries", () => {
  it("still leaves the mark it drew", () => {
    // Chalk is an abrasive: the stick scrapes the same tooth however fast the
    // hand crossed it, so a flick is a shade lighter and no more.
    const slow = draw(run(1.5), 1);
    const flicked = draw(run(48), 1);
    expect(flicked.mean).toBeGreaterThan(slow.mean * 0.8);
    expect(flicked.cover).toBeGreaterThan(slow.cover * 0.85);
  });
});

describe("a tap", () => {
  it("leaves a patch of grain, not a disc", () => {
    const mark = draw(
      [{ x: 100, y: 100 }],
      1,
      groundProfile({ stock: "cold" }),
    );
    expect(mark.cover).toBeGreaterThan(0.1);
    // Grain: the patch is nowhere near uniformly solid.
    expect(mark.mean).toBeLessThan(0.8);
  });
});

describe("the dried-mark shelf", () => {
  it("knows one pressure from another", () => {
    // Pressure decides the pixels, so it is part of what a mark dried into
    // (see `Ask` in `chalkStore.ts`).
    const screen = createFakeCanvas(400, 300).ctx;
    const points = run(3);
    const worked = () =>
      dom.created.reduce(
        (total, canvas) => total + (canvas.ctx.calls.putImageData ?? 0),
        0,
      );
    paintSimulatedChalk(screen, points, mm(5), 1, 1, SOLID_GROUND);
    paintSimulatedChalk(screen, points, mm(5), 1, 1.45, SOLID_GROUND);
    expect(worked()).toBe(2);
    // …and both are on the shelf now: asking again blits, never re-works.
    paintSimulatedChalk(screen, points, mm(5), 1, 1, SOLID_GROUND);
    paintSimulatedChalk(screen, points, mm(5), 1, 1.45, SOLID_GROUND);
    expect(worked()).toBe(2);
  });
});

describe("the seam's fallback", () => {
  it("draws a hairline as a plain path at the hand's own weight", () => {
    // Pulled back until the stick is under a pixel, the simulation says no
    // and the seam catches it — as a paled line, so the mark keeps the weight
    // it was drawn with instead of snapping solid.
    const screen = createFakeCanvas(400, 300).ctx;
    paintChalkOn(screen, run(3), mm(5), 0.005, 1, SOLID_GROUND, "#f5f2ea");
    expect(screen.calls.stroke ?? 0).toBeGreaterThan(0);
    expect(screen.calls.putImageData ?? 0).toBe(0);
  });
});
