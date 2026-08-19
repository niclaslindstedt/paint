// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A board with a stick of chalk scrubbed over it.
//
// This is the chalk's `leadField.ts`: it knows about chalk dust and the sheet
// and nothing whatever about a gesture. Something else (`chalkSim.ts`) walks a
// path over it; all this owns is the surface and what one scrub of the stick
// leaves behind on it.
//
// It reads the SAME sheet the pencil reads (`sheetDip` in `leadField.ts`) —
// every medium here has to agree about where the page stands high and low, or
// a chalk line and a pencil line would be drawn on two different papers. What
// makes it chalk rather than graphite is everything else:
//
//   - **Chalk is soft and crumbles heavily.** A stick of board chalk reaches
//     most of the way into the sheet's tooth at an ordinary hand and sheds far
//     more of itself than any lead — which is why one pass covers where a
//     pencil pass sparkles.
//   - **The mark never closes into solid colour.** Chalk dust is caught cell
//     by cell, and how much a cell takes is wildly uneven (`GRIP_LOW`/
//     `GRIP_HIGH`, spread far wider than the lead's): a few crumbs catch the
//     light hard, a few spots of board stay almost bare, and even the heaviest
//     patch keeps dark pinholes. In the reference photographs that sparkle IS
//     the medium — a chalk portrait scrubbed to its brightest still glitters.
//   - **The crumb is coarser than a graphite fleck.** Chalk breaks off in
//     grains you can see (a third of a millimetre and clumped), so the grip is
//     hashed on its own lattice rather than the fibre's, in two octaves — the
//     crumb and the clump.
//   - **Dust levels the tooth fast.** A cell's load stands the surface up more
//     than graphite does (`LEVELLING`), so a second pass fills what the first
//     broke over — which is exactly how a chalk letter is made bold on a real
//     board — and then the cell caps and the stick burnishes instead.
//
// Nothing here allocates per touch and nothing here is random: the field is
// two `Float32Array`s and the arithmetic over them, which is what makes a mark
// repaint identically and a whole gesture drivable in a test with no canvas.

import type { GroundProfile } from "../ground.ts";
import { mm } from "../units.ts";
import { hashedRandom } from "./grain.ts";
import { sheetDip, sheetRelief } from "./leadField.ts";

/** The pitch chalk crumbles at, in document pixels. Coarser than the fibre the
 *  pencil reads (`PAPER_TOOTH`, a tenth of a millimetre): a chalk grain is a
 *  crumb you can see, not a fleck you can't. */
export const CHALK_CRUMB = mm(0.16);

/** How far a cell's worth of dust stands the surface up. Well past the lead's:
 *  chalk is powder, it packs into the hollows, and the second pass over a
 *  letter is most of the way to solid — which is the boldening every board
 *  writer does by habit. */
const LEVELLING = 0.72;

/** How far past first contact the face has to be driven before it is laying
 *  down all it can. Wider than the lead's — a stick of chalk is a blunt, worn
 *  face, not a point — but short of half the sheet, or the whole mark lives on
 *  the shoulder and the pressure axis compresses into grey. */
const CONTACT = 0.38;

/** What a cell holds before no more sticks, on a sheet with no relief at all,
 *  and how much of the sheet's own relief is added to that. */
const CAP_BASE = 0.95;
const CAP_TOOTH = 0.55;

/** How unevenly a cell takes what the stick offers it. The spread is the
 *  medium: from a spot of board that takes almost nothing (the dark pinholes
 *  every reference photograph keeps, however hard the patch was scrubbed) to a
 *  crumb that catches half again its share and reads as a glint. Two octaves —
 *  the crumb, and the clump of crumbs — so the sparkle clumps the way real
 *  dust does instead of reading as static. */
const GRIP_LOW = 0.06;
const GRIP_HIGH = 1.75;

/** How far a full press drives the face into the sheet, as a share of the
 *  sheet's whole depth, and how freely the stick crumbles once it is there.
 *  One stick — chalk has no grade ladder — and it sits where a very soft lead
 *  would: it reaches most of the tooth and sheds most of itself. */
const DIG = 0.88;
const SHED = 0.95;

/** A patch of page with a surface and a load of chalk dust. */
export type ChalkField = {
  /** Where the top-left cell is, in document pixels. */
  x: number;
  y: number;
  /** How many cells across and down, and how much page one is. */
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from, kept so a cell can be worked out the
   *  first time the stick is over it. */
  ground: GroundProfile;
  /** How high the sheet stands in each cell, 0–1. Row-major, `width` long,
   *  and meaningless where `ready` is 0. */
  sheet: Float32Array;
  /** …how readily each cell takes chalk (see `GRIP_LOW`). Same lattice, same
   *  row-major order, same caveat. */
  grip: Float32Array;
  /** Which cells those two have actually been worked out for. */
  ready: Uint8Array;
  /** …and how much chalk is in each cell, which is 0 everywhere the stick
   *  never went and needs no such caveat. */
  load: Float32Array;
  /** What one cell holds before the stick starts burnishing rather than
   *  depositing. */
  cap: number;
};

