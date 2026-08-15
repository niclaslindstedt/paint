// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Saved tools — "my sketching pencil".
//
// A width and five dials is a lot of decisions, and the ones worth making are
// worth making once. Finding the 4B at 0.7 mm with the opacity eased off that a
// particular drawing wants takes a minute of fiddling; wanting it again
// tomorrow takes the same minute, and wanting it *and the loaded #8 round you
// were glazing with* takes two. That is the whole case for this module: a
// preset is a tool the user built, under a name they chose, one press away.
//
// Three decisions hold it together:
//
//   - **A preset is a whole tool, not a width.** It carries the size *and*
//     every dial, because that is what "my sketching pencil" means. A saved
//     width alone is what the picker's kept sizes already are.
//   - **A preset belongs to one tool.** "My sketching pencil" applied to the
//     airbrush is nonsense, and a flat list of presets across a toolbox of
//     fifteen tools is a list nobody reads. They are stored by tool id, and the
//     panel only ever shows the one tool's own.
//   - **Nothing here is a mode.** Applying a preset sets the width and the
//     dials and then gets out of the way — there is no "preset is active" state
//     to fall out of, and moving a dial afterwards simply moves a dial. What
//     the panel highlights is not a mode but an *observation*: the tool
//     currently matches this preset (see `activePreset`).
//
// Pure, and kept out of the settings hook, so a whole save-apply-rename cycle
// can be driven from a test with no browser.

import { isGlyphName } from "@niclaslindstedt/oss-framework/glyphs";

/** What applying a preset **sets**: a width, when the tool has one, and where
 *  every dial goes.
 *
 *  The half the two kinds of preset share. A *saved* tool (`ToolPreset`, below)
 *  is one of these under a name the user chose; a *shipped* one
 *  (`plugins/types.ts`'s `BuiltinPreset`) is one under a name its tool's maker
 *  chose. Everything downstream — matching a chip against the tool in hand,
 *  applying one — takes this and never asks which it was handed, which is what
 *  keeps one row of chips from being two mechanisms.
 *
 *  `size` is absent only for a tool that has no width to set (the bucket).
 *  A width no mark reads is not a setting, and writing one would leave a number
 *  in the settings blob that nothing could ever draw with. */
export type PresetSettings = {
  size?: number;
  /** Every dial the tool offers, at the value this preset puts it on —
   *  *resolved*, not just the moved ones (see `ToolPreset.dials`). */
  dials: Readonly<Record<string, number>>;
};

/** One saved tool: a name, a mark to know it by, a width, and where every dial
 *  was. */
export type ToolPreset = PresetSettings & {
  /** Stable id, minted from the name (see `presetId`). Persisted, and used by
   *  the panel as a key and by rename / remove as the address. */
  id: string;
  name: string;
  /** The glyph the chip wears, from the framework's catalogue (`GLYPH_NAMES`) —
   *  the same vocabulary a drawing's own mark comes from.
   *
   *  A row of saved tools is read at a glance and mostly with a thumb, and four
   *  chips of similar words are four chips you have to *read*. A mark is not:
   *  the star is the one you always reach for, the leaf is the one you sketch
   *  plants with. `null` for a preset saved without picking one, which shows
   *  the name alone. */
  glyph?: string | null;
  /** The width, in document pixels — the same number `toolSize` answers with. */
  size: number;
  /** Every dial the tool offered when the preset was saved, at the value it was
   *  on — *resolved*, not just the tuned ones.
   *
   *  Deliberately the fuller of the two reads (see `plugins/dials.ts`).
   *  A preset is a statement about how the whole tool is set, so applying one
   *  has to be able to put a dial *back* to its default as well as away from
   *  it; storing only the off-default ones would make applying a plain preset
   *  over a heavily-tuned tool leave the tuning behind. */
  dials: Record<string, number>;
};

/** How many presets one tool will hold.
 *
 *  Eight, because the panel shows them as a wrapped row of chips you pick from
 *  without reading carefully, and past about eight that stops being true. It is
 *  also more brushes than most people have favourites. Saving past the cap
 *  drops the oldest, the way the kept colours do. */
export const MAX_PRESETS = 8;

/** How long a name may be. Long enough for "my sketching pencil", short enough
 *  that a chip is a chip. */
export const MAX_PRESET_NAME = 40;

/** How close two widths have to be to count as the same one.
 *
 *  Half a document pixel — a sixteenth of a millimetre, and finer than any
 *  press will resolve. It is here because a width makes a round trip through
 *  the settings blob and a slider quantised in points of its own travel, and a
 *  preset that stopped matching itself after a reload would be a bug nobody
 *  could see the cause of. */
const SAME_SIZE = 0.5;

/** …and the same for a dial, whose values are fractions rather than pixels. */
const SAME_DIAL = 1e-6;

/** A usable name, or `null` when there isn't one — an empty box, or a wall of
 *  whitespace. */
export function presetName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_PRESET_NAME);
  return name.length > 0 ? name : null;
}

/** A stable id for a name, unique against the ids already in use.
 *
 *  Derived from the name rather than drawn at random, so it is the same id in
 *  every test run and readable in a settings blob someone is debugging. Two
 *  presets called the same thing are allowed — people do that — so a collision
 *  simply counts up. */
