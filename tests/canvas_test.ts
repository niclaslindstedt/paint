// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  DARK_INK,
  DARK_PAGE,
  LIGHT_INK,
  LIGHT_PAGE,
  isDarkAppearance,
  isDarkCanvas,
  isDarkColor,
  lightness,
  resolveInk,
  resolvePageColor,
} from "../src/app/canvas.ts";
import { DEFAULT_THEME_APPEARANCE } from "@niclaslindstedt/oss-framework/theme";
import { APP_LOOK } from "../src/app/look.ts";

// The canvas theme decides what the page is and what reads on it, so these are
// the rules the screen, the export, and the settings tab all lean on.

describe("lightness", () => {
  it("ranks black, mid, and white", () => {
    expect(lightness("#000000")).toBe(0);
    expect(lightness("#ffffff")).toBeCloseTo(1, 5);
    expect(lightness("#808080")).toBeGreaterThan(0.4);
    expect(lightness("#808080")).toBeLessThan(0.6);
  });

  it("expands the three-digit form", () => {
    expect(lightness("#fff")).toBe(lightness("#ffffff"));
  });

  it("calls the app's own surfaces dark", () => {
    expect(isDarkColor("#0b0d10")).toBe(true);
    expect(isDarkColor("#ffffff")).toBe(false);
  });
});

describe("isDarkAppearance", () => {
  it("reads a custom theme's page colour", () => {
    // The app's own look is a black custom palette.
    expect(isDarkAppearance(APP_LOOK)).toBe(true);
    expect(
      isDarkAppearance({
        ...APP_LOOK,
        customTheme: {
          ...APP_LOOK.customTheme!,
          colors: { ...APP_LOOK.customTheme!.colors, pageBg: "#fafafa" },
        },
      }),
    ).toBe(false);
  });

  it("trusts a preset's own family", () => {
    expect(
      isDarkAppearance({ ...DEFAULT_THEME_APPEARANCE, theme: "githubDark" }),
    ).toBe(true);
    expect(
      isDarkAppearance({ ...DEFAULT_THEME_APPEARANCE, theme: "githubLight" }),
    ).toBe(false);
  });
});

describe("isDarkCanvas", () => {
  it("pins light and dark regardless of the app theme", () => {
    expect(isDarkCanvas("light", APP_LOOK)).toBe(false);
    expect(isDarkCanvas("dark", APP_LOOK)).toBe(true);
  });

  it("follows the app theme on auto", () => {
    expect(isDarkCanvas("auto", APP_LOOK)).toBe(true);
    expect(
      isDarkCanvas("auto", {
        ...DEFAULT_THEME_APPEARANCE,
        theme: "githubLight",
      }),
    ).toBe(false);
  });
});

describe("resolvePageColor", () => {
  it("uses the theme's sheet when the drawing pins nothing", () => {
    expect(resolvePageColor(undefined, true)).toBe(DARK_PAGE);
    expect(resolvePageColor(undefined, false)).toBe(LIGHT_PAGE);
  });

  it("lets a pinned colour win over the theme", () => {
    expect(resolvePageColor("#fef3c7", true)).toBe("#fef3c7");
  });
});

describe("resolveInk", () => {
  it("defaults to the ink that reads on the page", () => {
    expect(resolveInk(null, true)).toBe(DARK_INK);
    expect(resolveInk(null, false)).toBe(LIGHT_INK);
  });

  it("keeps a picked colour on either page", () => {
    expect(resolveInk("#22c55e", true)).toBe("#22c55e");
    expect(resolveInk("#22c55e", false)).toBe("#22c55e");
  });
});
