// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shipped presets: the settings a tool comes with, resolved.
//
// The declaration is `PaintPlugin.presets` and the shipped set is in
// `builtin/presets.ts`; this module is the thin layer between them and the
// panel — the same arrangement `dials.ts` has with `builtin/dials.ts`.
//
// It exists for one reason: **a preset declares only what it moves, and the
// panel needs the whole tool.** "Dry brush" is written as a splayed head and a
// hardness right down, because that is what it *is* and because a tool that
// grows a sixth dial next year should not mean editing four presets that have
// no opinion about it. But applying one has to put every other dial *back* —
// otherwise a dry brush applied over a wet-in-wet is neither — and lighting a
// chip up has to compare against every dial too, or a chip lights up for a tool
// that is only half set to it. So the two reads meet here: what a plugin
// declares goes in, and a whole tool comes out.
//
// Nothing in here knows a tool or a dial by name.

import { resolveDials } from "./dials.ts";
import type { BuiltinPreset, PaintPlugin } from "./types.ts";
import type { PresetSettings } from "../presets.ts";

/** A shipped preset with its dials filled in: what the panel renders, what a
 *  chip is matched against, and what applying one writes. */
export type ToolPresetOption = BuiltinPreset & PresetSettings;

/** How many presets one tool may ship.
 *
 *  Five, and the cap is the point rather than a limit anyone is near: the row
 *  is read at a glance by someone who does not yet know what any of the words
 *  mean, and a tool with eight "must haves" has none. It is deliberately
 *  tighter than the eight a *user* may save — those are theirs, and they had a
 *  reason for each. */
export const MAX_BUILTIN_PRESETS = 5;

/** Every preset `plugin` ships, each one a whole tool.
 *
 *  The dials come back *resolved* — every dial the tool offers, clamped into
 *  its range, at this preset's value or at that dial's default. A tool with no
 *  presets comes back empty, which is how the panel knows to show no shipped
 *  row at all. */
export function toolPresets(
  plugin: PaintPlugin | undefined,
): ToolPresetOption[] {
  return (plugin?.presets ?? []).map((preset) => ({
    ...preset,
    dials: resolveDials(plugin, preset.dials),
  }));
}

/** Whether this preset is the tool exactly as it comes out of the box — the
 *  width it opens at, and every dial where it rests.
 *
 *  Every tool that ships presets ships one of these, first in the row (see
 *  `BuiltinPreset`). It is what makes the panel open with a chip already lit,
 *  which is how the row explains itself, and it is the way back from a tool you
 *  have tuned into a corner. */
export function isStockPreset(
  plugin: PaintPlugin | undefined,
  preset: BuiltinPreset,
): boolean {
  if (!plugin) return false;
  // A sizeless tool has no width to be stock at; anything else has to be on the
  // one its plugin opens at.
  if (preset.size !== undefined && preset.size !== plugin.defaultSize) {
    return false;
  }
  if (preset.size === undefined && plugin.defaultSize !== undefined) {
    return false;
  }
  const stock = resolveDials(plugin, undefined);
  const set = resolveDials(plugin, preset.dials);
  return Object.keys(stock).every((id) => stock[id] === set[id]);
}
