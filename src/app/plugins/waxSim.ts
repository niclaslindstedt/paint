// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Drawing a stroke with the wax field.
//
// `waxField.ts` knows about wax and paper and nothing else. This is the part
// that knows about a *gesture*: it opens a field over the patch of page the
// mark can reach, drags the stick's face along the path pressing it into the
// sheet, and turns what stuck into pixels. It is the pencil's `leadSim.ts`
// with a crayon in the hand instead, and the differences are exactly the ones
// a hand would name:
//
//   - **A crayon is held like a crayon.** A pencil is a hard point held
//     steady; a stick of wax is a worn slab held at a lean that wanders as
//     the hand turns through the stroke, so one side of a broad mark is solid
//     while the other frays — and which side changes as the mark travels. The
//     facets of the worn face plough shallow furrows along the mark. Both are
//     across-the-mark structure, worked out once per touch as a *face
//     profile* and handed to the field (see `rub`).
//   - **It settles slowly.** A pencil line starts nearly where you put it
//     down; a stick of wax takes a centimetre to take its full weight, and
//     eases off the same way, so the ends of a sweep fade in rather than
//     starting square.
//   - **Speed says almost nothing.** Wax comes off by work done over
//     distance, like graphite and unlike ink — the walk already lays by
//     distance, so the hurry term is a shade, not a mark (see `HURRY_KEEP`
//     in `leadSim.ts` for the full argument, hardware included).
//
// The structure is the lead's throughout: the field is the mark's and the
// clip only says how much of it to work out; a landed mark dries once into
// the store and is blitted for ever after; and it can always say no — no DOM,
// a hairline at far zoom-out, a face under a few cells — and the old
// geometric painter catches it inside the seam (see `paintCrayon`).

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import {
  HAIRLINE,
  PIXEL,
  driftNoise,
  hashedRandom,
  normalAt,
  pathLength,
  trace,
} from "./grain.ts";
import { createWaxField, laid, rub, WAX_CRAYON } from "./waxField.ts";
import {
  heldMark,
  keep,
  roomFor,
  surfaceFor,
  weakly,
  type Ask,
} from "./waxStore.ts";

/** The most cells one mark will be worked out at. A shade under the lead's
 *  48k: a crayon is the broadest stick in the box, so an ordinary mark leans
 *  on this sooner and coarsens a little — which is honest, because the wax's
 *  clumping is far coarser than the graphite's speckle to begin with. */
const BUDGET = 40_000;

/** How many cells across the face is ever worked at — the *fine* bound, the
 *  budget being the coarse one. The pencil resolves at the device pixel
 *  because its speckle is per-pixel; the crayon's texture is clumps ten
 *  pixels across, so working a 145-px face at device pitch is arithmetic
 *  with nothing to show for it. Half the cost of the broadest marks, and the
 *  clumps come out the same. */
const FINEST_FACE = 52;

/** How hard the hand's range is bent into the medium's. Linear, the light
 *  hand and the leaning one huddled within a shade of each other; sharpened,
 *  eased off rides the very crowns in broken chains and leaned on overwhelms
 *  the slip and burnishes toward solid (the speed-curve lesson, on the
 *  pressure axis). Past ~1.3 the light end vanishes altogether — the dial's
 *  own floor still has to leave a visible pass. */
const SINK = 1.12;

/** …and the most cells the field is allowed to *span* — the arrays over the
 *  mark's box, most of which a diagonal stroke never touches. See
 *  `leadSim.ts`. */
const SPAN_CAP = 1_400_000;

/** How many cells the face has to be across before a field is worth running.
 *  Below it there is no tooth left to resolve and the geometric painter draws
 *  a better line than a two-pixel smudge. */
const LEAST_FACE = 3;

/** …and how much page to leave round the mark, in cells. Only the chipped
 *  edge of the face reaches past the contact patch. */
const MARGIN_CELLS = 2;

/** How dark a cell holding a full load of wax is against the page. Wax is
 *  nearly opaque — a burnished crayon patch is a waxy solid with pinholes of
 *  paper, not a sheen — but *nearly*: a heavy crossing still reads a shade
 *  darker than either stroke, which is what layered wax does. */
const DENSITY = 0.95;

/** How quickly a cell darkens as wax goes into it. Beer–Lambert over the
 *  load, tuned so an ordinary press sits mid-curve: the speckle of a light
 *  pass and the near-solid of a leaned-on one both have somewhere to go. */
const SHOW = 3.0;

/** How little of its shed a stick loses to being hurried — an abrasive
 *  medium's small speed term, the pencil's argument verbatim, held even
 *  tighter here: the term feeds a *threshold* (the dig), so a few percent of
 *  force is a quarter of the coverage, and a flick that pales that much is a
 *  mark that depends on the device that drew it. */
