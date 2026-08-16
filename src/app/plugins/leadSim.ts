// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Drawing a stroke with the lead field.
//
// `leadField.ts` knows about graphite and paper and nothing else. This is the
// part that knows about a *gesture*: it opens a field over the patch of page
// the mark can reach, drags the lead along the path pressing it into the sheet,
// and turns what stuck into pixels.
//
// Three things about it are worth knowing before reading it.
//
// **The mark is what the sheet kept, not what the path was.** The stroke model
// (`graphite.ts`) scatters specks along the path and lets a hashed paper height
// veto each one; this presses a lead onto a surface and asks the surface what it
// took. They look similar on a plain page and they are not the same thing at
// all on a sheet with a tooth: here the same lead at the same pressure leaves a
// broken sparkle on rough stock, catches only the crowns of a canvas weave, and
// goes down almost solid on hot-pressed — and a second pass over any of them
// fills in what the first could not reach. None of that is drawn; it is what
// falls out of the arithmetic.
//
// **The field is the mark's, and the clip only says how much of it to work
// out.** How coarse a cell is comes off the whole mark, so a stroke paints the
// same picture whatever window is being repainted — and then only the part of
// it inside the window is actually simulated. A cell's load depends on nothing
// further away than the lead's own contact patch, so the walk is padded by that
// and the result inside the window is exact rather than approximate. This is
// what keeps a page-long scribble costing what is on screen instead of costing
// the scribble, every frame, as it grows.
//
// **It can always say no.** No DOM, no canvas, a lead finer than a couple of
// cells, a view pulled so far back the mark is a hairline: every one of those
// answers `false`, and the caller draws the mark with the stroke model instead
// (see `lead.ts`). A browser that cannot run the simulation must still open
// every drawing and paint every mark.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import { createSurface, resizeSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import { HB_LEAD } from "./graphite.ts";
import { HAIRLINE, PIXEL, driftNoise, pathLength, trace } from "./grain.ts";
import { bear, createLeadField, laid } from "./leadField.ts";

/** The most cells one mark will be worked out at. A page-wide sweep with a
 *  clutch lead would otherwise ask for a million; past this the field is
 *  coarsened instead, which costs the grain some fineness and keeps the page at
 *  frame rate.
 *
 *  Higher than the wash's, and it should be: a wash is a field run thirty-odd
 *  times to dry it, and this is a field written once. */
const BUDGET = 48_000;

/** …and the most cells the field is allowed to *span*, which is a different
 *  question and a much looser one. The budget above is the arithmetic; this is
 *  the three arrays laid over the mark's box, most of which a diagonal stroke
 *  never touches. It binds on one thing only: a scribble across a whole page,
 *  exported at 1:1, with no window to cut it down to. */
const SPAN_CAP = 1_400_000;

/** How finely the field is worked out, as a share of the device pixel it would
 *  run at full detail: 1 is a cell per pixel of the screen, 0.1 a tenth of the
 *  resolution in each direction.
 *
 *  It is the one pencil setting that changes nothing about *what a pencil mark
 *  is* — only how finely it is worked out. What a coarser grid costs is the fine
 *  half of the picture: the graphite grain broadens, the paper's tooth softens,
 *  and a fine lead stops being worth a field at all and falls through to the
 *  stroke model. What it buys is the square of itself, and that is why it is
 *  worth a slider: the simulation is the expensive engine, this is the one
 *  control that decides how expensive, and a page of a hundred sketch strokes
 *  repainted on every pan is exactly where that matters.
 *
 *  A tenth is the floor because a field coarser than that is not a pencil being
 *  simulated badly, it is a handful of cells the width of the lead. */
export const MIN_LEAD_DETAIL = 0.1;
export const MAX_LEAD_DETAIL = 1;

/** What it works out at untouched: all of it. Anything less is a trade the user
 *  has to have made — a build that quietly drew a coarser mark than the one its
 *  own sample showed would be lying about its picture. */
export const DEFAULT_LEAD_DETAIL = MAX_LEAD_DETAIL;

/** A stored detail pulled into range. A blob written by another build (or by
 *  hand) is the only way a bad one gets here, and the slider cannot recover from
 *  a value off its own track. */
export function clampLeadDetail(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LEAD_DETAIL;
  }
  return Math.max(MIN_LEAD_DETAIL, Math.min(MAX_LEAD_DETAIL, value));
}

/** How coarse to start, and how much to allow, at the detail the setting is
 *  turned to.
 *
 *  Detail is a share of the field's *resolution*, and that is what the cell
 *  takes: half detail, cells twice as wide on the screen, and an ordinary mark
 *  then costs a quarter as much — a grid coarsened in both directions holds a
 *  quarter as many cells over the same paper.
 *
 *  **The budget comes down more slowly than that, and deliberately.** It is the
 *  cap on the worst case rather than a second resolution, and it binds only for
 *  the big marks. Bringing it down as the square as well would coarsen those a
 *  second time, past the point where a lead is a few cells across, and the mark
 *  would fall through to the stroke model: the bottom of the slider would
 *  quietly be an off switch rather than a coarse simulation, which is not what
 *  it says on it.
 *
 *  At 1 both are exactly the constants above, which is what keeps a mark drawn
 *  by a build that had no such setting drawing the same today. */
