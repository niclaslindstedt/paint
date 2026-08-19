// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  barPlacement,
  fieldWidth,
  GUTTER,
  MIN_BAR,
  MIN_FIELD,
} from "../src/app/textLayout.ts";

// The floating text box's two bounds. `TextEntry.tsx` only measures things and
// hands them here, so a caption typed against the right-hand edge of a phone —
// the case where the box and its bar both want more room than there is — is
// arithmetic that runs with no DOM.

// A phone: the canvas layer under the box, in screen pixels.
const phone = { width: 390, height: 700 };
// What the bar comes out at on one, in a single row: a grip, the face menu, the
// weight, the slant and the two ways out.
const row = { width: 244, height: 38 };

describe("fieldWidth", () => {
  it("gives the words what they want when there is room", () => {
    expect(fieldWidth(160, phone.width, 40)).toBe(160);
  });

  it("caps the field at what is left to the right of the anchor", () => {
    expect(fieldWidth(300, phone.width, 200)).toBe(390 - 200 - GUTTER);
  });

  it("keeps a sliver of a field against the very edge", () => {
    expect(fieldWidth(300, phone.width, 388)).toBe(MIN_FIELD);
  });

  it("takes the natural width before the canvas has been measured", () => {
    expect(fieldWidth(300, 0, 200)).toBe(300);
  });
});

describe("barPlacement", () => {
  it("leaves a bar that fits alone", () => {
    const placed = barPlacement(phone, { x: 8, y: 200 }, row);
    expect(placed.maxWidth).toBe(390 - GUTTER * 2);
    expect(placed.shift).toBe(0);
    expect(placed.above).toBe(true);
  });

  it("wraps the buttons into the room right of the anchor", () => {
    // The case from the screenshot: a caption started past halfway. The bar
    // folds instead of walking left off the box it belongs to.
    const placed = barPlacement(phone, { x: 210, y: 300 }, row);
    expect(placed.maxWidth).toBe(390 - 210 - GUTTER);
  });

  it("keeps the grip over the box once the bar has wrapped", () => {
    // A wrapped bar measures its cap, so nothing hangs off the right and there
    // is nothing to slide — which is what leaves room to drag the caption left.
    const anchor = { x: 210, y: 300 };
    const wrapped = { width: 390 - 210 - GUTTER, height: 70 };
    expect(barPlacement(phone, anchor, wrapped).shift).toBe(0);
  });

  it("stops wrapping before the bar becomes a column", () => {
    const placed = barPlacement(phone, { x: 360, y: 300 }, row);
    expect(placed.maxWidth).toBe(MIN_BAR);
  });

  it("slides whatever still overhangs back inside the canvas", () => {
    const anchor = { x: 360, y: 300 };
    const floored = { width: MIN_BAR, height: 70 };
    const placed = barPlacement(phone, anchor, floored);
    expect(placed.shift).toBe(390 - GUTTER - (360 + MIN_BAR));
    // …and the bar's left edge lands inside the canvas, on the gutter or past
    // it, rather than off the left-hand side of the screen.
    expect(anchor.x + placed.shift).toBeGreaterThanOrEqual(GUTTER);
  });

  it("never slides a bar off the left to save the right", () => {
    // A canvas narrower than the floor: the bar can't fit either way, so it
    // stays pinned to the gutter rather than being pushed off-screen.
    const slim = { width: 120, height: 700 };
    const placed = barPlacement(slim, { x: 4, y: 300 }, row);
    expect(placed.shift).toBe(GUTTER - 4);
    expect(placed.maxWidth).toBe(120 - GUTTER * 2);
  });

  it("flips below the box when there is no room above it", () => {
    expect(barPlacement(phone, { x: 40, y: 20 }, row).above).toBe(false);
    expect(barPlacement(phone, { x: 40, y: 60 }, row).above).toBe(true);
  });

  it("hangs above before the bar has measured itself", () => {
    const placed = barPlacement(
      phone,
      { x: 40, y: 0 },
      { width: 0, height: 0 },
    );
    expect(placed.above).toBe(true);
  });

  it("takes its natural row before the canvas has been measured", () => {
    const placed = barPlacement(
      { width: 0, height: 0 },
      { x: 40, y: 300 },
      row,
    );
    expect(placed.maxWidth).toBeNull();
    // Nothing to clamp against either, so the bar hangs straight off the box.
    expect(placed.shift).toBe(0);
  });
});
