// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Drawing a stroke with the chalk field.
//
// `chalkField.ts` knows about chalk and the board and nothing else. This is
// the part that knows about a *gesture*: it opens a field over the patch of
// page the mark can reach, drags the stick along the path scrubbing it into
// the sheet, and turns what stuck into pixels.
//
// The walk is the lead's (`leadSim.ts`) — the same budget, the same windowing,
// the same dried-mark store arrangement — with the hand model swapped for a
// stick of board chalk. Where the two hands differ, each difference is a
// behaviour you can point at in a photograph of a real board:
//
//   - **The ends are blunt.** A soft stick bites the moment it lands, so the
//     settle ramp is a stub — a chalk letter starts at nearly full weight,
//     where a wax crayon fades in over a centimetre.
//   - **The face is streaked.** A worn stick is a set of facets, and a broad
//     drag lays visible lanes along itself (every side-stroke in the reference
//     photographs has them). Each touch carries a per-lane gain table
//     (`FaceGrain`), drifting slowly as the mark travels, leaning to whichever
//     side the hand's weight is on — and hashed off the mark as well as the
//     lane, so two strokes are two sticks rather than one stick for ever.
//   - **Dust falls past the edge.** Chalk crumbs scatter a little way beyond
//     the face and cling to the highest crowns of the tooth — the faint halo
//     of specks around every heavy mark on a real board. A second, much
//     lighter scrub past the face's edge lays it, and the sheet's own
//     threshold is what keeps it sparse.
//   - **Speed says little.** Chalk comes off by abrasion — work done over
//     distance, which the walk already lays by — so a hurried hand skips only
//     slightly (see the lead's `HURRY_KEEP` for the full argument).
//
// It can always say no — no DOM, a stick finer than a couple of cells, a view
// pulled back until the mark is a hairline — and the caller draws the mark
// with a plain path instead (see `chalk.ts`). A browser that cannot run the
// simulation must still open every drawing and paint every mark.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import {
  HAIRLINE,
  PIXEL,
  driftNoise,
  hashedRandom,
  pathLength,
  trace,
  normalAt,
} from "./grain.ts";
import {
  CHALK_CRUMB,
  createChalkField,
  dusted,
  scrub,
  sprinkle,
  type ChalkField,
  type FaceGrain,
} from "./chalkField.ts";
import {
  heldMark,
  keep,
  roomFor,
  surfaceFor,
  weakly,
  type Ask,
} from "./chalkStore.ts";

/** The most cells one mark will be worked out at, and the most the field may
 *  span — the lead's two caps, for the lead's reasons (see `leadSim.ts`). */
const BUDGET = 48_000;
const SPAN_CAP = 1_400_000;

/** How many cells the stick has to be across before a field is worth running.
 *  Below it there is no tooth left to resolve and the plain path draws a
 *  better line than a two-pixel smudge. */
const LEAST_FACE = 3;

/** …and how much page to leave round the mark, in cells, past the dust's own
 *  reach. */
const MARGIN_CELLS = 2;

/** How opaque a cell holding a full load of chalk is against the page. Short
 *  of solid on purpose: even the brightest patch on a real board glitters
 *  around dark pinholes rather than closing into paint, and the cap is what
 *  leaves them somewhere to be. */
const DENSITY = 0.95;

/** How quickly a cell whitens as chalk goes into it. Beer–Lambert over the
 *  load — the first dust in a bare cell shows strongly, the last before it
 *  packs full hardly shows — tuned so an ordinary pass sits mid-curve and a
 *  second pass or a crossing has somewhere brighter to go. */
const SHOW = 2.9;

/** How little of its shed the stick loses to being hurried, and how fast the
 *  hand has to be going to lose most of that. Small, and it must be: chalk is
 *  an abrasive — it deposits by distance, not time — and `speed` is the gap
 *  between stored samples, which is a property of the device as much as of
 *  the hand (see `HURRY_KEEP` in `leadSim.ts`). */
const HURRY_KEEP = 0.94;
const HURRY_SPEED = 30;

