// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import { MAX_SIZE, SIZES } from "../useAppSettings.ts";

// The nib picker: the widths, behind one button.
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
// Hardness lives here too rather than in Settings, because it belongs to the
// same decision as the width — how the mark meets the page — and because it is
// worth trying twice before it is worth keeping. It is dimmed rather than
// hidden for a tool that ignores it: the dial not applying is a fact about the
// tool in your hand, and hiding it would make the panel jump.

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  size: number;
  onPick: (size: number) => void;
  customSizes: readonly number[];
  onAddSize: (size: number) => void;
  onRemoveSize: (size: number) => void;
  hardness: number;
  onHardnessChange: (hardness: number) => void;
  /** Whether the tool in hand honours hardness (its `supportsHardness` flag).
   *  Nothing here knows *which* tool that is. */
  hardnessApplies: boolean;
};

export function SizePicker({
  open,
  onClose,
  anchor,
  size,
  onPick,
  customSizes,
  onAddSize,
  onRemoveSize,
  hardness,
  onHardnessChange,
  hardnessApplies,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState(size);
  const sizes = [...new Set([...SIZES, ...customSizes])].sort((a, b) => a - b);
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
                <SizeDot size={option} />
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

        <label
          className={`flex flex-col gap-1 ${
            hardnessApplies ? "" : "pointer-events-none opacity-40"
          }`}
        >
          <span className="text-xs text-muted">
            {t("canvas.hardness", {
              percent: String(Math.round(hardness * 100)),
            })}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(hardness * 100)}
            disabled={!hardnessApplies}
            onChange={(e) =>
              onHardnessChange(
                Number((e.target as HTMLInputElement).value) / 100,
              )
            }
            className="w-full cursor-pointer"
          />
          <span className="text-[11px] text-muted">
            {hardnessApplies
              ? t("canvas.hardnessHint")
              : t("canvas.hardnessNotUsed")}
          </span>
        </label>
      </div>
    </FloatingPanel>
  );
}

/** The nib, previewed at the size it will actually be — capped so a broad one
 *  still fits its button. */
export function SizeDot({
  size,
  cap = 18,
  className = "bg-fg",
}: {
  size: number;
  cap?: number;
  className?: string;
}) {
  const d = Math.max(2, Math.min(size, cap));
  return (
    <span
      aria-hidden="true"
      className={`rounded-full ${className}`}
      style={{ width: `${d}px`, height: `${d}px` }}
    />
  );
}
