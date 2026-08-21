// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

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
import type { PaintPlugin } from "../plugins/types.ts";
import { gaugeFor, sizesFor } from "../useAppSettings.ts";
import { PressPreview, type PressTile } from "./PressPreview.tsx";

// How wide a tool draws: five buttons and a slider, and both of them are about
// a real implement rather than about a number between 1 and 200.
//
//   - The five are **sizes a shop sells**: 0.3 / 0.5 / 0.7 / 0.9 / 2.0 mm of
//     pencil lead, a #2 through a one-inch flat of brush, ten point through
//     forty-eight of type. Each carries the trade's own designation where there
//     is one, and each is drawn as **the mark it makes, at the size it makes
//     it** — a press with the tool it belongs to, on your page, in your ink,
//     painted by the painter that would paint it and drawn at the page's own
//     100% (see `PressPreview.tsx`). A width means something different to every
//     tool, and a row of identical circles was the one thing this control could
//     say that was the same for all of them.
//   - The slider under them is **not linear and not one scale**. Its first tenth
//     is finer than the tool is made, the next four tenths are the range it *is*
//     made in, and the top half runs off to the absurd (see `plugins/gauge.ts`).
//     The band is drawn on the track, so where you are is something you can see
//     rather than something you have to know, and the readout says it in words
//     as well.
//
// Its own component because two places set a width, and they must not be two
// controls: the tool panel over the canvas (see `SizePicker.tsx`), and the tool
// as a *canvas preset* has it set up (`settings/kitTool.tsx`) — which is the
// same decision made in advance, for a page rather than for the next mark.

/** How many notches the slider has. It is a *position* control — the width it
 *  lands on comes out of the gauge — so the count is about the thumb rather
 *  than about the widths: 400 is finer than a finger can place on a 200-pixel
 *  track, and coarse enough that dragging it does not re-render for nothing. */
const NOTCHES = 400;

/** How big each width's press is drawn, in CSS pixels — the button's own inside
 *  (40 across, less the line around it) but two pixels short of it on each
 *  side, so the accent tint that marks the width you are on still shows as a
 *  ring around the mark. */
const PRESS_BOX = 34;

/** The presses this row is made of: one per width the tool is made in, and
 *  every one of them **at life size**: the mark that width leaves, at the size
 *  it will leave it, one document pixel to one device pixel — the page at 100%.
 *
 *  It used to be one scale for the whole row, the scale that fitted the
 *  broadest width on it. That made a handsome row — five nibs running
 *  fine-to-broad, none of them cropped — and it made every one of the five a
 *  different lie: a rack that runs up to a decorator's brush shrinks the fine
 *  end to a third of what it draws, and the row you were choosing a width off
 *  was a row of ratios rather than of widths. Ratios are what the *numbers*
 *  under the row are for.
 *
 *  So the row is drawn the way a shop's own rack is: at the sizes they actually
 *  are, and the ones past the size of the tray hang over the edge of it. A
 *  width you can measure against your own thumb is worth more than five you can
 *  only measure against each other — and a mark too big for its button says the
 *  one thing a fitted row could never say, which is "this is bigger than that".
 *
 *  Its own function because the row is painted twice — once here, and once at
 *  idle before the panel is ever opened, so that opening it is a row of blits
 *  rather than five renders (see `warmPressTiles` and `SizePicker`). Two lists
 *  that had to agree would be one that eventually didn't. */
export function widthTiles(look: {
  plugin: PaintPlugin | undefined;
  color: string;
  background: string;
  filled: boolean;
  dials: Readonly<Record<string, number>>;
  colors?: Readonly<Record<string, string>>;
}): PressTile[] {
  const sizes = sizesFor(look.plugin);
  return sizes.map((size) => ({
    ...look,
    size,
    of: sizes[sizes.length - 1] ?? size,
    box: PRESS_BOX,
    fit: "life" as const,
  }));
}

/** A width as the panel prints it: the number, its unit, and the trade's name
 *  for it when this gauge has one — "4.8 mm · #6". */
