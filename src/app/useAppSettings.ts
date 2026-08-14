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
import {
  DOWNLOAD_FORMATS,
  type DownloadFormat,
  type ExportScope,
} from "./export.ts";
import {
  allPlugins,
  defaultEnabledPlugins,
  pluginById,
} from "./plugins/registry.ts";
import { DEFAULT_TEXT_FONT, TEXT_FONTS } from "./plugins/builtin/text.ts";
import type { PaintPlugin } from "./plugins/types.ts";

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
  /** How wide each tool draws, by tool id — the nib the size button sets.
   *
   *  Per tool because that is what a width *is*: a pencil, a paintbrush and a
   *  line of type share the word and nothing else, and one shared number meant
   *  fattening the brush fattened the pencil with it. Sparse — a tool nobody has
   *  resized has no entry and opens at the width its plugin declares
   *  (`PaintPlugin.defaultSize`), so the kit out of the box is the one its
   *  makers chose rather than one number applied to fifteen tools. */
  toolSizes: Record<string, number>;
  /** Nib widths the user added to the ones the picker ships with, in document
   *  pixels. Kept sorted, capped at `MAX_CUSTOM_SIZES`, and shared across the
   *  tools — a width you went to the trouble of keeping is yours, not one
   *  tool's. */
  customSizes: number[];
  /** The typeface the text tool is set in — an id from `TEXT_FONTS` (see
   *  `plugins/builtin/text.ts`). Kept here rather than on the plugin because it
   *  is a *choice*, and it should still be the one you made last time. */
  textFont: string;
  textBold: boolean;
  textItalic: boolean;
  /** How each tool is tuned, by tool id and then by dial id — the sliders
   *  behind **Advanced** in the size panel (see `plugins/dials.ts`).
   *
   *  Sparse twice over: a tool nobody has tuned has no entry, and a dial left
   *  where it rests is not written. So this is `{}` for most installs, and the
   *  ones it does hold read as "the ways this person's kit differs from the
   *  box". Kept per tool because that is what a dial *is* — a paintbrush's
   *  hardness and an airbrush's are the same word for two different things, and
   *  one shared number made tuning either of them retune the other. */
  toolDials: Record<string, Record<string, number>>;
  /** Whether shape tools fill rather than outline. */
  filled: boolean;
  /** Paint the canvas over a grid, so a sketch of boxes and arrows lines up. */
  showGrid: boolean;
  /** Name the tool over the middle of the page for a moment when you pick one.
   *  The toolbar's glyphs are small and several tools draw a similar mark, so
   *  the label is what tells a marker from a crayon without a trial stroke —
   *  switchable off for anyone who finds it in the way. */
  showToolName: boolean;
  /** The file types the download menu offers, in menu order. Switching one off
   *  hides it from the menu; the menu's "copy to clipboard" is always there, so
   *  even an empty list leaves a way out. */
  downloadFormats: DownloadFormat[];
  /** Whether a download covers the whole page or crops to the marks. */
  downloadScope: ExportScope;
  /** Whether a download leaves the page unpainted, so the marks land on
   *  transparency. JPG can't — it has no alpha channel. */
  downloadTransparent: boolean;
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
 *  without looking; anything else the user adds themselves.
 *
 *  A tool with a scale of its own (the text tool's type sizes) declares its own
 *  row instead — see `PaintPlugin.sizes`. */
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
 *      default, the shape tools moved off it.
 *  3 — the paint-program toolbox: type and the three shapes on by default, and
 *      every tool opening at a width of its own.
 *  4 — the airbrush takes the brush's place in that toolbox: it is the spray
 *      can every paint program ships, where the bristle brush is this app's own
 *      idea of one. */
export const SETTINGS_VERSION = 4;

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
  // Empty on purpose: an unresized tool opens at the width its own plugin
  // declares, so this only ever holds the ways your kit differs from the box.
  toolSizes: {},
  customSizes: [],
  textFont: DEFAULT_TEXT_FONT,
  textBold: false,
  textItalic: false,
  // Every tool as its maker intended out of the box — a brush that feathers,
  // a crayon pressed light, are choices, and they should be ones you made.
  toolDials: {},
  filled: false,
  showGrid: false,
  // On out of the box: the first thing a new user does is try the tools, and a
  // rack of unlabelled glyphs is exactly where a name earns its keep. It costs
  // a second of a corner of the page and can be switched off in Canvas.
  showToolName: true,
  // All three file types out of the box: the download menu is where you
  // *discover* that a sketch can leave as an SVG, and hiding one is the unusual
  // choice.
  downloadFormats: [...DOWNLOAD_FORMATS],
  // The whole page, opaque — a downloaded sketch then reads the way it did on
  // screen wherever it is pasted, including somewhere that paints its own dark
  // backdrop behind it.
  downloadScope: "page",
  downloadTransparent: false,
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

/** Clean a persisted map of per-tool widths. A width for a tool this build no
 *  longer ships is kept for the same reason a tuning is — downgrading and
 *  upgrading again shouldn't forget how you had it set — but a value that isn't
 *  a usable width at all is dropped, because the picker can't recover from one. */
function toolSizes(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return out;
  }
  for (const [tool, size] of Object.entries(value)) {
    if (typeof size !== "number" || !Number.isFinite(size)) continue;
    if (size <= 0 || size > MAX_SIZE) continue;
    out[tool] = size;
  }
  return out;
}

