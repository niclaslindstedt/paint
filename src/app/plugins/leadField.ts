// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A sheet of paper with a lead pressed onto it.
//
// This is the pencil's `washField.ts`: it knows about graphite and paper and
// nothing whatever about a gesture. Something else (`leadSim.ts`) walks a path
// over it; all this owns is the surface and what one touch of a lead leaves
// behind on it.
//
// The whole model is two numbers per cell of the sheet:
//
//   - **how high the paper stands** there, 0 at the bottom of the deepest
//     valley and 1 on the peaks. It is a fixed property of the page, hashed off
//     the position rather than drawn at random, so the same sheet has the same
//     tooth on every repaint and two strokes that cross agree about where it is
//     low (see `grain.ts`).
//   - **how much graphite is in it**, which starts at nothing and is what the
//     lead leaves.
//
// and one rule for putting the second onto the first:
//
//     the lead rides on the high ground, and it can only reach as far down as
//     it is pressed and as soft as it is.
//
// Everything a pencil does that a scattered speckle cannot comes out of that
// one line, so it is worth spelling out what "everything" is:
//
//   - **A hard lead only ever touches the peaks.** 2H barely dents the sheet,
//     so on rough paper it draws a line with the paper showing straight through
//     it, and on hot-pressed — where there is hardly any relief to miss — very
//     nearly a solid one. Same lead, same pressure, two different marks,
//     because the *sheet* is different. That is the thing this engine is for.
//   - **The valleys fill in.** Graphite in a cell stands the surface up
//     (`LEVELLING`), so the second pass over a patch reaches ground the first
//     could not — which is what shading with a pencil actually feels like, and
//     why a scribbled block goes from broken to solid rather than simply
//     getting darker.
//   - **And then it stops.** A cell holds only so much (`LeadField.cap`); past
//     that the lead polishes what is there instead of adding to it. That is
//     burnishing, and it is why a real pencil has a black it cannot go past
//     however long you keep scribbling.
//   - **A toothy sheet holds more.** The cap is the sheet's own relief, so
//     rough paper takes more graphite than hot-pressed before it saturates —
//     which is exactly why it is the paper a tonal drawing is made on.
//
// Nothing here allocates per touch and nothing here is random: a field is two
// `Float32Array`s and the arithmetic over them, which is what makes a mark
// repaint identically and a whole gesture drivable in a test with no canvas.

import type { GroundProfile } from "../ground.ts";
import {
  HARDEST_LEAD,
  PAPER_TOOTH,
  SOFTEST_LEAD,
  paperTooth,
} from "./graphite.ts";
import { areaNoise, hashedRandom, smoothstep } from "./grain.ts";

/** How much of the sheet's relief the paper's own fibre accounts for — the
 *  fine, sub-tenth-of-a-millimetre tooth every sheet has, the plain digital
 *  page included.
 *
 *  It is what keeps a pencil a pencil on a surface with no stock at all: the
 *  solid page has no grain to paint and nothing that drinks, but a pencil line
 *  on it still has to break up, because the breaking up is the lead and not
 *  only the sheet. */
const FIBRE_RELIEF = 0.45;

/** …and how much more the *stock's* own tooth adds at full bite. Getting on for
 *  twice the fibre, because that is the honest ratio: the dips in cold-pressed
 *  paper are visible to the naked eye and its fibre is not. */
const TOOTH_RELIEF = 0.62;

/** How far a cell's worth of graphite stands the surface up. Short of levelling
 *  it — a valley packed with graphite is still a valley, which is why the very
 *  deepest of them on rough stock never fill however long you shade. */
const LEVELLING = 0.55;

/** How far past first contact the lead has to be driven before it is laying
 *  down all it can. A shoulder rather than a step: the edge of a valley takes
 *  some graphite, just less than the peak beside it, and without this the mark
 *  is two-tone. */
const CONTACT = 0.34;

/** What a cell holds before no more sticks, on a sheet with no relief at all,
 *  and how much of the sheet's own relief is added to that. */
const CAP_BASE = 0.62;
const CAP_TOOTH = 0.62;

/** How unevenly a cell takes what the lead offers it, from a cell that grabs
 *  half of it to one that grabs a third more than its share.
 *
 *  **This is the lead, not the paper.** Graphite leaves the stick in flakes,
 *  and where a flake lands and catches is not something the sheet decides — a
 *  pencil line on plate glass is still speckled. Without it the simulation on a
 *  surface with no tooth to find comes out as a smooth grey band, which is a
 *  perfectly good picture of an airbrush and no picture at all of a pencil.
 *
 *  Hashed on the fibre's own lattice — a couple of device pixels at 1:1 —
 *  because that is the size a graphite fleck actually is, and because it puts
 *  this grain at the same pitch as the speckle the stroke model draws. */