export function presetId(name: string, taken: readonly string[]): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "preset";
  if (!taken.includes(slug)) return slug;
  for (let n = 2; ; n++) {
    const next = `${slug}-${n}`;
    if (!taken.includes(next)) return next;
  }
}

/** Save the tool as it is set right now, under `name`.
 *
 *  Newest last, so the row reads in the order they were made — a preset list is
 *  a shelf, not a most-recently-used stack, and a chip that moves about is a
 *  chip you have to read every time. Saving a name that is already there
 *  **replaces** it, which is what everyone means by saving over something. */
export function addPreset(
  list: readonly ToolPreset[],
  name: string,
  size: number,
  dials: Readonly<Record<string, number>>,
  glyph: string | null = null,
): ToolPreset[] {
  const at = list.findIndex((p) => p.name === name);
  const preset: ToolPreset = {
    id:
      at >= 0
        ? list[at]!.id
        : presetId(
            name,
            list.map((p) => p.id),
          ),
    name,
    ...(glyph ? { glyph } : {}),
    size,
    dials: { ...dials },
  };
  if (at >= 0) return list.map((p, i) => (i === at ? preset : p));
  // Past the cap the oldest goes, rather than the save being refused: someone
  // saving a ninth favourite has told you which nine they care about.
  return [...list, preset].slice(-MAX_PRESETS);
}

export function removePreset(
  list: readonly ToolPreset[],
  id: string,
): ToolPreset[] {
  return list.filter((p) => p.id !== id);
}

/** Whether the tool is currently set exactly the way this preset says.
 *
 *  A preset with no width of its own — one for a tool that has none — is
 *  matched on its dials alone, which is the whole of what it sets. */
export function presetMatches(
  preset: PresetSettings,
  size: number,
  dials: Readonly<Record<string, number>>,
): boolean {
  if (preset.size !== undefined && Math.abs(preset.size - size) > SAME_SIZE) {
    return false;
  }
  const keys = new Set([...Object.keys(preset.dials), ...Object.keys(dials)]);
  for (const key of keys) {
    const a = preset.dials[key];
    const b = dials[key];
    // A dial the tool no longer offers (or did not yet, when the preset was
    // saved) is not a difference — it is a dial nothing can be set to.
    if (a === undefined || b === undefined) continue;
    if (Math.abs(a - b) > SAME_DIAL) return false;
  }
  return true;
}

/** Which preset the tool is currently set to, if it is set to one. An
 *  observation rather than a mode — see this module's header.
 *
 *  Generic over the two kinds, so the shipped row and the saved row are lit by
 *  the same reading and a tool can be on one of each at once (the shipped
 *  preset it came with, saved again under your own name). */
export function activePreset<T extends PresetSettings>(
  list: readonly T[],
  size: number,
  dials: Readonly<Record<string, number>>,
): T | undefined {
  return list.find((p) => presetMatches(p, size, dials));
}

/** A name the user has not used for this tool yet — what the save box opens
 *  with, so saving one is two presses rather than a naming decision.
 *
 *  `base` is a catalog string ("Preset"), interpolated by the caller, because
 *  the number is the only part of this that isn't a word. */
export function nextPresetName(
  list: readonly ToolPreset[],
  base: string,
): string {
  const taken = new Set(list.map((p) => p.name));
  for (let n = 1; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Read a persisted preset map back, dropping what cannot be a preset.
 *
 *  Stricter than the tunings map beside it, which keeps values it does not
 *  recognise in case a downgrade wants them. A preset is rendered as a chip and
 *  applied as a whole tool, so a half-written one is a button that breaks the
 *  panel rather than a number nothing reads. */
export function cleanPresets(value: unknown): Record<string, ToolPreset[]> {
  const out: Record<string, ToolPreset[]> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return out;
  }
  for (const [tool, raw] of Object.entries(value)) {
    if (!Array.isArray(raw)) continue;
    const kept: ToolPreset[] = [];
    for (const entry of raw) {
      const preset = cleanPreset(entry, kept);
      if (preset) kept.push(preset);
    }
    if (kept.length > 0) out[tool] = kept.slice(0, MAX_PRESETS);
  }
  return out;
}

function cleanPreset(
  value: unknown,
  kept: readonly ToolPreset[],
): ToolPreset | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === "string" ? presetName(raw.name) : null;
  if (!name) return null;
  if (typeof raw.size !== "number" || !Number.isFinite(raw.size)) return null;
  if (raw.size <= 0) return null;
  const dials: Record<string, number> = {};
  if (typeof raw.dials === "object" && raw.dials !== null) {
    for (const [dial, at] of Object.entries(raw.dials as object)) {
      if (typeof at === "number" && Number.isFinite(at)) dials[dial] = at;
    }
  }
  const taken = kept.map((p) => p.id);
  const id =
    typeof raw.id === "string" && raw.id && !taken.includes(raw.id)
      ? raw.id
      : presetId(name, taken);
  // A glyph this build's catalogue doesn't hold is dropped rather than kept:
  // the chip renders it, and a name it cannot draw is an empty square.
  const glyph =
    typeof raw.glyph === "string" && isGlyphName(raw.glyph) ? raw.glyph : null;
  return { id, name, ...(glyph ? { glyph } : {}), size: raw.size, dials };
}
