// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Dragging a charged head with the paint field.
//
// `bristleField.ts` knows about paint and paper and nothing else. This is the
// part that knows about a *gesture* — and about the head on the end of the
// handle: how far it is squeezed toward a blade, which hairs are on the paper,
// and the one thing the old geometric painter could never quite mean: **a
// finite dip of paint**. It opens a field over the patch of page the mark can
// reach, walks the path pressing the head's cross-section into the sheet, and
// spends the reservoir as it goes; what the paper took is then turned into
// pixels.
//
// What the field buys over the vector hairs it replaces:
//
//   - **One head, round to flat.** The cross-section laid at each touch is
//     the head's footprint projected across the path (`projected`), so a
//     flatness of 0 is the round that draws the same width whichever way you
//     pull it, 1 is the blade that lays its full width square across itself
//     and closes to a heavy hairline along its edge, and everything between
//     is a filbert. Two brushes became one dial.
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
import {
  createBristleField,
  press,
  type BristleField,
} from "./bristleField.ts";
import {
  HAIRLINE,
  PIXEL,
  driftWalk,
  hashedRandom,
  smoothstep,
  trace,
  type DriftWalk,
  type Trace,
} from "./grain.ts";
import { BLADE, hairLayout } from "./head.ts";
import { paintPath } from "./ink.ts";
import { mm } from "../units.ts";
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

/** How much page to leave round the mark, in cells: the feather's two, the
 *  line gain, and one of slack. */
const MARGIN_CELLS = 4;

/** How much optical density one unit of paint film is worth — the number
 *  that makes this medium *body paint* where the quill's 0.55 is ink: one
 *  honest pass reads nearly opaque, a thinned or starved passage shades, and
 *  a crossing barely deepens. It has to stay short of full saturation or the
 *  streaks the comb scratches through the slab would have nothing to show. */
const PAINT_DENSITY = 2.1;

/** How readily this medium wicks into a thirsty sheet — the feather's
 *  strength: the same wetness the brush declares on its descriptor
 *  (`wetness: 0.6`), read the same way. */
const BRUSH_WETNESS = 0.6;

/** How much a thirsty sheet drinks out of the reservoir as the head travels —
 *  smaller than the pen's, because paint is thick and gives its medium up
 *  slowly. */
const DRINK = 0.35;

/** The run one dip buys, in document pixels: a floor so a liner is not spent
 *  in a centimetre, plus so much per pixel of head — the same charge the
 *  vector painter spends (`capacityOf`), kept in step so a mark that falls
 *  back runs dry where the field would have. */
const CHARGE_FLOOR = mm(9);
const CHARGE_RUN = 10.5;

/** What a chisel ferrule leaves of the round's reservoir: a flat lays a wider
 *  mark off a shallower store, so a full flat runs about half as far as the
 *  round on the same dip (see `reservoirOf` in `head.ts`, whose number this
 *  is). */
const FLAT_RESERVOIR = 0.5;

/** How far past its last paint the head keeps marking, as a multiple of the
 *  charge it just spent, and how thick that film of residue starts: the
 *  trail every reference stroke peters out through. */
const RESIDUE_RUN = 1;
const RESIDUE_FILM = 0.3;

/** The film one touch of a fully fed, unhurried head aims to leave. */
const BASE_FILM = 1;

/** How the hand's speed moves the film. Paint shades far less than ink — a
 *  fast drag thins and skips a little rather than paling to a wash — so the
 *  span is modest and the floor high. */
const SPEED_SCALE = 14;
const SPEED_SHARP = 1.5;
const SPEED_SPAN = 0.4;
const THIN_FAST = 0.66;

/** The heavier deposit where a charged head first touches down, and how far
 *  into the stroke it carries (in head widths). A press, not the pen's bead:
 *  paint blobs less than ink pools. */
const TOUCH_BEAD = 0.3;
const TOUCH_REACH = 0.6;