const GRIP_LOW = 0.5;
const GRIP_HIGH = 1.34;

/** The hardest and softest the dig and the shed below go, as fractions of the
 *  sheet's full depth and of a full load. The pair of them *is* the grade, and
 *  it takes both:
 *
 *    - a hard lead **reaches less far** — it is a point rather than a face, it
 *      does not deform, and the paper it is pressed against does not give under
 *      it — so it rides the high ground and leaves the valleys alone;
 *    - and it **sheds far less** of itself once it is there, which is the other
 *      half of why 6H is a pale scratch and 6B is nearly black.
 *
 *  Weighted towards the second, because the first on its own is a cliff: a lead
 *  that reached nowhere at all would draw nothing whatever on rough stock, and
 *  a 6H on rough paper draws a real, faint, very broken line. */
const DIG_HARD = 0.42;
const DIG_SOFT = 0.98;
const SHED_HARD = 0.2;
const SHED_SOFT = 0.85;

/** A patch of page with a surface and a load. */
export type LeadField = {
  /** Where the top-left cell is, in document pixels. */
  x: number;
  y: number;
  /** How many cells across and down, and how much page one is. */
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from, kept so a cell can be worked out the first
   *  time the lead is over it (see `createLeadField`). */
  ground: GroundProfile;
  /** How high the sheet stands in each cell, 0–1. Row-major, `width` long, and
   *  meaningless where `ready` is 0. */
  sheet: Float32Array;
  /** …how readily each cell takes what the lead offers it (see `GRIP_LOW`).
   *  Same lattice, same row-major order, same caveat. */
  grip: Float32Array;
  /** Which cells those two have actually been worked out for. */
  ready: Uint8Array;
  /** …and how much graphite is in each cell, which is 0 everywhere the lead
   *  never went and needs no such caveat. */
  load: Float32Array;
  /** What one cell holds before the lead starts polishing rather than
   *  depositing. */
  cap: number;
  /** How far a full press drives this lead into the sheet, as a share of the
   *  sheet's whole depth — the H-to-B axis, on the geometry side. */
  dig: number;
  /** …and how freely it crumbles once it is in contact, which is the same axis
   *  on the deposit side. A hard lead that reached everywhere would still draw
   *  a pale line. */
  shed: number;
};

/** What a field is opened over. */
export type LeadFieldSpec = {
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
  /** The sheet the page is cut from (see `ground.ts`). The plain solid page is
   *  a perfectly good answer and gives the fibre and nothing else. */
  ground: GroundProfile;
  /** The lead, as a fraction of an HB — the same number the grade dial holds
   *  (see `graphite.ts`). */
  grade: number;
};

/** How deep the sheet is below its peaks at a point, 0 (a peak) to 1 (the
 *  bottom of the deepest valley there is).
 *
 *  Two layers, and they are two different things about the paper:
 *
 *    - the **fibre**, at the pencil's own pitch. It is `paperTooth` — the
 *      lattice the stroke model scatters its specks against and the one the
 *      rubber reads to know what it can lift — rescaled from its own centred
 *      range onto 0–1. Sharing it is not tidiness: a mark drawn with one engine
 *      and rubbed at with the other has to agree about which cells the lead
 *      ever reached, or the rubbing out leaves a ghost of a sheet nobody drew
 *      on.
 *    - the **stock's tooth**, at the pitch and depth the ground declares, and
 *      arranged the way that ground is made: paper dips at random in clumps,
 *      cloth goes over and under. Interpolated rather than hashed per cell,
 *      because the field is worked at a device pixel and a dip in cold-pressed
 *      paper is ten of them across — sampled flat it would be a mosaic of
 *      squares rather than a surface.
 *
 *  Exported for the tests, which is the only honest way to check that a rough
 *  sheet really is deeper than a hot-pressed one rather than merely looking it. */
export function sheetDip(x: number, y: number, ground: GroundProfile): number {
  return dipOn(
    Math.floor(x / PAPER_TOOTH),
    Math.floor(y / PAPER_TOOTH),
    x,
    y,
    ground,
  );
}

/** The same thing with the fibre's lattice already worked out, which is what
 *  `reach` has to hand: the grip is hashed on that same lattice, and dividing
 *  a coordinate by the fibre pitch twice per cell is a division per cell the
 *  innermost loop of the engine does not need to pay. */