/** Clean a persisted map of tool tunings, and fold in the one setting this
 *  replaced.
 *
 *  Only the shape is checked here, not the ranges: a dial's bounds belong to
 *  the plugin that declares it, and `resolveDials` clamps against them at every
 *  read — so a value for a tool this build no longer ships, or a dial it has
 *  since dropped, is *kept* rather than pruned. Downgrading and upgrading again
 *  shouldn't silently forget how you had your brush set.
 *
 *  `legacy` is the old global hardness slider, which every soft-edged tool used
 *  to share. A blob written before dials existed carries one number for all of
 *  them, so it is handed to each tool that offers a hardness dial today — once,
 *  and only when that tool has no tuning of its own to overwrite. */
function toolDials(
  value: unknown,
  legacy: unknown,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [tool, dials] of Object.entries(value)) {
      if (typeof dials !== "object" || dials === null) continue;
      const kept: Record<string, number> = {};
      for (const [dial, at] of Object.entries(dials as object)) {
        if (typeof at === "number" && Number.isFinite(at)) kept[dial] = at;
      }
      if (Object.keys(kept).length > 0) out[tool] = kept;
    }
  }
  if (typeof legacy === "number" && Number.isFinite(legacy) && legacy !== 1) {
    const hardness = Math.max(0, Math.min(1, legacy));
    for (const plugin of allPlugins()) {
      if (!plugin.dials?.some((d) => d.id === "hardness")) continue;
      if (out[plugin.id]?.hardness !== undefined) continue;
      out[plugin.id] = { ...out[plugin.id], hardness };
    }
  }
  return out;
}

/** Read a persisted settings blob back into a whole `AppSettings`.
 *
 *  Exported for the tests: it is the one place an install carries state across
 *  upgrades, so what it does with a blob written by an older build (or a
 *  half-written one) is worth pinning down. The app reaches it through
 *  `useAppSettings`. */
