// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback } from "react";

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import {
  BACKDROP_BLUR_PX,
  BACKDROP_DARKNESS,
  type BackdropBlurPreset,
  type BackdropDarknessPreset,
} from "@niclaslindstedt/oss-framework/theme";

import type { CanvasTheme } from "./canvas.ts";

// The app's own (non-theme) settings — how the side menu opens, which optional
// tool plugins are switched on, the last-used ink, developer mode, and log
// capture. The framework deliberately leaves this in the app; it only owns the
// appearance projection. (The active *language* is owned by the framework i18n
// runtime — see `i18n/index.ts`.) Persisted to localStorage so a reload keeps
// your choices.

export type MenuMode = "swipe" | "button";

/** How far the page behind an open dialog is dimmed / blurred. The presets (and
 *  their values) are the framework theme engine's. */
export type BackdropDarkness = BackdropDarknessPreset;
export type BackdropBlur = BackdropBlurPreset;

export type AppSettings = {
  menuMode: MenuMode;
  devMode: boolean;
  captureLogs: boolean;
  /** The optional tool plugins the user has switched on. Core tools are always
   *  available and never listed here — see `plugins/registry.ts`. Unknown ids
   *  (a plugin this build no longer ships) are kept rather than pruned, so
   *  downgrading and upgrading again doesn't silently forget a choice. */
  enabledPlugins: string[];
  /** The tool the canvas opens with — the last one used. */
  activeTool: string;
  /** Whether the page is a light sheet or a dark one. `auto` follows the app
   *  theme, so a dark app draws on a dark page in light ink. */
  canvasTheme: CanvasTheme;
  /** The ink the toolbar opens with, or `null` for "whatever reads on this
   *  page" — which flips with the canvas theme. Picking a swatch pins it. */
  color: string | null;
  size: number;
  /** Whether shape tools fill rather than outline. */
  filled: boolean;
  /** Paint the canvas over a grid, so a sketch of boxes and arrows lines up. */
  showGrid: boolean;
  modalBackdropDarkness: BackdropDarkness;
  modalBackdropBlur: BackdropBlur;
};

/** The palette the toolbar swatches offer — a small, high-contrast set that
 *  reads on a light page, a dark page, and a projector. Near-black and white
 *  bookend it so either page colour has an obvious "just ink" choice. */
export const PALETTE = [
  "#111827",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
] as const;

/** The stroke widths the toolbar offers, in document pixels. */
export const SIZES = [2, 4, 8, 16] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  // The discoverable default on phones: a floating sidebar button. Switching to
  // "swipe" hides it and opens the drawer with an inward edge swipe instead.
  menuMode: "button",
  devMode: false,
  captureLogs: false,
  // No optional tools out of the box: the toolbar starts as the five core ones
  // so a first run isn't a wall of buttons. Settings → Tools adds the rest.
  enabledPlugins: [],
  activeTool: "pencil",
  // Follow the app theme out of the box: a dark app opens a dark sheet, a light
  // one a white sheet, and the default ink flips with it.
  canvasTheme: "auto",
  color: null,
  size: SIZES[1],
  filled: false,
  showGrid: false,
  // The dialog backdrop dims the page to 50% black (the framework's original
  // look) and adds no blur out of the box — both are tunable in Appearance.
  modalBackdropDarkness: "medium",
  modalBackdropBlur: "none",
};

const STORAGE_KEY = "paint:settings";

function parseSettings(raw: string): AppSettings {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_SETTINGS;
  }
  const stored = parsed as Record<string, unknown>;
  const merged = { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
  // Guard the two fields a hand-edited or half-written blob could break in a
  // way the UI can't recover from on its own.
  if (!Array.isArray(merged.enabledPlugins)) {
    merged.enabledPlugins = [...DEFAULT_SETTINGS.enabledPlugins];
  } else {
    merged.enabledPlugins = merged.enabledPlugins.filter(
      (id): id is string => typeof id === "string",
    );
  }
  if (typeof merged.size !== "number" || merged.size <= 0) {
    merged.size = DEFAULT_SETTINGS.size;
  }
  if (typeof merged.color !== "string") merged.color = null;
  return merged;
}

export function useAppSettings() {
  // The framework hook owns the persistence mechanics (safe parse,
  // write-through); this store owns the key and the settings shape.
  const [settings, setSettings] = useLocalStorageState<AppSettings>(
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    { parse: parseSettings },
  );

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
      setSettings((prev) => ({ ...prev, [key]: value })),
    [setSettings],
  );

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [setSettings]);

  /** Switch one optional tool plugin on or off. */
  const setPluginEnabled = useCallback(
    (id: string, enabled: boolean) =>
      setSettings((prev) => ({
        ...prev,
        enabledPlugins: enabled
          ? prev.enabledPlugins.includes(id)
            ? prev.enabledPlugins
            : [...prev.enabledPlugins, id]
          : prev.enabledPlugins.filter((p) => p !== id),
      })),
    [setSettings],
  );

  return { settings, update, reset, setSettings, setPluginEnabled };
}

// --- Settings → modal backdrop projection ------------------------------------
// The dialog backdrop's darkness and blur live in the app's own settings blob
// (not the framework's `ThemeAppearance`), so the app projects them onto
// `<html>` itself — but the preset names, their values, and the CSS variables
// are the framework theme engine's, so the scrim rule in `styles.css` reads
// exactly what `applyUiStyle` would write.
export function applyBackdropVars(
  s: AppSettings,
  el: HTMLElement = document.documentElement,
): void {
  el.style.setProperty(
    "--modal-backdrop-darkness",
    BACKDROP_DARKNESS[s.modalBackdropDarkness],
  );
  el.style.setProperty(
    "--modal-backdrop-blur",
    BACKDROP_BLUR_PX[s.modalBackdropBlur],
  );
}
