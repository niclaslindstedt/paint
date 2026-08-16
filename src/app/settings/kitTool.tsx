// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState, type ReactNode } from "react";

import {
  ChevronLeftIcon,
  Section,
} from "@niclaslindstedt/oss-framework/components";

import { resolveInk } from "../canvas.ts";
import {
  kitGroupTool,
  withGroupTool,
  withKitTool,
  type CanvasKit,
} from "../canvasPresets.ts";
import { useT } from "../i18n/index.ts";
import { dialDefault, resolveDials } from "../plugins/dials.ts";
import { usesSize } from "../plugins/controls.ts";
import { toolPresets } from "../plugins/presets.ts";
import { pluginById, type ToolbarEntry } from "../plugins/registry.ts";
import type { PaintPlugin } from "../plugins/types.ts";
import { activePreset, type PresetSettings } from "../presets.ts";
import { ShippedPresets, SavedPresets } from "../toolbar/PresetBar.tsx";
import { ToolDials } from "../toolbar/ToolDials.tsx";
import { WidthPicker } from "../toolbar/WidthPicker.tsx";
import { presetsFor, toolSize, type AppSettings } from "../useAppSettings.ts";
import { Switch } from "./toolRow.tsx";

// One tool of a canvas preset's kit, set up in advance.
//
// The kit above it answers *which* tools a page is worked with; this answers the
// other half of the same question — **which one of a family, and how each is
// set**. "The sketchbook opens with a pencil and an eraser" is not a sketchbook
// until the eraser is the kneaded one at 20 mm, and until now the only way to
// have that was to set it by hand every time you opened a sketchbook page.
//
// It is reached by pressing a tool's **glyph** in the kit list — the mark is the
// tool, so pressing the tool to set the tool up needs no button of its own — and
// it takes the page the way the preset editor takes the tab: a third list
// unfolded inside a scrolling dialog is three things scrolling on a phone. The
// way back is the way back everywhere else here, a heading with an arrow on it.
//
// **Two answers, and they are different kinds of thing.**
//
//   - *Default tool* — which member of a family the button opens on. A group
//     button always stands for one tool (see `groupMemberFor`), and without this
//     the answer is "whichever you used last", which is a fact about your
//     afternoon rather than about the page. Only a family has this section; a
//     lone tool is already the answer.
//   - *Its own settings* — a width and every dial, which is exactly a preset
//     (see `presets.ts`), so this section is the tool panel from over the canvas
//     with the same rows in the same order: the presets it ships with, the ones
//     you saved, the widths it is made in, its own knobs. Nothing here is a
//     second way to set a tool up.
//
// **Off by default, and per tool.** A kit that pinned every tool's width would
// be a page that fought you; the honest default is that a tool stays however the
// person drawing has it, and pinning is the thing you opt into for the two or
// three that make the page what it is.
//
// Nothing here lands until the preset editor's Save — it writes into that
// editor's staged kit, like every other control in it.

