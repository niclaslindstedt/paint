// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A sheet of paper with a broad nib writing on it.
//
// This is the calligraphy pen's `leadField.ts`: it knows about ink and paper
// and nothing whatever about a gesture. Something else (`quillSim.ts`) walks a
// path over it, decides how much ink the nib still holds and presses the edge
// down dab by dab; all this owns is the sheet and what one touch of a loaded —
// or starving — edge leaves on it.
//
// The whole model is two numbers per cell of the sheet:
//
//   - **how deep the paper dips** there, 0 on the peaks and 1 at the bottom of
//     the deepest valley. It is the *same* sheet the pencil presses its lead
//     into (`sheetDip`, shared from `leadField.ts`), and sharing it is not
//     tidiness: a pen line and a pencil line on one page have to agree about
//     where the paper is low, or the two media would each be writing on paper
//     of their own.
//   - **how much ink film is on it**, which starts at nothing and is what the
//     nib leaves. Film adds up where the pen crosses itself, and an ink film is
//     something light has to get through — so a double-covered crossing dries
//     visibly darker, which is the single most recognisable thing about real
//     ink and the thing the perfect one-path fill could never do.
//
// and one rule for putting the second onto the first:
//
//     a wet edge bridges the valleys and writes solid; a starving one only
//     reaches the high ground, and it fails in the middle of its edge first.
//
// Everything a real pen does that the perfect nib cannot comes out of that
// line:
//
//   - **A full nib writes crisp, and the sheet still shows.** At no dryness
//     the ink bridges every dip the sheet has, so the mark is the solid ribbon
//     calligraphy is — but a film over relief does not dry flat: it settles
//     darker into the dips and thinner over the peaks (`pooled`), so
//     cold-pressed paper mottles the ribbon at its own grain, a canvas weave
//     prints its over-and-under straight through it, and the sealed digital
//     page keeps only the ink's own faint drying mottle. The wet edge stops
//     ragged at the grain on a toothy sheet too (`RIM`), where on smooth stock
//     it is the clean cut a smooth sheet actually gives.
//   - **A starving nib rails.** Ink is fed to a broad edge from its middle and
//     held at its corners by surface tension, so as the reservoir gives out the
//     centre of the stroke hollows first and the two corners keep writing — the
//     "railroading" every calligrapher has produced by writing one word too
//     many. Here that is `rails`: the share of the edge's deposit that survives
//     at each point along it once starving sets in.
//   - **A dry edge breaks on the tooth.** What little ink still flows only
//     reaches the crowns of the sheet, so the last marks before the pen gives
//     out are the broken, glittering scratches of the reference sheets rather
//     than a paler copy of the solid ribbon.
//   - **A wet edge feathers on thirsty paper.** The outermost corners of the
//     edge wick a little ink out along the paper's fibres — more the more the
//     sheet drinks, not at all on the sealed digital page — so the side of a
//     stroke under a loupe is a fringe rather than a razor cut.
//
// Nothing here is random: every speckle is hashed off the position, so a mark
// repaints identically for ever and a whole gesture can be driven in a test
// with no canvas.

import type { GroundProfile } from "../ground.ts";
import { hashedRandom, smoothstep } from "./grain.ts";
import { sheetDip, sheetRelief } from "./leadField.ts";

/** How far a fully starving edge's reach into the sheet falls: it can only wet
 *  the top fifth of the relief, so on any real paper the mark breaks up. */
const DIG = 0.82;

/** The shoulder over which a cell goes from untouched to fully wetted, in sheet
 *  depth. A step would be two-tone; a real meniscus has an edge. */
const SHOULDER = 0.16;

/** How much of the edge's deposit survives at its centre when the nib is fully
 *  railing — the floor of the rail profile. Not zero: even a railing nib drags
 *  a thin wash between its rails. */
const RAIL_FLOOR = 0.22;

/** How unevenly a cell takes the ink offered it — the fine mottle of a liquid
 *  drying over texture, hashed on the paper's own fibre lattice so it is the
 *  same mottle on every repaint. Deliberately subtle beside the lead's
 *  (`GRIP_LOW`): ink levels itself out the way dry graphite cannot. */
