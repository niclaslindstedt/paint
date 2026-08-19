// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A mark's own window — what a selection leaves on the marks it cut.
//
// The arithmetic of cutting is `selection_test.ts`; this is the other half,
// which is that a window has to mean something everywhere the mark is painted.
// A cut that held on the screen and not in the file would be a drawing that
// exports as something you never drew, so the same window is asserted through
// all three surfaces: the renderer, the SVG recorder, and a page transform,
// which has to carry the window along or the ink slides out from under its own
// cut.
//
// A clip leaves no pixels of its own, so what is asserted is the box it was
// taken from and the order it was taken in — the same reading `sheet_test.ts`
// makes of the page's own clip.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { resetPlugins } from "../src/app/plugins/registry.ts";
import { renderDrawing } from "../src/app/render.ts";
import { boxRegion, maskOf } from "../src/app/selection.ts";
import { asContext2D, SvgCanvas } from "../src/app/svg.ts";
import { mirrorDrawing } from "../src/app/transform.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";
import { createFakeCanvas, withFakeDocument } from "./support/fakeCanvas.ts";

const ink = { pageColor: "#fffdf5", defaultInk: "#111827" };
const PAGE = { width: 400, height: 300 };

const WINDOW = { x: 40, y: 40, width: 60, height: 60 };

let dom: ReturnType<typeof withFakeDocument>;

beforeEach(() => {
  resetPlugins();
  registerBuiltinPlugins();
  dom = withFakeDocument();
});

afterEach(() => {
  dom.restore();
  resetPlugins();
});

/** A pencil line across the page, cut to `WINDOW` unless asked otherwise. */
function line(cut = true): Stroke {
  return {
    id: "s1",
    tool: "pencil",
    size: 8,
    shape: {
      kind: "path",
      points: [
        { x: 20, y: 60 },
        { x: 380, y: 60 },
      ],
    },
    ...(cut ? { clip: [maskOf(boxRegion(WINDOW))] } : {}),
  };
}

function drawing(strokes: Stroke[]): Drawing {
  return { id: "d", name: "d", ...PAGE, strokes };
}

describe("a repaint", () => {
  it("takes the mark's window before the mark goes down", () => {
    const ctx = createFakeCanvas(400, 300).ctx;
    renderDrawing(ctx, drawing([line()]), null, ink);
    // The page's own clip is a bare rectangle; a mark's window is an outline,
    // which is what the recorder can tell them apart by.
    const window = ctx.clips.find(({ box }) => box === null);
    expect(window).toBeTruthy();
    const inked = ctx.painted.findIndex((call) => call.call === "stroke");
    expect(inked).toBeGreaterThanOrEqual(0);
    expect(window!.after).toBeLessThanOrEqual(inked);
  });

  it("takes no window at all for a mark that was never cut", () => {
    const ctx = createFakeCanvas(400, 300).ctx;
    renderDrawing(ctx, drawing([line(false)]), null, ink);
    // The page's own clip is still there — this is the *mark's*, and an uncut
    // mark has none.
    expect(ctx.clips.some(({ box }) => box === null)).toBe(false);
  });
});

describe("the SVG export", () => {
  const toSvg = (doc: Drawing) => {
    const recorder = new SvgCanvas();
    renderDrawing(asContext2D(recorder), doc, null, ink);
    return recorder.toSvg({ x: 0, y: 0, ...PAGE });
  };

  it("carries the window as a clipPath the mark wears", () => {
    const svg = toSvg(drawing([line()]));
    const id = /<clipPath id="(c\d+)"/.exec(svg)?.[1];
    expect(id).toBeTruthy();
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain(`<g clip-path="url(#${id})">`);
  });

  it("leaves an uncut mark unwrapped", () => {
    // The page's own clip is answered by the viewBox and must not turn every
    // mark in every file into a group (see `SvgCanvas.clip`).
    const svg = toSvg(drawing([line(false)]));
    expect(svg).not.toContain("clipPath");
    expect(svg).not.toContain("clip-path");
  });
});

describe("a page turned over", () => {
  it("takes every mark's window with it", () => {
    const flipped = mirrorDrawing(drawing([line()]), "horizontal");
    const corners = flipped.strokes[0]!.clip![0]!.contours[0]!;
    const xs = corners.map((p) => p.x);
    // The window was 40..100 from the left; mirrored it is the same distance
    // from the right.
    expect(Math.min(...xs)).toBeCloseTo(PAGE.width - (WINDOW.x + WINDOW.width));
    expect(Math.max(...xs)).toBeCloseTo(PAGE.width - WINDOW.x);
  });
});
