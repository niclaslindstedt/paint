// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Writing a stroke with the ink field.
//
// `quillField.ts` knows about ink and paper and nothing else. This is the part
// that knows about a *gesture* — and about the one thing the old perfect nib
// never had: **a finite bead of ink**. It opens a field over the patch of page
// the mark can reach, walks the path pressing the nib's edge into the sheet,
// and spends the reservoir as it goes; what the paper took is then turned into
// pixels.
//
// What the reservoir buys is the whole look of a real dipped pen:
//
//   - **Ink shading.** The film laid per touch follows the hand — a slow curve
//     pools darker, a fast sweep thins pale — and the film is translucent, so
//     the shading reads as ink rather than as a grey ramp. Where the stroke
//     crosses itself the films *add*, so a crossing dries darker, which one
//     path filled once could never do.
//   - **The dip and the lift.** A freshly loaded nib puts down a bead where it
//     first touches, and leaves a small pool where it lifts while it is still
//     wet — the two dark ends every dipped-pen stroke has.
//   - **Running dry.** The reservoir is spent per millimetre of edge dragged,
//     so a long stroke pales, then rails — the centre of the edge hollowing
//     while the corners keep writing — then breaks up on the paper's tooth and
//     gives out. How much ink a stroke starts with is the pen's own dial
//     (`load`), so a half-charged nib is a choice you make per stroke.
//
// Three more things about it are worth knowing before reading it.
//
// **The field is worked out on the page, and a landed mark is worked out
// once.** The grid's pitch is document pixels (see `PITCH`), so a stroke is
// the same picture at every zoom — and *because* it is, the pixels it dried
// into are kept and put down again rather than re-simulated by every pan,
// pinch and undo (see the store below `sameMark`, which is the wash's store
// one shelf along). A page of lettering is hundreds of strokes, and a repaint
// of it has to be hundreds of blits.
//
// **The gesture under the hand is simulated incrementally.** It is the one
// mark that is asked for again on every pointer sample, and re-walking it from
// its first point each time would make a frame cost the length of the stroke —
// the exact disease `trail.ts` cures one level up. So the live field is *kept
// between samples* (see `Hand`): a dab is settled into it for good as soon as
// nothing about it can change again, and only the last few — whose smoothed
// speeds still move as samples arrive, plus the pool that rides the lift —
// are laid provisionally and taken back out on the next frame (`undo`). A
// frame of a growing gesture therefore costs the new dabs, whatever the length
// of what came before, and the pixels flushed are the dirty patch rather than
// the field. The lift pool following the pen while it is down, and settling
// where it lifts, is not a shortcut showing — it is what the real pool does.
//
// **The mark grows from the front, by construction.** The calligraphy pen
// declares `PaintPlugin.grows`, so the canvas repaints a gesture in flight
// only where it has just grown — which makes it a hard rule here that nothing
// about a settled dab may depend on the path after it. The reservoir walk is
// front-to-back; the touch bead reads distance from the start; the waver is
// hashed on distance; and everything end-dependent rides on the provisional
// tail, inside the nib's reach of the newest points, which is inside the patch
// the trail repaints anyway. There is deliberately no live-versus-landed
// coarsening (the wash's `LIVE_BUDGET`): a coarser live grid would re-texture
// the whole mark as it grew, exactly the stale-patch glitch `grows` promises
// away.
//
// **It can always say no, and the old nib is what catches it.** No DOM, no
// canvas, an edge too few cells across, a mark too small on screen to be worth
// a field: every one of those falls through to `paintCalligraphy` — the flat
// quad fill that used to be the whole tool, kept as the fallback and nothing
// more. A browser that cannot run the simulation must still open every drawing
// and paint every mark, and at the scales that actually fall through the whole
// band is a hairline where none of the ink's character could show anyway.

