// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A sheet of paper with a loaded bristle head dragged over it.
//
// This is the paintbrush's `quillField.ts`: it knows about paint and paper and
// nothing whatever about a gesture. Something else (`bristleSim.ts`) walks a
// path over it, decides how much paint the head still holds and which hairs
// are on the paper, and presses the head's cross-section down touch by touch;
// all this owns is the sheet and what one touch of a charged — or starving —
// head leaves on it.
//
// The model is the ink's, at a different thickness, and that is deliberate
// ("ink and watercolour are the same physics at two thicknesses" — see
// `quillShade.ts`; body paint is the third). Two numbers per cell:
//
//   - **how deep the paper dips** there — the *same* sheet the pencil presses
//     its lead into and the pen writes on (`sheetDip`, shared from
//     `leadField.ts`). Sharing it is not tidiness: a brush mark and a pen line
//     on one page have to agree about where the paper is low.
//   - **how much paint film is on it**, which is what the head leaves. Film
//     adds where a stroke crosses itself, and paint is dense enough that a
//     single pass is nearly opaque — so a crossing barely darkens where the
//     ink's visibly does, which is exactly the difference between the two
//     media on paper.
//
// and one rule for putting the second onto the first:
//
//     a wet head bridges the valleys and covers solidly; a starving one only
//     reaches the high ground, and it fails hair by hair.
//
// Everything a real brush does that a filled ribbon cannot comes out of that
// line plus the comb:
//
//   - **A charged head lays a slab, and the sheet still shows.** A film over
//     relief does not dry flat: it settles thicker into the dips and thinner
//     over the peaks (`pooled`), so a canvas weave prints its over-and-under
//     straight through the slab — which is what the reference photographs of
//     a loaded flat on canvas show — and the sealed page dries even.
//   - **The comb.** The head is a row of hairs, and the deposit across it is
//     the comb the walk hands in: hairs that lay more and less, and hairs
//     that are off the paper entirely, whose lanes are the long pale partings
//     every brushed mark is scratched through with.
//   - **A starving head scumbles.** What little paint is left only reaches
//     the crowns of the sheet, so the last stretch of a drag is the broken,
//     grainy dry-brush of the reference sheets — the paper's own weave in the
//     paint — rather than a paler copy of the slab.
//   - **A wet edge wicks on thirsty paper.** The outermost hairs feather a
//     little paint out along the fibres — less than ink, which is thinner —
//     so bristle on blotting stock is soft-edged and bristle on cartridge
//     cuts clean.
//
// Nothing here is random: every speckle is hashed off the position, so a mark
// repaints identically for ever and a whole gesture can be driven in a test
// with no canvas.

import type { GroundProfile } from "../ground.ts";
import { hashedRandom, smoothstep } from "./grain.ts";
import { sheetDip, sheetRelief } from "./leadField.ts";

/** How far a fully starving head's reach into the sheet falls: it can only
 *  touch the top fifth of the relief, so on any real paper the mark breaks up
 *  — the same shoulder the ink starves over, because it is the same paper. */
const DIG = 0.82;

/** The shoulder over which a cell goes from untouched to fully covered, in
 *  sheet depth. A step would be two-tone; a bristle tip has an edge. */
const SHOULDER = 0.16;

/** How unevenly a cell takes the paint offered it — the fine mottle of a
 *  thick liquid levelling over texture, hashed on the paper's own lattice so
 *  crossing strokes agree about it. Tighter than the ink's: body paint is
 *  pigment-heavy and levels less than it hides. */
const MOTTLE_LOW = 0.9;
const MOTTLE_HIGH = 1.1;

/** How strongly a wet film settles into the sheet's relief — thicker in the
 *  dips, thinner over the peaks, per unit of the ground's bite. This is what
 *  prints a canvas weave through a loaded slab and mottles a stroke on
 *  cold-pressed stock; the clamp keeps a deep dip a darker cell rather than a
 *  black speck, and the sealed page skips it entirely.
 *
 *  Far gentler than the ink's (`quillField.ts`): body paint is dense, so the
 *  same film swing that shades a translucent ink prints as hard seams here —
 *  the weave should *show* through a slab, never tile it. */
const SETTLE = 0.55;
const SETTLE_LEAST = 0.55;
const SETTLE_MOST = 1.45;

/** How much of a toothy sheet's rim a wet edge fails to reach — the ragged
 *  sides of a brushed band at the grain's own scale. Only the outermost
 *  samples are the rim; smooth stock keeps the clean cut a flat actually
 *  gives. */
const RIM_FROM = 0.9;
const RIM = 0.85;

