// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Watercolour.
//
// Every other painter in this app lays *stuff* on paper — graphite flakes, wax,
// atomised lacquer, a slab of body colour scratched through by hair. Watercolour
// is the one medium where what you are really painting with is **water**, and
// the pigment only goes where the water took it. Get that one fact into the
// mark and the rest of the medium falls out of it; miss it and you have a
// translucent airbrush.
//
// So the model here is a wet stroke drying on a sheet, and it is built out of
// the four things that actually happen while it does. Every one of them is
// visible on any watercolour you can find, and none of them is a filter:
//
//   - **The water spreads past the hair.** A charged brush puts down more water
//     than pigment, and the water runs on into the sheet ahead of it. So the
//     wash is wider than the head that laid it, its two sides wander
//     *independently* — a wet edge follows the paper, not the gesture — and how
//     far it goes is the `water` dial. This is the difference between a
//     watercolour mark and a painted one, and it is why the outline is the last
//     thing here that is allowed to look deliberate.
//
//   - **The rim dries darkest.** A pool of water evaporates fastest at its
//     edge, and the pigment travels out to replace what left, so a wash that
//     dries undisturbed is pale in the middle with a hard dark line all round
//     it. That line is the single most recognisable thing about the medium —
//     it is what makes a flat wash look laid rather than airbrushed — and it is
//     the reason this painter strokes its own outline after filling it.
//
//   - **Pigment settles into the tooth.** Heavy earths and mineral colours
//     (ultramarine, the umbers, the oxides) sink into the sheet's valleys and
//     leave its peaks pale, which is the mottle a watercolourist means by
//     *granulation*. It reads at a coarser pitch than the crayon's or the
//     pencil's, because it is not the grain itself but the pools between them.
//
//   - **Nothing covers.** Watercolour has no white; the sheet is the white, and
//     every layer is a filter over what is under it. So the wash goes down in
//     thin passes at low alpha, and passing twice over the same place really is
//     twice the colour — glazing, which is how the medium is actually worked.
//
// It shares the rules the rest of `plugins/` follows: painting is a pure
// function of the stroke, every wobble and speck is hashed off the position
// rather than drawn at random (so the same wash dries the same way on every
// repaint and in the exported PNG), and detail finer than a device pixel is not
// drawn at all (see `PaintDetail`).

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Point } from "../types.ts";
import { mm } from "../units.ts";
import {
  HAIRLINE,
  PIXEL,
  driftNoise,
  hashedRandom,
  normalAt,
  trace,
  type Trace,
} from "./grain.ts";
import { paintPath } from "./ink.ts";

/** The pitch of the pools the sheet holds a wash in, in document pixels.
 *
 *  Deliberately coarser than the tooth the pencil and the crayon read (a tenth
 *  and a fifth of a millimetre): granulation is not the grain, it is the
 *  *puddles between the grains*, and they are a good deal bigger than the
 *  ridges that make them. Rough watercolour stock mottles at about this
 *  spacing, which is why the effect reads across a room and a pencil's speckle
 *  does not.
 *
 *  This is the pitch on a page with no sheet under it — the solid digital one.
 *  A drawing on real stock pools at its own tooth instead (see `poolPitch`). */
const POOL = mm(0.7);

/** The most pools one wash will ever be drawn from. A page-wide sweep with a
 *  mop would otherwise ask for hundreds of thousands; past this the lattice is
 *  coarsened instead, which costs the mottle some fineness and keeps the page
 *  at frame rate. */
const POOL_BUDGET = 9000;

/** How much of the ink one pass of a wash lays down.
 *
 *  Low, and that is the medium: watercolour is a stain, not a coat. The number
 *  matters because it is what makes a second pass *visible* — at 0.85 a wash is
 *  a flat colour that glazing cannot deepen, and at 0.1 nobody can see the
 *  first stroke they made. A third is about where a real one-pass wash of a
 *  strong colour lands against the white of the sheet. */
const WASH = 0.34;

