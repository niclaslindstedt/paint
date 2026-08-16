// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  carriesAlpha,
  exportFileName,
  exportRegion,
  exportsTransparent,
  flattensPage,
  formatMime,
  DOWNLOAD_FORMATS,
} from "../src/app/export.ts";
import { defaultLayers, transparentLayers } from "../src/app/layers.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

const drawing = (name: string, strokes: Stroke[] = []): Drawing => ({
  id: "d1",
  name,
  width: 800,
  height: 600,
  strokes,
});

const mark = (
  from: { x: number; y: number },
  to: { x: number; y: number },
) => ({
  id: "s1",
  tool: "line",
  size: 4,
  shape: { kind: "segment" as const, from, to },
});

describe("exportFileName", () => {
  it("slugifies the drawing's name", () => {
    expect(exportFileName(drawing("Sequence diagram"), "png")).toBe(
      "sequence-diagram.png",
    );
  });

  it("collapses punctuation and trims the edges", () => {
    expect(exportFileName(drawing("  Auth flow — v2!  "), "png")).toBe(
      "auth-flow-v2.png",
    );
  });

  it("keeps letters from other scripts", () => {
    expect(exportFileName(drawing("Översikt"), "png")).toBe("översikt.png");
  });

  it("falls back for an unnamed drawing", () => {
    expect(exportFileName(drawing("   "), "png")).toBe("drawing.png");
  });

  it("wears each offered format as its extension", () => {
    expect(
      DOWNLOAD_FORMATS.map((f) => exportFileName(drawing("Map"), f)),
    ).toEqual(["map.png", "map.jpg", "map.svg"]);
  });
});

describe("formatMime", () => {
  it("names the encoder each format is written with", () => {
    expect(formatMime("png")).toBe("image/png");
    expect(formatMime("jpg")).toBe("image/jpeg");
    expect(formatMime("svg")).toBe("image/svg+xml");
  });
});

describe("exportRegion", () => {
  it("is the whole sheet under the page scope", () => {
    expect(
      exportRegion(
        drawing("m", [mark({ x: 10, y: 10 }, { x: 20, y: 20 })]),
        "page",
      ),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("crops to the marks, with a margin around them", () => {
    const region = exportRegion(
      drawing("m", [mark({ x: 100, y: 100 }, { x: 300, y: 200 })]),
      "marks",
    );
    // The mark spans 98–302 / 98–202 with its nib; the crop adds 8 either way.
    expect(region).toEqual({ x: 90, y: 90, width: 220, height: 120 });
  });

  it("never crops past the sheet", () => {
    const region = exportRegion(
      drawing("m", [mark({ x: 0, y: 0 }, { x: 800, y: 600 })]),
      "marks",
    );
    expect(region).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("falls back to the page for a drawing with nothing on it", () => {
    // "Crop to the marks" with no marks would otherwise be a file of no size.
    expect(exportRegion(drawing("blank"), "marks")).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it("returns whole pixels — a raster canvas can't be sized in fractions", () => {
    const region = exportRegion(
      drawing("m", [mark({ x: 10.4, y: 10.4 }, { x: 200.6, y: 100.6 })]),
      "marks",
    );
    for (const value of Object.values(region)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

// --- A page made of nothing --------------------------------------------------
//
// A new image starts with its sheet switched off (see `NewImageModal`), so what
// an export does with one is the default path rather than a corner. Three rules,
// and the third is the one that bites: a format with no alpha channel writes the
// nothing as solid black unless it is given a page first.

const ink = { pageColor: "#ffffff", defaultInk: "#111827" };
const opaque = { ...ink, scope: "page" as const, transparent: false };
const asked = { ...ink, scope: "page" as const, transparent: true };
const sheeted: Drawing = { ...drawing("sheeted"), layers: defaultLayers() };
const nothing: Drawing = { ...drawing("nothing"), layers: transparentLayers() };

describe("what an export puts behind the marks", () => {
  it("knows which formats can hold nothing at all", () => {
    expect(carriesAlpha("png")).toBe(true);
    expect(carriesAlpha("svg")).toBe(true);
    expect(carriesAlpha("jpg")).toBe(false);
  });

  it("carries a page with no sheet through without being asked", () => {
    // Nobody touched the download menu's transparency switch here: the page
    // itself has no sheet, and an image made to sit on somebody else's page
    // should arrive with nothing behind it.
    expect(exportsTransparent(nothing, "png", opaque)).toBe(true);
    expect(exportsTransparent(nothing, "svg", opaque)).toBe(true);
    expect(exportsTransparent(sheeted, "png", opaque)).toBe(false);
  });

  it("still honours the switch on a page that has one", () => {
    expect(exportsTransparent(sheeted, "png", asked)).toBe(true);
    expect(exportsTransparent(sheeted, "jpg", asked)).toBe(false);
  });

  it("gives a JPG a page rather than a black rectangle", () => {
    // The one case where the file and the drawing have to disagree: JPG has no
    // alpha, so the nothing is filled with the colour the sheet would go back
    // to. Every other combination leaves the drawing alone.
    expect(flattensPage(nothing, "jpg")).toBe(true);
    expect(flattensPage(nothing, "png")).toBe(false);
    expect(flattensPage(nothing, "svg")).toBe(false);
    expect(flattensPage(sheeted, "jpg")).toBe(false);
  });
});
