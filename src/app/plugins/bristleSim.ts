// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting a brush mark with the paint field: the seam, and the page it needs.
//
// The paintbrush is four modules, and this is the one the app calls. Under it:
//
//   - `bristleField.ts` — paint and paper, and nothing else;
//   - `bristleHead.ts` — what is on the end of the handle, and how hard it is
//     bearing: the dip, the bundle, which hairs are down at a distance along a
//     drag;
//   - `bristlePrint.ts` — what that head leaves at the *ends* of a mark and
//     under a press, which a walk of cross-sections cannot say;
//   - `bristleWalk.ts` — dragging it: the whole path for a mark that landed,
//     and the path so far for the one still under the hand.
//
// What is left here is where the pixels come from: how big a field to open and
// how coarse to work it, turning the film the paper took into a bitmap, holding
// the gesture in flight between frames, keeping a landed mark in the store, and
// the fall-through to the old vector painter for the marks none of it can show.
//
// What the field buys over the vector hairs it replaces:
//
//   - **One head, round to flat.** The cross-section laid at each touch is
//     the head's footprint projected across the path (`projected`), so a
//     flatness of 0 is the round that draws the same width whichever way you
//     pull it, 1 is the blade that lays its full width square across itself
//     and closes to a heavy hairline along its edge, and everything between
//     is a filbert. Two brushes became one dial. The *shape* is more than
//     that projection, though: a cone bears off across its own width and a
//     chisel does not (`bearing`), and neither of them ends a mark where the
//     last cross-section does (`bristlePrint.ts`).
//   - **The comb.** Which hairs are down, and how much each is laying, is
//     worked out per touch (`combOver`): the partings run the length of the
//     mark, the outer hairs give out first, the paper's tooth lifts the whole
//     head for a moment at a time — and because deposits *accumulate*, a
//     crossing lays paint on paint instead of folding into the pinched swirl
//     the vector offsets had to be smoothed against.
//   - **Running dry on this sheet.** The reservoir is spent per pixel of head
//     dragged, so a long stroke covers, thins to streaks, breaks up into the
//     paper's own grain (`catching`), then trails the film left on the hairs
//     for about as far again — the two phases every reference stroke ends in.
//     A thirsty sheet drinks the reservoir as it goes, so the same dip runs
//     shorter on cotton than on the sealed page.
//
// Three more things about it are worth knowing before reading it (they are
// the quill's, and the architecture is deliberately the same — see
// `quillSim.ts` for the long form):
//
// **The field is worked out on the page, and a landed mark is worked out
// once** — kept in `bristleStore.ts` and blitted thereafter.
//
// **The gesture under the hand is simulated incrementally** (see `Hand`): a
// touch is settled into the live field for good as soon as nothing about it
// can change again, and only the tail — whose smoothed speeds still move, and
// which the lift's raggedness rides — is laid provisionally and taken back
// out on the next frame (`undo`). A frame costs the new dabs, whatever the
// length of what came before.
//
// **The mark grows from the front, by construction.** The paintbrush declares
// `PaintPlugin.grows`, so nothing about a settled touch may depend on the
// path after it: the reservoir walk is front-to-back, the comb is hashed on
// arc distance, the touch bead reads distance from the start, and the lift
// fray rides the provisional tail — which stays inside the head's reach of
// the newest points, inside the patch the trail repaints anyway.
//
// **It can always say no, and the old painter is what catches it.** No
// canvas, a head too few cells across, a mark too small on screen: a landed
// mark falls through to `paintBrush` — the vector-hair painter, kept as the
// fallback and still the whole painter for marks the field cannot show — and
// a live gesture too big for a field draws as a plain weighted line until it
// lands, because the trail's patch contract forbids handing it to a painter
// whose texture is fitted to the whole mark.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import { createSurface, type Surface } from "../surface.ts";
import type { Rect } from "../geometry.ts";
import type { Point } from "../types.ts";
import { paintBrush } from "./bristle.ts";
import { createBristleField } from "./bristleField.ts";
import { HAIRLINE, PIXEL } from "./grain.ts";
import {
  BRUSH_WETNESS,
  FALLBACK_PALE,
  MARGIN_CELLS,
  PAINT_DENSITY,
  paintDryness,
  paintFlow,
  projected,
} from "./bristleHead.ts";
import {
  advanceDrag,
  drag,
  openDrag,
  type DragState,
  type Patch,
} from "./bristleWalk.ts";
import { paintPath } from "./ink.ts";
import { drawPatch, shadeLut, type ShadeLut } from "./quillShade.ts";
import { place, sameGround } from "./quillStore.ts";
import {
  forgetStore,
  heldMark,
  keep,
  roomFor,
  surfaceFor,
  weakly,
  type Ask,
  type Dried,
} from "./bristleStore.ts";