function grid(scale: number, detail: number): { cell: number; budget: number } {
  const share = Math.max(MIN_LEAD_DETAIL, Math.min(1, detail));
  return { cell: PIXEL / scale / share, budget: BUDGET * share };
}

/** How many cells the lead has to be across before a field is worth running.
 *  Below it there is no tooth left to resolve — the contact patch is a cell —
 *  and the stroke model draws a better line than a two-pixel smudge. */
const LEAST_HEAD = 3;

/** …and how much page to leave round the mark, in cells. Only the chipped edge
 *  of the lead reaches past the contact patch, so this is small. */
const MARGIN_CELLS = 2;

/** How dark a cell holding a full load of graphite is against the page. The
 *  same figure the stroke model uses, and for the same reason: even 6B leaves a
 *  sheen rather than ink. */
const DENSITY = 0.86;

/** How quickly a cell darkens as graphite goes into it. Beer–Lambert over the
 *  load, so the first bit of graphite in a bare cell shows strongly and the
 *  last bit before it saturates hardly shows at all — which is the shape of
 *  every real deposit and the reason shading has to be built up. */
const SHOW = 3.2;

/** The least alpha worth writing into a pixel. Below half a level of an 8-bit
 *  channel there is nothing to see and the byte rounds to zero anyway. */
const FAINT = 1 / 512;

/** The field's canvas, held rather than allocated per mark: a page of two
 *  hundred pencil strokes repaints two hundred of these, and a fresh canvas
 *  each would spend more time in the allocator than in the arithmetic. */
let sheet: Surface | null = null;

function sheetFor(width: number, height: number): Surface | null {
  const held = sheet ?? createSurface(width, height);
  if (!held) return null;
  sheet = held;
  resizeSurface(held, width, height);
  return held;
}

/** Draw a pencil mark by pressing a lead into a sheet. `false` when this engine
 *  could not, and the caller then draws the mark with the stroke model — which
 *  is never a failure, only a different picture.
 *
 *  `clip` is the part of the page the caller is actually keeping (see
 *  `PaintDetail.clip`). It is a permission to skip and nothing more: what lands
 *  inside it is the same either way. */
