// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dried pencil marks.
//
// What the store is for is the work it stops happening: a landed pencil mark
// is a field worked out cell by cell and written through `putImageData`, and
// before the store every repaint — every frame of a pan's strips, every undo —
// worked every mark out again. So that is what these assert: a landed mark
// dries once, repaints are blits, a change to anything that decides the pixels
// dries the mark again, and the gesture under the hand never touches the
// shelf at all.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SOLID_GROUND } from "../src/app/ground.ts";
import { HB_LEAD } from "../src/app/plugins/graphite.ts";
import { paintSimulatedLead } from "../src/app/plugins/leadSim.ts";
import { forgetLeadStore } from "../src/app/plugins/leadStore.ts";
import { mm } from "../src/app/units.ts";
import type { Point } from "../src/app/types.ts";
import { createFakeCanvas, withFakeDocument } from "./support/fakeCanvas.ts";

/** A gentle sampled curve, the shape a hand actually draws. */
function curve(): Point[] {
  const points: Point[] = [];
  for (let t = 0; t <= 200; t += 1.5) {
    points.push({ x: 40 + t, y: 150 + Math.sin(t / 50) * 12 });
  }
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

/** How many fields were actually worked out, across every surface minted so
 *  far — the simulation's one unmistakable footprint. */
function fieldsWorked(): number {
  return dom.created.reduce(
    (total, canvas) => total + (canvas.ctx.calls.putImageData ?? 0),
    0,
  );
}

describe("a landed pencil mark", () => {
  it("dries once and is blitted on every repaint after", () => {
    const screen = createFakeCanvas(400, 300).ctx;
    const points = curve();
    expect(
      paintSimulatedLead(screen, points, mm(0.7), 1, HB_LEAD, SOLID_GROUND),
    ).toBe(true);
    expect(fieldsWorked()).toBe(1);

    // Sixty frames of a pan: the same ask, by the identity of its points —
    // not one more field worked out, one blit each.
    for (let i = 0; i < 60; i++) {
      expect(
        paintSimulatedLead(screen, points, mm(0.7), 1, HB_LEAD, SOLID_GROUND),
      ).toBe(true);
    }
    expect(fieldsWorked()).toBe(1);
    expect(screen.blits.length).toBeGreaterThanOrEqual(61);
  });

  it("dries again when the view settles at another zoom", () => {
    // The pencil's field is worked at the device's pitch (see `leadSim.ts`),
    // so the cell is part of the ask: a zoom that settles somewhere new is a
    // different picture of the same mark, worked out once and then held.
    const screen = createFakeCanvas(400, 300).ctx;
    const points = curve();
    paintSimulatedLead(screen, points, mm(0.7), 1, HB_LEAD, SOLID_GROUND);
    paintSimulatedLead(screen, points, mm(0.7), 2, HB_LEAD, SOLID_GROUND);
    expect(fieldsWorked()).toBe(2);
    // …and back: both zooms are on the shelf now.
    paintSimulatedLead(screen, points, mm(0.7), 1, HB_LEAD, SOLID_GROUND);
    paintSimulatedLead(screen, points, mm(0.7), 2, HB_LEAD, SOLID_GROUND);
    expect(fieldsWorked()).toBe(2);
  });

  it("dries again in another colour, and on another sheet", () => {
    const screen = createFakeCanvas(400, 300).ctx;
    const points = curve();
    paintSimulatedLead(
      screen,
      points,
      mm(0.7),
      1,
      HB_LEAD,
      SOLID_GROUND,
      "#333338",
    );
    paintSimulatedLead(
      screen,
      points,
      mm(0.7),
      1,
      HB_LEAD,
      SOLID_GROUND,
      "#663322",
    );
    paintSimulatedLead(screen, points, mm(0.7), 1, HB_LEAD, {
      ...SOLID_GROUND,
      tooth: 3,
      bite: 0.5,
    });
    expect(fieldsWorked()).toBe(3);
  });
});

describe("the gesture under the hand", () => {
  it("never reaches the shelf", () => {
    // A draft's points are a fresh array every sample; drying those would
    // fill the store with pictures nothing can ever ask for again.
    const screen = createFakeCanvas(400, 300).ctx;
    const points = curve();
    const surfaces = () => dom.created.length;
    paintSimulatedLead(
      screen,
      points,
      mm(0.7),
      1,
      HB_LEAD,
      SOLID_GROUND,
      "#333338",
      1,
      undefined,
      true,
    );
    const minted = surfaces();
    // The live paint worked a field (on the shared sheet), but the same ask
    // landed dries a fresh one: nothing was kept.
    expect(
      paintSimulatedLead(screen, points, mm(0.7), 1, HB_LEAD, SOLID_GROUND),
    ).toBe(true);
    expect(fieldsWorked()).toBe(2);
    expect(surfaces()).toBeGreaterThan(minted - 1);
  });
});