import { SOLID_GROUND, type GroundProfile } from "../ground.ts";
import { createSurface, type Surface } from "../surface.ts";
import type { Point } from "../types.ts";
import { paintCalligraphy } from "./brushes.ts";
import { HAIRLINE, PIXEL, driftNoise, smoothstep, trace } from "./grain.ts";
import type { Trace } from "./grain.ts";
import { createQuillField, edge, type QuillField } from "./quillField.ts";
import { drawPatch, shadeLut, type ShadeLut } from "./quillShade.ts";
import {
  forgetStore,
  heldMark,
  keep,
  place,
  roomFor,
  sameGround,
  surfaceFor,
  weakly,
  type Ask,
  type Dried,
} from "./quillStore.ts";

/** How much page one cell of the field stands for: one document pixel — the
 *  wash's reading, for the wash's reason (see `washSim.ts`): the field is
 *  worked out on the page, never on the screen, so a stroke is the same
 *  picture at every zoom and its pixels can be kept. */
const PITCH = PIXEL;

/** The most cells a landed mark's swept band may cost. Measured against the
 *  band the edge actually sweeps rather than the mark's bounding box — a
 *  flourish drawn corner to corner has a box a hundred times its own area (the
 *  lead's lesson, see `leadSim.ts`). Past it the grid coarsens, and a landed
 *  mark is worked out once and kept, so it can afford to be generous. */
const BUDGET = 250_000;

/** …and the most cells a landed field may *span*, which is the memory: three
 *  arrays over the mark's box, most of which a diagonal stroke never
 *  touches. */
const SPAN_CAP = 1_200_000;

/** The live field's own span allowance, looser than the landed one: there is
 *  exactly one live field at a time where the store holds hundreds, and
 *  coarsening it mid-gesture is the one thing `grows` forbids. Past even this
 *  — a single unbroken gesture boxing more than a couple of thousand pixels a
 *  side — the gesture falls through to the flat nib and inks properly on the
 *  lift. */
const LIVE_SPAN = 4_000_000;

/** How much growing room a live field opens with beyond the first samples, in
 *  document pixels a side, so a gesture is not re-boxed on every stroke of a
 *  letter. When it outgrows even that the field is re-opened larger and the
 *  pixels carried over (see `regrow`). */
const HEADROOM = 192;

/** How many cells the nib's edge has to be across before a field is worth
 *  running. Below it there is nothing to rail and nothing to break — and the
 *  old nib draws a better hairline than a two-cell smudge. */
const LEAST_EDGE = 3;

/** How much page to leave round the mark, in cells: the feather's two, the
 *  waver, and one of slack. */
const MARGIN_CELLS = 4;

/** How far a full nib writes before it is spent, in multiples of its own edge
 *  width — the number the whole reservoir is measured in. Seventy edge-widths
 *  of a 2.5 mm nib is getting on for 18 cm of stroke: a flourished word,
 *  which is what one dip of a real pen writes — **on a sheet that does not
 *  drink.** A thirsty one pulls ink out of the nib as well as off it, so the
 *  same dip writes `DRINK` less on blotting-soft paper: the pen runs dry
 *  sooner on cold-pressed than on the sealed page, which any calligrapher who
 *  has written on watercolour stock will recognise at once. */
const TRAVEL_NIBS = 70;
const DRINK = 0.5;

/** How much wider the line comes out on an absorbent sheet — ink wicking
 *  sideways the moment it lands, the "line gain" every fountain-pen review
 *  measures paper by. A few percent: gain, not blur. */
const GAIN = 0.06;

/** The film one touch of a fully fed, unhurried nib aims to leave. */
const BASE_FILM = 1;

/** How the hand's speed moves the film: a slow hand pools towards
 *  `THIN_FAST + SPEED_SPAN`, a fast sweep thins towards `THIN_FAST`. The speed
 *  scale is document pixels between stored samples, read straight off the
 *  gesture the canvas kept (see `trace`), and the curve is sharpened past
 *  linear so a real hand's range — a couple of pixels dawdling, a dozen and
 *  more sweeping — actually spans the film range instead of huddling in the
 *  middle of it. This is the ink shading, and it has to be *visible*: it is
 *  most of what separates a written stroke from a filled one. */
