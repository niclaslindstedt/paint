// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Dragging the head over the paper — the whole path, and the path so far.
//
// `bristleHead.ts` is the head and `bristlePrint.ts` is what it leaves at an
// end of a mark; this is the part that knows about a *gesture*. It walks a
// path pressing the head's cross-section into the sheet and spending the
// reservoir as it goes.
//
// It does that twice over one per-touch function (`daub`), so the two cannot
// drift apart: `drag` lays a mark that has landed, and `openDrag` /
// `advanceDrag` lay the one still under the hand — settling every touch that
// can no longer change and re-laying only the tail that can, so a frame costs
// the touches that arrived rather than the length of the gesture.

import type { Point } from "../types.ts";
import { press, type BristleField } from "./bristleField.ts";
import { stiffen } from "./bristle.ts";
import { smoothstep, trace, type Trace } from "./grain.ts";
import {
  BASE_FILM,
  MARGIN_CELLS,
  RESIDUE_FILM,
  SPEED_SCALE,
  SPEED_SHARP,
  SPEED_SPAN,
  SPEED_WINDOW,
  THIN_FAST,
  TOUCH_BEAD,
  bearingDown,
  combOver,
  paintDryness,
  paintFlow,
  penFor,
  printOf,
  printReach,
  spanOf,
  type Pen,
} from "./bristleHead.ts";
import { capAt, dab, landing, lifting } from "./bristlePrint.ts";

/** Lay one touch of the head and spend the reservoir — the single place a
 *  touch's film is decided, walked by the landed path and the live path alike
 *  so the two cannot drift apart. `nx`/`ny` is the unit normal across the
 *  path there; `s` carries the reservoir and where it ran out; `caps` says
 *  whether this touch is an end of the drag, and so leaves the print of the
 *  head as well as its cross-section; `log` collects a provisional touch's
 *  deposits so the next frame can take them back out. */
function daub(
  field: BristleField,
  pen: Pen,
  p: Trace,
  nx: number,
  ny: number,
  fromEnd: number,
  s: { reserve: number; spentAt: number },
  caps: number,
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
    // …and the mark thins as the head rolls off, inside the lift window the
    // leaving hairs already own. Exactly 1 at the window's edge, so a settled
    // touch cannot feel the end moving away from it.
    if (fromEnd < pen.liftWindow) {
      film *= 0.72 + 0.28 * (fromEnd / pen.liftWindow);
    }
  }
  // The head's footprint against the way the hand is going here (see
  // `printOf`) — the projection that is the whole difference between a round
  // and a flat. The paint the blade stops laying sideways it carries into the
  // narrower band instead, so an edge-on flat writes a heavy line, not a
  // faint one.
  const print = printOf(pen, ny, -nx, nx, ny);
  // …and how much of the *head* is on the paper here, which is a different
  // question and one only the two ends of the stroke and the hand's own wander
  // have anything to say about (see `bearingDown`).
  const down = bearingDown(pen, p, fromEnd);
  const w = print.across * down;
  if (w < field.cell * 0.5) return;
  film *= Math.min(1.6, Math.sqrt(pen.half / w));
  const head = combOver(pen, p.at, p.speed, dry);
  // How much of the print has passed over this place. In the middle of a drag
  // the whole of it has, and the section is the band: centred, `across`
  // either side. Within a print's reach of an end only part of it has, and
  // for a blade held obliquely that part stands off to one side — which is
  // what cuts the mark off at the angle the blade is held at instead of
  // square across the path (see `spanOf`).
  const ending =
    print.reach > 0 && (p.at < print.reach || fromEnd < print.reach);
  const span = ending
    ? spanOf(print, -fromEnd / print.reach, p.at / print.reach)
    : null;
  const across = (span ? span.half : print.across) * down;
  if (across < field.cell * 0.5) return;
  const off = span ? span.mid * down : 0;
  press(
    field,
    p.x + nx * off,
    p.y + ny * off,
    nx * across,
    ny * across,
    film,
    dry,
    pen.spacing,
    head,
    log,
  );
  // …and, at the two ends of the drag, what the head leaves past them: the
  // part of the bundle that took the sheet at the touch-down, and the fan of
  // bent-back hair ends the lift draws out. Not the same shape, and not the
  // same shape backwards (see `capAt`).
  if (caps !== 0) {
    const end = caps < 0 ? landing(pen, -1, false) : lifting(pen);
    capAt(field, pen, p, nx, ny, end, down, film, dry, head, log);
  }
  if (s.reserve > 0) {
    const left = s.reserve - ((film / BASE_FILM) * pen.spacing) / pen.capacity;
    s.reserve = Math.max(0, left);
    if (s.reserve === 0) s.spentAt = p.at;
  }
}

