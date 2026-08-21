// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback } from "react";

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import {
  BACKDROP_BLUR_PX,
  BACKDROP_DARKNESS,
  type BackdropBlurPreset,
  type BackdropDarknessPreset,
} from "@niclaslindstedt/oss-framework/theme";

import { SHIPPED_DEFAULTS } from "./defaults.ts";
import { withDefaults, withPreset } from "./kit.ts";
import {
  cleanCanvasPresets,
  cleanHiddenSizes,
  type CanvasPreset,
} from "./canvasPresets.ts";
import {
  DOWNLOAD_FORMATS,
  type DownloadFormat,
  type ExportScope,
} from "./export.ts";
import { moveInOrder } from "./order.ts";
import {
  ids,
  optional,
  strings,
  toolColors,
  toolDials,
  toolSizes,
} from "./settingsClean.ts";
import { defaultEnabledPlugins, pluginById } from "./plugins/registry.ts";
import { DEFAULT_TEXT_FONT, TEXT_FONTS } from "./plugins/builtin/text.ts";
import {
  DEFAULT_GAUGE,
  MAX_SIZE,
  MIN_SIZE,
  gaugeSizes,
} from "./plugins/gauge.ts";
import type { SizeGauge } from "./plugins/gauge.ts";
import {
  addPreset,
  cleanPresets,
  removePreset,
  type PresetSettings,
  type ToolPreset,
} from "./presets.ts";
import type { PaintPlugin } from "./plugins/types.ts";
import { DEFAULT_LEAD_DETAIL, clampLeadDetail } from "./plugins/lead.ts";
import { DEFAULT_WASH_DETAIL, clampWashDetail } from "./plugins/wash.ts";

// The app's own (non-theme) settings — which optional tool plugins are switched
// on, the last-used ink, developer mode, and log capture. The framework
// deliberately leaves this in the app; it only owns the appearance projection.
// (The active *language* is owned by the framework i18n runtime — see
// `i18n/index.ts`.) Persisted to localStorage so a reload keeps your choices.
//
// What *a* page is made of is deliberately not here: its size, its colour and
// its sheet are answered once when a drawing is created (see `NewImageModal`)
// and stored on the drawing, because a page never reflows and a mark is painted
// into the sheet it was made on. What is here is what a page that answered none
// of those falls back to — the four defaults a fresh start is made of (see
// `defaults.ts`), which are a preference and belong with the preferences.

/** How far the page behind an open dialog is dimmed / blurred. The presets (and
 *  their values) are the framework theme engine's. */
export type BackdropDarkness = BackdropDarknessPreset;
export type BackdropBlur = BackdropBlurPreset;

