// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tool swatches: the inks a tool carries of its own, past the toolbar's.
//
// This is `dials.ts` for colours, and deliberately the same shape — a plugin
// declares what it has (`PaintPlugin.swatches`), the panel renders whatever it
// declared, the settings blob keeps a value per tool per swatch, and nothing
// outside `plugins/` knows one by name.
//
// The two reads are the dials' two reads, for the same two callers:
//
//   - `resolveSwatches` — every swatch the tool offers, at the colour it will
//     pour. What the panel renders; there is a row per entry.
//   - `pickedSwatches` — only the ones re-coloured off what the tool ships
//     with. What the canvas hands a behaviour, and what the settings blob
//     holds.
//
// One thing is not a dial's, and it is why a swatch carries `optional`: a
// colour can be **absent**, and absent is a real answer. A gradient's middle
// stop is normally off — the ramp runs straight from one end to the other — so
// "none" has to be storable rather than merely unset, and the blob writes an
// empty string for it. A behaviour reads a swatch through `inkOf`, which hands
// back `null` for a colour that isn't there.

import type { PaintPlugin, ToolContext, ToolSwatch } from "./types.ts";

/** Whether `plugin` mixes its own inks — which is also the question "does the
 *  toolbar's ink mean anything with this tool in hand?" (see `controls.ts`). */
export function hasSwatches(plugin: PaintPlugin | undefined): boolean {
  return (plugin?.swatches?.length ?? 0) > 0;
}

/** A stored colour, or the swatch's own rest value. Only a `#rrggbb`-ish string
 *  is taken: a blob written by hand (or by another build) is the only way
 *  anything else gets here, and a colour the canvas can't parse paints as
 *  black without saying so. The empty string is kept as it is — that is how an
 *  optional swatch records "none". */
function storedColor(swatch: ToolSwatch, value: unknown): string {
  if (value === "" && swatch.optional) return "";
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return swatch.default ?? "";
  }
  return value;
}

/** Every swatch `plugin` offers, at the colour it will pour — the panel's read.
 *  A tool with none comes back empty, which is how the panel knows to show no
 *  swatch row at all. An optional swatch that is off is `""`. */
export function resolveSwatches(
  plugin: PaintPlugin | undefined,
  stored: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const swatch of plugin?.swatches ?? []) {
    out[swatch.id] = storedColor(swatch, stored?.[swatch.id]);
  }
  return out;
}

/** The swatches actually re-coloured off what the tool ships with — what rides
 *  in `ToolContext.colors`, and what the blob keeps. */
export function pickedSwatches(
  plugin: PaintPlugin | undefined,
  stored: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const swatch of plugin?.swatches ?? []) {
    const color = storedColor(swatch, stored?.[swatch.id]);
    if (color !== (swatch.default ?? "")) out[swatch.id] = color;
  }
  return out;
}

/** Whether any of `plugin`'s swatches have been re-coloured — what the panel's
 *  reset offers itself on, alongside the dials'. */
export function hasPicked(
  plugin: PaintPlugin | undefined,
  stored: Readonly<Record<string, string>> | undefined,
): boolean {
  return Object.keys(pickedSwatches(plugin, stored)).length > 0;
}

/** The colour a behaviour should pour for one of its own swatches: what the
 *  toolbar handed it, or the swatch's own rest value, or `null` for a swatch
 *  that is off.
 *
 *  This is the only way a painter should reach a swatch — it is what makes a
 *  tool handed no colours at all (a test, the press preview) pour exactly what
 *  it ships with. */
export function inkOf(ctx: ToolContext, swatch: ToolSwatch): string | null {
  const picked = ctx.colors?.[swatch.id];
  const color = picked !== undefined ? picked : (swatch.default ?? "");
  return color === "" ? null : color;
}
