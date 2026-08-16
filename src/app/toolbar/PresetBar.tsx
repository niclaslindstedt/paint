// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import {
  Glyph,
  GlyphPicker,
  GLYPH_NAMES,
} from "@niclaslindstedt/oss-framework/glyphs";

import { useT } from "../i18n/index.ts";
import type { PaintPlugin } from "../plugins/types.ts";
import type { ToolPresetOption } from "../plugins/presets.ts";
import {
  activePreset,
  nextPresetName,
  presetName,
  type PresetSettings,
  type ToolPreset,
} from "../presets.ts";
import { PressPreview } from "./PressPreview.tsx";

// Whole tools, one press away — at the top of the panel, in two rows.
//
// **Presets** are the ones the tool came with: the settings its medium is
// actually used at, named by whoever made the tool (see
// `plugins/builtin/presets.ts`). They are the answer to the problem the dials
// below them create. Five sliders is a tool a professional can build and a
// beginner cannot — nobody arrives at dry-brush by dragging the splay up and
// the hardness down to see what happens — so the tool arrives with the four or
// five ways it is actually held, under the names a shop would use. A beginner
// who never opens Advanced still gets the whole instrument.
//
// **Saved** are the ones the user built (see `presets.ts`), under a name and a
// mark they chose. They sit *under* the shipped row because the shipped row is
// there on the first run and this one is not — and because "the ones I made"
// reads as a shelf of its own rather than as more of the same.
//
// Both rows go **above the width**. Everything below them is the machinery for
// making a tool; these are the tools already made. A painter who has a chip for
// what they want is not opening this panel to rediscover 0.7 mm and a 4B, and
// anything that press has to scroll past is a tax on the common case.
//
// **A chip is a whole tool.** Pressing one sets the width and every dial at
// once — including the dials it has no opinion about, which go back to their
// defaults, so a dry brush applied over a wet-in-wet is a dry brush and not
// some third thing.
//
// **A chip shows what it does.** The two rows say it differently on purpose. A
// shipped chip wears the **mark it makes** — a press with the tool as that
// preset sets it, painted by the painter that would paint it, exactly as the
// width row does (see `PressPreview`) — because its name is a word you may not
// know yet, and "wet-in-wet" is a great deal clearer when the chip beside it is
// visibly wetter. A saved chip wears the **mark you picked** for it, because
// you already know what it is: you made it, and a glyph is what you chose to
// know it by.
//
// **Nothing here is a mode.** A chip lights up when the tool currently *is*
// what it describes, which is an observation and not a state: move a dial
// afterwards and the light goes out, and nothing has been entered or left. That
// is also why a tool can light one chip in each row at once — the preset it
// came with, saved again under your own name is still both.
//
// The saved row is not there at all until there is something in it: an empty
// heading over an empty row is a promise of a feature rather than a feature,
// and the way in is the star beside the panel's title (see `SizePicker`).

/** The width a shipped preset is previewed at when its tool has none — the
 *  bucket. It is not a setting and no mark reads it: the preview simulates a
 *  press, and a press needs somewhere to land, so this only sets how big the
 *  blot the bucket is shown filling comes out (three times this, see
 *  `pressReach`).
 *
 *  Sized against the *feather*, which is the only thing there is to see: a
 *  fifty-pixel blot puts a three-millimetre soft edge at a fifth of its radius,
 *  where it reads as a soft edge. Ten times that and the same fill previews as
 *  a hard-edged disc — which is what the flat fill beside it already looks
 *  like, so the row would be three identical chips. */
const NO_WIDTH_PRESS = 16;

type Props = {
  /** The tool the panel is open over — it paints the shipped chips' previews. */
  plugin: PaintPlugin | undefined;
  /** The presets the tool ships with, dials already resolved
   *  (`plugins/presets.ts`). Empty for a tool that ships none, and then there
   *  is no shipped row at all. */
  builtin: readonly ToolPresetOption[];
  /** The tools the user saved for themselves. */
  presets: readonly ToolPreset[];
  /** What the tool is set to right now — what a save would capture, and what a
   *  chip is compared against to decide whether it is the one in your hand. */
  size: number;
  dials: Readonly<Record<string, number>>;
  /** The ink and the page the shipped chips' presses are painted in, so each
   *  one is the mark it would actually leave on your page. */
  color: string;
  background: string;
  filled: boolean;
  /** Put a preset in your hand — the same handler for both rows, because a
   *  preset is a width and a set of dials whoever named it. */
  onApply: (preset: PresetSettings) => void;
  onSave: (name: string, glyph: string | null) => void;
  onDelete: (id: string) => void;
  /** Whether the save form is open. Owned by the panel, because the button
   *  that opens it sits in the panel's title row rather than here. */
  saving: boolean;
  /** Close it — sent when a save lands, and when the form is cancelled. */
  onDone: () => void;
};

