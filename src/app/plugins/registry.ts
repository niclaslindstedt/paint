// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The plugin registry — the single list of tools the app knows about.
//
// Registration is explicit and ordered: `builtin/index.ts` registers the
// shipped tools at import time, and the toolbar renders them in registration
// order unless the user has reordered it. Nothing else in the app hard-codes a
// tool id, so adding a tool is one `registerPlugin` call plus its catalog
// strings.
//
// Availability is a separate question from registration: a registered plugin is
// *known*, an enabled one is *offered*. Core plugins are always enabled; the
// rest are listed in Settings → Tools and enabled per user (see
// `enabledPlugins` in `useAppSettings.ts`). Strokes drawn by a tool that is
// later switched off still render — the registry, not the enabled set, is what
// the renderer looks a stroke's `tool` up in.
//
// Above the plugins sits one more level: a **group** (`ToolGroup`), a family of
// tools offered as one button and one switch. The shapes are the case. A group
// is purely about how tools are *offered* — its members are ordinary plugins
// and a stroke still names the one that drew it — so everything below reads
// "entry" where it used to read "plugin": an entry is a lone tool or a whole
// family, and it is what the toolbar renders, what Settings → Tools lists, and
// what the user's order is a permutation of.

import type { PaintPlugin, ToolGroup } from "./types.ts";

const registry = new Map<string, PaintPlugin>();
const order: string[] = [];
const groups = new Map<string, ToolGroup>();

/** Register a tool plugin. A duplicate id replaces the previous registration
 *  (keeping its position), so a build can override a shipped tool without
 *  reordering the toolbar. */
export function registerPlugin(plugin: PaintPlugin): void {
  if (!registry.has(plugin.id)) order.push(plugin.id);
  registry.set(plugin.id, plugin);
}

/** Register a tool group — the button and switch its members share. Register it
 *  before the plugins that name it; where it sits in the toolbar is decided by
 *  its first member, not by when the group itself was declared. */
export function registerGroup(group: ToolGroup): void {
  groups.set(group.id, group);
}

/** Every registered plugin, in registration order. */
export function allPlugins(): PaintPlugin[] {
  return order.map((id) => registry.get(id)!).filter(Boolean);
}

/** The plugins that offer a gesture — everything a toolbar could show. A hidden
 *  plugin (one that only paints, like the dropped image) is not one of them, so
 *  it is filtered out here once rather than at every call site. */
export function toolPlugins(): PaintPlugin[] {
  return allPlugins().filter((p) => !p.hidden);
}

/** Look one plugin up by id. `undefined` for a stroke drawn by a tool this
 *  build doesn't ship (a document from a newer version, say) — callers fall
 *  back to a generic painter rather than dropping the stroke. */
export function pluginById(id: string): PaintPlugin | undefined {
  return registry.get(id);
}

/** Look one group up by id. */
export function groupById(id: string): ToolGroup | undefined {
  return groups.get(id);
}

/** The tools in one group, in registration order. */
export function groupMembers(id: string): PaintPlugin[] {
  return toolPlugins().filter((p) => p.group === id);
}

/** The group a tool belongs to, if the group is actually registered. A plugin
 *  naming a group this build doesn't ship falls back to standing alone, which
 *  is the shape every other "unknown id" answer in here takes. */
export function groupOf(plugin: PaintPlugin): ToolGroup | undefined {
  return plugin.group ? groups.get(plugin.group) : undefined;
}

// --- Entries -----------------------------------------------------------------

/** One thing the toolbar can show, and one row Settings → Tools can list: a
 *  lone tool, or a family of them behind one button. */
export type ToolbarEntry =
  | { kind: "tool"; id: string; plugin: PaintPlugin }
  | { kind: "group"; id: string; group: ToolGroup; members: PaintPlugin[] };

/** What decides whether an entry is offered — the plugin's own flags for a lone
 *  tool, the group's for a family. */
function switchOf(entry: ToolbarEntry): {
  core?: boolean;
  defaultOn?: boolean;
} {
  return entry.kind === "group" ? entry.group : entry.plugin;
}

/** Every entry this build ships, in **registration** order. A group takes the
 *  place of its first member, so grouping the shapes leaves the toolbar's shape
 *  of things exactly where it was. */
export function registeredEntries(): ToolbarEntry[] {
  const entries: ToolbarEntry[] = [];
  const placed = new Set<string>();
  for (const plugin of toolPlugins()) {
    const group = groupOf(plugin);
    if (!group) {
      entries.push({ kind: "tool", id: plugin.id, plugin });
      continue;
    }
    if (placed.has(group.id)) continue;
    placed.add(group.id);
    entries.push({
      kind: "group",
      id: group.id,
      group,
      members: groupMembers(group.id),
    });
  }
  return entries;
}

