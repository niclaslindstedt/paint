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
import { defaultEnabledPlugins } from "./plugins/registry.ts";

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
  /** Which set of defaults this blob has already been seeded with. Bumped when
   *  a release changes what is switched on out of the box; `parseSettings`
   *  folds the new defaults into an older blob exactly once, so an existing
   *  install picks up a newly-shipped default tool without a fresh install
   *  having to un-choose the ones it deliberately switched off. */
  settingsVersion: number;
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
  /** Colours the user mixed for themselves, kept beside the built-in palette in
   *  the colour picker. Most recent first, capped at `MAX_CUSTOM_COLORS`. */
  customColors: string[];
  size: number;
  /** Nib widths the user added to the three the picker ships with, in document
   *  pixels. Kept sorted, capped at `MAX_CUSTOM_SIZES`. */
  customSizes: number[];
  /** How crisp the soft-edged brushes are, 0 (an airbrushed fade) to 1 (a hard
   *  edge). Only the tools that advertise `supportsHardness` read it. */
  hardness: number;
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

/** The three nib widths the size picker offers out of the box, in document
 *  pixels — fine, medium, broad. Three is what fits a picker you can hit
 *  without looking; anything else the user adds themselves. */
export const SIZES = [2, 6, 16] as const;

/** How many colours and sizes a user can keep. Both pickers are meant to be hit
 *  by thumb without reading, so the lists stay short enough to stay scannable —
 *  adding past the cap drops the oldest rather than refusing. */
export const MAX_CUSTOM_COLORS = 12;
export const MAX_CUSTOM_SIZES = 6;

/** The widest nib the size picker will take. Past this a stroke is a fill with
 *  extra steps, and the preview stops meaning anything. */
export const MAX_SIZE = 96;

/** The current shape of the shipped defaults (see `AppSettings.settingsVersion`).
 *
 *  1 — the original five-tool toolbar.
 *  2 — the brush shelf: paintbrush, airbrush, bucket and dropper on by
 *      default, the shape tools moved off it. */
export const SETTINGS_VERSION = 2;

/** Everything a fresh install starts from *except* which tools are switched on
 *  — that one comes from the registry, so it can't be a constant here (see
 *  `defaultSettings`). */
const BASE_SETTINGS: Omit<AppSettings, "enabledPlugins"> = {
  // The discoverable default on phones: a floating sidebar button. Switching to
  // "swipe" hides it and opens the drawer with an inward edge swipe instead.
  menuMode: "button",
  devMode: false,
  captureLogs: false,
  settingsVersion: SETTINGS_VERSION,
  activeTool: "pencil",
  // Follow the app theme out of the box: a dark app opens a dark sheet, a light
  // one a white sheet, and the default ink flips with it.
  canvasTheme: "auto",
  color: null,
  customColors: [],
  size: SIZES[1],
  customSizes: [],
  // A hard edge out of the box: a brush that feathers is a choice, and it
  // should be one you made.
  hardness: 1,
  filled: false,
  showGrid: false,
  // The dialog backdrop dims the page to 50% black (the framework's original
  // look) and adds no blur out of the box — both are tunable in Appearance.
  modalBackdropDarkness: "medium",
  modalBackdropBlur: "none",
};

let defaults: AppSettings | null = null;

/** The settings a fresh install starts from.
 *
 *  A function rather than a constant because the default *toolbar* is a
 *  property of the plugin registry — which tools declare themselves `defaultOn`
 *  — and the registry is filled at app start, after this module is imported.
 *  Memoised on first call (and frozen), so it is still a stable value to hand a
 *  hook. */
export function defaultSettings(): AppSettings {
  defaults ??= Object.freeze({
    ...BASE_SETTINGS,
    enabledPlugins: Object.freeze(defaultEnabledPlugins()) as string[],
  });
  return defaults;
}

const STORAGE_KEY = "paint:settings";

/** Clean a persisted list of numbers — a hand-edited or half-written blob is
 *  the only way a bad one gets here, and the pickers can't recover on their
 *  own. */
function numbers(value: unknown, max: number): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (n): n is number => typeof n === "number" && n > 0 && n <= max,
  );
}

