// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Canvas presets — a page you have set up once, waiting on the New image shelf.
//
// A canvas preset is a *named page*: a size, and optionally the kit of tools that
// page is worked with. "Sketchbook" is the case it exists for — A5-ish, and a
// pencil, an eraser and nothing else, in that order — where the shipped shelf
// offers four sizes everybody needs and no opinion about what you draw on them
// with.
//
// Three decisions hold it together:
//
//   - **A canvas preset is a page, not a preference.** Which one made a drawing is
//     written onto the drawing (`Drawing.canvasPreset`), the way its size and its
//     sheet already are — so opening a sketchbook page tomorrow puts the
//     sketchbook's tools back in the toolbar, and opening the photo beside it
//     puts the whole toolbox back. Nothing is a mode you can be left in.
//   - **The kit is optional.** A canvas preset with none is a size and a name; the
//     toolbar is then whatever Settings → Tools says, which is what every page
//     made before this existed uses.
//   - **A kit is exactly what the app-wide toolbar is** — the ids that are
//     switched on, plus the order the buttons sit in — so the toolbar resolves
//     one way (`toolbarEntries`) whichever of the two it is reading, and the
//     page that edits a canvas preset's tools is the page that edits the app's,
//     with a different destination.
//   - **A kit can say how those tools are *set*, and not only which they are.**
//     "The sketchbook opens with a pencil and an eraser" is half of what a
//     sketchbook is; the other half is that the eraser is a kneaded one at
//     20 mm. So a kit also carries which member of a family its button opens on
//     (`groupTools`) and how a tool is set up (`toolSettings`) — a width and
//     every dial, which is exactly what a preset chip sets (see `presets.ts`).
//
// Pure, and kept out of the settings hook, so the whole create-hide-reorder
// cycle can be driven from a test with no browser.

import {
  clampCanvasSize,
  orientSize,
  type CanvasSize,
  type Orientation,
  type SizePreset,
  type SizePresetId,
} from "./canvasSize.ts";
import type { PresetSettings } from "./presets.ts";
import type { Ground } from "./types.ts";

/** The tools a canvas preset is worked with.
 *
 *  The same two lists `AppSettings` holds for the app-wide toolbar, and for the
 *  same reasons: `tools` is what is switched **on** (core tools are always
 *  offered and are never listed), `order` is where the buttons sit. Either can
 *  name a tool this build doesn't ship — `toolbarEntries` ignores what it
 *  cannot place — so a kit survives a downgrade the way the settings blob
 *  does.
 *
 *  The two maps under them are the same idea one level down: not *which* tools
 *  the page is worked with but **which one of a family, and how each is set**.
 *  Both are sparse, and both are the settings blob's own shapes — `groupTools`
 *  is `AppSettings.groupTools`, `toolSettings` is a preset per tool — so putting
 *  a kit in force is the same write the toolbar and a preset chip already make
 *  (see `withKit` in `useAppSettings.ts`). */
export type CanvasKit = {
  tools: string[];
  order: string[];
  /** Which member of a tool group this page's button opens on, by group id —
   *  the rubber rather than the eraser, the star rather than the rectangle.
   *
   *  A group button always stands for *a* tool (see `groupMemberFor`), and
   *  without this the answer is "whichever you used last", which is a property
   *  of your afternoon rather than of the page. Sparse: a group the kit says
   *  nothing about keeps that answer. */
  groupTools?: Record<string, string>;
  /** How a tool is set up on this page, by tool id: a width, and where every
   *  dial goes.
   *
   *  Deliberately a `PresetSettings` — the very thing a preset chip applies —
   *  because "the eraser on this page is a kneaded one" *is* a preset, and a
   *  second shape for the same idea would be a second way to be set up. The
   *  dials are resolved (every dial the tool offered, not just the moved ones)
   *  for the reason a saved tool's are: putting a kit in force has to be able to
   *  set a dial *back* as well as away, or a sketchbook opened after an
   *  afternoon of tuning is neither the sketchbook nor what you had. Sparse: a
   *  tool the kit says nothing about stays however you have it. */
  toolSettings?: Record<string, PresetSettings>;
};

