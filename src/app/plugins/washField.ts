// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wet field: a sheet of paper as a grid of cells with water in it.
//
// The other watercolour painter in this app (`plugins/aquarelle.ts`) is a
// *stroke* model — a closed path with a dried rim, a gathered ribbon and a
// mottle hashed off the page. It is cheap, deterministic and honest about being
// an approximation, and it is still the default.
//
// This is the other kind of answer. Nothing here knows what a stroke is. There
// is a sheet, there is water on it, there is pigment in the water, and the
// picture is whatever is left when the water has gone. Every one of the things
// a watercolourist actually looks for falls out of that rather than being drawn:
//
//   - **The rim dries darkest** because water evaporates fastest where the wash
//     meets dry paper, more water flows out to replace what left, and the
//     pigment it was carrying is stranded there. That is the coffee-ring, and
//     it is three lines of arithmetic rather than a stroked outline.
//   - **Pigment goes where the water went**, not where the hand went: it is
//     carried by the flow between cells, so a wash that pooled downhill is
//     darker downhill.
//   - **Granulation** is the same transport meeting the sheet's own height
//     field — a heavy pigment drops out of suspension in the valleys and leaves
//     the ridges pale.
//   - **Blooms and cauliflowers** happen when water lands on paper that is
//     already damp and still holding pigment: the new water is a hill, it
//     surges outward, and it shoves the pigment ahead of it into a jagged front
//     that then dries where it stopped. Nothing draws a cauliflower; a
//     cauliflower is what a surge into a drying wash *is*.
//
// **Time here is steps, never the clock.** Painting in this app is a pure
// function of the document — a pan, an undo and the exported PNG all repaint
// from the stroke list — so a wash that went on blooming while you looked at it
// would paint a different page half a second later. The field is run for a
// fixed number of steps from a fixed starting state, so the same strokes always
// dry into the same pixels. Every number in it is arithmetic on typed arrays,
// and the only randomness is `hashedRandom` off page coordinates: two strokes
// that overlap agree about where the paper is low, exactly as the mottle in
// `aquarelle.ts` and the grain in `crayon.ts` do.
//
// The module is pure — no DOM, no canvas, no colour. It takes water and pigment
// in and hands `density()` back, which is a number per cell saying how much
// pigment ended up there. Turning that into pixels is `washSim.ts`'s job, and
// driving it from a stroke is too.

import type { GroundProfile } from "../ground.ts";
import { mm } from "../units.ts";
import { hashedRandom } from "./grain.ts";

/** What a colour *is*, as far as the water is concerned.
 *
 *  A watercolour pigment is not a colour with a name, it is a mineral or a dye
 *  with a handful of properties, and the properties are what a painter picks
 *  between: ultramarine is a coarse ground rock that sinks into the paper's
 *  valleys and lifts again with a wet brush, phthalo blue is a dye that stains
 *  the fibre on contact and never comes off. Those two behave completely
 *  differently in the same wash, and the difference is these three numbers. */
export type Pigment = {
  /** How readily it drops out of suspension into the sheet's valleys, 0 (stays
   *  in solution and dries flat) to 1 (a heavy earth that mottles). */
  granulation: number;
  /** How fast it fixes to the fibre, and so how little of it the water can pick
   *  up again, 0 (lifts freely) to 1 (a stain). */
  staining: number;
  /** How far it wanders through still water on its own, 0–1. */
  diffusion: number;
};

/** The pigment a granulation dial describes.
 *
 *  One dial rather than three because that is the axis a painter actually moves
 *  along: the granulating colours are the heavy ones and the staining colours
 *  are the light ones, and there is no such thing as a pigment that both
 *  granulates hard and stains hard. So the dial runs from a phthalo at 0 to an
 *  ultramarine at the top, and the other two properties follow from it.
 *
 *  It is the *same* dial the simple engine reads (see `paintWash`), which is
 *  the whole point of having two engines behind one set of controls: moving a
 *  slider and then switching engine is a change of rendering, not of settings. */
export function pigmentFor(granulation: number): Pigment {
  const heavy = Math.max(0, Math.min(2, granulation)) / 2;
  return {
    granulation: heavy,
    // A dye is the opposite of a rock: what does not settle, sticks.
    staining: 1 - Math.min(1, heavy * 1.6),
    // …and what sticks least, creeps furthest. A staining colour is in solution
    // and travels with the water; a heavy one is a suspension of grit and stays
    // where the water dropped it.
    diffusion: 0.06 + (1 - heavy) * 0.16,
  };
}