// The walk's own exports travel on through this module, which is the seam the
// app paints a brush mark through and therefore the one door the tests and the
// tuning harnesses knock on.
export {
  advanceDrag,
  drag,
  openDrag,
  paintDryness,
  paintFlow,
  projected,
  type DragState,
};

/** How much page one cell of the field stands for: one document pixel — the
 *  wash's reading, for the wash's reason: the field is worked out on the
 *  page, never on the screen, so a stroke is the same picture at every zoom
 *  and its pixels can be kept. */
const PITCH = PIXEL;

/** The most cells a landed mark's swept band may cost. Measured against the
 *  band the head actually sweeps rather than the mark's bounding box (the
 *  lead's lesson). A brush band is wide, so the budget sits above the pen's —
 *  a landed mark is worked out once and kept, so it can afford to be. */
const BUDGET = 400_000;

/** …and the most cells a landed field may *span*, which is the memory. */
const SPAN_CAP = 1_400_000;

/** The live field's own span allowance, looser than the landed one: there is
 *  exactly one live field at a time, and coarsening it mid-gesture is the one
 *  thing `grows` forbids. Past even this the gesture draws as a plain line
 *  and paints properly on the lift. */
const LIVE_SPAN = 4_000_000;

/** How much growing room a live field opens with beyond the first samples, in
 *  document pixels a side. */
const HEADROOM = 192;

/** How many cells the head has to be across before a field is worth running.
 *  Below it there is nothing to comb and nothing to break — and the vector
 *  painter draws a better small mark than a two-cell smudge. */
const LEAST_ACROSS = 3;

/** Let go of every mark held — the landed store and the live field alike — so
 *  the next ask works it out again; and, when asked, hold the store to
 *  smaller bounds from here on. For the tests, exactly as the wash's is. */
export function forgetDriedPaint(bounds?: {
  marks?: number;
  cells?: number;
}): void {
  forgetStore(bounds);
  hand = null;
}

// --- Painting ---------------------------------------------------------------

/** Everything a brush mark is painted with, past its path and width. The
 *  legacy texture dials (`hair`, `splay`, `bleed`) are read by the fallback
 *  painter only — the field grows its own texture out of the sheet. */
export type BristlePaint = {
  scale?: number;
  flatness?: number;
  /** Which way the blade is turned, in radians. */
  angle?: number;
  hardness?: number;
  load?: number;
  ground?: GroundProfile;
  color?: string;
  page?: string;
  live?: boolean;
  clip?: Rect;
  hair?: number;
  splay?: number;
  bleed?: number;
};

/** Paint a brush mark: the paint simulation wherever it can run, and the
 *  painter it replaced wherever it cannot — a hairline at a far zoom-out, a
 *  head too fine for the field, a browser with no canvas. The fall-through
 *  lives here rather than at the call site, which is what makes "it must
 *  fall back rather than fail" a property of the seam.
 *
 *  The one asymmetry: a live gesture the field refuses is drawn as a plain
 *  weighted line rather than handed to the vector painter, because the brush
 *  declares `grows` and the vector painter's texture is fitted to the whole
 *  mark — repainted a patch at a time it would go stale. The line is the
 *  honest preview a mark that big can afford, and the lift paints it
 *  properly. */
export function paintBristle(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  paint: BristlePaint = {},
): void {
  const scale = paint.scale ?? 1;
  const flatness = Math.max(0, Math.min(1, paint.flatness ?? 0));
  const angle = paint.angle ?? 0;
  const hardness = paint.hardness ?? 1;
  const load = paint.load ?? 1;
  const ground = paint.ground ?? SOLID_GROUND;
  const color = paint.color ?? "#000000";
  const page = paint.page ?? "#ffffff";
  const painted = paint.live
    ? paintLivePaint(
        ctx,
        points,
        size,
        scale,
        flatness,
        angle,
        hardness,
        load,
        ground,
        color,
        page,
      )
    : paintSimulatedPaint(
        ctx,
        points,
        size,
        scale,
        flatness,
        angle,
        hardness,
        load,
        ground,
        color,
        page,
      );
  if (painted) return;
  if (paint.live && size * scale >= HAIRLINE) {
    // The plain weighted line a growing gesture can afford (see above). It
    // reads the reservoir the one way a line can: pale when starved.
    const alpha = ctx.globalAlpha;
    const charge = Math.max(0.05, Math.min(1, load));
    ctx.globalAlpha =
      alpha *
      (0.42 + hardness * 0.58) *
      (FALLBACK_PALE + (1 - FALLBACK_PALE) * charge);
    paintPath(ctx, points, size);
    ctx.globalAlpha = alpha;
    return;
  }
  paintBrush(
    ctx,
    points,
    size,
    hardness,
    scale,
    paint.hair ?? 1,
    paint.splay ?? 1,
    (paint.bleed ?? 0) + ground.absorbency * 1.1,
    load,
    flatness >= 0.5 ? { shape: "flat", angle } : { shape: "round", angle: 0 },
    paint.clip,
  );
}

