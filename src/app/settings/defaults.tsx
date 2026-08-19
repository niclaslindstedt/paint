// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  Section,
  SelectPicker,
} from "@niclaslindstedt/oss-framework/components";

import {
  DARK_INK,
  DARK_PAGE,
  LIGHT_INK,
  LIGHT_PAGE,
  PAGE_SWATCHES,
} from "../canvas.ts";
import { useT } from "../i18n/index.ts";
import { toolPresets } from "../plugins/presets.ts";
import { enabledPlugins, pluginById } from "../plugins/registry.ts";
import { paletteFor, type AppSettings } from "../useAppSettings.ts";

// Settings → General → Defaults: the four answers a fresh start is made of.
//
// **Why they are settings at all.** They used to be constants, and two of them
// were not even that — the page and the ink were read off the app theme, so
// what you got when you opened the app was a fact about your phone's dark mode
// rather than a choice anybody made. A drawing app has a starting state the way
// a stationer's has a default sheet, and the honest thing is to state it and
// then let it be changed (see `defaults.ts`).
//
// **What each one reaches.** The page and the ink are resolved at paint time,
// so changing them re-sheets and re-inks every page that never chose for itself
// — including the ones already drawn — and touches none that did. The tool and
// its preset are the opposite: they are what you are *handed*, at a fresh
// install and when the last sheet is deleted, and nothing about a page you are
// in the middle of changes when you set them here.

/** One round chip: a colour, or the two-tone one that means "follow the app
 *  theme". A row of them rather than a dropdown because a colour is the one
 *  setting where the value *is* its own label. */
function Swatch({
  color,
  label,
  selected,
  onSelect,
}: {
  /** The colour to show, or the two light/dark pair for "follow the theme". */
  color: string | readonly [string, string];
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const style =
    typeof color === "string"
      ? { backgroundColor: color }
      : {
          backgroundImage: `linear-gradient(135deg, ${color[0]} 50%, ${color[1]} 50%)`,
        };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={`h-7 w-7 cursor-pointer rounded-full border-2 ${
        selected ? "border-accent" : "border-line"
      }`}
      style={style}
    />
  );
}

/** A labelled row of chips, with "follow the theme" first — the answer this app
 *  had before there was a choice, and still a real one. */
function ColorRow({
  label,
  hint,
  colors,
  names,
  themePair,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  colors: readonly string[];
  /** What to call each colour, where it has a name worth printing. */
  names?: (color: string) => string;
  themePair: readonly [string, string];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-fg-bright">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-2"
      >
        <Swatch
          color={themePair}
          label={t("settings.defaults.followTheme")}
          selected={value === null}
          onSelect={() => onChange(null)}
        />
        {colors.map((color) => (
          <Swatch
            key={color}
            color={color}
            label={names?.(color) ?? color}
            selected={color === value}
            onSelect={() => onChange(color)}
          />
        ))}
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

export function DefaultsSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  const t = useT();

  // Every tool the toolbar offers that actually marks the page: being handed
  // the dropper or the hand on a fresh page is being handed nothing to draw
  // with. The same three descriptor flags `resolveActiveTool` reads, so nothing
  // here knows a tool by name.
  const tools = enabledPlugins(settings.enabledPlugins).filter(
    (plugin) => !plugin.navigates && !plugin.picksColor && !plugin.selects,
  );
  const plugin = pluginById(settings.defaultTool);
  // Both kinds, because a default of "my sketching pencil" is exactly what
  // somebody who has saved one wants (see `defaultPresetFor`).
  const shipped = toolPresets(plugin).map((preset) => ({
    id: preset.id,
    name: t(preset.nameKey),
  }));
  const saved = (settings.toolPresets[settings.defaultTool] ?? []).map(
    (preset) => ({ id: preset.id, name: preset.name }),
  );
  const presets = [...shipped, ...saved];

  const pageName = (color: string) => {
    const swatch = PAGE_SWATCHES.find((s) => s.color === color);
    return swatch ? t(swatch.nameKey) : color;
  };

  return (
    <Section title={t("settings.defaults.title")}>
      <p className="text-xs text-muted">{t("settings.defaults.intro")}</p>

      <ColorRow
        label={t("settings.defaults.page")}
        hint={t("settings.defaults.pageHint")}
        colors={PAGE_SWATCHES.map((swatch) => swatch.color)}
        names={pageName}
        themePair={[LIGHT_PAGE, DARK_PAGE]}
        value={settings.defaultPageColor}
        onChange={(next) => update("defaultPageColor", next)}
      />

      <ColorRow
        label={t("settings.defaults.ink")}
        hint={t("settings.defaults.inkHint")}
        colors={paletteFor(settings)}
        themePair={[LIGHT_INK, DARK_INK]}
        value={settings.defaultColor}
        onChange={(next) => update("defaultColor", next)}
      />

      <div className="flex flex-col gap-1">
        <span className="text-sm text-fg-bright">
          {t("settings.defaults.tool")}
        </span>
        <SelectPicker
          value={settings.defaultTool}
          ariaLabel={t("settings.defaults.tool")}
          options={tools.map((entry) => ({
            value: entry.id,
            label: t(entry.nameKey),
          }))}
          onChange={(next) => {
            update("defaultTool", next);
            // A preset belongs to one tool, so the one named here cannot follow
            // the default to another: switching hands over the new tool as its
            // maker ships it, which is the only answer that is always true.
            update("defaultPreset", null);
          }}
        />
        <p className="text-xs text-muted">{t("settings.defaults.toolHint")}</p>
      </div>

      {presets.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.defaults.preset")}
          </span>
          <SelectPicker
            value={settings.defaultPreset ?? ""}
            ariaLabel={t("settings.defaults.preset")}
            options={[
              { value: "", label: t("settings.defaults.stockPreset") },
              ...presets.map((preset) => ({
                value: preset.id,
                label: preset.name,
              })),
            ]}
            onChange={(next) => update("defaultPreset", next || null)}
          />
          <p className="text-xs text-muted">
            {t("settings.defaults.presetHint")}
          </p>
        </div>
      )}
    </Section>
  );
}