export type AppSettings = {
  devMode: boolean;
  captureLogs: boolean;
  /** Which set of defaults this blob has already been seeded with. Bumped when
   *  a release changes what is switched on out of the box; `parseSettings`
   *  folds the new defaults into an older blob exactly once, so an existing
   *  install picks up a newly-shipped default tool without a fresh install
   *  having to un-choose the ones it deliberately switched off. */
  settingsVersion: number;
  /** The optional toolbar entries the user has switched on, by entry id — a
   *  plugin id for a lone tool, a **group** id for a family that shares one
   *  switch (the shapes). Core entries are always available and never listed
   *  here — see `plugins/registry.ts`. Unknown ids (a plugin this build no
   *  longer ships) are kept rather than pruned, so downgrading and upgrading
   *  again doesn't silently forget a choice. */
  enabledPlugins: string[];
  /** The toolbar's order, by entry id — what Settings → Tools reorders and the
   *  toolbar renders.
   *
   *  Empty until someone moves a row, and then only as long as the ids it names:
   *  entries it doesn't mention keep the place their plugin registered in, so a
   *  tool added by a later release lands where its maker put it rather than at
   *  the end of an order written before it existed (see `orderEntries`). */
  toolOrder: string[];
  /** The right-hand panel's order, by section id — what Settings → Panel
   *  reorders and what a section dragged by its grip writes.
   *
   *  Empty until someone moves one, and then only as long as the ids it names,
   *  exactly like `toolOrder` and for the same reason (see `order.ts`). */
  panelOrder: string[];
  /** The panel's sections switched off, by section id. Stored as the ones that
   *  are *off*, so a section a later release adds arrives in the panel rather
   *  than hidden from every install that already holds this key. */
  hiddenPanelSections: string[];
  /** The individual things inside those sections switched off — one page action,
   *  one effect, one of the controls on a layer row — by the namespaced item ids
   *  `panelSections.ts` declares. Off-list for the same reason as above. */
  hiddenPanelItems: string[];
  /** The pages you have set up and named — what New image offers beside the
   *  sizes this build ships, and where a page's own kit of tools comes from
   *  (see `canvasPresets.ts`).
   *
   *  Here rather than on a drawing because a canvas preset is a thing you make
   *  *pages with*; what a page then is — its size, its colour, its sheet, and
   *  which canvas preset made it — is written onto the drawing, so deleting a
   *  canvas preset never reaches back into the work done on it. */
  canvasPresets: CanvasPreset[];
  /** The shipped sizes taken off that shelf, by preset id. Stored as the ones
   *  that are *off*, so a size a later release adds arrives on the shelf rather
   *  than hidden from every install that already holds this key. */
  hiddenCanvasSizes: string[];
  /** The tool the canvas opens with — the last one used. */
  activeTool: string;
  /** The tool a fresh start puts in your hand, by plugin id (see
   *  `defaults.ts`). Not the same field as `activeTool`, which is a memory of
   *  what you were last holding: this is the answer the memory is *seeded*
   *  with, and the one an emptied sketchbook goes back to. */
  defaultTool: string;
  /** Which of that tool's presets it opens set to, by preset id — one the tool
   *  ships with (`plugins/presets.ts`) or one you saved (`presets.ts`). `null`
   *  is the tool exactly as its maker built it. */
  defaultPreset: string | null;
  /** The ink a mark is drawn in before a swatch is picked, or `null` to follow
   *  the app theme the way this app used to. */
  defaultColor: string | null;
  /** The colour of a page that pinned none of its own, or `null` to follow the
   *  theme. Out of the box white, on a light app and a dark one alike.
   *
   *  It resolves at paint time rather than being written onto a drawing, so
   *  changing it re-sheets every page that never chose a colour — and touches
   *  none that did (see `canvas.ts`). */
  defaultPageColor: string | null;
  /** Which member of each tool group was last in hand, by group id — the shape
   *  the shapes button wears when you are holding something else.
   *
   *  Kept because a group button has to show *a* tool even when none of its
   *  family is active, and the one you used last is the only defensible answer.
   *  Sparse: a group nobody has picked from opens on its first member. */
  groupTools: Record<string, string>;
  /** The ink the toolbar opens with, or `null` for "whatever reads on this
   *  page" — which flips with the app theme. Picking a swatch pins it. */
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
  /** The kit a user has built for themselves: whole tool settings — a width and
   *  every dial — saved under a name they chose, by tool id.
   *
   *  This is the thing a professional actually wants out of a panel of dials.
   *  Finding the 4B at 0.7 mm under a light hand that a drawing wants is
   *  work, and doing it again tomorrow is the same work; "my sketching pencil"
   *  is one press. Per tool because a preset *is* a tool — "my sketching
   *  pencil" makes no sense applied to the airbrush — and sparse, because most
   *  installs have none. */
  toolPresets: Record<string, ToolPreset[]>;
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
  /** The inks a tool carries of its own, by tool id and then by swatch id — the
   *  colours on its own settings panel (see `plugins/swatches.ts`).
   *
   *  The dials' map one type over: sparse twice, kept per tool because a
   *  swatch *is* per tool, and holding only what differs from the colours the
   *  tool ships with. The gradient's two ends are the only ones today. An empty
   *  string is a value rather than a gap — that is how a swatch that may be
   *  absent (the gradient's middle stop) records being switched off. */
  toolColors: Record<string, Record<string, string>>;
  /** How finely the watercolour simulation resolves, 0.1 to 1 (see
   *  `MIN_WASH_DETAIL`).
   *
   *  A setting rather than a property of a drawing, and deliberately: it is a
   *  *view*, like the canvas theme. A wash painted at one detail repaints at
   *  whichever is in force, so moving it cannot orphan work — and a phone that
   *  cannot afford the full field can still open a page painted at it on a
   *  desktop.
   *
   *  The one setting in the app that buys nothing but speed: the cost of a wash
   *  goes as the square of it, so it is what makes the simulation usable on a
   *  page full of washes, or on an older phone. Set from the watercolour brush's
   *  own panel rather than from a page in Settings: it is a property of the
   *  brush, and it is a trade nobody can judge without painting with it (see
   *  `plugins/washOptions.ts`). */
  washDetail: number;
  /** …and how finely the graphite simulation works a pencil mark out, 0.1 to 1
   *  (see `MIN_LEAD_DETAIL`). The wash's own detail slider one shelf along, held
   *  for the same reasons and set in the same place (see
   *  `plugins/leadOptions.ts`) — and it matters more here, because a page of a
   *  thousand sketch strokes is a thousand fields where a painting is a few
   *  dozen. */
  leadDetail: number;
  /** Whether shape tools fill rather than outline. */
  filled: boolean;
  /** Paint the canvas over a grid, so a sketch of boxes and arrows lines up. */
  showGrid: boolean;
  /** Rule the document's own pixels over the page once the zoom is deep enough
   *  to show them (see `pixelGrid.ts`). Unlike the grid above this is not a
   *  spacing you chose — it is the resolution the drawing will export at — so it
   *  needs no zoom of its own to be set at, only a way to be switched off. */
  showPixelGrid: boolean;
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

/** How many colours a user can keep. The picker is meant to be hit by thumb
 *  without reading, so the list stays short enough to stay scannable — adding
 *  past the cap drops the oldest rather than refusing. */
export const MAX_CUSTOM_COLORS = 12;

// The page's own scale — a document pixel is one dot of an iPhone's screen, so
// a width is a distance you can measure on the glass and a tool can be
// described the way its maker describes it. Both live in `units.ts` / `plugins/gauge.ts`; they are
// re-exported here because this is where the pickers already look.
export { MAX_SIZE, MIN_SIZE };
export { PX_PER_MM } from "./units.ts";

/** The current shape of the shipped defaults (see `AppSettings.settingsVersion`).
 *
 *  1 — the original five-tool toolbar.
 *  2 — the brush shelf: paintbrush, airbrush, bucket and dropper on by
 *      default, the shape tools moved off it.
 *  3 — the paint-program toolbox: type and the three shapes on by default, and
 *      every tool opening at a width of its own.
 *  4 — the airbrush takes the brush's place in that toolbox: it is the spray
 *      can every paint program ships, where the bristle brush is this app's own
 *      idea of one.
 *  5 — the shapes behind one button: eleven of them under a single `shapes`
 *      group, and the selection tool on by default beside the hand. An install
 *      carrying the old per-shape ids keeps them — they simply no longer name
 *      anything switchable — and picks up the group and the marquee here.
 *  6 — the graphite pencil joins the toolbox. A paint program has always had
 *      something to sketch with, and this one only had a pen wearing a pencil's
 *      name; the tool that actually behaves like a pencil ships switched on.
 *  7 — the watercolour brush joins it. Every other tool in the box is one a
 *      paint program has always had; this is the one medium the app has of its
 *      own, and a toolbox that hides it behind a settings page is a toolbox
 *      that never gets it out.
 *  8 — the felt tips take their place: the marker and the highlighter ship
 *      switched on, and the graphite pencil and the watercolour brush go back
 *      behind the settings page they came from. This app is for sketching a
 *      concept, and the two pens a hand reaches for on a page it is thinking on
 *      are a marker and a highlighter; the two tools that *simulate* a medium
 *      are the ones you go and get on purpose, and they are the two that make a
 *      first stroke cost a paper simulation. An install that already has them
 *      keeps them — the seeding only ever adds. */
export const SETTINGS_VERSION = 8;

/** Everything a fresh install starts from *except* which tools are switched on
 *  — that one comes from the registry, so it can't be a constant here (see
 *  `defaultSettings`). */
const BASE_SETTINGS: Omit<AppSettings, "enabledPlugins"> = {
  devMode: false,
  captureLogs: false,
  settingsVersion: SETTINGS_VERSION,
  // Empty on purpose: an untouched toolbar is the one its tools registered in,
  // so this only ever holds the ways your toolbar differs from the box.
  toolOrder: [],
  // Empty on purpose, all three: a fresh install shows every section of the
  // right-hand panel, with everything in it, in the order `panelSections.ts`
  // ships them — so these only ever hold the ways your panel differs from the
  // box.
  panelOrder: [],
  hiddenPanelSections: [],
  hiddenPanelItems: [],
  // Empty on purpose, both of them: a fresh install offers the four sizes it
  // ships with and nothing of its own, so this only ever holds the ways your
  // New image shelf differs from the box.
  canvasPresets: [],
  hiddenCanvasSizes: [],
  activeTool: SHIPPED_DEFAULTS.tool,
  // What a fresh start is: the pen at its liner, black ink, a white page — the
  // same four answers whichever way the theme goes (see `defaults.ts`).
  defaultTool: SHIPPED_DEFAULTS.tool,
  defaultPreset: SHIPPED_DEFAULTS.preset,
  defaultColor: SHIPPED_DEFAULTS.ink,
  defaultPageColor: SHIPPED_DEFAULTS.page,
  groupTools: {},
  color: null,
  customColors: [],
  // Empty on purpose: an unresized tool opens at the width its own plugin
  // declares, so this only ever holds the ways your kit differs from the box.
  toolSizes: {},
  toolPresets: {},
  textFont: DEFAULT_TEXT_FONT,
  textBold: false,
  textItalic: false,
  // Every tool as its maker intended out of the box — a brush that feathers,
  // a crayon pressed light, are choices, and they should be ones you made. The
  // same goes for the inks a tool mixes for itself: the gradient opens on the
  // black-to-white ramp it ships with.
  toolDials: {},
  toolColors: {},
  // All of the watercolour simulation's field: a build that quietly painted a
  // coarser wash than its own sample showed would be lying about its picture.
  // Turning it down is a trade the user makes.
  washDetail: DEFAULT_WASH_DETAIL,
  // …and all of the graphite simulation's, for the same reason.
  leadDetail: DEFAULT_LEAD_DETAIL,
  filled: false,
  showGrid: false,
  // On out of the box, and it costs nothing to be: below its zoom band there is
  // nothing to paint, and above it the lattice is what you zoomed in to work
  // against.
  showPixelGrid: true,
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
  // The toolbar's order and the group memories are both lists of *ids*, and an
  // id this build doesn't know is harmless in both: `orderEntries` ignores one
  // it can't place, and a group whose remembered member has gone opens on its
  // first. So the shape is checked and the contents are left alone — the same
  // "keep what you can't use, in case a downgrade wants it" rule the tunings
  // follow.
  merged.toolOrder = ids(stored.toolOrder);
  // The New image shelf renders straight off these two, and a canvas preset is a
  // button somebody presses Create on — so a half-written one is dropped rather
  // than kept (see `cleanCanvasPresets`). A *drawing* that pointed at it is
  // untouched: it keeps its size and falls back to the app-wide toolbar.
  // The panel's three lists are ids in exactly the same sense, and an id this
  // build doesn't know is harmless in all three: `orderById` ignores one it
  // can't place, and a hidden id that names nothing hides nothing. So the shape
  // is checked and the contents are left alone.
  merged.panelOrder = ids(stored.panelOrder);
  merged.hiddenPanelSections = ids(stored.hiddenPanelSections);
  merged.hiddenPanelItems = ids(stored.hiddenPanelItems);
  merged.canvasPresets = cleanCanvasPresets(stored.canvasPresets);
  merged.hiddenCanvasSizes = cleanHiddenSizes(stored.hiddenCanvasSizes);
  merged.groupTools = strings(stored.groupTools);
  merged.toolSizes = toolSizes(stored.toolSizes);
  // …and drop the one width every tool used to share. It is deliberately *not*
  // folded into the per-tool map: it was one number standing in for fifteen, and
  // seeding it everywhere would hand an upgrading install the very thing this
  // replaced — a paintbrush set to a pencil's width — instead of the widths each
  // tool now declares for itself.
  delete (merged as { size?: number }).size;
  merged.toolDials = toolDials(stored.toolDials, stored.hardness);
  merged.toolColors = toolColors(stored.toolColors);
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
  // The four answers a fresh start is made of. A tool or a preset this build no
  // longer ships is *kept* rather than pruned, the way every other id in here
  // is — `withDefaults` resolves both against what is actually offered at the
  // moment it hands a tool over (see `kit.ts`), so a blob that travelled
  // through a build with more tools in it comes home intact. What is guarded is
  // only the shape: a colour is a string or the "follow the theme" null, and
  // anything else in that field is a blob the app can't paint from.
  if (typeof merged.defaultTool !== "string") {
    merged.defaultTool = base.defaultTool;
  }
  merged.defaultPreset = optional(stored, "defaultPreset", base.defaultPreset);
  merged.defaultColor = optional(stored, "defaultColor", base.defaultColor);
  merged.defaultPageColor = optional(
    stored,
    "defaultPageColor",
    base.defaultPageColor,
  );
  // A default-*on* flag can't be coerced with `Boolean()` — a blob written
  // before it existed holds `undefined`, which would read as "switched off"
  // and quietly deny an upgrading install the feature it ships on.
  if (typeof merged.showToolName !== "boolean") {
    merged.showToolName = base.showToolName;
  }
  merged.customColors = Array.isArray(merged.customColors)
    ? merged.customColors.filter((c): c is string => typeof c === "string")
    : [];
  // …and the widths a user could once "keep" beside their tool's own five.
  // They are gone: a width on its own was a worse version of a saved *tool*,
  // which carries the dials with it and has a name on it (see `presets.ts`).
  // The field is dropped rather than migrated, because a bare number is not
  // enough to build a preset out of — there is no name to give it.
  delete (merged as { customSizes?: unknown }).customSizes;
  // …and the two preferences that used to answer what the *page* was made of.
  // Both are gone: the page's colour is picked when a drawing is created and
  // kept on the drawing (see `NewImageModal`), and a page that follows the app
  // theme is now the only other answer. Neither can be migrated into a document
  // setting — a preference applied to every drawing at once has no one drawing
  // to be written onto — so they are dropped rather than folded in.
  delete (merged as { canvasTheme?: unknown }).canvasTheme;
  // …and the one that chose whether an inward edge swipe opened the drawer. The
  // header's hamburger opens it on every screen, which is the whole answer.
  delete (merged as { menuMode?: unknown }).menuMode;
  merged.toolPresets = cleanPresets(stored.toolPresets);
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
  // A detail off a blob written by another build (or by hand) is pulled back
  // onto the slider's own track: a control cannot show a value that is not one
  // of its own. A blob from a build that still had a `washEngine` or a
  // `leadEngine` in it simply loses them — an unknown key is not carried, and
  // there is no longer an engine for one to have named.
  merged.washDetail = clampWashDetail(merged.washDetail);
  merged.leadDetail = clampLeadDetail(merged.leadDetail);
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

  /** Put the kit back to the defaults — the default tool, set to its default
   *  preset, drawing in the default ink (see `kit.ts`). What deleting the last
   *  sheet reaches for: a sketchbook with nothing in it hands you the same tool
   *  a fresh install would, rather than whatever was in your hand when the last
   *  page went. Everything else in the blob is left alone. */
  const applyDefaults = useCallback(
    () => setSettings((prev) => withDefaults(prev)),
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

  /** Save the tool as it is set right now under a name — "my sketching
   *  pencil". Saving over a name the tool already has replaces it, which is
   *  what everyone means by saving (see `presets.ts`). */
  const savePreset = useCallback(
    (
      tool: string,
      name: string,
      size: number,
      dials: Readonly<Record<string, number>>,
      glyph: string | null = null,
    ) =>
      setSettings((prev) => ({
        ...prev,
        toolPresets: {
          ...prev.toolPresets,
          [tool]: addPreset(
            prev.toolPresets[tool] ?? [],
            name,
            size,
            dials,
            glyph,
          ),
        },
      })),
    [setSettings],
  );

  const deletePreset = useCallback(
    (tool: string, id: string) =>
      setSettings((prev) => {
        const kept = removePreset(prev.toolPresets[tool] ?? [], id);
        const next = { ...prev.toolPresets };
        if (kept.length === 0) delete next[tool];
        else next[tool] = kept;
        return { ...prev, toolPresets: next };
      }),
    [setSettings],
  );

  /** Put a preset in your hand: its width, and every one of its dials.
   *
   *  Takes either kind — one the user saved or one the tool shipped with (see
   *  `PresetSettings`) — because by the time a chip is pressed the difference
   *  between them is a name, and the settings blob has no interest in who chose
   *  it.
   *
   *  Written in one pass rather than as a width followed by a dial at a time,
   *  because a preset is one decision — and because the dials it does *not*
   *  name have to come back to their defaults, which is the half a
   *  slider-by-slider apply would miss (see `ToolPreset.dials`). */
  const applyPreset = useCallback(
    (tool: string, preset: PresetSettings) =>
      setSettings((prev) => withPreset(prev, tool, preset)),
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

  /** Set one of a tool's own inks — a swatch on its settings panel. `null`
   *  forgets it, which is how the panel's reset puts the tool back to the
   *  colours it ships with; the empty string is a *value*, and it is how an
   *  optional swatch is switched off (see `plugins/swatches.ts`). */
  const setToolColor = useCallback(
    (tool: string, swatch: string, color: string | null) =>
      setSettings((prev) => {
        const kept = { ...prev.toolColors[tool] };
        if (color === null) delete kept[swatch];
        else kept[swatch] = color;
        const next = { ...prev.toolColors };
        if (Object.keys(kept).length === 0) delete next[tool];
        else next[tool] = kept;
        return { ...prev, toolColors: next };
      }),
    [setSettings],
  );

  /** Put every dial *and* every ink on one tool back where it started — one
   *  reset, because the panel they sit in is one panel and "the way this tool
   *  ships" is one answer. */
  const resetToolDials = useCallback(
    (tool: string) =>
      setSettings((prev) => {
        if (!prev.toolDials[tool] && !prev.toolColors[tool]) return prev;
        const next = { ...prev.toolDials };
        delete next[tool];
        const colors = { ...prev.toolColors };
        delete colors[tool];
        return { ...prev, toolDials: next, toolColors: colors };
      }),
    [setSettings],
  );

  /** Switch one optional toolbar entry on or off — a lone tool, or a whole
   *  group by its group id. */
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

  /** Move one toolbar entry to `to` in the order — what the up / down buttons in
   *  Settings → Tools send, and what the toolbar then renders.
   *
   *  The caller passes the *whole* current order (every entry, in the order it
   *  is showing them) rather than a delta, because that is the only thing the
   *  stored list can be: a permutation of ids is meaningless without knowing
   *  which entries it is a permutation of, and the settings blob is read by
   *  builds that ship a different set of them. */
  const moveTool = useCallback(
    (order: readonly string[], from: number, to: number) =>
      setSettings((prev) => ({
        ...prev,
        toolOrder: moveInOrder(order, from, to),
      })),
    [setSettings],
  );

  /** Switch one section of the right-hand panel on or off. */
  const setPanelSectionEnabled = useCallback(
    (id: string, enabled: boolean) =>
      setSettings((prev) => ({
        ...prev,
        hiddenPanelSections: enabled
          ? prev.hiddenPanelSections.filter((held) => held !== id)
          : prev.hiddenPanelSections.includes(id)
            ? prev.hiddenPanelSections
            : [...prev.hiddenPanelSections, id],
      })),
    [setSettings],
  );

  /** Switch one thing inside a section on or off — a page action, an effect,
   *  one of the controls on a layer row. */
  const setPanelItemEnabled = useCallback(
    (id: string, enabled: boolean) =>
      setSettings((prev) => ({
        ...prev,
        hiddenPanelItems: enabled
          ? prev.hiddenPanelItems.filter((held) => held !== id)
          : prev.hiddenPanelItems.includes(id)
            ? prev.hiddenPanelItems
            : [...prev.hiddenPanelItems, id],
      })),
    [setSettings],
  );

  /** Move one section of the panel to `to` in the order — what the settings
   *  page's arrows send, and what dragging a section by its grip resolves to.
   *  The whole current order goes in, for the reason `moveTool` gives. */
  const movePanelSection = useCallback(
    (order: readonly string[], from: number, to: number) =>
      setSettings((prev) => ({
        ...prev,
        panelOrder: moveInOrder(order, from, to),
      })),
    [setSettings],
  );

  /** Remember which member of a group was last in hand — what its toolbar
   *  button wears while you are holding something else. */
  const setGroupTool = useCallback(
    (group: string, tool: string) =>
      setSettings((prev) =>
        prev.groupTools[group] === tool
          ? prev
          : { ...prev, groupTools: { ...prev.groupTools, [group]: tool } },
      ),
    [setSettings],
  );

  return {
    settings,
    update,
    reset,
    applyDefaults,
    setSettings,
    setPluginEnabled,
    moveTool,
    setPanelSectionEnabled,
    setPanelItemEnabled,
    movePanelSection,
    setGroupTool,
    addCustomColor,
    removeCustomColor,
    setToolSize,
    savePreset,
    deletePreset,
    applyPreset,
    setToolDial,
    setToolColor,
    resetToolDials,
  };
}

/** Everything the colour picker offers, in one list: the built-in palette
 *  followed by whatever the user mixed. Kept here beside the palette itself so
 *  the toolbar and any future consumer agree on the order. */
export function paletteFor(settings: AppSettings): string[] {
  return [...PALETTE, ...settings.customColors];
}

/** The gauge a tool is measured on — its own, or the pen ladder for a tool that
 *  declares none (see `plugins/gauge.ts`). One place, so the panel, the slider
 *  and the kept widths can never disagree about what a tool comes in. */
export function gaugeFor(plugin: PaintPlugin | undefined): SizeGauge {
  return plugin?.gauge ?? DEFAULT_GAUGE;
}

/** The widths a tool's size panel offers as buttons, fine to broad: the five
 *  its gauge declares, and nothing else.
 *
 *  There used to be a sixth kind — widths the user "kept" beside them. They are
 *  gone: a bare width was a worse version of a saved *tool*, which carries the
 *  dials with it and has a name and a mark on it (see `presets.ts`). */
export function sizesFor(plugin: PaintPlugin | undefined): number[] {
  return gaugeSizes(gaugeFor(plugin));
}

/** The settings the Settings dialog writes **straight through** to the committed
 *  blob rather than staging in its draft (see the note at the top of
 *  `SettingsModal.tsx`).
 *
 *  There is nothing to roll back for any of them: a tool you switch on has to
 *  reach the toolbar behind the dialog. They are the ones the dialog *shows*
 *  from the committed settings too, so a draft's copy of them is stale from the
 *  moment the control is touched.
 *
 *  The two detail settings are here for the neighbouring reason: the dialog does
 *  not own them **at all** any more. They are set from the watercolour brush's
 *  and the pencil's own panels (see `plugins/washOptions.ts`), which is
 *  somewhere else entirely — so the draft's copy of them is a value nobody
 *  edited in the dialog, and Save writing it back is exactly the silent revert
 *  this list exists to prevent.
 *
 *  Named here, in one list, because the dialog's Save has to put every one of
 *  them back over the draft it commits — and a list kept in Save's own head is a
 *  list that forgets the next live setting somebody adds. That is exactly how
 *  the watercolour settings came to be silently reverted by pressing Save.
 *
 *  It cuts the other way too, and just as sharply: a setting that stops applying
 *  live has to *leave* this list, or Save reads the committed value back over
 *  the draft the user just edited and reverts them for the opposite reason. The
 *  grid and the tool-name label left it that way — they are ordinary staged
 *  settings on the General tab since the Canvas tab went away. */
export const LIVE_SETTINGS = [
  "enabledPlugins",
  "toolOrder",
  "washDetail",
  "leadDetail",
  // The New image shelf, for the same reason as the switchboard above it: the
  // Canvas tab is a list you *manage* — make one, name it, throw it away — and
  // an editor with its own Save inside a dialog with another Save is two
  // buttons arguing about which one meant it.
  "canvasPresets",
  "hiddenCanvasSizes",
  // The panel's arrangement, for the reason the switchboard above it is here:
  // the panel is *behind the dialog*, and a section you switch off should leave
  // it as you press the switch rather than when you find the Save button.
  "panelOrder",
  "hiddenPanelSections",
  "hiddenPanelItems",
] as const satisfies readonly (keyof AppSettings)[];

export type LiveSetting = (typeof LIVE_SETTINGS)[number];

/** `draft` with every live-applied setting taken from `live` instead — what the
 *  Settings dialog commits on Save.
 *
 *  The draft was seeded when the dialog opened, so its copy of a live setting is
 *  whatever it was *before* the user touched the control. Committing the draft
 *  whole would hand that stale value back and undo the change the user watched
 *  happen. */
export function withLiveSettings(
  draft: AppSettings,
  live: AppSettings,
): AppSettings {
  const next = { ...draft };
  for (const key of LIVE_SETTINGS) Object.assign(next, { [key]: live[key] });
  return next;
}

/** The presets saved for one tool, likewise. */
export function presetsFor(
  settings: AppSettings,
  tool: string,
): readonly ToolPreset[] {
  return settings.toolPresets[tool] ?? [];
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
  const plugin = pluginById(tool);
  // …and, for a tool this build doesn't ship, the middle of the ladder every
  // line is drawn on rather than nothing at all.
  return plugin?.defaultSize ?? gaugeSizes(gaugeFor(plugin))[2] ?? MIN_SIZE;
}

/** Which member of a tool group its toolbar button currently stands for: the
 *  one in your hand if it is one of the family, otherwise the one you had last,
 *  otherwise the first.
 *
 *  A group button has to show *a* tool even when none of its family is active —
 *  it is a shape, not an idea of a shape — and "the one you used last" is the
 *  only answer that doesn't send you back through the picker every time you pick
 *  up the pencil and put it down again. */
export function groupMemberFor(
  settings: AppSettings,
  entry: { id: string; members: readonly PaintPlugin[] },
  activeTool: string,
): PaintPlugin | undefined {
  const inHand = entry.members.find((m) => m.id === activeTool);
  if (inHand) return inHand;
  const remembered = settings.groupTools[entry.id];
  return entry.members.find((m) => m.id === remembered) ?? entry.members[0];
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