/** Whether a mark is big enough on this device, and its head coarse enough on
 *  the page, to be worth a field at all. */
function worthAField(size: number, scale: number): boolean {
  if (size <= 0) return false;
  if (size * scale < HAIRLINE) return false;
  return size / PITCH >= LEAST_ACROSS;
}

/** Lay a landed brush mark by spending a finite dip of paint through the head
 *  — worked out once, kept, and blitted thereafter. `false` when this engine
 *  could not; the caller then draws the mark with the vector painter, which
 *  is never a failure, only a smaller picture. */
export function paintSimulatedPaint(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  flatness = 0,
  angle = 0,
  hardness = 1,
  load = 1,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  page = "#ffffff",
): boolean {
  if (points.length === 0 || !worthAField(size, scale)) return false;
  const asked: Ask = {
    points,
    size,
    flatness,
    angle,
    hardness,
    load: Math.max(0.05, load),
    ground,
    color,
    page,
  };
  const held = heldMark(asked);
  if (held) {
    place(ctx, held);
    return true;
  }
  // The gesture that just lifted: its live field is this very mark, walked to
  // the same answer a fresh drag would reach, so it is promoted into the
  // store instead of being worked out a second time.
  const promoted = promoteHand(asked);
  if (promoted) {
    keep(promoted, roomFor(promoted.width, promoted.height).admit);
    place(ctx, promoted);
    return true;
  }

  // How coarse to work: the page's own pitch, coarsened only where the swept
  // band would blow the budget — and the memory of the box capped separately
  // (the lead's two caps).
  const reach = size * 0.55 + MARGIN_CELLS;
  const box = boundsOf(points);
  const swept = pathLengthOf(points);
  let cell = PITCH;
  for (let tries = 0; tries < 8; tries++) {
    const band = ((swept + 2 * reach) * (2 * reach + 2 * cell)) / (cell * cell);
    if (band <= BUDGET) break;
    cell *= Math.sqrt(band / BUDGET);
  }
  // A head only a couple of cells across has nothing to comb or break.
  if (size / cell < LEAST_ACROSS) return false;

  let pad = reach + MARGIN_CELLS * cell;
  let x = box.x - pad;
  let y = box.y - pad;
  let width = Math.ceil((box.width + pad * 2) / cell);
  let height = Math.ceil((box.height + pad * 2) / cell);
  if (width * height > SPAN_CAP) {
    cell *= Math.sqrt((width * height) / SPAN_CAP);
    if (size / cell < LEAST_ACROSS) return false;
    pad = reach + MARGIN_CELLS * cell;
    x = box.x - pad;
    y = box.y - pad;
    width = Math.ceil((box.width + pad * 2) / cell);
    height = Math.ceil((box.height + pad * 2) / cell);
  }
  if (width < 4 || height < 4) return false;

  const room = roomFor(width, height);
  const surface = surfaceFor(width, height, room);
  if (!surface) return false;

  const field = createBristleField({
    x,
    y,
    width,
    height,
    cell,
    ground,
    wick: BRUSH_WETNESS * Math.max(0, Math.min(1, ground.absorbency)),
  });
  drag(field, points, size, flatness, angle, hardness, asked.load, cell);
  if (
    !drawPatch(
      surface,
      field,
      shadeLut(color, page, PAINT_DENSITY),
      0,
      0,
      width,
      height,
    )
  ) {
    return false;
  }

  const at: Dried = {
    ...asked,
    points: weakly(points),
    x,
    y,
    width,
    height,
    cell,
    surface,
  };
  keep(at, room.admit);
  place(ctx, at);
  return true;
}
/** The one stroke still being dragged, kept between pointer samples so a
 *  frame costs the touches that arrived rather than the length of the
 *  gesture: the walk, and the pixels it has already been flushed to. */
