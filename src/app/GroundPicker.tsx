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

/** Swatches already painted, keyed by everything that decides their pixels —
 *  stock, grain, page colour, theme, and the device's pixel ratio.
 *
 *  A swatch is not cheap: the wash on it goes through the real watercolour
 *  engine, and six of them painted in one effect flush held the new-image
 *  dialog's thread for the better part of a second. Painted pixels never go
 *  stale — the same key is the same picture — so they are kept for the life of
 *  the tab, and reopening the dialog blits six bitmaps instead of running six
 *  simulations. Capped because a drag of the grain slider mints a shelf's worth
 *  of entries per step; the oldest go first, and repainting an evicted swatch
 *  costs what it always cost. */
const painted = new Map<string, HTMLCanvasElement>();
const PAINTED_MAX = 60;

function remember(key: string, swatch: HTMLCanvasElement): void {
  if (painted.size >= PAINTED_MAX) {
    const oldest = painted.keys().next().value;
    if (oldest !== undefined) painted.delete(oldest);
  }
  painted.set(key, swatch);
}

/** Swatches waiting to be painted, taken one per animation frame.
 *
 *  One per frame rather than all at once, because the queue's whole reason to
 *  exist is that a swatch is worth a real slice of a frame: painting the shelf
 *  in one go blocks the thread until the last one is done, and the dialog that
 *  just opened sits frozen behind it. Spread out, the dialog paints first and
 *  stays interactive while the shelf fills in — and a swatch whose answer is no
 *  longer wanted (the grain slider has moved on) is pulled back off the queue by
 *  its effect's cleanup instead of being painted and thrown away. */
const queue: Array<() => void> = [];
let pumping = false;

function pump(): void {
  const job = queue.shift();
  if (!job) {
    pumping = false;
    return;
  }
  job();
  requestAnimationFrame(pump);
}

/** Put a paint job in line. Returns the way to take it back out. */
function enqueue(job: () => void): () => void {
  queue.push(job);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return () => {
    const at = queue.indexOf(job);
    if (at >= 0) queue.splice(at, 1);
  };
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
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(SWATCH.width * dpr);
  canvas.height = Math.round(SWATCH.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
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
  return canvas;
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
    const key = [stock ?? "solid", texture, pageColor, dark, dpr].join("|");
    const show = (source: HTMLCanvasElement) => {
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext("2d")?.drawImage(source, 0, 0);
    };
    // Seen before: a blit, on the spot. The queue is only for pixels that have
    // to be worked out.
    const kept = painted.get(key);
    if (kept) {
      show(kept);
      return;
    }
    return enqueue(() => {
      const swatch = paintSwatch(stock, texture, pageColor, dark, dpr);
      if (!swatch) return;
      remember(key, swatch);
      show(swatch);
    });
  }, [stock, texture, pageColor, dark]);

  return (
    <canvas
      ref={ref}
      // The page's own colour behind the canvas, so a swatch still in the queue
      // reads as a blank page rather than a hole in the shelf.
      style={{
        width: SWATCH.width,
        height: SWATCH.height,
        backgroundColor: pageColor,
      }}
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
