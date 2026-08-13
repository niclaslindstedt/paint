// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
  DEFAULT_THEME_APPEARANCE,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";

// The pure-black, amber-accent look the app boots in — a Custom theme seeded
// from the dark palette with the page/surface slots pushed to black. The dark
// chrome is deliberate: the canvas is a bright page, and a dark frame around it
// keeps the drawing the brightest thing on screen. The accent is amber rather
// than the sibling apps' green so the two are told apart at a glance in a tab
// strip. The Appearance settings tab still swaps to any preset.
export const APP_LOOK: ThemeAppearance = {
  ...DEFAULT_THEME_APPEARANCE,
  theme: "custom",
  customTheme: {
    colors: {
      ...DEFAULT_CUSTOM_THEME_COLORS_DARK,
      pageBg: "#000000",
      surface: "#0b0d10",
      surface2: "#111418",
      surface3: "#171b20",
      fg: "#c9ced6",
      fgBright: "#ffffff",
      muted: "#7c828d",
      line: "#23272e",
      accent: "#fbbf24",
      success: "#86efac",
    },
  },
};