/** How much darker the dried rim is than the wash inside it. A little over half
 *  again: enough to draw the shape, never enough to read as an outline someone
 *  drew round it. */
const RIM = 0.55;

/** How far the water carries past the hair at `water = 1`, as a share of the
 *  head's half-width. A charged brush on damp paper does rather more than this;
 *  the dial goes to 2. */
const SPREAD = 0.22;

/** One side of the wet edge at a point: how far out the water reached.
 *
 *  Two independent readings of the same drift noise, one per side, which is the
 *  whole trick. A width that wobbles symmetrically is a sausage — the two edges
 *  mirror each other and the eye reads the centreline as a drawn path. Water
 *  does not know where the centreline is: it finds the low side of the sheet
 *  and goes there, so one edge can bulge while the other holds straight. */
function wetEdge(
  at: number,
  size: number,
  water: number,
  seed: number,
): number {
  // Undulating on the scale of the brush that laid it — a wash from a #8 round
  // wanders in half-centimetre bays, one from a rigger in millimetre ones.
  //
  // Three octaves at periods that are not multiples of one another, because two
  // were not enough: an edge built from a couple of slow waves comes out
  // *faceted*, with a visible corner wherever the noise turns, and a corner is
  // the one thing water never leaves behind. The third fills those in.
  const slow = driftNoise(at / Math.max(mm(1.2), size * 1.3), seed) - 0.5;
  const mid = driftNoise(at / Math.max(mm(0.5), size * 0.47), seed + 17) - 0.5;
  const quick =
    driftNoise(at / Math.max(mm(0.22), size * 0.19), seed + 41) - 0.5;
  return 1 + (slow * 0.46 + mid * 0.2 + quick * 0.1) * water;
}

/** Round an edge off over a couple of samples.
 *
 *  Water has surface tension: it does not turn a corner. Even with the octaves
 *  above, the outline is sampled every few pixels and the fill is closed
 *  through those points, so any kink in the noise arrives as a vertex. A short
 *  moving average over the *distances* — not over the positions, which would
 *  drag the wash off the gesture — takes those out and leaves the bays. */
function ease(edge: Float64Array): void {
  const count = edge.length;
  if (count < 5) return;
  const smoothed = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const k = Math.min(2, i, count - 1 - i);
    let sum = 0;
    for (let j = i - k; j <= i + k; j++) sum += edge[j]!;
    smoothed[i] = sum / (k * 2 + 1);
  }
  edge.set(smoothed);
}

/** Trace the two sides of a wash into the current path: out along one edge and
 *  back along the other, closed at both ends.
 *
 *  The whole wash is one closed path filled once, which is what keeps a stroke
 *  that doubles back over itself from printing a dark seam where it crossed —
 *  a translucent medium is exactly where such a seam shows.
 *
 *  **Curved through the midpoints, never joined corner to corner.** The edges
 *  are sampled every few pixels and a wet one drawn as a chain of straights
 *  comes out faceted, which is the one shape water never leaves. It costs
 *  nothing — the same points, one curve each — and it is the same smoothing the
 *  paint bucket gives its traced outline (see `paintRegion`). */
function pool(
  ctx: CanvasRenderingContext2D,
  along: readonly Trace[],
  nxs: Float64Array,
  nys: Float64Array,
  left: Float64Array,
  right: Float64Array,
  grow: number,
): void {
  const count = along.length;
  // The rim, out along one side and back along the other.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = along[i]!;
    const out = left[i]! + grow;
    xs.push(p.x + nxs[i]! * out);
    ys.push(p.y + nys[i]! * out);
  }
  for (let i = count - 1; i >= 0; i--) {
    const p = along[i]!;
    const out = right[i]! + grow;
    xs.push(p.x - nxs[i]! * out);
    ys.push(p.y - nys[i]! * out);
  }
  const n = xs.length;
  const midX = (a: number, b: number) => (xs[a]! + xs[b]!) / 2;
  const midY = (a: number, b: number) => (ys[a]! + ys[b]!) / 2;
  ctx.beginPath();
  ctx.moveTo(midX(n - 1, 0), midY(n - 1, 0));
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    ctx.quadraticCurveTo(xs[i]!, ys[i]!, midX(i, next), midY(i, next));
  }
  ctx.closePath();
}