/** Reorder `entries` by the ids in `order`, in place.
 *
 *  "In place" is the whole subtlety, and it is what keeps a saved order from
 *  going stale: the entries the order *doesn't* name — a tool this build added
 *  after that order was written — keep their registration index, and the ones it
 *  does name fill the slots that are left, in the order given. So a new tool
 *  lands where its maker put it rather than at the end of a list written before
 *  it existed, and reordering the toolbar never has to be redone after an
 *  update.
 *
 *  Exported for its own test: it is pure, and it is the one piece of the
 *  toolbar's order that can be got wrong quietly. */
export function orderEntries(
  entries: readonly ToolbarEntry[],
  order: readonly string[],
): ToolbarEntry[] {
  // Only ids this build actually has, and each of them once: a stale settings
  // blob is the usual source of both, and either would leave a hole below.
  const seen = new Set<string>();
  const named: ToolbarEntry[] = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    const entry = entries.find((e) => e.id === id);
    if (!entry) continue;
    seen.add(id);
    named.push(entry);
  }
  if (named.length === 0) return [...entries];
  let next = 0;
  return entries.map((entry) => (seen.has(entry.id) ? named[next++]! : entry));
}

/** Whether an entry is offered, given the ids the user has switched on. */
function entryEnabled(
  entry: ToolbarEntry,
  enabled: ReadonlySet<string>,
): boolean {
  return Boolean(switchOf(entry).core) || enabled.has(entry.id);
}

/** Every entry, in the user's own order — what Settings → Tools lists, switches
 *  and reorders. Switched-off entries are here too: that page is where they are
 *  switched back on. */
export function orderedEntries(order: readonly string[]): ToolbarEntry[] {
  return orderEntries(registeredEntries(), order);
}

/** The entries the toolbar shows: the enabled ones, in the user's order. */
export function toolbarEntries(
  enabledIds: readonly string[],
  order: readonly string[] = [],
): ToolbarEntry[] {
  const enabled = new Set(enabledIds);
  return orderedEntries(order).filter((entry) => entryEnabled(entry, enabled));
}

/** The entries that are on out of the box — the ones a first run finds already
 *  in its toolbar. This is what seeds `enabledPlugins`, and what a reset returns
 *  it to; it is a *default*, not a floor, so switching one off sticks. */
export function defaultEnabledPlugins(): string[] {
  return registeredEntries()
    .filter((entry) => {
      const flags = switchOf(entry);
      return !flags.core && flags.defaultOn;
    })
    .map((entry) => entry.id);
}

/** The tools the toolbar offers, flattened back to plugins: every core tool,
 *  plus the members of every entry the user has switched on. Order follows
 *  registration — this answers "which tool may the canvas be holding", not
 *  "where does its button sit", and only the toolbar cares about the second. */
export function enabledPlugins(enabledIds: readonly string[]): PaintPlugin[] {
  const enabled = new Set(enabledIds);
  return toolPlugins().filter((plugin) => {
    const group = groupOf(plugin);
    // A grouped tool is offered exactly when its family is: one switch for the
    // shapes is the point of grouping them.
    if (group) return Boolean(group.core) || enabled.has(group.id);
    return Boolean(plugin.core) || enabled.has(plugin.id);
  });
}

/** Resolve the active tool id against what's actually offered, so a tool that
 *  was switched off (or came from a stale settings blob) can never leave the
 *  canvas holding a tool the toolbar no longer shows.
 *
 *  The fallback is the first offered tool that actually *marks the page* — not
 *  simply the first one. The toolbar's leftmost button is the dropper, and
 *  landing a stale settings blob on a tool that draws nothing looks exactly
 *  like a broken canvas. `navigates`, `picksColor` and `selects` are the
 *  descriptor flags that say "leaves no mark", so nothing here knows what a
 *  dropper is. */
export function resolveActiveTool(
  wanted: string,
  enabledIds: readonly string[],
): string {
  const offered = enabledPlugins(enabledIds);
  if (offered.some((p) => p.id === wanted)) return wanted;
  const draws = offered.find(
    (p) => !p.navigates && !p.picksColor && !p.selects,
  );
  return draws?.id ?? offered[0]?.id ?? wanted;
}

/** Drop every registration. Tests use it to start from a clean registry; the
 *  app never calls it. */
export function resetPlugins(): void {
  registry.clear();
  order.length = 0;
  groups.clear();
}
