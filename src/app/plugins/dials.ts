// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tool dials: the per-tool tunables behind the size button's **Advanced**.
//
// The width is the one control every tool shares, and it is the whole of the
// basic panel. Past it the tools stop agreeing: a paintbrush has a hair gauge,
// an airbrush has a flow rate, a crayon has a pressure, a highlighter has
// nothing but its opacity. So a tool *declares* its dials (`PaintPlugin.dials`)
// and this module owns what happens to the numbers — nothing outside `plugins/`
// knows a dial by name.
//
// Two reads come out of here, and the difference between them is the whole
// design:
//
//   - `resolveDials` — every dial the tool offers, at the value it will draw
//     at. What the panel renders; there is a slider per entry.
//   - `tunedDials` — only the dials moved off their default. What the canvas
//     hands a behaviour, and what a stroke records.
//
// The second is why a dial costs a drawing nothing. Values are fractions of the
// tool's own normal (1 = "the way this tool draws"), an untouched dial is
// simply absent, and every painter takes its dial as an argument that defaults
// to the same rest value. So a page drawn without opening Advanced serialises
// byte-for-byte the way it did before dials existed, and a mark made with a
// tuned brush carries the two numbers it actually needs — for good, the way its
// colour and width are, so re-tuning the dial later cannot re-draw marks you
// already made.

import type { Stroke } from "../types.ts";
import type { PaintPlugin, ToolDial } from "./types.ts";

/** Where a dial rests when nobody has touched it. Almost always 1 — see
 *  `ToolDial.default`. */
export function dialDefault(dial: ToolDial): number {
  return dial.default ?? 1;
}

/** The number the panel prints beside a dial's name: a percentage of the tool's
 *  normal, or a count of document pixels for the dials that measure the page.
 *  The unit itself lives in the catalog string (see `ToolDial.nameKey`). */
export function dialReadout(dial: ToolDial, value: number): number {
  return dial.unit === "px" ? Math.round(value) : Math.round(value * 100);
}

/** A stored value pulled back into the dial's range. A blob written by another
 *  build (or by hand) is the only way a bad one gets here, and a slider cannot
 *  recover from a value outside its own track. */
function clampDial(dial: ToolDial, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return dialDefault(dial);
  }
  return Math.max(dial.min, Math.min(dial.max, value));
}

/** Every dial `plugin` offers, at the value it will draw at — the panel's read.
 *  A plugin with no dials (the eraser, the hand) comes back empty, which is how
 *  the panel knows to show no Advanced section at all. */
export function resolveDials(
  plugin: PaintPlugin | undefined,
  stored: Readonly<Record<string, number>> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dial of plugin?.dials ?? []) {
    out[dial.id] = clampDial(dial, stored?.[dial.id]);
  }
  return out;
}

/** The dials that are actually *doing* something — the ones moved off their
 *  default. This is what rides in `ToolContext.dials` and onto a stroke. */
export function tunedDials(
  plugin: PaintPlugin | undefined,
  stored: Readonly<Record<string, number>> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dial of plugin?.dials ?? []) {
    const value = clampDial(dial, stored?.[dial.id]);
    if (value !== dialDefault(dial)) out[dial.id] = value;
  }
  return out;
}

/** Whether any of `plugin`'s dials have been moved — what the panel's reset
 *  offers itself on. */
export function hasTuning(
  plugin: PaintPlugin | undefined,
  stored: Readonly<Record<string, number>> | undefined,
): boolean {
  return Object.keys(tunedDials(plugin, stored)).length > 0;
}

/** What a dial was set to on a mark already drawn.
 *
 *  `fallback` is the painter's own rest value, and it has to match the dial's
 *  `default`: a stroke records nothing for a dial left alone, so this is the
 *  path every untuned mark in every document takes. */
export function strokeDial(stroke: Stroke, id: string, fallback = 1): number {
  const value = stroke.dials?.[id];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The dial values a draft should carry: whatever the toolbar handed the tool,
 *  minus the ones that have a first-class field on `Stroke` already.
 *
 *  `opacity` and `hardness` are those two. They predate dials and are read by
 *  code that runs for *every* plugin — `applyInk` sets the context's alpha,
 *  `strokeHardness` feeds the soft painters — so a tool that offers them as
 *  dials writes them where that generic code already looks rather than filing a
 *  second copy under `dials`. */
export function extraDials(
  dials: Readonly<Record<string, number>>,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(dials)) {
    if (id === "opacity" || id === "hardness") continue;
    out[id] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
