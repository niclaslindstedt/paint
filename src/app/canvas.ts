// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page's colour scheme, and the ink that has to stay legible on it.
//
// A sketchpad inside a dark app should be a dark sheet drawn on in light ink —
// a white page in a black shell is a torch in the face, and switching the app
// to a light theme should flip both back. So neither the page colour nor the
// default ink is a fixed constant: both are *resolved* from the app's own theme.
//
// A drawing may override the sheet, and that override is **document state**
// rather than a preference: a page colour is picked when the drawing is made
// (see `NewImageModal`), travels with it, syncs with it, and is left alone when
// the app theme changes. There is no app-wide "draw on a dark page" switch —
// a page that follows the theme, and a page that was given a colour of its own,
// are the only two answers, and the second is asked once where every other
// question about what the page *is* is asked.

import {
  themeFamily,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";

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

/** The page colours a drawing can be given, beside no page at all.
 *
 *  Three light sheets and three dark ones: plain white, a cool paper, a warm
 *  cream, the app's own dark sheet, true black, and a slate. Short on purpose —
 *  the choice is made while a drawing is being created, and a page of swatches
 *  there is a catalogue rather than a decision. */
export const PAGE_SWATCHES = [
  "#ffffff",
  "#f8fafc",
  "#fef3c7",
  "#161a20",
  "#000000",
  "#0f172a",
] as const;

// --- Nothing at all ---------------------------------------------------------
//
// A page can also have **no** colour: the sheet is switched off and the marks
// land on transparency (see `layers.ts` — it is the background layer's eye, so
// there is one answer rather than two). That is the default a new image is made
// with, because an image is as often something to be dropped onto a page
// somebody else owns as it is a sketch on a sheet of its own.
//
// Nothing can be *drawn* for "no colour", so it is drawn as the convention
// every image editor uses instead: a chequerboard, which is unmistakably not a
// colour because no page is ever two colours in squares. It is a **view** —
// painted by the screen, never by an export, exactly like the grid.

/** How big one square of the transparency chequer is, in document pixels. */
export const CHECKER_SQUARE = 12;

/** The two squares, on a light app and on a dark one. Kept dim and close
 *  together: it has to read as "there is nothing here" behind whatever is drawn
 *  over it, not as a pattern somebody chose. */
export const CHECKER_LIGHT = ["#ffffff", "#e2e5ea"] as const;
export const CHECKER_DARK = ["#20242b", "#181b21"] as const;

/** The chequer for the app as it is currently painting. */
export function checkerColors(dark: boolean): readonly [string, string] {
  return dark ? CHECKER_DARK : CHECKER_LIGHT;
}

/** The page colour to paint **when there is one**: the drawing's own pinned
 *  colour, or the sheet the app theme calls for.
 *
 *  Whether there is one at all is a separate question, and not this function's:
 *  a page with its sheet switched off is never filled, and the answer here is
 *  only what it would go back to (see `layers.ts`). */
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
