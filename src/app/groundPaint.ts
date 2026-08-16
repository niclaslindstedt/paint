// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting the sheet's grain.
//
// The other half of `ground.ts`: that module says what a sheet *does*, this one
// draws what it looks like. They are split for the reason `effects.ts` and
// `effectPaint.ts` are — the model is read all over the app and by the tests,
// and the painting needs a DOM.
//
// The grain is a **repeating tile filled as a pattern**, and that is the only
// way it can be. A page is 3200 × 2000 document pixels and cold-pressed paper
// dips every ten of them, so drawing the grain dip by dip is sixty thousand
// dabs per repaint before a single mark is painted. One tile of a few hundred
// pixels, repeated by the rasteriser, costs one fill.
//
// Three rules keep it honest:
//
//   - **It is anchored to the page, and the anchor beats everything.** A tile
//     is a fixed number of cells of *this sheet* (`CELLS`), laid down at the
//     sheet's own pitch in document coordinates. So a dip in the paper is at a
//     place on the paper: panning moves the sheet with the drawing, zooming
//     magnifies it with the drawing, and two marks that overlap agree about
//     where the sheet is low. The same rule the painters' own grain follows
//     (see `grain.ts`).
//
//     It is worth saying what this rules *out*, because the obvious thing to do
//     instead is to size the tile in whole device pixels so its lattice lands
//     one-for-one on the screen's. That buys a little crispness and it costs
//     the anchor: rounding the cell to a whole screen pixel stretches the tile
//     by up to half a pixel in every cell, and stretching a pattern pinned at
//     the page's corner walks every dip in it towards that corner. You see it
//     the moment you zoom — the marks hold still and the paper under them
//     crawls diagonally, like a slide moving under a microscope. Paper does not
//     do that. A resample does not show.
//
//   - **Its resolution follows the zoom, its layout does not.** Which tile gets
//     built is chosen from how big a cell currently is on screen, so the sheet
//     is drawn at about the detail the screen can take. That choice is safe to
//     make per zoom *only* because the layout is hashed off the cell lattice
//     (`hashedRandom(gx, gy, …)`) and not off the pixels: the same sheet at two
//     resolutions is the same dips in the same places, drawn finer. Rebuilding
//     as you zoom therefore sharpens the paper without moving it.
//
//   - **It fades out when it gets too fine to see.** A sheet whose grain has
//     shrunk below a device pixel is a sheet with no visible grain, and drawing
//     one is a page-sized fill of noise nobody can resolve — worse than nothing,
//     because at that size it reads as a flat film of dirt over the drawing.
//
// Everything is hashed off the lattice rather than drawn at random
// (`hashedRandom`), so the same sheet has the same grain on every repaint, in
// the export, and on every device.

import { hashedRandom } from "./plugins/grain.ts";
import { createSurface } from "./surface.ts";
import type { GroundPattern, GroundProfile } from "./ground.ts";

/** How dark the deepest dip of a sheet at full bite is painted. Low — grain you
 *  can *see* rather than grain you look at, and the marks are the picture. */
const SHADOW = 0.22;

/** …and how light its highest peak is. A touch under the shadow: the eye reads
 *  a lit surface as darker in the holes rather than brighter on the ridges, and
 *  it is what keeps the texture from looking like a layer of dust. Both are
 *  painted, because one of them has to carry the grain on a dark page and the
 *  other on a light one — the same reason the grid's ink is a fixed grey. */
const HIGHLIGHT = 0.17;

/** The grain is drawn at this many device pixels per cell, at the least. Below
 *  it the tile is a field of single pixels and the sheet reads as static, so
 *  the texture fades out instead (see `graininess`). */
const FINEST = 0.7;

/** …and it is at full strength from here up. */
const CLEAR = 1.6;

