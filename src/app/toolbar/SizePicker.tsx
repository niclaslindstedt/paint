// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

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
import type { PaintPlugin, ToolDial } from "../plugins/types.ts";
import type { ToolPreset } from "../presets.ts";
import { gaugeFor, sizesFor } from "../useAppSettings.ts";
import { PressPreview } from "./PressPreview.tsx";
import { PresetBar } from "./PresetBar.tsx";
import { ToolDials } from "./ToolDials.tsx";

// The tool panel: the tools you saved, the widths this tool is made in, and
// whatever else the tool in your hand has to tune.
//
// Three sections, top to bottom, in the order a hand reaches for them.
//
// **Saved** — the tools the user built (see `PresetBar.tsx`). First, because a
// preset is the answer to the whole rest of the panel and pressing one should
// not mean scrolling past the machinery that made it.
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
//   - **Keep** adds whatever the slider is on to this tool's row, and kept
//     widths are per tool: a twenty-five-millimetre flat you kept while
//     painting has no business in the pencil's row.
//
// **The width belongs to the tool**, and so does everything else here. One
// pencil width, one brush width, one type size, one set of dials each — so
// reaching for the brush no longer costs you the pencil you had set.
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
  /** The widths the user kept **for this tool**. */
  customSizes: readonly number[];
  onAddSize: (size: number) => void;
  onRemoveSize: (size: number) => void;
  /** The tools saved under a name for this tool (see `presets.ts`). */
  presets: readonly ToolPreset[];
  onApplyPreset: (preset: ToolPreset) => void;
  onSavePreset: (name: string) => void;
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
  customSizes,
  onAddSize,
  onRemoveSize,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  dials,
  values,
  onDialChange,
  onResetDials,
  tuned,
}: Props) {
  const t = useT();
  const gauge = gaugeFor(plugin);
  const sizes = sizesFor(plugin, customSizes);
  const label = useSizeLabel(gauge);
  // The slider is held as a *position*, not as a width: dragging it has to move
  // smoothly through a scale that is geometric in three pieces, and rounding a
  // width back into a position every frame would make the thumb stick.
  const [at, setAt] = useState(() => positionOf(gauge, size));

  // Open the slider on the nib in use, so "a bit fatter than this" starts here.
  useEffect(() => {
    if (open) setAt(positionOf(gauge, size));
    // Keyed on the panel opening: dragging the slider must not fight a pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const drafted = sizeAt(gauge, at);
  // What the row and the readout agree is being shown: the width the tool is
  // actually set to whenever the slider has not been touched since, so picking
  // a button and reading the number never disagree.
  const shown = Math.abs(drafted - size) < 0.05 ? size : drafted;
  const kept = sizes.some((option) => Math.abs(option - shown) < 0.05);

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
        {/* Whose panel this is. Without a heading of its own the row of widths
            read as an unlabelled preamble to the sections below it — worse on
            a phone, where the panel opens over the drawing and the button that
            opened it is under your thumb. */}
        <span className="text-xs font-bold tracking-wide text-muted uppercase">
          {plugin ? t(plugin.nameKey) : t("canvas.size")}
        </span>

        <PresetBar
          presets={presets}
          size={size}
          dials={values}
          onApply={(preset) => {
            onApplyPreset(preset);
            // A saved tool is a finished decision, the way a width off the row
            // is: take it and get out of the way.
            onClose();
          }}
          onSave={onSavePreset}
          onDelete={onDeletePreset}
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
                  onClick={() => {
                    // A width picked from the row is a finished decision, so
                    // the panel gets out of the way. The slider below is not —
                    // it is live, and closing on every frame of a drag would be
                    // absurd.
                    onPick(option);
                    onClose();
                  }}
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
                    filled={filled}
                    box={30}
                  />
                </button>
                {customSizes.includes(option) && (
                  <button
                    type="button"
                    onClick={() => onRemoveSize(option)}
                    aria-label={`${t("canvas.removeSize")} ${label(option)}`}
                    title={t("canvas.removeSize")}
                    className="absolute -top-1 -right-1 h-3.5 w-3.5 cursor-pointer rounded-full border border-line bg-surface text-[9px] leading-none text-muted hover:text-fg-bright"
                  >
                    ×
                  </button>
                )}
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
            {/* The rack, drawn on the track. The middle band is where the real
                implements are; the tenth before it is finer than they are made
                and the half after it runs off to a nib as wide as the page. */}
            <span
              aria-hidden="true"
              className="relative block h-1 w-full overflow-hidden rounded bg-surface-2"
            >
              <span
                className="absolute inset-y-0 block bg-accent/45"
                style={{
                  left: `${FINE_BAND * 100}%`,
                  right: `${(1 - REAL_BAND) * 100}%`,
                }}
              />
            </span>
            <div className="flex items-center gap-2">
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
                className="w-full cursor-pointer"
              />
              <button
                type="button"
                disabled={kept}
                onClick={() => onAddSize(shown)}
                className="shrink-0 cursor-pointer rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-muted"
              >
                {kept ? t("canvas.sizeKept") : t("canvas.keepSize")}
              </button>
            </div>
          </label>
        </div>

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
