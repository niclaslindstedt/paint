// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting a stroke with the wet field.
//
// `washField.ts` knows about water and paper and nothing else. This is the part
// that knows about a *gesture*: it opens a field over the patch of page the
// mark can reach, walks the path laying water and pigment into it, runs the
// field until the sheet is dry, and turns what settled into pixels.
//
// Three things about it are worth knowing before reading it.
//
// **The stroke is laid down over time.** The path is split into a handful of
// chunks and the field is stepped between them, so the beginning of a long
// sweep has already started drying by the time the end of it lands. That is not
// a flourish — it is where the blooms come from. Water arriving on paper that
// is damp and still carrying pigment surges outwards and shoves that pigment
// ahead of it, and a stroke that crosses its own earlier part gets exactly the
// cauliflower a real one would. Painted all at once there is no "earlier" and
// no bloom.
//
// **The result is composited, not blitted.** What the field hands back is an
// amount of pigment per cell, and pigment is not a colour — it is something
// light has to get through. So each cell is turned into a transmittance
// (`colour ^ density`, which is Beer–Lambert with the ink's own colour standing
// in for its absorption spectrum) and then into the colour-and-alpha pair that
// composites to the same thing. Under the `multiply` blending a wet mark on
// absorbent paper already uses (see `ground.ts`) that is exact: the page comes
// out as `page × transmittance`, which is what a glaze *is*. Over a white sheet
// with ordinary compositing it is exact too. That is why doubling a wash
// deepens it towards the colour instead of towards black.
//
// **It can always say no.** No DOM, no canvas, a mark too small to be worth a
// field, a page-wide sweep whose cells would be wider than the brush: every one
// of those returns `false`, and the caller paints the mark with the simple
// engine instead (see `wash.ts`). A browser that cannot run the simulation must
// still open every drawing and paint every mark.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import { mm } from "../units.ts";
import {
  charge,
  createField,
  density,
  step,
  type WashField,
} from "./washField.ts";
import { HAIRLINE, PIXEL, trace } from "./grain.ts";

/** How much page one cell of the field stands for, at 1:1.
 *
 *  Coarser than a device pixel on purpose: the field is the *wet* part of the
 *  picture, and wet has no fine detail in it — the fine detail is the sheet's
 *  own grain, which is painted at full resolution underneath and shows through
 *  (see `groundPaint.ts`). A sixth of a millimetre keeps a #8 round's mark
 *  about forty cells across — enough for a rim, a bloom and a mottle to be
 *  three separate things — and keeps a wash at roughly a hundredth of a second
 *  to dry rather than several. */
const PITCH = mm(0.17);

/** The most cells one mark will ever be simulated at. A page-wide sweep would
 *  otherwise ask for millions; past this the field is coarsened instead, which
 *  costs the wash some fineness and keeps the page at frame rate. */
const BUDGET = 12_000;

/** How many cells the brush has to be across before a field is worth running.
 *  Below it the simulation has nothing to resolve — the head is a cell wide —
 *  and the simple engine draws a better mark than a two-pixel puddle. */
const LEAST_HEAD = 3;

/** How many steps a wash is run for. It is a fixed number and it has to be:
 *  time in this app is step count, never the clock (see `washField.ts`). */
const STEPS = 32;

/** The most separate brushfuls one mark is laid down in. More would be finer
 *  grained in time and no different to look at; fewer and a long sweep lands
 *  all at once and cannot bloom into itself. */
const CHUNKS = 10;

/** How much water and pigment a fully-charged brush leaves per unit of path.
 *
 *  Both are divided by how far the water reached as the path is walked, so a
 *  wide brush and a narrow one lay the same *depth* of wash rather than the
 *  wide one laying more — a mop and a rigger differ in how much page they
 *  cover, not in how strong the colour comes out. */
const WATER_LOAD = 0.62;
const PIGMENT_LOAD = 0.5;

