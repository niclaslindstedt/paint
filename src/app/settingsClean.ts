// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a *persisted settings blob* may contain, and what to do about it.
//
// Everything here takes `unknown` and hands back a shape the app can paint
// from. That is the whole concern: the settings JSON is read from
// localStorage, from a `settings.json` in a folder the user can open in a text
// editor, and from a copy written by an older — or newer — build. All three can
// hand back nonsense, and none of them may be allowed to take the app down.
//
// They live beside `parseSettings` rather than inside it because they are the
// part of it worth reading on their own: each one is a statement about what a
// field is allowed to be, and about which of the two rules that field follows.
//
//   - **Keep what you can't use.** A width, a tuning or an ink for a tool this
//     build no longer ships is *held*, not pruned: downgrading and upgrading
//     again shouldn't silently forget how you had your brush set.
//   - **Drop what nothing could paint from.** A value that isn't of the field's
//     kind at all is dropped, because no consumer downstream can recover from
//     one.
//
// Pure and DOM-free, so what an upgrade does with an old blob can be pinned
// down in a node test.

import { MAX_SIZE } from "./plugins/gauge.ts";
import { allPlugins } from "./plugins/registry.ts";

/** Clean a persisted list of ids — an order, or a list of what is switched off.
 *  A missing or hand-mangled one reads as "nothing said". */
export function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

/** Clean a persisted map of string to string — the group memories. */
export function strings(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return out;
  }
  for (const [key, at] of Object.entries(value)) {
    if (typeof at === "string") out[key] = at;
  }
  return out;
}

/** Clean a persisted map of per-tool widths. A width for a tool this build no
 *  longer ships is kept for the same reason a tuning is — downgrading and
 *  upgrading again shouldn't forget how you had it set — but a value that isn't
 *  a usable width at all is dropped, because the picker can't recover from one. */
export function toolSizes(value: unknown): Record<string, number> {
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
export function toolDials(
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

/** Clean a persisted map of a tool's own inks — the same shape check the
 *  tunings get, and the same "keep what you can't use" rule: a colour for a
 *  tool this build no longer ships, or for a swatch it has since dropped, is
 *  held rather than pruned, because downgrading and upgrading again shouldn't
 *  forget how you had your ramp mixed. What each value *means* is the swatch's
 *  to say, and `resolveSwatches` re-checks it at every read. */
export function toolColors(
  value: unknown,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return out;
  }
  for (const [tool, colors] of Object.entries(value)) {
    if (typeof colors !== "object" || colors === null) continue;
    const kept: Record<string, string> = {};
    for (const [swatch, color] of Object.entries(colors as object)) {
      if (typeof color === "string") kept[swatch] = color;
    }
    if (Object.keys(kept).length > 0) out[tool] = kept;
  }
  return out;
}

/** Read one of the nullable defaults back: a string, or the explicit `null`
 *  that means "follow the app theme". A blob written before the field existed
 *  doesn't name it at all and keeps the shipped answer; a blob holding
 *  something that is neither is a blob nothing could paint from, and falls back
 *  the same way. */
export function optional(
  stored: Record<string, unknown>,
  key: string,
  fallback: string | null,
): string | null {
  if (!(key in stored)) return fallback;
  const at = stored[key];
  return typeof at === "string" || at === null ? at : fallback;
}