/** How coarse to work the mottle at: the sheet's own pools, or the device pixel
 *  once the view is pulled back far enough that they are finer than one. A wash
 *  big enough to blow the budget coarsens by exactly the factor that brings it
 *  back inside. */
function poolCell(
  length: number,
  size: number,
  scale: number,
  pitch = POOL,
): number {
  const cell = Math.max(pitch, PIXEL / scale);
  const wanted = ((length + size) * (size + 2 * cell)) / (cell * cell);
  if (wanted <= POOL_BUDGET) return cell;
  return cell * Math.sqrt(wanted / POOL_BUDGET);
}

/** How far apart the sheet's puddles are, in document pixels — its own tooth,
 *  a little coarser, because the pools are the gaps *between* the grains.
 *
 *  A page with no sheet under it keeps the pitch this painter has always used,
 *  so a wash on the solid digital page mottles exactly as it did before grounds
 *  existed. */
function poolPitch(ground: GroundProfile): number {
  return ground.tooth > 0 ? ground.tooth * 1.3 : POOL;
}

/** A wash.
 *
 *  `water` is how charged the brush is: it widens the mark past the hair,
 *  loosens both its edges, and dilutes what is left in the middle. `pigment` is
 *  how much colour is in that water — the difference between a tint you can
 *  read a pencil line through and a full-strength stain. `granulation` is the
 *  *colour*: 0 is a phthalo that stays in solution, high is a heavy earth that
 *  drops out of it.
 *
 *  `ground` is the **sheet**, and it is the other half of both of those. A
 *  thirsty stock pulls the water further past the hair than the dial asked for;
 *  a toothy one gives the pigment somewhere to settle, at the pitch of its own
 *  grain. On the solid digital page — a ground that drinks nothing and has no
 *  tooth — every one of those factors is exactly 1, so a wash painted there is
 *  pixel-for-pixel the wash this painter has always laid. */