/** How far back from the lift the mark comes apart into leaving hairs, as a
 *  share of the head — and how ragged the touch-down end is, likewise. Both
 *  are the cut bundle's few-tenths-of-a-head disagreement about where each
 *  hair starts and stops (see `hairTraits`, whose numbers these echo). */
const LIFT_SHARE = 0.35;
const LAND_SHARE = 0.25;

/** The paper's grain, in document pixels — the pitch of cold-pressed ridges,
 *  the same number the vector painter reads (`TOOTH` in `bristle.ts`): how
 *  far the head travels before the sheet is a different height under it. */
const TOOTH = mm(1.8);

/** How pale a starved stroke goes when the plain-line fallback has to draw it
 *  — the stand-in for the reservoir, so a low-load stroke does not snap to
 *  full-strength paint when the view is pulled back to a hairline. */
const FALLBACK_PALE = 0.45;

/** How raw samples' smoothed speeds settle: a sample's speed is averaged over
 *  its two neighbours either side (see `trace`), so it can still move until
 *  two more samples exist beyond it. */
const SPEED_WINDOW = 2;

/** How much paint is left in the head, 0–1ish, and the two curves everything
 *  downstream reads off it: how freely the paint still comes off the hairs,
 *  and how starved the head presses. Pure and exported for the tests — the
 *  whole "runs dry" picture rests on these two lines. A loaded head
 *  *plateaus*: it covers solidly for most of its run and gives out over the
 *  last stretch, which is why the smoothstep shoulders sit low. */
export function paintFlow(reserve: number): number {
  return 0.12 + 0.88 * smoothstep(0.04, 0.45, reserve);
}

export function paintDryness(reserve: number): number {
  return 1 - smoothstep(0, 0.22, reserve);
}

/** The half-width of the mark where the head crosses the path like this — the
 *  head's footprint projected across the stroke.
 *
 *  `bn` is how much of the blade lies across the path, `bt` how much along
 *  it (the two are cos and sin of one angle), and `minor` how thick the head
 *  is against its blade: 1 for a round, `BLADE` for a full flat. A round
 *  comes out `half` whichever way the path runs; a flat swells to its full
 *  width square across itself and closes to `half × BLADE` along its own
 *  edge — which is the entire reason a sign-writer owns one. Exported for
 *  the tests: this one line is what the flatness dial *is*. */
export function projected(
  half: number,
  minor: number,
  bn: number,
  bt: number,
): number {
  return half * Math.hypot(bn, minor * bt);
}

// --- The head, fixed for the length of one stroke -----------------------------

type Pen = {
  /** The half-width at rest, after the sheet's line gain. */
  half: number;
  /** How thick the head is against its blade (1 round … `BLADE` flat), and
   *  which way the blade is turned. */
  minor: number;
  bladeX: number;
  bladeY: number;
  /** How far one dip runs, where the touch bead reaches, and how far back
   *  from either end the hairs disagree. */
  capacity: number;
  /** How far the trail of film runs past the last of the paint — scaled off
   *  the charge that was actually dipped, so a light dip trails briefly. */
  residueRun: number;
  touchReach: number;
  liftWindow: number;
  load: number;
  hard: number;
  spacing: number;
  /** How much of the grain's interruptions a head this narrow can show. */
  grainShare: number;
  /** The hairs: how many, what each lays, how readily each leaves the paper,
   *  how long its skips run, and where it lands and lifts. Parallel, `hairs`
   *  long, settled before anything is laid. */
  hairs: number;
  thick: Float64Array;
  dryEdge: Float64Array;
  skipRun: Float64Array;
  lands: Float64Array;
  lifts: Float64Array;
  /** One drift walker per hair, and one for the tooth the whole head reads —
   *  reused across touches because the walk visits them in arc order. */
  walkers: DriftWalk[];
  toothWalk: DriftWalk;
  /** The comb one touch presses down — scratch, rewritten per touch. */
  comb: Float32Array;
};