function dipOn(
  gx: number,
  gy: number,
  x: number,
  y: number,
  ground: GroundProfile,
): number {
  // `paperTooth` runs over [-0.39, 1.39): the same three octaves, centred on
  // nothing in particular because the stroke model compares it against a
  // deposit rather than against a depth.
  const fibre = Math.max(0, Math.min(1, (paperTooth(gx, gy) + 0.39) / 1.78));
  let dip = FIBRE_RELIEF * fibre;
  if (ground.pattern !== "none" && ground.tooth > 0 && ground.bite > 0) {
    const stock =
      ground.pattern === "cloth"
        ? weaveDip(x, y, ground.tooth)
        : toothDip(x, y, ground.tooth);
    dip += TOOTH_RELIEF * ground.bite * stock;
  }
  return Math.min(1, dip);
}

/** Paper: dips and peaks at random, in clumps. Two octaves, the coarser at
 *  rather more than twice the pitch, for the reason the painted grain uses two
 *  (see `groundPaint.ts`) — one octave is static, and real paper has patches
 *  that are generally low as well as individual dips. */
function toothDip(x: number, y: number, pitch: number): number {
  const fine = areaNoise(x / pitch, y / pitch, 41);
  const broad = areaNoise(x / (pitch * 2.4), y / (pitch * 2.4), 47);
  return Math.min(1, 0.64 * fine + 0.44 * broad);
}

/** Cloth: warp over weft. Each cell is one thread crossing the other, and the
 *  thread on top stands proud of the one under it — so a pencil dragged across
 *  primed canvas catches the crowns and skips the troughs between them, which
 *  is the whole look of a drawing made on one.
 *
 *  A thread is round, so it is shaded across its own width rather than being a
 *  flat square, and it varies in weight down its length (a slub). Both are the
 *  same reading `groundPaint.ts` makes of the same cloth, so what the pencil
 *  finds and what the page shows are the same weave. */
function weaveDip(x: number, y: number, pitch: number): number {
  const gx = Math.floor(x / pitch);
  const gy = Math.floor(y / pitch);
  // **Both threads are there at every point**, and the surface is whichever of
  // them is higher. That is the difference between cloth and a draughtboard:
  // a warp thread runs the whole length of the cloth, so along its own run it
  // is a continuous ridge that merely dives under a weft every other crossing.
  // Take one thread per cell instead and every other cell is a trench, which
  // reads as a halftone screen rather than as canvas.
  const warp = Math.sin(Math.PI * (x / pitch - gx));
  const weft = Math.sin(Math.PI * (y / pitch - gy));
  // A thread varies in weight down its own length, the way a spun yarn does.
  const warpSlub = 0.62 + hashedRandom(gx, 0, 3) * 0.38;
  const weftSlub = 0.62 + hashedRandom(gy, 1, 3) * 0.38;
  // Plain weave: which one is on top alternates every crossing in both
  // directions. The one underneath is still cloth, just lower.
  const over = (((gx + gy) % 2) + 2) % 2 === 0;
  const stand = over
    ? Math.max(warp * warpSlub, weft * weftSlub * 0.5)
    : Math.max(weft * weftSlub, warp * warpSlub * 0.5);
  return Math.max(0, Math.min(1, 1 - stand));
}

/** Open a field over a patch of page, with no graphite on it and — deliberately
 *  — **no sheet worked out yet**.
 *
 *  The sheet is a dozen hashes a cell and a mark only ever touches the band it
 *  swept: a diagonal line across a page has a bounding box a hundred times the
 *  area of the line itself, and paying for the whole box would be paying to
 *  invent paper nobody drew on. So a cell's height and grip are worked out the
 *  first time the lead is over it and kept from then on (`ready`), which makes
 *  the cost of a mark the mark rather than its box. */
export function createLeadField(spec: LeadFieldSpec): LeadField {
  const cells = spec.width * spec.height;
  // How much relief this sheet has at all, which is how much graphite it can
  // hold: a hollow is somewhere for the stuff to go, and a sheet with no
  // hollows saturates the moment its face is covered.
  const relief = sheetRelief(spec.ground);
  // The grade, as one number from hardest to softest. The ends are the medium's
  // own (see `graphite.ts`), so the dial and the field cannot drift apart.
  const soft = softness(spec.grade);
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
    dig: DIG_HARD + (DIG_SOFT - DIG_HARD) * soft,
    shed: SHED_HARD + (SHED_SOFT - SHED_HARD) * soft,
  };
}

/** How deep this sheet goes at all — the deepest `sheetDip` can answer on it,
 *  and so the ceiling every cell's dip stays under.
 *
 *  Exported for the ink field (`quillField.ts`), which reads it for a shortcut
 *  the lead has no use for: a charged nib's meniscus bridges every dip
 *  shallower than its own reach, so once the reach clears the *whole relief*
 *  there is no cell anywhere whose dip could matter and the sheet need not be
 *  worked out at all — which is the common case of every fully-inked stroke,
 *  and half its cost. */