const MOTTLE_LOW = 0.84;
const MOTTLE_HIGH = 1.16;

/** How far past the nib's corners the feather wicks, in cells, and how quickly
 *  it falls away. Two cells is under half a millimetre at full detail — a
 *  fringe you notice as softness, not a halo. */
const FEATHER_CELLS = 2;
const FEATHER_FALL = 0.5;

/** How far along the edge a sample has to sit for the feather to wick from it,
 *  as |u| of the half-edge — only the outermost samples are corners. */
const CORNER = 0.85;

/** How strongly a wet film settles into the sheet's relief — darker in the
 *  dips, thinner on the peaks — per unit of the ground's bite. This is what
 *  makes the same stroke mottle at cold-pressed paper's grain, print a canvas
 *  weave through itself, and dry flat on the sealed page; the clamp keeps a
 *  deep dip a darker cell rather than a black speck. */
const SETTLE = 1.4;
const SETTLE_LEAST = 0.25;
const SETTLE_MOST = 1.8;

/** How much of a toothy sheet's rim a wet edge fails to reach — the raggedness
 *  of the band's sides, at the grain's own scale. Only the outermost samples
 *  (`RIM_FROM` of the half-edge outwards) are the rim, and how much of one
 *  drops is the dip there times the bite: a smooth sheet keeps its clean cut. */
const RIM_FROM = 0.9;
const RIM = 0.95;

/** A patch of page with a sheet and an ink film. */
export type QuillField = {
  /** Where the top-left cell is, in document pixels. */
  x: number;
  y: number;
  /** How many cells across and down, and how much page one is. */
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from, kept so a cell can be worked out the
   *  first time the edge is over it. */
  ground: GroundProfile;
  /** How deep the sheet dips in each cell, 0–1. Row-major, `width` long, and
   *  meaningless where `ready` is 0 — a mark only ever touches the band it
   *  swept, and paying for its whole bounding box would be paying to invent
   *  paper nobody wrote on. */
  dip: Float32Array;
  /** Which cells that has actually been worked out for. */
  ready: Uint8Array;
  /** …and how much ink film is on each cell, which is 0 everywhere the nib
   *  never went and needs no such caveat. */
  film: Float32Array;
  /** How readily the corners wick ink out along the fibres, 0–1 — the sheet's
   *  absorbency times the medium's wetness, worked out once per mark. */
  wick: number;
  /** How deep this sheet goes at all (see `sheetRelief`) — what lets a charged
   *  touch skip the sheet entirely when its reach clears the whole relief. */
  relief: number;
  /** Whether this sheet has a stock's grain at all, and how deep it bites —
   *  what decides whether a wet film settles into it (see `pooled`) and how
   *  ragged the rim goes. The plain page has fibre but no grain, and a wet
   *  film on it dries flat. */
  textured: boolean;
  bite: number;
};

/** What a field is opened over. */
export type QuillFieldSpec = {
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from (see `ground.ts`). The plain solid page is
   *  a perfectly good answer: fibre-fine tooth, and nothing wicks. */
  ground: GroundProfile;
  /** How readily this ink wicks into this sheet, 0–1 (see `quillSim.ts`). */
  wick: number;
};

/** Open a field over a patch of page, with no ink on it and — deliberately —
 *  no sheet worked out yet (see `QuillField.dip`). */