const SPEED_SCALE = 12;
const SPEED_SHARP = 1.5;
const SPEED_SPAN = 0.9;
const THIN_FAST = 0.45;

/** The bead where a freshly loaded nib first touches down, and the pool a
 *  still-wet lift leaves: how strong each is at full charge, and how far into
 *  the stroke the touch bead carries (in edge-widths). */
const TOUCH_BEAD = 0.75;
const TOUCH_REACH = 0.9;
const LIFT_POOL = 0.85;

/** How readily this medium wicks into a thirsty sheet — the feather's
 *  strength. Half, times the sheet's absorbency: the same wetness the pen
 *  declares on its descriptor (`wetness: 0.5`), read the same way. */
const NIB_WETNESS = 0.5;

/** How pale a starved stroke goes when the fallback has to draw it — the flat
 *  fill's stand-in for the reservoir, so a low-load stroke does not snap to
 *  full-strength ink the moment the view is pulled back to a hairline. */
const FALLBACK_PALE = 0.45;

/** How raw samples' smoothed speeds settle: a sample's speed is averaged over
 *  its two neighbours either side (see `trace`), so it can still move until
 *  two more samples exist beyond it — and a dab laid from it is provisional
 *  until then. */
const SPEED_WINDOW = 2;

/** How much ink is left in the nib, 0–1ish (an overfilled nib starts above 1),
 *  and the two curves everything downstream reads off it: how freely the ink
 *  still flows, and how starved the edge writes. Pure and exported for the
 *  tests — the whole "runs dry" picture rests on these two lines. */
export function inkFlow(reserve: number): number {
  return 0.15 + 0.85 * smoothstep(0.05, 0.5, reserve);
}

export function inkDryness(reserve: number): number {
  return 1 - smoothstep(0.02, 0.5, reserve);
}

// --- One touch of the pen ----------------------------------------------------

/** Everything about the pen that is fixed for the length of one stroke. */
type Pen = {
  /** The half-edge at rest — the waver turns and stretches it per touch. */
  ex: number;
  ey: number;
  /** How far the touch bead carries, and how far a full film writes. */
  touchReach: number;
  travel: number;
  load: number;
  spacing: number;
};

function penFor(
  size: number,
  angle: number,
  load: number,
  cell: number,
  ground: GroundProfile,
): Pen {
  const edgeWidth = 2 * size;
  const soak = Math.max(0, Math.min(1, ground.absorbency));
  // The paper's two claims on the pen: a thirsty sheet widens the line a
  // little the moment the ink lands, and drains the reservoir as it writes.
  const half = size * (1 + GAIN * soak);
  return {
    ex: Math.cos(angle) * half,
    ey: Math.sin(angle) * half,
    touchReach: TOUCH_REACH * edgeWidth,
    travel: (TRAVEL_NIBS * edgeWidth) / (1 + DRINK * soak),
    load,
    // Touches close enough together that consecutive edge lines tile the band
    // with no gap at this cell size.
    spacing: Math.max(0.5, cell * 0.8),
  };
}

/** Lay one touch of the pen and answer the reservoir after it — the single
 *  place a dab's film is decided, walked by the landed path and the live path
 *  alike so the two cannot drift apart. `last` carries the lift pool; `log`
 *  collects the deposits of a provisional touch so the next frame can take
 *  them back out (see `Hand.undo`). */
