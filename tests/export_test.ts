// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  exportFileName,
  exportRegion,
  formatMime,
  DOWNLOAD_FORMATS,
} from "../src/app/export.ts";
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