type Hand = {
  state: DragState;
  size: number;
  flatness: number;
  angle: number;
  hardness: number;
  load: number;
  color: string;
  page: string;
  ground: GroundProfile;
  surface: Surface;
  lut: ShadeLut;
};

let hand: Hand | null = null;

/** Whether `next` is `prior` with more on the end — the samples compared by
 *  identity, exactly as the trail compares them (see `grownFrom` in
 *  `trail.ts`). */
function grownBy(prior: readonly Point[], next: readonly Point[]): boolean {
  if (next.length < prior.length) return false;
  for (let i = 0; i < prior.length; i++) {
    if (prior[i] !== next[i]) return false;
  }
  return true;
}
/** Open a fresh live field over the gesture so far, with growing room. */
function openHand(
  points: readonly Point[],
  size: number,
  flatness: number,
  angle: number,
  hardness: number,
  load: number,
  ground: GroundProfile,
  color: string,
  page: string,
): Hand | null {
  const box = boundsOf(points);
  const pad = size * 0.55 + MARGIN_CELLS + HEADROOM;
  const x = box.x - pad;
  const y = box.y - pad;
  const width = Math.ceil(box.width + pad * 2);
  const height = Math.ceil(box.height + pad * 2);
  if (width * height > LIVE_SPAN) return null;
  const surface = createSurface(width, height);
  if (!surface) return null;
  const field = createBristleField({
    x,
    y,
    width,
    height,
    cell: PITCH,
    ground,
    wick: BRUSH_WETNESS * Math.max(0, Math.min(1, ground.absorbency)),
  });
  return {
    state: openDrag(field, size, flatness, angle, hardness, load),
    size,
    flatness,
    angle,
    hardness,
    load,
    color,
    page,
    ground,
    surface,
    lut: shadeLut(color, page, PAINT_DENSITY),
  };
}

/** Re-open the live field larger when the gesture outgrows it, carrying the
 *  cells and the pixels over — an occasional copy instead of a per-frame
 *  restart. `null` when the gesture has outgrown what a live field may span,
 *  and the caller falls through to the plain line. */
function regrow(held: Hand, points: readonly Point[]): Hand | null {
  const box = boundsOf(points);
  const pad = held.size * 0.55 + MARGIN_CELLS + HEADROOM;
  const from = held.state.field;
  const x = Math.min(from.x, box.x - pad);
  const y = Math.min(from.y, box.y - pad);
  const width = Math.ceil(
    Math.max(from.x + from.width, box.x + box.width + pad) - x,
  );
  const height = Math.ceil(
    Math.max(from.y + from.height, box.y + box.height + pad) - y,
  );
  if (width * height > LIVE_SPAN) return null;
  const surface = createSurface(width, height);
  if (!surface) return null;
  const field = createBristleField({
    x,
    y,
    width,
    height,
    cell: PITCH,
    ground: held.ground,
    wick: from.wick,
  });
  // The cells, row by row into their new places…
  const shiftCol = Math.round(from.x - x);
  const shiftRow = Math.round(from.y - y);
  for (let row = 0; row < from.height; row++) {
    const to = (row + shiftRow) * width + shiftCol;
    const at = row * from.width;
    field.film.set(from.film.subarray(at, at + from.width), to);
    field.dip.set(from.dip.subarray(at, at + from.width), to);
    field.ready.set(from.ready.subarray(at, at + from.width), to);
  }
  // …the pixels wholesale…
  surface.ctx.drawImage(held.surface.canvas, shiftCol, shiftRow);
  // …and the undo log's cells re-addressed to the new rows.
  const undo = held.state.undo.slice();
  for (let i = 0; i < undo.length; i += 2) {
    const at = undo[i]!;
    undo[i] =
      (Math.floor(at / from.width) + shiftRow) * width +
      (at % from.width) +
      shiftCol;
  }
  return {
    ...held,
    state: { ...held.state, field, undo },
    surface,
  };
}

/** Paint the gesture under the hand, continuing the field kept from the frame
 *  before wherever the gesture has merely grown. `false` when a live field
 *  cannot run — the same answers as the landed path, plus a gesture too big
 *  for one — and the plain line then draws the gesture until it lands. */