function lay(
  field: QuillField,
  pen: Pen,
  p: Trace,
  last: boolean,
  reserve: number,
  log?: number[],
): number {
  const flow = inkFlow(reserve);
  const dry = inkDryness(reserve);
  // A slow hand pools, a fast sweep thins — the ink shading of a real pen,
  // read straight off the samples the canvas stored.
  const hurry = 1 / (1 + (p.speed / SPEED_SCALE) ** SPEED_SHARP);
  let film = BASE_FILM * flow * (THIN_FAST + SPEED_SPAN * hurry);
  // The bead where a charged nib first touches down. An overfilled nib (load
  // past 1) blobs harder, a starving one has no bead to leave.
  if (p.at < pen.touchReach) {
    film *=
      1 +
      TOUCH_BEAD *
        Math.min(1.3, pen.load) *
        (1 - p.at / pen.touchReach) *
        smoothstep(0.25, 0.8, reserve);
  }
  // …and the pool a still-wet lift leaves, riding on whichever touch is
  // currently the pen's last: settled only when the pen actually lifts.
  if (last) {
    film *= 1 + LIFT_POOL * hurry * smoothstep(0.3, 0.9, reserve);
  }
  // No hand holds a pen edge dead steady: the edge breathes a couple of
  // degrees and a few percent as it travels, hashed on distance so the same
  // stroke wavers the same way for ever.
  const rot = (driftNoise(p.at / 19, 7) - 0.5) * 0.09;
  const swell = 0.97 + 0.06 * driftNoise(p.at / 29, 13);
  const cos = Math.cos(rot) * swell;
  const sin = Math.sin(rot) * swell;
  const ex = pen.ex * cos - pen.ey * sin;
  const ey = pen.ex * sin + pen.ey * cos;
  edge(field, p.x, p.y, ex, ey, film, dry, pen.spacing, log);
  return Math.max(0, reserve - (film * pen.spacing) / pen.travel);
}

/** Drag the nib along the whole path, spending the reservoir as it goes — the
 *  landed mark's walk, and the specification the live path settles towards.
 *  Exported for the tests, which drive it straight onto a field: the shading,
 *  the dip, the lift and the running dry are all claims about what this leaves
 *  behind, and none of them needs a canvas. */
export function scribe(
  field: QuillField,
  points: readonly Point[],
  size: number,
  angle: number,
  load: number,
  cell: number,
): void {
  const pen = penFor(size, angle, load, cell, field.ground);
  const along = trace(points, pen.spacing);
  const first = along[0];
  if (!first) return;
  if (along.length === 1) {
    tap(field, pen, first, load);
    return;
  }
  let reserve = load;
  const last = along.length - 1;
  for (let i = 0; i <= last; i++) {
    reserve = lay(field, pen, along[i]!, i === last, reserve);
  }
}

/** A press and a lift: the touch bead and nothing else — a wet dash the width
 *  of the edge, like the warm-up marks at the head of an ink test. `log` for a
 *  press that may yet move, exactly as `lay`'s. */
function tap(
  field: QuillField,
  pen: Pen,
  at: Trace,
  load: number,
  log?: number[],
): void {
  edge(
    field,
    at.x,
    at.y,
    pen.ex,
    pen.ey,
    BASE_FILM * (1 + TOUCH_BEAD * Math.min(1.3, load)) * inkFlow(load),
    inkDryness(load),
    Math.max(pen.spacing, Math.hypot(pen.ex, pen.ey) * 0.5),
    log,
  );
}

/** Let go of every mark held — the landed store and the live field alike — so
 *  the next ask for one works it out again; and, when asked, hold the store to
 *  smaller bounds from here on. For the tests, exactly as the wash's is (see
 *  `forgetDriedWashes`): it changes no picture, only lets a test ask what a
 *  repaint cost. */
export function forgetDriedInk(bounds?: {
  marks?: number;
  cells?: number;
}): void {
  forgetStore(bounds);
  hand = null;
}

// --- Painting ---------------------------------------------------------------

/** Paint a calligraphy mark: the ink simulation wherever it can run, and the
 *  flat quad fill it replaced wherever it cannot — a hairline at a far
 *  zoom-out, a nib too fine for the field, a browser with no canvas to work
 *  on. The fall-through lives here rather than at the call site, which is what
 *  makes "it must fall back rather than fail" a property of the seam instead
 *  of a thing every caller has to remember.
 *
 *  The fallback still reads the reservoir the one way a flat fill can: a
 *  starved stroke draws pale rather than snapping to full-strength ink the
 *  moment the view is pulled back far enough to change painter. */
