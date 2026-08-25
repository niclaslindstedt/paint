// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef } from "react";

import { defaultInk } from "./canvas.ts";
import { GROUNDS, groundById, type GroundDescriptor } from "./ground.ts";
import { useT } from "./i18n/index.ts";
import { renderDrawing } from "./render.ts";
import {
  TileCache,
  blit,
  enqueuePaint,
  rendererKey,
  tileCanvas,
  tileRatio,
} from "./tiles.ts";
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
// **The stocks are shown rather than told**: each swatch is a bare patch of the
// sheet itself, magnified to where its grain is a texture you can read rather
// than a tint — what the paper actually looks like, with nothing drawn on it.
// It used to carry a sample ink line and a wash, and they earned their keep
// badly: at swatch size every sheet's marks looked like every other sheet's,
// and the paper itself — the thing being chosen — was invisible under them.
// What a stock is *for* is a sentence now (the hint under the shelf), and what
// it *is* is the picture. Each swatch is still painted by the renderer, through
// the same ground painter the page uses, so it is the sheet rather than an
// illustration of one.

/** How big a swatch is on screen, in CSS pixels. Sized so the whole shelf fits
 *  two short rows of the new-drawing dialog: a stock you have to scroll to
 *  compare is a stock nobody compares. */
const SWATCH = { width: 68, height: 48 };

/** How far the sheet is magnified in the swatch: 300%, the zoom a page's own
 *  grain reads clearly at. The swatch shows the patch of paper that would fill
 *  it at that zoom — a close look at the surface, not a page seen from across
 *  the room. */
const MAGNIFY = 3;

/** …and the patch of page the swatch is a picture of, in document pixels. */
const SAMPLE = {
  width: SWATCH.width / MAGNIFY,
  height: SWATCH.height / MAGNIFY,
};

/** Swatches already painted, keyed by everything that decides their pixels —
 *  stock, grain, page colour, theme, and the device's pixel ratio.
 *
 *  A swatch is only a patch of ground now, but the first one on a fresh page
 *  still builds the grain tiles it is painted from, and a shelf painted in one
 *  effect flush is a shelf that stutters. Painted pixels never go stale — the
 *  same key is the same picture — so they are kept for the life of the tab, and
 *  reopening the dialog blits bitmaps instead of painting. Capped because a
 *  drag of the grain slider mints a shelf's worth of entries per step; the
 *  oldest go first, and repainting an evicted swatch costs what it always
 *  cost. */
const painted = new TileCache(60);

/** Everything a swatch's pixels are a function of, folded into its cache key.
 *  The engines in force are in it too (`rendererKey`): they are read as globals
 *  by the renderer (see `plugins/wash.ts`), so two swatches painted either side
 *  of an engine change are two different pictures under the same props. */
function swatchKey(
  stock: string | undefined,
  texture: number,
  pageColor: string,
  dark: boolean,
  dpr: number,
): string {
  return [stock ?? "solid", texture, pageColor, dark, dpr, rendererKey()].join(
    "|",
  );
}

/** One swatch, painted onto a canvas of its own — the cache's currency. `null`
 *  where a 2D context is not to be had. */
function paintSwatch(
  stock: string | undefined,
  texture: number,
  pageColor: string,
  dark: boolean,
  dpr: number,
): HTMLCanvasElement | null {
  const made = tileCanvas(SWATCH.width, SWATCH.height, dpr);
  if (!made) return null;
  const { canvas, ctx } = made;
  const ground: Ground | undefined = stock
    ? { stock, ...(texture === 1 ? {} : { texture }) }
    : undefined;
  // A page with nothing on it: the swatch is the sheet, not a drawing.
  const drawing: Drawing = {
    id: "swatch",
    name: "",
    width: SAMPLE.width,
    height: SAMPLE.height,
    strokes: [],
    ...(ground ? { ground } : {}),
  };
  const scale = canvas.width / SAMPLE.width;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  // The bare page, through the app's own renderer at the magnifying zoom: same
  // ground painter, same grain tiles, so what the swatch shows is exactly what
  // the page looks like zoomed to the same place. A swatch that drew its own
  // idea of paper would be free to be wrong about it.
  renderDrawing(ctx, drawing, null, {
    pageColor,
    defaultInk: defaultInk(dark),
  });
  return canvas;
}

/** Paint the shelf a fresh dialog opens on, before anyone opens it.
 *
 *  The first swatch painted on a fresh page costs the most — the grain tiles
 *  are built on that first run — and a whole shelf painted in one flush is a
 *  dialog that stutters as it opens. Called at idle from the app with the page
 *  a fresh dialog will actually show — no colour, grain at 1 — so the bill is
 *  paid where nobody is waiting, one swatch per frame through the same queue,
 *  and the dialog's own shelf is a row of blits. Calling it warm costs a map
 *  lookup per stock. */
export function warmSwatches(pageColor: string, dark: boolean): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const dpr = tileRatio();
  for (const { id, family } of GROUNDS) {
    const stock = family === "solid" ? undefined : id;
    const key = swatchKey(stock, 1, pageColor, dark, dpr);
    if (painted.has(key)) continue;
    enqueuePaint(() => {
      if (painted.has(key)) return;
      const swatch = paintSwatch(stock, 1, pageColor, dark, dpr);
      if (swatch) painted.remember(key, swatch);
    });
  }
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
    const dpr = tileRatio();
    const key = swatchKey(stock, texture, pageColor, dark, dpr);
    // Seen before: a blit, on the spot. The queue is only for pixels that have
    // to be worked out.
    const kept = painted.get(key);
    if (kept) {
      blit(canvas, kept);
      return;
    }
    return enqueuePaint(() => {
      // Looked up again inside the job: a warming pass may have painted this
      // very swatch while ours stood in the queue.
      const swatch =
        painted.get(key) ?? paintSwatch(stock, texture, pageColor, dark, dpr);
      if (!swatch) return;
      painted.remember(key, swatch);
      blit(canvas, swatch);
    });
  }, [stock, texture, pageColor, dark]);

  return (
    <canvas
      ref={ref}
      // The page's own colour behind the canvas, so a swatch still in the queue
      // reads as a blank page rather than a hole in the shelf. It fills its
      // cell up to its own size, so a narrow phone shrinks the swatch a hair
      // instead of overflowing the grid.
      style={{
        width: "100%",
        maxWidth: SWATCH.width,
        aspectRatio: `${SWATCH.width} / ${SWATCH.height}`,
        backgroundColor: pageColor,
      }}
      className="block rounded-sm"
    />
  );
}

/** Every stock this build ships, as a shelf of swatches to choose from.
 *
 *  One flat grid rather than a family control and a shelf under it: the whole
 *  catalog is short enough to compare in a glance (see `GROUNDS`), and a
 *  comparison is what the choice is. */
export function GroundPicker({
  value,
  texture = 1,
  onChange,
  pageColor,
  dark,
  label,
}: {
  /** The stock in hand, by id — `undefined` for the plain solid sheet, which is
   *  how a page with no ground at all is stored. */
  value: string | undefined;
  /** How strongly the grain shows, as a multiple of the stock's own weight.
   *  Every cell is painted at it, so turning the grain down is a change you
   *  watch happen across the whole shelf rather than one you take on trust. */
  texture?: number;
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
          whatever its stock is called and the shelf reads as even rows of
          pages instead of a ragged line of buttons. Four to a row: eight
          stocks make two full rows on every screen. */}
      <div
        className="grid grid-cols-4 gap-2"
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
                texture={texture}
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
