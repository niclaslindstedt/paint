// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Putting a whole tool in somebody's hand: a preset applied, a page's kit put
// in force, and the kit a fresh start begins from.
//
// Split out of `useAppSettings.ts` because it is a different kind of thing from
// the store around it. That module owns the *shape* of the settings blob — what
// is in it, what a persisted one reads back as, and the hook that holds it.
// This one owns the three **projections** that write a tool's width and dials
// into it, all pure, all drivable from a test with no browser: what a preset
// chip does, what opening a page made on a canvas preset does, and what an
// emptied sketchbook goes back to.
//
// The settings type comes back the other way as a *type-only* import, so the
// two modules are one-directional at runtime.

import type { PaintDefaults } from "./defaults.ts";
import { toolPresets } from "./plugins/presets.ts";
import { pluginById, resolveActiveTool } from "./plugins/registry.ts";
import type { CanvasKit } from "./canvasPresets.ts";
import type { PresetSettings } from "./presets.ts";
import type { AppSettings } from "./useAppSettings.ts";

/** `settings` with `preset` applied to `tool` — its width, and every one of its
 *  dials.
 *
 *  Pure, and exported, because it is the one step of a preset that touches
 *  persisted state: what a chip actually *does* is worth being able to drive
 *  from a test without a browser.
 *
 *  A preset with no width of its own (one for a tool that has none) writes no
 *  width. Anything else would leave a number in the blob that no mark this tool
 *  makes could ever read. */
export function withPreset(
  settings: AppSettings,
  tool: string,
  preset: PresetSettings,
): AppSettings {
  const plugin = pluginById(tool);
  const kept: Record<string, number> = {};
  for (const dial of plugin?.dials ?? []) {
    const at = preset.dials[dial.id];
    if (at === undefined) continue;
    // Only what is actually off the default is written, exactly as a dragged
    // slider writes it — a preset that happens to be the tool as it ships
    // leaves no tuning behind at all.
    if (at !== (dial.default ?? 1)) kept[dial.id] = at;
  }
  const dials = { ...settings.toolDials };
  if (Object.keys(kept).length === 0) delete dials[tool];
  else dials[tool] = kept;
  return {
    ...settings,
    toolSizes:
      preset.size === undefined
        ? settings.toolSizes
        : { ...settings.toolSizes, [tool]: preset.size },
    toolDials: dials,
  };
}

/** `settings` with a canvas preset's kit **put in force** — which member of each
 *  family its button opens on, and how each tool it has set up is set.
 *
 *  This is the half of a kit that cannot be a projection. Which tools are in the
 *  toolbar is read fresh on every render from the kit (see `toolbarFor`), and it
 *  has to be: nothing can *change* it while you are drawing. A width and a dial
 *  are the opposite — the size panel is one press away and moving it is the
 *  ordinary thing to do — so a kit that kept overriding them would be a panel
 *  whose sliders sprang back. So the kit is applied **when a page made on it is
 *  opened**: the app presses those preset chips for you, once, and everything
 *  after that is yours (see the effect in `App.tsx`).
 *
 *  Pure, and it hands `settings` straight back when the kit has nothing to say —
 *  so a page with a plain kit, or none, never writes to the blob at all.
 *
 *  Structurally typed on the kit rather than importing one, for the reason
 *  `toolbarFor` is: this module already imports the canvas presets, and the
 *  model must not have to import the store back. */
export function withKit(
  settings: AppSettings,
  kit: CanvasKit | undefined,
): AppSettings {
  if (!kit) return settings;
  let next = settings;
  const groups = Object.entries(kit.groupTools ?? {});
  if (groups.length > 0) {
    next = {
      ...next,
      groupTools: { ...next.groupTools, ...Object.fromEntries(groups) },
    };
  }
  for (const [tool, preset] of Object.entries(kit.toolSettings ?? {})) {
    next = withPreset(next, tool, preset);
  }
  return next;
}

/** The four defaults, read off the settings blob — what `App.tsx` publishes for
 *  every resolver that has no settings object to ask (see `defaults.ts`). */
export function paintDefaultsFrom(settings: AppSettings): PaintDefaults {
  return {
    tool: settings.defaultTool,
    preset: settings.defaultPreset,
    ink: settings.defaultColor,
    page: settings.defaultPageColor,
  };
}

/** The preset a tool starts on, resolved: the shipped one of that id, else the
 *  saved one of that id, else nothing.
 *
 *  Both kinds are offered because by the time an id is being resolved the
 *  difference between them is who chose the name (see `presets.ts`) — and a
 *  default of "my sketching pencil" is exactly the thing somebody who has built
 *  one wants to open on. `null` where the id names neither, which is what a
 *  preset the user has since thrown away, or one from a build that shipped a
 *  different set, comes back as: the tool then opens as its maker built it
 *  rather than on somebody else's guess. */
export function defaultPresetFor(
  settings: AppSettings,
  tool: string,
): PresetSettings | null {
  const id = settings.defaultPreset;
  if (!id) return null;
  const shipped = toolPresets(pluginById(tool)).find((p) => p.id === id);
  if (shipped) return shipped;
  return settings.toolPresets[tool]?.find((p) => p.id === id) ?? null;
}

/** `settings` with the kit put back to its defaults: the default tool in hand,
 *  set to its default preset, drawing in the default ink.
 *
 *  What "a fresh start" means, in one pure function — and it is a *kit* reset,
 *  not a settings reset. Which tools are in the toolbar, the colours you mixed,
 *  the pages you set up and every other tool's width survive it; this is the
 *  answer to "there is nothing here to draw on any more, what do you hand me",
 *  which is what deleting the last sheet asks (see `usePaintStore`).
 *
 *  The ink is put back to `null` rather than to the default colour itself: an
 *  unpicked ink *is* the default, resolved at paint time, so a later change to
 *  the default reaches the page instead of being frozen into the blob here.
 *
 *  The default tool is resolved against what the toolbar actually offers, so a
 *  default naming a tool since switched off hands over something that draws
 *  rather than a canvas that ignores the pointer. */
export function withDefaults(settings: AppSettings): AppSettings {
  const tool = resolveActiveTool(settings.defaultTool, settings.enabledPlugins);
  // Start from the tool as its maker ships it — no width of its own and no
  // tuning — so a preset that names fewer dials than the one in force cannot
  // leave the ones it says nothing about behind.
  const sizes = { ...settings.toolSizes };
  const dials = { ...settings.toolDials };
  delete sizes[tool];
  delete dials[tool];
  const stock: AppSettings = {
    ...settings,
    activeTool: tool,
    color: null,
    toolSizes: sizes,
    toolDials: dials,
  };
  const preset = defaultPresetFor(stock, tool);
  if (!preset) return stock;
  // A preset at the tool's own width writes no width, exactly as the cleared
  // blob above holds none: the settings should say how your kit differs from
  // the box, and "the same as the box" is not a difference (see `withPreset`).
  const width = pluginById(tool)?.defaultSize;
  return withPreset(
    stock,
    tool,
    preset.size === width ? { dials: preset.dials } : preset,
  );
}