/** How many cells of the sheet one tile is, across and down.
 *
 *  Fixed, and that is the point: it is what makes a tile a piece of *paper* —
 *  `CELLS × tooth` document pixels of it, the same patch of sheet whatever the
 *  zoom — rather than a screenful of noise whose repeat changes size under you.
 *  Big enough that the repeat is hard to find; the eye picks a tiling out of
 *  random dips at around a couple of dozen. */
const CELLS = 64;

/** The most device pixels a cell is ever *drawn* at. Past it the tile is
 *  stretched rather than built bigger, because `CELLS²` cells at a large cell
 *  is a large bitmap — at 8 it is already 512 × 512, a megabyte, and every step
 *  up squares.
 *
 *  Stretching is cheap here in a way it would not be for most textures: a dip
 *  is a soft radial fade and a thread is a linear one, so magnifying the tile
 *  magnifies gradients and there is no detail in it to lose. Paper zoomed past
 *  its own grain *is* high ground and low ground with nothing between them. */
const MAX_CELL = 8;

/** How strongly the sheet's grain shows at this zoom, 0–1.
 *
 *  Not a cliff: a page zoomed slowly out has its grain fade rather than blink
 *  off, which is the difference between "the paper receded" and "something
 *  broke". */
export function graininess(cellPx: number): number {
  if (cellPx <= FINEST) return 0;
  if (cellPx >= CLEAR) return 1;
  return (cellPx - FINEST) / (CLEAR - FINEST);
}

/** How a sheet's tile is laid on the page at this zoom.
 *
 *  The whole of the anchoring, in two numbers and no canvas, so the thing that
 *  has to be true of it can be *tested* rather than looked at: `perPixel` is a
 *  function of the sheet alone past the rounding, so `cell × perPixel` is the
 *  sheet's own tooth at every zoom there is and a dip drawn at cell 30 is at the
 *  same place on the page at every zoom there is. Get that wrong and the paper
 *  slides under the drawing as it is magnified. */
export type GrainTile = {
  /** Tile pixels per cell — the resolution the tile is drawn at. */
  cell: number;
  /** Document pixels per tile pixel — the scale it is laid down at. */
  perPixel: number;
};

/** Which tile a sheet of this pitch wants at this zoom, and how big to lay it. */
export function grainTile(tooth: number, scale: number): GrainTile {
  // About one tile pixel per device pixel, in whole pixels so the tile is a
  // whole number of cells across and its repeat lands the lattice exactly where
  // the next copy of it continues. Capped, because past `MAX_CELL` the bitmap
  // costs more than the detail is worth.
  const cell = Math.max(1, Math.min(MAX_CELL, Math.round(tooth * scale)));
  // …and laid down at the *sheet's* pitch rather than the screen's, which is
  // what pins the grain to the page: one cell of the tile is one tooth of the
  // paper, so the tile covers the same `CELLS × tooth` of page however far it
  // is zoomed. Rounding `cell` above therefore costs a slight resample and
  // nothing else; dividing by the zoom here instead is what makes paper crawl.
  return { cell, perPixel: tooth / cell };
}

/** One built tile, keyed by what it was built from. Held across repaints
 *  because a tile is the same tile until the zoom crosses into the next
 *  resolution — and thrown away wholesale when the map grows past a handful,
 *  which is all the eviction a cache this size needs.
 *
 *  Sized to `MAX_CELL`, so one sheet's whole ladder of resolutions fits and a
 *  zoom swept end to end builds each rung once rather than rebuilding the coarse
 *  ones on the way back. That is eight tiles of `(cell × CELLS)²`, a little over
 *  three megabytes with the largest of them in it. */
const tiles = new Map<string, HTMLCanvasElement>();
const TILE_CACHE = MAX_CELL;

/** Paint the sheet's grain over `page`, in document coordinates.
 *
 *  A no-op for a ground with no grain, a zoom that has taken the grain below
 *  what a screen can show, and a context that cannot make patterns at all — the
 *  SVG export's recorder is the last of those, so a vector file comes out with
 *  a plain sheet rather than with a tile of noise embedded in it. In every one
 *  of those cases the page paints exactly as it did before grounds existed,
 *  which is the right failure for something that is texture and nothing else. */