export function KitToolEditor({
  entry,
  kit,
  settings,
  pageColor,
  dark,
  onChange,
  onBack,
}: {
  /** The row that was pressed — a lone tool, or a whole family. */
  entry: ToolbarEntry;
  /** The kit being edited, staged in the preset editor. */
  kit: CanvasKit;
  /** The app's own settings: where a pinned tool is seeded from, and where the
   *  tools you have saved for yourself come from. */
  settings: AppSettings;
  /** The page a press is previewed on, and whether it is a dark one — the same
   *  pair the stock swatches are drawn against. */
  pageColor: string;
  dark: boolean;
  onChange: (next: CanvasKit) => void;
  onBack: () => void;
}) {
  const t = useT();
  const members = entry.kind === "group" ? entry.members : [entry.plugin];
  const pinnedMember =
    entry.kind === "group" ? kitGroupTool(kit, entry.id) : undefined;
  // Which member the settings below are about. It follows the default-tool row
  // — pressing a member is how you reach its settings — but it survives
  // "whichever you had last", so a family can be set up without its default
  // being pinned.
  const [focus, setFocus] = useState<string>(
    () => pinnedMember ?? shownMember(settings, entry) ?? members[0]?.id ?? "",
  );
  const plugin = pluginById(focus) ?? members[0];
  const descriptor = entry.kind === "group" ? entry.group : entry.plugin;
  // The ink every press below is painted in: the one the toolbar is holding,
  // resolved the way the canvas resolves it for a page that has pinned none.
  const ink = resolveInk(settings.color, dark);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 mb-3 flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-xs text-muted hover:text-fg-bright"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        <span>{t("settings.canvas.kitBack")}</span>
      </button>

      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-accent/60 bg-accent/10 text-accent"
        >
          <descriptor.icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm text-fg-bright">
            {t(descriptor.nameKey)}
          </span>
          <span className="block text-xs text-muted">
            {t(descriptor.descriptionKey)}
          </span>
        </span>
      </div>

      {/* Which of the family the button opens on. A row of the tools
          themselves, each wearing its own glyph, because that is what the
          toolbar button will show. */}
      {entry.kind === "group" && (
        <Section title={t("settings.canvas.kitDefaultTitle")}>
          <p className="text-xs text-muted">
            {t("settings.canvas.kitDefaultHint")}
          </p>
          <div className="flex flex-wrap gap-1">
            {/* Giving the answer back to the app is one of the answers, and
                the first: a family the page has no opinion about opens on
                whichever of them you used last, which is what every page did
                before a kit could say otherwise. */}
            <MemberChip
              label={t("settings.canvas.kitDefaultAny")}
              active={pinnedMember === undefined}
              onClick={() => onChange(withGroupTool(kit, entry.id, null))}
            />
            {members.map((member) => (
              <MemberChip
                key={member.id}
                label={t(member.nameKey)}
                icon={member.icon}
                active={pinnedMember === member.id}
                onClick={() => {
                  setFocus(member.id);
                  onChange(withGroupTool(kit, entry.id, member.id));
                }}
              />
            ))}
          </div>
        </Section>
      )}

      {plugin && (
        <KitToolSettings
          plugin={plugin}
          kit={kit}
          settings={settings}
          ink={ink}
          pageColor={pageColor}
          family={entry.kind === "group"}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** How one tool is set on this page: nothing at all, or a whole tool. */
function KitToolSettings({
  plugin,
  kit,
  settings,
  ink,
  pageColor,
  family,
  onChange,
}: {
  plugin: PaintPlugin;
  kit: CanvasKit;
  settings: AppSettings;
  ink: string;
  pageColor: string;
  /** Whether this tool is one of a family — then the section says which member
   *  it is setting up, because the row above chose it. */
  family: boolean;
  onChange: (next: CanvasKit) => void;
}) {
  const t = useT();
  const name = t(plugin.nameKey);
  const pinned = kit.toolSettings?.[plugin.id];
  const hasWidth = usesSize(plugin);
  // Every dial the tool offers, at the value this page sets it to — the same
  // resolved read the panel over the canvas renders from.
  const values = resolveDials(plugin, pinned?.dials);
  const size = pinned?.size ?? toolSize(settings, plugin.id);
  const builtin = toolPresets(plugin);
  const saved = presetsFor(settings, plugin.id);
  const dials = plugin.dials ?? [];
  /** Where one dial rests — 1 for a dial this build no longer declares, which
   *  is what every painter's own default argument already is. */
  const rest = (id: string) => {
    const dial = dials.find((d) => d.id === id);
    return dial ? dialDefault(dial) : 1;
  };

  /** Pin a whole tool — a preset chip, a width off the row, a dial moved. */
  const pin = (next: PresetSettings) =>
    onChange(
      withKitTool(kit, plugin.id, {
        ...(hasWidth ? { size: next.size ?? size } : {}),
        dials: resolveDials(plugin, next.dials),
      }),
    );

  return (
    <Section title={t("settings.canvas.kitToolTitle")}>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-fg-bright">
            {t("settings.canvas.kitOwnTool", { name })}
          </span>
          <span className="block text-xs text-muted">
            {t("settings.canvas.kitOwnToolHint", { name })}
          </span>
        </span>
        <Switch
          checked={pinned !== undefined}
          label={t("settings.canvas.kitOwnTool", { name })}
          // Seeded from the tool as you have it right now, so switching this on
          // is a starting point rather than a tool reset to the box — the same
          // rule the kit itself follows.
          onChange={(on) =>
            onChange(
              on
                ? withKitTool(kit, plugin.id, {
                    ...(hasWidth
                      ? { size: toolSize(settings, plugin.id) }
                      : {}),
                    dials: resolveDials(plugin, settings.toolDials[plugin.id]),
                  })
                : withKitTool(kit, plugin.id, null),
            )
          }
        />
      </div>

      {family && (
        <p className="text-xs text-muted">
          {t("settings.canvas.kitToolFocus", { name })}
        </p>
      )}

      {pinned && (
        <>
          <ShippedPresets
            plugin={plugin}
            presets={builtin}
            size={size}
            dials={values}
            color={ink}
            background={pageColor}
            filled={settings.filled}
            onApply={pin}
          />
          <SavedPresets
            presets={saved}
            active={activePreset(saved, size, values)?.id}
            onApply={pin}
          />

          {hasWidth && (
            <WidthPicker
              plugin={plugin}
              size={size}
              onPick={(next) => pin({ size: next, dials: values })}
              color={ink}
              background={pageColor}
              filled={settings.filled}
              dials={values}
            />
          )}

          {dials.length > 0 && (
            <ToolDials
              title={t("dials.advanced")}
              dials={dials}
              values={values}
              onChange={(dial, at) =>
                pin({
                  size,
                  dials: {
                    ...values,
                    // `null` is the panel's "back where it started", and here
                    // it is a value like any other: this page *says* the dial
                    // rests there, which is not the same as saying nothing
                    // about it (see `CanvasKit.toolSettings`).
                    [dial]: at ?? rest(dial),
                  },
                })
              }
              onReset={() => pin({ size, dials: resolveDials(plugin, {}) })}
              tuned={dials.some(
                (dial) => values[dial.id] !== dialDefault(dial),
              )}
            />
          )}
        </>
      )}
    </Section>
  );
}

/** One answer in the default-tool row: a tool with its own glyph, or the one
 *  answer that is not a tool at all. */
function MemberChip({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon?: (props: { className?: string }) => ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`inline-flex max-w-[16rem] cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-fg hover:bg-surface-2"
      }`}
    >
      {Icon && (
        <span aria-hidden="true" className="inline-flex shrink-0">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Which member a family's button stands for right now, as the app answers it —
 *  what the row shows lit while the page has no opinion of its own. */
function shownMember(
  settings: AppSettings,
  entry: ToolbarEntry,
): string | undefined {
  if (entry.kind !== "group") return entry.plugin.id;
  const remembered = settings.groupTools[entry.id];
  return entry.members.some((m) => m.id === remembered)
    ? remembered
    : entry.members[0]?.id;
}
