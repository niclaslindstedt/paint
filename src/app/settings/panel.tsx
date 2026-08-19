// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { ReactNode } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ListIcon,
  PaletteIcon,
  Section,
  SparklesIcon,
  type IconProps,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import { ImageIcon } from "../icons.tsx";
import {
  isItemOn,
  orderedSections,
  type PanelSection,
} from "../panelSections.ts";
import type { AppSettings } from "../useAppSettings.ts";
import { Switch } from "./toolRow.tsx";

// Settings → Panel: the right-hand panel with its lid off.
//
// It is the Tools tab's twin, and deliberately so — one list, in the order the
// thing actually appears in, with the arrows that put it in another one and a
// switch on every row. A user who has arranged their toolbar here already knows
// how to arrange their panel, and neither page is a *description* of the surface
// it edits: it is that surface with the lid off.
//
// It goes one level deeper than the toolbar's does, because a panel section is
// not one button. Under each section are the things inside it — the page
// actions, the effects, the controls on a layer row — each with a switch of its
// own, so "I never mirror a page" and "I never want an Effects section at all"
// are two different answers rather than one blunt one. They are indented under
// their section and dimmed when it is off: a switch that changes nothing while
// its parent is off should look like one.
//
// Nothing here is staged. The panel is *behind the dialog*, so a section you
// switch off leaves it as you press the switch — the same live-apply the tools
// switchboard uses, and the same reason (see `LIVE_SETTINGS`).

/** The mark each section wears in the list — the same job the tool's own glyph
 *  does on a `ToolRow`, which is to make the list scannable as a set of things
 *  rather than a wall of sentences.
 *
 *  Here rather than on the descriptor because `panelSections.ts` is pure and
 *  DOM-free: what a section *is* has no icon in it, and a page that shows one is
 *  the only thing that needs to answer this. A section this map has never heard
 *  of falls back to the generic list mark rather than rendering a hole. */
const SECTION_ICONS: Record<string, (p: IconProps) => ReactNode> = {
  page: ImageIcon,
  effects: SparklesIcon,
  color: PaletteIcon,
  layers: ListIcon,
};

export function PanelTab({
  settings,
  setPanelSectionEnabled,
  setPanelItemEnabled,
  movePanelSection,
}: {
  settings: AppSettings;
  setPanelSectionEnabled: (id: string, enabled: boolean) => void;
  setPanelItemEnabled: (id: string, enabled: boolean) => void;
  /** Move a row within the order — handed the whole order it is a permutation
   *  of, for the reason `order.ts` gives. */
  movePanelSection: (
    order: readonly string[],
    from: number,
    to: number,
  ) => void;
}) {
  const t = useT();
  const sections = orderedSections(settings.panelOrder);
  const order = sections.map((section) => section.id);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.panel.intro")}</p>

      <Section title={t("settings.panel.sectionsTitle")}>
        <p className="text-xs text-muted">{t("settings.panel.sectionsHint")}</p>
        <ul className="flex flex-col gap-1">
          {sections.map((section, index) => (
            <li key={section.id}>
              <SectionRow
                section={section}
                on={!settings.hiddenPanelSections.includes(section.id)}
                hiddenItems={settings.hiddenPanelItems}
                onChange={(next) => setPanelSectionEnabled(section.id, next)}
                onItemChange={setPanelItemEnabled}
                onMoveUp={
                  index > 0
                    ? () => movePanelSection(order, index, index - 1)
                    : undefined
                }
                onMoveDown={
                  index < sections.length - 1
                    ? () => movePanelSection(order, index, index + 1)
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** One section: the row that switches the whole thing off and moves it, and the
 *  indented list of what is inside it. */
function SectionRow({
  section,
  on,
  hiddenItems,
  onChange,
  onItemChange,
  onMoveUp,
  onMoveDown,
}: {
  section: PanelSection;
  on: boolean;
  hiddenItems: readonly string[];
  onChange: (next: boolean) => void;
  onItemChange: (id: string, next: boolean) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const t = useT();
  const Icon = SECTION_ICONS[section.id] ?? ListIcon;
  const title = t(section.titleKey);

  return (
    <div className="rounded border border-line">
      <div className="flex items-center gap-2 px-1 py-1.5">
        <span
          aria-hidden="true"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border ${
            on
              ? "border-accent/60 bg-accent/10 text-accent"
              : "border-line text-muted"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm text-fg-bright">{title}</span>
          <span className="block text-xs text-muted">{t(section.hintKey)}</span>
        </span>

        {/* Where it sits. The same pair of arrows the toolbar's rows carry, and
            for the same reasons: this list is read on a phone as often as on a
            desktop, a drag inside a scrolling dialog fights the scroll, and two
            arrows are reachable from a keyboard and a screen reader. The grip on
            the panel's own headings is the *other* way to do this, for the hand
            that is already over there. */}
        <span className="flex shrink-0 items-center gap-0.5">
          <MoveButton
            label={t("settings.panel.moveUp", { name: title })}
            onClick={onMoveUp}
          >
            <ChevronUpIcon className="h-4 w-4" />
          </MoveButton>
          <MoveButton
            label={t("settings.panel.moveDown", { name: title })}
            onClick={onMoveDown}
          >
            <ChevronDownIcon className="h-4 w-4" />
          </MoveButton>
        </span>

        <Switch checked={on} label={title} onChange={onChange} />
      </div>

      {/* What is in it. Still switchable while the section is off — you are
          setting up a section you may well switch back on — but dimmed, because
          a control that changes nothing you can see should not look live. */}
      <div
        className={`border-t border-line px-2 py-1.5 ${on ? "" : "opacity-50"}`}
      >
        <p className="pb-1 text-[11px] tracking-wide text-muted uppercase">
          {t("settings.panel.itemsHint")}
        </p>
        <ul className="flex flex-col">
          {section.items.map((item) => {
            const name = t(item.nameKey);
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 py-1 pl-1"
                title={t(item.hintKey)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{name}</span>
                  <span className="block text-xs text-muted">
                    {t(item.hintKey)}
                  </span>
                </span>
                <Switch
                  checked={isItemOn(hiddenItems, item.id)}
                  label={name}
                  onChange={(next) => onItemChange(item.id, next)}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** One of the two arrows. Rendered disabled rather than omitted at the ends of
 *  the list, so the rows stay the same width and nothing jumps sideways as a
 *  section is walked up the panel. */
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
