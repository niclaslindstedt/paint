// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useT } from "./i18n/index.ts";
import { FlipIcon, ToolboxIcon } from "./icons.tsx";
import {
  CUSTOM_CANVAS,
  previewScale,
  type CanvasSize,
  type Orientation,
} from "./canvasSize.ts";
import type { ShelfItem } from "./canvasPresets.ts";

// How big a new page is, drawn rather than listed.
//
// **The sizes are drawn.** Rectangles at one shared scale answer "how much
// bigger is 4K than Full HD" and "is A4 taller than my screen" in the way a
// dropdown of numbers never did — the choice is a comparison, so the control is
// one too. Four named sizes is the whole of what the app ships on purpose: past
// that the shelf stops being comparable and starts being a catalogue.
//
// **Beside them stand the pages you set up yourself** — the canvas presets (see
// `canvasPresets.ts`), each drawn to the same scale as everything else, so a
// sketchbook is compared against A4 rather than described next to it. One
// carrying its own kit of tools wears a small toolbox mark, because that is the
// half of it a rectangle cannot show. Which shipped sizes are here at all, and
// which canvas presets stand beside them, is Settings → Canvas's answer; this
// component draws whatever it is handed.
//
// **Custom** is the last of the size cells, and it is drawn too: type a size and
// its rectangle takes its place on the shelf at the same scale as the rest, so a
// typed page is compared the way a named one is rather than being a number you
// have to imagine. It opens on a big square — the page nobody offers by name.
//
// **The shelf faces the way the screen does**, and **Flip** is the cell after
// it. Each shipped size is written down in whichever orientation it is quoted in
// — two displays on their sides, a sheet of paper on its end — and that is an
// accident of the quoting rather than an answer to what page you want. A phone
// held upright wants an upright page from all of them, so the orientation is one
// answer for the whole shelf and the sizes are turned to face it (see
// `canvasSize.ts`). Flip turns the shelf, the typed page, and the cell already
// lit, all at once — so it is a toggle rather than a choice you can lose your
// place in: flip and flip back and you are exactly where you started.

/** The box each cell is drawn inside, in CSS pixels. One scale is shared across
 *  the shelf, so this is the room the *largest* of them gets. */
const PREVIEW_BOX = { width: 104, height: 74 };

