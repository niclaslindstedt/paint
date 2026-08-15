// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What sizes a tool comes in — the real implement's range, and the slider that
// walks it.
//
// A width used to be one number between 1 and 200 for every tool in the box.
// That is not what a rack of implements is. A technical pen is sold in
// 0.13–2 mm; a round watercolour brush in 1–20 mm; a chisel marker in 1–15 mm;
// a decorator's brush in 25–150 mm. One slider spanning all of them at once
// spends nine tenths of its travel on widths the tool in your hand does not
// come in, and the tenth that matters is a couple of pixels of thumb.
//
// So each tool declares a **gauge**: the range the real thing is made in, the
// five sizes worth a button, and how far past either end you may still go. Two
// things come out of it.
//
// **The buttons are real implements.** Five per tool, and each one is a size a
// shop actually sells — 0.3 / 0.5 / 0.7 / 0.9 / 2.0 mm of pencil lead, a #2, a
// #6, a #10, a #16 and a one-inch flat of brush. A `note` on a step carries the
// designation where the trade has one, because "#6" is what a painter asks for
// and "4.8 mm" is what it measures.
//
// **The slider is not linear, and it is not one scale.** It has three bands,
// and they are the whole point:
//
//   - the first tenth is **finer than they are made**, down to a hairline. It
//     is there because a drawing is not a photograph of a toolbox: a 0.05 mm
//     line has no implement behind it and is still the right line sometimes.
//   - the next four tenths are **the rack**: everything between the narrowest
//     and the widest real one, so most of the thumb's travel is spent among
//     widths that exist. This is the band a professional lives in, and it is
//     deliberately the biggest.
//   - the last half runs **past the rack to the absurd**, and it accelerates
//     the whole way: a pencil at the top of its slider is a stripe as wide as
//     the page. Nobody needs a 200 mm pencil, and a slider that refuses to draw
//     one is a slider arguing with you.
//
// Every band interpolates **geometrically**, because width is a ratio quantity:
// the step from 0.3 to 0.4 mm is the same *kind* of step as the one from 3 to
// 4 mm, and a linear slider makes the first invisible and the second enormous.
// Geometric bands also make the mapping invertible in closed form, which is
// what lets the slider open on the width you are already drawing with.

import { formatMm, formatPt, mm } from "../units.ts";

/** One width worth a button: the size, and what the trade calls it.
 *
 *  `note` is deliberately **not** a catalog string. It is a designation rather
 *  than a word — `#6`, `2B`, `1"` — and a shop in Malmö sells the same #6 as a
 *  shop in Melbourne. What *is* translated is the unit beside it, which the
 *  panel gets from the catalog. */
export type SizeStep = { px: number; note?: string };

/** The range a tool is really made in, and the sizes worth a button. */
export type SizeGauge = {
  /** The narrowest real implement of this kind, in document pixels. */
  min: number;
  /** The widest. */
  max: number;
  /** How far below `min` the slider still goes — the "finer than they make
   *  them" tenth. Defaults to a sixth of `min`, never below `MIN_SIZE`. */
  floor?: number;
  /** How far past `max` it goes at the very top. Defaults to twenty-four times
   *  the widest real one, never past `MAX_SIZE`. */
  ceiling?: number;
  /** The five sizes the panel offers as buttons, fine to broad. */
  steps: readonly SizeStep[];
  /** How a width off this gauge reads: millimetres of page (nearly everything)
   *  or points of type (the text tool). */
  unit?: "mm" | "pt";
};

/** The finest mark the app will make: one document pixel, which at 460 pixels
 *  to the inch is a twentieth of a millimetre — a hairline, and already finer
 *  than the screen it is drawn on can show. */
export const MIN_SIZE = 1;

/** The broadest: 210 mm, the short edge of a sheet of A4.
 *
 *  It used to be 96 on the reasoning that a stroke wider than that is a fill
 *  with extra steps, and then 200 to reach a decorator's brush. Both were
 *  guesses at a number that now has an answer: a nib as wide as the paper is
 *  the widest one that is still a nib, and the top of every slider is that. */
export const MAX_SIZE = mm(210);

/** Where the "finer than they make them" band ends, as a share of the slider. */
export const FINE_BAND = 0.1;

/** …and where the real rack ends and the absurd begins. */
export const REAL_BAND = 0.5;

/** The gauge a tool that declares none is measured on — the technical-pen
 *  ladder, which is what "a line of some width" means when nothing more is
 *  known about the tool drawing it. */
export const DEFAULT_GAUGE: SizeGauge = {
  min: mm(0.1),
  max: mm(4),
  steps: [
    { px: mm(0.25) },
    { px: mm(0.5) },
    { px: mm(1) },
    { px: mm(2) },
    { px: mm(4) },
  ],
};