/** What a field is opened over. */
export type ChalkFieldSpec = {
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from (see `ground.ts`). The plain solid page
   *  is a perfectly good answer and gives the fibre and nothing else. */
  ground: GroundProfile;
};

/** The gain the stick's worn face applies across itself at one touch — the
 *  streaks a broad chalk drag is made of, and the lean that puts the hand's
 *  weight on one side of the face. Worked out once per touch by the sim
 *  (`chalkSim.ts`) and read per cell here, because a table lookup per cell is
 *  affordable where a noise call per cell is not. */
export type FaceGrain = {
  /** Unit vector across the face (the path's normal). */
  nx: number;
  ny: number;
  /** The gain per lane of the face, centred on `mid`: index
   *  `round(u / pitch) + mid` for a cell `u` document pixels across from the
   *  touch's centre. */
  gains: Float32Array;
  mid: number;
  pitch: number;
};

/** Open a field over a patch of page, with no chalk on it and — deliberately —
 *  **no sheet worked out yet**. A cell's height and grip are worked out the
 *  first time the stick is over it and kept from then on (`ready`), which
 *  makes the cost of a mark the mark rather than its bounding box. */
export function createChalkField(spec: ChalkFieldSpec): ChalkField {
  const cells = spec.width * spec.height;
  const relief = sheetRelief(spec.ground);
  return {
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    cell: spec.cell,
    ground: spec.ground,
    sheet: new Float32Array(cells),
    grip: new Float32Array(cells),
    ready: new Uint8Array(cells),
    load: new Float32Array(cells),
    cap: CAP_BASE + CAP_TOOTH * relief,
  };
}

/** Work the sheet out at one cell, if it has not been already.
 *
 *  The height is the shared sheet — the same `sheetDip` every other medium
 *  reads, so a chalk mark and a pencil mark agree about where the page is low.
 *  The grip is chalk's own: two octaves on the crumb lattice, wide enough that
 *  the low tail is a pinhole and the high tail a glint. */
function reach(field: ChalkField, at: number, x: number, y: number): void {
  if (field.ready[at] === 1) return;
  field.ready[at] = 1;
  field.sheet[at] = 1 - sheetDip(x, y, field.ground);
  const gx = Math.floor(x / CHALK_CRUMB);
  const gy = Math.floor(y / CHALK_CRUMB);
  const crumb = hashedRandom(gx, gy, 53);
  const clump = hashedRandom(gx >> 1, gy >> 1, 59);
  const rough = Math.max(0, Math.min(1, 0.82 * crumb + 0.5 * clump - 0.06));
  field.grip[at] = GRIP_LOW + (GRIP_HIGH - GRIP_LOW) * rough;
}

/** One touch of the stick: the worn face pressed onto the sheet at a point,
 *  and whatever the board takes from it.
 *
 *  `force` is how hard the hand is bearing down, 0–1ish — it decides how far
 *  *down* the face reaches, so it is not divided by anything. `share` is how
 *  much of a whole pass this touch is worth, which is how a path laid down as
 *  a hundred overlapping dabs comes out the weight of one stroke rather than
 *  of a hundred (see `chalkSim.ts`).
 *
 *  `half` is the face's contact radius and `fray` how much of its edge is
 *  crumbled rather than square. `grain` is the face's own texture — the
 *  streak lanes and the lean, worked out per touch by the sim — or `null` for
 *  a touch with no structure worth paying for (the dust pass). */