export function SizeShelf({
  items,
  chosen,
  custom,
  typed,
  orientation,
  onFlip,
  onPick,
  onPickCustom,
  dimensions,
}: {
  /** The sizes on offer — the shipped ones that are showing, then the canvas
   *  types (see `canvasShelf`). */
  items: readonly ShelfItem[];
  /** The cell that is lit, and the page it stands for right now.
   *
   *  By id rather than by size, because two cells can be the same page (a
   *  sketchbook typed at A4's pixels) and lighting both would say the wrong one
   *  is in hand. The size comes with it because the lit cell is drawn at the page
   *  actually in hand rather than at the one it started as: Flip turns that page
   *  without re-quoting a canvas preset (see `canvasShelf`), and a rectangle that
   *  disagreed with what Create is about to make would be the one cell on the
   *  shelf that lies. `null` while the typed cell holds it. */
  chosen: { id: string; size: CanvasSize } | null;
  /** The typed page, or `null` when the fields don't describe one. */
  custom: CanvasSize | null;
  /** Whether the typed cell is the one in hand. */
  typed: boolean;
  /** Which way round every page on the shelf is standing. */
  orientation: Orientation;
  onFlip: () => void;
  onPick: (item: ShelfItem) => void;
  onPickCustom: () => void;
  dimensions: (size: CanvasSize) => string;
}) {
  const t = useT();
  // The typed page is on the shelf, so it is in the scale too: type a bigger
  // page than 4K and the whole shelf shrinks to keep the comparison honest.
  const scale = previewScale(
    [
      ...items.map((item) => item.size),
      ...(chosen ? [chosen.size] : []),
      custom ?? CUSTOM_CANVAS,
    ],
    PREVIEW_BOX,
  );
  return (
    <div
      className="grid grid-cols-3 gap-2 sm:grid-cols-6"
      role="radiogroup"
      aria-label={t("newImage.sizeLabel")}
    >
      {items.map((item) => {
        const active = !typed && item.id === chosen?.id;
        // The lit cell is drawn at the page in hand; every other cell at its
        // own (see `chosen`).
        const size = active ? chosen.size : item.size;
        return (
          <button
            key={`${item.kind}:${item.id}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(item)}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 ${
              active
                ? "border-accent bg-accent/10"
                : "border-line hover:bg-surface-2"
            }`}
          >
            {/* The page itself, at the shelf's scale. The row of boxes is a
                fixed height so the rectangles sit on one baseline and only
                their own shapes differ. */}
            <span
              aria-hidden="true"
              className="relative flex items-end justify-center"
              style={{ height: `${PREVIEW_BOX.height}px` }}
            >
              <span
                className={`block rounded-[2px] border ${
                  active
                    ? "border-accent bg-accent/20"
                    : "border-muted bg-surface-2"
                }`}
                style={{
                  width: `${Math.max(6, Math.round(size.width * scale))}px`,
                  height: `${Math.max(6, Math.round(size.height * scale))}px`,
                }}
              />
              {/* A page that brings its own tools says so on the rectangle
                  rather than under it: the name below is the user's own words
                  and already the longest thing in the cell. */}
              {item.kind === "preset" && item.kit && (
                <ToolboxIcon className="absolute right-0 bottom-0 h-3.5 w-3.5 text-accent" />
              )}
            </span>
            <span
              className={`w-full truncate text-center text-xs ${
                active ? "text-accent" : "text-fg-bright"
              }`}
            >
              {item.kind === "size"
                ? t(`newImage.presets.${item.id}`)
                : item.name}
            </span>
            <span className="text-[10px] whitespace-nowrap text-muted tabular-nums">
              {dimensions(size)}
            </span>
          </button>
        );
      })}

      {/* The typed page, drawn like the rest — the fields for it appear under
          the shelf once this is the cell in hand. A size the fields can't make
          a page of shows as a dashed outline of the last usable one, so the
          cell never collapses to nothing while you are mid-number. */}
      <button
        type="button"
        role="radio"
        aria-checked={typed}
        onClick={onPickCustom}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 ${
          typed
            ? "border-accent bg-accent/10"
            : "border-line hover:bg-surface-2"
        }`}
      >
        <span
          aria-hidden="true"
          className="flex items-end justify-center"
          style={{ height: `${PREVIEW_BOX.height}px` }}
        >
          <span
            className={`block rounded-[2px] border border-dashed ${
              typed ? "border-accent bg-accent/20" : "border-muted bg-surface-2"
            }`}
            style={{
              width: `${Math.max(6, Math.round((custom ?? CUSTOM_CANVAS).width * scale))}px`,
              height: `${Math.max(6, Math.round((custom ?? CUSTOM_CANVAS).height * scale))}px`,
            }}
          />
        </span>
        <span
          className={`text-xs whitespace-nowrap ${
            typed ? "text-accent" : "text-fg-bright"
          }`}
        >
          {t("newImage.custom")}
        </span>
        <span className="text-[10px] whitespace-nowrap text-muted tabular-nums">
          {custom ? dimensions(custom) : t("newImage.customEmpty")}
        </span>
      </button>

      {/* Stand the whole shelf the other way up — every shipped size, every
          canvas preset, the typed one, and the page currently chosen, all at once.

          It is the last cell of the shelf rather than a control above it
          because it is an answer about the same thing the shelf is: a page is a
          shape, and which way round that shape stands is half of the shape. A
          button and not one more radio, though — it doesn't compete with them
          for the selection, it turns whichever one is already lit. */}
      <button
        type="button"
        onClick={onFlip}
        aria-label={t(
          orientation === "portrait"
            ? "newImage.flipToLandscape"
            : "newImage.flipToPortrait",
        )}
        className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-line p-2 hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="flex items-center justify-center"
          style={{ height: `${PREVIEW_BOX.height}px` }}
        >
          <FlipIcon className="h-10 w-10 text-accent" />
        </span>
        <span className="text-xs whitespace-nowrap text-fg-bright">
          {t("newImage.flip")}
        </span>
        {/* Which way the shelf is standing now — the state, not the promise,
            so the cell says what you are looking at rather than what pressing
            it would give you. */}
        <span className="text-[10px] whitespace-nowrap text-muted">
          {t(`newImage.${orientation}`)}
        </span>
      </button>
    </div>
  );
}
