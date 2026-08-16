// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tool options: the app-wide settings a tool offers, in the tool's own panel.
//
// This is `dials.ts`'s sibling, and the difference between them is the whole
// reason it exists:
//
//   - a **dial** tunes the next mark. It is a fraction of the tool's own normal,
//     it rides on the stroke, and re-tuning it later cannot change a mark
//     already drawn.
//   - an **option** is how marks of this kind are *painted*. It is nowhere on a
//     stroke, it belongs to the app rather than to the document, and moving it
//     repaints every drawing you own — which is exactly why it must never be
//     recorded on a mark: a setting that was stored per stroke would orphan
//     everything drawn before it the moment it changed (see `plugins/wash.ts`).
//
// The values live in the ordinary settings blob, under the option's own id: an
// option **is** a setting, declared by the tool that the setting is about. That
// is what lets the panel render one without knowing what it is for, and what
// lets the watercolour engine move out of a settings page and under the brush's
// own widths without a screen learning a tool id.
//
// Two reads come out of here, and they mirror the two `dials.ts` offers:
//
//   - `resolveOptions` — every option the tool declares, at the value in force.
//     What the panel renders.
//   - `shownOptions` — the ones worth showing at those values, in order. An
//     option can depend on another (`shownWhen`), so a setting belonging to one
//     answer stays out of the way while a different answer is picked.

import type {
  PaintPlugin,
  ToolOption,
  ToolOptionAnswer,
  ToolOptionChoice,
} from "./types.ts";

/** What an option is worth: a string for a choice, a number for a range. */
export type ToolOptionValue = string | number;

/** Where an option rests when nobody has touched it. */
export function optionDefault(option: ToolOption): ToolOptionValue {
  return option.default;
}

/** A stored value pulled back into what the option actually offers — an answer
 *  it declares, or a number on its track.
 *
 *  The settings blob is the only way a bad one gets here (a build that offered
 *  another answer, a hand-edited file), and a control cannot show a value that
 *  is not one of its own. */
export function optionValue(
  option: ToolOption,
  stored: unknown,
): ToolOptionValue {
  if (option.kind === "choice") {
    return typeof stored === "string" &&
      option.answers.some((answer) => answer.value === stored)
      ? stored
      : option.default;
  }
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return option.default;
  }
  return Math.max(option.min, Math.min(option.max, stored));
}

/** Every option `plugin` declares, at the value it is in force at — read out of
 *  whatever holds the settings (the app's blob, or a plain object in a test).
 *
 *  A plugin with no options comes back empty, which is how the panel knows to
 *  show no section at all. */
export function resolveOptions(
  plugin: PaintPlugin | undefined,
  source: Readonly<Record<string, unknown>> | undefined,
): Record<string, ToolOptionValue> {
  const out: Record<string, ToolOptionValue> = {};
  for (const option of plugin?.options ?? []) {
    out[option.id] = optionValue(option, source?.[option.id]);
  }
  return out;
}

/** The options worth showing at the values they are currently at — the panel's
 *  list, in the order the tool declared them. */
export function shownOptions(
  options: readonly ToolOption[],
  values: Readonly<Record<string, ToolOptionValue>>,
): ToolOption[] {
  return options.filter((option) => {
    const on = option.shownWhen;
    return !on || values[on.option] === on.is;
  });
}

/** Whether this tool has any options at all — what the toolbar reads to decide
 *  whether a widthless tool has a panel worth opening (see `controls.ts`). */
export function hasOptions(plugin: PaintPlugin | undefined): boolean {
  return (plugin?.options?.length ?? 0) > 0;
}

/** Whether `id` is an option some registered tool declares.
 *
 *  The guard between a plugin-declared id and the settings blob: an option
 *  writes straight into the settings under its own id, so the one thing worth
 *  checking is that the id belongs to a tool rather than to whoever called. */
export function isToolOption(
  plugins: readonly PaintPlugin[],
  id: string,
): boolean {
  return plugins.some((plugin) =>
    plugin.options?.some((option) => option.id === id),
  );
}

/** Which of a choice's answers a value stands for — the panel's read for the
 *  hint under the row, and `undefined` for a range. */
export function optionAnswer(
  option: ToolOption,
  value: ToolOptionValue,
): ToolOptionAnswer | undefined {
  if (option.kind !== "choice") return undefined;
  return (option as ToolOptionChoice).answers.find(
    (answer) => answer.value === value,
  );
}