export function paintInk(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  angle = -Math.PI / 4,
  load = 1,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  page = "#ffffff",
  live = false,
): void {
  const painted = live
    ? paintLiveInk(ctx, points, size, scale, angle, load, ground, color, page)
    : paintSimulatedInk(
        ctx,
        points,
        size,
        scale,
        angle,
        load,
        ground,
        color,
        page,
      );
  if (painted) return;
  const charge = Math.max(0.05, Math.min(1, load));
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (FALLBACK_PALE + (1 - FALLBACK_PALE) * charge);
  paintCalligraphy(ctx, points, size, scale, angle);
  ctx.globalAlpha = alpha;
}

/** Whether a mark is big enough on this device, and its edge coarse enough on
 *  the page, to be worth a field at all. */
function worthAField(size: number, scale: number): boolean {
  if (size <= 0) return false;
  if (2 * size * scale < HAIRLINE) return false;
  return (2 * size) / PITCH >= LEAST_EDGE;
}

/** Write a landed calligraphy mark by pressing a finite bead of ink through a
 *  broad nib — worked out once, kept, and blitted thereafter. `false` when
 *  this engine could not; the caller then draws the mark with the flat nib,
 *  which is never a failure, only a smaller picture.
 *
 *  `size` is the stroke's own (the tool has already halved the button — see
 *  the calligraphy registration), so the edge runs `size` either side of the
 *  path, exactly as the flat nib's does. `scale` is read for one thing only:
 *  whether the mark is big enough on this device to be worth a field. */
