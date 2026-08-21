// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pixel grid: the document's own lattice, ruled over the picture once the
// zoom is high enough for one document pixel to be worth several of the
// screen's.
//
// A drawing is vectors (see `types.ts`), so nothing here is about how the marks
// are stored — it is about the resolution they will *land* at. One cell is one
// document pixel: the square an exported PNG resolves to a single colour, and
// the unit every size, offset and page dimension in the app is counted in. Far
// enough in, that lattice is the thing you are working against, and a screen
// that does not show it is asking you to guess where the boundaries are.
//
// Three things decide whether it is a help or a haze, and all three are settled
// by the same number — `deviceScale`, how many *device* pixels one document
// pixel covers, which is exactly what the zoom readout says (see `nativeScale`:
// 100% is one document pixel per device pixel):
//
//   - **It must be thinner than what it rules.** A line is one device pixel,
//     the thinnest a screen can draw, so at 300% it is already a third of the
//     cell — the sheet reads as tinted rather than ruled, and every colour on
//     the page is dragged towards grey. That is the whole reason the grid waits
//     until `PIXEL_GRID_FROM`: not because the lattice is uninteresting below
//     it, but because drawing it there would cover the picture in a wash.
//   - **It must not pop.** Zoom is continuous, so a grid that switched on at a
//     threshold would flash the whole page at one notch of the wheel. It fades
//     in across the band up to `PIXEL_GRID_FULL` — 1000%, where it is fully up
//     — instead, which reads as the lattice *resolving* out of the sheet.
//   - **It must be crisp.** The lines are laid in device pixels, on whole
//     device pixels, rather than in document coordinates through the view
//     transform: a boundary at a fractional device coordinate would be
//     antialiased into two half-lit columns — twice as wide and half as sharp
//     as the thing it is drawing. Whole pixels also mean the spacing wobbles
//     between, say, 5 and 6 device pixels at 530%, which is not an artefact:
//     it is where those boundaries genuinely fall.
//
// Screen-only, like the guide grid it sits above and the transparency chequer
// below: it is painted as chrome (see `frame.ts`), after the mark cache has
// taken its copy, so it never reaches an export and never has to be repainted
// out of one.

import type { CanvasView } from "./viewport.ts";

/** Where the grid begins to show, in device pixels per document pixel — the
 *  zoom readout's percentage over 100.
 *
 *  The floor of the band is set by what a one-device-pixel line *costs*: it
 *  covers `1/deviceScale` of the cell each way, which is a third of the page at
 *  300% and a quarter at 400% — at those zooms the sheet reads as tinted rather
 *  than ruled, and every colour on it is dragged towards grey. Around a fifth
 *  (500%) the grid starts to read as something laid over the picture; by an
 *  eighth it is plainly subordinate to it, which is where this band opens. */
export const PIXEL_GRID_FROM = 8;

/** …and where it reaches full strength: 1000%, ten screen pixels to one of the
 *  document's, where a single pixel is a square you can put a mark inside and
 *  the lattice is the thing you are working against. The band up from
 *  `PIXEL_GRID_FROM` is what keeps the grid from arriving all at once — it is a
 *  couple of wheel notches wide, and reads as the lattice resolving out of the
 *  sheet rather than switching on. */
export const PIXEL_GRID_FULL = 10;

/** The grid's ink, at full strength. A fixed translucent grey for the guide
 *  grid's reason (see `render.ts`): it has to read on a white sheet and on a
 *  black one, and it is never the thing you are looking at. */
const PIXEL_GRID_INK = "120,130,145";
const PIXEL_GRID_ALPHA = 0.3;

/** How strongly the grid is ruled at this zoom — `0` for "not at all", which is
 *  every zoom below `PIXEL_GRID_FROM`. Pure, so the whole ramp can be checked
 *  without a canvas. */
export function pixelGridAlpha(deviceScale: number): number {
  if (!Number.isFinite(deviceScale) || deviceScale <= PIXEL_GRID_FROM) return 0;
  const t = Math.min(
    1,
    (deviceScale - PIXEL_GRID_FROM) / (PIXEL_GRID_FULL - PIXEL_GRID_FROM),
  );
  return PIXEL_GRID_ALPHA * t;
}

/** Where the sheet lands in the window, in whole device pixels and clamped to
 *  it — the grid is ruled on the page and not on the desk around it. `null`
 *  when the page is off screen entirely. */
function sheetOnScreen(
  page: { width: number; height: number },
  view: CanvasView,
  dpr: number,
  window_: { width: number; height: number },
): { left: number; top: number; right: number; bottom: number } | null {
  const left = Math.max(0, Math.round(view.tx * dpr));
  const top = Math.max(0, Math.round(view.ty * dpr));
  const right = Math.min(
    window_.width,
    Math.round((page.width * view.scale + view.tx) * dpr),
  );
  const bottom = Math.min(
    window_.height,
    Math.round((page.height * view.scale + view.ty) * dpr),
  );
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

/**
 * Rule the pixel grid over the window. A no-op below `PIXEL_GRID_FROM`, which
 * is the zoom the canvas spends nearly all its time at.
 *
 * Painted in **device pixels**: the context's transform is set aside for the
 * duration and every line is a one-pixel rect on a whole pixel. `window_` is
 * the canvas's size in device pixels — the same `width` / `height` the frame
 * sized it to.
 */
export function paintPixelGrid(
  ctx: CanvasRenderingContext2D,
  page: { width: number; height: number },
  view: CanvasView,
  dpr: number,
  window_: { width: number; height: number },
): void {
  const deviceScale = view.scale * dpr;
  const alpha = pixelGridAlpha(deviceScale);
  if (alpha <= 0) return;
  const sheet = sheetOnScreen(page, view, dpr, window_);
  if (!sheet) return;
  const { left, top, right, bottom } = sheet;

  // The document columns and rows the window can actually see. Bounded by the
  // page as well as by the window, so a sheet smaller than the screen is ruled
  // to its own edges and no further.
  const column = (at: number) => (at / dpr - view.tx) / view.scale;
  const row = (at: number) => (at / dpr - view.ty) / view.scale;
  const firstX = Math.max(0, Math.ceil(column(left)));
  const lastX = Math.min(page.width, Math.floor(column(right)));
  const firstY = Math.max(0, Math.ceil(row(top)));
  const lastY = Math.min(page.height, Math.floor(row(bottom)));

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(${PIXEL_GRID_INK},${alpha.toFixed(3)})`;
  ctx.beginPath();
  // One path, filled once: a stroke per line would cost the same rasteriser
  // setup a few hundred times over on a frame that has to leave time for the
  // marks.
  for (let x = firstX; x <= lastX; x++) {
    const at = Math.round((x * view.scale + view.tx) * dpr);
    // The sheet's own edges are the chrome hairline's (see `frame.ts`); a grid
    // line on top of one would only thicken it.
    if (at <= left || at >= right) continue;
    ctx.rect(at, top, 1, bottom - top);
  }
  for (let y = firstY; y <= lastY; y++) {
    const at = Math.round((y * view.scale + view.ty) * dpr);
    if (at <= top || at >= bottom) continue;
    ctx.rect(left, at, right - left, 1);
  }
  ctx.fill();
  ctx.restore();
}
