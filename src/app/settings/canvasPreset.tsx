// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import {
  Button,
  ChevronLeftIcon,
  LABELED_FIELD_CLASS,
  Section,
} from "@niclaslindstedt/oss-framework/components";

import { isDarkColor, resolvePageColor } from "../canvas.ts";
import {
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  parseCanvasSize,
} from "../canvasSize.ts";
import {
  MAX_CANVAS_PRESET_NAME,
  SOLID_STOCK,
  canvasPresetName,
  kitCustomizes,
  withTool,
  type CanvasKit,
  type CanvasPresetDraft,
} from "../canvasPresets.ts";
import { moveInOrder } from "../order.ts";
import { defaultGrain } from "../ground.ts";
import { GroundPicker } from "../GroundPicker.tsx";
import { useT } from "../i18n/index.ts";
import { orderedEntries, type ToolbarEntry } from "../plugins/registry.ts";
import type { Ground } from "../types.ts";
import type { AppSettings } from "../useAppSettings.ts";
import { KitToolEditor } from "./kitTool.tsx";
import { isCore, Switch, ToolRow } from "./toolRow.tsx";

// One canvas preset, open for editing — a name, a page size, the sheet that page
// is usually on, and the kit of tools it is worked with.
//
// **It takes the whole tab while it is open.** A list with an editor unfolded
// inside it is two scrolling things on a phone, and the tool list alone is
// sixteen rows; so the tab shows the shelf *or* one page of it, never both, and
// the way back is where the way back always is — a heading with an arrow on it.
//
// **The tools are opt-in, and off by default.** A canvas preset with no kit is a
// size with a name, and the toolbar stays whatever Settings → Tools says: that
// is the honest default, because most named pages are named for their shape
// rather than for how they are worked. Switching the kit on seeds it from the
// toolbar as it stands right now — nobody wants to build a sixteen-tool rack
// from nothing, and "the toolbar I have, minus three" is what a sketchbook
// actually is.
//
// **And each of those tools opens.** Pressing a row's glyph goes one level
// further in, to which member of a family the page's button stands for and how
// the tool itself is set — the kneaded rubber at 20 mm rather than "an eraser"
// (see `kitTool.tsx`). Nothing is seeded there: an empty answer is "however you
// have it", which is what every page did before a kit could say otherwise.
//
// **The sheet is a suggestion, and the tools are not.** Both are opt-in, but
// they land differently: a preset's tools *are* the toolbar of every page made on
// it, re-read every time one is opened, while its sheet is only what the New
// image dialog opens with — put there when the preset is picked, and still
// changeable in the shelf below before Create. That is not an inconsistency but
// the one difference that matters between the two: a toolbar can be changed
// tomorrow, and a sheet cannot, because every mark is painted into it (see
// `ground.ts`). So the binding half is the half that is safe to bind.
//
// **Nothing here lands until Save.** The tab around it applies live (see
// `SettingsModal`), but a half-typed name and a width mid-keystroke are not a
// canvas preset, and a page being edited must not repaint the New image shelf on
// every keypress. So this is the one staged surface in Settings that stages
// itself rather than the dialog's draft.