export function sheetRelief(ground: GroundProfile): number {
  return Math.min(1, FIBRE_RELIEF + TOOTH_RELIEF * Math.max(0, ground.bite));
}

/** Work the sheet out at one cell, if it has not been already. */
function reach(field: LeadField, at: number, x: number, y: number): void {
  if (field.ready[at] === 1) return;
  field.ready[at] = 1;
  field.sheet[at] = 1 - sheetDip(x, y, field.ground);
  field.grip[at] =
    GRIP_LOW +
    (GRIP_HIGH - GRIP_LOW) *
      hashedRandom(
        Math.floor(x / PAPER_TOOTH),
        Math.floor(y / PAPER_TOOTH),
        37,
      );
}

/** A grade as a fraction from the hardest lead in the tin to the softest.
 *
 *  Imported ends rather than remembered ones: the ladder of names is the dial's
 *  and how far the medium goes is the medium's, and a field that ran over one
 *  range while the dial ran over another would answer for the wrong pencil. */
function softness(grade: number): number {
  return Math.max(
    0,
    Math.min(1, (grade - HARDEST_LEAD) / (SOFTEST_LEAD - HARDEST_LEAD)),
  );
}

/** One touch of the lead: the contact patch pressed onto the sheet at a point,
 *  and whatever the paper takes from it.
 *
 *  `force` is how hard the hand is bearing down, 0–1, and it is what decides
 *  how far *down* the lead reaches — so it is not divided by anything. `share`
 *  is how much of a whole pass this particular touch is worth, which is how a
 *  path laid down as a hundred overlapping dabs comes out the weight of one
 *  stroke rather than of a hundred (see `leadSim.ts`).
 *
 *  `half` is the lead's contact radius and `fray` how much of its edge is
 *  chipped rather than square. */
export function bear(
  field: LeadField,
  x: number,
  y: number,
  half: number,
  fray: number,
  force: number,
  share = 1,
): void {
  if (force <= 0 || share <= 0) return;
  // Everything the two loops need, read out of the field once. This is the
  // innermost code in the engine — a dab covers a couple of hundred cells and a
  // stroke lays five hundred dabs — so a property read left inside the loop is a
  // property read a hundred thousand times per mark.
  const { cell, width, load, sheet, grip } = field;
  const outer = half + fray * 0.5;
  const core = Math.max(half - fray, cell * 0.4);
  // Squared, so the test below needs no square root at all: comparing distances
  // and comparing their squares order the same way.
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
      // Outside the lead's own footprint: nothing to work out, and no square
      // root taken to find that out.
      if (awaySq >= outerSq) continue;
      // How much of the lead's face is over this cell: all of it under the
      // core, fading to nothing across the chipped edge. The one square root
      // left, and it is only taken for a cell the lead is actually over.
      const shape =
        span > 0 ? 1 - smoothstep(core, outer, Math.sqrt(awaySq)) : 1;
      if (shape <= 0) continue;
      const press = force * shape;
      if (press <= 0.02) continue;
      const at = line + col;
      // The sheet here, worked out now if this is the first time anything has
      // been over it.
      reach(field, at, cx, cy);
      const held = load[at]!;
      const room = 1 - held / field.cap;
      // Full: the lead is polishing what is already there.
      if (room <= 0) continue;
      // Where the surface stands *now* — the paper, plus whatever graphite has
      // already gone into it. This is the line that makes a second pass reach
      // ground the first one could not.
      const level = sheet[at]! + held * LEVELLING;
      // …and where the face of the lead has got to. Deeper the harder it is
      // pressed and the softer the lead is; a hard one at a light touch is
      // riding on the very tops of the sheet.
      const face = 1 - press * field.dig;
      const proud = level - face;
      if (proud <= 0) continue;
      const contact = proud < CONTACT ? proud / CONTACT : 1;
      load[at] = held + contact * press * field.shed * grip[at]! * room * share;
    }
  }
}

/** How much graphite ended up in each cell. The field's own array rather than a
 *  copy — nothing mutates it after a mark is laid, and a page of pencil strokes
 *  is not a place to allocate a second one of these per mark. */
export function laid(field: LeadField): Float32Array {
  return field.load;
}

/** What share of the sheet a mark actually blackened, counting a cell as marked
 *  once it holds `least` of a full load. The number that says "broken line" or
 *  "solid one", and the one a test can put a hard claim on. */
export function coverage(field: LeadField, least = 0.05): number {
  let marked = 0;
  for (const held of field.load) if (held >= least * field.cap) marked++;
  return marked / field.load.length;
}