function penFor(
  size: number,
  flatness: number,
  angle: number,
  hardness: number,
  load: number,
  cell: number,
  ground: GroundProfile,
): Pen {
  const hard = Math.max(0, Math.min(1, hardness));
  const flat = Math.max(0, Math.min(1, flatness));
  const soak = Math.max(0, Math.min(1, ground.absorbency));
  // The paper's two claims on the head: a thirsty sheet widens the line a
  // little the moment the paint lands, and drinks the reservoir as it runs.
  const half = (size / 2) * (1 + 0.05 * soak);
  // One *full* dip's run: the vector painter's own charge (`capacityOf`),
  // times what the ferrule keeps of it. The load dial is the reservoir the
  // walk starts with, not a second scale on this — a half dip runs half of
  // this because it starts half spent.
  const capacity =
    (((CHARGE_FLOOR + size * CHARGE_RUN) * (0.45 + hard * 1.6)) /
      (1 + DRINK * soak)) *
    (1 - flat * (1 - FLAT_RESERVOIR));
  const { count } = hairLayout(size);
  const thick = new Float64Array(count);
  const dryEdge = new Float64Array(count);
  const skipRun = new Float64Array(count);
  const lands = new Float64Array(count);
  const lifts = new Float64Array(count);
  const walkers: DriftWalk[] = new Array(count);
  const liftWindow = size * LIFT_SHARE;
  const landRagged = size * LAND_SHARE;
  const edgeStart = 0.78;
  for (let b = 0; b < count; b++) {
    const lane = count === 1 ? 0 : (b / (count - 1) - 0.5) * 2;
    // How far into the *side* of the head this hair is: everything that frays
    // a mark is gated on it, so the body cuts clean and the rim combs open —
    // the same shape `fitHead` gives the vector painter.
    const edge =
      Math.max(0, (Math.abs(lane) - edgeStart) / (1 - edgeStart)) ** 1.5;
    // Not all much of a muchness: a head is a row of clumps, so a few strands
    // lay heavily and most lay their share — squared, so the broad ones stay
    // the exception they are on paper.
    thick[b] = 0.72 + 0.56 * hashedRandom(b * 11.7, 5) ** 2;
    // The outer hairs go first whatever the head — they carry the least paint
    // and take the least pressure — and a dry, ungathered bundle skips all
    // over (see `hairTraits`, whose curve this is).
    dryEdge[b] =
      0.03 +
      (1 - hard) * 0.3 +
      lane * lane * (1 - hard) * 0.22 +
      edge * 0.42 * (1.4 - hard) +
      hashedRandom(b * 7.1, b * 3.3) * 0.07;
    // How long this hair's dry stretches run — per hair, so the skips across
    // the head are not all the same length, which would be a dashed line.
    // Long: a parting in a loaded slab runs most of the stroke, and a run
    // much shorter than the head reads as stipple rather than as combing.
    skipRun[b] = Math.max(30, size * (0.9 + hashedRandom(b * 2.7, 33) * 2.4));
    // Where this hair touches down and rolls off: a cut bundle is level only
    // near enough, and the lift end frays further than the landing.
    lands[b] = hashedRandom(b * 4.7, 13) ** 1.6 * landRagged;
    lifts[b] = hashedRandom(b * 6.1, 29) ** 1.4 * liftWindow;
    const walk = driftWalk();
    walk.reset(b * 17 + 3);
    walkers[b] = walk;
  }
  const toothWalk = driftWalk();
  toothWalk.reset(3);
  return {
    half,
    minor: BLADE + (1 - BLADE) * (1 - flat),
    bladeX: Math.cos(angle),
    bladeY: Math.sin(angle),
    capacity,
    residueRun: capacity * RESIDUE_RUN * Math.max(0.05, Math.min(1.3, load)),
    touchReach: TOUCH_REACH * size,
    liftWindow,
    load,
    hard,
    // Touches close enough together that consecutive sections tile the band
    // with no gap at this cell size.
    spacing: Math.max(0.5, cell * 0.8),
    // The grain is the paper's, so it does not shrink with the brush: a
    // liner rides the sheet a house brush catches on (the vector painter's
    // own reading).
    grainShare: 0.35 + 0.65 * Math.min(1, (size / (TOOTH * 1.6)) ** 0.7),
    hairs: count,
    thick,
    dryEdge,
    skipRun,
    lands,
    lifts,
    walkers,
    toothWalk,
    comb: new Float32Array(count),
  };
}

