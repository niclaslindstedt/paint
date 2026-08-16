// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState, type ReactNode } from "react";

import {
  Button,
  PencilIcon,
  PlusIcon,
  Section,
} from "@niclaslindstedt/oss-framework/components";

import {
  currentScreenCanvasSize,
  allSizePresets,
  type SizePreset,
} from "../canvasSize.ts";
import {
  canAddCanvasPreset,
  canvasPresetById,
  removeCanvasPreset,
  saveCanvasPreset,
  withHidden,
  MAX_CANVAS_PRESETS,
  type CanvasKit,
  type CanvasPresetDraft,
} from "../canvasPresets.ts";
import { useT } from "../i18n/index.ts";
import { EyeIcon, EyeOffIcon, ToolboxIcon } from "../icons.tsx";
import { orderedEntries } from "../plugins/registry.ts";
import { DEFAULT_CANVAS } from "../types.ts";
import type { AppSettings } from "../useAppSettings.ts";
import { CanvasPresetEditor } from "./canvasPreset.tsx";

// Settings → Canvas: the shelf New image offers, from the other end.
//
// **This page is that shelf.** The shipped sizes with an eye beside each — one
// you never reach for is one cell of comparison in the way of the four you do —
// and under them the pages you set up yourself: a name, a size, and optionally
// the kit of tools that page is worked with (see `canvasPresets.ts`). Nothing here
// changes a drawing that exists; a page's size was baked in when it was made.
//
// **A shipped size is hidden, never deleted.** They are four answers this build
// ships rather than four rows a user owns, so the eye is the whole of what a row
// of them offers. A preset you made offers the other verb — a pencil, opening it
// for editing — and the bin lives inside that editor rather than on the row,
// beside the fields it is about to throw away: a list where one press renames and
// the press next to it destroys is a list you have to aim at.
//
// **The whole page applies live**, like the tool switchboard beside it: it is a
// list you manage rather than a preference you tune, and the New image dialog it
// feeds is not open while you are here. The one staged thing is a canvas preset
// with the editor open on it, which stages itself (see `canvasPreset.tsx`).

export function CanvasTab({
  settings,
  update,
  dark,
}: {
  settings: AppSettings;
  /** Whether the app is painting dark — the page the editor's stock swatches
   *  are shown on. */
  dark: boolean;
  /** Applied live, like the switchboard: this page is device state, not a
   *  staged draft (see `SettingsModal`). */
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  const t = useT();
  // Which canvas preset the editor is open on, or a blank one being made. `null`
  // is the list.
  const [editing, setEditing] = useState<CanvasPresetDraft | null>(null);
  // The shipped sizes, all of them and in the app's own orientation — the shelf
  // turns to face the screen, but a settings list that flipped with the phone
  // would be a list whose rows changed shape in your hand.
  const [sizes] = useState<SizePreset[]>(() =>
    allSizePresets(currentScreenCanvasSize()),
  );

  const presets = settings.canvasPresets;
  const hidden = settings.hiddenCanvasSizes;
  const dimensions = (size: { width: number; height: number }) =>
    t("newImage.dimensions", {
      width: String(size.width),
      height: String(size.height),
    });

  if (editing) {
    const existing = canvasPresetById(presets, editing.id);
    return (
      <CanvasPresetEditor
        draft={editing}
        seed={seedKit(settings)}
        dark={dark}
        onSave={(next) => {
          update("canvasPresets", saveCanvasPreset(presets, next));
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
        onDelete={
          existing
            ? () => {
                update(
                  "canvasPresets",
                  removeCanvasPreset(presets, existing.id),
                );
                setEditing(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.canvas.intro")}</p>

      <Section title={t("settings.canvas.sizesTitle")}>
        <p className="text-xs text-muted">{t("settings.canvas.sizesHint")}</p>
        <ul className="flex flex-col gap-1">
          {sizes.map((preset) => {
            const off = hidden.includes(preset.id);
            const name = t(`newImage.presets.${preset.id}`);
            return (
              <li key={preset.id}>
                <ShelfRow
                  name={name}
                  detail={dimensions(preset.size)}
                  dim={off}
                >
                  <RowButton
                    label={
                      off
                        ? t("settings.canvas.show", { name })
                        : t("settings.canvas.hide", { name })
                    }
                    pressed={!off}
                    onClick={() =>
                      update(
                        "hiddenCanvasSizes",
                        withHidden(hidden, preset.id, !off),
                      )
                    }
                  >
                    {off ? (
                      <EyeOffIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </RowButton>
                </ShelfRow>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("settings.canvas.presetsTitle")}>
        <p className="text-xs text-muted">{t("settings.canvas.presetsHint")}</p>
        {presets.length > 0 && (
          <ul className="flex flex-col gap-1">
            {presets.map((preset) => (
              <li key={preset.id}>
                <ShelfRow
                  name={preset.name}
                  detail={dimensions(preset.size)}
                  // A page that brings its own tools says so in the row, with
                  // the same mark it wears on the shelf.
                  mark={
                    preset.kit ? (
                      <ToolboxIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : undefined
                  }
                >
                  <RowButton
                    label={t("settings.canvas.edit", { name: preset.name })}
                    // Opened as a draft — a copy, so cancelling an edit leaves
                    // the preset on the shelf exactly as it was.
                    onClick={() => setEditing({ ...preset })}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </RowButton>
                </ShelfRow>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={!canAddCanvasPreset(presets)}
            onClick={() =>
              setEditing({ name: "", size: { ...DEFAULT_CANVAS } })
            }
          >
            <span className="flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              {t("settings.canvas.add")}
            </span>
          </Button>
          {!canAddCanvasPreset(presets) && (
            <span className="text-xs text-muted">
              {t("settings.canvas.full", { n: String(MAX_CANVAS_PRESETS) })}
            </span>
          )}
        </div>
      </Section>
    </div>
  );
}

/** The kit a new canvas preset's tools start from: the app-wide toolbar exactly as
 *  it stands, switches and order alike. The order is written out in full rather
 *  than left empty, so the arrows in the editor have a list to walk even on an
 *  install that has never reordered anything. */
function seedKit(settings: AppSettings): CanvasKit {
  return {
    tools: [...settings.enabledPlugins],
    order: orderedEntries(settings.toolOrder).map((entry) => entry.id),
  };
}

/** One row of either list: what it is called, how big it is, and the one button
 *  that acts on it. */
function ShelfRow({
  name,
  detail,
  dim = false,
  mark,
  children,
}: {
  name: string;
  detail: string;
  /** A hidden size is dimmed rather than struck out or moved: it is still one of
   *  the four, and the eye beside it is the whole of what changed. */
  dim?: boolean;
  mark?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded px-1 py-1.5 ${
        dim ? "opacity-50" : ""
      }`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate text-sm text-fg-bright">{name}</span>
        {mark}
      </span>
      <span className="shrink-0 text-[11px] text-muted tabular-nums">
        {detail}
      </span>
      {children}
    </div>
  );
}

/** One row's button — the same 28-pixel glyph the tool rows' arrows are. */
function RowButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent text-muted hover:border-line hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </button>
  );
}
