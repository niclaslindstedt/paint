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
// Two different measures of the zoom decide this, and keeping them apart is the
// whole of getting it right on a phone:
//
//   - **How big a cell looks** is `view.scale`, in CSS pixels per document
//     pixel. A CSS pixel is normalised for viewing distance, so this is the one
//     number that means the same thing on a laptop and on a phone held closer to
//     your face. It is what the band below is measured in.
//   - **How big a cell is in the screen's own dots** is `scale * dpr`, which is
//     what the zoom readout reports as a percentage (see `nativeScale`: 100% is
//     one document pixel per device pixel). It decides how *thin* the line comes
//     out, because the line is one device pixel — the thinnest a screen can
//     draw — and nothing else.
//
// Measuring the band in device pixels is the trap, and it was measured that way
// first. On a 3× phone a document pixel at 690% is 2.3 CSS pixels across:
// ruled, that page is a faint even texture with no squares in it — the readout
// says the grid is at full strength while the glass shows a wash. The same
// picture at 1500%, where a cell is 4.9 CSS pixels, reads as a lattice, and 4.9
// CSS pixels is exactly what a 1× screen shows at 500%. So the band is in CSS
// pixels and the grid arrives at the same *apparent* size everywhere, at
// whatever percentage that device's readout happens to call it.
//
// Two further rules, both about the line rather than the cell:
//
//   - **It must be thinner than what it rules.** At the bottom of the band a 1×
//     screen puts one device pixel of line into a five-pixel cell — a fifth,
//     which is the heaviest the grid ever gets and the case the ink was tuned
//     against. A denser screen only ever makes it lighter (a fifteenth on that
//     3× phone), which is the ordinary retina dividend: the same lattice, less
//     of the page spent drawing it.
//   - **It must be crisp.** The lines are laid in device pixels, on whole
//     device pixels, rather than in document coordinates through the view
//     transform: a boundary at a fractional device coordinate would be
//     antialiased into two half-lit columns — twice as wide and half as sharp
//     as the thing it is drawing. Whole pixels also mean the spacing wobbles
//     between, say, 5 and 6 device pixels where the cell is 5.3 of them, which
//     is not an artefact: it is where those boundaries genuinely fall.
//
// Screen-only, like the guide grid it sits above and the transparency chequer
// below: it is painted as chrome (see `frame.ts`), after the mark cache has
// taken its copy, so it never reaches an export and never has to be repainted
// out of one.

import type { CanvasView } from "./viewport.ts";

/** Where the grid begins to show, in **CSS pixels** per document pixel.
 *
 *  Five, and it is a size rather than a percentage on purpose: it is how wide a
 *  cell has to look before the lines around it resolve into squares instead of
 *  smearing into a tint. Below it they are too close together to tell apart —
 *  the sheet reads as tinted and every colour on the page is dragged towards
 *  grey — and that is true of a phone at 1400% exactly as it is of a laptop at
 *  400%, which is why the number is not in the readout's units.
 *
 *  On a 1× screen the readout calls this 500%; on a 2× one, 1000%; on a 3×
 *  phone, 1500%. Those are the same picture. */
export const PIXEL_GRID_FROM = 5;

/** …and where it reaches full strength: a cell seven CSS pixels across, the
 *  first size at which a full-strength grid reads as a lattice laid over a white
 *  page rather than as a texture in it.
 *
 *  The two numbers do one job between them. A grid that simply switched on at a
 *  threshold would flash the whole page at one notch of the wheel — and worse,
 *  it would be at its densest exactly where the cell is smallest. Fading across
 *  the band inverts that: two thirds of the way up, where full strength is a
 *  shade heavy, the grid is at two thirds of it, so the ink arrives in step
 *  with the room to put it in.
 *
 *  `MAX_SCALE` is more than twice this, on every screen, because it is in these
 *  same CSS pixels — so every device gets the same headroom above the band to
 *  actually work in. */
export const PIXEL_GRID_FULL = 7;

/** The grid's ink, at full strength. A fixed translucent grey for the guide
 *  grid's reason (see `render.ts`): it has to read on a white sheet and on a
 *  black one, and it is never the thing you are looking at. */
const PIXEL_GRID_INK = "120,130,145";
const PIXEL_GRID_ALPHA = 0.3;

/** How strongly the grid is ruled at this zoom — `0` for "not at all", which is
 *  every zoom below `PIXEL_GRID_FROM`. `scale` is the view's own, in CSS pixels
 *  per document pixel: **not** the readout's percentage, which counts device
 *  pixels and so means a different apparent size on every screen. Pure, so the
 *  whole ramp can be checked without a canvas. */
export function pixelGridAlpha(scale: number): number {
  if (!Number.isFinite(scale) || scale <= PIXEL_GRID_FROM) return 0;
  const t = Math.min(
    1,
    (scale - PIXEL_GRID_FROM) / (PIXEL_GRID_FULL - PIXEL_GRID_FROM),
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
 * is where the canvas spends nearly all its time.
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
  const alpha = pixelGridAlpha(view.scale);
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
