// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import {
  FloatingPanel,
  StarIcon,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import {
  FINE_BAND,
  REAL_BAND,
  formatSize,
  isRealSize,
  positionOf,
  sizeAt,
  stepNote,
  type SizeGauge,
} from "../plugins/gauge.ts";
import type { ToolPresetOption } from "../plugins/presets.ts";
import type { ToolOptionValue } from "../plugins/options.ts";
import type {
  PaintPlugin,
  ToolDial,
  ToolOption,
  ToolSwatch,
} from "../plugins/types.ts";
import type { PresetSettings, ToolPreset } from "../presets.ts";
import { gaugeFor, sizesFor } from "../useAppSettings.ts";
import { PressPreview } from "./PressPreview.tsx";
import { PresetBar } from "./PresetBar.tsx";
import { ToolDials } from "./ToolDials.tsx";
import { ToolOptions } from "./ToolOptions.tsx";
import { ToolSwatches } from "./ToolSwatches.tsx";

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
// beginner has instead of five sliders and a guess. The second is the tools the
// *user* built; it is not there at all until something has been saved, and the
// way in is the **star** on the title row, which saves the tool as it is
// currently set under a name and a mark.
//
// Nothing in this panel closes it. Picking a width, applying a saved tool and
// turning a dial are all things you may want to do two of, and a panel that
// shut after the first made the second a re-open.
//
// **Width** — five buttons and a slider, and both of them are now about a real
// implement rather than about a number between 1 and 200.
//
//   - The five are **sizes a shop sells**: 0.3 / 0.5 / 0.7 / 0.9 / 2.0 mm of
//     pencil lead, a #2 through a one-inch flat of brush, ten point through
//     forty-eight of type. Each carries the trade's own designation where there
//     is one, and each is drawn as **the mark it makes** — a press with the tool
//     in your hand, on your page, in your ink, painted by the painter that would
//     paint it (see `PressPreview.tsx`). A width means something different to
//     every tool, and a row of identical circles was the one thing this panel
//     could say that was the same for all of them.
//   - The slider under them is **not linear and not one scale**. Its first
//     tenth is finer than the tool is made, the next four tenths are the range
//     it *is* made in, and the top half runs off to the absurd (see
//     `plugins/gauge.ts`). The band is drawn on the track, so where you are is
//     something you can see rather than something you have to know, and the
//     readout says it in words as well.
//     There is no "keep this width" button. A width on its own was a worse
//     version of a saved *tool*, which carries the dials with it and has a name
//     and a mark on it — so the star in the title row is the only thing here
//     that remembers anything.
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

/** How many notches the slider has. It is a *position* control — the width it
 *  lands on comes out of the gauge — so the count is about the thumb rather
 *  than about the widths: 400 is finer than a finger can place on a 200-pixel
 *  track, and coarse enough that dragging it does not re-render for nothing. */
const NOTCHES = 400;

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

/** A width as the panel prints it: the number, its unit, and the trade's name
 *  for it when this gauge has one — "4.8 mm · #6". */
