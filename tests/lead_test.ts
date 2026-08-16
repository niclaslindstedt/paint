// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The seam between the two pencils.
//
// `leadField_test.ts` checks what the simulation *does*. This checks the rule
// the whole seam is built to keep, which is a different claim and the one that
// would break a drawing if it went wrong:
//
//   **the heavier engine may decline, and a mark still gets drawn.**
//
// A browser with no canvas to work on, a view pulled back until the mark is a
// hairline, a lead finer than a couple of cells: every one of those has to come
// out as the mark this app has always drawn, not as a gap on the page. The
// tests run in node with no DOM, so the simulation declines every time here —
// which makes this the exact environment the claim is about.

import { describe, expect, it } from "vitest";

import { SOLID_GROUND, groundProfile } from "../src/app/ground.ts";
import { HB_LEAD } from "../src/app/plugins/graphite.ts";
import {
  DEFAULT_LEAD_DETAIL,
  DEFAULT_LEAD_ENGINE,
  LEAD_ENGINES,
  MAX_LEAD_DETAIL,
  MIN_LEAD_DETAIL,
  clampLeadDetail,
  isLeadEngine,
  leadEngine,
  paintGraphiteWith,
  setLeadEngine,
} from "../src/app/plugins/lead.ts";
import { paintSimulatedLead } from "../src/app/plugins/leadSim.ts";
import { mm } from "../src/app/units.ts";
import type { Point } from "../src/app/types.ts";
import { createFakeContext, type FakeContext } from "./support/fakeCanvas.ts";

/** A gentle sampled curve, the shape a hand actually draws. */
function curve(): Point[] {
  const points: Point[] = [];
  for (let t = 0; t <= 200; t += 1.5) {
    points.push({ x: 40 + t, y: 150 + Math.sin(t / 50) * 12 });
  }
  return points;
}

/** Every speck a mark laid down. The stroke model draws its graphite as runs of
 *  tiny segments, so a mark that reached the page has some and a mark that
 *  vanished has none. */
function specks(ctx: FakeContext): number {
  return ctx.strokes.reduce((total, stroke) => total + stroke.runs.length, 0);
}

describe("which pencil is drawing", () => {
  it("offers two engines and opens on the cheap one", () => {
    expect(LEAD_ENGINES.map((engine) => engine.id)).toEqual([
      "simple",
      "simulation",
    ]);
    // The simulation is opt-in: it costs a field per mark, and a tool that is
    // slow out of the box is a tool nobody keeps.
    expect(DEFAULT_LEAD_ENGINE).toBe("simple");
    expect(LEAD_ENGINES[0]!.id).toBe(DEFAULT_LEAD_ENGINE);
  });

  it("refuses an engine off a persisted blob that this build has never had", () => {
    expect(isLeadEngine("simulation")).toBe(true);
    expect(isLeadEngine("pigment")).toBe(false);
    expect(isLeadEngine(undefined)).toBe(false);
  });

  it("is one app-wide value, so nothing painting a page can disagree", () => {
    // Every surface that paints the same document has to agree about it: the
    // screen, the mark cache, the thumbnails, the page the dropper reads, the
    // exported PNG.
    expect(leadEngine()).toBe(DEFAULT_LEAD_ENGINE);
    setLeadEngine("simulation");
    expect(leadEngine()).toBe("simulation");
    setLeadEngine(DEFAULT_LEAD_ENGINE);
  });
});

describe("how hard the simulation is set to work", () => {
  it("opens at all of it, and stays on its own track", () => {
    // Full detail out of the box: a build that quietly drew a coarser mark than
    // its own swatch showed would be lying about its picture. Turning it down is
    // a trade the user makes.
    expect(DEFAULT_LEAD_DETAIL).toBe(MAX_LEAD_DETAIL);
    expect(clampLeadDetail(0.4)).toBe(0.4);
    expect(clampLeadDetail(4)).toBe(MAX_LEAD_DETAIL);
    expect(clampLeadDetail(0)).toBe(MIN_LEAD_DETAIL);
    // …and a blob written by another build, or by hand, cannot put the slider
    // somewhere it has no track.
    expect(clampLeadDetail("half")).toBe(DEFAULT_LEAD_DETAIL);
    expect(clampLeadDetail(Number.NaN)).toBe(DEFAULT_LEAD_DETAIL);
  });

  it("never loses a mark, wherever the slider is", () => {
    // Turning the detail down coarsens the field, and past a point it coarsens
    // it until the lead is a couple of cells wide and the simulation declines
    // altogether. That has to be a *fall-through* at every value on the track,
    // never a gap on the page — which is the same promise the engine choice
    // makes, asked once per stop of the slider.
    for (const detail of [1, 0.75, 0.5, 0.25, MIN_LEAD_DETAIL]) {
      const ctx = createFakeContext();
      ctx.globalAlpha = 1;
      paintGraphiteWith(
        "simulation",
        ctx,
        curve(),
        mm(0.7),
        1,
        HB_LEAD,
        groundProfile({ stock: "cold" }),
        "#333338",
        detail,
      );
      expect(specks(ctx)).toBeGreaterThan(0);
    }
  });
});

describe("an engine that cannot run", () => {
  it("says so rather than drawing half a mark", () => {
    const ctx = createFakeContext();
    // No DOM: there is no canvas to work the field on.
    expect(
      paintSimulatedLead(ctx, curve(), mm(0.7), 1, HB_LEAD, SOLID_GROUND),
    ).toBe(false);
  });

  it("says so for a mark too small to be worth a field", () => {
    const ctx = createFakeContext();
    // Pulled back far enough that the whole line is inside a pixel. The stroke
    // model has its own answer for this (a plain path at the weight the specks
    // average out to) and it is a better one than a field of two cells.
    expect(
      paintSimulatedLead(ctx, curve(), mm(0.3), 0.05, HB_LEAD, SOLID_GROUND),
    ).toBe(false);
  });

  it("hands the mark to the stroke model instead of losing it", () => {
    // The rule the seam exists for. Asked for the simulation, in a place it
    // cannot run, the mark still lands — and lands as the mark this app has
    // always drawn.
    const asked = createFakeContext();
    asked.globalAlpha = 1;
    paintGraphiteWith(
      "simulation",
      asked,
      curve(),
      mm(0.7),
      1,
      HB_LEAD,
      groundProfile({ stock: "cold" }),
      "#333338",
    );
    const plain = createFakeContext();
    plain.globalAlpha = 1;
    paintGraphiteWith("simple", plain, curve(), mm(0.7), 1, HB_LEAD);
    expect(specks(asked)).toBeGreaterThan(0);
    expect(specks(asked)).toBe(specks(plain));
  });
});
