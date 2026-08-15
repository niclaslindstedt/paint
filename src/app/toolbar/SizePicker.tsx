// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { PaintPlugin, ToolDial } from "../plugins/types.ts";
import { MAX_SIZE, sizeInMm, sizesFor } from "../useAppSettings.ts";
import { PressPreview } from "./PressPreview.tsx";
import { ToolDials } from "./ToolDials.tsx";

// The nib picker: the widths, behind one button — and, behind one more press,
// whatever else the tool in your hand has to tune.
//
// Same trade as the colour picker. Four permanent size buttons were a fifth of
// a phone toolbar spent on a choice a session makes twice; the button now shows
// the nib you are drawing with — as a dot the actual size of it — and opens this
// panel for the others.
//
// Three widths ship (fine, medium, broad) because three is what a thumb can hit
// without reading. A slider under them adds a fourth, or a fourteenth: **Add**
// keeps whatever the slider is on, and kept widths sit in the row from then on,
// sorted fine-to-broad rather than in the order they were discovered.
//
// **Each width is shown as the mark it makes.** Not a dot the size of the nib —
// a press with the tool in your hand, on your page, in your ink, painted by the
// painter that would paint it (see `PressPreview.tsx`). A width means something
// different to every tool, and a row of identical circles was the one thing the
// panel could say that was the same for all of them.
//
// **The width belongs to the tool.** What this panel sets is the width of the
// tool in your hand, and it is remembered per tool — one pencil width, one
// paintbrush width, one type size — so reaching for the brush no longer costs
// you the pencil you had set. A tool with a scale of its own says so on its
// descriptor (`PaintPlugin.sizes`, `defaultSize`), which is how the type sizes
// below reach a panel that has never heard of the text tool.
//
// **The panel is per tool below that line.** Width is the one control every tool
// shares; past it they stop agreeing, and a hardness slider shown to a
// highlighter was a control that did nothing sitting where a control that did
// something should be. So the tool declares its own dials (`PaintPlugin.dials`)
// and `ToolDials` renders them under an **Advanced** heading — a heading, not a
// fold: they are a section of this panel rather than a second panel hidden
// inside it. Nothing here knows what any of them are.
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
  customSizes: readonly number[];
  onAddSize: (size: number) => void;
  onRemoveSize: (size: number) => void;
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
  dials,
  values,
  onDialChange,
  onResetDials,
  tuned,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState(size);
  const sizes = sizesFor(plugin, customSizes);
  const known = sizes.includes(Math.round(draft));

  // Open the slider on the nib in use, so "a bit fatter than this" starts here.
  useEffect(() => {
    if (open) setDraft(size);
    // Keyed on the panel opening: dragging the slider must not fight a pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      triggerRef={anchor}
      placement={{
        width: { kind: "max", maxPx: 248 },
        anchor: "left",
        gap: 14,
        coordinateSpace: "viewport",
      }}
      className="p-2"
    >
      <div className="flex flex-col gap-2">
        {/* Whose panel this is. The dials below already name their section
            (**Advanced**), and without a heading of its own the row of widths
            above them read as an unlabelled preamble to it — worse on a phone,
            where the panel opens over the drawing and the button that opened it
            is under your thumb. The house style for a section heading, the same
            one `ToolDials` uses, so the panel reads as two named sections
            rather than as a heading and a stack. */}
        <span className="text-xs font-bold tracking-wide text-muted uppercase">
          {plugin ? t(plugin.nameKey) : t("canvas.size")}
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
                  // A width picked from the row is a finished decision, so the
                  // panel gets out of the way. The slider below is not — it is
                  // live, and closing on every frame of a drag would be absurd.
                  onPick(option);
                  onClose();
                }}
                aria-pressed={option === size}
                aria-label={t("canvas.sizeMm", { size: sizeInMm(option) })}
                title={t("canvas.sizeMm", { size: sizeInMm(option) })}
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
                  aria-label={`${t("canvas.removeSize")} ${sizeInMm(option)}`}
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
          <span className="text-xs text-muted">
            {t("canvas.customSize", { size: sizeInMm(Math.round(draft)) })}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={MAX_SIZE}
              step={1}
              value={Math.round(draft)}
              onChange={(e) => {
                const next = Number((e.target as HTMLInputElement).value);
                setDraft(next);
                // Live: the point of dragging is to see the nib you are
                // choosing, and the next mark is the only real preview.
                onPick(next);
              }}
              className="w-full cursor-pointer"
            />
            <button
              type="button"
              disabled={known}
              onClick={() => onAddSize(Math.round(draft))}
              className="shrink-0 cursor-pointer rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-muted"
            >
              {known ? t("canvas.sizeKept") : t("canvas.keepSize")}
            </button>
          </div>
        </label>

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