/** How much colour one unit of settled pigment is worth — the number that turns
 *  the field's arithmetic into an optical density.
 *
 *  Set so that one pass of a fully-loaded brush reads as a real one-pass wash:
 *  strong enough to see, thin enough that a second pass over it visibly
 *  deepens. Glazing is how the medium is actually worked, and a first wash that
 *  came out opaque would take that away. */
const DENSITY = 0.62;

/** How far the water carries past the hair at `water = 1`, as a share of the
 *  head's half-width — the same figure the simple engine uses, because the two
 *  engines have to agree about what the dial means.
 *
 *  The field is charged out to *there* rather than out to the hair, and that is
 *  deliberate: the water running past the head is not something the sheet does
 *  over time, it is what a loaded brush does the instant it touches down. What
 *  the field adds past it is the fraying, the rim and the blooms. */
const SPREAD = 0.22;

/** …and how much page to leave around the mark for the water to run into. The
 *  field is bounded, and water that reaches the edge simply stops there, so the
 *  margin has to be wider than anything the wash will actually do. */
const MARGIN_CELLS = 10;

/** The least alpha worth writing into a pixel. Below half a level of an 8-bit
 *  channel there is nothing to see and the byte rounds to zero anyway. */
const FAINT = 1 / 512;

/** The field's canvas, held rather than allocated per mark: a page of fifty
 *  washes repaints fifty of these, and a fresh canvas each would spend more
 *  time in the allocator than in the simulation. */
let sheet: Surface | null = null;

function sheetFor(width: number, height: number): Surface | null {
  const held = sheet ?? createSurface(width, height);
  if (!held) return null;
  sheet = held;
  resizeSurface(held, width, height);
  return held;
}

/** The wash the held canvas is currently holding, and where on the page it
 *  goes.
 *
 *  **A wet mark is painted twice.** The renderer lays it once onto a scratch
 *  surface to cut the colour it lifts to the mark's own shape, and once for
 *  real (see `wet.ts`), and the two are the same mark by construction — that is
 *  the whole point of them. Simulating it both times would double the cost of
 *  every wash on every sheet that soaks, which is every sheet anyone paints a
 *  watercolour on. So the last one is kept and, if the second call asks for the
 *  same mark, blitted again.
 *
 *  One deep, because the two calls are back to back with nothing between them:
 *  this is not a cache of the page, it is the same mark arriving twice. */
type Dried = {
  points: readonly Point[];
  size: number;
  scale: number;
  water: number;
  pigment: number;
  granulation: number;
  ground: GroundProfile;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
};

let dried: Dried | null = null;

/** Whether the mark being asked for is the one the canvas is already holding —
 *  the points by identity, because a repaint hands the painter the document's
 *  own array and a second call for the same stroke hands it the same one. */
function sameMark(
  a: Dried,
  b: Omit<Dried, "x" | "y" | "width" | "height" | "cell">,
): boolean {
  return (
    a.points === b.points &&
    a.size === b.size &&
    a.scale === b.scale &&
    a.water === b.water &&
    a.pigment === b.pigment &&
    a.granulation === b.granulation &&
    a.color === b.color &&
    a.ground.absorbency === b.ground.absorbency &&
    a.ground.tooth === b.ground.tooth &&
    a.ground.bite === b.ground.bite &&
    a.ground.pattern === b.ground.pattern
  );
}

/** Put the held canvas onto the page, at the patch of document it stands for.
 *
 *  The field is a good deal coarser than the screen, so the image is drawn *up*
 *  to the size of the patch it stands for and the browser's own resampling
 *  smooths it. That is the right way round: water has no hard detail in it, and
 *  the hard detail — the sheet's grain — is painted at full resolution
 *  underneath and reads through the wash. */
function place(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  at: Dried,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    surface.canvas,
    0,
    0,
    at.width,
    at.height,
    at.x,
    at.y,
    at.width * at.cell,
    at.height * at.cell,
  );
  ctx.restore();
}