function parseSettings(raw: string): AppSettings {
  const base = defaultSettings();
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return base;
  }
  const stored = parsed as Record<string, unknown>;
  const merged = { ...base, ...stored } as AppSettings;
  // Guard the fields a hand-edited or half-written blob could break in a way
  // the UI can't recover from on its own.
  if (!Array.isArray(merged.enabledPlugins)) {
    merged.enabledPlugins = [...base.enabledPlugins];
  } else {
    merged.enabledPlugins = merged.enabledPlugins.filter(
      (id): id is string => typeof id === "string",
    );
  }
  // A blob written before this build's defaults were chosen has never been
  // offered the tools they add, so fold them in — once. After that the list is
  // the user's: a tool they switch off stays off through every later upgrade.
  //
  // Read from `stored`, not from `merged`: the merge has already filled the
  // missing field in from the defaults, so asking `merged` would say every blob
  // was already up to date and no upgrade would ever seed anything.
  const storedVersion =
    typeof stored.settingsVersion === "number" ? stored.settingsVersion : 0;
  if (storedVersion < SETTINGS_VERSION) {
    const seeded = new Set(merged.enabledPlugins);
    for (const id of defaultEnabledPlugins()) seeded.add(id);
    merged.enabledPlugins = [...seeded];
    merged.settingsVersion = SETTINGS_VERSION;
  }
  if (typeof merged.size !== "number" || merged.size <= 0) {
    merged.size = base.size;
  }
  if (typeof merged.hardness !== "number" || Number.isNaN(merged.hardness)) {
    merged.hardness = base.hardness;
  } else {
    merged.hardness = Math.max(0, Math.min(1, merged.hardness));
  }
  if (typeof merged.color !== "string") merged.color = null;
  merged.customColors = Array.isArray(merged.customColors)
    ? merged.customColors.filter((c): c is string => typeof c === "string")
    : [];
  merged.customSizes = numbers(merged.customSizes, MAX_SIZE);
  return merged;
}

export function useAppSettings() {
  // The framework hook owns the persistence mechanics (safe parse,
  // write-through); this store owns the key and the settings shape.
  const [settings, setSettings] = useLocalStorageState<AppSettings>(
    STORAGE_KEY,
    defaultSettings(),
    { parse: parseSettings },
  );

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
      setSettings((prev) => ({ ...prev, [key]: value })),
    [setSettings],
  );

  const reset = useCallback(
    () => setSettings(defaultSettings()),
    [setSettings],
  );

  /** Remember a colour the user mixed, newest first. Re-adding one it already
   *  holds moves it to the front rather than duplicating it. */
  const addCustomColor = useCallback(
    (color: string) =>
      setSettings((prev) => ({
        ...prev,
        customColors: [
          color,
          ...prev.customColors.filter((c) => c !== color),
        ].slice(0, MAX_CUSTOM_COLORS),
      })),
    [setSettings],
  );

  const removeCustomColor = useCallback(
    (color: string) =>
      setSettings((prev) => ({
        ...prev,
        customColors: prev.customColors.filter((c) => c !== color),
      })),
    [setSettings],
  );

  /** Remember a nib width. Kept sorted so the picker reads fine-to-broad
   *  however they were added, and silently ignored when it is one of the three
   *  the picker already offers. */
  const addCustomSize = useCallback(
    (size: number) =>
      setSettings((prev) => {
        const rounded = Math.round(Math.max(1, Math.min(MAX_SIZE, size)));
        if (
          (SIZES as readonly number[]).includes(rounded) ||
          prev.customSizes.includes(rounded)
        ) {
          return prev;
        }
        return {
          ...prev,
          customSizes: [...prev.customSizes, rounded]
            .sort((a, b) => a - b)
            .slice(0, MAX_CUSTOM_SIZES),
        };
      }),
    [setSettings],
  );

  const removeCustomSize = useCallback(
    (size: number) =>
      setSettings((prev) => ({
        ...prev,
        customSizes: prev.customSizes.filter((s) => s !== size),
      })),
    [setSettings],
  );

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

  return {
    settings,
    update,
    reset,
    setSettings,
    setPluginEnabled,
    addCustomColor,
    removeCustomColor,
    addCustomSize,
    removeCustomSize,
  };
}

/** Everything the colour picker offers, in one list: the built-in palette
 *  followed by whatever the user mixed. Kept here beside the palette itself so
 *  the toolbar and any future consumer agree on the order. */
export function paletteFor(settings: AppSettings): string[] {
  return [...PALETTE, ...settings.customColors];
}

/** Every nib width on offer, fine to broad: the three the picker ships with
 *  plus the user's own. */
export function sizesFor(settings: AppSettings): number[] {
  return [...new Set([...SIZES, ...settings.customSizes])].sort(
    (a, b) => a - b,
  );
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
