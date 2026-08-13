// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Section } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import { allPlugins, optionalPlugins } from "../plugins/registry.ts";
import type { PaintPlugin } from "../plugins/types.ts";
import type { AppSettings } from "../useAppSettings.ts";

// Settings → Tools: the plugin switchboard, and the whole user-facing plugin
// story. When externally-loaded plugins land they list here beside the
// built-ins, through the same rows.
//
// Every tool reads the same way, whether it can be switched or not: **its own
// glyph on the left**, the one it wears in the toolbar, so the list is scannable
// as a rack of tools rather than as a wall of sentences; its name, shortcut and
// one line of description beside it; and a switch on the right. The framework's
// `ToggleRow` puts a checkbox on the *left* and carries no glyph, which is the
// opposite arrangement — so the row is app-owned. Everything else on the page
// (the section frames) is still the framework's.
//
// The switch on an always-on tool is real, shown on, and disabled: a canvas with
// no pencil, no eraser and no way to move the page is not a canvas, and a row
// that simply omitted its switch would read as a rendering bug next to fifteen
// that have one.

export function ToolsTab({
  settings,
  setPluginEnabled,
}: {
  settings: AppSettings;
  setPluginEnabled: (id: string, enabled: boolean) => void;
}) {
  const t = useT();
  const core = allPlugins().filter((p) => p.core);
  const optional = optionalPlugins();

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.tools.intro")}</p>

      <Section title={t("settings.tools.coreTitle")}>
        <p className="text-xs text-muted">{t("settings.tools.coreHint")}</p>
        <ul className="flex flex-col gap-1">
          {core.map((plugin) => (
            <li key={plugin.id}>
              <ToolRow plugin={plugin} checked locked />
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("settings.tools.optionalTitle")}>
        <p className="text-xs text-muted">{t("settings.tools.optionalHint")}</p>
        {optional.length === 0 ? (
          <p className="text-sm text-muted">{t("settings.tools.none")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {optional.map((plugin) => (
              <li key={plugin.id}>
                <ToolRow
                  plugin={plugin}
                  checked={settings.enabledPlugins.includes(plugin.id)}
                  onChange={(next) => setPluginEnabled(plugin.id, next)}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** One tool: glyph, name, what it does — and the switch that puts it in the
 *  toolbar. A locked row is on and stays on. */
function ToolRow({
  plugin,
  checked,
  locked = false,
  onChange,
}: {
  plugin: PaintPlugin;
  checked: boolean;
  locked?: boolean;
  onChange?: (next: boolean) => void;
}) {
  const t = useT();
  const Icon = plugin.icon;
  const name = t(plugin.nameKey);
  return (
    <label
      className={`flex items-center gap-3 rounded px-1 py-1.5 ${
        locked ? "" : "cursor-pointer hover:bg-surface-2"
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
          {plugin.shortcut && (
            <span className="text-xs text-muted">
              {t("settings.tools.shortcut", {
                key: plugin.shortcut.toUpperCase(),
              })}
            </span>
          )}
        </span>
        <span className="block text-xs text-muted">
          {t(plugin.descriptionKey)}
        </span>
      </span>

      <Switch
        checked={checked}
        disabled={locked}
        label={name}
        hint={locked ? t("settings.tools.alwaysOn") : undefined}
        onChange={(next) => onChange?.(next)}
      />
    </label>
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
