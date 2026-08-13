// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  hexToHsv,
  hsvToHex,
  normalizeHex,
  sameColor,
} from "../src/app/color.ts";

// The colour mixer's two conversions. They are the seam between what the picker
// shows (a hue strip and a saturation/value field) and what the document stores
// (`#rrggbb`), so a round trip that doesn't land back where it started shows up
// as a swatch that drifts every time it is reopened.

describe("normalizeHex", () => {
  it("accepts the forms a stored or typed colour comes in", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("  #123456 ")).toBe("#123456");
  });

  it("rejects what isn't a colour", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("rebeccapurple")).toBeNull();
  });
});

describe("hsvToHex", () => {
  it("hits the corners of the wheel", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe("#ffffff");
    expect(hsvToHex({ h: 200, s: 0.5, v: 0 })).toBe("#000000");
  });

  it("wraps a hue past the end of the wheel rather than clipping it", () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe("#0000ff");
  });
});

describe("hexToHsv", () => {
  it("round-trips every swatch it is handed", () => {
    for (const hex of [
      "#111827",
      "#ef4444",
      "#f59e0b",
      "#22c55e",
      "#3b82f6",
      "#a855f7",
      "#ffffff",
      "#161a20",
    ]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("reads an unparseable colour as black rather than throwing", () => {
    expect(hexToHsv("nope")).toEqual({ h: 0, s: 0, v: 0 });
  });
});

describe("sameColor", () => {
  it("compares swatches, not spellings", () => {
    expect(sameColor("#AABBCC", "#aabbcc")).toBe(true);
    expect(sameColor("abc", "#aabbcc")).toBe(true);
    expect(sameColor("#aabbcc", "#aabbcd")).toBe(false);
  });
});