export function paintSimulatedLead(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  grade = HB_LEAD,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  detail = DEFAULT_LEAD_DETAIL,
  clip?: Rect,
): boolean {
  const first = points[0];
  if (!first || size <= 0) return false;
  if (size * scale < HAIRLINE) return false;

  const lead = Math.max(0.05, grade);
  const box = bounds(points);
  // The lead's contact patch, and how ragged its edge is — a couple of grain
  // cells whatever the width, because a chipped edge is a chipped edge. The
  // same reading the stroke model makes, so the two engines draw a line of the
  // same weight.
  const half = size / 2;
  const fray = Math.min(half * 0.55, 0.7 + half * 0.08);
  const reach = half + fray;

  // How coarse to work: never finer than the device can show, and never so fine
  // that the mark blows the budget.
  //
  // Measured against the **band the lead actually sweeps** rather than against
  // the mark's bounding box, and that matters: a line drawn corner to corner
  // has a box a hundred times its own area, and budgeting on the box would make
  // a diagonal stroke four times coarser than the same stroke drawn flat. The
  // field spans the box, but only the band is ever worked out (see
  // `createLeadField`), so the band is what it costs.
  //
  // Measured against the **whole** mark either way, never against the window,
  // so what a stroke looks like cannot depend on how much of it was on screen.
  //
  // …and never finer than the **detail** setting asks for, which is the whole of
  // what that slider does: it is a share of the resolution, so turning it down
  // widens the cell and an ordinary mark costs the square of it less.
  const swept = pathLength(points);
  const { cell: finest, budget } = grid(scale, detail);
  let cell = finest;
  for (let tries = 0; tries < 8; tries++) {
    const band = ((swept + 2 * reach) * (2 * reach + 2 * cell)) / (cell * cell);
    if (band <= budget) break;
    cell *= Math.sqrt(band / budget);
  }
  // A lead no wider than a couple of cells has no tooth left to find.
  if (half / cell < LEAST_HEAD / 2) return false;

  const pad = reach + MARGIN_CELLS * cell;
  // The patch to actually work out: the mark, cut down to the window if there
  // is one. Only the *keeping* is cut — the walk below still lays every dab
  // whose lead could have reached in here, which is what makes the cells at the
  // edge of the patch exact rather than merely close.
  const patch = meet(grow(box, pad), clip ? grow(clip, cell) : undefined);
  if (!patch) return true;

  // Anchored to the page rather than to the patch, so two repaints that cut the
  // same mark differently still put the lattice in the same places.
  const x = Math.floor(patch.x / cell) * cell;
  const y = Math.floor(patch.y / cell) * cell;
  let width = Math.ceil((patch.x + patch.width - x) / cell);
  let height = Math.ceil((patch.y + patch.height - y) / cell);
  if (width < 3 || height < 3) return false;
  // The band decides the detail; the box decides the *memory*, and a
  // page-crossing scribble exported at 1:1 has a box of millions of cells. A
  // second, much looser cap coarsens only those — three arrays over the box are
  // allocated whether or not the lead ever goes near most of it.
  if (width * height > SPAN_CAP) {
    cell *= Math.sqrt((width * height) / SPAN_CAP);
    width = Math.ceil((patch.x + patch.width - x) / cell);
    height = Math.ceil((patch.y + patch.height - y) / cell);
    if (width < 3 || height < 3) return false;
  }

  const surface = sheetFor(width, height);
  if (!surface) return false;

  const field = createLeadField({
    x,
    y,
    width,
    height,
    cell,
    ground,
    grade: lead,
  });
  drag(field, points, half, fray, cell, {
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

/** The box the path itself covers, before anything is added for the lead. */
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

/** Where two boxes overlap, or `null` when they don't. An absent second box is
 *  "everywhere", which is what an unclipped repaint passes. */
function meet(a: Rect, b: Rect | undefined): Rect | null {
  if (!b) return a;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Drag the lead along the path, pressing it into the sheet as it goes.
 *
 *  A pencil is held far more steadily than a crayon — it is a hard point, not a
 *  worn face — so there is no lean and no ploughed furrow. What is left is the
 *  three things a hand does, and they are read exactly as the stroke model
 *  reads them so that switching engine changes the *picture* and not the
 *  gesture: it settles at the ends, it bears down and eases off over a few
 *  centimetres of travel, and it hurries.
 *
 *  Dabs are spaced by whichever is coarser, a cell or a third of the contact
 *  patch: two touches closer than a cell have nothing between them to resolve,
 *  and a broad lead covers so much ground per dab that stepping it by a cell
 *  would press the same sheet forty times over for the same mark. Each is then
 *  worth its share of one pass, so a swept line and a tap come out the same
 *  weight. */
function drag(
  field: ReturnType<typeof createLeadField>,
  points: readonly Point[],
  half: number,
  fray: number,
  cell: number,
  patch: { x: number; y: number; width: number; height: number },
): void {
  const spacing = Math.max(cell * 0.9, half / 3);
  const along = trace(points, spacing);
  const first = along[0];
  if (!first) return;
  if (along.length < 2) {
    // A press and a lift: a patch of grain rather than a dot.
    bear(field, first.x, first.y, half * 0.92, fray, 0.92);
    return;
  }

  const span = along[along.length - 1]!.at;
  // How far in from each end the lead takes to settle. Short: a pencil line
  // starts nearly where you put it down, unlike a stick of wax.
  const ramp = Math.max(0.5, Math.min(span * 0.25, 1.5 + half));
  // How many dabs pass over a point in the middle of the sweep — what each of
  // them has to be divided by for the whole to come out the weight of one pass.
  const passes = Math.min((2 * half) / spacing, along.length);
  const share = 1 / Math.max(1, passes);
  // The lead cannot reach a cell further off than its own contact patch, so
  // anything further out than that from the patch is a dab with nowhere to go.
  const outer = half + fray;

  for (const p of along) {
    if (
      p.x + outer < patch.x ||
      p.x - outer > patch.x + patch.width ||
      p.y + outer < patch.y ||
      p.y - outer > patch.y + patch.height
    ) {
      continue;
    }
    const settled = Math.sqrt(Math.min(1, Math.min(p.at, span - p.at) / ramp));
    const bearing = 0.78 + 0.22 * driftNoise(p.at / 26, 43);
    // Dragged fast, the lead has less time to shed.
    const hurry = Math.max(0.5, 1 / (1 + p.speed / 42));
    const force = Math.max(0.05, Math.min(1, bearing * settled * hurry));
    // The contact patch itself breathes a little: a soft lead flattens and
    // covers a touch wider than a hard one, and no hand holds a pencil at one
    // exact angle for the length of a line.
    const w = half * (0.9 + 0.1 * driftNoise(p.at / 34, 11));
    bear(field, p.x, p.y, w, fray, force, share);
  }
}

/** Turn what the sheet kept into the field canvas's pixels.
 *
 *  Graphite is not a glaze — it is a mineral lying on and in the paper — so a
 *  cell is the lead's own grey at an alpha, rather than the wash's
 *  transmittance. What the load buys is that alpha, and it buys it on a
 *  saturating curve: the first graphite in a bare cell shows strongly, the last
 *  before it fills hardly shows at all.
 *
 *  `false` where the browser will not give us an image to write into, which
 *  drops the mark back to the stroke model. */
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
 *  for.
 *
 *  A cell is a device pixel wherever the budget allowed one, so the usual case
 *  is a one-for-one blit and the grain lands as crisp as the screen can show
 *  it. Where the mark was coarsened the image is drawn up and the browser's own
 *  resampling smooths it, which is the right way round: a grain too fine to
 *  work out is a grain too fine to see. */
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

/** A `#rrggbb` as three bytes. Anything unparseable is black, which is what a
 *  pencil with no colour resolved onto it would have drawn anyway. */
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
