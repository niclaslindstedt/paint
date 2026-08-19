// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A sheet of paper with a stick of wax pressed onto it.
//
// The crayon's `leadField.ts`: it knows about wax and paper and nothing
// whatever about a gesture. Something else (`waxSim.ts`) drags a stick's face
// over it; all this owns is the surface and what one touch of the face leaves
// behind on it.
//
// It reads **the same sheet the pencil reads** (`sheetDip` from
// `leadField.ts`): the paper's height is a property of the page, and a crayon
// mark and a pencil line that cross have to agree about where it is low or the
// grain the user sees painted under them is a third opinion. What differs is
// the *stick*, and the difference is the whole medium:
//
//   - **Wax digs.** Even the hardest stick here — a china marker — is soft
//     against paper next to graphite, so the face reaches down the tooth's
//     shoulders where a hard lead rides the very peaks. That is why a crayon
//     line is never a pale scratch.
//   - **Wax comes off in crumbs.** Graphite leaves the lead as fine flakes;
//     wax shears off in soft lumps that catch where the tooth bites, so the
//     speckle of a light pass is *clumped* — chains of blobs a few cells
//     across with clean paper between them, not television static. The grip
//     below is hashed on a coarser, patchier lattice than the lead's for
//     exactly that reason (see `CLUMP`), and the reference close-ups are the
//     evidence: wax caught on the crowns reads as islands, not specks.
//   - **Wax stands the surface up fast.** A cell's worth of it is bulk, not a
//     mineral film, so the second pass rides on the first (`LEVELLING`) and a
//     scribbled patch closes toward solid much sooner than a pencil's would.
//   - **…and then it burnishes.** The cap is generous — pressed and pressed
//     again, wax genuinely closes the tooth into a waxy sheen with only
//     pinholes of paper left, which is a black a pencil never reaches. Past
//     the cap the stick polishes what is there, which is what burnishing is.
//
// One number picks the stick out of the box: `soft`, the crayon's grade. The
// hard end is a china marker (hardened wax, a dense sticky line that still
// breaks on the tooth), 1 is the classroom wax crayon, and the soft end is an
// oil pastel — buttery, digging to the bottom of the tooth, shedding heavily
// enough to slab on colour at a light touch. The pair of ramps below
// (`DIG_*` / `SHED_*`) is that axis, exactly as the lead's grade is its pair.
//
// Nothing here allocates per touch and nothing here is random: a field is two
// `Float32Array`s and the arithmetic over them, which is what makes a mark
// repaint identically and a whole gesture drivable in a test with no canvas.

import type { GroundProfile } from "../ground.ts";
import { PAPER_TOOTH } from "./graphite.ts";
import { sheetDip, sheetRelief } from "./leadField.ts";
import { mm } from "../units.ts";
import { areaNoise, hashedRandom, smoothstep } from "./grain.ts";

/** The softest and hardest stick in the box, as the `soft` dial holds them:
 *  a fraction of the ordinary wax crayon, which is 1. The ends are the
 *  medium's own — the dial and the field read the same numbers, so the two
 *  cannot drift apart (see `SOFT` in `builtin/dials.ts`). */
export const HARDEST_WAX = 0.2;
export const WAX_CRAYON = 1;
export const SOFTEST_WAX = 1.8;

/** How far a cell's worth of wax stands the surface up. Well past the lead's
 *  0.55, because wax is bulk where graphite is a film: the second pass over a
 *  patch rides on the first and reaches tooth it could not, which is why
 *  colouring something in actually works. Short of levelling outright — the
 *  deepest dips on rough stock stay paper until the mark is truly burnished. */
const LEVELLING = 0.72;

/** How far past first contact the face has to be driven before it is laying
 *  down all it can. A shoulder rather than a step, and a slightly wider one
 *  than the lead's: wax smears onto the sides of a peak it is dragged over. */
const CONTACT = 0.38;

/** What a cell holds before no more sticks, on a sheet with no relief at all,
 *  and how much of the sheet's own relief is added to that. Both generous
 *  next to the lead's: a hollow full of wax is a hollow full, and burnished
 *  crayon closes the tooth in a way graphite cannot. */
const CAP_BASE = 0.92;
const CAP_TOOTH = 0.66;

/** How unevenly a cell takes what the stick offers it — the crumb, which is
 *  the stick's own texture the way the lead's grip is the lead's. Hashed on
 *  the fibre's own lattice, like the lead's, so the two media speckle at the
 *  same pitch on the same page. */