export function useSizeLabel(gauge: SizeGauge) {
  const t = useT();
  return (size: number) => {
    const measure = t(gauge.unit === "pt" ? "canvas.sizePt" : "canvas.sizeMm", {
      size: formatSize(gauge, size),
    });
    const note = stepNote(gauge, size);
    return note ? t("canvas.sizeNamed", { size: measure, note }) : measure;
  };
}

export function WidthPicker({
  plugin,
  size,
  onPick,
  color,
  background,
  filled,
  dials,
  colors,
}: {
  /** The tool whose width this is — it supplies the ladder, and it paints every
   *  press on the row. */
  plugin: PaintPlugin | undefined;
  size: number;
  onPick: (size: number) => void;
  /** The ink and the page every width is previewed in, so each button is the
   *  mark it would actually make. */
  color: string;
  background: string;
  filled: boolean;
  /** Where the tool's dials sit, so the presses redraw as one is dragged. */
  dials: Readonly<Record<string, number>>;
  /** …and its own inks, for a tool that mixes any. */
  colors?: Readonly<Record<string, string>>;
}) {
  const t = useT();
  const gauge = gaugeFor(plugin);
  const label = useSizeLabel(gauge);
  const tiles = widthTiles({
    plugin,
    color,
    background,
    filled,
    dials,
    colors,
  });
  // The slider is held as a *position*, not as a width: dragging it has to move
  // smoothly through a scale that is geometric in three pieces, and rounding a
  // width back into a position every frame would make the thumb stick.
  const [at, setAt] = useState(() => positionOf(gauge, size));

  // …and it follows the width whenever something *else* moves it — a preset
  // applied, or a width picked off the row. Without this the thumb stays where
  // it was left, and the control says two different things at once.
  useEffect(() => {
    setAt(positionOf(gauge, size));
    // Keyed on the width alone: dragging the slider must not fight a pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const drafted = sizeAt(gauge, at);
  // What the row and the readout agree is being shown: the width the tool is
  // actually set to whenever the slider has not been touched since, so picking
  // a button and reading the number never disagree.
  const shown = Math.abs(drafted - size) < 0.05 ? size : drafted;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wide text-muted uppercase">
        {t("canvas.size")}
      </span>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t("canvas.size")}
      >
        {tiles.map((tile) => (
          <span key={tile.size} className="relative inline-flex">
            <button
              type="button"
              // Picking a width does **not** close the panel. It used to, on
              // the reasoning that a width off the row is a finished decision —
              // but it is finished only as a *width*, and the panel is also
              // where the tool gets saved and tuned. Closing meant re-opening to
              // star it, or to nudge a dial, or to try the width beside it. The
              // way out is the same as for every other panel: press somewhere
              // else.
              onClick={() => onPick(tile.size)}
              aria-pressed={tile.size === size}
              aria-label={label(tile.size)}
              title={label(tile.size)}
              className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded border ${
                tile.size === size
                  ? "border-accent bg-accent/15"
                  : "border-line hover:bg-surface-2"
              }`}
            >
              <PressPreview {...tile} />
            </button>
          </span>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        {/* The width, and whether it is one anybody makes. Saying so is the
            point of the whole gauge: a professional wants to know at a glance
            that they have wandered off the rack, and to be able to do it
            anyway. */}
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
        {/* The rack, drawn *under the thumb's own travel*. The middle band is
            where the real implements are; the tenth before it is finer than they
            are made and the half after it runs off to a nib as wide as the page
            — so the band's right edge is exactly where the readout stops saying
            "as made".

            It has to share the slider's coordinates to mean anything, and a
            range input's thumb does not travel the full width: it is inset by
            half a thumb at each end. So the two are stacked in one positioned
            box and the band is laid out through the same inset
            (`--gauge-thumb`, pinned in `styles.css` because a browser default
            would be a different number in every browser). Drawn above the row,
            as it was, the band was a claim about a track it was not on — and it
            read a full ten percent wide of the truth. */}
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
              // Live: the point of dragging is to see the nib you are choosing,
              // and the next mark is the only real preview.
              onPick(sizeAt(gauge, next));
            }}
            className="gauge-slider absolute inset-0 w-full cursor-pointer"
          />
        </span>
      </label>
    </div>
  );
}