/** Paint a wash by simulating it. `false` when this engine could not — the
 *  caller then paints the mark with the simple one, which is never a failure,
 *  only a different picture. */
export function paintSimulatedWash(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  water = 1,
  pigment = 1,
  granulation = 0.6,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
): boolean {
  if (points.length === 0 || size <= 0) return false;
  // The same mark a second time — the renderer painting a wet one twice, once
  // to cut its bleed to its own shape and once for real. It dried the way it
  // dried; put it down again.
  const asked = {
    points,
    size,
    scale,
    water,
    pigment,
    granulation,
    ground,
    color,
  };
  if (dried && sheet && sameMark(dried, asked)) {
    place(ctx, sheet, dried);
    return true;
  }
  const soak = Math.max(0, Math.min(1, ground.absorbency));
  // The sheet drinks: the same charge of water on cold-pressed paper runs
  // further than it does on a sealed surface. The same reading the simple
  // engine makes of the same two numbers.
  const wet = Math.max(0, Math.min(2.4, water * (1 + soak * 0.6)));
  const load = Math.max(0.1, Math.min(2, pigment));
  const half = size / 2;
  const reach = half * (1 + SPREAD * wet);
  if (reach * 2 * scale < HAIRLINE) return false;

  // How coarse to work: never finer than the device can show, never so fine
  // that the field blows the budget.
  const box = bounds(points);
  let cell = Math.max(PITCH, PIXEL / scale);
  const margin = () => reach + MARGIN_CELLS * cell;
  for (let tries = 0; tries < 8; tries++) {
    const pad = margin();
    const wide = Math.ceil((box.width + pad * 2) / cell);
    const tall = Math.ceil((box.height + pad * 2) / cell);
    if (wide * tall <= BUDGET) break;
    cell *= Math.sqrt((wide * tall) / BUDGET);
  }
  // A head no wider than a few cells has nothing for a field to resolve.
  if (half / cell < LEAST_HEAD / 2) return false;

  const pad = margin();
  const x = box.x - pad;
  const y = box.y - pad;
  const width = Math.ceil((box.width + pad * 2) / cell);
  const height = Math.ceil((box.height + pad * 2) / cell);
  if (width < 4 || height < 4 || width * height > BUDGET * 2) return false;

  const surface = sheetFor(width, height);
  if (!surface) return false;
  // Whatever the canvas was holding is about to be painted over.
  dried = null;

  const field = createField({
    x,
    y,
    width,
    height,
    cell,
    ground,
    granulation,
  });
  lay(field, points, reach, cell, wet, load);
  const settled = density(field);
  if (!drawInto(surface, field, settled, color)) return false;
  const at: Dried = { ...asked, x, y, width, height, cell };
  dried = at;
  place(ctx, surface, at);
  return true;
}

