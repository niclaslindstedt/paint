// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import {
  Button,
  GripIcon,
  LABELED_FIELD_CLASS,
  SelectPicker,
} from "@niclaslindstedt/oss-framework/components";

import {
  CROP_RATIO_ORDER,
  simplifyRatio,
  type CropRatioId,
  type CustomRatio,
} from "./crop.ts";
import type { CanvasSize } from "./canvasSize.ts";
import { useT, type TKey } from "./i18n/index.ts";
import { useDialogDrag } from "./useDialogDrag.ts";

// The one question the rectangle can't answer for itself.
//
// Everything about a crop is in the drag — where it sits, how much it takes —
// except what *shape* the result is allowed to be, and that is not something you
// can express by pulling a corner: "sixteen by nine" is a number, and a hand
// that gets it right by eye is a hand that got lucky. So it is asked here, in a
// card the size of the question, and answered before or during the drag as the
// mood takes you: change the ratio halfway through and the box you have already
// aimed is refitted around its own middle rather than thrown away.
//
// **It is not a `Modal`, and that is the whole design.** The framework's dialog
// lays a backdrop over the window and takes the pointer — exactly right for a
// dialog you answer and dismiss, and exactly wrong for one whose entire purpose
// is to sit beside a gesture you are still making on the page behind it. A crop
// you can't drag while the crop dialog is open is not a crop tool. So this is a
// small floating card inside the canvas's own space: it says `role="dialog"` and
// carries a label for assistive tech, but it never traps focus and never covers
// the page it is about.
//
// It rides at the foot of the canvas for the same reason the effect dialog drops
// there: the interesting part of a picture is rarely its bottom strip, the
// toolbar underneath is nothing this card needs, and the alternative — the
// middle of the window — is over the very thing you are looking at.
//
// And it is **dragged by its title**, with the same hook the effect dialog uses,
// because the foot of the window is only the best guess. A phone is the case
// that settles it: 256 points of card across a 390-point screen sit over the
// bottom edge of the rectangle and the grip on it, and "crop from the bottom" is
// not an edge anyone should have to give up. Move the card and the edge is
// there.

type Props = {
  /** The sheet being cropped, for the "keep this shape" option's own label. */
  page: CanvasSize;
  /** The crop as whole pixels — what the page will become. */
  size: CanvasSize;
  ratio: CropRatioId;
  onRatio: (next: CropRatioId) => void;
  custom: CustomRatio;
  onCustom: (next: CustomRatio) => void;
  /** Whether the box takes anything off the page at all. */
  canApply: boolean;
  onApply: () => void;
  onCancel: () => void;
};

/** What each choice is called. `keep` and `custom` say more than a name — see
 *  below — so only the named ratios are in here. */
const RATIO_LABELS: Record<CropRatioId, TKey> = {
  keep: "crop.ratios.keep",
  free: "crop.ratios.free",
  "1:1": "crop.ratios.square",
  "4:3": "crop.ratios.fourThree",
  "3:2": "crop.ratios.threeTwo",
  "16:9": "crop.ratios.sixteenNine",
  "9:16": "crop.ratios.nineSixteen",
  custom: "crop.ratios.custom",
};

/** How big a side of a reduced ratio may be before it stops being a name
 *  anybody would say out loud. 16:9 and 5:4 are shapes; 64:43 is long division.
 */
const NAMEABLE = 20;

