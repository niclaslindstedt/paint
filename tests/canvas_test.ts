// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  DARK_INK,
  DARK_PAGE,
  LIGHT_INK,
  LIGHT_PAGE,
  PAGE_SWATCHES,
  isDarkAppearance,
  isDarkColor,
  lightness,
  resolveInk,
  resolvePageColor,
} from "../src/app/canvas.ts";
import {
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
  DEFAULT_THEME_APPEARANCE,
} from "@niclaslindstedt/oss-framework/theme";
import { APP_LOOK } from "../src/app/look.ts";

// A hand-rolled palette — what a user builds under Appearance → Custom. The app
// no longer *boots* on one (see `look.ts`), but a custom theme still has to
// resolve to a page colour, so the rule is pinned against an explicit one.
const CUSTOM_DARK = {
  ...DEFAULT_THEME_APPEARANCE,
  theme: "custom" as const,
  customTheme: {
    colors: { ...DEFAULT_CUSTOM_THEME_COLORS_DARK, pageBg: "#000000" },
  },
};

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
    // A custom palette names no family, so the page colour it was built from is
    // the one honest signal about whether it paints dark.
    expect(isDarkAppearance(CUSTOM_DARK)).toBe(true);
    expect(
      isDarkAppearance({
        ...CUSTOM_DARK,
        customTheme: {
          colors: { ...CUSTOM_DARK.customTheme.colors, pageBg: "#fafafa" },
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

describe("APP_LOOK", () => {
  // The look the app boots in. It is deliberately *not* a Custom palette: a
  // custom theme names no family, so it can never follow the OS, and it
  // occupies the one Appearance slot the user's own palette belongs in.
  it("follows the system colour scheme rather than pinning a palette", () => {
    expect(APP_LOOK.theme).toBe("system");
    expect(APP_LOOK.customTheme).toEqual(DEFAULT_THEME_APPEARANCE.customTheme);
  });
});

describe("PAGE_SWATCHES", () => {
  // The page colours the new-image dialog offers. They are written onto the
  // drawing and read straight back by `resolvePageColor`, so each has to be a
  // colour the ink rule can answer for — and the shelf has to carry both kinds
  // of page, or "pin a colour" would only ever mean "go lighter".
  it("are hex colours the ink rule can read", () => {
    for (const swatch of PAGE_SWATCHES) {
      expect(swatch).toMatch(/^#[0-9a-f]{6}$/);
      expect(resolvePageColor(swatch, true)).toBe(swatch);
      expect(resolvePageColor(swatch, false)).toBe(swatch);
    }
  });

  it("offer both light and dark sheets", () => {
    expect(PAGE_SWATCHES.some((s) => isDarkColor(s))).toBe(true);
    expect(PAGE_SWATCHES.some((s) => !isDarkColor(s))).toBe(true);
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