/** The box the path itself covers, before anything is added for the water. */
function bounds(points: readonly Point[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of points) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Walk the path, laying water and pigment into the field and stepping it as we
 *  go — the part that makes the mark a thing that *happened* rather than a
 *  shape that was filled.
 *
 *  The hand's speed thins the load, for the reason a dry brush thins: a brush
 *  dragged quickly leaves less of itself per inch of paper than one that
 *  dawdled. That is read straight off the samples the canvas stored, so it
 *  costs nothing and it is the difference between a stroke that pools where you
 *  slowed into a corner and a stroke of even weight. */
function lay(
  field: WashField,
  points: readonly Point[],
  reach: number,
  cell: number,
  wet: number,
  load: number,
): void {
  // Dabs close enough together that they overlap in the field, and never finer
  // than one cell — there is nothing between two adjacent cells to resolve.
  const spacing = Math.max(cell * 0.8, reach / 6);
  const along = trace(points, spacing);
  if (along.length === 0) return;
  // Per dab rather than per stroke, so a brush laying a long sweep and one
  // dabbing a spot leave the same depth of wash behind them.
  //
  // A point under a sweeping brush is passed over about `2·reach / spacing`
  // times, so that is what each dab is divided by — and a *tap*, which is one
  // dab and no sweep at all, is divided by one. Without that second half a
  // touch of a loaded brush comes out a tenth the weight of a stroke made with
  // the same brush, which is the one thing anybody would notice immediately.
  const passes = Math.min((2 * reach) / spacing, along.length);
  const perDab = 2 / Math.max(1, passes);
  const chunk = Math.max(1, Math.ceil(along.length / CHUNKS));
  let laid = 0;
  let stepped = 0;
  for (let i = 0; i < along.length; i++) {
    const p = along[i]!;
    // A brush that is moving fast is leaving less water behind it.
    const flow = 1 / (1 + (p.speed / 90) * wet);
    charge(
      field,
      p.x,
      p.y,
      reach,
      WATER_LOAD * wet * perDab * flow,
      PIGMENT_LOAD * load * perDab * flow,
    );
    laid++;
    if (laid % chunk === 0 && stepped < CHUNKS) {
      // The wash starts drying while the rest of it is still being painted.
      // This is what a bloom needs: somewhere damp to arrive.
      step(field);
      stepped++;
    }
  }
  for (; stepped < STEPS; stepped++) step(field);
}

/** Turn what settled into the field canvas's pixels.
 *
 *  Each cell becomes a transmittance rather than a colour — `colour ^ density`,
 *  which is Beer–Lambert with the ink standing in for its own absorption
 *  spectrum — and then the colour-and-alpha pair that composites to the same
 *  thing. That is what makes two passes of a yellow deepen towards yellow
 *  instead of drifting towards grey, and it is exact under the `multiply`
 *  blending a wet mark on absorbent paper already uses.
 *
 *  `false` where the browser will not give us an image to write into, which
 *  drops the mark back to the simple engine. */
function drawInto(
  surface: Surface,
  field: WashField,
  settled: Float32Array,
  color: string,
): boolean {
  const ink = channels(color);
  let image: ImageData;
  try {
    image = surface.ctx.createImageData(field.width, field.height);
  } catch {
    return false;
  }
  const pixels = image.data;
  for (let at = 0; at < settled.length; at++) {
    const d = settled[at]! * DENSITY;
    const out = at * 4;
    if (d <= 0) {
      pixels[out + 3] = 0;
      continue;
    }
    // Beer–Lambert with the ink's own colour as its absorption: a channel the
    // pigment lets through stays let through however much of it there is, and
    // a channel it absorbs falls away exponentially. This is why two passes of
    // a yellow never make a grey.
    const r = Math.pow(ink[0]!, d);
    const g = Math.pow(ink[1]!, d);
    const b = Math.pow(ink[2]!, d);
    const alpha = 1 - Math.min(r, Math.min(g, b));
    if (alpha < FAINT) {
      pixels[out + 3] = 0;
      continue;
    }
    const clear = 1 - alpha;
    pixels[out] = byte((r - clear) / alpha);
    pixels[out + 1] = byte((g - clear) / alpha);
    pixels[out + 2] = byte((b - clear) / alpha);
    pixels[out + 3] = byte(alpha);
  }
  surface.ctx.putImageData(image, 0, 0);
  return true;
}

/** A `#rrggbb` as three transmittances in 0–1.
 *
 *  Clamped off both ends: a channel at zero would swallow the page at any
 *  density at all, and one at exactly 1 would never darken however much pigment
 *  landed. Neither is a pigment — the whitest white in a paintbox still
 *  absorbs something. */
function channels(color: string): [number, number, number] {
  const raw = color.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = /^[0-9a-fA-F]{6}$/.test(full) ? Number.parseInt(full, 16) : 0;
  const clamp = (v: number) => Math.max(0.02, Math.min(0.995, v / 255));
  return [clamp((n >> 16) & 0xff), clamp((n >> 8) & 0xff), clamp(n & 0xff)];
}

function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
