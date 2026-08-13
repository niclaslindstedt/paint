// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The plugin registry — the single list of tools the app knows about.
//
// Registration is explicit and ordered: `builtin/index.ts` registers the
// shipped tools at import time, and the toolbar renders them in registration
// order. Nothing else in the app hard-codes a tool id, so adding a tool is one
// `registerPlugin` call plus its catalog strings.
//
// Availability is a separate question from registration: a registered plugin is
// *known*, an enabled one is *offered*. Core plugins are always enabled; the
// rest are listed in Settings → Tools and enabled per user (see
// `enabledPlugins` in `useAppSettings.ts`). Strokes drawn by a tool that is
// later switched off still render — the registry, not the enabled set, is what
// the renderer looks a stroke's `tool` up in.

import type { PaintPlugin } from "./types.ts";

const registry = new Map<string, PaintPlugin>();
const order: string[] = [];

/** Register a tool plugin. A duplicate id replaces the previous registration
 *  (keeping its position), so a build can override a shipped tool without
 *  reordering the toolbar. */
export function registerPlugin(plugin: PaintPlugin): void {
  if (!registry.has(plugin.id)) order.push(plugin.id);
  registry.set(plugin.id, plugin);
}

/** Every registered plugin, in registration order. */
export function allPlugins(): PaintPlugin[] {
  return order.map((id) => registry.get(id)!).filter(Boolean);
}

/** The plugins the user can switch on — everything that isn't core. This is
 *  what Settings → Tools lists with a switch. */
export function optionalPlugins(): PaintPlugin[] {
  return allPlugins().filter((p) => !p.core);
}

/** The optional plugins that are on out of the box — the ones a first run finds
 *  already in its toolbar. This is what seeds `enabledPlugins`, and what a
 *  reset returns it to; it is a *default*, not a floor, so switching one off
 *  sticks. */
export function defaultEnabledPlugins(): string[] {
  return allPlugins()
    .filter((p) => !p.core && p.defaultOn)
    .map((p) => p.id);
}

/** Look one plugin up by id. `undefined` for a stroke drawn by a tool this
 *  build doesn't ship (a document from a newer version, say) — callers fall
 *  back to a generic painter rather than dropping the stroke. */
export function pluginById(id: string): PaintPlugin | undefined {
  return registry.get(id);
}

/** The tools the toolbar offers: every core plugin, plus the optional ones the
 *  user has switched on. Order follows registration, so switching a tool on
 *  slots it into its natural place rather than appending it. */
export function enabledPlugins(enabledIds: readonly string[]): PaintPlugin[] {
  const enabled = new Set(enabledIds);
  return allPlugins().filter((p) => p.core || enabled.has(p.id));
}

/** Resolve the active tool id against what's actually offered, so a tool that
 *  was switched off (or came from a stale settings blob) can never leave the
 *  canvas holding a tool the toolbar no longer shows.
 *
 *  The fallback is the first offered tool that actually *marks the page* — not
 *  simply the first one. The toolbar's leftmost button is the hand, and landing
 *  a stale settings blob on a tool that draws nothing looks exactly like a
 *  broken canvas. `navigates` and `picksColor` are the descriptor flags that
 *  say "leaves no mark", so nothing here knows what a hand is. */
export function resolveActiveTool(
  wanted: string,
  enabledIds: readonly string[],
): string {
  const offered = enabledPlugins(enabledIds);
  if (offered.some((p) => p.id === wanted)) return wanted;
  const draws = offered.find((p) => !p.navigates && !p.picksColor);
  return draws?.id ?? offered[0]?.id ?? wanted;
}

/** Drop every registration. Tests use it to start from a clean registry; the
 *  app never calls it. */
export function resetPlugins(): void {
  registry.clear();
  order.length = 0;
}