/** Work out which hairs are down at this touch, and how much of the film each
 *  is laying — the comb `press` reads a lane at a time.
 *
 *  Everything in it is a function of the path *up to and at* this touch (arc
 *  distance, speed, reserve) plus `fromEnd`, which only ever matters inside
 *  the lift window — that is the whole of the `grows` contract, kept here in
 *  one place. */
function combOver(
  pen: Pen,
  at: number,
  fromEnd: number,
  speed: number,
  dry: number,
): Float32Array {
  const comb = pen.comb;
  const tooth = pen.toothWalk.at(at / TOOTH);
  // Two thresholds added together, and they are two different things: the
  // first is *texture* — how streaky this stretch is — capped short of
  // certainty and scaled to what a head this narrow can show; the second is
  // the paint going, and it is capped too, deliberately short of lifting
  // every hair: what actually ends the mark is the sheet refusing a starving
  // head (`catching`) and the trail of film fading out (`residueRun`), so
  // the comb's job here is only to thin the head out toward those.
  const base = Math.min(0.3, speed / 70) + (0.5 - tooth) * 0.15;
  const spent = Math.min(0.6, dry * 0.75);
  for (let b = 0; b < pen.hairs; b++) {
    if (at < pen.lands[b]! || fromEnd < pen.lifts[b]!) {
      comb[b] = 0;
      continue;
    }
    const wet = pen.walkers[b]!.at(at / pen.skipRun[b]!);
    const dryness =
      Math.min(0.75, pen.dryEdge[b]! + base) * pen.grainShare + spent;
    if (wet < dryness) {
      comb[b] = 0;
      continue;
    }
    // On the paper, and bearing down by however far past its threshold the
    // drift is — which is what keeps a hair's run from being a wire of one
    // even thickness.
    comb[b] = pen.thick[b]! * (0.66 + 0.34 * smoothstep(0, 0.3, wet - dryness));
  }
  return comb;
}

/** Lay one touch of the head and spend the reservoir — the single place a
 *  touch's film is decided, walked by the landed path and the live path alike
 *  so the two cannot drift apart. `nx`/`ny` is the unit normal across the
 *  path there; `s` carries the reservoir and where it ran out; `log` collects
 *  a provisional touch's deposits so the next frame can take them back out. */
function daub(
  field: BristleField,
  pen: Pen,
  p: Trace,
  nx: number,
  ny: number,
  fromEnd: number,
  s: { reserve: number; spentAt: number },
  log?: number[],
): void {
  const dry = paintDryness(s.reserve);
  // A slow hand lays a fuller film, a fast sweep thins — read straight off
  // the samples the canvas stored.
  const hurry = 1 / (1 + (p.speed / SPEED_SCALE) ** SPEED_SHARP);
  let film =
    BASE_FILM * paintFlow(s.reserve) * (THIN_FAST + SPEED_SPAN * hurry);
  if (s.reserve <= 0) {
    // Past the last of the paint: the film left on the hairs, thin and fading
    // over about as far again as the charge ran — and past that, nothing, so
    // however far the hand carries on the tail costs nothing and leaves
    // nothing.
    const gone = (p.at - s.spentAt) / pen.residueRun;
    if (gone >= 1) return;
    film =
      BASE_FILM *
      RESIDUE_FILM *
      (1 - gone) ** 1.2 *
      (THIN_FAST + SPEED_SPAN * hurry);
  } else {
    // The heavier press where a charged head first touches down. An overdipped
    // head blobs harder; a starving one has nothing to press out.
    if (p.at < pen.touchReach) {
      film *=
        1 +
        TOUCH_BEAD *
          Math.min(1.3, pen.load) *
          (1 - p.at / pen.touchReach) *
          smoothstep(0.25, 0.8, s.reserve);
    }
    // …and the mark thins a little as the head rolls off, inside the lift
    // window the leaving hairs already own. Exactly 1 at the window's edge,
    // so a settled touch cannot feel the end moving away from it.
    if (fromEnd < pen.liftWindow) {
      film *= 0.72 + 0.28 * (fromEnd / pen.liftWindow);
    }
  }
  // How much of the blade lies across the path here — the projection that is
  // the whole difference between a round and a flat. The paint the blade
  // stops laying sideways it carries into the narrower band instead, so an
  // edge-on flat writes a heavy line, not a faint one.
  const bn = pen.bladeX * nx + pen.bladeY * ny;
  const bt = pen.bladeX * -ny + pen.bladeY * nx;
  const w = projected(pen.half, pen.minor, bn, bt);
  if (w < field.cell * 0.5) return;
  film *= Math.min(1.6, Math.sqrt(pen.half / w));
  const comb = combOver(pen, p.at, fromEnd, p.speed, dry);
  press(field, p.x, p.y, nx * w, ny * w, film, dry, pen.spacing, comb, log);
  if (s.reserve > 0) {
    const left = s.reserve - ((film / BASE_FILM) * pen.spacing) / pen.capacity;
    s.reserve = Math.max(0, left);
    if (s.reserve === 0) s.spentAt = p.at;
  }
}