/** The finest width this gauge's slider reaches. */
export function gaugeFloor(gauge: SizeGauge): number {
  return Math.max(MIN_SIZE, gauge.floor ?? gauge.min / 6);
}

/** The broadest — never past the page-wide ceiling, and never below the widest
 *  real implement, which a badly-written gauge could otherwise ask for. */
export function gaugeCeiling(gauge: SizeGauge): number {
  return Math.min(
    MAX_SIZE,
    Math.max(gauge.max, gauge.ceiling ?? gauge.max * 24),
  );
}

/** A gauge held to its own bounds, so the three bands are always in order even
 *  if the numbers handed in were not. */
function bounds(gauge: SizeGauge): [number, number, number, number] {
  const floor = gaugeFloor(gauge);
  const min = Math.max(floor, gauge.min);
  const max = Math.max(min, gauge.max);
  return [floor, min, max, Math.max(max, gaugeCeiling(gauge))];
}

/** Geometric interpolation: `from` at 0, `to` at 1, and every equal step in
 *  between the same *ratio* rather than the same difference. */
function geo(from: number, to: number, at: number): number {
  if (from <= 0 || to <= 0) return from + (to - from) * at;
  return from * (to / from) ** at;
}

/** …and its inverse: where `value` sits between `from` and `to`. */
function ungeo(from: number, to: number, value: number): number {
  if (from <= 0 || to <= 0 || from === to) return 0;
  return Math.log(value / from) / Math.log(to / from);
}

/** The width at `at` along the slider, 0 (a hairline) through 1 (absurd).
 *
 *  Continuous across the two seams — the bands share their endpoints — so
 *  dragging through 10% and 50% changes the *rate* the number climbs at and
 *  never the number itself. */
export function sizeAt(gauge: SizeGauge, at: number): number {
  const [floor, min, max, ceiling] = bounds(gauge);
  const t = Math.max(0, Math.min(1, at));
  if (t <= FINE_BAND) return geo(floor, min, t / FINE_BAND);
  if (t <= REAL_BAND) {
    return geo(min, max, (t - FINE_BAND) / (REAL_BAND - FINE_BAND));
  }
  return geo(max, ceiling, (t - REAL_BAND) / (1 - REAL_BAND));
}

/** Where a width sits on the slider — what opens the panel on the nib you are
 *  already holding. The exact inverse of `sizeAt`, clamped at both ends. */
export function positionOf(gauge: SizeGauge, size: number): number {
  const [floor, min, max, ceiling] = bounds(gauge);
  if (!Number.isFinite(size) || size <= floor) return 0;
  if (size >= ceiling) return 1;
  if (size <= min) return ungeo(floor, min, size) * FINE_BAND;
  if (size <= max) {
    return FINE_BAND + ungeo(min, max, size) * (REAL_BAND - FINE_BAND);
  }
  return REAL_BAND + ungeo(max, ceiling, size) * (1 - REAL_BAND);
}

/** Whether a width is one the trade actually makes — what the slider's readout
 *  says out loud, so a professional can see at a glance that they have wandered
 *  off the rack. */
export function isRealSize(gauge: SizeGauge, size: number): boolean {
  const [, min, max] = bounds(gauge);
  // A hair of tolerance, because the steps themselves are rounded to whole
  // pixels on the way through the settings blob and a step must never read as
  // unrealistic.
  return size >= min - 0.5 && size <= max + 0.5;
}

/** The widths this gauge offers as buttons, fine to broad. */
export function gaugeSizes(gauge: SizeGauge): number[] {
  return gauge.steps.map((s) => s.px).sort((a, b) => a - b);
}

/** The trade's name for a width, when this gauge has one for it — `#6`, `1"`.
 *  Matched by nearest step within a hair, so a width that came back through the
 *  settings blob rounded to a whole pixel still knows what it is. */
export function stepNote(gauge: SizeGauge, size: number): string | undefined {
  let best: SizeStep | undefined;
  let closest = Infinity;
  for (const step of gauge.steps) {
    const gap = Math.abs(step.px - size);
    if (gap < closest) {
      closest = gap;
      best = step;
    }
  }
  return closest <= Math.max(0.5, size * 0.02) ? best?.note : undefined;
}

/** A width as this gauge prints it — the number only. The unit is the catalog's
 *  (see `canvas.sizeMm` / `canvas.sizePt`), because it is part of a sentence. */
export function formatSize(gauge: SizeGauge, size: number): string {
  return gauge.unit === "pt" ? formatPt(size) : formatMm(size);
}