const HURRY_KEEP = 0.93;
const HURRY_SPEED = 30;

/** How hard the hand is ever allowed to bear down, past which the dial stops
 *  reaching anything a cell can show. */
const MOST_FORCE = 1.6;

/** The least alpha worth writing into a pixel. */
const FAINT = 1 / 512;

/** The field's canvas, held rather than allocated per mark (the lead's
 *  arrangement, for the lead's reason). */
let page: Surface | null = null;

function pageFor(width: number, height: number): Surface | null {
  const held = page ?? createSurface(width, height);
  if (!held) return null;
  page = held;
  resizeSurface(held, width, height);
  return held;
}

/** Draw a crayon mark by dragging a stick of wax over a sheet. `false` when
 *  this engine could not, and the caller then draws the mark with the
 *  geometric grain painter — which is never a failure, only a coarser
 *  picture (see `paintCrayon`).
 *
 *  `pressure` is how hard the hand was bearing down and `soft` which stick is
 *  in it (see `PRESSURE` and `SOFT` in `builtin/dials.ts`); together they are
 *  the whole of what a crayon mark is. `clip` is a permission to skip, `live`
 *  says the gesture is still under the hand — both exactly as the lead reads
 *  them. */
export function paintSimulatedWax(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  pressure = 1,
  soft = WAX_CRAYON,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  clip?: Rect,
  live = false,
): boolean {
  const first = points[0];
  if (!first || size <= 0) return false;
  if (size * scale < HAIRLINE) return false;

  const lean = Math.max(0, pressure);
  const stick = Math.max(0.05, soft);
  const box = bounds(points);
  // The face's contact patch, and how chipped its edge is — a shade wider
  // than the lead's fray, because a worn slab of wax is more ragged than a
  // sharpened point, and still a couple of pixels whatever the width.
  const half = size / 2;
  const fray = Math.min(half * 0.55, 1.1 + half * 0.08);
  const reach = half + fray;

  // How coarse to work: never finer than the device can show, and never so
  // fine that the mark blows the budget — measured against the band the face
  // actually sweeps, and against the whole mark, never the window (see
  // `leadSim.ts` for both arguments).
  const swept = pathLength(points);
  const finest = Math.max(PIXEL / scale, half / FINEST_FACE);
  let cell = finest;
  for (let tries = 0; tries < 8; tries++) {
    const band = ((swept + 2 * reach) * (2 * reach + 2 * cell)) / (cell * cell);
    if (band <= BUDGET) break;
    cell *= Math.sqrt(band / BUDGET);
  }
  // A face no wider than a couple of cells has no tooth left to find.
  if (half / cell < LEAST_FACE / 2) return false;

  const pad = reach + MARGIN_CELLS * cell;

  // A landed mark dries once and is blitted for ever after (see
  // `waxStore.ts`).
  if (!live) {
    const ask: Ask = {
      points,
      size,
      pressure: lean,
      soft: stick,
      ground,
      color,
      cell,
    };
    const held = heldMark(ask);
    if (held) {
      place(ctx, held.surface, held);
      return true;
    }
    if (dryIntoStore(ctx, ask, { half, fray, pad, box })) return true;
  }
  // The patch to actually work out: the mark, cut down to the window if
  // there is one. Only the *keeping* is cut — the walk still lays every
  // touch whose face could have reached in here.
  const patch = meet(grow(box, pad), clip ? grow(clip, cell) : undefined);
  if (!patch) return true;

  // Anchored to the page rather than to the patch, so two repaints that cut
  // the same mark differently still put the lattice in the same places.
  const x = Math.floor(patch.x / cell) * cell;
  const y = Math.floor(patch.y / cell) * cell;
  let width = Math.ceil((patch.x + patch.width - x) / cell);
  let height = Math.ceil((patch.y + patch.height - y) / cell);
  if (width < 3 || height < 3) return false;
  if (width * height > SPAN_CAP) {
    cell *= Math.sqrt((width * height) / SPAN_CAP);
    width = Math.ceil((patch.x + patch.width - x) / cell);
    height = Math.ceil((patch.y + patch.height - y) / cell);
    if (width < 3 || height < 3) return false;
  }

  const surface = pageFor(width, height);
  if (!surface) return false;

  const field = createWaxField({
    x,
    y,
    width,
    height,
    cell,
    ground,
    soft: stick,
  });
  dragWax(field, points, half, fray, cell, lean, {
    x,
    y,
    width: width * cell,
    height: height * cell,
  });
  if (!drawInto(surface, field.width, field.height, laid(field), color)) {
    return false;
  }
  place(ctx, surface, { x, y, width, height, cell });
  return true;
}

/** Work a landed mark's **whole** field out and dry it into the store, or
 *  `false` when it can't be held — the caller then paints exactly as it did
 *  before the store existed (the lead's arrangement verbatim). */