function useSizeLabel(gauge: SizeGauge) {
  const t = useT();
  return (size: number) => {
    const measure = t(gauge.unit === "pt" ? "canvas.sizePt" : "canvas.sizeMm", {
      size: formatSize(gauge, size),
    });
    const note = stepNote(gauge, size);
    return note ? t("canvas.sizeNamed", { size: measure, note }) : measure;
  };
}

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
  const gauge = gaugeFor(plugin);
  const sizes = sizesFor(plugin);
  const label = useSizeLabel(gauge);
  // Whether the save form is open. Owned here rather than in `PresetBar`,
  // because the button that opens it is the star in the title row.
  const [saving, setSaving] = useState(false);
  // The slider is held as a *position*, not as a width: dragging it has to move
  // smoothly through a scale that is geometric in three pieces, and rounding a
  // width back into a position every frame would make the thumb stick.
  const [at, setAt] = useState(() => positionOf(gauge, size));

  // Open the slider on the nib in use, so "a bit fatter than this" starts here.
  useEffect(() => {
    if (open) setAt(positionOf(gauge, size));
    else setSaving(false);
    // Keyed on the panel opening: dragging the slider must not fight a pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // …and the slider follows the width whenever something *else* moves it — a
  // saved tool applied, or a width picked off the row. Without this the thumb
  // stays where it was left, and the panel says two different things at once.
  useEffect(() => {
    if (open) setAt(positionOf(gauge, size));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const drafted = sizeAt(gauge, at);
  // What the row and the readout agree is being shown: the width the tool is
  // actually set to whenever the slider has not been touched since, so picking
  // a button and reading the number never disagree.
  const shown = Math.abs(drafted - size) < 0.05 ? size : drafted;

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
      <div className="flex flex-col gap-2">
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

        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <span className="text-xs font-bold tracking-wide text-muted uppercase">
            {t("canvas.size")}
          </span>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t("canvas.size")}
          >
            {sizes.map((option) => (
              <span key={option} className="relative inline-flex">
                <button
                  type="button"
                  // Picking a width does **not** close the panel. It used to,
                  // on the reasoning that a width off the row is a finished
                  // decision — but it is finished only as a *width*, and the
                  // panel is also where the tool gets saved and tuned. Closing
                  // meant re-opening to star it, or to nudge a dial, or to try
                  // the width beside it. The way out is the same as for every
                  // other panel: press somewhere else.
                  onClick={() => onPick(option)}
                  aria-pressed={option === size}
                  aria-label={label(option)}
                  title={label(option)}
                  className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded border ${
                    option === size
                      ? "border-accent bg-accent/15"
                      : "border-line hover:bg-surface-2"
                  }`}
                >
                  <PressPreview
                    plugin={plugin}
                    size={option}
                    of={sizes[sizes.length - 1] ?? option}
                    color={color}
                    background={background}
                    dials={values}
                    colors={colors}
                    filled={filled}
                    box={30}
                  />
                </button>
              </span>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            {/* The width, and whether it is one anybody makes. Saying so is
                the point of the whole gauge: a professional wants to know at a
                glance that they have wandered off the rack, and to be able to
                do it anyway. */}
            <span className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-fg">{label(shown)}</span>
              <span className="text-[11px] text-muted">
                {isRealSize(gauge, shown)
                  ? t("canvas.sizeReal")
                  : shown < gauge.min
                    ? t("canvas.sizeFiner")
                    : t("canvas.sizeWider")}
              </span>
            </span>
            {/* The rack, drawn *under the thumb's own travel*. The middle band
                is where the real implements are; the tenth before it is finer
                than they are made and the half after it runs off to a nib as
                wide as the page — so the band's right edge is exactly where the
                readout stops saying "as made".
                
                It has to share the slider's coordinates to mean anything, and a
                range input's thumb does not travel the full width: it is inset
                by half a thumb at each end. So the two are stacked in one
                positioned box and the band is laid out through the same inset
                (`--gauge-thumb`, pinned in `styles.css` because a browser
                default would be a different number in every browser). Drawn
                above the row, as it was, the band was a claim about a track it
                was not on — and it read a full ten percent wide of the truth. */}
            <span className="relative block h-6 w-full [--gauge-thumb:16px]">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-0 left-0 block h-1 -translate-y-1/2 overflow-hidden rounded bg-line"
                style={{
                  marginLeft: "calc(var(--gauge-thumb) / 2)",
                  marginRight: "calc(var(--gauge-thumb) / 2)",
                }}
              >
                <span
                  className="absolute inset-y-0 block bg-accent/45"
                  style={{
                    left: `${FINE_BAND * 100}%`,
                    right: `${(1 - REAL_BAND) * 100}%`,
                  }}
                />
              </span>
              <input
                type="range"
                min={0}
                max={NOTCHES}
                step={1}
                value={Math.round(at * NOTCHES)}
                aria-label={t("canvas.customSize")}
                aria-valuetext={label(shown)}
                onChange={(e) => {
                  const next =
                    Number((e.target as HTMLInputElement).value) / NOTCHES;
                  setAt(next);
                  // Live: the point of dragging is to see the nib you are
                  // choosing, and the next mark is the only real preview.
                  onPick(sizeAt(gauge, next));
                }}
                className="gauge-slider absolute inset-0 w-full cursor-pointer"
              />
            </span>
          </label>
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