export function PresetBar({
  plugin,
  builtin,
  presets,
  size,
  dials,
  color,
  background,
  filled,
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

  if (builtin.length === 0 && presets.length === 0 && !saving) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <ShippedPresets
        plugin={plugin}
        presets={builtin}
        size={size}
        dials={dials}
        color={color}
        background={background}
        filled={filled}
        onApply={onApply}
      />

      <SavedPresets
        presets={presets}
        active={current?.id}
        onApply={onApply}
        onDelete={onDelete}
      />

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

/** The row of tools the *user* saved for this one.
 *
 *  Its own component for `ShippedPresets`'s reason: two panels show it — this
 *  one, and the tool editor inside a canvas preset, where a page is set up with
 *  a tool you already built. There the chips are the whole point ("my sketching
 *  pencil, on every sketchbook page") and there is nothing to unsave, which is
 *  why the × is the one thing that is optional.
 *
 *  Not there at all until something has been saved: an empty heading over an
 *  empty row is a promise of a feature rather than a feature. */
export function SavedPresets({
  presets,
  active,
  onApply,
  onDelete,
}: {
  presets: readonly ToolPreset[];
  /** The one the tool currently *is*, if it is one of them — an observation,
   *  not a mode (see this module's header). */
  active?: string;
  onApply: (preset: PresetSettings) => void;
  /** Absent where a saved tool is only being read, and then the chips carry no
   *  ×. */
  onDelete?: (id: string) => void;
}) {
  const t = useT();
  if (presets.length === 0) return null;

  return (
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
              aria-pressed={preset.id === active}
              title={preset.name}
              className={`inline-flex max-w-[9.5rem] cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${
                preset.id === active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-fg hover:bg-surface-2"
              }`}
            >
              {preset.glyph && (
                <Glyph name={preset.glyph} className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{preset.name}</span>
            </button>
            {/* A saved thing you cannot unsave is a list that only ever
                grows. */}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(preset.id)}
                aria-label={`${t("canvas.presetForget")} ${preset.name}`}
                title={t("canvas.presetForget")}
                className="absolute -top-1 -right-1 h-3.5 w-3.5 cursor-pointer rounded-full border border-line bg-surface text-[9px] leading-none text-muted hover:text-fg-bright"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    </>
  );
}

/** The row of presets a tool ships with.
 *
 *  Its own component because two panels show it: the size panel, above the
 *  saved row and the width, and the **cog** panel a tool with no width opens
 *  instead (see `DialPicker`). The bucket is the case — it has no nib to set
 *  and three fills worth having — and a preset that could only be reached
 *  through a panel of widths would be one the bucket could not have. */
export function ShippedPresets({
  plugin,
  presets,
  size,
  dials,
  color,
  background,
  filled,
  onApply,
}: {
  plugin: PaintPlugin | undefined;
  presets: readonly ToolPresetOption[];
  size: number;
  dials: Readonly<Record<string, number>>;
  color: string;
  background: string;
  filled: boolean;
  onApply: (preset: PresetSettings) => void;
}) {
  const t = useT();
  const current = activePreset(presets, size, dials);
  // The broadest press on the row: what every preview in it is scaled against,
  // so the row reads as one comparison rather than as four marks each fitted to
  // its own tile (the same rule the width row follows).
  const widest = presets.reduce(
    (top, preset) => Math.max(top, preset.size ?? NO_WIDTH_PRESS),
    0,
  );

  if (presets.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wide text-muted uppercase">
        {t("canvas.builtinPresets")}
      </span>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset)}
            aria-pressed={preset.id === current?.id}
            title={t(preset.nameKey)}
            className={`inline-flex max-w-[9.5rem] cursor-pointer items-center gap-1 rounded border py-1 pr-2 pl-1 text-xs ${
              preset.id === current?.id
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-fg hover:bg-surface-2"
            }`}
          >
            {/* The mark this preset makes, with every one of its dials — the
                whole reason a word like "wet-in-wet" is worth putting on a
                chip. */}
            <PressPreview
              plugin={plugin}
              size={preset.size ?? NO_WIDTH_PRESS}
              of={widest}
              color={color}
              background={background}
              dials={preset.dials}
              filled={filled}
              box={18}
            />
            <span className="truncate">{t(preset.nameKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
