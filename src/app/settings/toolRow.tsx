// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { ReactNode } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { ToolbarEntry } from "../plugins/registry.ts";

// One tool, as a row you can switch and move — and the two pages that show a
// list of them: Settings → Tools, which is the app's own toolbar, and the tool
// list inside a canvas type, which is one page's kit (see `canvasTypes.ts`).
//
// The row lives here rather than on either page because the two lists are the
// same list with different destinations. A kit *is* what the app-wide toolbar is
// — the ids that are on, and the order the buttons sit in — so anything that
// made the two read differently would be saying they were different kinds of
// thing when they are not.
//
// Every tool reads the same way, whether it can be switched or not: **its own
// glyph on the left**, the one it wears in the toolbar, so the list is scannable
// as a rack of tools rather than as a wall of sentences; its name, shortcut and
// one line of description beside it; the two reorder buttons; and a switch on
// the right. The framework's `ToggleRow` puts a checkbox on the *left* and
// carries no glyph, which is the opposite arrangement — so the row is app-owned.
//
// In a canvas preset's kit that glyph is also a **button**: a page can say which
// member of a family it opens on and how each tool is set, and the mark is the
// tool, so pressing the tool is how you go and set it up (see `kitTool.tsx`).
// The app-wide list has no such page to set up, so its glyph stays part of the
// label — one row, two lists, and the difference is a prop.
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

/** Whether a row is one of the always-on ones — the group's flag for a family,
 *  the plugin's for a lone tool. */
export function isCore(entry: ToolbarEntry): boolean {
  return Boolean(entry.kind === "group" ? entry.group.core : entry.plugin.core);
}

/** One row: glyph, name, what it does, where it sits — and the switch that puts
 *  it in the toolbar. A locked row is on and stays on, but it still moves. */
export function ToolRow({
  entry,
  checked,
  locked = false,
  onChange,
  onMoveUp,
  onMoveDown,
  onCustomize,
  customized = false,
}: {
  entry: ToolbarEntry;
  checked: boolean;
  locked?: boolean;
  onChange: (next: boolean) => void;
  /** Absent at the ends of the list, where there is nowhere to go. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Set this tool up for the page being edited — a canvas preset's kit only,
   *  and then the **glyph becomes the button** (see `kitTool.tsx`). The mark is
   *  the tool, so pressing the tool to set the tool up costs the row nothing;
   *  the app-wide list passes none of this, and its glyph stays part of the
   *  label the way it always was. */
  onCustomize?: () => void;
  /** Whether that page already says something of its own about this tool — the
   *  glyph then wears a dot, the way a tuned tool's cog does over the canvas. */
  customized?: boolean;
}) {
  const t = useT();
  const descriptor = entry.kind === "group" ? entry.group : entry.plugin;
  const Icon = descriptor.icon;
  const name = t(descriptor.nameKey);
  const shortcut = entry.kind === "tool" ? entry.plugin.shortcut : undefined;
  // The tool's own mark, in the box it occupies in the toolbar — so a row here
  // and a button there are recognisably the same thing.
  const mark = <Icon className="h-[18px] w-[18px]" />;
  const markClass = `relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border ${
    checked
      ? "border-accent/60 bg-accent/10 text-accent"
      : "border-line text-muted"
  }`;
  return (
    <div className="flex items-center gap-2 rounded px-1 py-1.5">
      {/* Outside the label when it is a button of its own: inside it, every
          press on the glyph would flick the switch beside it. */}
      {onCustomize && (
        <button
          type="button"
          onClick={onCustomize}
          aria-label={t("settings.canvas.kitCustomize", { name })}
          title={t("settings.canvas.kitCustomize", { name })}
          className={`${markClass} cursor-pointer hover:border-accent hover:text-accent`}
        >
          {mark}
          {customized && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent"
            />
          )}
        </button>
      )}
      <label
        className={`flex min-w-0 flex-1 items-center gap-3 ${
          locked ? "" : "cursor-pointer"
        }`}
      >
        {!onCustomize && (
          <span aria-hidden="true" className={markClass}>
            {mark}
          </span>
        )}

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
  children: ReactNode;
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
export function Switch({
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