export function paintSimulatedInk(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  angle = -Math.PI / 4,
  load = 1,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  page = "#ffffff",
): boolean {
  if (points.length === 0 || !worthAField(size, scale)) return false;
  const asked: Ask = {
    points,
    size,
    angle,
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
  // the same answer a fresh scribe would reach (see `advanceScribe`), so it is
  // promoted into the store instead of being worked out a second time — which
  // is what makes the lift of a long flourish free instead of a hiccup.
  const promoted = promoteHand(asked);
  if (promoted) {
    keep(promoted, roomFor(promoted.width, promoted.height).admit);
    place(ctx, promoted);
    return true;
  }

  // How coarse to work: the page's own pitch, coarsened only where the swept
  // band would blow the budget — and the memory of the box capped separately
  // (the lead's two caps, see `leadSim.ts`).
  const reach = size * 1.1 + 1;
  const box = boundsOf(points);
  const swept = pathLengthOf(points);
  let cell = PITCH;
  for (let tries = 0; tries < 8; tries++) {
    const band = ((swept + 2 * reach) * (2 * reach + 2 * cell)) / (cell * cell);
    if (band <= BUDGET) break;
    cell *= Math.sqrt(band / BUDGET);
  }
  // An edge only a couple of cells across has nothing to rail or break.
  if ((2 * size) / cell < LEAST_EDGE) return false;

  let pad = reach + MARGIN_CELLS * cell;
  let x = box.x - pad;
  let y = box.y - pad;
  let width = Math.ceil((box.width + pad * 2) / cell);
  let height = Math.ceil((box.height + pad * 2) / cell);
  if (width * height > SPAN_CAP) {
    cell *= Math.sqrt((width * height) / SPAN_CAP);
    if ((2 * size) / cell < LEAST_EDGE) return false;
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

  const field = createQuillField({
    x,
    y,
    width,
    height,
    cell,
    ground,
    wick: NIB_WETNESS * Math.max(0, Math.min(1, ground.absorbency)),
  });
  scribe(field, points, size, angle, asked.load, cell);
  if (!drawPatch(surface, field, shadeLut(color, page), 0, 0, width, height)) {
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

// --- The gesture under the hand ----------------------------------------------

/** The canvas-free half of the gesture in flight: the field, the pen, and how
 *  far the walk has settled into it. Exported, with `openScribe` and
 *  `advanceScribe`, for the tests — the claim that a gesture advanced sample
 *  by sample lays the same film as one full `scribe` of the finished path is
 *  the whole correctness of the live path, and it needs no canvas to check. */
export type ScribeState = {
  /** The gesture as of the last advance — the next one must be this with more
   *  on the end, or the caller starts the field over (see `grownBy`). */
  points: readonly Point[];
  pen: Pen;
  field: QuillField;
  /** How many touches are settled into the field for good, and the reservoir
   *  as of the last settled one. */
  settled: number;
  reserve: number;
  /** The provisional touches' deposits, as `(cell, amount)` pairs — everything
   *  the next advance subtracts back out before it lays the tail again. */
  undo: number[];
};

/** Open a walk over a field for a gesture that has not laid anything yet. */
export function openScribe(
  field: QuillField,
  size: number,
  angle: number,
  load: number,
): ScribeState {
  return {
    points: [],
    pen: penFor(size, angle, load, field.cell, field.ground),
    field,
    settled: 0,
    reserve: load,
    undo: [],
  };
}

/** Walk the gesture on to `points` — which must be the state's own path with
 *  more on the end. The provisional tail of the last advance is taken back
 *  out, every touch whose smoothed speed can no longer change is settled for
 *  good, and the still-moving tail is laid provisionally again, the lift pool
 *  riding its end. Answers the patch of field the advance touched. */
export function advanceScribe(
  state: ScribeState,
  points: readonly Point[],
): Patch {
  const { field, pen } = state;
  const dirty = newPatch();
  const load = state.pen.load;
  const reachBy = Math.hypot(pen.ex, pen.ey) + MARGIN_CELLS * field.cell;

  // Take back the provisional tail from the last advance…
  const undo = state.undo;
  for (let i = 0; i < undo.length; i += 2) {
    const at = undo[i]!;
    field.film[at] = Math.max(0, field.film[at]! - undo[i + 1]!);
    const col = at % field.width;
    const row = (at - col) / field.width;
    widen(
      dirty,
      field,
      field.x + (col + 0.5) * field.cell,
      field.y + (row + 0.5) * field.cell,
      field.cell,
    );
  }

  // …then walk on: settle every touch whose speed can no longer change, and
  // lay the still-moving tail provisionally.
  const along = trace(points, pen.spacing);
  const last = along.length - 1;
  const log: number[] = [];
  if (last === 0) {
    // Still a single press: one provisional touch, taken back if it grows.
    tap(field, pen, along[0]!, load, log);
    widen(dirty, field, along[0]!.x, along[0]!.y, reachBy);
  } else {
    const settledAt = settledSpan(points);
    let reserve = state.reserve;
    let settled = state.settled;
    while (settled < along.length && along[settled]!.at <= settledAt) {
      const p = along[settled]!;
      reserve = lay(field, pen, p, false, reserve);
      widen(dirty, field, p.x, p.y, reachBy);
      settled++;
    }
    state.settled = settled;
    state.reserve = reserve;
    for (let i = settled; i <= last; i++) {
      const p = along[i]!;
      reserve = lay(field, pen, p, i === last, reserve, log);
      widen(dirty, field, p.x, p.y, reachBy);
    }
  }
  state.undo = log;
  state.points = points;
  return dirty;
}

/** The one stroke still being written, kept between pointer samples so a frame
 *  costs the dabs that arrived rather than the length of the gesture: the walk,
 *  and the pixels it has already been flushed to. */
type Hand = {
  state: ScribeState;
  size: number;
  angle: number;
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
 *  `trail.ts`): a gesture appends immutable points, so anything rebuilt fails
 *  and the field starts over, which costs a walk rather than a wrong mark. */
function grownBy(prior: readonly Point[], next: readonly Point[]): boolean {
  if (next.length < prior.length) return false;
  for (let i = 0; i < prior.length; i++) {
    if (prior[i] !== next[i]) return false;
  }
  return true;
}

/** The path length up to the last raw sample whose smoothed speed can no
 *  longer change — touches at or before it are safe to settle. */
function settledSpan(points: readonly Point[]): number {
  const final = points.length - 1 - SPEED_WINDOW;
  if (final <= 0) return 0;
  let span = 0;
  for (let i = 1; i <= final; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    span += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return span;
}

/** A dirty patch of field, grown touch by touch and flushed once per frame. */
type Patch = { left: number; top: number; right: number; bottom: number };

function newPatch(): Patch {
  return { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
}

function widen(
  patch: Patch,
  field: QuillField,
  x: number,
  y: number,
  by: number,
): void {
  const left = (x - by - field.x) / field.cell;
  const top = (y - by - field.y) / field.cell;
  const right = (x + by - field.x) / field.cell;
  const bottom = (y + by - field.y) / field.cell;
  if (left < patch.left) patch.left = left;
  if (top < patch.top) patch.top = top;
  if (right > patch.right) patch.right = right;
  if (bottom > patch.bottom) patch.bottom = bottom;
}

/** Open a fresh live field over the gesture so far, with growing room. */
function openHand(
  points: readonly Point[],
  size: number,
  angle: number,
  load: number,
  ground: GroundProfile,
  color: string,
  page: string,
): Hand | null {
  const box = boundsOf(points);
  const pad = size * 1.1 + 1 + MARGIN_CELLS + HEADROOM;
  const x = box.x - pad;
  const y = box.y - pad;
  const width = Math.ceil(box.width + pad * 2);
  const height = Math.ceil(box.height + pad * 2);
  if (width * height > LIVE_SPAN) return null;
  const surface = createSurface(width, height);
  if (!surface) return null;
  const field = createQuillField({
    x,
    y,
    width,
    height,
    cell: PITCH,
    ground,
    wick: NIB_WETNESS * Math.max(0, Math.min(1, ground.absorbency)),
  });
  return {
    state: openScribe(field, size, angle, load),
    size,
    angle,
    load,
    color,
    page,
    ground,
    surface,
    lut: shadeLut(color, page),
  };
}

/** Re-open the live field larger when the gesture outgrows it, carrying the
 *  cells and the pixels over — an occasional copy instead of a per-frame
 *  restart. `null` when the gesture has outgrown what a live field may span,
 *  and the caller falls through to the flat nib. */
function regrow(held: Hand, points: readonly Point[]): Hand | null {
  const box = boundsOf(points);
  const pad = held.size * 1.1 + 1 + MARGIN_CELLS + HEADROOM;
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
  const field = createQuillField({
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
 *  for one — and the flat nib then draws the gesture until it lands. */
function paintLiveInk(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  scale = 1,
  angle = -Math.PI / 4,
  load = 1,
  ground: GroundProfile = SOLID_GROUND,
  color = "#000000",
  page = "#ffffff",
): boolean {
  if (points.length === 0 || !worthAField(size, scale)) return false;
  const charge = Math.max(0.05, load);

  let held =
    hand &&
    hand.size === size &&
    hand.angle === angle &&
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
    const pad = size * 1.1 + 1 + MARGIN_CELLS;
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
    held = openHand(points, size, angle, charge, ground, color, page);
  }
  if (!held) {
    hand = null;
    return false;
  }
  hand = held;

  // Walk the gesture on, then flush the patch of film it touched into pixels
  // and put the mark down.
  const dirty = advanceScribe(held.state, points);
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
 *  mark's own box. `null` whenever the ask is not the gesture in hand — a
 *  repaint of some older mark, a gesture the flat nib was drawing, a field too
 *  big for the landed store — and the caller works the mark out afresh. */
function promoteHand(ask: Ask): Dried | null {
  const held = hand;
  if (
    !held ||
    held.size !== ask.size ||
    held.angle !== ask.angle ||
    held.load !== ask.load ||
    held.color !== ask.color ||
    held.page !== ask.page ||
    !sameGround(held.ground, ask.ground) ||
    !grownBy(held.state.points, ask.points)
  ) {
    return null;
  }
  const from = held.state.field;
  const pad = ask.size * 1.1 + 1 + MARGIN_CELLS;
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

  const dirty = advanceScribe(held.state, ask.points);
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

/** The box the path itself covers, before anything is added for the nib. */
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