/** One named page on the New image shelf. */
export type CanvasPreset = {
  /** Stable id, minted from the name (see `canvasPresetId`). Persisted twice
   *  over: in the settings blob, and on every drawing this canvas preset made. */
  id: string;
  name: string;
  size: CanvasSize;
  /** The tools this page is worked with, or absent for "whatever the toolbar is
   *  set to". */
  kit?: CanvasKit;
  /** The sheet this page is usually on — a stock and how far its grain shows,
   *  exactly as a drawing carries one (see `Ground`).
   *
   *  Optional, and it behaves differently from everything else here: it is a
   *  **preselection**, not a rule. Picking this preset in New image puts that
   *  sheet in the shelf below, where it can still be changed before Create —
   *  because a mark is painted *into* the sheet it was made on, so the sheet has
   *  to be the answer of the person making the page rather than one imposed on
   *  them by a name they chose last month. A preset's tools can be taken back
   *  (switch them off in Settings and the page still opens); a preset's sheet
   *  could not, which is why only one of the two is binding. */
  ground?: Ground;
};

/** How a preset records "the plain solid sheet" — the stock's own id, from
 *  `ground.ts`.
 *
 *  A *drawing* on the plain sheet carries no ground at all (see `types.ts`), and
 *  a preset cannot do the same: absent already means "this preset says nothing
 *  about the sheet", and the two are different answers — one leaves the dialog
 *  on whatever it opened with, the other deliberately puts it back on the plain
 *  page. So the plain sheet is written down by name here, and turned back into
 *  "no ground" when the drawing is actually made (see `NewImageModal`). */
export const SOLID_STOCK = "solid";

/** How many canvas presets one install will hold.
 *
 *  Twelve, because they are drawn as rectangles on a shelf that is compared at a
 *  glance (see `SizeShelf`) — past about a dozen cells that stops being a
 *  comparison and starts being a catalogue, which is the same reason the shipped
 *  list is four. Saving past the cap is refused rather than dropping the oldest:
 *  a canvas preset is named, and pages already made point at it by id. */
export const MAX_CANVAS_PRESETS = 12;

/** How long a name may be. Long enough for "Sketchbook, portrait", short enough
 *  that the cell under the rectangle stays one line. */
export const MAX_CANVAS_PRESET_NAME = 32;

/** A usable name, or `null` when there isn't one — an empty box, or a wall of
 *  whitespace. */
export function canvasPresetName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_CANVAS_PRESET_NAME);
  return name.length > 0 ? name : null;
}

/** A stable id for a name, unique against the ids already in use.
 *
 *  Derived from the name rather than drawn at random for the same reasons a
 *  saved tool's is (see `presets.ts`): it is the same id in every test run, and
 *  it is readable in a settings blob — or on a drawing — somebody is debugging.
 *  Two canvas presets called the same thing are allowed, so a collision counts
 *  up. */
export function canvasPresetId(name: string, taken: readonly string[]): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "canvas";
  if (!taken.includes(slug)) return slug;
  for (let n = 2; ; n++) {
    const next = `${slug}-${n}`;
    if (!taken.includes(next)) return next;
  }
}

/** What the editor hands back: a canvas preset without an id yet, or one with
 *  the id of the preset it is editing. */
export type CanvasPresetDraft = {
  id?: string;
  name: string;
  size: CanvasSize;
  kit?: CanvasKit;
  ground?: Ground;
};

/** Save a canvas preset — a new one at the end of the shelf, or an edit in place.
 *
 *  In place is the point of the id: a drawing made on "Sketchbook" points at it,
 *  so renaming or resizing one has to leave the id alone or every page made on
 *  it would quietly lose its kit. A draft with no id (or one naming a preset that
 *  is gone) is a new one; past the cap the list is handed back unchanged, and
 *  the caller's Save button is the thing that should have been dim (see
 *  `canAddCanvasPreset`). */
export function saveCanvasPreset(
  list: readonly CanvasPreset[],
  draft: CanvasPresetDraft,
): CanvasPreset[] {
  const name = canvasPresetName(draft.name);
  if (!name) return [...list];
  const size = clampCanvasSize(draft.size);
  const at = draft.id ? list.findIndex((c) => c.id === draft.id) : -1;
  const made = {
    name,
    size,
    ...(draft.kit ? { kit: cleanKit(draft.kit) } : {}),
    ...(draft.ground ? { ground: cleanGround(draft.ground) } : {}),
  };
  if (at >= 0) {
    // Spread over the one being edited rather than replacing it, then take out
    // the two optional halves the editor may have switched *off* — which a
    // spread cannot say.
    const next: CanvasPreset = { ...list[at]!, ...made };
    if (!draft.kit) delete next.kit;
    if (!draft.ground) delete next.ground;
    return list.map((c, i) => (i === at ? next : c));
  }
  if (list.length >= MAX_CANVAS_PRESETS) return [...list];
  return [
    ...list,
    {
      id: canvasPresetId(
        name,
        list.map((c) => c.id),
      ),
      ...made,
    },
  ];
}