function dryIntoStore(
  ctx: CanvasRenderingContext2D,
  ask: Ask,
  mark: { half: number; fray: number; pad: number; box: Rect },
): boolean {
  const { cell } = ask;
  const whole = grow(mark.box, mark.pad);
  const x = Math.floor(whole.x / cell) * cell;
  const y = Math.floor(whole.y / cell) * cell;
  const width = Math.ceil((whole.x + whole.width - x) / cell);
  const height = Math.ceil((whole.y + whole.height - y) / cell);
  if (width < 3 || height < 3) return false;
  if (width * height > SPAN_CAP) return false;
  const room = roomFor(width, height);
  if (!room.admit) return false;
  const surface = surfaceFor(width, height, room);
  if (!surface) return false;
  const field = createWaxField({
    x,
    y,
    width,
    height,
    cell,
    ground: ask.ground,
    soft: ask.soft,
  });
  dragWax(field, ask.points, mark.half, mark.fray, cell, ask.pressure, {
    x,
    y,
    width: width * cell,
    height: height * cell,
  });
  if (!drawInto(surface, field.width, field.height, laid(field), ask.color)) {
    return false;
  }
  keep({ ...ask, points: weakly(ask.points), x, y, width, height, surface });
  place(ctx, surface, { x, y, width, height, cell });
  return true;
}