export function paintGroundTexture(
  ctx: CanvasRenderingContext2D,
  page: { width: number; height: number },
  ground: GroundProfile,
  scale: number,
): void {
  if (ground.pattern === "none" || ground.bite <= 0 || ground.tooth <= 0)
    return;
  if (typeof ctx.createPattern !== "function") return;
  if (typeof DOMMatrix === "undefined") return;
  const cellPx = ground.tooth * scale;
  const showing = graininess(cellPx);
  if (showing <= 0) return;

  const { cell, perPixel } = grainTile(ground.tooth, scale);
  const tile = tileFor(ground.pattern, cell);
  if (!tile) return;
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  pattern.setTransform(new DOMMatrix([perPixel, 0, 0, perPixel, 0, 0]));

  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * Math.min(1, ground.bite) * showing;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.restore();
}

/** The tile for a pattern at a cell size, built once and kept. */
function tileFor(
  pattern: GroundPattern,
  cell: number,
): HTMLCanvasElement | null {
  const key = `${pattern}:${cell}`;
  const held = tiles.get(key);
  if (held) return held;
  const built = buildTile(pattern, cell);
  if (!built) return null;
  if (tiles.size >= TILE_CACHE) tiles.clear();
  tiles.set(key, built);
  return built;
}

/** Draw one tile at full strength — the caller turns it down to the sheet's own
 *  bite, so the same tile serves a hot-pressed sheet and a rough one.
 *
 *  `cell` is the only thing that varies with zoom, and it is a *resolution*:
 *  the lattice below is walked in cell indices and hashed off them, so the tile
 *  built at 3 pixels a cell and the tile built at 6 are the same sheet, one of
 *  them drawn twice as finely. That is what lets the zoom pick a tile without
 *  the paper changing. */
function buildTile(
  pattern: GroundPattern,
  cell: number,
): HTMLCanvasElement | null {
  const span = cell * CELLS;
  const surface = createSurface(span, span);
  if (!surface) return null;
  const ctx = surface.ctx;
  if (pattern === "cloth") weave(ctx, cell, CELLS);
  else tooth(ctx, cell, CELLS);
  return surface.canvas;
}

/** Paper: dips and peaks at random, in clumps.
 *
 *  Two octaves of the same hash, the coarser one at half the pitch, because a
 *  single octave is static — real paper has patches that are generally low and
 *  patches that are generally high, and the eye finds the difference
 *  immediately even though it cannot say what it is looking at. */
function tooth(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cells: number,
): void {
  const span = cell * cells;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const dip =
        hashedRandom(gx, gy, 5) * 0.62 +
        hashedRandom(gx >> 1, gy >> 1, 9) * 0.5;
      // The middle of the range is the sheet's own level and is left alone;
      // only what is genuinely low or genuinely high is painted, which is what
      // stops the tile turning into a solid film.
      const low = dip - 0.6;
      const high = 0.46 - dip;
      if (low <= 0 && high <= 0) continue;
      const dark = low > 0;
      const depth = Math.min(1, (dark ? low : high) / 0.45);
      // Nudged off the lattice and unevenly sized, so a sheet reads as fibre
      // rather than as graph paper — the same trick the crayon's and the
      // watercolour's grain use.
      const jx = (hashedRandom(gx, gy, 7) - 0.5) * cell * 0.7;
      const jy = (hashedRandom(gx, gy, 11) - 0.5) * cell * 0.7;
      // Wide enough that neighbouring dips run into one another: paper is a
      // continuous surface with high and low ground, and dabs that never touch
      // read as specks of dirt on it instead.
      const r = cell * (0.4 + hashedRandom(gx, gy, 13) * 0.36);
      dab(
        ctx,
        gx * cell + cell / 2 + jx,
        gy * cell + cell / 2 + jy,
        r,
        span,
        dark ? "0,0,0" : "255,255,255",
        (dark ? SHADOW : HIGHLIGHT) * depth,
      );
    }
  }
}

