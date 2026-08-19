// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import {
  FloatingPanel,
  StarIcon,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { ToolPresetOption } from "../plugins/presets.ts";
import type { ToolOptionValue } from "../plugins/options.ts";
import type {
  PaintPlugin,
  ToolDial,
  ToolOption,
  ToolSwatch,
} from "../plugins/types.ts";
import type { PresetSettings, ToolPreset } from "../presets.ts";
import { atIdle } from "../tiles.ts";
import { MAX_PANEL_HEIGHT } from "./panel.ts";
import { PresetBar, presetTiles } from "./PresetBar.tsx";
import { warmPressTiles } from "./PressPreview.tsx";
import { ToolDials } from "./ToolDials.tsx";
import { ToolOptions, warmOptionPreviews } from "./ToolOptions.tsx";
import { ToolSwatches } from "./ToolSwatches.tsx";
import { WidthPicker, widthTiles } from "./WidthPicker.tsx";

// The tool panel: the tools you saved, the widths this tool is made in, and
// whatever else the tool in your hand has to tune.
//
// Three sections, top to bottom, in the order a hand reaches for them.
//
// **Presets**, then **Saved** — whole tools, one press away (see
// `PresetBar.tsx`). First, because a preset is the answer to the whole rest of
// the panel and pressing one should not mean scrolling past the machinery that
// made it.
//
// The first row is the settings the *tool* came with — the ways its medium is
// actually used, each chip wearing the mark it makes — and it is what a
// beginner has instead of four sliders and a guess. The second is the tools the
// *user* built; it is not there at all until something has been saved, and the
// way in is the **star** on the title row, which saves the tool as it is
// currently set under a name and a mark.
//
// Nothing in this panel closes it. Picking a width, applying a saved tool and
// turning a dial are all things you may want to do two of, and a panel that
// shut after the first made the second a re-open.
//
// **Width** — the five sizes the tool is made in and the slider through them
// (see `WidthPicker.tsx`, which is also how a canvas preset sets a tool's width
// in advance). There is no "keep this width" button: a width on its own was a
// worse version of a saved *tool*, which carries the dials with it and has a
// name and a mark on it — so the star in the title row is the only thing here
// that remembers anything.
//
// **The width belongs to the tool**, and so does everything else here. One
// pencil width, one brush width, one type size, one set of dials each — so
// reaching for the brush no longer costs you the pencil you had set.
//
// **Rendering** — the settings that are not about the next mark but about how
// marks of this kind are *painted*, for every drawing there is
// (`PaintPlugin.options`, and see `ToolOptions.tsx`). The watercolour brush is
// the only tool with any: which of the two watercolours this build paints with,
// and how finely the heavier of them resolves. They were a page in Settings, and
// this is where they belong — a wash engine is a property of the brush, and it
// is a choice nobody can make without painting with it.
//
// **Advanced** — the tool's own knobs, rendered from what it declares and
// nothing else (`PaintPlugin.dials`). Nothing in this file knows what any of
// them are, which is how a pencil comes to offer a ladder of lead grades and a
// watercolour brush three sliders about water without either being mentioned
// here.
//
// This panel is for a tool that *has* a width. One that doesn't (the bucket)
// gets its dials from a cog beside the ink instead — same section, same rows,
// no width above them (see `DialPicker.tsx` and `plugins/controls.ts`).

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** The tool the panel is opened over — it supplies the width row, and it is
   *  the one whose width is being set. */
  plugin: PaintPlugin | undefined;
  size: number;
  onPick: (size: number) => void;
  /** The ink and the page every width is previewed in — the press each button
   *  shows is the mark that button would actually make (see `PressPreview`). */
  color: string;
  background: string;
  /** The fill toggle, so a fillable tool previews solid when it is set solid. */
  filled: boolean;
  /** The presets the tool ships with, dials resolved (see
   *  `plugins/presets.ts`) — the row above the saved one. */
  builtinPresets: readonly ToolPresetOption[];
  /** The tools saved under a name for this tool (see `presets.ts`). */
  presets: readonly ToolPreset[];
  onApplyPreset: (preset: PresetSettings) => void;
  onSavePreset: (name: string, glyph: string | null) => void;
  onDeletePreset: (id: string) => void;
  /** What the tool in hand offers past its width, in the order it declared
   *  them. Empty for a tool with nothing to tune (the eraser, the hand), and
   *  then there is no Advanced section at all. */
  dials: readonly ToolDial[];
  /** Where those dials currently sit — every one of them, resolved, so the
   *  sliders have a value whether or not the user has touched one. */
  values: Readonly<Record<string, number>>;
  /** Move a dial — or forget it with `null`, which is what a slider dragged
   *  back to where it started sends, so nothing is kept that isn't doing
   *  anything. */
  onDialChange: (id: string, value: number | null) => void;
  /** The app-wide settings the tool declares, and where they sit — the section
   *  above the dials (see `plugins/options.ts`). Empty for every tool but the
   *  watercolour brush today, and then there is no such section at all. */
  options: readonly ToolOption[];
  optionValues: Readonly<Record<string, ToolOptionValue>>;
  onOptionChange: (id: string, value: ToolOptionValue) => void;
  /** The inks the tool carries of its own, in the order it declared them, and
   *  where they sit. Empty for every tool that draws with the toolbar's ink —
   *  which is every tool with a width today — and then there is no swatch
   *  section at all (see `plugins/swatches.ts`). */
  swatches: readonly ToolSwatch[];
  colors: Readonly<Record<string, string>>;
  onColorChange: (id: string, color: string | null) => void;
  /** The colours the user has mixed, offered beside the built-in palette. */
  customColors: readonly string[];
  /** Put this tool back the way it came. Offered only once something is
   *  actually off its default. */
  onResetDials: () => void;
  tuned: boolean;
};

