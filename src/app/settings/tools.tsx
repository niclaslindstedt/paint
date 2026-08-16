// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Section,
} from "@niclaslindstedt/oss-framework/components";
import type { ThemeAppearance } from "@niclaslindstedt/oss-framework/theme";

import { isDarkAppearance, resolvePageColor } from "../canvas.ts";
import { useT } from "../i18n/index.ts";
import { orderedEntries, type ToolbarEntry } from "../plugins/registry.ts";
import type { AppSettings } from "../useAppSettings.ts";
import { WashEngineSection } from "./wash.tsx";

// Settings → Tools: the plugin switchboard, and the whole user-facing plugin
// story. When externally-loaded plugins land they list here beside the
// built-ins, through the same rows.
//
// **The list is the toolbar.** One list, in the order the buttons actually sit
// in, with the up / down buttons that put them in another one — so this page is
// not a description of the toolbar, it is the toolbar with its lid off. That is
// why the always-on tools are in it too rather than penned in a section of their
// own: they have a place in the row like everything else, and a page that let
// you reorder eight of eleven buttons would be a puzzle.
//
// Every tool reads the same way, whether it can be switched or not: **its own
// glyph on the left**, the one it wears in the toolbar, so the list is scannable
// as a rack of tools rather than as a wall of sentences; its name, shortcut and
// one line of description beside it; the two reorder buttons; and a switch on
// the right. The framework's `ToggleRow` puts a checkbox on the *left* and
// carries no glyph, which is the opposite arrangement — so the row is app-owned.
// Everything else on the page (the section frame) is still the framework's.
//
// A row is not always one tool. A family that shares a toolbar button shares a
// row here too — one switch for the eleven shapes, because "do you want shapes"
// is a question worth asking once (see `ToolGroup`). Its glyph is the family's
// and its description says what is inside.
//
// The switch on an always-on tool is real, shown on, and disabled: a canvas with
// no pencil, no eraser and no way to move the page is not a canvas, and a row
// that simply omitted its switch would read as a rendering bug next to fifteen
// that have one.