const GRIP_LOW = 0.55;
const GRIP_HIGH = 1.45;

/** The pitch of the *clumping*, in document pixels — the patchy layer over
 *  the per-cell crumb that makes wax read as wax. The reference close-ups
 *  show wax caught in islands half a millimetre and more across with clean
 *  paper between them, on smooth stock too: the clumping is the stick's own
 *  stick-slip, not the paper's tooth. Anchored to the page, so two crossing
 *  crayon strokes clump in the same places. */
const CLUMP = mm(0.55);

/** What the clump does, on both sides of the physics. Where the face is
 *  slipping (a low gate) it barely *touches* — the slip term backs the dig
 *  off, so under an ordinary hand those cells stay bare paper rather than
 *  hazing over — and where it is biting it deposits with both hands. A heavy
 *  hand overwhelms the slip, which is exactly what burnishing is. */
const SLIP_DIG = 0.74;
const BITE_DIG = 0.36;
const SLIP_LAY = 0.22;
const BITE_LAY = 1.3;

/** The odd crumb of wax that breaks off whole and is flattened onto the page —
 *  the darker fleck a real crayon mark is peppered with. A hashed chance per
 *  fibre cell, and a boost rather than a certainty of its own: a crumb still
 *  needs the face over it to be pressed on. Softer sticks crumble more. */
const CRUMB_BOOST = 2.1;

/** The hardest and softest the dig and the shed go, as fractions of the
 *  sheet's full depth and of a full load. The pair of them *is* the `soft`
 *  axis, and it takes both (the lead's argument, one shelf along):
 *
 *    - a china marker is hardened wax on a point — it reaches part-way down
 *      the tooth and no further, so its line breaks up on rough stock;
 *    - an oil pastel is nearly butter — it reaches the bottom of almost any
 *      tooth and sheds half its face doing it, which is why a light pass of
 *      one still slabs colour on.
 *
 *  Both ends sit well above the pencil's: there is no wax stick as hard as a
 *  2H lead, which is the entire reason a crayon can never draw a construction
 *  line. */
const DIG_HARD = 0.6;
const DIG_SOFT = 1.1;
const SHED_HARD = 0.9;
const SHED_SOFT = 2.05;

/** A patch of page with a surface and a load of wax. */
export type WaxField = {
  /** Where the top-left cell is, in document pixels. */
  x: number;
  y: number;
  /** How many cells across and down, and how much page one is. */
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from, kept so a cell can be worked out the
   *  first time the face is over it (see `createWaxField`). */
  ground: GroundProfile;
  /** How high the sheet stands in each cell, 0–1. Row-major, `width` long,
   *  and meaningless where `ready` is 0. */
  sheet: Float32Array;
  /** …how readily each cell takes what the stick offers it (see `GRIP_LOW`
   *  and `CLUMP`). Same lattice, same row-major order, same caveat. */
  grip: Float32Array;
  /** …and how firmly the face bites there rather than slipping — the clump
   *  gate's threshold side (see `SLIP_DIG`). Same caveats again. */
  bite: Float32Array;
  /** Which cells those two have actually been worked out for. */
  ready: Uint8Array;
  /** The direction the face is travelling, set by the walk before each touch
   *  (see `dragWax`). Wax smears *along* the drag — the clumps of a stroke
   *  are little streaks pointing where the hand went, which is why a crayon
   *  mark is legible as a gesture — so the clump gate is sampled in this
   *  frame. The sheet itself stays page-anchored: two crossing strokes agree
   *  about where the paper is low, and each smears its own way, exactly as
   *  two real strokes do. A cell keeps the direction it was first worked out
   *  under, which is what keeps a repaint identical. */
  ax: number;
  ay: number;
  /** …and how much wax is in each cell, which is 0 everywhere the stick
   *  never went and needs no such caveat. */
  load: Float32Array;
  /** What one cell holds before the stick starts polishing rather than
   *  depositing — burnishing, on the geometry side. */
  cap: number;
  /** How far a full press drives this stick into the sheet, as a share of the
   *  sheet's whole depth — the soft-to-hard axis, on the geometry side. */
  dig: number;
  /** …and how freely it crumbles once it is in contact, which is the same
   *  axis on the deposit side. */
  shed: number;
  /** How often a whole crumb breaks off, per fibre cell — softer sticks
   *  crumble more (see `CRUMB_BOOST`). */
  crumbly: number;
};