/** How far past the outermost hairs the feather wicks, in cells, and how
 *  quickly it falls away. Paint is thicker than ink, so the fringe is shorter
 *  and fainter — dampness at the edge of a mark, never a halo. */
const FEATHER_CELLS = 2;
const FEATHER_FALL = 0.45;

/** How far along the cross-section a sample has to sit for the feather to
 *  wick from it, as |u| of the half-width — only the outermost hairs are the
 *  edge of the band. */
const CORNER = 0.86;

/** A patch of page with a sheet and a paint film. */
export type BristleField = {
  /** Where the top-left cell is, in document pixels. */
  x: number;
  y: number;
  /** How many cells across and down, and how much page one is. */
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from, kept so a cell can be worked out the
   *  first time the head is over it. */
  ground: GroundProfile;
  /** How deep the sheet dips in each cell, 0–1. Row-major, `width` long, and
   *  meaningless where `ready` is 0 — a mark only ever touches the band it
   *  swept, and paying for its whole bounding box would be paying to invent
   *  paper nobody painted on (the lead's lesson). */
  dip: Float32Array;
  /** Which cells that has actually been worked out for. */
  ready: Uint8Array;
  /** …and how much paint film is on each cell, which is 0 everywhere the
   *  head never went and needs no such caveat. */
  film: Float32Array;
  /** How readily the outermost hairs wick paint out along the fibres, 0–1 —
   *  the sheet's absorbency times the medium's wetness, once per mark. */
  wick: number;
  /** How deep this sheet goes at all (see `sheetRelief`) — what lets a
   *  charged touch skip the sheet entirely when its reach clears the whole
   *  relief. */
  relief: number;
  /** Whether this sheet has a stock's grain, and how deep it bites — what
   *  decides whether a wet film settles into it and how ragged the rim goes.
   *  The plain page has fibre but no grain, and a film on it dries flat. */
  textured: boolean;
  bite: number;
};

/** What a field is opened over. */
export type BristleFieldSpec = {
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from (see `ground.ts`). The plain solid page
   *  is a perfectly good answer: fibre-fine tooth, and nothing wicks. */
  ground: GroundProfile;
  /** How readily this paint wicks into this sheet, 0–1 (see
   *  `bristleSim.ts`). */
  wick: number;
};

/** Open a field over a patch of page, with no paint on it and — deliberately
 *  — no sheet worked out yet (see `BristleField.dip`). */
export function createBristleField(spec: BristleFieldSpec): BristleField {
  const cells = spec.width * spec.height;
  return {
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    cell: spec.cell,
    ground: spec.ground,
    dip: new Float32Array(cells),
    ready: new Uint8Array(cells),
    film: new Float32Array(cells),
    wick: Math.max(0, Math.min(1, spec.wick)),
    relief: sheetRelief(spec.ground),
    textured:
      spec.ground.pattern !== "none" &&
      spec.ground.bite > 0 &&
      spec.ground.tooth > 0,
    bite: Math.max(0, Math.min(1.4, spec.ground.bite)),
  };
}

/** Work the sheet out at one cell, if it has not been already. */
function reach(field: BristleField, at: number, x: number, y: number): void {
  if (field.ready[at] === 1) return;
  field.ready[at] = 1;
  field.dip[at] = sheetDip(x, y, field.ground);
}

/** How much of the offered film a cell this deep takes from a head this dry.
 *
 *  A wet head's paint bridges the whole relief, so everything takes fully and
 *  the slab is solid; a starving one only reaches the high ground, and the
 *  dip decides — which is what makes the last stretch of a drag break into
 *  the paper's own grain rather than merely fade. Exported for the tests:
 *  this is the line the whole dry-brush picture rests on, and it needs no
 *  canvas. */
export function catching(dip: number, dry: number): number {
  const starve = smoothstep(0.25, 1, Math.max(0, Math.min(1, dry)));
  const depth = 1 - starve * DIG;
  return smoothstep(0, SHOULDER, depth - dip);
}

/** How a wet film redistributes over a sheet this deep at this cell: past 1
 *  where the sheet dips and the paint gathers, under it on the peaks the film
 *  thins across. What prints a weave through a slab — and exactly nothing on
 *  a sheet with no grain, which is why the plain page skips it. Exported for
 *  the tests, like `catching`. */
export function settling(dip: number, bite: number, relief: number): number {
  const settle = 1 + SETTLE * bite * (dip - relief * 0.5);
  return Math.max(SETTLE_LEAST, Math.min(SETTLE_MOST, settle));
}