export function parseSettings(raw: string): AppSettings {
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
  merged.toolSizes = toolSizes(stored.toolSizes);
  // …and drop the one width every tool used to share. It is deliberately *not*
  // folded into the per-tool map: it was one number standing in for fifteen, and
  // seeding it everywhere would hand an upgrading install the very thing this
  // replaced — a paintbrush set to a pencil's width — instead of the widths each
  // tool now declares for itself.
  delete (merged as { size?: number }).size;
  merged.toolDials = toolDials(stored.toolDials, stored.hardness);
  if (!TEXT_FONTS.some((f) => f.id === merged.textFont)) {
    merged.textFont = base.textFont;
  }
  merged.textBold = Boolean(merged.textBold);
  merged.textItalic = Boolean(merged.textItalic);
  // …and drop the field it was folded in from, so the next write is the last
  // time this install carries it. Left in place it would be re-seeded on every
  // load, which would quietly undo resetting a hardness dial back to default.
  delete (merged as { hardness?: number }).hardness;
  if (typeof merged.color !== "string") merged.color = null;
  // A default-*on* flag can't be coerced with `Boolean()` — a blob written
  // before it existed holds `undefined`, which would read as "switched off"
  // and quietly deny an upgrading install the feature it ships on.
  if (typeof merged.showToolName !== "boolean") {
    merged.showToolName = base.showToolName;
  }
  merged.customColors = Array.isArray(merged.customColors)
    ? merged.customColors.filter((c): c is string => typeof c === "string")
    : [];
  merged.customSizes = numbers(merged.customSizes, MAX_SIZE);
  // The download menu renders straight off this list, so an unknown id (a
  // format some newer build offered) is dropped rather than kept: there is
  // nothing this build could show for it.
  merged.downloadFormats = Array.isArray(merged.downloadFormats)
    ? DOWNLOAD_FORMATS.filter((format) =>
        (merged.downloadFormats as unknown[]).includes(format),
      )
    : [...base.downloadFormats];
  if (merged.downloadScope !== "page" && merged.downloadScope !== "marks") {
    merged.downloadScope = base.downloadScope;
  }
  merged.downloadTransparent = Boolean(merged.downloadTransparent);
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

  /** Set the width one tool draws at. Per tool, so the brush you fattened stays
   *  fat and the pencil beside it stays a pencil. */
  const setToolSize = useCallback(
    (tool: string, size: number) =>
      setSettings((prev) => ({
        ...prev,
        toolSizes: { ...prev.toolSizes, [tool]: size },
      })),
    [setSettings],
  );

  /** Remember a nib width. Kept sorted so the picker reads fine-to-broad
   *  however they were added, and silently ignored when it is one of the widths
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

  /** Set one of a tool's dials — the sliders behind **Advanced** in the size
   *  panel. `null` forgets it instead, which is how the panel's reset puts a
   *  tool back to the way it came: the blob only ever holds the dials that are
   *  actually doing something (see `plugins/dials.ts`).
   *
   *  The dial is addressed by tool *and* by dial, because that is what it is:
   *  the paintbrush's hardness and the airbrush's are two different settings
   *  that happen to share a name. */
  const setToolDial = useCallback(
    (tool: string, dial: string, value: number | null) =>
      setSettings((prev) => {
        const kept = { ...prev.toolDials[tool] };
        if (value === null) delete kept[dial];
        else kept[dial] = value;
        const next = { ...prev.toolDials };
        // A tool with nothing left off-default leaves no trace at all, so a
        // reset really does return the blob to what a fresh install writes.
        if (Object.keys(kept).length === 0) delete next[tool];
        else next[tool] = kept;
        return { ...prev, toolDials: next };
      }),
    [setSettings],
  );

  /** Put every dial on one tool back where it started. */
  const resetToolDials = useCallback(
    (tool: string) =>
      setSettings((prev) => {
        if (!prev.toolDials[tool]) return prev;
        const next = { ...prev.toolDials };
        delete next[tool];
        return { ...prev, toolDials: next };
      }),
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
    setToolSize,
    addCustomSize,
    removeCustomSize,
    setToolDial,
    resetToolDials,
  };
}

/** Everything the colour picker offers, in one list: the built-in palette
 *  followed by whatever the user mixed. Kept here beside the palette itself so
 *  the toolbar and any future consumer agree on the order. */
export function paletteFor(settings: AppSettings): string[] {
  return [...PALETTE, ...settings.customColors];
}

/** The widths a tool's size panel offers as buttons, fine to broad: the ones the
 *  tool declares (or the app's three, for the tools that draw an ordinary line)
 *  plus whatever the user kept. */
export function sizesFor(
  plugin: PaintPlugin | undefined,
  customSizes: readonly number[],
): number[] {
  const own = plugin?.sizes ?? SIZES;
  return [...new Set([...own, ...customSizes])].sort((a, b) => a - b);
}

/** How wide `tool` draws right now: the width it was last set to, or the one
 *  its plugin opens at.
 *
 *  The fallback is the plugin's, not the app's, which is the whole point of
 *  making this a function: the toolbar, the canvas and the size panel all ask
 *  here, so "what a tool opens at" is answered in one place by the tool. A tool
 *  this build doesn't ship falls back to the middle of the shared row rather
 *  than to nothing. */
export function toolSize(settings: AppSettings, tool: string): number {
  const stored = settings.toolSizes[tool];
  if (typeof stored === "number" && stored > 0) return stored;
  return pluginById(tool)?.defaultSize ?? SIZES[1];
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