/** Whether there is room for another one. */
export function canAddCanvasPreset(list: readonly CanvasPreset[]): boolean {
  return list.length < MAX_CANVAS_PRESETS;
}

export function removeCanvasPreset(
  list: readonly CanvasPreset[],
  id: string,
): CanvasPreset[] {
  return list.filter((c) => c.id !== id);
}

/** One canvas preset by id, if it is still there. A drawing made on a canvas preset
 *  that has since been deleted simply falls back to the app-wide toolbar — the
 *  page itself is untouched, because the size was baked into it when it was
 *  made. */
export function canvasPresetById(
  list: readonly CanvasPreset[],
  id: string | undefined,
): CanvasPreset | undefined {
  return id ? list.find((c) => c.id === id) : undefined;
}

/** The two lists the toolbar is built from for a drawing: its canvas preset's kit
 *  if it has one, otherwise the app's own.
 *
 *  Structurally typed rather than taking `AppSettings`, so this module stays a
 *  leaf — the settings hook imports *it*, and a cycle between the two would be
 *  a cycle between the model and its store. */
export function toolbarFor(
  settings: {
    canvasPresets: readonly CanvasPreset[];
    enabledPlugins: readonly string[];
    toolOrder: readonly string[];
  },
  canvasPreset: string | undefined,
): { tools: readonly string[]; order: readonly string[] } {
  const kit = canvasPresetById(settings.canvasPresets, canvasPreset)?.kit;
  return kit
    ? { tools: kit.tools, order: kit.order }
    : { tools: settings.enabledPlugins, order: settings.toolOrder };
}

/** One tool switched on or off in a kit. Core tools are never listed — they are
 *  offered whatever the kit says — so this only ever moves an optional one. */
export function withTool(kit: CanvasKit, id: string, on: boolean): CanvasKit {
  const tools = on
    ? kit.tools.includes(id)
      ? kit.tools
      : [...kit.tools, id]
    : kit.tools.filter((held) => held !== id);
  return { ...kit, tools };
}

/** The member of a group this kit opens on, or `undefined` for "whichever you
 *  had last" — which is what a kit that says nothing about a family means. */
export function kitGroupTool(
  kit: CanvasKit,
  group: string,
): string | undefined {
  return kit.groupTools?.[group];
}

/** Which member of a family this page's button opens on. `null` gives the
 *  answer back to the app — the member you last held (see `groupMemberFor`). */
export function withGroupTool(
  kit: CanvasKit,
  group: string,
  tool: string | null,
): CanvasKit {
  const next = { ...(kit.groupTools ?? {}) };
  if (tool === null) delete next[group];
  else next[group] = tool;
  return sparse({ ...kit, groupTools: next });
}

/** How one tool is set up on this page. `null` forgets it, which is how a tool
 *  goes back to being however the person drawing has it set. */
export function withKitTool(
  kit: CanvasKit,
  tool: string,
  settings: PresetSettings | null,
): CanvasKit {
  const next = { ...(kit.toolSettings ?? {}) };
  if (settings === null) delete next[tool];
  else next[tool] = { ...settings, dials: { ...settings.dials } };
  return sparse({ ...kit, toolSettings: next });
}

/** Whether this kit has anything of its own to say about one toolbar entry —
 *  which member its button opens on, or how any of its tools are set.
 *
 *  Takes ids rather than a `ToolbarEntry`, so the model stays a leaf: which
 *  tools are in a family is the registry's answer, and this module has no
 *  business asking it. */
export function kitCustomizes(
  kit: CanvasKit,
  entry: string,
  tools: readonly string[],
): boolean {
  if (kit.groupTools?.[entry] !== undefined) return true;
  return tools.some((id) => kit.toolSettings?.[id] !== undefined);
}

