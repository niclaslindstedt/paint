// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The floor under the one pencil.
//
// `leadField_test.ts` checks what the simulation *does*. This checks the rule
// the seam is built to keep, which is a different claim and the one that would
// break a drawing if it went wrong:
//
//   **the simulation may decline, and a mark still gets drawn.**
//
// A browser with no canvas to work on, a view pulled back until the mark is a
// hairline, a lead finer than a couple of cells: every one of those has to come
// out as the mark this app has always drawn, not as a gap on the page. The
// tests run in node with no DOM, so the simulation declines every time here —
// which makes this the exact environment the claim is about.
//
// The stroke model it falls through to is the one thing left of the second
// pencil this app used to offer. Nobody chooses it and nothing names it; these
// tests are what keep it wired up.

import { describe, expect, it } from "vitest";

import { SOLID_GROUND, groundProfile } from "../src/app/ground.ts";
import { HB_LEAD, paintGraphite } from "../src/app/plugins/graphite.ts";
import {
  DEFAULT_LEAD_DETAIL,
  MAX_LEAD_DETAIL,
  MIN_LEAD_DETAIL,
  clampLeadDetail,
  leadDetail,
  paintGraphiteOn,
  setLeadDetail,
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

describe("the detail in force", () => {
  it("is one app-wide value, so nothing painting a page can disagree", () => {
    // Every surface that paints the same document has to agree about it: the
    // screen, the mark cache, the thumbnails, the page the dropper reads, the
    // exported PNG.
    expect(leadDetail()).toBe(DEFAULT_LEAD_DETAIL);
    try {
      setLeadDetail(0.4);
      expect(leadDetail()).toBe(0.4);
      // Clamped on the way in, so nothing downstream has to re-check.
      setLeadDetail(0);
      expect(leadDetail()).toBe(MIN_LEAD_DETAIL);
    } finally {
      setLeadDetail(DEFAULT_LEAD_DETAIL);
    }
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
    // never a gap on the page — the seam's one promise, asked once per stop of
    // the slider.
    for (const detail of [1, 0.75, 0.5, 0.25, MIN_LEAD_DETAIL]) {
      const ctx = createFakeContext();
      ctx.globalAlpha = 1;
      paintGraphiteOn(
        ctx,
        curve(),
        mm(0.7),
        1,
        HB_LEAD,
        1,
        groundProfile({ stock: "cold" }),
        "#333338",
        detail,
      );
      expect(specks(ctx)).toBeGreaterThan(0);
    }
  });
});

describe("a simulation that cannot run", () => {
  it("says so rather than drawing half a mark", () => {
    const ctx = createFakeContext();
    // No DOM: there is no canvas to work the field on.
    expect(
      paintSimulatedLead(ctx, curve(), mm(0.7), 1, HB_LEAD, 1, SOLID_GROUND),
    ).toBe(false);
  });

  it("says so for a mark too small to be worth a field", () => {
    const ctx = createFakeContext();
    // Pulled back far enough that the whole line is inside a pixel. The stroke
    // model has its own answer for this (a plain path at the weight the specks
    // average out to) and it is a better one than a field of two cells.
    expect(
      paintSimulatedLead(ctx, curve(), mm(0.3), 0.05, HB_LEAD, 1, SOLID_GROUND),
    ).toBe(false);
  });

  it("hands the mark to the stroke model instead of losing it", () => {
    // The rule the seam exists for. In a place the field cannot run, the mark
    // still lands — and lands as the mark this app has always drawn.
    const asked = createFakeContext();
    asked.globalAlpha = 1;
    paintGraphiteOn(
      asked,
      curve(),
      mm(0.9),
      1,
      HB_LEAD,
      1,
      groundProfile({ stock: "cold" }),
      "#333338",
    );
    const plain = createFakeContext();
    plain.globalAlpha = 1;
    paintGraphite(plain, curve(), mm(0.9), 1, HB_LEAD);
    expect(specks(asked)).toBeGreaterThan(0);
    expect(specks(asked)).toBe(specks(plain));
  });
});
