// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting the sheet's grain.
//
// The other half of `ground.ts`: that module says what a sheet *does*, this one
// draws what it looks like. They are split for the reason `filters.ts` and
// `filterPaint.ts` are — the model is read all over the app and by the tests,
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
//   - **It is anchored to the page.** The pattern is filled in document
//     coordinates, so the grain sits at a fixed place on the sheet: panning
//     moves the paper with the drawing rather than sliding the drawing over a
//     stationary texture, and two marks that overlap agree about where the sheet
//     is low. The same rule the painters' own grain follows (see `grain.ts`).
//
//   - **It is drawn at device resolution.** The tile's pixels are mapped one
//     for one onto the screen's, so the grain stays crisp at any zoom instead
//     of being a blurred bitmap magnified with the page.
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

/** How wide a tile is allowed to get, in device pixels. Big enough that the
 *  repeat is hard to find on the coarsest sheet, small enough that half a dozen
 *  of them cached cost less than one screen. */
const TILE_BUDGET = 448;

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

/** One built tile, keyed by what it was built from. Held across repaints
 *  because a tile is the same tile until the zoom changes — and thrown away
 *  wholesale when the map grows past a handful, which is all the eviction a
 *  cache holding at most a few hundred kilobytes needs. */
const tiles = new Map<string, HTMLCanvasElement>();
const TILE_CACHE = 8;

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

  // Whole device pixels per cell, which is what keeps a tile seamless: the tile
  // is a whole number of cells across, so the rasteriser's repeat lands the
  // lattice exactly where the next copy of it continues.
  const cell = Math.max(1, Math.round(cellPx));
  const tile = tileFor(ground.pattern, cell);
  if (!tile) return;
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  // Device pixels back into document units, so one pixel of the tile is one
  // pixel of the screen however far the page is zoomed.
  pattern.setTransform(new DOMMatrix([1 / scale, 0, 0, 1 / scale, 0, 0]));

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
 *  bite, so the same tile serves a hot-pressed sheet and a rough one. */
function buildTile(
  pattern: GroundPattern,
  cell: number,
): HTMLCanvasElement | null {
  const cells = Math.max(6, Math.min(64, Math.round(TILE_BUDGET / cell)));
  const span = cell * cells;
  const surface = createSurface(span, span);
  if (!surface) return null;
  const ctx = surface.ctx;
  if (pattern === "cloth") weave(ctx, cell, cells);
  else tooth(ctx, cell, cells);
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
