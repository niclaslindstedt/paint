// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page's colour scheme, and the ink that has to stay legible on it.
//
// A sketchpad inside a dark app should be a dark sheet drawn on in light ink —
// a white page in a black shell is a torch in the face, and switching the app
// to a light theme should flip both back. So neither the page colour nor the
// default ink is a fixed constant: both are *resolved* from the canvas theme,
// which by default follows the app's own theme.
//
// The two overrides sit at different levels, and that is deliberate:
//
//   - `canvasTheme` (Settings → Canvas) is a **preference**: auto / light /
//     dark, applying to every drawing that hasn't pinned a colour.
//   - a drawing's `background` is **document state**: pinning a page colour
//     (a warm cream, a black board) travels with the drawing and syncs with it,
//     and is left alone when the app theme changes.

import {
  themeFamily,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";

/** How the page colour is chosen. `auto` follows the app theme. */
export type CanvasTheme = "auto" | "light" | "dark";

/** The page a light canvas paints on, and the ink that reads on it. */
export const LIGHT_PAGE = "#ffffff";
export const LIGHT_INK = "#111827";

/** The dark sheet, and its ink. The page is deliberately a step lighter than
 *  the app's own surfaces so it still reads as a sheet laid on the shell rather
 *  than a hole in it. Both default inks are also toolbar swatches, so the
 *  swatch row shows the active colour as selected before anything is picked. */
export const DARK_PAGE = "#161a20";
export const DARK_INK = "#ffffff";

/** Perceived lightness of a `#rgb` / `#rrggbb` colour, 0 (black) to 1 (white).
 *  The sRGB luma weights are close enough for a light-or-dark decision and
 *  need no colour-space conversion. */
export function lightness(hex: string): number {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return 1;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Whether a colour is dark enough to need light ink on it. */
export function isDarkColor(hex: string): boolean {
  return lightness(hex) < 0.5;
}

/** Whether the app itself is currently painting dark.
 *
 *  A preset names its own family; `system` defers to the OS; a custom theme
 *  names nothing, so we read the lightness of the page colour it was built
 *  from — the one honest signal a hand-rolled palette carries. */
export function isDarkAppearance(appearance: ThemeAppearance): boolean {
  const family = themeFamily(appearance.theme);
  if (family === "dark") return true;
  if (family === "light") return false;
  if (family === "custom") {
    const pageBg = appearance.customTheme?.colors.pageBg;
    return pageBg ? isDarkColor(pageBg) : true;
  }
  // `system`: ask the OS. In a non-browser context (a test) assume dark, which
  // is this app's own default look.
  return typeof window === "undefined" || !window.matchMedia
    ? true
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolve the canvas theme preference against the app's appearance. */
export function isDarkCanvas(
  canvasTheme: CanvasTheme,
  appearance: ThemeAppearance,
): boolean {
  if (canvasTheme === "light") return false;
  if (canvasTheme === "dark") return true;
  return isDarkAppearance(appearance);
}

/** The page colour to paint: the drawing's own pinned colour when it has one,
 *  otherwise the canvas theme's sheet. */
export function resolvePageColor(
  background: string | undefined,
  dark: boolean,
): string {
  return background ?? (dark ? DARK_PAGE : LIGHT_PAGE);
}

/** The ink to draw with: the user's picked colour when they have picked one,
 *  otherwise the default that reads on this page. Picking a colour is explicit
 *  — until then the ink flips with the page rather than disappearing into it. */
export function resolveInk(color: string | null, dark: boolean): string {
  return color ?? defaultInk(dark);
}

/** The default ink for a light or dark page. */
export function defaultInk(dark: boolean): string {
  return dark ? DARK_INK : LIGHT_INK;
}
