// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  DEFAULT_THEME_APPEARANCE,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";

// The look the app boots in: **System** — the framework theme that follows the
// OS colour scheme, painting dark under `prefers-color-scheme: dark` and light
// otherwise.
//
// It used to boot on a hand-rolled Custom palette (pure black, amber accent).
// A custom theme is the wrong default: it names no family, so it can't follow
// the system at all — a phone in light mode still opened a black app — and it
// silently occupies the one Appearance slot a user's own palette belongs in, so
// editing "Custom" meant editing the app's shipped look. `system` gives the
// right first impression on both kinds of device, and the Appearance settings
// tab still swaps to any preset (or to a Custom palette of the user's own).
//
// The canvas follows: `canvasTheme: "auto"` resolves through
// `isDarkAppearance`, which for `system` asks the OS — so a light phone opens a
// white page in dark ink and a dark one a dark sheet in light ink.
export const APP_LOOK: ThemeAppearance = {
  ...DEFAULT_THEME_APPEARANCE,
  theme: "system",
};