/** The pitch of the sheet's grain when the page has none of its own — the plain
 *  solid sheet.
 *
 *  It is not zero, and it cannot be. A perfectly flat bed makes perfectly round
 *  blooms and a rim of even weight, which is the one thing that would give the
 *  simulation away as arithmetic: paper is what makes a wet edge wander. So the
 *  digital page gets a fine, shallow tooth — enough to break a front up,
 *  nothing like enough to mottle. A drawing on real stock uses that stock's own
 *  pitch and bite instead. */
const BARE_TOOTH = mm(0.4);
const BARE_BITE = 0.14;

/** How deep the sheet's height field is in units of water, at `bite = 1`.
 *
 *  Water finds the low ground, and this is how strongly. Too little and rough
 *  paper behaves like hot-pressed; too much and the wash cannot cross a ridge
 *  at all, which reads as a wash painted on gravel. */
const BED_DEPTH = 0.5;

/** How much a ridge slows the water crossing it. */
const BED_DRAG = 0.55;

/** How hard the surface's own slope pushes the water along it, per step.
 *
 *  **Under a quarter, and that is not a taste.** Spreading water down its own
 *  gradient is a diffusion, it is stepped explicitly, and an explicit diffusion
 *  on a four-neighbour lattice goes unstable above ¼: the mode it grows is the
 *  one that alternates cell by cell, so what you get is not a blown-up field
 *  but a wash with a fine chequerboard woven through it, which looks enough
 *  like a texture to ship by mistake. The momentum and rim terms below push the
 *  same water about as well, so this leaves them room. */
const PRESSURE = 0.16;

/** How much of the water's momentum survives a step, and how much of the slope
 *  it picks up. Momentum is what makes a surge *overshoot* — a bloom that
 *  merely relaxed outwards would be a soft disc, and the jagged front that
 *  dries into a cauliflower is the water arriving with more speed than the
 *  local slope justifies. */
const DAMPING = 0.72;
const PUSH = 0.5;

/** How much of a step's flow is momentum rather than slope. */
const ADVECTION = 0.25;

/** The most of a cell's water one neighbour may take in one step. The scheme is
 *  explicit, so a cell that gave everything to all four of its neighbours at
 *  once would go negative and the field would ring; a quarter each is the
 *  bound that makes that impossible. */
const FLOW_CAP = 0.25;

/** How fast water leaves the sheet each step: into the air, and into the fibre.
 *
 *  The two are separate because they do different things to the pigment.
 *  Evaporation strands it on the surface where it can still be moved by the
 *  next brushful; absorption takes it *into* the paper, which is what makes a
 *  mark on thirsty stock a stain rather than a coat. */
const EVAPORATION = 0.022;
const ABSORPTION = 0.006;

/** How hard the drying perimeter pulls the water inside the wash outward.
 *
 *  The rim is not painted and it is not a rule about edges: a puddle loses its
 *  water at the perimeter, so the water in the middle has to travel there to be
 *  what leaves, and pigment is a passenger the whole way. Turn this to zero and
 *  a wash dries as a dome — palest at the edge, darkest where the brush was —
 *  which is what an airbrush does and what watercolour never does. */
const PUMP = 0.3;

/** How much faster the water goes at the wet edge than in the middle of a pool.
 *
 *  This one number is the rim. A puddle evaporates from its perimeter, the
 *  middle flows out to replace what left, and the pigment that rode out with it
 *  has nowhere to go back to. Turn it to zero and a wash dries flat. */
const EDGE_EVAPORATION = 5;

/** How much water creeps sideways into dry paper each step, before anything is
 *  flowing — capillary action, which is the thing that makes a wet edge on
 *  cold-pressed paper fray instead of stopping. Scaled by how thirsty the sheet
 *  is and by how low the neighbouring ground is, so it fingers into the valleys
 *  and leaves the ridges dry. */
const CAPILLARY = 0.15;

/** How fast a fully-granulating pigment rolls down the sheet's own slope while
 *  it is still in suspension — the whole of the mottle (see `settle`). */
const ROLLING = 0.35;

/** How much suspended pigment settles per step, and how much of what settled
 *  the water picks up again. Deposition beats lifting by a good margin — paint
 *  in water is on its way to the paper — and a staining colour hardly lifts at
 *  all. */
const SETTLING = 0.05;
const LIFTING = 0.06;

/** How much slower pigment settles out of a full puddle than out of the damp
 *  film at its edge. */
const SHALLOW = 4;

/** Below this much water a cell counts as dry: what it is still carrying drops
 *  where it stands, and it stops taking part in the flow. */
