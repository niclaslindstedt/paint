// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import {
  Glyph,
  GlyphPicker,
  GLYPH_NAMES,
} from "@niclaslindstedt/oss-framework/glyphs";

import { useT } from "../i18n/index.ts";
import {
  activePreset,
  nextPresetName,
  presetName,
  type ToolPreset,
} from "../presets.ts";

// The tools a user built for themselves, at the top of the panel.
//
// **It goes first, above the width.** Everything below it is the machinery for
// making a tool; this is the tool you already made. A painter who has saved
// "my sketching pencil" is not opening this panel to rediscover 0.7 mm and a
// 4B — they are opening it to press one chip and get back to the drawing, and
// anything that press has to scroll past is a tax on the common case.
//
// **A chip is a whole tool.** Pressing one sets the width and every dial at
// once, so what it restores is the thing you saved rather than a width that
// happens to be a starting point (see `presets.ts`).
//
// **A chip wears a mark.** A row of saved tools is read at a glance and mostly
// with a thumb, and four chips of similar words are four chips you have to
// *read*. A glyph is not — the star is the one you always reach for, the leaf
// is the one you sketch plants with — so saving one asks for a mark as well as
// a name, from the same catalogue a drawing's own mark comes from.
//
// **Nothing here is a mode.** A chip lights up when the tool currently *is*
// what it describes, which is an observation and not a state: move a dial
// afterwards and the light goes out, and nothing has been entered or left.
// That is why there is no way to "close" a preset — there is nothing open.
//
// **And it is not there at all until there is something in it.** An empty
// heading over an empty row is a promise of a feature rather than a feature;
// the way in is the star beside the panel's title (see `SizePicker`).

type Props = {
  presets: readonly ToolPreset[];
  /** What the tool is set to right now — what a save would capture, and what a
   *  chip is compared against to decide whether it is the one in your hand. */
  size: number;
  dials: Readonly<Record<string, number>>;
  onApply: (preset: ToolPreset) => void;
  onSave: (name: string, glyph: string | null) => void;
  onDelete: (id: string) => void;
  /** Whether the save form is open. Owned by the panel, because the button
   *  that opens it sits in the panel's title row rather than here. */
  saving: boolean;
  /** Close it — sent when a save lands, and when the form is cancelled. */
  onDone: () => void;
};

export function PresetBar({
  presets,
  size,
  dials,
  onApply,
  onSave,
  onDelete,
  saving,
  onDone,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [glyph, setGlyph] = useState<string | null>(null);
  const current = activePreset(presets, size, dials);

  // The form opens with a name already in it — "Preset 3" is a worse name than
  // the one you would have typed and a much better one than an empty box you
  // have to fill in before the button does anything — and with whatever the
  // tool is already saved as, so pressing the star on a saved tool is how you
  // save *over* it.
  useEffect(() => {
    if (!saving) return;
    setDraft(
      current?.name ?? nextPresetName(presets, t("canvas.presetDefaultName")),
    );
    setGlyph(current?.glyph ?? null);
    // Keyed on the form opening: typing must not fight a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);

  const save = () => {
    const name = presetName(draft);
    if (!name) return;
    onSave(name, glyph);
    onDone();
  };

  if (presets.length === 0 && !saving) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {presets.length > 0 && (
        <>
          <span className="text-xs font-bold tracking-wide text-muted uppercase">
            {t("canvas.presets")}
          </span>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <span key={preset.id} className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => onApply(preset)}
                  aria-pressed={preset.id === current?.id}
                  title={preset.name}
                  className={`inline-flex max-w-[9.5rem] cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${
                    preset.id === current?.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-fg hover:bg-surface-2"
                  }`}
                >
                  {preset.glyph && (
                    <Glyph
                      name={preset.glyph}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                  )}
                  <span className="truncate">{preset.name}</span>
                </button>
                {/* A saved thing you cannot unsave is a list that only ever
                    grows. */}
                <button
                  type="button"
                  onClick={() => onDelete(preset.id)}
                  aria-label={`${t("canvas.presetForget")} ${preset.name}`}
                  title={t("canvas.presetForget")}
                  className="absolute -top-1 -right-1 h-3.5 w-3.5 cursor-pointer rounded-full border border-line bg-surface text-[9px] leading-none text-muted hover:text-fg-bright"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      {saving && (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-surface-2/50 p-2">
          <span className="text-xs text-muted">
            {t("canvas.savePresetName")}
          </span>
          <input
            type="text"
            value={draft}
            autoFocus
            onChange={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") onDone();
            }}
            aria-label={t("canvas.savePresetName")}
            placeholder={t("canvas.savePresetPlaceholder")}
            className="w-full rounded border border-line bg-surface px-2 py-1 text-xs text-fg"
          />
          {/* The same catalogue a drawing's own mark comes from, so the app has
              one glyph vocabulary rather than two. */}
          <span className="text-xs text-muted">
            {t("canvas.savePresetGlyph")}
          </span>
          <GlyphPicker
            glyphs={GLYPH_NAMES}
            value={glyph}
            onChange={setGlyph}
            noneLabel={t("canvas.presetNoGlyph")}
            ariaLabelPrefix={t("canvas.savePresetGlyph")}
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onDone}
              className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg-bright"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!presetName(draft)}
              className="cursor-pointer rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-muted"
            >
              {t("canvas.presetSave")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