export function paintWash(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  water = 1,
  pigment = 1,
  granulation = 0.6,
  ground: GroundProfile = SOLID_GROUND,
): void {
  const alpha = ctx.globalAlpha;
  const soak = Math.max(0, Math.min(1, ground.absorbency));
  // The sheet drinks: the same charge of water on cold-pressed paper runs
  // further than it does on a sealed surface, and on newsprint it runs away.
  const wet = Math.max(0, Math.min(2.4, water * (1 + soak * 0.6)));
  const load = Math.max(0.1, Math.min(2, pigment));
  const half = size / 2;
  // How wide the water actually got, and how wide the mark comes out on the
  // device it is bound for.
  const reach = half * (1 + SPREAD * wet);
  const onScreen = reach * 2 * scale;

  if (onScreen < HAIRLINE) {
    // Pulled back far enough that the whole wash is inside a pixel. A stain
    // that small is a line — painted at the weight the wash would have dried
    // to, so a page does not lighten as you zoom out of it.
    ctx.save();
    ctx.globalAlpha = alpha * Math.min(1, WASH * load * 1.8);
    paintPath(ctx, points, reach * 2);
    ctx.restore();
    return;
  }

  // Sampled at a fraction of the head — a wet edge is a slow curve, and there
  // is nothing in a wash that needs resolving finer than the screen can show.
  const spacing = Math.max(PIXEL / scale, Math.min(Math.max(1, size / 5), 9));
  const along = trace(points, spacing);
  const count = along.length;
  if (count === 0) return;

  if (count < 2) {
    // A touch of the brush: a blot, not a disc. Wet paper takes the shape of
    // the sheet under it, so the one thing it must not be is a circle.
    const p = along[0] ?? points[0];
    if (!p) return;
    ctx.save();
    ctx.globalAlpha = alpha * WASH * load;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r =
        reach *
        (0.86 + hashedRandom(Math.cos(a) * 8, Math.sin(a) * 8, 3) * 0.3);
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  const total = along[count - 1]!.at;
  const nxs = new Float64Array(count);
  const nys = new Float64Array(count);
  const left = new Float64Array(count);
  const right = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const p = along[i]!;
    const { nx, ny } = normalAt(along, i);
    nxs[i] = nx;
    nys[i] = ny;
    // The two ends. A brush loaded with water lands and lifts *wet*, so the
    // mark rounds off rather than stopping — but only over a head-width or so,
    // because the hand did stop somewhere and a wash that tapers for half its
    // length is a leaf.
    const ends = Math.min(reach, total / 2);
    const cap = Math.sqrt(
      Math.max(
        0.12,
        Math.min(1, Math.min(p.at, total - p.at) / Math.max(1, ends)),
      ),
    );
    // A wash does not hold one width: water pushes ahead where the sheet dips
    // and holds back where it rises, and the hand slowing down leaves more of
    // both behind. Speed thins it for the same reason a dry brush thins.
    const flow = 1 / (1 + (p.speed / 90) * wet);
    left[i] = reach * cap * flow * wetEdge(p.at, size, wet, 5);
    right[i] = reach * cap * flow * wetEdge(p.at, size, wet, 71);
  }
  ease(left);
  ease(right);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1. The water that ran on ahead of the pigment. A pale skirt past the wash
  //    proper, and the reason a watercolour edge never looks cut. It is only
  //    there when the brush was charged enough to have one, and never when it
  //    would be thinner than a device pixel.
  const bleed = half * SPREAD * wet * 0.8;
  if (bleed * scale >= PIXEL) {
    ctx.globalAlpha = alpha * WASH * load * 0.28;
    pool(ctx, along, nxs, nys, left, right, bleed);
    ctx.fill();
  }

  // 2. The wash itself, thin — this is a stain, and a second pass over it has
  //    to be able to deepen it.
  ctx.globalAlpha = alpha * WASH * load;
  pool(ctx, along, nxs, nys, left, right, 0);
  ctx.fill();

  // 3. The rim, dried dark. Stroked on the same path the fill just closed, so
  //    it follows every bay of the wet edge — an outline that agreed with the
  //    gesture rather than with the water would undo the whole of step 1.
  //    Thinner and harder than the wash, because it is where the pigment ended
  //    up and not where it was laid.
  const rim = Math.max(PIXEL / scale, Math.min(mm(0.35), size * 0.07));
  if (rim * scale >= HAIRLINE * 0.8) {
    ctx.globalAlpha = alpha * WASH * load * RIM;
    ctx.lineWidth = rim;
    ctx.stroke();
  }

  // 4. …and the pigment that pooled inside it. A narrower ribbon at the same
  //    thin alpha, wandering within the wash: the medium's own unevenness,
  //    which is what separates a laid wash from a flat fill. It is glazing
  //    against itself — the same trick a real one is, one layer over another.
  ctx.globalAlpha = alpha * WASH * load * 0.42;
  const inner = new Float64Array(count);
  const innerRight = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const at = along[i]!.at;
    // Two periods rather than one, so the gathered pigment wanders instead of
    // pulsing: a spine of even width down the middle of a wash is the one
    // thing in it that looks extruded.
    const gather =
      0.22 +
      driftNoise(at / Math.max(mm(2), size * 2.2), 41) * 0.45 +
      driftNoise(at / Math.max(mm(0.7), size * 0.7), 83) * 0.25;
    inner[i] = left[i]! * gather;
    innerRight[i] = right[i]! * gather;
  }
  pool(ctx, along, nxs, nys, inner, innerRight, 0);
  ctx.fill();

  ctx.restore();

  // The mottle, when the mark has room for one. A wash a few device pixels
  // across cannot show a pool: what it would get instead is one dab per sample
  // covering the whole width, which is not a texture, it is a second coat.
  // Pigment only settles where the sheet has somewhere to hold it, so the
  // tooth multiplies what the colour would do on its own — barely anything on
  // hot-pressed, close to double on rough.
  const mottle = granulation * (1 + ground.bite * 1.2);
  if (mottle > 0.02 && onScreen >= MOTTLE_FLOOR) {
    granulate(ctx, along, left, right, nxs, nys, {
      alpha: alpha * WASH * load,
      strength: Math.min(2, mottle),
      cell: poolCell(total, size, scale, poolPitch(ground)),
      scale,
    });
  }
}