/** The box the path itself covers, before anything is added for the face. */
function bounds(points: readonly Point[]): Rect {
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

/** A box grown by `by` on every side. */
function grow(box: Rect, by: number): Rect {
  return {
    x: box.x - by,
    y: box.y - by,
    width: box.width + by * 2,
    height: box.height + by * 2,
  };
}

/** Where two boxes overlap, or `null` when they don't. */
function meet(a: Rect, b: Rect | undefined): Rect | null {
  if (!b) return a;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Drag the stick along the path, pressing its face into the sheet as it
 *  goes.
 *
 *  The hand here is the crayon's hand, read the way the geometric painter
 *  reads it so that switching engine changes the *picture* and not the
 *  gesture: it settles slowly at the ends (a stick of wax takes a centimetre
 *  to take its full weight), bears down and eases off in patches, leans onto
 *  one side of the face, and hurries only a shade.
 *
 *  Every drift is seeded off the mark's first point as well as its own
 *  constant, so two identical gestures in two places are two different
 *  crayons' worth of wobble — while a repaint, the store and the export all
 *  work the same mark out identically (the hash rule every painter here
 *  follows).
 *
 *  Exported for the exercise-sheet harness, which drives it straight over a
 *  field with no canvas anywhere. */
export function dragWax(
  field: ReturnType<typeof createWaxField>,
  points: readonly Point[],
  half: number,
  fray: number,
  cell: number,
  pressure: number,
  patch: { x: number; y: number; width: number; height: number },
): void {
  const spacing = Math.max(cell * 0.9, half / 2.6);
  const along = trace(points, spacing);
  const first = along[0];
  if (!first) return;
  const seed = Math.floor(hashedRandom(first.x, first.y, 97) * 4096) * 7;
  // The furrows the face's worn facets plough along the mark: their pitch
  // grows with the stick, but slowly, and never so fine that it becomes a
  // second grain competing with the paper's (the geometric painter's
  // numbers, kept so the two engines describe the same stick).
  const furrow = Math.max(2.4, Math.min(7, half * 0.32));
  // One profile array, reused across every touch of this walk.
  const most = Math.ceil((half + fray) / cell) + 2;
  const face = new Float32Array(most * 2 + 1);

  if (along.length < 2) {
    // A press and a lift: a patch of grain rather than a dot. The skid — the
    // direction the wax smeared when the stick touched down — is hashed off
    // the position, like the geometric painter's.
    const angle = hashedRandom(first.x, first.y, 3) * Math.PI * 2;
    const tilt = (hashedRandom(first.x, first.y, 9) - 0.5) * 1.1;
    const w = half * 0.94;
    const mid = shapeFace(face, w, fray, cell, tilt, furrow, 0, seed);
    // The skid is the tap's direction of travel, so the smear points down it.
    field.ax = Math.cos(angle);
    field.ay = Math.sin(angle);
    rub(
      field,
      first.x,
      first.y,
      Math.cos(angle),
      Math.sin(angle),
      w,
      fray,
      Math.min(MOST_FORCE, (0.92 * pressure) ** SINK),
      1,
      face,
      mid,
    );
    return;
  }

  const span = along[along.length - 1]!.at;
  // How far in from each end the stick takes to settle onto the page. A long
  // sweep fades in over a centimetre; a short dash can't spend more than a
  // third of itself on it. (The geometric painter's ramp, in its own words.)
  const ramp = Math.max(1, Math.min(span * 0.3, 4 + half * 1.4));
  const passes = Math.min((2 * half) / spacing, along.length);
  const share = 1 / Math.max(1, passes);
  const outer = half + fray;

  for (let i = 0; i < along.length; i++) {
    const p = along[i]!;
    if (
      p.x + outer < patch.x ||
      p.x - outer > patch.x + patch.width ||
      p.y + outer < patch.y ||
      p.y - outer > patch.y + patch.height
    ) {
      continue;
    }
    const { nx, ny } = normalAt(along, i);
    // Which way the face is travelling — the direction the wax smears in.
    field.ax = -ny;
    field.ay = nx;
    const settled = Math.sqrt(Math.min(1, Math.min(p.at, span - p.at) / ramp));
    // The hand bearing down and easing off, over a few centimetres of travel.
    const bearing = 0.74 + 0.26 * driftNoise(p.at / 30, seed + 43);
    // Which part of the face is carrying the weight — the lean, wandering as
    // the hand turns through the stroke.
    const tilt = (driftNoise(p.at / 45, seed + 29) - 0.5) * 1.1;
    // Hurried, the stick skips a little — and only a little.
    const hurry = HURRY_KEEP + (1 - HURRY_KEEP) / (1 + p.speed / HURRY_SPEED);
    // Raised to a power, so the hand's real range spans the medium's: eased
    // off, the face rides the very crowns in broken chains; leaned on, it
    // overwhelms the slip and burnishes toward solid. A linear response
    // huddled the two within a shade of each other (the speed-curve lesson,
    // on the pressure axis).
    const force = Math.max(
      0.05,
      Math.min(MOST_FORCE, (bearing * settled * hurry * pressure) ** SINK),
    );
    // The contact patch rocks a little as the stick travels; it narrows at
    // the ends far less than it fades.
    const w =
      half *
      (0.86 + 0.14 * driftNoise(p.at / 40, seed + 7)) *
      (0.82 + 0.18 * settled);
    const mid = shapeFace(face, w, fray, cell, tilt, furrow, p.at, seed);
    rub(field, p.x, p.y, nx, ny, w, fray, force, share, face, mid);
  }
}

/** Work out one touch's face profile — the force multiplier per cell of
 *  across-offset — and answer the index of its centre.
 *
 *  Two things live in it, and they are the crayon's own asymmetries: the
 *  *lean* that puts the weight on one side of the face, and the *furrows*
 *  the worn facets plough — streaks that drift slowly along the mark, so a
 *  long pass reads as combed rather than ruled. */
function shapeFace(
  face: Float32Array,
  w: number,
  fray: number,
  cell: number,
  tilt: number,
  furrow: number,
  at: number,
  seed: number,
): number {
  const steps = Math.min(
    (face.length - 1) >> 1,
    Math.ceil((w + fray) / cell) + 1,
  );
  const mid = (face.length - 1) >> 1;
  const drift = at / 300;
  for (let k = -steps; k <= steps; k++) {
    const u = k * cell;
    const weight = 1 - 0.34 * Math.min(1, ((u / w - tilt) / 1.15) ** 2);
    const streak = 0.74 + 0.26 * driftNoise(u / furrow + drift, seed + 19);
    face[mid + k] = weight * streak;
  }
  return mid;
}

/** Turn what the sheet kept into the field canvas's pixels.
 *
 *  Wax is a colour at an alpha — pigment in a translucent binder sitting on
 *  the sheet — so a cell is the stick's own colour, and what the load buys
 *  is the alpha, on a saturating curve: the first crumb in a bare cell shows
 *  strongly, the last before it burnishes hardly shows at all. */
function drawInto(
  surface: Surface,
  width: number,
  height: number,
  load: Float32Array,
  color: string,
): boolean {
  const [r, g, b] = channels(color);
  let image: ImageData;
  try {
    image = surface.ctx.createImageData(width, height);
  } catch {
    return false;
  }
  const pixels = image.data;
  for (let at = 0; at < load.length; at++) {
    const out = at * 4;
    const held = load[at]!;
    if (held <= 0) {
      pixels[out + 3] = 0;
      continue;
    }
    const alpha = DENSITY * (1 - Math.exp(-held * SHOW));
    if (alpha < FAINT) {
      pixels[out + 3] = 0;
      continue;
    }
    pixels[out] = r;
    pixels[out + 1] = g;
    pixels[out + 2] = b;
    pixels[out + 3] = byte(alpha);
  }
  surface.ctx.putImageData(image, 0, 0);
  return true;
}

/** Put the field's canvas onto the page, at the patch of document it stands
 *  for (see `leadSim.ts` for why the resampling is the right way round). */
function place(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  at: { x: number; y: number; width: number; height: number; cell: number },
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

/** A `#rrggbb` as three bytes. Anything unparseable is black. */
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
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