/** Drop either optional map once it is empty, so a kit that has been set up and
 *  then unset is byte-for-byte the kit it was before — the same rule the tunings
 *  in the settings blob follow. */
function sparse(kit: CanvasKit): CanvasKit {
  const next = { ...kit };
  if (next.groupTools && Object.keys(next.groupTools).length === 0) {
    delete next.groupTools;
  }
  if (next.toolSettings && Object.keys(next.toolSettings).length === 0) {
    delete next.toolSettings;
  }
  return next;
}

/** Move one id to `to` in an order — what the up / down arrows send, for the
 *  app-wide toolbar and for a canvas preset's kit alike.
 *
 *  The whole current order goes in rather than a delta, because that is the only
 *  thing a stored order can be: a permutation of ids means nothing without the
 *  list of entries it is a permutation of, and both lists are read by builds
 *  that ship a different set of them (see `orderEntries`). */
export function moveInOrder(
  order: readonly string[],
  from: number,
  to: number,
): string[] {
  if (from === to || from < 0 || to < 0) return [...order];
  if (from >= order.length || to >= order.length) return [...order];
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

// --- The shelf ---------------------------------------------------------------

/** One cell of the New image size shelf: a size this build ships, or a page you
 *  set up yourself.
 *
 *  Two kinds rather than one, because their names come from different places — a
 *  shipped size is a catalog string in whatever language the app is in, a canvas
 *  preset is the words its owner typed — and because only one of the two can be
 *  written onto a drawing. */
export type ShelfItem =
  | { kind: "size"; id: SizePresetId; size: CanvasSize }
  | {
      kind: "preset";
      id: string;
      name: string;
      size: CanvasSize;
      /** Whether it carries a kit of tools — the cell wears a mark for it. */
      kit: boolean;
      /** The sheet it is usually on, for the dialog to preselect. */
      ground?: Ground;
    };

/** What New image offers: the shipped sizes that haven't been hidden, then the
 *  canvas presets, in the order they were made.
 *
 *  **The shipped sizes turn to face the shelf and the canvas presets do not.**
 *  That looks like an inconsistency and is the opposite of one. A shipped size is
 *  written down in whichever orientation it happens to be quoted in — two
 *  displays on their sides, a sheet of paper on its end — and that is an accident
 *  of the quoting, which is the whole reason the shelf turns them (see
 *  `Orientation` in `canvasSize.ts`). A canvas preset's shape is not an accident:
 *  somebody typed 1600 × 2000 because a sketchbook is upright, and standing it on
 *  its side because the laptop is would hand them a page they never set up. Flip
 *  still turns the page in hand, preset or not — it just no longer re-quotes the
 *  cell it came from. */
export function canvasShelf(
  sizes: readonly SizePreset[],
  hidden: readonly string[],
  presets: readonly CanvasPreset[],
  orientation: Orientation,
): ShelfItem[] {
  return [
    ...sizes
      .filter((size) => !hidden.includes(size.id))
      .map((size): ShelfItem => ({
        kind: "size",
        id: size.id,
        size: orientSize(size.size, orientation),
      })),
    ...presets.map((preset): ShelfItem => ({
      kind: "preset",
      id: preset.id,
      name: preset.name,
      size: preset.size,
      kit: preset.kit !== undefined,
      ...(preset.ground ? { ground: preset.ground } : {}),
    })),
  ];
}

/** A shipped size hidden or put back. Kept here beside the shelf that reads the
 *  list, and as a list of the ids that are *off* — so a size a later release
 *  adds arrives on everybody's shelf rather than hidden from the installs that
 *  happen to hold this key already. */
export function withHidden(
  list: readonly string[],
  id: string,
  hide: boolean,
): string[] {
  if (hide) return list.includes(id) ? [...list] : [...list, id];
  return list.filter((held) => held !== id);
}

// --- Reading the persisted blob ----------------------------------------------

/** Read a persisted kit back. Only the shape is checked: which ids mean
 *  anything is the plugin registry's to say, and it re-answers that at every
 *  read (see `toolbarEntries`) — so a kit naming a tool this build doesn't ship
 *  keeps it, in case a downgrade wants it. */
function cleanKit(value: unknown): CanvasKit {
  const raw = (typeof value === "object" && value !== null ? value : {}) as {
    tools?: unknown;
    order?: unknown;
    groupTools?: unknown;
    toolSettings?: unknown;
  };
  const ids = (from: unknown) =>
    Array.isArray(from)
      ? from.filter((id): id is string => typeof id === "string")
      : [];
  const groupTools: Record<string, string> = {};
  if (typeof raw.groupTools === "object" && raw.groupTools !== null) {
    for (const [group, tool] of Object.entries(raw.groupTools as object)) {
      if (typeof tool === "string" && tool) groupTools[group] = tool;
    }
  }
  const toolSettings: Record<string, PresetSettings> = {};
  if (typeof raw.toolSettings === "object" && raw.toolSettings !== null) {
    for (const [tool, held] of Object.entries(raw.toolSettings as object)) {
      const settings = cleanToolSettings(held);
      if (settings) toolSettings[tool] = settings;
    }
  }
  return sparse({
    tools: ids(raw.tools),
    order: ids(raw.order),
    groupTools,
    toolSettings,
  });
}

/** Read one tool's setup back. Only the shape is checked, and a width that
 *  isn't one is dropped rather than taking the whole entry with it: which dials
 *  a tool has is the plugin's to say and it re-answers that at every read (see
 *  `withPreset`), so a value this build cannot place is simply never applied. */
function cleanToolSettings(value: unknown): PresetSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const dials: Record<string, number> = {};
  if (typeof raw.dials === "object" && raw.dials !== null) {
    for (const [dial, at] of Object.entries(raw.dials as object)) {
      if (typeof at === "number" && Number.isFinite(at)) dials[dial] = at;
    }
  }
  const size =
    typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size > 0
      ? raw.size
      : undefined;
  // A setup that says nothing at all is not one: it would be a tool the editor
  // shows as pinned and applying it would write nothing.
  if (size === undefined && Object.keys(dials).length === 0) return null;
  return { ...(size === undefined ? {} : { size }), dials };
}

