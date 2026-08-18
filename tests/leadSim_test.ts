// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the hand does to a pencil mark.
//
// `leadField_test.ts` presses a lead onto a sheet and checks what the paper
// took; this runs a whole *gesture* over one and checks the two things the hand
// contributes, because both of them are things a sketcher would notice first:
//
//   **A hurried line is still a line.** Graphite comes off by abrasion, which
//   is work done over distance rather than over time, so drawing the same path
//   quickly must not pale it away. It is also the one term here whose input is
//   not the hand at all — `speed` is the gap between stored samples, and the
//   same wrist reports twice the speed on a 60 Hz phone as on a 120 Hz tablet
//   (see `HURRY_KEEP` in `leadSim.ts`). A mark that depended on it strongly
//   would be a mark that depended on the device.
//
//   **Bearing down is what makes a dark.** It is the pencil's second axis (see
//   `PRESS` in `plugins/builtin/dials.ts`): a light hand rides the crowns of
//   the paper and leaves the sheet showing through, a heavy one drives the lead
//   into the tooth and fills it in. So it has to move *coverage* and not only
//   greyness — a mark that merely got darker would be an opacity slider.
//
// The claims are read off the pixels the field actually dried into
// (`FakeContext.images`), which is the only place a simulated medium leaves
// one: it strokes nothing, it writes a patch.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SOLID_GROUND, groundProfile } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import { HB_LEAD } from "../src/app/plugins/graphite.ts";
import { paintSimulatedLead } from "../src/app/plugins/leadSim.ts";
import { forgetLeadStore } from "../src/app/plugins/leadStore.ts";
import { mm } from "../src/app/units.ts";
import type { Point } from "../src/app/types.ts";
import { createFakeCanvas, withFakeDocument } from "./support/fakeCanvas.ts";

/** A straight run of page, sampled the way the canvas samples one: a point
 *  every `gap` document pixels, which is exactly what a hand moving that fast
 *  leaves behind (see `MIN_SAMPLE_DISTANCE` in `builtin/freehand.ts`). */
function run(gap: number): Point[] {
  const points: Point[] = [];
  for (let d = 0; d <= 180; d += gap) points.push({ x: 40 + d, y: 60 });
  return points;
}

let dom: ReturnType<typeof withFakeDocument>;

beforeEach(() => {
  forgetLeadStore();
  dom = withFakeDocument();
});

afterEach(() => {
  dom.restore();
  forgetLeadStore();
});

/** How dark the mark came out, and how much of the patch it covered at all. */
type Mark = { mean: number; cover: number };

function draw(
  points: Point[],
  press: number,
  ground: GroundProfile = SOLID_GROUND,
): Mark {
  const screen = createFakeCanvas(400, 300).ctx;
  expect(
    paintSimulatedLead(
      screen,
      points,
      mm(0.9),
      1,
      HB_LEAD,
      press,
      ground,
      "#333338",
    ),
  ).toBe(true);
  // The last patch written is this mark's: a fresh path is a fresh field.
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

describe("a hand that hurries", () => {
  it("still leaves the mark it drew", () => {
    // The same 180 pixels of page, crossed one sample at a time and crossed in
    // a flick. A pencil is not a pen: the lead scrapes the same tooth either
    // way, so what comes out is the same line and not a ghost of one.
    const slow = draw(run(1.5), 1);
    const flicked = draw(run(48), 1);
    expect(flicked.mean).toBeGreaterThan(slow.mean * 0.8);
    expect(flicked.cover).toBeGreaterThan(slow.cover * 0.85);
  });

  it("does leave a slightly lighter one, because a flick skips", () => {
    // Not *nothing*: a hurried lead bounces off the crowns and the hand eases
    // as it goes. The claim is that it is a shade, not a disappearance.
    const slow = draw(run(1.5), 1);
    const flicked = draw(run(48), 1);
    expect(flicked.mean).toBeLessThan(slow.mean);
  });

  it("holds up on stock with a tooth to skip over", () => {
    // The sheet is where a speed term does its damage: on rough paper a lead
    // is already only catching the crowns, so paling it further takes the mark
    // off the page altogether.
    const rough = groundProfile({ stock: "rough" });
    const slow = draw(run(1.5), 1, rough);
    const flicked = draw(run(48), 1, rough);
    expect(slow.cover).toBeGreaterThan(0.2);
    expect(flicked.cover).toBeGreaterThan(slow.cover * 0.7);
  });
});

describe("a hand that bears down", () => {
  it("darkens the mark, and fills the paper in as it does", () => {
    const light = draw(run(3), 0.5);
    const ordinary = draw(run(3), 1);
    const leaning = draw(run(3), 1.5);
    expect(light.mean).toBeLessThan(ordinary.mean);
    expect(ordinary.mean).toBeLessThan(leaning.mean);
    // …and it is a different mark rather than the same one at another
    // greyness: pressing harder reaches tooth the light hand rode over.
    expect(light.cover).toBeLessThan(ordinary.cover);
    expect(ordinary.cover).toBeLessThan(leaning.cover);
  });

  it("is what a light hand's broken line is made of", () => {
    // A guide line laid on with the side of the hand: the sheet shows through
    // it, which is a thing an opacity dial cannot do.
    const light = draw(run(3), 0.4);
    expect(light.cover).toBeLessThan(0.3);
    expect(light.mean).toBeGreaterThan(0);
  });

  it("reaches a dark on rough stock a sketching hand cannot", () => {
    // The whole point of the dial: the tooth that breaks a light line up is
    // tooth a leaned-on lead gets into, so the same pencil that scumbles can
    // also lay a solid dark.
    const rough = groundProfile({ stock: "rough" });
    const ordinary = draw(run(3), 1, rough);
    const leaning = draw(run(3), 1.6, rough);
    expect(leaning.mean).toBeGreaterThan(ordinary.mean * 2);
    expect(leaning.cover).toBeGreaterThan(0.5);
  });
});

describe("the dried-mark shelf", () => {
  it("knows one pressure from another", () => {
    // Pressure decides the pixels, so it is part of what a mark dried into —
    // a store that ignored it would blit a light line where a heavy one was
    // asked for (see `Ask` in `leadStore.ts`).
    const screen = createFakeCanvas(400, 300).ctx;
    const points = run(3);
    const worked = () =>
      dom.created.reduce(
        (total, canvas) => total + (canvas.ctx.calls.putImageData ?? 0),
        0,
      );
    paintSimulatedLead(screen, points, mm(0.9), 1, HB_LEAD, 1, SOLID_GROUND);
    paintSimulatedLead(screen, points, mm(0.9), 1, HB_LEAD, 1.5, SOLID_GROUND);
    expect(worked()).toBe(2);
    // …and both are on the shelf now.
    paintSimulatedLead(screen, points, mm(0.9), 1, HB_LEAD, 1, SOLID_GROUND);
    paintSimulatedLead(screen, points, mm(0.9), 1, HB_LEAD, 1.5, SOLID_GROUND);
    expect(worked()).toBe(2);
  });
});
