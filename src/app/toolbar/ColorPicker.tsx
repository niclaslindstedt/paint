// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import {
  CheckIcon,
  FloatingPanel,
} from "@niclaslindstedt/oss-framework/components";

import {
  ColorMixer,
  hexToHsv,
  hsvToHex,
  sameColor,
  type Hsv,
} from "@niclaslindstedt/oss-framework/color";
import { useT } from "../i18n/index.ts";
import { PALETTE } from "../useAppSettings.ts";

// The colour picker: everything about ink, behind one button.
//
// The toolbar used to spend seven cells on a fixed swatch row — a third of a
// phone's width, permanently, for a choice most strokes never change. It is now
// a single button showing the ink you are drawing with, which opens this panel
// when you want a different one.
//
// It shows one colour, not two. It used to carry the page colour as a swatch of
// its own, because painting with the page was how you rubbed something out —
// the eraser was a nib that held it. The eraser lifts ink now (see `render.ts`)
// and the sheet's colour is the background layer's, so a page-colour swatch in
// the *ink* picker is a colour that erases nothing and belongs to nothing here.
//
// The panel is two halves. The top is the arsenal: the built-in palette, then
// whatever the user has mixed, each one tap away. The bottom is the framework's
// `ColorMixer`, folded away until asked for. Mixing changes the ink
// immediately; **Add** is what keeps it, and a kept colour joins the arsenal
// for good.
//
// The mixer is handed — and hands back — an `Hsv` rather than a hex string,
// which is the whole reason the panel holds one: a colour with no light in it
// has no hue left to carry, so a hex round trip per pointer move would reset
// the strip the moment the value handle reached the bottom of the field.

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** The ink in use, already resolved (never `null` — the toolbar resolves an
   *  unpicked colour against the page first). */
  color: string;
  onPick: (color: string) => void;
  customColors: readonly string[];
  onAddColor: (color: string) => void;
  onRemoveColor: (color: string) => void;
};

export function ColorPicker({
  open,
  onClose,
  anchor,
  color,
  onPick,
  customColors,
  onAddColor,
  onRemoveColor,
}: Props) {
  const t = useT();
  const [mixing, setMixing] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));

  // Open the mixer where the current ink is, so "a bit darker than this" starts
  // from this rather than from wherever it was left last time.
  useEffect(() => {
    if (open) setHsv(hexToHsv(color));
    if (!open) setMixing(false);
    // Deliberately keyed on the panel opening, not on every ink change: dragging
    // in the field changes the ink, and re-seeding from it would fight the drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mixed = hsvToHex(hsv);
  const known = customColors.some((c) => sameColor(c, mixed));

  // Picking a swatch is a finished decision, so the panel gets out of the way.
  // Dragging in the mixer is not — it changes the ink live, and closing on
  // every frame of that would be absurd — so the mixer only ever calls
  // `onPick`.
  const pickAndClose = (next: string) => {
    onPick(next);
    onClose();
  };

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      triggerRef={anchor}
      placement={{
        width: { kind: "max", maxPx: 268 },
        anchor: "left",
        gap: 14,
        coordinateSpace: "viewport",
      }}
      className="p-2"
    >
      <div className="flex flex-col gap-2">
        <div
          className="grid grid-cols-7 gap-1.5"
          role="group"
          aria-label={t("canvas.color")}
        >
          {PALETTE.map((swatch) => (
            <Swatch
              key={swatch}
              color={swatch}
              active={sameColor(swatch, color)}
              label={swatch}
              onPick={() => pickAndClose(swatch)}
            />
          ))}
          {customColors.map((swatch) => (
            <Swatch
              key={swatch}
              color={swatch}
              active={sameColor(swatch, color)}
              label={swatch}
              onPick={() => pickAndClose(swatch)}
              onRemove={() => onRemoveColor(swatch)}
              removeLabel={t("canvas.removeColor")}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMixing((v) => !v)}
          aria-expanded={mixing}
          className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg-bright"
        >
          {mixing ? t("canvas.hideMixer") : t("canvas.mixColor")}
        </button>

        {mixing && (
          <div className="flex flex-col gap-2">
            <ColorMixer
              value={hsv}
              onChange={(next) => {
                setHsv(next);
                onPick(hsvToHex(next));
              }}
              labels={{ field: t("canvas.mixField"), hue: t("canvas.mixHue") }}
            />
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-7 w-7 shrink-0 rounded border border-line"
                style={{ backgroundColor: mixed }}
              />
              <span className="font-mono text-xs text-muted">{mixed}</span>
              <button
                type="button"
                disabled={known}
                onClick={() => onAddColor(mixed)}
                className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-muted"
              >
                {known && <CheckIcon className="h-3.5 w-3.5" />}
                {known ? t("canvas.colorKept") : t("canvas.keepColor")}
              </button>
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}

/** One swatch. A colour the user mixed carries a remove badge; the built-in
 *  palette doesn't — it is the floor the picker always has. */
function Swatch({
  color,
  active,
  label,
  onPick,
  onRemove,
  removeLabel,
}: {
  color: string;
  active: boolean;
  label: string;
  onPick: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={`h-7 w-7 cursor-pointer rounded-full border-2 ${
          active ? "border-accent" : "border-line"
        }`}
        style={{ backgroundColor: color }}
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${removeLabel ?? "Remove"} ${label}`}
          title={removeLabel}
          className="absolute -top-1 -right-1 h-3.5 w-3.5 cursor-pointer rounded-full border border-line bg-surface text-[9px] leading-none text-muted hover:text-fg-bright"
        >
          ×
        </button>
      )}
    </span>
  );
}