const DRY = 0.004;

/** How much of the head lays a full charge before the shoulder starts. */
const PLATEAU = 0.62;

/** A patch of wet paper. Every array is one entry per cell, row-major. */
export type WashField = {
  /** The grid, in cells. */
  width: number;
  height: number;
  /** How many document pixels one cell is across. */
  cell: number;
  /** Where the grid's top-left corner sits on the page, in document pixels. */
  x: number;
  y: number;
  /** Standing water. */
  water: Float32Array;
  /** Pigment the water is carrying. */
  suspended: Float32Array;
  /** Pigment that has settled onto — or into — the sheet. This is the picture. */
  deposit: Float32Array;
  /** How fast water is crossing the face to the right of each cell, and the
   *  face below it (see `accelerate`). On the faces rather than in the middle
   *  of the cells, which is what keeps a chequerboard out of the wash. */
  vx: Float32Array;
  vy: Float32Array;
  /** How high the sheet stands under each cell, 0 (a valley) to 1 (a ridge). */
  bed: Float32Array;
  /** How freely water runs across it — the reciprocal of the ridge above. */
  flow: Float32Array;
  /** How much of each wet cell's neighbourhood is dry paper, 0 in the middle of
   *  a pool and 1 at a lone damp speck (see `expose`). */
  exposure: Float32Array;
  pigment: Pigment;
  /** How much the sheet drinks (see `GroundProfile.absorbency`). */
  absorbency: number;
  /** Scratch, held rather than allocated per step. */
  nextWater: Float32Array;
  nextSuspended: Float32Array;
  /** The box of cells the water has reached, inclusive — `right` below `left`
   *  while the sheet is still dry (see `damp`). */
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** How far water can travel in one step: transport moves it to a neighbour, and
 *  the capillary creep that runs after it moves that on again. Two cells, so
 *  that is how far the damp box is opened before a step runs. */
const REACH = 2;

/** Note that a patch of cells has water in it, so the passes below visit it.
 *
 *  It is a bound and not a mask: everything inside it is stepped whether it is
 *  wet or dry, and the arithmetic is exactly what stepping the whole sheet
 *  would have done — every cell outside is dry, holds nothing, and neither
 *  gives nor takes. What it buys is the sheet a mark *hasn't* reached, which on
 *  a diagonal sweep is most of the field's own bounding box, and on the first
 *  steps of any mark is nearly all of it. */
function damp(
  field: WashField,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  if (left < field.left) field.left = left;
  if (top < field.top) field.top = top;
  if (right > field.right) field.right = right;
  if (bottom > field.bottom) field.bottom = bottom;
}

/** One octave of the sheet's grain: the hashed lattice, read *between* its
 *  points rather than at them.
 *
 *  Interpolated because the field is finer than the tooth is. Sampling the hash
 *  per cell gives every cell in a tooth-sized square the same height, and what
 *  that granulates into is not a mottle but a mosaic of little blocks — which
 *  is a thing paper has never done. This is the same trick `driftNoise` plays
 *  along a stroke, in two dimensions. */
function octave(u: number, v: number, seed: number): number {
  const cx = Math.floor(u);
  const cy = Math.floor(v);
  const fx = u - cx;
  const fy = v - cy;
  const ex = fx * fx * (3 - 2 * fx);
  const ey = fy * fy * (3 - 2 * fy);
  const a = hashedRandom(cx, cy, seed);
  const b = hashedRandom(cx + 1, cy, seed);
  const c = hashedRandom(cx, cy + 1, seed);
  const d = hashedRandom(cx + 1, cy + 1, seed);
  const top = a + (b - a) * ex;
  const bottom = c + (d - c) * ex;
  return top + (bottom - top) * ey;
}

/** How high the sheet stands at a point on the *page*, 0–1.
 *
 *  Anchored to the document rather than to the mark, which is the rule every
 *  texture in this app follows and the reason it is a rule: two washes that
 *  overlap have to agree about where the paper is low, or the sheet reads as a
 *  pile of separately-textured decals instead of as one sheet.
 *
 *  Two octaves of the same hash — the same shape the painted grain is built
 *  from (see `groundPaint.ts`) — so what the water finds and what the eye sees
 *  are the same paper. A cloth adds its over-and-under on top of that, because
 *  a weave is a real channel for water. */
function bedAt(
  x: number,
  y: number,
  pitch: number,
  pattern: GroundProfile["pattern"],
): number {
  const fibre =
    (octave(x / pitch, y / pitch, 5) * 0.62 +
      octave(x / (pitch * 2), y / (pitch * 2), 9) * 0.5) /
    1.12;
  if (pattern === "cloth") {
    // Warp over weft: the crossings stand proud and the gaps between them hold
    // the water, which is why a wash on canvas prints the weave.
    const warp = 0.5 + 0.5 * Math.cos((x / pitch) * Math.PI * 2);
    const weft = 0.5 + 0.5 * Math.cos((y / pitch) * Math.PI * 2);
    return Math.min(1, fibre * 0.35 + Math.max(warp, weft) * 0.65);
  }
  return fibre;
}

/** Open a field over a patch of page.
 *
 *  `cell` is how much page one cell stands for. It is deliberately coarser than
 *  a device pixel — the whole point of a field is that it is cheap enough to
 *  run a few dozen times a repaint — and the fine detail comes back on top of
 *  it: the sheet's own grain is painted at full resolution under the marks (see
 *  `groundPaint.ts`), and it shows through the wash in proportion to how thin
 *  the wash is. */
export function createField(o: {
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
  ground: GroundProfile;
  granulation: number;
}): WashField {
  const cells = o.width * o.height;
  const bed = new Float32Array(cells);
  const flow = new Float32Array(cells);
  // The pools the sheet holds a wash in are a little coarser than the tooth
  // itself — they are the gaps *between* the grains, which is the same reading
  // the simple engine's mottle makes (see `poolPitch`) — and never finer than
  // a few cells. That floor is not tidiness: a height field that changes every
  // cell is being sampled at its own Nyquist limit, and what granulates out of
  // it is a mosaic of single cells rather than a mottle. Paper does not come
  // in squares the size of the arithmetic.
  const tooth = o.ground.tooth > 0 ? o.ground.tooth * 1.3 : BARE_TOOTH;
  const pitch = Math.max(tooth, o.cell * 3.5);
  const bite = o.ground.tooth > 0 ? Math.min(1, o.ground.bite) : BARE_BITE;
  for (let y = 0; y < o.height; y++) {
    for (let x = 0; x < o.width; x++) {
      const at = y * o.width + x;
      const height =
        bedAt(
          o.x + (x + 0.5) * o.cell,
          o.y + (y + 0.5) * o.cell,
          pitch,
          o.ground.pattern,
        ) * bite;
      bed[at] = height;
      flow[at] = 1 - height * BED_DRAG;
    }
  }
  return {
    width: o.width,
    height: o.height,
    cell: o.cell,
    x: o.x,
    y: o.y,
    water: new Float32Array(cells),
    suspended: new Float32Array(cells),
    deposit: new Float32Array(cells),
    vx: new Float32Array(cells),
    vy: new Float32Array(cells),
    bed,
    flow,
    exposure: new Float32Array(cells),
    pigment: pigmentFor(o.granulation),
    absorbency: Math.max(0, Math.min(1, o.ground.absorbency)),
    nextWater: new Float32Array(cells),
    nextSuspended: new Float32Array(cells),
    // Empty: nothing is wet yet, so the box is the one no cell is inside.
    left: o.width,
    top: o.height,
    right: -1,
    bottom: -1,
  };
}

/** A brushful, landing at a point on the page.
 *
 *  `radius` is in document pixels; `water` and `pigment` are how much of each
 *  goes on per unit of the sheet the head covers. The falloff is deliberately
 *  soft-shouldered rather than a disc: a loaded brush does not have an edge,
 *  and the water past the hair is where the wash gets to spread from. */
export function charge(
  field: WashField,
  px: number,
  py: number,
  radius: number,
  water: number,
  pigment: number,
): void {
  const r = radius / field.cell;
  if (r <= 0) return;
  const cx = (px - field.x) / field.cell - 0.5;
  const cy = (py - field.y) / field.cell - 0.5;
  const from = Math.max(0, Math.floor(cy - r));
  const to = Math.min(field.height - 1, Math.ceil(cy + r));
  const left = Math.max(0, Math.floor(cx - r));
  const right = Math.min(field.width - 1, Math.ceil(cx + r));
  for (let y = from; y <= to; y++) {
    for (let x = left; x <= right; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      if (d >= 1) continue;
      // Flat under the hair with a cosine shoulder at the edge: a loaded brush
      // lays an even film and then tails off, and it matters that it is even —
      // a dome of water dries into a dome of colour, and the whole point of
      // the field is that the rim gets darker than the middle rather than the
      // other way about.
      const load =
        d <= PLATEAU
          ? 1
          : 0.5 + 0.5 * Math.cos(((d - PLATEAU) / (1 - PLATEAU)) * Math.PI);
      const at = y * field.width + x;
      field.water[at] += water * load;
      field.suspended[at] += pigment * load;
    }
  }
  damp(field, left, from, right, to);
}

/** One step of drying.
 *
 *  The order is the order the physics happens in, and swapping any two of them
 *  changes the picture: water cannot carry pigment it has not picked up, and
 *  pigment cannot strand at an edge the water has not yet left. */
export function step(field: WashField): void {
  // Open the box by however far this step can carry water, then work inside it
  // and nowhere else (see `damp`).
  if (field.right < field.left) return;
  damp(
    field,
    Math.max(0, field.left - REACH),
    Math.max(0, field.top - REACH),
    Math.min(field.width - 1, field.right + REACH),
    Math.min(field.height - 1, field.bottom + REACH),
  );
  expose(field);
  accelerate(field);
  transport(field);
  creep(field);
  settle(field);
  dry(field);
}

/** How exposed each cell is: what share of the paper around it is dry.
 *
 *  Nought in the middle of a pool, one at a damp speck on its own, and
 *  somewhere between at the wet edge. It is the one number the two mechanisms
 *  that make a watercolour edge both read — the perimeter dries fastest
 *  (`dry`) and the water inside runs out to replace what left (`transport`) —
 *  so it is measured once a step rather than twice. */
function expose(field: WashField): void {
  const { width, height, water, exposure } = field;
  for (let y = field.top; y <= field.bottom; y++) {
    for (let x = field.left; x <= field.right; x++) {
      const at = y * width + x;
      if (water[at]! <= DRY) {
        exposure[at] = 1;
        continue;
      }
      let wet = 0;
      let neighbours = 0;
      if (x > 0) {
        neighbours++;
        if (water[at - 1]! > DRY) wet++;
      }
      if (x < width - 1) {
        neighbours++;
        if (water[at + 1]! > DRY) wet++;
      }
      if (y > 0) {
        neighbours++;
        if (water[at - width]! > DRY) wet++;
      }
      if (y < height - 1) {
        neighbours++;
        if (water[at + width]! > DRY) wet++;
      }
      exposure[at] = neighbours > 0 ? 1 - wet / neighbours : 1;
    }
  }
}

/** Which way the water is running: downhill on the surface it makes with the
 *  paper, plus however much of last step's motion survived.
 *
 *  Velocity lives on the **faces between cells**, not in the middle of them —
 *  `vx[i]` is how fast water is crossing from `i` to the cell on its right —
 *  and that is not a detail. A velocity in the middle of a cell has to be read
 *  off its two neighbours, which means it cannot see the cell it belongs to at
 *  all; a pattern that alternates cell by cell is then invisible to the scheme
 *  and grows unopposed, and what comes out is a wash with a chequerboard woven
 *  through it. Putting the velocity on the face it describes ties it to the
 *  two cells either side of it, and the chequerboard has nowhere to hide. */
function accelerate(field: WashField): void {
  const { width, height, water, bed, vx, vy, flow } = field;
  for (let y = field.top; y <= field.bottom; y++) {
    for (let x = field.left; x <= field.right; x++) {
      const at = y * width + x;
      const held = water[at]!;
      const here = bed[at]! * BED_DEPTH + held;
      if (x < width - 1) {
        const to = at + 1;
        const there = water[to]!;
        if (held > DRY || there > DRY) {
          const mob = flow[at]! < flow[to]! ? flow[at]! : flow[to]!;
          const slope = here - (bed[to]! * BED_DEPTH + there);
          vx[at] = (vx[at]! + slope * PUSH) * DAMPING * mob;
        } else vx[at] = 0;
      } else vx[at] = 0;
      if (y < height - 1) {
        const to = at + width;
        const there = water[to]!;
        if (held > DRY || there > DRY) {
          const mob = flow[at]! < flow[to]! ? flow[at]! : flow[to]!;
          const slope = here - (bed[to]! * BED_DEPTH + there);
          vy[at] = (vy[at]! + slope * PUSH) * DAMPING * mob;
        } else vy[at] = 0;
      } else vy[at] = 0;
    }
  }
}

/** Move the water, and move the pigment with it.
 *
 *  Written as an exchange between neighbouring *pairs* rather than as an
 *  outflow per cell, which is what makes it conserve water exactly: whatever
 *  one cell loses, the cell beside it gains, and there is no third place for a
 *  rounding error to go. Pigment rides at the concentration of wherever the
 *  water came from — that is the whole of "the pigment only goes where the
 *  water took it". */
function transport(field: WashField): void {
  const { width, water, suspended, bed, vx, vy, flow } = field;
  const nextWater = field.nextWater;
  const nextSuspended = field.nextSuspended;
  const from0 = spanFrom(field);
  const to0 = spanTo(field);
  copySpan(nextWater, water, from0, to0);
  copySpan(nextSuspended, suspended, from0, to0);

  const exposure = field.exposure;
  // One face of the lattice: however much water wants to cross it, bounded by
  // what either side has to give, moved — with the pigment it was carrying.
  //
  // Written as an exchange between the *pair* rather than as an outflow from
  // the cell, which is what makes it conserve water exactly: whatever one loses
  // the other gains, and there is no third place for a rounding error to go.
  const cross = (from: number, to: number, drop: number, drift: number) => {
    const here = water[from]!;
    const there = water[to]!;
    // Two dry cells have nothing to exchange, however the paper tilts between
    // them: whichever way the flow would go, the side it would come off holds
    // no water and the transfer is refused below. Saying so here rather than
    // there is the same arithmetic and skips the rest of it.
    if (here <= DRY && there <= DRY) return;
    // Water running out to the perimeter to replace what evaporated there.
    // This is the coffee-ring, and it is what makes a wash dry darkest at its
    // edge: the rim is where the water is leaving, so the rim is where the
    // water goes, and the pigment it was carrying is left standing there when
    // it does.
    const pump =
      here > DRY && there > DRY
        ? (exposure[to]! - exposure[from]!) * PUMP * here
        : 0;
    const wanted =
      (drop * PRESSURE + drift * ADVECTION) * flow[from]! * flow[to]! + pump;
    const amount =
      wanted > 0
        ? Math.min(wanted, here * FLOW_CAP)
        : Math.max(wanted, -there * FLOW_CAP);
    if (amount === 0) return;
    const source = amount > 0 ? from : to;
    const sink = amount > 0 ? to : from;
    const size = amount > 0 ? amount : -amount;
    const held = water[source]!;
    if (held <= DRY) return;
    const carried = Math.min(
      suspended[source]!,
      (suspended[source]! / held) * size,
    );
    nextWater[source]! -= size;
    nextWater[sink]! += size;
    nextSuspended[source]! -= carried;
    nextSuspended[sink]! += carried;
  };

  for (let y = field.top; y <= field.bottom; y++) {
    for (let x = field.left; x <= field.right; x++) {
      const at = y * width + x;
      const here = bed[at]! * BED_DEPTH + water[at]!;
      if (x < width - 1) {
        const to = at + 1;
        // Both terms read the *same face*: the slope across it, and the speed
        // the water is already crossing it at.
        cross(at, to, here - (bed[to]! * BED_DEPTH + water[to]!), vx[at]!);
      }
      if (y < field.height - 1) {
        const to = at + width;
        cross(at, to, here - (bed[to]! * BED_DEPTH + water[to]!), vy[at]!);
      }
    }
  }
  copySpan(water, nextWater, from0, to0);
  copySpan(suspended, nextSuspended, from0, to0);
}

/** The run of cells the damp box covers, as one contiguous slice of the arrays
 *  — whole rows, with a row of margin either side so a transfer off the box's
 *  own edge lands inside the copy rather than outside it.
 *
 *  The scratch arrays are only ever right within it, which is why every copy in
 *  and out of them goes through the same pair of numbers. */
function spanFrom(field: WashField): number {
  return Math.max(0, field.top - 1) * field.width;
}

function spanTo(field: WashField): number {
  return Math.min(field.height, field.bottom + 2) * field.width;
}

function copySpan(
  into: Float32Array,
  from: Float32Array,
  at: number,
  to: number,
): void {
  into.set(from.subarray(at, to), at);
}

/** Capillary creep: water wicking sideways into paper that is merely damp,
 *  ahead of anything that is flowing.
 *
 *  It is what makes a wet edge on cold-pressed paper *fray* — the water finds
 *  the low fibres and runs along them a little way past where the brush
 *  stopped, leaving a fringe rather than a cut. On a sealed sheet, which drinks
 *  nothing, there is no creep and the edge stays where the water put it. */
function creep(field: WashField): void {
  if (field.absorbency <= 0) return;
  const { width, water, suspended, bed } = field;
  const nextWater = field.nextWater;
  const nextSuspended = field.nextSuspended;
  const from0 = spanFrom(field);
  const to0 = spanTo(field);
  copySpan(nextWater, water, from0, to0);
  copySpan(nextSuspended, suspended, from0, to0);
  const rate = CAPILLARY * field.absorbency;
  for (let y = field.top; y <= field.bottom; y++) {
    for (let x = field.left; x <= field.right; x++) {
      const at = y * width + x;
      const held = water[at]!;
      if (held <= DRY) continue;
      const conc = suspended[at]! / held;
      const wick = (to: number) => {
        const gap = held - water[to]!;
        if (gap <= 0) return;
        // Into the low ground first: a fringe follows the sheet's valleys,
        // which is what makes it a fringe rather than a halo.
        // Capped against what the cell has *left* rather than what it started
        // the step with, so four neighbours wicking from the same puddle can
        // never between them take more water than is in it.
        const given = Math.min(
          Math.max(0, nextWater[at]!) * FLOW_CAP,
          gap * rate * (1 - bed[to]! * 0.8),
        );
        if (given <= 0) return;
        nextWater[at]! -= given;
        nextWater[to]! += given;
        // The pigment goes with a share of it, but not all: what wicks into
        // the fibre is mostly water, which is exactly why the fringe of a wash
        // is paler than the wash and the rim between them is not.
        const carried = Math.min(nextSuspended[at]!, conc * given * 0.45);
        nextSuspended[at]! -= carried;
        nextSuspended[to]! += carried;
      };
      if (x > 0) wick(at - 1);
      if (x < width - 1) wick(at + 1);
      if (y > 0) wick(at - width);
      if (y < field.height - 1) wick(at + width);
    }
  }
  copySpan(water, nextWater, from0, to0);
  copySpan(suspended, nextSuspended, from0, to0);
}

/** Pigment out of the water and onto the sheet, and a little of it back again.
 *
 *  The granulation term is the whole of the mottle: a heavy pigment settles
 *  faster where the sheet is low and hardly at all where it stands proud, so
 *  the valleys come out dark and the ridges pale. A staining one ignores the
 *  paper's shape entirely and simply fixes wherever it is — which is what makes
 *  phthalo dry flat and ultramarine dry speckled on the same sheet.
 *
 *  Pigment also drifts a little through still water on its own (`diffusion`),
 *  which is what softens a wet-in-wet edge into the next colour rather than
 *  leaving the two sitting against each other. */
function settle(field: WashField): void {
  const { width, height, water, suspended, deposit, bed, pigment } = field;
  const next = field.nextSuspended;
  const from0 = spanFrom(field);
  const to0 = spanTo(field);
  copySpan(next, suspended, from0, to0);
  const spread = pigment.diffusion * 0.25;
  // Pigment drifting through still water, written as an exchange between
  // neighbouring pairs for the reason the flow above is: whatever one cell
  // loses the cell beside it gains, so a wash cannot quietly gain or lose
  // colour over the dozens of steps it takes to dry.
  if (spread > 0) {
    for (let y = field.top; y <= field.bottom; y++) {
      for (let x = field.left; x <= field.right; x++) {
        const at = y * width + x;
        if (water[at]! <= DRY) continue;
        if (x < width - 1 && water[at + 1]! > DRY) {
          const drift = (suspended[at]! - suspended[at + 1]!) * spread * 0.25;
          next[at]! -= drift;
          next[at + 1]! += drift;
        }
        if (y < height - 1 && water[at + width]! > DRY) {
          const drift =
            (suspended[at]! - suspended[at + width]!) * spread * 0.25;
          next[at]! -= drift;
          next[at + width]! += drift;
        }
      }
    }
  }
  // …and a heavy pigment rolling down the paper's slope while it is still in
  // the water. This is granulation, and it has to be a *movement* rather than
  // a settling rate: every grain ends up on the sheet whatever rate it settles
  // at, so a rate alone changes when the mark dries and not what it looks like.
  // What makes ultramarine mottle and phthalo not is that ultramarine is a
  // ground rock in a puddle — it goes to the bottom of wherever it is, and the
  // bottom of a sheet of paper is its valleys.
  const roll = pigment.granulation * ROLLING;
  if (roll > 0) {
    for (let y = field.top; y <= field.bottom; y++) {
      for (let x = field.left; x <= field.right; x++) {
        const at = y * width + x;
        if (water[at]! <= DRY) continue;
        if (x < width - 1 && water[at + 1]! > DRY) {
          const slope = bed[at]! - bed[at + 1]!;
          const down = slope * roll;
          const moved = down > 0 ? next[at]! * down : next[at + 1]! * down;
          next[at]! -= moved;
          next[at + 1]! += moved;
        }
        if (y < height - 1 && water[at + width]! > DRY) {
          const slope = bed[at]! - bed[at + width]!;
          const down = slope * roll;
          const moved = down > 0 ? next[at]! * down : next[at + width]! * down;
          next[at]! -= moved;
          next[at + width]! += moved;
        }
      }
    }
  }
  for (let at = from0; at < to0; at++) {
    const held = water[at]!;
    if (held <= DRY) continue;
    // Low ground holds what settles; a ridge sheds it. At `granulation = 0`
    // the term is 1 everywhere and the sheet's shape stops mattering.
    const valley = 1 + pigment.granulation * (1 - bed[at]! * 2);
    // …and it settles out of a thin film far faster than out of a puddle,
    // which is the other half of why a wash dries darkest at its rim. Colour
    // in deep water stays up and travels; colour in the last damp millimetre
    // at the edge has nowhere to be but on the paper.
    const thin = 1 / (1 + held * SHALLOW);
    const down = next[at]! * SETTLING * Math.max(0, valley) * thin;
    // What lifts again is what is *exposed*: pigment sitting on a ridge is
    // taken back up by the water going past it, pigment that has dropped into
    // a valley is out of the current. Without that the lifting would quietly
    // undo the granulation — every speck settled in the low ground would be
    // picked up again and spread evenly, and a heavy pigment would come out
    // smoother than a staining one, which is precisely backwards.
    const up =
      deposit[at]! *
      LIFTING *
      (1 - pigment.staining) *
      Math.min(1, held) *
      Math.max(0, 2 - valley);
    next[at]! += up - down;
    deposit[at]! += down - up;
  }
  copySpan(suspended, next, from0, to0);
}

/** The water leaving: into the air at the edges, into the fibre everywhere.
 *
 *  The edge term is the rim, and it is measured rather than drawn — a cell
 *  surrounded by wet cells is the middle of a pool and a cell with dry
 *  neighbours is its perimeter, so the perimeter dries first however the wash
 *  happens to be shaped. When a cell finally goes dry, whatever it was still
 *  carrying is stranded there, which is what puts the pigment at the edge. */
function dry(field: WashField): void {
  const { width, water, suspended, deposit } = field;
  // …and, on the way past, where the water still *is*. Drying is the one pass
  // that visits every damp cell and knows which of them survived it, so it is
  // the one that can hand the next step a box drawn round what is left rather
  // than round everywhere the wash has ever been (see `damp`). A sweep that has
  // dried behind itself then costs its wet edge instead of its whole bounding
  // box, and a mark that has dried out entirely costs nothing at all.
  let stillLeft = width;
  let stillTop = field.height;
  let stillRight = -1;
  let stillBottom = -1;
  for (let y = field.top; y <= field.bottom; y++) {
    for (let x = field.left; x <= field.right; x++) {
      const at = y * width + x;
      const held = water[at]!;
      if (held <= DRY) {
        // Already dry, or down to the rounding dust a step of exchanges leaves
        // behind. Either way there is no water here any more, and what it was
        // carrying stays where it stands.
        if (held !== 0) water[at] = 0;
        if (suspended[at]! !== 0) {
          deposit[at]! += suspended[at]!;
          suspended[at] = 0;
        }
        continue;
      }
      const exposed = field.exposure[at]!;
      const gone =
        EVAPORATION * (1 + exposed * EDGE_EVAPORATION) +
        ABSORPTION * field.absorbency;
      const left = held - gone;
      if (left > DRY) {
        water[at] = left;
        if (x < stillLeft) stillLeft = x;
        if (x > stillRight) stillRight = x;
        if (y < stillTop) stillTop = y;
        if (y > stillBottom) stillBottom = y;
        continue;
      }
      // Dry. What the water was still holding has nowhere to go.
      water[at] = 0;
      deposit[at]! += suspended[at]!;
      suspended[at] = 0;
    }
  }
  field.left = stillLeft;
  field.top = stillTop;
  field.right = stillRight;
  field.bottom = stillBottom;
}

/** Run the field to dryness and hand back what is on the sheet.
 *
 *  Anything still in suspension when the steps run out is put down where it is:
 *  a wash that has not finished drying is not a thing this app can show, since
 *  a repaint has to produce the same page every time (see the note at the top).
 *  The array is the field's own — it is read once, into pixels, and thrown
 *  away with the field. */
export function density(field: WashField): Float32Array {
  const { deposit, suspended } = field;
  for (let at = 0; at < deposit.length; at++) {
    deposit[at]! += suspended[at]!;
    suspended[at] = 0;
  }
  return deposit;
}