function paintLivePaint(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale: number,
  flatness: number,
  angle: number,
  hardness: number,
  load: number,
  ground: GroundProfile,
  color: string,
  page: string,
): boolean {
  if (points.length === 0 || !worthAField(size, scale)) return false;
  const charge = Math.max(0.05, load);

  let held =
    hand &&
    hand.size === size &&
    hand.flatness === flatness &&
    hand.angle === angle &&
    hand.hardness === hardness &&
    hand.load === charge &&
    hand.color === color &&
    hand.page === page &&
    sameGround(hand.ground, ground) &&
    grownBy(hand.state.points, points)
      ? hand
      : null;
  // The same gesture asked for again within one frame — the wet double-paint
  // (see `wet.ts`) — has nothing new to lay: put the pixels down again.
  if (held && held.state.points === points) {
    place(ctx, liveAt(held));
    return true;
  }
  if (held) {
    const box = boundsOf(points);
    const pad = size * 0.55 + MARGIN_CELLS;
    const field = held.state.field;
    if (
      box.x - pad < field.x ||
      box.y - pad < field.y ||
      box.x + box.width + pad > field.x + field.width ||
      box.y + box.height + pad > field.y + field.height
    ) {
      held = regrow(held, points);
    }
  } else {
    held = openHand(
      points,
      size,
      flatness,
      angle,
      hardness,
      charge,
      ground,
      color,
      page,
    );
  }
  if (!held) {
    hand = null;
    return false;
  }
  hand = held;

  // Walk the gesture on, then flush the patch of film it touched into pixels
  // and put the mark down.
  const dirty = advanceDrag(held.state, points);
  if (!flushPatch(held, dirty)) {
    hand = null;
    return false;
  }
  place(ctx, liveAt(held));
  return true;
}

/** The gesture that just lifted, turned into a dried mark without a second
 *  walk: the live field is advanced to the final path (a no-op when nothing
 *  grew), flushed, and its pixels cropped down from the growing room to the
 *  mark's own box. `null` whenever the ask is not the gesture in hand, and
 *  the caller works the mark out afresh. */
function promoteHand(ask: Ask): Dried | null {
  const held = hand;
  if (
    !held ||
    held.size !== ask.size ||
    held.flatness !== ask.flatness ||
    held.angle !== ask.angle ||
    held.hardness !== ask.hardness ||
    held.load !== ask.load ||
    held.color !== ask.color ||
    held.page !== ask.page ||
    !sameGround(held.ground, ask.ground) ||
    !grownBy(held.state.points, ask.points)
  ) {
    return null;
  }
  const from = held.state.field;
  const pad = ask.size * 0.55 + MARGIN_CELLS;
  const box = boundsOf(ask.points);
  const x = Math.max(from.x, box.x - pad);
  const y = Math.max(from.y, box.y - pad);
  const width = Math.ceil(
    Math.min(from.x + from.width, box.x + box.width + pad) - x,
  );
  const height = Math.ceil(
    Math.min(from.y + from.height, box.y + box.height + pad) - y,
  );
  if (width < 4 || height < 4 || width * height > SPAN_CAP) return null;

  const dirty = advanceDrag(held.state, ask.points);
  if (!flushPatch(held, dirty)) return null;
  const surface = createSurface(width, height);
  if (!surface) return null;
  surface.ctx.drawImage(
    held.surface.canvas,
    Math.round(x - from.x),
    Math.round(y - from.y),
    width,
    height,
    0,
    0,
    width,
    height,
  );
  hand = null;
  return {
    ...ask,
    points: weakly(ask.points),
    x,
    y,
    width,
    height,
    cell: from.cell,
    surface,
  };
}

/** Flush a patch of the live field's film into its pixels. `false` where the
 *  browser refuses the image, and the live path starts over. */
function flushPatch(held: Hand, dirty: Patch): boolean {
  const field = held.state.field;
  const left = Math.max(0, Math.floor(dirty.left));
  const top = Math.max(0, Math.floor(dirty.top));
  const right = Math.min(field.width, Math.ceil(dirty.right));
  const bottom = Math.min(field.height, Math.ceil(dirty.bottom));
  if (right <= left || bottom <= top) return true;
  return drawPatch(
    held.surface,
    field,
    held.lut,
    left,
    top,
    right - left,
    bottom - top,
  );
}

/** Where the live field's pixels go on the page. */
function liveAt(held: Hand): {
  surface: Surface;
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
} {
  return {
    surface: held.surface,
    x: held.state.field.x,
    y: held.state.field.y,
    width: held.state.field.width,
    height: held.state.field.height,
    cell: held.state.field.cell,
  };
}

// --- Geometry ---------------------------------------------------------------

/** The box the path itself covers, before anything is added for the head. */
function boundsOf(points: readonly Point[]): {
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

/** The length of the sampled path — wanted before it is resampled, by the
 *  landed budget above. */
function pathLengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