export function SizePicker({
  open,
  onClose,
  anchor,
  plugin,
  size,
  onPick,
  color,
  background,
  filled,
  builtinPresets,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  dials,
  values,
  onDialChange,
  options,
  optionValues,
  onOptionChange,
  swatches,
  colors,
  onColorChange,
  customColors: mixedColors,
  onResetDials,
  tuned,
}: Props) {
  const t = useT();
  // Whether the save form is open. Owned here rather than in `PresetBar`,
  // because the button that opens it is the star in the title row.
  const [saving, setSaving] = useState(false);

  // A panel that is closed and opened again opens on its tools, not on a
  // half-typed name.
  useEffect(() => {
    if (!open) setSaving(false);
  }, [open]);

  // Paint the panel's pictures before anyone presses the button that opens it.
  //
  // Everything in here that is worth looking at is a real render — four preset
  // chips, five widths, and for the watercolour brush a whole sheet per engine
  // — and they used to be painted, all of them, in the effect flush that
  // followed the press. That is a third of a second of frozen thread on a
  // desktop and a good deal worse on a phone, and it is entirely avoidable: the
  // panel's props are known long before it opens, and a tile is a function of
  // nothing else (see `tiles.ts`).
  //
  // So the tiles are queued at idle while the panel is *closed*, one per frame,
  // and the panel that opens afterwards finds every one of them painted and
  // blits it. Warming again when the ink, the tool or a dial changes is what
  // keeps it warm for the panel you would actually open next; each pass is a
  // handful of map lookups when nothing has moved, and a pass that is overtaken
  // — the ink moved on while it was still queued — is taken back out rather
  // than painting pictures for a panel nobody will open.
  //
  // Keyed on what the panel would *show* rather than on the props it is handed:
  // the toolbar hands it a fresh preset array and a fresh dial record on every
  // render, and an effect that re-armed on those would cancel its own idle
  // callback for the whole of a gesture and warm nothing.
  const warmth = JSON.stringify([
    plugin?.id,
    color,
    background,
    filled,
    values,
    colors,
    builtinPresets.map((preset) => [preset.id, preset.size, preset.dials]),
    options.map((option) => option.id),
    optionValues,
  ]);
  useEffect(() => {
    if (open) return;
    let stopWarming = () => {};
    const stopIdle = atIdle(() => {
      const presses = warmPressTiles([
        ...presetTiles({
          plugin,
          presets: builtinPresets,
          color,
          background,
          filled,
        }),
        ...widthTiles({
          plugin,
          color,
          background,
          filled,
          dials: values,
          colors,
        }),
      ]);
      const pictures = warmOptionPreviews(
        options,
        optionValues,
        color,
        background,
      );
      stopWarming = () => {
        presses();
        pictures();
      };
    });
    return () => {
      stopIdle();
      stopWarming();
    };
    // `warmth` is everything in here that decides a picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, warmth]);

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      triggerRef={anchor}
      placement={{
        width: { kind: "max", maxPx: 264 },
        anchor: "left",
        gap: 14,
        coordinateSpace: "viewport",
      }}
      className="p-2"
    >
      {/* The panel's own scroller, inside the frame rather than on it: the
          floating panel sizes itself to what it is given and caps that at the
          room it has, so a child that stops growing is what stops the panel
          growing (see `MAX_PANEL_HEIGHT`). Putting the cap here also keeps the
          padding above and below the sections outside the scrolled area, so
          the content shears against the panel's edge rather than against its
          own margin. */}
      <div
        className="flex flex-col gap-2 overflow-y-auto overscroll-contain"
        style={{ maxHeight: MAX_PANEL_HEIGHT }}
      >
        {/* Whose panel this is, and the one way *out* of it: the star that
            saves the tool as it is now set.
            
            The star sits on the title row rather than over the saved chips
            because it is about **this tool**, which is what the title names —
            and because putting it there is what lets the saved section vanish
            entirely when nothing has been saved yet. A heading over an empty
            row is a promise of a feature; a star beside the tool's name is the
            feature. */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-wide text-muted uppercase">
            {plugin ? t(plugin.nameKey) : t("canvas.size")}
          </span>
          <button
            type="button"
            onClick={() => setSaving((open) => !open)}
            aria-expanded={saving}
            aria-label={t("canvas.savePreset")}
            title={t("canvas.savePreset")}
            className={`inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border ${
              saving
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:bg-surface-2 hover:text-fg-bright"
            }`}
          >
            <StarIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <PresetBar
          plugin={plugin}
          builtin={builtinPresets}
          presets={presets}
          size={size}
          dials={values}
          color={color}
          background={background}
          filled={filled}
          onApply={onApplyPreset}
          onSave={onSavePreset}
          onDelete={onDeletePreset}
          saving={saving}
          onDone={() => setSaving(false)}
        />

        {/* The widths this tool is made in — the same control the kit editor
            in Settings → Canvas sets a tool's width with, because they are the
            same decision made at two moments (see `WidthPicker.tsx`). */}
        <div className="border-t border-line pt-2">
          <WidthPicker
            plugin={plugin}
            size={size}
            onPick={onPick}
            color={color}
            background={background}
            filled={filled}
            dials={values}
            colors={colors}
          />
        </div>

        {/* …and its own inks, for a tool that mixes them. None of the tools
            that have a width do today — a swatch row belongs to the gradient,
            which has no width at all — but the seam is the descriptor's rather
            than the panel's, so one that lands with both gets both. */}
        {swatches.length > 0 && (
          <div className="border-t border-line pt-2">
            <ToolSwatches
              plugin={plugin}
              swatches={swatches}
              values={colors}
              onChange={onColorChange}
              customColors={mixedColors}
            />
          </div>
        )}

        {/* The settings that are not about the next mark at all: which of a
            medium's renderings is painting, for every drawing (see
            `ToolOptions`). Above the dials rather than below them, because it
            is the coarser question — the dials tune what this picks — and
            because the answers are *pictures*: a comparison you have to scroll
            a rack of sliders to reach is a comparison nobody makes. */}
        {options.length > 0 && (
          <div className="border-t border-line pt-2">
            <ToolOptions
              title={t("options.title")}
              options={options}
              values={optionValues}
              onChange={onOptionChange}
              color={color}
              background={background}
            />
          </div>
        )}

        {/* The tool's own knobs, under the width they are past. Absent
            entirely for a tool that has none, rather than shown empty: a
            heading over nothing is a worse answer than no heading. */}
        {dials.length > 0 && (
          <div className="border-t border-line pt-2">
            <ToolDials
              title={t("dials.advanced")}
              dials={dials}
              values={values}
              onChange={onDialChange}
              onReset={onResetDials}
              tuned={tuned}
            />
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