/** The path the head is actually dragged over: the gesture resampled at the
 *  walk's own spacing, then rounded off to what a head this wide could
 *  physically have followed (see `stiffen` in `bristle.ts`).
 *
 *  Both walks read it — the landed one and the gesture in flight — because a
 *  mark that stiffened one way while it was under the hand and another way
 *  once it landed would visibly jump at the lift.
 *
 *  It is also what keeps the band *closed*. A press of the head's
 *  cross-section is a straight bar, and the stored samples are a polyline, so
 *  at every stored corner two consecutive bars splay apart — leaving a wedge
 *  of bare paper on the outside of the turn, one per pointer sample, which on
 *  a quick gesture is the whole mark. Rounding the corner off is both the
 *  physics (a bar of hair cannot turn inside its own width) and the cure. */
function walkOf(pen: Pen, points: readonly Point[]): Trace[] {
  return stiffen(trace(points, pen.spacing), pen.stiffness, pen.spacing);
}

/** How far back from the newest samples the walk is still moving: the head's
 *  own smoothing window, since a touch's *place* is not final until the path
 *  a head-width past it exists, and the lift window the leaving hairs and the
 *  head's print ride. Nothing at or before this can change again, which is
 *  exactly what may settle (see `advanceDrag`). */
function movingTail(pen: Pen): number {
  // …and the head's own print, which is the third thing a touch near the end
  // of the gesture is still waiting on: how much of the footprint has passed
  // over it depends on where the mark ends (see `spanOf`), and the print
  // reaches at most a half-width whichever way the blade is turned.
  return Math.max(pen.liftWindow, pen.stiffness, pen.half) + pen.spacing;
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
  const along = walkOf(pen, points);
  const first = along[0];
  if (!first) return;
  const last = along.length - 1;
  const total = along[last]!.at;
  // A press that moved is a press. Until the hand has carried the head clear
  // of its own print there is no drag to lay — and walking one anyway is how a
  // finger resting on the glass and shifting two pixels printed a *bite* out
  // of its own blot: two half-prints about two directions ninety degrees apart
  // cover three-quarters of a circle, and the quarter they miss is a wedge no
  // brush ever left on paper.
  if (last === 0 || total < pressReach(pen, along)) {
    dab(field, pen, first, bearingDown(pen, first, Infinity));
    return;
  }
  const s = { reserve: Math.max(0, load), spentAt: 0 };
  for (let i = 0; i <= last; i++) {
    const p = along[i]!;
    const { nx, ny } = normalAt(along, i);
    daub(field, pen, p, nx, ny, total - p.at, s, capOf(i, last));
  }
}

/** How far this gesture has to have travelled before it is a drag rather than
 *  a press that moved: the head's own print, measured along the way the hand
 *  actually went (see `printReach`).
 *
 *  It cannot be one number on the head. A blade pulled square across itself
 *  clears its print in a fourteenth of its width, and the *same* blade dragged
 *  along its own edge has to travel a whole half-width before any of the paper
 *  it is standing on is behind it — so measuring both against the smaller of
 *  the two turned a press into a drag after two pixels of travel, and the
 *  angled bar a tap leaves flipped to a cap square across the direction of
 *  travel the moment the hand moved at all. */
function pressReach(pen: Pen, along: readonly Trace[]): number {
  const first = along[0]!;
  const last = along[along.length - 1]!;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy);
  // A gesture that came back to where it started has no direction to measure
  // against; the narrowest way the head can stand is the honest answer there,
  // being the one that calls it a drag soonest.
  if (len < 1e-6) return pen.half * pen.minor;
  return printReach(pen, dx / len, dy / len);
}