/** The unit normal across the walk at touch `i`. */
function normalAt(
  along: readonly Trace[],
  i: number,
): { nx: number; ny: number } {
  const prev = along[Math.max(0, i - 1)]!;
  const next = along[Math.min(along.length - 1, i + 1)]!;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

/** A press and a lift with no drag: the print of the head — a disc for a
 *  round, the blade's bar for a flat, and the ellipse between for everything
 *  between — laid as parallel sections across the footprint's thin axis. */
function dab(field: BristleField, pen: Pen, at: Trace, log?: number[]): void {
  const across = pen.half * pen.minor;
  const rows = Math.max(1, Math.ceil((2 * across) / pen.spacing));
  const film =
    BASE_FILM *
    (1 + TOUCH_BEAD * Math.min(1.3, pen.load)) *
    paintFlow(pen.load);
  const dry = paintDryness(pen.load);
  // The blade's own direction and its normal — the footprint's two axes.
  const bx = pen.bladeX;
  const by = pen.bladeY;
  // A press puts the whole bundle down at once, so the comb skips the
  // landing and leaving gates a drag walks its hairs through.
  const comb = pen.comb;
  for (let b = 0; b < pen.hairs; b++) comb[b] = pen.thick[b]!;
  for (let r = 0; r <= rows; r++) {
    const v = rows === 0 ? 0 : (r / rows - 0.5) * 2;
    const chord = pen.half * Math.sqrt(Math.max(0, 1 - v * v));
    if (chord < field.cell * 0.4) continue;
    const cx = at.x - by * v * across;
    const cy = at.y + bx * v * across;
    press(
      field,
      cx,
      cy,
      bx * chord,
      by * chord,
      film,
      dry,
      Math.max(pen.spacing, (2 * across) / Math.max(1, rows)),
      comb,
      log,
    );
  }
}

/** Drag the head along the whole path, spending the reservoir as it goes —
 *  the landed mark's walk, and the specification the live path settles
 *  towards. Exported for the tests and the tuning harness: the streaks, the
 *  press, the lift and the running dry are all claims about what this leaves
 *  behind, and none of them needs a canvas. */
export function drag(
  field: BristleField,
  points: readonly Point[],
  size: number,
  flatness: number,
  angle: number,
  hardness: number,
  load: number,
  cell: number,
): void {
  const pen = penFor(size, flatness, angle, hardness, load, cell, field.ground);
  const along = trace(points, pen.spacing);
  const first = along[0];
  if (!first) return;
  if (along.length === 1) {
    dab(field, pen, first);
    return;
  }
  const s = { reserve: Math.max(0, load), spentAt: 0 };
  const last = along.length - 1;
  const total = along[last]!.at;
  for (let i = 0; i <= last; i++) {
    const p = along[i]!;
    const { nx, ny } = normalAt(along, i);
    daub(field, pen, p, nx, ny, total - p.at, s);
  }
}

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

// --- The gesture under the hand ----------------------------------------------

/** The canvas-free half of the gesture in flight: the field, the head, and
 *  how far the walk has settled into it. Exported, with `openDrag` and
 *  `advanceDrag`, for the tests — the claim that a gesture advanced sample by
 *  sample lays the same film as one full `drag` of the finished path is the
 *  whole correctness of the live path, and it needs no canvas to check. */
export type DragState = {
  /** The gesture as of the last advance — the next one must be this with more
   *  on the end, or the caller starts the field over (see `grownBy`). */
  points: readonly Point[];
  pen: Pen;
  field: BristleField;
  /** How many touches are settled into the field for good, and the reservoir
   *  as of the last settled one. */
  settled: number;
  reserve: number;
  spentAt: number;
  /** The provisional touches' deposits, as `(cell, amount)` pairs —
   *  everything the next advance subtracts back out before it lays the tail
   *  again. */
  undo: number[];
};

/** Open a walk over a field for a gesture that has not laid anything yet. */
export function openDrag(
  field: BristleField,
  size: number,
  flatness: number,
  angle: number,
  hardness: number,
  load: number,
): DragState {
  return {
    points: [],
    pen: penFor(
      size,
      flatness,
      angle,
      hardness,
      load,
      field.cell,
      field.ground,
    ),
    field,
    settled: 0,
    reserve: Math.max(0, load),
    spentAt: 0,
    undo: [],
  };
}

/** Walk the gesture on to `points` — which must be the state's own path with
 *  more on the end. The provisional tail of the last advance is taken back
 *  out, every touch that nothing can change any more is settled for good —
 *  its smoothed speed fixed, its normal's neighbours in place, and the lift
 *  window moved past it — and the still-moving tail is laid provisionally
 *  again, the leaving hairs riding its end. Answers the patch of field the
 *  advance touched. */
export function advanceDrag(state: DragState, points: readonly Point[]): Patch {
  const { field, pen } = state;
  const dirty = newPatch();
  const reachBy = pen.half + MARGIN_CELLS * field.cell;

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

  // …then walk on: settle every touch that can no longer change, and lay the
  // still-moving tail provisionally.
  const along = trace(points, pen.spacing);
  const last = along.length - 1;
  const total = along[last]!.at;
  const log: number[] = [];
  if (last === 0) {
    // Still a single press: one provisional print, taken back if it grows.
    dab(field, pen, along[0]!, log);
    widen(dirty, field, along[0]!.x, along[0]!.y, reachBy);
  } else {
    // A touch settles only once its speed is final *and* the lift window has
    // moved past it — the window is where the end still reaches back.
    const settledAt = Math.min(
      settledSpan(points),
      total - pen.liftWindow - pen.spacing,
    );
    const s = { reserve: state.reserve, spentAt: state.spentAt };
    let settled = state.settled;
    while (settled < last && along[settled]!.at <= settledAt) {
      const p = along[settled]!;
      const { nx, ny } = normalAt(along, settled);
      daub(field, pen, p, nx, ny, total - p.at, s);
      widen(dirty, field, p.x, p.y, reachBy);
      settled++;
    }
    state.settled = settled;
    state.reserve = s.reserve;
    state.spentAt = s.spentAt;
    for (let i = settled; i <= last; i++) {
      const p = along[i]!;
      const { nx, ny } = normalAt(along, i);
      daub(field, pen, p, nx, ny, total - p.at, s, log);
      widen(dirty, field, p.x, p.y, reachBy);
    }
  }
  state.undo = log;
  state.points = points;
  return dirty;
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

/** The path length up to the last raw sample whose smoothed speed can no
 *  longer change — touches at or before it are safe to settle, once the lift
 *  window has moved past them too. */
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
  field: BristleField,
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
