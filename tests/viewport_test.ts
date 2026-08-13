// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  clampView,
  fitView,
  initialView,
  panBy,
  pinch,
  toDocumentPoint,
  toScreenPoint,
  zoomAt,
  type CanvasView,
} from "../src/app/viewport.ts";
import { DEFAULT_CANVAS } from "../src/app/types.ts";

// The page is bigger than the screen, so every mark's position depends on where
// the view happens to be looking. The whole pinch is pure arithmetic, which is
// what lets a gesture be driven end to end here without a canvas.

const PAGE = { width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height };
const PHONE = { width: 400, height: 700 };

describe("the default page", () => {
  it("is larger than the screen it opens on", () => {
    // The point of the change: a page that fits is a page you run out of.
    expect(PAGE.width).toBeGreaterThan(PHONE.width);
    expect(PAGE.height).toBeGreaterThan(PHONE.height);
  });
});

describe("toDocumentPoint / toScreenPoint", () => {
  it("round-trips a point through the view", () => {
    const view: CanvasView = { scale: 2.5, tx: -320, ty: 64 };
    const doc = { x: 812, y: 137 };
    const back = toDocumentPoint(view, toScreenPoint(view, doc));
    expect(back.x).toBeCloseTo(doc.x, 6);
    expect(back.y).toBeCloseTo(doc.y, 6);
  });

  it("reads the pan and the zoom", () => {
    const view: CanvasView = { scale: 2, tx: 100, ty: 50 };
    // A finger at (300, 250) on the element sits 200 / 200 screen pixels past
    // the page's origin, which at 2× is 100 / 100 document pixels in.
    expect(toDocumentPoint(view, { x: 300, y: 250 })).toEqual({
      x: 100,
      y: 100,
    });
  });
});

describe("initialView", () => {
  it("opens at 1:1 with the page centred", () => {
    const view = initialView(PAGE, PHONE);
    expect(view.scale).toBe(DEFAULT_SCALE);
    // The window's centre is over the page's centre, so you start in the middle
    // of the sheet with room in every direction.
    const centre = toDocumentPoint(view, {
      x: PHONE.width / 2,
      y: PHONE.height / 2,
    });
    expect(centre.x).toBeCloseTo(PAGE.width / 2, 6);
    expect(centre.y).toBeCloseTo(PAGE.height / 2, 6);
  });
});

describe("fitView", () => {
  it("brings the whole page inside the window", () => {
    const view = fitView(PAGE, PHONE);
    expect(PAGE.width * view.scale).toBeLessThanOrEqual(PHONE.width);
    expect(PAGE.height * view.scale).toBeLessThanOrEqual(PHONE.height);
    // Fitting a page this much bigger than a phone means zooming out.
    expect(view.scale).toBeLessThan(1);
  });

  it("never fits past the zoom floor", () => {
    expect(fitView(PAGE, { width: 20, height: 20 }).scale).toBe(MIN_SCALE);
  });
});

describe("clampScale", () => {
  it("holds the zoom between its floor and its ceiling", () => {
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
    expect(clampScale(500)).toBe(MAX_SCALE);
    expect(clampScale(1.75)).toBe(1.75);
  });
});

describe("zoomAt", () => {
  it("pins the anchor to the document point it was over", () => {
    // What makes a pinch feel attached to the fingers: whatever is between them
    // stays between them.
    const view: CanvasView = { scale: 1, tx: -500, ty: -300 };
    const anchor = { x: 220, y: 180 };
    const before = toDocumentPoint(view, anchor);
    const after = toDocumentPoint(zoomAt(view, 3.4, anchor), anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("still clamps the scale it is handed", () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 99, { x: 0, y: 0 }).scale).toBe(
      MAX_SCALE,
    );
  });
});

describe("clampView", () => {
  it("leaves a view that is already on screen alone", () => {
    const view = initialView(PAGE, PHONE);
    expect(clampView(view, PAGE, PHONE)).toEqual(view);
  });

  it("keeps the page reachable after a wild pan", () => {
    // Flung far off to one side, enough of the sheet must still overlap the
    // window that there is something left to drag back.
    const flung = panBy(initialView(PAGE, PHONE), 99999, 99999);
    const clamped = clampView(flung, PAGE, PHONE);
    expect(clamped.tx).toBeLessThanOrEqual(PHONE.width);
    expect(clamped.ty).toBeLessThanOrEqual(PHONE.height);
    // The page's right/bottom edge is still inside the window, not past it.
    expect(clamped.tx + PAGE.width * clamped.scale).toBeGreaterThan(0);
    expect(clamped.ty + PAGE.height * clamped.scale).toBeGreaterThan(0);
  });

  it("clamps a pan the other way too", () => {
    const flung = panBy(initialView(PAGE, PHONE), -99999, -99999);
    const clamped = clampView(flung, PAGE, PHONE);
    expect(clamped.tx + PAGE.width * clamped.scale).toBeGreaterThan(0);
    expect(clamped.ty + PAGE.height * clamped.scale).toBeGreaterThan(0);
  });
});

describe("pinch", () => {
  const start = {
    view: initialView(PAGE, PHONE),
    a: { x: 150, y: 300 },
    b: { x: 250, y: 400 },
  };

  it("zooms by how far the fingers spread", () => {
    // Both fingers move twice as far apart about the same midpoint.
    const next = pinch(
      start,
      { x: 100, y: 250 },
      { x: 300, y: 450 },
      PAGE,
      PHONE,
    );
    expect(next.scale).toBeCloseTo(start.view.scale * 2, 6);
  });

  it("pans by how far the midpoint moved", () => {
    // Fingers held the same distance apart, shifted 40 / 25 pixels.
    const next = pinch(
      start,
      { x: 190, y: 325 },
      { x: 290, y: 425 },
      PAGE,
      PHONE,
    );
    expect(next.scale).toBeCloseTo(start.view.scale, 6);
    expect(next.tx).toBeCloseTo(start.view.tx + 40, 6);
    expect(next.ty).toBeCloseTo(start.view.ty + 25, 6);
  });

  it("is reversible — every frame is computed from where the gesture began", () => {
    // Pinch out, then back to the fingers' original places, and the view is
    // where it started. Accumulating frame by frame would drift instead.
    const out = pinch(
      start,
      { x: 50, y: 200 },
      { x: 350, y: 500 },
      PAGE,
      PHONE,
    );
    expect(out.scale).not.toBeCloseTo(start.view.scale, 3);
    const back = pinch(start, start.a, start.b, PAGE, PHONE);
    expect(back.scale).toBeCloseTo(start.view.scale, 6);
    expect(back.tx).toBeCloseTo(start.view.tx, 6);
    expect(back.ty).toBeCloseTo(start.view.ty, 6);
  });

  it("holds the zoom floor and ceiling mid-gesture", () => {
    const huge = pinch(
      start,
      { x: 0, y: 0 },
      { x: 4000, y: 4000 },
      PAGE,
      PHONE,
    );
    expect(huge.scale).toBeLessThanOrEqual(MAX_SCALE);
    const tiny = pinch(
      start,
      { x: 199, y: 349 },
      { x: 201, y: 351 },
      PAGE,
      PHONE,
    );
    expect(tiny.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it("never leaves the page unreachable", () => {
    const flung = pinch(
      start,
      { x: -5000, y: -5000 },
      { x: -4900, y: -4900 },
      PAGE,
      PHONE,
    );
    expect(flung).toEqual(clampView(flung, PAGE, PHONE));
  });
});