export function ToolsTab({
  settings,
  setPluginEnabled,
  moveTool,
  update,
  appearance,
}: {
  settings: AppSettings;
  setPluginEnabled: (id: string, enabled: boolean) => void;
  /** Move a row within the order. It is handed the whole order it is a
   *  permutation of, because a list of ids means nothing without the list of
   *  entries it reorders — see `moveTool` in `useAppSettings.ts`. */
  moveTool: (order: readonly string[], from: number, to: number) => void;
  /** Applied live, like the switchboard: this page is device state, not a
   *  staged draft (see `SettingsModal`). */
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  appearance: ThemeAppearance;
}) {
  const t = useT();
  const entries = orderedEntries(settings.toolOrder);
  const order = entries.map((entry) => entry.id);
  // The page the watercolour samples below are painted on, so they are *this*
  // sheet rather than a stranger's — the same call the surface swatches make.
  const dark = isDarkAppearance(appearance);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.tools.intro")}</p>

      <Section title={t("settings.tools.optionalTitle")}>
        <p className="text-xs text-muted">{t("settings.tools.optionalHint")}</p>
        <ul className="flex flex-col gap-1">
          {entries.map((entry, index) => (
            <li key={entry.id}>
              <ToolRow
                entry={entry}
                checked={
                  core(entry) || settings.enabledPlugins.includes(entry.id)
                }
                locked={core(entry)}
                onChange={(next) => setPluginEnabled(entry.id, next)}
                onMoveUp={
                  index > 0
                    ? () => moveTool(order, index, index - 1)
                    : undefined
                }
                onMoveDown={
                  index < entries.length - 1
                    ? () => moveTool(order, index, index + 1)
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      </Section>

      {/* Which watercolour engine paints a wash. It is here rather than in
          Canvas because it is a property of the brush and not of the page. */}
      <WashEngineSection
        engine={settings.washEngine}
        onChange={(next) => update("washEngine", next)}
        pageColor={resolvePageColor(undefined, dark)}
        dark={dark}
      />
    </div>
  );
}

/** Whether a row is one of the always-on ones — the group's flag for a family,
 *  the plugin's for a lone tool. */
function core(entry: ToolbarEntry): boolean {
  return Boolean(entry.kind === "group" ? entry.group.core : entry.plugin.core);
}

/** One row: glyph, name, what it does, where it sits — and the switch that puts
 *  it in the toolbar. A locked row is on and stays on, but it still moves. */
function ToolRow({
  entry,
  checked,
  locked = false,
  onChange,
  onMoveUp,
  onMoveDown,
}: {
  entry: ToolbarEntry;
  checked: boolean;
  locked?: boolean;
  onChange: (next: boolean) => void;
  /** Absent at the ends of the list, where there is nowhere to go. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const t = useT();
  const descriptor = entry.kind === "group" ? entry.group : entry.plugin;
  const Icon = descriptor.icon;
  const name = t(descriptor.nameKey);
  const shortcut = entry.kind === "tool" ? entry.plugin.shortcut : undefined;
  return (
    <div className="flex items-center gap-2 rounded px-1 py-1.5">
      <label
        className={`flex min-w-0 flex-1 items-center gap-3 ${
          locked ? "" : "cursor-pointer"
        }`}
      >
        {/* The tool's own mark, in the box it occupies in the toolbar — so a row
            here and a button there are recognisably the same thing. */}
        <span
          aria-hidden="true"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border ${
            checked
              ? "border-accent/60 bg-accent/10 text-accent"
              : "border-line text-muted"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm text-fg-bright">{name}</span>
            {shortcut && (
              <span className="text-xs text-muted">
                {t("settings.tools.shortcut", {
                  key: shortcut.toUpperCase(),
                })}
              </span>
            )}
          </span>
          <span className="block text-xs text-muted">
            {t(descriptor.descriptionKey)}
          </span>
        </span>
      </label>

      {/* Where it sits. Buttons rather than a drag handle, deliberately: this
          list is read on a phone as often as on a desktop, a drag inside a
          scrolling dialog fights the scroll, and two arrows are reachable from a
          keyboard and a screen reader without any of that being re-invented.
          It is the same pair the layers panel uses to restack a drawing. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <MoveButton
          label={t("settings.tools.moveUp", { name })}
          onClick={onMoveUp}
        >
          <ChevronUpIcon className="h-4 w-4" />
        </MoveButton>
        <MoveButton
          label={t("settings.tools.moveDown", { name })}
          onClick={onMoveDown}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </MoveButton>
      </span>

      <Switch
        checked={checked}
        disabled={locked}
        label={name}
        hint={locked ? t("settings.tools.alwaysOn") : undefined}
        onChange={onChange}
      />
    </div>
  );
}

/** One of the two arrows. Rendered disabled rather than omitted at the ends of
 *  the list, so the rows stay the same width and nothing jumps sideways as a
 *  tool is walked up the toolbar. */
function MoveButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-transparent text-muted hover:border-line hover:bg-surface-2 hover:text-fg disabled:cursor-default disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** An on/off switch.
 *
 *  App-owned because the framework's toggle is a checkbox that leads its label,
 *  and this list wants the opposite — the control trailing the row, reading as
 *  a switch you flick. It is a real `<input type="checkbox">` underneath, so
 *  the keyboard, the label association and assistive tech all work without
 *  anything being re-implemented; only the paint is ours. */
function Switch({
  checked,
  disabled,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        title={hint}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
        className="peer h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-line bg-surface-2 transition-colors checked:border-accent checked:bg-accent/70 disabled:cursor-default disabled:opacity-50"
      />
      {/* The knob. Pointer-transparent so the input underneath takes every
          click, including the ones that land on the knob itself. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-[3px] h-4.5 w-4.5 -translate-y-1/2 rounded-full bg-fg-bright transition-transform peer-checked:translate-x-5"
      />
    </span>
  );
}
