// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { afterEach, describe, expect, it } from "vitest";

import {
  DARK_INK,
  DARK_PAGE,
  LIGHT_INK,
  LIGHT_PAGE,
  PAGE_SWATCHES,
  isDarkAppearance,
  isDarkColor,
  lightness,
  pageColorName,
  resolveInk,
  resolvePageColor,
} from "../src/app/canvas.ts";
import { SHIPPED_DEFAULTS, setPaintDefaults } from "../src/app/defaults.ts";
import { en } from "../src/app/i18n/en.ts";
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
    for (const { color } of PAGE_SWATCHES) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(resolvePageColor(color, true)).toBe(color);
      expect(resolvePageColor(color, false)).toBe(color);
    }
  });

  it("offer both light and dark sheets", () => {
    expect(PAGE_SWATCHES.some((s) => isDarkColor(s.color))).toBe(true);
    expect(PAGE_SWATCHES.some((s) => !isDarkColor(s.color))).toBe(true);
  });

  // The dialog prints the name of the sheet in hand under the swatch row, so
  // every swatch needs one and it has to resolve in the catalog — a key that
  // doesn't would print itself at the user.
  it("each carry a name the catalog can resolve", () => {
    for (const { color, nameKey } of PAGE_SWATCHES) {
      const text = nameKey
        .split(".")
        .reduce<unknown>(
          (at, part) => (at as Record<string, unknown>)?.[part],
          en,
        );
      expect(typeof text, color).toBe("string");
    }
  });

  it("has one name per colour, and none for a colour it doesn't offer", () => {
    for (const swatch of PAGE_SWATCHES) {
      expect(pageColorName(swatch.color)).toBe(swatch.nameKey);
    }
    // A page from an older build, or one that arrived inside somebody else's
    // `.pct`, is a colour we can paint and cannot name.
    expect(pageColorName("#123456")).toBeUndefined();
    expect(pageColorName(undefined)).toBeUndefined();
  });
});

// The three-step resolution — the drawing, then the app's defaults, then the
// theme — is the whole of what decides which sheet is painted, so each step is
// pinned separately.
describe("resolvePageColor", () => {
  afterEach(() => setPaintDefaults(SHIPPED_DEFAULTS));

  it("paints the default page when the drawing pins nothing", () => {
    expect(resolvePageColor(undefined, true)).toBe(SHIPPED_DEFAULTS.page);
    expect(resolvePageColor(undefined, false)).toBe(SHIPPED_DEFAULTS.page);
  });

  it("falls back to the theme's sheet when the default follows it", () => {
    setPaintDefaults({ ...SHIPPED_DEFAULTS, page: null });
    expect(resolvePageColor(undefined, true)).toBe(DARK_PAGE);
    expect(resolvePageColor(undefined, false)).toBe(LIGHT_PAGE);
  });

  it("lets a pinned colour win over both", () => {
    expect(resolvePageColor("#fef3c7", true)).toBe("#fef3c7");
    setPaintDefaults({ ...SHIPPED_DEFAULTS, page: "#ffffff" });
    expect(resolvePageColor("#fef3c7", false)).toBe("#fef3c7");
  });
});

describe("resolveInk", () => {
  afterEach(() => setPaintDefaults(SHIPPED_DEFAULTS));

  it("defaults to the ink that reads on the page", () => {
    expect(resolveInk(null, true)).toBe(DARK_INK);
    expect(resolveInk(null, false)).toBe(LIGHT_INK);
  });

  it("keeps a picked colour on either page", () => {
    expect(resolveInk("#22c55e", true)).toBe("#22c55e");
    expect(resolveInk("#22c55e", false)).toBe("#22c55e");
  });

  it("uses the default ink on a page it reads on", () => {
    setPaintDefaults({ ...SHIPPED_DEFAULTS, ink: "#1e3a8a" });
    expect(resolveInk(null, false)).toBe("#1e3a8a");
    setPaintDefaults({ ...SHIPPED_DEFAULTS, ink: "#22c55e" });
    expect(resolveInk(null, true)).toBe("#22c55e");
  });

  // The one case a default ink may not have: a mark the page swallows. A black
  // default on a black page is not a colour, it is a lost stroke.
  it("stands the default down when it would vanish into the page", () => {
    setPaintDefaults({ ...SHIPPED_DEFAULTS, ink: "#000000" });
    expect(resolveInk(null, true)).toBe(DARK_INK);
    expect(resolveInk(null, false)).toBe("#000000");
    setPaintDefaults({ ...SHIPPED_DEFAULTS, ink: "#fefefe" });
    expect(resolveInk(null, false)).toBe(LIGHT_INK);
  });

  // The shipped answers are the app's two constants, not colours of their own:
  // a white page and the ink the toolbar's dark swatch carries, so the swatch
  // row shows the ink in hand as selected before anything is picked.
  it("ships the app's own white sheet and near-black ink", () => {
    expect(SHIPPED_DEFAULTS.page).toBe(LIGHT_PAGE);
    expect(SHIPPED_DEFAULTS.ink).toBe(LIGHT_INK);
  });
});