export function createQuillField(spec: QuillFieldSpec): QuillField {
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
function reach(field: QuillField, at: number, x: number, y: number): void {
  if (field.ready[at] === 1) return;
  field.ready[at] = 1;
  field.dip[at] = sheetDip(x, y, field.ground);
}

/** How much of the offered film a cell this deep takes from an edge this dry.
 *
 *  A wet edge reaches the whole relief, so everything takes fully and the
 *  ribbon is solid; a starving one only wets the high ground, and the dip
 *  decides — which is what makes the last strokes before the pen gives out
 *  break on the paper rather than merely fade. Exported for the tests: this is
 *  the line the whole "runs dry" picture rests on, and it needs no canvas. */
export function taking(dip: number, dry: number): number {
  const starve = smoothstep(0.25, 1, Math.max(0, Math.min(1, dry)));
  const depth = 1 - starve * DIG;
  return smoothstep(0, SHOULDER, depth - dip);
}

/** How much of the edge's deposit survives at `u` (−1 at one corner, 1 at the
 *  other) when the nib is `dry` — the railing profile.
 *
 *  Fully fed it is flat at 1; starving, the centre hollows towards `RAIL_FLOOR`
 *  and the corners keep writing. Exported for the tests, like `taking`. */
export function railing(u: number, dry: number): number {
  const rail = smoothstep(0.35, 0.9, Math.max(0, Math.min(1, dry)));
  const profile = RAIL_FLOOR + (1 - RAIL_FLOOR) * u * u;
  return 1 - rail * (1 - profile);
}

/** How a wet film redistributes over a sheet this deep at this cell: past 1
 *  where the sheet dips and the ink gathers, under it on the peaks the film
 *  thins across. The heart of what makes one stroke look different on every
 *  stock — and exactly nothing on a sheet with no grain, which is why the
 *  plain page skips it. Exported for the tests, like `taking`. */
export function pooled(dip: number, bite: number, relief: number): number {
  const settle = 1 + SETTLE * bite * (dip - relief * 0.5);
  return Math.max(SETTLE_LEAST, Math.min(SETTLE_MOST, settle));
}

/** One touch of the nib's edge: the flat pressed onto the sheet at a point,
 *  and whatever the paper takes of the film it offers.
 *
 *  `ex`/`ey` is the half-edge — the edge runs from `(x−ex, y−ey)` to
 *  `(x+ex, y+ey)`, exactly the flat the perfect nib fills quads between.
 *  `film` is the thickness of ink a cell under this touch should end up with
 *  from a full pass, and `spacing` how far apart the walk lays its touches:
 *  the deposit per sample is normalised by both, so the same stroke leaves the
 *  same film however finely the walk or the edge happen to be sampled.
 *
 *  `dry` is how starved the nib is, 0–1, and it is what moves the mark from
 *  the solid ribbon to rails to broken scratches (see `taking`/`railing`).
 *
 *  `log`, when given, collects every deposit this touch makes as `(cell,
 *  amount)` pairs — what lets a provisional touch of the gesture in flight be
 *  taken back out on the next frame (see `quillSim.ts`). */
export function edge(
  field: QuillField,
  x: number,
  y: number,
  ex: number,
  ey: number,
  film: number,
  dry: number,
  spacing: number,
  log?: number[],
): void {
  if (film <= 0) return;
  const { cell, width, height } = field;
  const half = Math.hypot(ex, ey);
  if (half <= 0) return;
  // Sampled finer than a cell so a slanted edge leaves no gaps, and the
  // deposit normalised by exactly that oversampling (see the docstring).
  const samples = Math.max(2, Math.ceil((2 * half) / (cell * 0.7)));
  const step = (2 * half) / samples;
  const deposit = film * (step / cell) * (spacing / cell);
  const wick = field.wick;
  // The feather wicks outwards along the edge's own direction — past the
  // corners, which are what trace the two long sides of the ribbon.
  const ux = ex / half;
  const uy = ey / half;
  // The sampling lattice is slid by a hashed fraction of a step per touch.
  // Fixed, it beats against the cell grid and the ribbon comes out ribbed —
  // longitudinal stripes no liquid would leave; slid, the same arithmetic
  // lands as the fine even mottle a film of ink actually dries to.
  const phase = hashedRandom(x * 7.3, y * 7.3, 67);

  // Everything about the dryness, worked out once per touch rather than once
  // per cell — this is the innermost code in the engine, and a touch is a few
  // dozen samples of it a thousand times per stroke. `taking`/`railing` above
  // stay the specification; these are the same lines with the touch-constant
  // halves hoisted, and the walk itself is incremental for the same reason.
  const starved = Math.max(0, Math.min(1, dry));
  const starve = smoothstep(0.25, 1, starved);
  const depth = 1 - starve * DIG;
  const railMix = smoothstep(0.35, 0.9, starved);
  // A charged nib's meniscus bridges every dip shallower than its reach — and
  // once the reach clears the sheet's whole relief, no cell's dip can *veto*
  // the ink. On the plain page that is the whole story and the sheet is not
  // worked out at all; on a sheet with a stock's grain the film still settles
  // into the relief it dried over (`pooled`), so the dip is read regardless —
  // that reading is what the different papers *are* to a wet pen.
  const bridges = depth - SHOULDER >= field.relief;
  const textured = field.textured;
  const bite = field.bite;
  const relief = field.relief;
  const feathers = wick > 0 && starved < 0.7;

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
    const col = Math.floor(i === samples ? (x + ex - field.x) * invCell : gx);
    const row = Math.floor(i === samples ? (y + ey - field.y) * invCell : gy);
    if (col < 0 || col >= width || row < 0 || row >= height) continue;
    const at = row * width + col;
    // The fine mottle of a liquid drying over texture — hashed on the cell's
    // own lattice, so two crossing strokes agree about it.
    let take =
      MOTTLE_LOW + (MOTTLE_HIGH - MOTTLE_LOW) * hashedRandom(col, row, 59);
    if (railMix > 0) {
      const profile = RAIL_FLOOR + (1 - RAIL_FLOOR) * u * u;
      take *= 1 - railMix * (1 - profile);
    }
    if (textured || !bridges) {
      reach(field, at, field.x + col * cell, field.y + row * cell);
      const dip = field.dip[at]!;
      if (textured) {
        // The film settles into the sheet: darker in the dips, thinner over
        // the peaks — cold-pressed mottle, and the weave of a canvas printing
        // through the ribbon.
        take *= pooled(dip, bite, relief);
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
    field.film[at]! += laid;
    if (log) log.push(at, laid);

    // The corners wick a little ink out along the fibres — the fringe that
    // keeps the side of a stroke from being a razor cut. Only where the sheet
    // drinks at all, only from the outermost samples, and gated by a hash so
    // it is a fringe rather than a halo.
    if (!feathers || (u > -CORNER && u < CORNER)) continue;
    const out = u > 0 ? 1 : -1;
    for (let k = 1; k <= FEATHER_CELLS; k++) {
      const fcol = Math.floor(gx + ux * out * k);
      const frow = Math.floor(gy + uy * out * k);
      if (fcol < 0 || fcol >= width || frow < 0 || frow >= height) continue;
      const fat = frow * width + fcol;
      reach(field, fat, field.x + fcol * cell, field.y + frow * cell);
      // Ink wicks along the valleys — the fibres — so the fringe follows where
      // the sheet is low, which is what makes it ragged rather than a glow.
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

/** How much ink film ended up on each cell. The field's own array rather than
 *  a copy — nothing mutates it after a mark is written. */
export function inked(field: QuillField): Float32Array {
  return field.film;
}

/** What share of the cells the nib ever reached actually took ink, counting a
 *  cell as written once it holds `least` of a full film. The number that says
 *  "solid ribbon" or "broken scratch", and the one a test can put a hard claim
 *  on. Measured over the touched cells rather than the whole box, because the
 *  box is mostly paper the nib never went near — and "touched" is a cell that
 *  holds any ink at all or whose sheet was worked out to refuse some (a
 *  bridging touch skips the sheet, so `ready` alone would miss it). */
export function inkCoverage(field: QuillField, least = 0.05): number {
  let touched = 0;
  let written = 0;
  for (let at = 0; at < field.film.length; at++) {
    if (field.ready[at] !== 1 && !(field.film[at]! > 0)) continue;
    touched++;
    if (field.film[at]! >= least) written++;
  }
  return touched === 0 ? 0 : written / touched;
}