/** One touch of the head's cross-section: the row of hairs pressed onto the
 *  sheet at a point, and whatever the paper takes of the film each offers.
 *
 *  `ex`/`ey` is the projected half-width — the cross-section runs from
 *  `(x−ex, y−ey)` to `(x+ex, y+ey)`, across the path for a round and however
 *  much of the blade crosses the path for a flat (see `bristleSim.ts`).
 *  `film` is the thickness of paint a fully-taken cell should end up with
 *  from one pass, and `spacing` how far apart the walk lays its touches: the
 *  deposit per sample is normalised by both, so the same stroke leaves the
 *  same film however finely the walk or the head happen to be sampled.
 *
 *  `comb` is the head itself: how much of `film` each hair is laying at this
 *  touch, 0 for a hair that is off the paper — the walk works it out once per
 *  touch (the hairs drift and lift along the stroke), and a sample at `u`
 *  across the section reads the hair whose lane it is in. The partings the
 *  zeros leave are most of what makes the mark a brush's.
 *
 *  `dry` is how starved the head is, 0–1: it moves the mark from the solid
 *  slab to streaks to the broken scumble of the paper's own grain (see
 *  `catching`).
 *
 *  `log`, when given, collects every deposit this touch makes as `(cell,
 *  amount)` pairs — what lets a provisional touch of the gesture in flight be
 *  taken back out on the next frame (see `bristleSim.ts`). */