/** How hard the hand is ever allowed to bear down, past which the dial stops
 *  reaching anything a cell can still show. */
const MOST_FORCE = 1.6;

/** The dust that scatters past the face: how much one whole pass sprinkles,
 *  how few cells ever catch a crumb (what keeps the halo specks rather than a
 *  band), and how far past the face's radius it reaches. The walk's `reach`
 *  must cover the outer edge (see `paintSimulatedChalk`). */
const DUST_AMOUNT = 3;
const DUST_CHANCE = 0.06;
const DUST_REACH = 1.3;

/** The streak lanes of the worn face: their pitch across it (a few crumbs
 *  wide), how much of the deposit they modulate, and how much the hand's lean
 *  takes off the light side of the face. */
const LANE_PITCH = CHALK_CRUMB * 2.2;
const LANE_LOW = 0.55;
const LEAN_DIP = 0.3;

/** The least alpha worth writing into a pixel. */
const FAINT = 1 / 512;

/** The field's canvas, held rather than allocated per mark (see `leadSim.ts`
 *  for the argument). */
let board: Surface | null = null;

function boardFor(width: number, height: number): Surface | null {
  const held = board ?? createSurface(width, height);
  if (!held) return null;
  board = held;
  resizeSurface(held, width, height);
  return held;
}

/** Draw a chalk mark by scrubbing a stick over the page's sheet. `false` when
 *  this engine could not, and the caller then draws the mark with a plain
 *  path — which is never a failure, only a smaller picture.
 *
 *  `clip` is the part of the page the caller is actually keeping (see
 *  `PaintDetail.clip`): a permission to skip, nothing more.
 *
 *  `live` says this is the gesture still under the hand — never asked of the
 *  dried-mark store and never dried into it.
 *
 *  `press` is how hard the hand was bearing down, a fraction of the ordinary
 *  with 1 being it (see `PRESSURE` in `builtin/dials.ts`) — the chalk's one
 *  axis: bearing down packs the tooth full and easing off leaves the board
 *  showing through, and neither makes the stick any wider. */
export function paintSimulatedChalk(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  press = 1,
  ground: GroundProfile = SOLID_GROUND,
  color = "#f5f2ea",
  clip?: Rect,
  live = false,
): boolean {
  const first = points[0];
  if (!first || size <= 0) return false;
  if (size * scale < HAIRLINE) return false;

  const lean = Math.max(0, press);
  const box = bounds(points);
  // The face's contact patch, and how dusty its edge is: wider than a lead's
  // chipped edge — chalk crumbles outward — and still a distance in document
  // pixels rather than a share of the width, because a crumbled edge is a
  // crumbled edge whatever the stick.
  // Small, and it has to be: chalk bears nearly full weight to the edge of
  // its face and then breaks up on the grain — a wide soft shoulder here
  // reads as an airbrushed slug, which is the one thing a chalk line never
  // is. The raggedness belongs to the tooth, not to this ramp.
  const half = size / 2;
  const fray = Math.min(half * 0.35, 1.2 + half * 0.06);
  // The dust scatters past the face, and the walk must be padded by all of it
  // so a windowed repaint lays every touch that can reach the window.
  const reach = half * DUST_REACH + fray + 3;

  // How coarse to work: never finer than the device can show, never so fine
  // that the mark blows the budget — measured against the band the face
  // actually sweeps, never against the window (see `leadSim.ts`).
  const swept = pathLength(points);
  const finest = PIXEL / scale;
  let cell = finest;
  for (let tries = 0; tries < 8; tries++) {
    const band = ((swept + 2 * reach) * (2 * reach + 2 * cell)) / (cell * cell);
    if (band <= BUDGET) break;
    cell *= Math.sqrt(band / BUDGET);
  }
  // A stick no wider than a couple of cells has no tooth left to find.
  if (half / cell < LEAST_FACE / 2) return false;

  const pad = reach + MARGIN_CELLS * cell;

  // A landed mark dries once and is blitted for ever after (see
  // `chalkStore.ts`).
  if (!live) {
    const ask: Ask = { points, size, press: lean, ground, color, cell };
    const held = heldMark(ask);
    if (held) {
      place(ctx, held.surface, held);
      return true;
    }
    if (dryIntoStore(ctx, ask, { half, fray, pad, box })) return true;
  }
  // The patch to actually work out: the mark, cut down to the window if there
  // is one. Only the *keeping* is cut — the walk lays every dab whose stick
  // could have reached in here, so the cells at the edge are exact.
  const patch = meet(grow(box, pad), clip ? grow(clip, cell) : undefined);
  if (!patch) return true;

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

  const surface = boardFor(width, height);
  if (!surface) return false;

  const field = createChalkField({ x, y, width, height, cell, ground });
  drag(field, points, half, fray, cell, lean, {
    x,
    y,
    width: width * cell,
    height: height * cell,
  });
  if (!drawInto(surface, field.width, field.height, dusted(field), color)) {
    return false;
  }
  place(ctx, surface, { x, y, width, height, cell });
  return true;
}