/** What a field is opened over. */
export type WaxFieldSpec = {
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from (see `ground.ts`). The plain solid page
   *  is a perfectly good answer and gives the fibre and nothing else. */
  ground: GroundProfile;
  /** The stick, as a fraction of the ordinary wax crayon — the same number
   *  the `soft` dial holds. */
  soft: number;
};

/** Open a field over a patch of page, with no wax on it and — deliberately —
 *  **no sheet worked out yet**: a cell's height and grip are worked out the
 *  first time the face is over it and kept from then on (`ready`), so the
 *  cost of a mark is the band it swept rather than its bounding box (the
 *  lead's arrangement, for the lead's reason). */
export function createWaxField(spec: WaxFieldSpec): WaxField {
  const cells = spec.width * spec.height;
  // The same reading the lead makes of the same paper: a hollow is somewhere
  // for the wax to go, so the relief is how much more than a bare face the
  // sheet can hold.
  const relief = sheetRelief(spec.ground);
  const grade = softness(spec.soft);
  return {
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    cell: spec.cell,
    ground: spec.ground,
    sheet: new Float32Array(cells),
    grip: new Float32Array(cells),
    bite: new Float32Array(cells),
    ready: new Uint8Array(cells),
    ax: 1,
    ay: 0,
    load: new Float32Array(cells),
    cap: CAP_BASE + CAP_TOOTH * relief,
    dig: DIG_HARD + (DIG_SOFT - DIG_HARD) * grade,
    shed: SHED_HARD + (SHED_SOFT - SHED_HARD) * grade,
    crumbly: 0.008 + 0.02 * grade,
  };
}

/** A grade as a fraction from the hardest stick in the box to the softest. */
function softness(soft: number): number {
  return Math.max(
    0,
    Math.min(1, (soft - HARDEST_WAX) / (SOFTEST_WAX - HARDEST_WAX)),
  );
}

/** Work the sheet out at one cell, if it has not been already.
 *
 *  The grip is two layers, and the layering is the medium: a per-cell crumb
 *  at the fibre's own pitch (the lead has one too — wax leaves the stick
 *  unevenly wherever it lands), under a *clump* at nearly a third of a
 *  millimetre that gates most of the deposit. Raised to a power so its low
 *  half really starves: the islands-of-wax look of the reference scans is a
 *  distribution with a long dry tail, not a gentle ripple. */
function reach(field: WaxField, at: number, x: number, y: number): void {
  if (field.ready[at] === 1) return;
  field.ready[at] = 1;
  field.sheet[at] = 1 - sheetDip(x, y, field.ground);
  const gx = Math.floor(x / PAPER_TOOTH);
  const gy = Math.floor(y / PAPER_TOOTH);
  const speck = hashedRandom(gx, gy, 31);
  const crumb = GRIP_LOW + (GRIP_HIGH - GRIP_LOW) * speck;
  // Where the face bites and where it slips: two octaves of smooth noise —
  // clumps and the drifts of clumps, the way the sheet's own tooth is built —
  // roughened at the fibre's pitch so no island is a perfect blob, and pushed
  // through a hard shoulder so the low side is genuinely dry rather than a
  // haze. The fine octave is sampled in the drag's own frame, stretched well
  // along it and squeezed across it, because that is the shape a smeared
  // crumb of wax actually is: the clumps chain into streaks that point where
  // the hand went.
  const s = x * field.ax + y * field.ay;
  const t = x * field.ay - y * field.ax;
  const rolled =
    0.58 * areaNoise(s / (CLUMP * 2.1), t / (CLUMP * 0.72), 53) +
    0.42 * areaNoise(x / (CLUMP * 2.7), y / (CLUMP * 2.7), 59) +
    (speck - 0.5) * 0.2;
  const gate = smoothstep(0.26, 0.62, rolled);
  // The odd whole crumb, flattened onto the page where it broke off.
  const dropped = hashedRandom(gx, gy, 61) < field.crumbly ? CRUMB_BOOST : 1;
  field.grip[at] = crumb * (SLIP_LAY + (BITE_LAY - SLIP_LAY) * gate) * dropped;
  field.bite[at] = SLIP_DIG + BITE_DIG * gate;
}