/** Which half of the head's print this touch owes the mark: the one behind it
 *  at the touch-down, the one ahead of it at the lift, and neither anywhere in
 *  between (see `capAt`). */
function capOf(i: number, last: number): number {
  return i === 0 ? -1 : i === last ? 1 : 0;
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
  /** The press this gesture is still nothing but, if it is: where the head
   *  came down, how fast it was moving when it did, and how much of it took
   *  the sheet.
   *
   *  A print is a function of that first touch and of nothing else — not of
   *  how long the finger has since rested on the glass — so once the touch's
   *  smoothed speed stops moving there is *nothing to do* on a frame, and the
   *  most expensive mark the engine lays stops being laid sixty times a
   *  second. It stays in the undo log all the same, because the moment the
   *  hand does carry the head off its own print the mark is a drag and the
   *  print was never part of it. */
  printed: { x: number; y: number; speed: number; down: number } | null;
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
    printed: null,
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
  // …and how far an *end* of the drag reaches, which is further: the head
  // prints its own footprint past the last point it touched (see `capAt`).
  const capReach = reachBy + pen.half;
  const along = walkOf(pen, points);
  const last = along.length - 1;
  const total = along[last]!.at;
  const pressing = last === 0 || total < pressReach(pen, along);

  // Still a press — one that may have moved a little, but not yet clear of its
  // own print (see `drag`). A print is the most expensive mark the engine
  // lays, and it is a function of the first touch alone: if that touch and its
  // smoothed speed have stopped moving, the field already holds exactly what
  // this frame would lay, and the frame is free (see `DragState.printed`).
  if (pressing) {
    const at = along[0]!;
    const down = bearingDown(pen, at, Infinity);
    const held = state.printed;
    if (
      held &&
      held.x === at.x &&
      held.y === at.y &&
      held.speed === at.speed &&
      held.down === down
    ) {
      state.points = points;
      return dirty;
    }
  }

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
  const log: number[] = [];
  if (pressing) {
    // One provisional print, taken back whole once the hand does carry the
    // head off it, and not laid again until something about it changes.
    const at = along[0]!;
    const down = bearingDown(pen, at, Infinity);
    dab(field, pen, at, down, log);
    state.printed = { x: at.x, y: at.y, speed: at.speed, down };
    widen(dirty, field, at.x, at.y, capReach);
  } else {
    // A drag, so whatever print the press left is on its way back out with the
    // rest of the provisional tail.
    state.printed = null;
    // A touch settles only once its speed is final *and* the tail that is
    // still moving has passed it — the lift window the end reaches back
    // through, and the head's own smoothing window, which is not done with a
    // touch until the path a head-width beyond it exists (see `movingTail`).
    const settledAt = Math.min(settledSpan(points), total - movingTail(pen));
    const s = { reserve: state.reserve, spentAt: state.spentAt };
    let settled = state.settled;
    while (settled < last && along[settled]!.at <= settledAt) {
      const p = along[settled]!;
      const { nx, ny } = normalAt(along, settled);
      // The touch-down print is the first touch's, and it settles with it:
      // nothing about the head coming down can change once the hand has
      // moved on (the lift's print rides the provisional tail instead).
      daub(field, pen, p, nx, ny, total - p.at, s, capOf(settled, last));
      widen(dirty, field, p.x, p.y, settled === 0 ? capReach : reachBy);
      settled++;
    }
    state.settled = settled;
    state.reserve = s.reserve;
    state.spentAt = s.spentAt;
    for (let i = settled; i <= last; i++) {
      const p = along[i]!;
      const { nx, ny } = normalAt(along, i);
      daub(field, pen, p, nx, ny, total - p.at, s, capOf(i, last), log);
      widen(dirty, field, p.x, p.y, i === 0 || i === last ? capReach : reachBy);
    }
  }
  state.undo = log;
  state.points = points;
  return dirty;
}

/** The path length up to the last raw sample whose smoothed speed can no
 *  longer change — touches at or before it are safe to settle, once the lift
 *  window has moved past them too. */
export function settledSpan(points: readonly Point[]): number {
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
export type Patch = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function newPatch(): Patch {
  return { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
}

export function widen(
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