/** Cloth: warp over weft, over and under.
 *
 *  A weave is genuinely periodic — unlike paper, where the repeat is something
 *  to hide — so the tile is the cloth.
 *
 *  What makes it read as cloth rather than as a draughtboard is that a thread
 *  is **round**. Each cell is one thread crossing the other, and it is shaded
 *  across its own width: dark where it turns away at both sides, bright along
 *  its crown. Flat light and dark squares have the same layout and read as
 *  tiles, because nothing in them says which way the thread runs — the shading
 *  is the whole difference. The threads also vary in weight down their own
 *  length (a slub), so the cloth looks spun rather than printed. */
function weave(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cells: number,
): void {
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      // Which thread is on top at this crossing — plain weave, so it
      // alternates every cell in both directions.
      const warp = (gx + gy) % 2 === 0;
      // Thread by thread rather than cell by cell, so a heavy pick runs the
      // width of the cloth the way a slub in a real yarn does.
      const slub = 0.55 + hashedRandom(warp ? gx : gy, warp ? 0 : 1, 3) * 0.45;
      const x = gx * cell;
      const y = gy * cell;
      // Across the thread — and which way that is is the whole of what says
      // which one is on top here. The crown of it, then the two sides it turns
      // away on, drawn as two fades rather than one, because a single gradient
      // from black to white passes through a grey no cloth is made of.
      const toX = warp ? x + cell : x;
      const toY = warp ? y : y + cell;
      const crown = ctx.createLinearGradient(x, y, toX, toY);
      const light = (HIGHLIGHT * slub).toFixed(3);
      crown.addColorStop(0, "rgba(255,255,255,0)");
      crown.addColorStop(0.5, `rgba(255,255,255,${light})`);
      crown.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = crown;
      ctx.fillRect(x, y, cell, cell);
      const sides = ctx.createLinearGradient(x, y, toX, toY);
      const dark = (SHADOW * slub * 0.8).toFixed(3);
      sides.addColorStop(0, `rgba(0,0,0,${dark})`);
      sides.addColorStop(0.3, "rgba(0,0,0,0)");
      sides.addColorStop(0.7, "rgba(0,0,0,0)");
      sides.addColorStop(1, `rgba(0,0,0,${dark})`);
      ctx.fillStyle = sides;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/** A dip in the sheet, drawn again on the other side wherever it crosses the
 *  tile's edge.
 *
 *  **Soft-edged, not a disc.** A hard circle at the pitch of rough stock is a
 *  spot the size of a full stop, and a field of them reads as mould rather than
 *  as paper; what a sheet actually has is high ground and low ground with no
 *  edge between them. So each one is a radial fade, and where two overlap they
 *  make a wider, shallower hollow — which is what the eye reads as tooth.
 *
 *  The wrap is the other half. Without it every dip near a border is cut in
 *  half and the halves land against the next copy's untouched edge, painting a
 *  faint grid across the page at the tile's pitch. Drawing the same dip at up
 *  to four places is the whole of the fix, and it costs only the dips that
 *  actually reach an edge. */
function dab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  span: number,
  rgb: string,
  alpha: number,
): void {
  for (const dx of x - r < 0 ? [0, span] : x + r > span ? [0, -span] : [0]) {
    for (const dy of y - r < 0 ? [0, span] : y + r > span ? [0, -span] : [0]) {
      const at = { x: x + dx, y: y + dy };
      const fade = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
      fade.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`);
      fade.addColorStop(0.55, `rgba(${rgb},${(alpha * 0.55).toFixed(3)})`);
      fade.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = fade;
      ctx.beginPath();
      ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