/** One touch of the stick: the face pressed onto the sheet at a point, and
 *  whatever the paper takes from it.
 *
 *  `force` is how hard the hand is bearing down, and it is what decides how
 *  far *down* the face reaches; `share` is how much of a whole pass this
 *  touch is worth, so a path laid as a hundred overlapping touches comes out
 *  the weight of one stroke (the lead's arrangement exactly).
 *
 *  What the lead's `bear` does not have is the **face profile**: a crayon is
 *  a worn slab held at a lean, its facets plough furrows along the mark, and
 *  one side of a broad pass is solid while the other frays. All of that is
 *  across-the-mark structure, so it arrives as `face` — the force multiplier
 *  per cell of across-offset, worked out once per touch by the walk
 *  (`waxSim.ts`) and read here by index. `nx`/`ny` is the across direction
 *  the profile is laid out on. */
export function rub(
  field: WaxField,
  x: number,
  y: number,
  nx: number,
  ny: number,
  half: number,
  fray: number,
  force: number,
  share: number,
  face: Float32Array,
  faceMid: number,
): void {
  if (force <= 0 || share <= 0) return;
  const { cell, width, load, sheet, grip, bite } = field;
  const outer = half + fray * 0.5;
  const core = Math.max(half - fray, cell * 0.4);
  const outerSq = outer * outer;
  const span = outer - core;
  const first = Math.max(0, Math.floor((x - outer - field.x) / cell));
  const last = Math.min(width - 1, Math.ceil((x + outer - field.x) / cell));
  const top = Math.max(0, Math.floor((y - outer - field.y) / cell));
  const bottom = Math.min(
    field.height - 1,
    Math.ceil((y + outer - field.y) / cell),
  );
  const faceLast = face.length - 1;
  for (let row = top; row <= bottom; row++) {
    const cy = field.y + (row + 0.5) * cell;
    const dy = cy - y;
    const dySq = dy * dy;
    const line = row * width;
    for (let col = first; col <= last; col++) {
      const cx = field.x + (col + 0.5) * cell;
      const dx = cx - x;
      const awaySq = dx * dx + dySq;
      if (awaySq >= outerSq) continue;
      // How much of the face is over this cell: all of it under the core,
      // fading to nothing across the chipped edge…
      let shape = 1;
      if (span > 0) {
        const away = Math.sqrt(awaySq);
        if (away > core) {
          const t = Math.min(1, (away - core) / span);
          shape = 1 - t * t * (3 - 2 * t);
        }
      }
      if (shape <= 0) continue;
      // …times which part of the face this is — the lean and the furrows,
      // read off the profile at this cell's across-offset.
      const u = dx * nx + dy * ny;
      const slot = Math.max(
        0,
        Math.min(faceLast, Math.round(u / cell + faceMid)),
      );
      const press = force * shape * face[slot]!;
      if (press <= 0.02) continue;
      const at = line + col;
      reach(field, at, cx, cy);
      const held = load[at]!;
      const room = 1 - held / field.cap;
      // Full: the stick is burnishing what is already there.
      if (room <= 0) continue;
      // Where the surface stands *now* — the paper, plus whatever wax has
      // already gone into it. The line that makes colouring-in close up.
      const level = sheet[at]! + held * LEVELLING;
      // …and where the face of the stick has got to: deeper the harder it is
      // pressed and the softer the stick — and backed off where the face is
      // slipping rather than biting, which is what leaves clean paper between
      // the clumps of an ordinary pass and what a leaned-on hand overwhelms.
      const proud = level - (1 - press * field.dig * bite[at]!);
      if (proud <= 0) continue;
      const contact = proud < CONTACT ? proud / CONTACT : 1;
      load[at] = held + contact * press * field.shed * grip[at]! * room * share;
    }
  }
}

/** How much wax ended up in each cell. The field's own array rather than a
 *  copy — nothing mutates it after a mark is laid. */
export function laid(field: WaxField): Float32Array {
  return field.load;
}

/** What share of the sheet a mark actually waxed, counting a cell as marked
 *  once it holds `least` of a full load. The number that says "broken chain
 *  of crumbs" or "solid slab", and the one a test can put a hard claim on. */
export function waxCoverage(field: WaxField, least = 0.05): number {
  let marked = 0;
  for (const held of field.load) if (held >= least * field.cap) marked++;
  return marked / field.load.length;
}