/** How wide the wash has to come out on screen, in device pixels, before its
 *  mottle is worth drawing. Below it the pools are wider than the mark and the
 *  speckle is a flat second coat. */
const MOTTLE_FLOOR = 5;

/** The mottle: pigment settled into the sheet's pools.
 *
 *  Drawn as squarish dabs on a lattice anchored to the *page* rather than to
 *  the mark, which is the same rule the crayon's and the pencil's grain follow
 *  and for the same reason: two washes that overlap have to agree about where
 *  the paper is low, or the sheet reads as a pile of separately-textured
 *  decals instead of as one sheet.
 *
 *  Only inside the wash, and fading out towards its edges — a rim that is
 *  already the darkest part of the mark does not need speckling as well. */
function granulate(
  ctx: CanvasRenderingContext2D,
  along: readonly Trace[],
  left: Float64Array,
  right: Float64Array,
  nxs: Float64Array,
  nys: Float64Array,
  o: { alpha: number; strength: number; cell: number; scale: number },
): void {
  // …and never a lattice coarser than the wash is wide, for the same reason.
  const span = Math.max(...left, ...right);
  if (o.cell > span) return;
  ctx.save();
  ctx.globalAlpha = o.alpha * 0.36 * o.strength;
  ctx.beginPath();
  const step = Math.max(1, Math.round(o.cell / Math.max(0.5, along[1]!.at)));
  for (let i = 0; i < along.length; i += step) {
    const p = along[i]!;
    const span = Math.max(left[i]!, right[i]!);
    // Across the wash in whole cells, so neighbouring samples land on the same
    // lattice and the dabs join into pools rather than into a comb.
    const lanes = Math.max(1, Math.round((span * 2) / o.cell));
    for (let n = 0; n <= lanes; n++) {
      const across = (n / lanes - 0.5) * 2;
      const out = across * (across < 0 ? right[i]! : left[i]!);
      const x = p.x + nxs[i]! * out;
      const y = p.y + nys[i]! * out;
      const gx = Math.floor(x / o.cell);
      const gy = Math.floor(y / o.cell);
      // How deep the sheet is here — two octaves, so the mottle clumps into
      // patches instead of reading as static.
      const dip =
        hashedRandom(gx, gy, 13) * 0.7 +
        hashedRandom(gx >> 1, gy >> 1, 19) * 0.5;
      // Only the deepest pools hold enough to show, and none of them right at
      // the edge, where the rim has already taken the pigment.
      if (dip < 0.74) continue;
      if (Math.abs(across) > 0.86) continue;
      // Small, and wildly uneven: pigment settles in specks and clots, and a
      // field of same-sized discs reads as bubbles rather than as a sheet of
      // paper with colour caught in it.
      const grit = hashedRandom(gx, gy, 3);
      const r = o.cell * (0.07 + (dip - 0.74) * 0.5 + grit * grit * 0.16);
      // Nudged off the lattice, so a mottled passage reads as pigment settling
      // rather than as graph paper — the same trick the pencil's grain uses.
      const px = (gx + 0.5 + (hashedRandom(gx, gy, 7) - 0.5) * 0.95) * o.cell;
      const py = (gy + 0.5 + (hashedRandom(gx, gy, 11) - 0.5) * 0.95) * o.cell;
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}