/** Work a landed mark's **whole** field out and dry it into the store, or
 *  `false` when it can't be held (see `leadSim.ts` for the cases). */
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
  const field = createChalkField({
    x,
    y,
    width,
    height,
    cell,
    ground: ask.ground,
  });
  drag(field, ask.points, mark.half, mark.fray, cell, ask.press, {
    x,
    y,
    width: width * cell,
    height: height * cell,
  });
  if (!drawInto(surface, field.width, field.height, dusted(field), ask.color)) {
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

function grow(box: Rect, by: number): Rect {
  return {
    x: box.x - by,
    y: box.y - by,
    width: box.width + by * 2,
    height: box.height + by * 2,
  };
}

function meet(a: Rect, b: Rect | undefined): Rect | null {
  if (!b) return a;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** The face's own texture at one touch: a gain per streak lane across it.
 *
 *  The lanes are the worn facets of the stick — they run along the mark,
 *  drifting slowly as it travels — and the hand's lean rides on top, putting
 *  the weight on one side of the face and wandering as the wrist turns.
 *  Everything in it is hashed off arc distance and off `seed`, which carries
 *  the mark's own identity: two strokes with the same gesture are two sticks,
 *  not one stick drawn twice (the per-mark seeding every medium here owes —
 *  see `chalkSim` in the tool-simulation skill). */
function faceGrain(
  into: Float32Array,
  mid: number,
  nx: number,
  ny: number,
  at: number,
  edge: number,
  seed: number,
): FaceGrain {
  const lean = (driftNoise(at / 45, seed + 7) - 0.5) * 1.1;
  for (let lane = 0; lane < into.length; lane++) {
    const u = (lane - mid) * LANE_PITCH;
    const streak =
      LANE_LOW +
      (1 - LANE_LOW) * driftNoise(lane * 9.1 + at / 90, seed + lane * 3);
    const off = Math.min(1, ((u / edge - lean) / 1.2) ** 2);
    into[lane] = streak * (1 - LEAN_DIP * off);
  }
  return { nx, ny, gains: into, mid, pitch: LANE_PITCH };
}

/** Drag the stick along the path, scrubbing it into the sheet as it goes. */
function drag(
  field: ChalkField,
  points: readonly Point[],
  half: number,
  fray: number,
  cell: number,
  press: number,
  patch: { x: number; y: number; width: number; height: number },
): void {
  const first = points[0]!;
  // The mark's own seed, off the first point and nothing else: a later sample
  // must not re-seed the mark as the gesture grows, and the store, the export
  // and the live walk must all work the same stick out (see `grain.ts` for
  // why nothing here may draw from `Math.random`).
  const seed = Math.floor(hashedRandom(first.x, first.y, 101) * 4096);
  const spacing = Math.max(cell * 0.9, half / 3);
  const along = trace(points, spacing);
  if (along.length === 0) return;
  if (along.length < 2) {
    stamp(field, first, half, fray, press, seed);
    return;
  }

  const span = along[along.length - 1]!.at;
  // How far in from each end the stick takes to settle: a stub. A soft stick
  // bites the moment it lands, which is why a chalk letter has blunt ends
  // where a crayon's fade in.
  const ramp = Math.max(0.4, Math.min(span * 0.15, 0.8 + half * 0.3));
  const passes = Math.min((2 * half) / spacing, along.length);
  const share = 1 / Math.max(1, passes);
  const outer = half * DUST_REACH + fray;
  const lanes = new Float32Array(2 * Math.ceil((half + fray) / LANE_PITCH) + 1);
  const mid = Math.floor(lanes.length / 2);

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
    const settled = Math.sqrt(Math.min(1, Math.min(p.at, span - p.at) / ramp));
    const bearing = 0.74 + 0.26 * driftNoise(p.at / 26, seed + 43);
    // Hurried, the stick skips a little — and only a little.
    const hurry = HURRY_KEEP + (1 - HURRY_KEEP) / (1 + p.speed / HURRY_SPEED);
    const force = Math.max(
      0.05,
      Math.min(MOST_FORCE, bearing * settled * hurry * press),
    );
    // The face breathes a little as the stick rocks in the hand.
    const w = half * (0.9 + 0.1 * driftNoise(p.at / 34, seed + 11));
    const { nx, ny } = normalAt(along, i);
    const grain = faceGrain(lanes, mid, nx, ny, p.at, w, seed);
    scrub(field, p.x, p.y, w, fray, force, share, grain);
    // …and the dust that scatters past it, clinging to the crowns here and
    // there — the sparse halo of specks around the mark, heavier under a
    // heavier hand because a harder scrub throws more of it.
    sprinkle(
      field,
      p.x,
      p.y,
      w * 0.92,
      w * DUST_REACH,
      DUST_AMOUNT * force,
      DUST_CHANCE,
      share,
    );
  }
}

/** The stick pressed down and lifted: a patch of grain rather than a dot,
 *  with the face's streaks across it in one hashed direction and the dust
 *  ring around it. */
function stamp(
  field: ChalkField,
  at: Point,
  half: number,
  fray: number,
  press: number,
  seed: number,
): void {
  const w = half * 0.94;
  const angle = hashedRandom(at.x, at.y, seed + 3) * Math.PI * 2;
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const lanes = new Float32Array(2 * Math.ceil((w + fray) / LANE_PITCH) + 1);
  const mid = Math.floor(lanes.length / 2);
  const grain = faceGrain(lanes, mid, nx, ny, 0, w, seed);
  // A tap's lanes never drift — the stick isn't travelling — so at full
  // contrast they print as ruled stripes across the whole patch. Soften them:
  // a pressed face shows its facets faintly, not a woodgrain.
  for (let i = 0; i < lanes.length; i++) lanes[i] = 0.72 + 0.28 * lanes[i]!;
  const force = Math.min(MOST_FORCE, 0.92 * press);
  scrub(field, at.x, at.y, w, fray, force, 1, grain);
  sprinkle(
    field,
    at.x,
    at.y,
    w * 0.92,
    w * DUST_REACH,
    DUST_AMOUNT * force,
    DUST_CHANCE,
    1,
  );
}

/** Turn what the board kept into the field canvas's pixels.
 *
 *  Chalk is not a glaze — it is a mineral dust lying on the surface — so a
 *  cell is the chalk's own colour at an alpha, on a saturating curve over the
 *  load (see `SHOW`). `false` where the browser will not give us an image to
 *  write into, which drops the mark back to the plain painter. */
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
 *  for (see `leadSim.ts` for why resampling up is the right way round). */
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

/** A `#rrggbb` as three bytes. Anything unparseable is chalk white, which is
 *  what a stick with no colour resolved onto it would have drawn anyway. */
function channels(color: string): [number, number, number] {
  const raw = color.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = /^[0-9a-fA-F]{6}$/.test(full)
    ? Number.parseInt(full, 16)
    : 0xf5f2ea;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