export function CanvasPresetEditor({
  draft,
  seed,
  settings,
  dark,
  onSave,
  onCancel,
  onDelete,
}: {
  /** The canvas preset being edited, or a blank one being made. */
  draft: CanvasPresetDraft;
  /** The kit switching "its own tools" on starts from — the app-wide toolbar as
   *  it stands right now (see the note above). */
  seed: CanvasKit;
  /** The app's own settings: where a tool set up for this page is seeded from,
   *  and where the tools you saved for yourself come from (see `kitTool.tsx`). */
  settings: AppSettings;
  /** Whether the app is painting dark — the two greys the stock swatches are
   *  drawn on, exactly as the new-image dialog resolves them. */
  dark: boolean;
  onSave: (next: CanvasPresetDraft) => void;
  onCancel: () => void;
  /** Absent while making a new one — there is nothing to throw away yet. */
  onDelete?: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(draft.name);
  // Held as text, like the typed page in New image: a half-typed number is the
  // user's business rather than something to round on every keystroke.
  const [size, setSize] = useState({
    width: String(draft.size.width),
    height: String(draft.size.height),
  });
  const [kit, setKit] = useState<CanvasKit | null>(draft.kit ?? null);
  // The sheet, as the picker holds it: a stock id and how far its grain shows.
  // `null` is "this preset says nothing about the sheet", which is not the same
  // as the plain solid one — that is a stock like any other, and a preset can
  // mean it.
  const [ground, setGround] = useState<Ground | null>(draft.ground ?? null);
  // The tool of the kit whose own page is open, or `null` for this one. A third
  // level, and it takes the page for the reason this editor takes the tab.
  const [tool, setTool] = useState<ToolbarEntry | null>(null);

  // The page the stock swatches are painted on. A canvas preset says nothing
  // about the page's *colour* — that is picked when the page is made — so the
  // shelf is shown on the sheet a colourless page has, which is what New image
  // shows before a colour is chosen.
  const pageColor = resolvePageColor(undefined, dark);
  const pageIsDark = isDarkColor(pageColor);

  const parsed = parseCanvasSize(size.width, size.height);
  const named = canvasPresetName(name);
  const ready = parsed !== null && named !== null;

  // One tool of the kit, open. It writes into the same staged kit as the list
  // it came from, so nothing it does lands until this editor's Save either.
  if (tool && kit) {
    return (
      <KitToolEditor
        entry={tool}
        kit={kit}
        settings={settings}
        pageColor={pageColor}
        dark={pageIsDark}
        onChange={setKit}
        onBack={() => setTool(null)}
      />
    );
  }

  return (
    <div>
      {/* The way back, and the name of what you are looking at. It is a button
          rather than a breadcrumb because it is the only way out that isn't
          Save — closing the dialog on a half-made canvas preset simply drops
          it. */}
      <button
        type="button"
        onClick={onCancel}
        className="-ml-1 mb-3 flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-xs text-muted hover:text-fg-bright"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        <span>{t("settings.canvas.back")}</span>
      </button>

      <Section title={t("settings.canvas.pageTitle")}>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.canvas.nameLabel")}
          </span>
          <input
            type="text"
            value={name}
            maxLength={MAX_CANVAS_PRESET_NAME}
            placeholder={t("settings.canvas.namePlaceholder")}
            onChange={(e) => setName(e.currentTarget.value)}
            className={LABELED_FIELD_CLASS}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <SideField
              label={t("newImage.width")}
              value={size.width}
              onChange={(width) => setSize((s) => ({ ...s, width }))}
            />
            <span className="pb-2 text-sm text-muted">×</span>
            <SideField
              label={t("newImage.height")}
              value={size.height}
              onChange={(height) => setSize((s) => ({ ...s, height }))}
            />
          </div>
          <p className={`text-xs ${parsed ? "text-muted" : "text-danger"}`}>
            {t("newImage.sizeHint", {
              min: String(MIN_CANVAS_SIDE),
              max: String(MAX_CANVAS_SIDE),
            })}
          </p>
        </div>
      </Section>

      <Section title={t("settings.canvas.toolsTitle")}>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-fg-bright">
              {t("settings.canvas.ownTools")}
            </span>
            <span className="block text-xs text-muted">
              {t("settings.canvas.ownToolsHint")}
            </span>
          </span>
          <Switch
            checked={kit !== null}
            label={t("settings.canvas.ownTools")}
            // Seeded from the toolbar as it stands, so switching this on is a
            // starting point rather than an empty rack (see the note above).
            onChange={(next) => setKit(next ? seed : null)}
          />
        </div>

        {kit && <KitList kit={kit} onChange={setKit} onOpen={setTool} />}
      </Section>

      <Section title={t("newImage.canvasTypeLabel")}>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-fg-bright">
              {t("settings.canvas.ownSheet")}
            </span>
            <span className="block text-xs text-muted">
              {t("settings.canvas.ownSheetHint")}
            </span>
          </span>
          <Switch
            checked={ground !== null}
            label={t("settings.canvas.ownSheet")}
            onChange={(next) => setGround(next ? { stock: SOLID_STOCK } : null)}
          />
        </div>

        {ground && (
          <>
            {/* The same shelf New image shows, painted on the same page — a
                stock is chosen by looking at it, here as much as there. */}
            <GroundPicker
              value={ground.stock === SOLID_STOCK ? undefined : ground.stock}
              texture={ground.texture ?? 1}
              onChange={(next) => {
                const stock = next.family === "solid" ? SOLID_STOCK : next.id;
                const grain = defaultGrain(
                  stock === SOLID_STOCK ? undefined : stock,
                );
                setGround({
                  stock,
                  ...(grain === 1 ? {} : { texture: grain }),
                });
              }}
              pageColor={pageColor}
              dark={pageIsDark}
              label={t("newImage.canvasTypeLabel")}
            />
            {ground.stock !== SOLID_STOCK && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("newImage.grainLabel", {
                    value: String(Math.round((ground.texture ?? 1) * 100)),
                  })}
                </span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={ground.texture ?? 1}
                  onChange={(e) => {
                    const texture = Number(
                      (e.target as HTMLInputElement).value,
                    );
                    setGround((held) =>
                      held
                        ? {
                            stock: held.stock,
                            ...(texture === 1 ? {} : { texture }),
                          }
                        : held,
                    );
                  }}
                  className="w-full cursor-pointer"
                />
              </label>
            )}
          </>
        )}
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <Button variant="danger" onClick={onDelete}>
            {t("common.delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              if (!named || !parsed) return;
              onSave({
                ...(draft.id ? { id: draft.id } : {}),
                name: named,
                size: parsed,
                ...(kit ? { kit } : {}),
                ...(ground ? { ground } : {}),
              });
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The tools this page is worked with — the same list Settings → Tools shows,
 *  writing into one canvas preset rather than into the app.
 *
 *  With one thing that list has no use for: **each row's glyph opens the tool**
 *  (see `kitTool.tsx`), where the page says which member of a family its button
 *  stands for and how the tool is set. A row wears a dot when this page has
 *  something of its own to say about it. */
function KitList({
  kit,
  onChange,
  onOpen,
}: {
  kit: CanvasKit;
  onChange: (next: CanvasKit) => void;
  onOpen: (entry: ToolbarEntry) => void;
}) {
  const t = useT();
  const entries = orderedEntries(kit.order);
  const order = entries.map((entry) => entry.id);
  return (
    <>
      <p className="text-xs text-muted">{t("settings.canvas.kitHint")}</p>
      <ul className="flex flex-col gap-1">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <ToolRow
              entry={entry}
              checked={isCore(entry) || kit.tools.includes(entry.id)}
              locked={isCore(entry)}
              onCustomize={() => onOpen(entry)}
              customized={kitCustomizes(kit, entry.id, entryTools(entry))}
              onChange={(next) => onChange(withTool(kit, entry.id, next))}
              onMoveUp={
                index > 0
                  ? () =>
                      onChange({
                        ...kit,
                        order: moveInOrder(order, index, index - 1),
                      })
                  : undefined
              }
              onMoveDown={
                index < entries.length - 1
                  ? () =>
                      onChange({
                        ...kit,
                        order: moveInOrder(order, index, index + 1),
                      })
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The tools one row stands for: a family's members, or the lone tool itself. */
function entryTools(entry: ToolbarEntry): string[] {
  return entry.kind === "group"
    ? entry.members.map((member) => member.id)
    : [entry.plugin.id];
}

/** One side of the page. The same plain input the typed page in New image uses,
 *  and for the same reason: the two sides are validated together on every
 *  keystroke so Save can go dim the moment the pair stops being a page. */
function SideField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_CANVAS_SIDE}
        max={MAX_CANVAS_SIDE}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className={`${LABELED_FIELD_CLASS} tabular-nums`}
      />
    </label>
  );
}