export function CropModal({
  page,
  size,
  ratio,
  onRatio,
  custom,
  onCustom,
  canApply,
  onApply,
  onCancel,
}: Props) {
  const t = useT();
  // Always draggable: unlike the effect dialog this card is never the whole
  // screen, so there is always somewhere to move it to and always a page under
  // it worth uncovering.
  const drag = useDialogDrag(true);
  // The custom sides are held as text so a half-typed number is yours rather
  // than something to round on every keystroke — the same reason the resize
  // dialog holds its sides that way. A side that isn't a number yet reads as no
  // constraint at all, so the box simply drags freely until it is one.
  const [draft, setDraft] = useState({
    w: String(custom.w),
    h: String(custom.h),
  });

  const typeSide = (side: "w" | "h", value: string) => {
    const next = { ...draft, [side]: value };
    setDraft(next);
    onCustom({ w: Number(next.w) || 0, h: Number(next.h) || 0 });
  };

  // "Keep" is the page's own shape, and it says what that shape is — the whole
  // point of the option is that you don't have to work it out. But only when
  // that is a *name*: 1280 × 860 reduces to 64:43, which is arithmetic rather
  // than information, and a dropdown row reading "Keep 64:43" is worse than one
  // reading "Keep this shape".
  const kept = simplifyRatio(page.width, page.height);
  const named = kept.w <= NAMEABLE && kept.h <= NAMEABLE;

  return (
    <div
      role="dialog"
      aria-label={t("crop.title")}
      className="absolute z-20 flex w-64 max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-col gap-3 rounded-lg border border-line bg-surface/95 p-3 shadow-xl"
      // Where it sits: centred at the foot of the canvas, plus wherever it has
      // been dragged to. The offset goes into the *position* rather than into a
      // `translate`, because Tailwind's own `-translate-x-1/2` — the half-width
      // that does the centring — is written on that property, and one of the two
      // would have won.
      style={{
        left: "calc(50% + var(--dialog-drag-x, 0px))",
        bottom: "calc(0.75rem - var(--dialog-drag-y, 0px))",
      }}
    >
      {/* The title row, which is also the handle the card is moved by: the
          pointer may take hold of the whole row, while the *announced* control
          is the grip beside it, which is what a keyboard focuses and moves with
          the arrows. The same two-ways-in, one-behaviour split the effect
          dialog's title row has. */}
      <div
        ref={drag.gripRef}
        onPointerDown={drag.onPointerDown}
        className="flex cursor-move touch-none items-baseline gap-1.5"
      >
        <span
          role="button"
          tabIndex={0}
          aria-label={t("crop.move")}
          title={t("crop.move")}
          onKeyDown={drag.onKeyDown}
          className="-ml-0.5 inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center self-center rounded text-muted hover:text-fg-bright focus:outline-2 focus:outline-offset-2 focus:outline-accent"
        >
          <GripIcon className="h-3.5 w-3.5" />
        </span>
        <h2 className="min-w-0 flex-1 text-sm font-bold text-fg-bright">
          {t("crop.title")}
        </h2>
        {drag.moved && (
          <button
            type="button"
            onClick={drag.recentre}
            className="shrink-0 cursor-pointer text-[11px] text-muted hover:text-fg-bright"
          >
            {t("crop.recentre")}
          </button>
        )}
      </div>

      {/* The shape, and — beside its label — what the page will actually become.
          The two belong on one line: the number is the answer to the choice
          above it and to every drag on the page behind. */}
      <label className="flex flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2 text-xs text-muted">
          {t("crop.ratio")}
          <span className="text-[11px] tabular-nums">
            {size.width} × {size.height}
          </span>
        </span>
        <SelectPicker<CropRatioId>
          value={ratio}
          ariaLabel={t("crop.ratio")}
          onChange={onRatio}
          options={CROP_RATIO_ORDER.map((id) => ({
            value: id,
            label:
              id === "keep"
                ? named
                  ? t("crop.ratios.keep", { ratio: `${kept.w}:${kept.h}` })
                  : t("crop.ratios.keepPlain")
                : t(RATIO_LABELS[id]),
          }))}
        />
      </label>

      {/* Two numbers and a colon — the way a ratio is written down. Shown only
          for the choice that needs them, so the card stays the size of the
          question the rest of the time. */}
      {ratio === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label={t("crop.customWidth")}
            value={draft.w}
            onChange={(e) => typeSide("w", e.currentTarget.value)}
            className={`${LABELED_FIELD_CLASS} min-w-0 flex-1 tabular-nums`}
          />
          <span className="text-sm text-muted">:</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label={t("crop.customHeight")}
            value={draft.h}
            onChange={(e) => typeSide("h", e.currentTarget.value)}
            className={`${LABELED_FIELD_CLASS} min-w-0 flex-1 tabular-nums`}
          />
        </div>
      )}

      <p className="text-[11px] leading-snug text-muted">{t("crop.hint")}</p>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={onApply} disabled={!canApply}>
          {t("crop.apply")}
        </Button>
      </div>
    </div>
  );
}