/** Read a persisted sheet back. Which stocks exist is `ground.ts`'s to say and
 *  it re-answers that at every read — an id it doesn't know paints as the plain
 *  solid sheet — so only the shape is checked here, and the grain is held inside
 *  the range the slider offers. */
function cleanGround(value: unknown): Ground | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.stock !== "string" || !raw.stock) return undefined;
  const texture =
    typeof raw.texture === "number" && Number.isFinite(raw.texture)
      ? Math.min(2, Math.max(0, raw.texture))
      : 1;
  // A grain left where the stock has it is the stock as it is sold, and is not
  // written — the same rule the new-image dialog follows.
  return { stock: raw.stock, ...(texture === 1 ? {} : { texture }) };
}

/** Read the persisted canvas presets back, dropping what cannot be one.
 *
 *  Stricter than the tool tunings beside it in the blob, and for the same reason
 *  a saved tool is: a canvas preset is a rectangle on a shelf and a page somebody
 *  presses Create on, so a half-written one is a broken dialog rather than a
 *  number nothing reads. One with no usable name or no usable size is
 *  dropped; a *drawing* pointing at the id it had simply falls back to the
 *  app-wide toolbar. */
export function cleanCanvasPresets(value: unknown): CanvasPreset[] {
  if (!Array.isArray(value)) return [];
  const kept: CanvasPreset[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const name =
      typeof raw.name === "string" ? canvasPresetName(raw.name) : null;
    if (!name) continue;
    const size =
      typeof raw.size === "object" && raw.size !== null
        ? (raw.size as Record<string, unknown>)
        : null;
    if (
      !size ||
      typeof size.width !== "number" ||
      typeof size.height !== "number" ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height)
    ) {
      continue;
    }
    const taken = kept.map((c) => c.id);
    const id =
      typeof raw.id === "string" && raw.id && !taken.includes(raw.id)
        ? raw.id
        : canvasPresetId(name, taken);
    const ground = cleanGround(raw.ground);
    kept.push({
      id,
      name,
      size: clampCanvasSize({ width: size.width, height: size.height }),
      ...(raw.kit !== undefined ? { kit: cleanKit(raw.kit) } : {}),
      ...(ground ? { ground } : {}),
    });
    if (kept.length === MAX_CANVAS_PRESETS) break;
  }
  return kept;
}

/** Read the hidden-size list back — ids, and nothing else to check: one this
 *  build doesn't ship hides nothing, which is harmless, and keeping it means a
 *  downgrade finds its shelf the way it left it. */
export function cleanHiddenSizes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}
