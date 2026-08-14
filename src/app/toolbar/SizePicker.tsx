// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import { dialReadout } from "../plugins/dials.ts";
import type { PaintPlugin, ToolDial } from "../plugins/types.ts";
import { MAX_SIZE, sizesFor } from "../useAppSettings.ts";

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
// and this renders them under a disclosure: the basic panel stays the one
// slider a hand reaches for mid-stroke, and the two knobs that change what the
// mark is made of are one press further in. Nothing here knows what any of them
// are — a paintbrush's hair gauge and a bucket's feather are the same loop.

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** The tool the panel is opened over — it supplies the width row, and it is
   *  the one whose width is being set. */
  plugin: PaintPlugin | undefined;
  size: number;
  onPick: (size: number) => void;
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
  // Whether the dials are showing. Panel state, not a setting: it is a fold in
  // a menu, and it stays folded out for as long as the session wants it — but
  // it is not a choice worth carrying across reloads.
  const [advanced, setAdvanced] = useState(false);
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
                aria-label={`${option}`}
                title={`${option}`}
                className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded border ${
                  option === size
                    ? "border-accent bg-accent/15"
                    : "border-line hover:bg-surface-2"
                }`}
              >
                <SizeDot size={option} of={sizes[sizes.length - 1]} />
              </button>
              {customSizes.includes(option) && (
                <button
                  type="button"
                  onClick={() => onRemoveSize(option)}
                  aria-label={`${t("canvas.removeSize")} ${option}`}
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
            {t("canvas.customSize", { size: String(Math.round(draft)) })}
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

        {/* The tool's own knobs. Absent entirely for a tool that has none,
            rather than shown empty: a disclosure that opens onto nothing is a
            worse answer than no disclosure. */}
        {dials.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setAdvanced((shown) => !shown)}
                aria-expanded={advanced}
                className="flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-fg-bright"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block transition-transform ${
                    advanced ? "rotate-90" : ""
                  }`}
                >
                  ›
                </span>
                {t("dials.advanced")}
                {/* A dot beside the fold when something under it is off its
                    default — otherwise a tool you tuned last week looks exactly
                    like one you never touched. */}
                {tuned && !advanced && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-accent"
                  />
                )}
              </button>
              {advanced && tuned && (
                <button
                  type="button"
                  onClick={onResetDials}
                  className="cursor-pointer text-xs text-muted hover:text-fg-bright"
                >
                  {t("dials.reset")}
                </button>
              )}
            </div>

            {advanced &&
              dials.map((dial) => {
                const rest = dial.default ?? 1;
                const value = values[dial.id] ?? rest;
                return (
                  <label key={dial.id} className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t(dial.nameKey, {
                        value: String(dialReadout(dial, value)),
                      })}
                    </span>
                    <input
                      type="range"
                      min={dial.min}
                      max={dial.max}
                      step={dial.step}
                      value={value}
                      onChange={(e) => {
                        const next = Number(
                          (e.target as HTMLInputElement).value,
                        );
                        // Back where it started is not a setting: forget it,
                        // so the blob only ever holds what differs from the
                        // tool as it ships.
                        onDialChange(dial.id, next === rest ? null : next);
                      }}
                      className="w-full cursor-pointer"
                    />
                    <span className="text-[11px] text-muted">
                      {t(dial.hintKey)}
                    </span>
                  </label>
                );
              })}
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}

/** The nib, previewed at the size it will actually be — capped so a broad one
 *  still fits its button.
 *
 *  `of` is the widest width on the row it belongs to, and it switches the dot
 *  from absolute to *relative*: at the nib widths a drawing tool offers the two
 *  readings are the same thing (the broadest is about a button wide anyway),
 *  but a tool whose scale runs past the cap — type sizes — would otherwise draw
 *  five identical dots for five sizes. Relative, the row reads small-to-large
 *  whatever the numbers are, and nothing here has to know which tool it is
 *  drawing for. */
export function SizeDot({
  size,
  of,
  cap = 18,
  className = "bg-fg",
}: {
  size: number;
  of?: number;
  cap?: number;
  className?: string;
}) {
  const d =
    of && of > cap
      ? // The floor keeps the smallest size on the row a visible dot rather
        // than a speck.
        Math.round(3 + (Math.min(size, of) / of) * (cap - 3))
      : Math.max(2, Math.min(size, cap));
  return (
    <span
      aria-hidden="true"
      className={`rounded-full ${className}`}
      style={{ width: `${d}px`, height: `${d}px` }}
    />
  );
}
