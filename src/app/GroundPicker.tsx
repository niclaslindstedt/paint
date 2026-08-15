// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef } from "react";

import { defaultInk } from "./canvas.ts";
import { GROUNDS, groundById, type GroundDescriptor } from "./ground.ts";
import { useT } from "./i18n/index.ts";
import { renderDrawing } from "./render.ts";
import { mm } from "./units.ts";
import type { Drawing, Ground } from "./types.ts";

// Picking the sheet a drawing is on — the shelf itself, and the swatch one cell
// of it is.
//
// It lives here rather than in the dialog that uses it because two screens show
// a sheet: the new-drawing dialog picks one, and Settings → Canvas shows the one
// the open drawing was made on. The sheet is chosen **once**, when the drawing
// is created (see `NewDrawingModal`), for the same reason the page size is: a
// mark is painted *into* the sheet it was made on, so changing the stock under a
// finished painting would repaint every mark on it as something the hand that
// drew them never saw. Size and surface are the two answers a page is built
// from; colour, which is only ever a backdrop, stays editable.
//
// **The stocks are shown rather than listed**, the same call the size shelf
// makes: a swatch of the sheet with a wash laid across an ink line on it answers
// "what is rough for?" in a way no sentence does, because the answer is a
// picture. Each swatch is painted by the renderer, through the same painters the
// page uses, so it is the sheet rather than an illustration of one.

/** How big a swatch is on screen, in CSS pixels. Sized so the whole shelf fits
 *  one row of the new-drawing dialog: a stock you have to scroll to compare is
 *  a stock nobody compares. */
const SWATCH = { width: 68, height: 48 };

/** …and the page it is a picture of, in document pixels. Large enough that a
 *  real brush width and a real paper grain both have room to be themselves at
 *  the scale the swatch is drawn at. */
const SAMPLE = { width: 420, height: 300 };

/** The marks on every swatch: a line of ink, and a wash laid across it.
 *
 *  Deliberately those two and in that order, because between them they show
 *  everything the sheet does — the grain under the wash, how far the water ran
 *  past the brush, whether the pigment mottled, and whether the ink line under
 *  it bled out into the water or sat there untouched. On the solid sheet the
 *  wash simply covers the line; on rough paper the line dissolves into it. */
function sampleMarks(ink: string, wash: string) {
  return [
    {
      id: "ink",
      tool: "pencil",
      color: ink,
      size: mm(0.5),
      shape: {
        kind: "path" as const,
        points: [
          { x: 120, y: 40 },
          { x: 150, y: 150 },
          { x: 140, y: 260 },
        ],
      },
    },
    {
      id: "wash",
      tool: "watercolor",
      color: wash,
      size: mm(5),
      shape: {
        kind: "path" as const,
        points: [
          { x: 40, y: 110 },
          { x: 160, y: 150 },
          { x: 290, y: 130 },
          { x: 380, y: 175 },
        ],
      },
    },
  ];
}

/** One stock, painted as the page it is. */
export function GroundSwatch({
  stock,
  texture,
  pageColor,
  dark,
}: {
  /** The stock to paint, or `undefined` for the plain solid sheet. */
  stock: string | undefined;
  texture: number;
  pageColor: string;
  dark: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(SWATCH.width * dpr);
    canvas.height = Math.round(SWATCH.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ink = defaultInk(dark);
    const ground: Ground | undefined = stock
      ? { stock, ...(texture === 1 ? {} : { texture }) }
      : undefined;
    const drawing: Drawing = {
      id: "swatch",
      name: "",
      width: SAMPLE.width,
      height: SAMPLE.height,
      strokes: sampleMarks(ink, dark ? "#7dd3fc" : "#2563eb"),
      ...(ground ? { ground } : {}),
    };
    const scale = canvas.width / SAMPLE.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // The whole page, through the app's own renderer: same painters, same
    // grain, same mixing. A swatch that drew its own idea of paper would be
    // free to be wrong about it.
    renderDrawing(ctx, drawing, null, { pageColor, defaultInk: ink });
  }, [stock, texture, pageColor, dark]);

  return (
    <canvas
      ref={ref}
      style={{ width: SWATCH.width, height: SWATCH.height }}
      className="block rounded-sm"
    />
  );
}

/** Every stock this build ships, as a shelf of swatches to choose from.
 *
 *  One flat row rather than a family control and a shelf under it: the whole
 *  catalog is short enough to compare in a glance (see `GROUNDS`), and a
 *  comparison is what the choice is. */
export function GroundPicker({
  value,
  onChange,
  pageColor,
  dark,
  label,
}: {
  /** The stock in hand, by id — `undefined` for the plain solid sheet, which is
   *  how a page with no ground at all is stored. */
  value: string | undefined;
  onChange: (stock: GroundDescriptor) => void;
  /** The page colour the drawing will actually paint on, so a swatch is that
   *  page on this stock rather than a stranger's. */
  pageColor: string;
  dark: boolean;
  /** What the shelf is, for a screen reader. */
  label: string;
}) {
  const t = useT();
  const chosen = groundById(value) ?? GROUNDS[0]!;
  return (
    <div className="flex flex-col gap-2">
      {/* A grid rather than a wrapping row, so every cell is the same width
          whatever its stock is called and the shelf reads as one row of pages
          instead of a ragged line of buttons. */}
      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-6"
        role="radiogroup"
        aria-label={label}
      >
        {GROUNDS.map((stock) => {
          const picked = stock.id === chosen.id;
          return (
            <button
              key={stock.id}
              type="button"
              role="radio"
              aria-checked={picked}
              onClick={() => onChange(stock)}
              title={t(stock.hintKey)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded border p-1 ${
                picked
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-muted hover:bg-surface-2"
              }`}
            >
              <GroundSwatch
                stock={stock.family === "solid" ? undefined : stock.id}
                texture={1}
                pageColor={pageColor}
                dark={dark}
              />
              <span className="text-center text-[10px] leading-tight">
                {t(stock.nameKey)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">{t(chosen.hintKey)}</p>
    </div>
  );
}