export function scrub(
  field: ChalkField,
  x: number,
  y: number,
  half: number,
  fray: number,
  force: number,
  share = 1,
  grain: FaceGrain | null = null,
): void {
  if (force <= 0 || share <= 0) return;
  // Everything the two loops need, read out of the field once — this is the
  // innermost code in the engine.
  const { cell, width, load, sheet, grip } = field;
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
  for (let row = top; row <= bottom; row++) {
    const cy = field.y + (row + 0.5) * cell;
    const dy = cy - y;
    const dySq = dy * dy;
    const line = row * width;
    for (let col = first; col <= last; col++) {
      const cx = field.x + (col + 0.5) * cell;
      const dx = cx - x;
      const awaySq = dx * dx + dySq;
      // Outside the face's own footprint: nothing to work out.
      if (awaySq >= outerSq) continue;
      // How much of the face is over this cell: all of it under the core,
      // fading to nothing across the crumbled edge.
      let shape: number;
      if (span > 0) {
        const away = Math.sqrt(awaySq);
        const t = Math.max(0, Math.min(1, (away - core) / (outer - core)));
        shape = 1 - t * t * (3 - 2 * t);
      } else {
        shape = 1;
      }
      if (shape <= 0) continue;
      let press = force * shape;
      // The face's own texture: which streak lane of the worn face this cell
      // is under, and how much of the hand's weight that lane carries.
      if (grain) {
        const u = dx * grain.nx + dy * grain.ny;
        const lane = Math.round(u / grain.pitch) + grain.mid;
        if (lane >= 0 && lane < grain.gains.length) {
          press *= grain.gains[lane]!;
        }
      }
      if (press <= 0.02) continue;
      const at = line + col;
      // The sheet here, worked out now if this is the first time anything has
      // been over it.
      reach(field, at, cx, cy);
      const held = load[at]!;
      const room = 1 - held / field.cap;
      // Full: the stick is burnishing what is already there.
      if (room <= 0) continue;
      // Where the surface stands *now* — the board, plus whatever dust has
      // already packed into it. The line that makes a second pass reach
      // hollows the first one could not.
      const level = sheet[at]! + held * LEVELLING;
      // …and where the face of the stick has got to: deeper the harder it is
      // pressed. Chalk is soft — even a light hand reaches well into the
      // tooth, which is why one pass covers where a hard lead sparkles.
      const face = 1 - press * DIG;
      const proud = level - face;
      if (proud <= 0) continue;
      // A square-root shoulder rather than a linear one: chalk is powder, and
      // even a grazed crown takes a real crumb — the linear ramp made a light
      // hand's specks too faint to read, where on the board they are sparse
      // but bright.
      const contact = proud < CONTACT ? Math.sqrt(proud / CONTACT) : 1;
      load[at] = held + contact * press * SHED * grip[at]! * room * share;
    }
  }
}

/** Loose dust sprinkled past the face's edge: the crumbs that scatter as the
 *  stick is scrubbed and cling where they land — the sparse halo of specks
 *  around every heavy mark on a real board.
 *
 *  Not a scrub: a falling crumb never went through the face's contact, so it
 *  answers to no pressure threshold. Which cells catch one is hashed off the
 *  page (so repaints and crossing strokes agree), thinned by `chance`, biased
 *  to the crowns of the sheet, and faded from `inner` to `outer`. `share`
 *  divides one pass between the overlapping touches that lay it, exactly as
 *  the face's own deposits are divided. */
export function sprinkle(
  field: ChalkField,
  x: number,
  y: number,
  inner: number,
  outer: number,
  amount: number,
  chance: number,
  share = 1,
): void {
  if (amount <= 0 || share <= 0 || outer <= inner) return;
  const { cell, width, load } = field;
  const outerSq = outer * outer;
  const innerSq = inner * inner;
  const first = Math.max(0, Math.floor((x - outer - field.x) / cell));
  const last = Math.min(width - 1, Math.ceil((x + outer - field.x) / cell));
  const top = Math.max(0, Math.floor((y - outer - field.y) / cell));
  const bottom = Math.min(
    field.height - 1,
    Math.ceil((y + outer - field.y) / cell),
  );
  for (let row = top; row <= bottom; row++) {
    const cy = field.y + (row + 0.5) * cell;
    const dy = cy - y;
    const dySq = dy * dy;
    const line = row * width;
    for (let col = first; col <= last; col++) {
      const cx = field.x + (col + 0.5) * cell;
      const dx = cx - x;
      const awaySq = dx * dx + dySq;
      if (awaySq >= outerSq || awaySq < innerSq) continue;
      // Whether a crumb ever lands in this cell at all — page-anchored, so
      // two repaints (and the store's copy) scatter the same specks.
      const gx = Math.floor(cx / CHALK_CRUMB);
      const gy = Math.floor(cy / CHALK_CRUMB);
      if (hashedRandom(gx, gy, 71) >= chance) continue;
      const at = line + col;
      reach(field, at, cx, cy);
      // Dust clings to the crowns; a crumb on the slope rolls off.
      const stand = field.sheet[at]! - 0.55;
      if (stand <= 0) continue;
      // Squared, so the halo hugs the edge and thins fast: loose dust falls
      // close to the stick, and a halo that carries is spray, not chalk.
      const off =
        1 - (Math.sqrt(awaySq) - inner) / Math.max(0.001, outer - inner);
      const fade = off * off;
      const held = load[at]!;
      const room = 1 - held / field.cap;
      if (room <= 0) continue;
      load[at] =
        held + amount * stand * 2 * fade * field.grip[at]! * room * share;
    }
  }
}

/** How much chalk ended up in each cell. The field's own array rather than a
 *  copy — nothing mutates it after a mark is laid. */
export function dusted(field: ChalkField): Float32Array {
  return field.load;
}

/** What share of the field a mark actually whitened, counting a cell as
 *  marked once it holds `least` of a full load. The number that says "broken
 *  chain of specks" or "covered band", and the one a test can put a hard
 *  claim on. */
export function chalkCoverage(field: ChalkField, least = 0.05): number {
  let marked = 0;
  for (const held of field.load) if (held >= least * field.cap) marked++;
  return marked / field.load.length;
}
