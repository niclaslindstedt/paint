// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

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
// **Nothing here is a mode.** A chip lights up when the tool currently *is*
// what it describes, which is an observation and not a state: move a dial
// afterwards and the light goes out, and nothing has been entered or left.
// That is why there is no way to "close" a preset — there is nothing open.
//
// The save box is the panel's one text field, and it opens with a name already
// in it, so saving is two presses for someone who does not care what it is
// called and a rename away for someone who does.

type Props = {
  presets: readonly ToolPreset[];
  /** What the tool is set to right now — what a save would capture, and what a
   *  chip is compared against to decide whether it is the one in your hand. */
  size: number;
  dials: Readonly<Record<string, number>>;
  onApply: (preset: ToolPreset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
};

export function PresetBar({
  presets,
  size,
  dials,
  onApply,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const current = activePreset(presets, size, dials);

  // The box closes when the panel does, so re-opening the picker never finds a
  // half-typed name from ten minutes ago sitting in it.
  useEffect(() => () => setNaming(false), []);

  const save = () => {
    const name = presetName(draft);
    if (!name) return;
    onSave(name);
    setNaming(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-wide text-muted uppercase">
          {t("canvas.presets")}
        </span>
        <button
          type="button"
          onClick={() => {
            // Opened with a name in it: "Preset 3" is a worse name than the one
            // you would have typed and a much better one than an empty box you
            // have to fill in before the button does anything.
            setDraft(
              current?.name ??
                nextPresetName(presets, t("canvas.presetDefaultName")),
            );
            setNaming((open) => !open);
          }}
          className="cursor-pointer text-xs text-muted hover:text-fg-bright"
        >
          {t("canvas.savePreset")}
        </button>
      </div>

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <span key={preset.id} className="relative inline-flex">
              <button
                type="button"
                onClick={() => onApply(preset)}
                aria-pressed={preset.id === current?.id}
                title={preset.name}
                className={`max-w-[9.5rem] cursor-pointer truncate rounded border px-2 py-1 text-xs ${
                  preset.id === current?.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-fg hover:bg-surface-2"
                }`}
              >
                {preset.name}
              </button>
              {/* The same corner cross the kept widths wear, for the same
                  reason: a saved thing you cannot unsave is a list that only
                  ever grows. */}
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
      )}

      {naming && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={draft}
            autoFocus
            onChange={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setNaming(false);
            }}
            aria-label={t("canvas.savePresetName")}
            placeholder={t("canvas.savePresetPlaceholder")}
            className="min-w-0 flex-1 rounded border border-line bg-surface-2 px-2 py-1 text-xs text-fg"
          />
          <button
            type="button"
            onClick={save}
            disabled={!presetName(draft)}
            className="shrink-0 cursor-pointer rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-muted"
          >
            {t("canvas.presetSave")}
          </button>
        </div>
      )}
    </div>
  );
}