export function press(
  field: BristleField,
  x: number,
  y: number,
  ex: number,
  ey: number,
  film: number,
  dry: number,
  spacing: number,
  comb: Float32Array,
  log?: number[],
): void {
  if (film <= 0) return;
  const { cell, width, height } = field;
  const half = Math.hypot(ex, ey);
  if (half <= 0) return;
  // Sampled finer than a cell so a slanted section leaves no gaps, and the
  // deposit normalised by exactly that oversampling (see the docstring).
  const samples = Math.max(2, Math.ceil((2 * half) / (cell * 0.7)));
  const step = (2 * half) / samples;
  const deposit = film * (step / cell) * (spacing / cell);
  const wick = field.wick;
  // The feather wicks outwards along the section's own direction — past the
  // outermost hairs, which trace the two long sides of the band.
  const ux = ex / half;
  const uy = ey / half;
  // The sampling lattice is slid by a hashed fraction of a step per touch.
  // Fixed, it beats against the cell grid and the band comes out ribbed at
  // the lattice rather than at the hairs; slid, the same arithmetic lands as
  // the fine mottle a levelling film actually dries to (the quill's lesson).
  const phase = hashedRandom(x * 7.3, y * 7.3, 67);

  // Everything about the dryness, worked out once per touch rather than once
  // per cell — this is the innermost code in the engine. `catching` and
  // `settling` above stay the specification; these are the same lines with
  // the touch-constant halves hoisted.
  const starved = Math.max(0, Math.min(1, dry));
  const starve = smoothstep(0.25, 1, starved);
  const depth = 1 - starve * DIG;
  // A charged head's paint bridges every dip shallower than its reach — and
  // once the reach clears the sheet's whole relief, no cell's dip can *veto*
  // the deposit. On the plain page that is the whole story and the sheet is
  // not worked out at all; on a sheet with a stock's grain the film still
  // settles into the relief it dried over, so the dip is read regardless —
  // that reading is what the different papers *are* to a wet head.
  const bridges = depth - SHOULDER >= field.relief;
  const textured = field.textured;
  const bite = field.bite;
  const relief = field.relief;
  const feathers = wick > 0 && starved < 0.7;
  const hairs = comb.length;

  const invCell = 1 / cell;
  const uStep = 2 / samples;
  const u0 = -1 + uStep * phase;
  // Where the first sample lands on the cell grid, and how far each sample
  // step moves it — the whole inner loop is adds from here.
  let gx = (x + ex * u0 - field.x) * invCell;
  let gy = (y + ey * u0 - field.y) * invCell;
  const dgx = ex * uStep * invCell;
  const dgy = ey * uStep * invCell;

  for (let i = 0; i <= samples; i++, gx += dgx, gy += dgy) {
    const u = i === samples ? 1 : u0 + uStep * i;
    // Which hair this sample is under. The comb is indexed by lane rather
    // than by page position, so a flat turning edge-on compresses the same
    // streaks into a narrower band instead of re-dealing them.
    let hair = ((u + 1) * 0.5 * hairs) | 0;
    if (hair >= hairs) hair = hairs - 1;
    const laying = comb[hair]!;
    if (laying <= 0) continue;
    const col = Math.floor(i === samples ? (x + ex - field.x) * invCell : gx);
    const row = Math.floor(i === samples ? (y + ey - field.y) * invCell : gy);
    if (col < 0 || col >= width || row < 0 || row >= height) continue;
    const at = row * width + col;
    // The fine mottle of a thick liquid levelling over texture — hashed on
    // the cell's own lattice, so two crossing strokes agree about it.
    let take =
      laying *
      (MOTTLE_LOW + (MOTTLE_HIGH - MOTTLE_LOW) * hashedRandom(col, row, 59));
    if (textured || !bridges) {
      reach(field, at, field.x + col * cell, field.y + row * cell);
      const dip = field.dip[at]!;
      if (textured) {
        // The film settles into the sheet: thicker in the dips, thinner over
        // the peaks — the weave of a canvas printing through the slab. The
        // same lines as `settling`, with the clamp written out because this
        // is the innermost loop of the engine.
        const settle = 1 + SETTLE * bite * (dip - relief * 0.5);
        take *=
          settle > SETTLE_MOST
            ? SETTLE_MOST
            : settle < SETTLE_LEAST
              ? SETTLE_LEAST
              : settle;
        // …and the rim of the band stops ragged at the grain, where a smooth
        // sheet gets the clean cut.
        if (u > RIM_FROM || u < -RIM_FROM) take *= 1 - RIM * bite * dip;
      }
      if (!bridges) {
        take *= smoothstep(0, SHOULDER, depth - dip);
      }
      if (take <= 0) continue;
    }
    const laid = deposit * take;
    if (bridges) {
      // A wet film levels, so the deposit is split over the four cells the
      // sample straddles. Without this the sample lattice beats against the
      // cell grid as one-versus-two counts per cell — noise a translucent
      // ink dries into mottle, and a paint this dense dries into hard seams.
      const px = gx - 0.5;
      const py = gy - 0.5;
      const c0 = Math.floor(px);
      const r0 = Math.floor(py);
      const fx = px - c0;
      const fy = py - r0;
      for (let corner = 0; corner < 4; corner++) {
        const cc = c0 + (corner & 1);
        const rr = r0 + (corner >> 1);
        if (cc < 0 || cc >= width || rr < 0 || rr >= height) continue;
        const wx = (corner & 1) === 1 ? fx : 1 - fx;
        const wy = corner >> 1 === 1 ? fy : 1 - fy;
        const share = laid * wx * wy;
        if (share <= 0) continue;
        const cat = rr * width + cc;
        field.film[cat]! += share;
        if (log) log.push(cat, share);
      }
    } else {
      // A starving head's grains stay where they caught — spreading them
      // would soften exactly the break-up the dryness is for.
      field.film[at]! += laid;
      if (log) log.push(at, laid);
    }

    // The outermost hairs wick a little paint out along the fibres — the
    // dampness that keeps the side of a stroke on soft stock from being a
    // razor cut. Only where the sheet drinks at all, only from the outermost
    // hairs, and gated by a hash so it is a fringe rather than a halo.
    if (!feathers || (u > -CORNER && u < CORNER)) continue;
    const out = u > 0 ? 1 : -1;
    for (let k = 1; k <= FEATHER_CELLS; k++) {
      const fcol = Math.floor(gx + ux * out * k);
      const frow = Math.floor(gy + uy * out * k);
      if (fcol < 0 || fcol >= width || frow < 0 || frow >= height) continue;
      const fat = frow * width + fcol;
      reach(field, fat, field.x + fcol * cell, field.y + frow * cell);
      // Paint wicks along the valleys — the fibres — so the fringe follows
      // where the sheet is low, which is what makes it ragged rather than a
      // glow.
      const gate = hashedRandom(fcol, frow, 61);
      const carry =
        wick * FEATHER_FALL ** k * field.dip[fat]! * (0.3 + 0.7 * gate);
      if (carry <= 0.01) continue;
      const wicked = deposit * carry;
      field.film[fat]! += wicked;
      if (log) log.push(fat, wicked);
    }
  }
}

/** How much paint film ended up on each cell. The field's own array rather
 *  than a copy — nothing mutates it after a mark is laid. */
export function painted(field: BristleField): Float32Array {
  return field.film;
}

/** What share of the cells the head ever reached actually took paint,
 *  counting a cell as covered once it holds `least` of a full film. The
 *  number that says "solid slab" or "broken scumble", and the one a test can
 *  put a hard claim on. Measured over the touched cells rather than the whole
 *  box — the box is mostly paper the head never went near. */
export function paintCoverage(field: BristleField, least = 0.05): number {
  let touched = 0;
  let covered = 0;
  for (let at = 0; at < field.film.length; at++) {
    if (field.ready[at] !== 1 && !(field.film[at]! > 0)) continue;
    touched++;
    if (field.film[at]! >= least) covered++;
  }
  return touched === 0 ? 0 : covered / touched;
}
