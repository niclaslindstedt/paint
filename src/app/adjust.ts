// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The colour adjustments — what "desaturate", "levels", "curves", "hue" and the
// rest actually *do* to a pixel.
//
// This is the arithmetic half of the panel's Colour section, and it is
// deliberately DOM-free: everything here is a function of numbers, so the whole
// section can be tested without a canvas the way a tool behaviour can be driven
// without one. Where the pixels come from and where they go back is
// `effectPaint.ts`'s; that a run of them becomes part of the picture is
// `bake.ts`'s.
//
// **They are effects, not filters.** An adjustment is applied once, to the
// pixels that are there when you ask, and then it is over — the same trade
// `effects.ts` explains at length. That is why the types here join the `Effect`
// union rather than living on the document: nothing persists a recipe.
//
// Two shapes of adjustment, and the difference is worth keeping:
//
//   - **Per-channel.** Brightness, levels, curves and colour balance each map a
//     channel's value to another value with no reference to the other two, so
//     the whole adjustment collapses into three 256-entry tables built once and
//     read per pixel. A megapixel then costs three array reads a pixel rather
//     than a page of arithmetic.
//   - **Per-pixel.** Desaturate and hue/saturation mix the channels — a grey is
//     made of all three, and a hue is an angle only the three together have — so
//     there is no table to build and the maths runs per pixel.
//
// Both skip a pixel with nothing in it. A layer is mostly empty by the time it
// reaches here (its marks are painted onto a transparent surface of their own,
// see `render.ts`), so the cheapest thing any of this does is notice that.

/** Which curve is being edited and applied. `rgb` is the composite one — it
 *  runs *after* the per-channel curves, as the same control does everywhere
 *  else, so bending it lifts a graded picture rather than replacing the
 *  grade. */
export type CurveChannel = "rgb" | "r" | "g" | "b";

/** The channels a curve set holds, in the order the picker offers them. */
export const CURVE_CHANNELS: readonly CurveChannel[] = ["rgb", "r", "g", "b"];

/** One handle on a curve, both coordinates 0–1: `x` is the tone going in, `y`
 *  the tone coming out. Screen-space is the editor's problem, not this
 *  module's. */
export type CurvePoint = { x: number; y: number };

/** A curve per channel. Every channel always has one — an untouched channel
 *  holds the straight line, which maps every tone to itself. */
export type CurveSet = Record<CurveChannel, readonly CurvePoint[]>;

/** Which end of the tonal range a colour-balance shift lands on. */
export type BalanceRange = "shadows" | "midtones" | "highlights";

/** The colour adjustments, as they are being set up. Each is a flat record of
 *  primitives — the shape the effect dialog can render off a descriptor without
 *  knowing which effect it is looking at — with one exception, `curves`, whose
 *  value is a set of lines and which therefore gets a control of its own. */
export type Adjustment =
  | {
      kind: "brightness";
      /** −1 … 1. Negative darkens; positive lifts toward white. */
      brightness: number;
      /** −1 … 1. Negative flattens toward mid grey; positive pushes apart. */
      contrast: number;
    }
  | {
      kind: "levels";
      /** The tone that becomes black, 0–1. */
      black: number;
      /** The tone that becomes white, 0–1. */
      white: number;
      /** Where the middle sits. Above 1 lifts the midtones, below 1 drops
       *  them — the same sense the middle slider has under a histogram. */
      gamma: number;
    }
  | {
      kind: "curves";
      /** The curve the editor is showing. Never changes any pixel; it is which
       *  line your hand is on. */
      channel: CurveChannel;
      curves: CurveSet;
    }
  | {
      kind: "hue";
      /** Degrees around the wheel, −180 … 180. */
      hue: number;
      /** −1 … 1, where −1 is grey and 1 is fully saturated. */
      saturation: number;
      /** −1 … 1, toward black or toward white. */
      lightness: number;
    }
  | {
      kind: "balance";
      range: BalanceRange;
      /** −1 … 1, cyan to red. */
      red: number;
      /** −1 … 1, magenta to green. */
      green: number;
      /** −1 … 1, yellow to blue. */
      blue: number;
      /** Shift the colours without changing how bright each pixel is. Absent
       *  is off, so an adjustment left alone is the object it started as. */
      luminosity?: boolean;
    }
  | {
      kind: "desaturate";
      /** How far toward grey, 0–1. */
      amount: number;
    };

export type AdjustKind = Adjustment["kind"];

/** Every adjustment kind, in the order the Colour section lists them. */
export const ADJUST_KINDS: readonly AdjustKind[] = [
  "brightness",
  "levels",
  "curves",
  "hue",
  "balance",
  "desaturate",
];

/** How a colour's brightness reads. Rec. 709, which is what a screen's own
 *  greys are mixed from — an average of the three channels would turn a
 *  saturated blue into a mid grey rather than the near-black the eye sees. */
export const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

export function luma(r: number, g: number, b: number): number {
  return LUMA.r * r + LUMA.g * g + LUMA.b * b;
}

/** The straight line: every tone comes out as it went in. What an untouched
 *  channel holds, and what the editor's reset puts back. */
export const STRAIGHT: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

/** A curve set with nothing bent yet. A fresh object each call — the editor
 *  hands its curves round by identity, and a shared constant would have two
 *  drafts writing on one line. */
export function straightCurves(): CurveSet {
  return {
    rgb: [...STRAIGHT],
    r: [...STRAIGHT],
    g: [...STRAIGHT],
    b: [...STRAIGHT],
  };
}

/** Whether every channel is still a straight line — a curves adjustment that
 *  would change nothing, which is what the dialog's Apply refuses to land. */
export function curvesAreStraight(curves: CurveSet): boolean {
  return CURVE_CHANNELS.every((channel) => {
    const points = curves[channel];
    return (
      points.length === 2 &&
      points[0]!.x === 0 &&
      points[0]!.y === 0 &&
      points[1]!.x === 1 &&
      points[1]!.y === 1
    );
  });
}

// --- Curve geometry ---------------------------------------------------------
//
// A curve is a handful of handles and the line through them, and which line
// that is matters: an ordinary cubic spline through hand-placed points
// *overshoots*, so dragging one handle up can dip the tones on either side of
// it below where they started. On a tone curve that reads as a bright band with
// dark edges — the picture solarises where you meant to lift it.
//
// So the line here is a **monotone** cubic (Fritsch–Carlson): it passes through
// every handle, it is smooth, and it never turns back on itself between two of
// them. Drag a point up and everything between its neighbours moves up with it,
// which is the only behaviour a tone curve can have.

/** The smallest gap allowed between two handles' inputs. Two on the same tone
 *  would be a vertical step — an infinite slope the spline cannot express, and
 *  a pair of handles the hand cannot tell apart. */
export const MIN_CURVE_GAP = 1 / 64;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A curve put in order: sorted by input, clamped to the square, pinned to both
 *  ends, and with handles too close together dropped. Everything that edits a
 *  curve comes back through here, so no malformed line ever reaches the LUT. */
export function normalizeCurve(points: readonly CurvePoint[]): CurvePoint[] {
  const sorted = points
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);
  const kept: CurvePoint[] = [];
  for (const point of sorted) {
    const last = kept[kept.length - 1];
    if (last && point.x - last.x < MIN_CURVE_GAP) continue;
    kept.push(point);
  }
  // Both ends are handles like any other in `y` and fixed in `x`: a curve that
  // stopped short of black would leave the darkest tones undefined.
  if (kept.length === 0) return [...STRAIGHT];
  if (kept[0]!.x > 0) kept.unshift({ x: 0, y: kept[0]!.y });
  else kept[0] = { x: 0, y: kept[0]!.y };
  const last = kept[kept.length - 1]!;
  if (last.x < 1) kept.push({ x: 1, y: last.y });
  else kept[kept.length - 1] = { x: 1, y: last.y };
  return kept;
}

/** Move one handle. The ends may only travel vertically — they are what the
 *  curve's black and white *are* — and an inner handle stays between its
 *  neighbours rather than swapping past them, so the line the hand is dragging
 *  never reorders itself under it. */
export function moveCurvePoint(
  points: readonly CurvePoint[],
  index: number,
  to: CurvePoint,
): CurvePoint[] {
  if (index < 0 || index >= points.length) return [...points];
  const end = index === 0 || index === points.length - 1;
  const low = index === 0 ? 0 : points[index - 1]!.x + MIN_CURVE_GAP;
  const high =
    index === points.length - 1 ? 1 : points[index + 1]!.x - MIN_CURVE_GAP;
  const x = end
    ? points[index]!.x
    : Math.min(Math.max(clamp01(to.x), low), Math.max(low, high));
  const next = [...points];
  next[index] = { x, y: clamp01(to.y) };
  return next;
}

/** Add a handle, and say where it landed in the list so the caller can carry on
 *  dragging the thing it just made. A press too close to an existing handle
 *  grabs that one instead of crowding the line with a second. */
export function addCurvePoint(
  points: readonly CurvePoint[],
  at: CurvePoint,
): { points: CurvePoint[]; index: number } {
  const x = clamp01(at.x);
  const near = points.findIndex((p) => Math.abs(p.x - x) < MIN_CURVE_GAP);
  if (near >= 0) return { points: [...points], index: near };
  const next = [...points, { x, y: clamp01(at.y) }].sort((a, b) => a.x - b.x);
  return { points: next, index: next.findIndex((p) => p.x === x) };
}

/** Take a handle away. The two ends stay: without them the curve has no black
 *  and no white to run between. */
export function removeCurvePoint(
  points: readonly CurvePoint[],
  index: number,
): CurvePoint[] {
  if (index <= 0 || index >= points.length - 1) return [...points];
  return points.filter((_, at) => at !== index);
}

/** The slopes a monotone cubic runs through its handles at (Fritsch–Carlson).
 *  The secants, softened where two of them disagree in sign or in size — which
 *  is exactly the case that makes an ordinary spline overshoot. */
function slopes(points: readonly CurvePoint[]): number[] {
  const n = points.length;
  const secant: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1]!.x - points[i]!.x;
    secant.push(dx > 0 ? (points[i + 1]!.y - points[i]!.y) / dx : 0);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = secant[0] ?? 0;
  m[n - 1] = secant[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const a = secant[i - 1]!;
    const b = secant[i]!;
    // A turning point: the line flattens there rather than sailing past it.
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const s = secant[i]!;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / s;
    const b = m[i + 1]! / s;
    const size = Math.hypot(a, b);
    // Outside a circle of radius three the cubic can overshoot; pulling the
    // pair back onto it is what keeps the line monotone.
    if (size > 3) {
      m[i] = (3 / size) * a * s;
      m[i + 1] = (3 / size) * b * s;
    }
  }
  return m;
}

/** What one tone comes out as. `x` outside the square is held at the nearest
 *  end, which is what the two pinned handles mean. */
export function sampleCurve(points: readonly CurvePoint[], x: number): number {
  const line = points.length >= 2 ? points : STRAIGHT;
  const at = clamp01(x);
  if (at <= line[0]!.x) return clamp01(line[0]!.y);
  const last = line[line.length - 1]!;
  if (at >= last.x) return clamp01(last.y);
  let i = 0;
  while (i < line.length - 2 && at > line[i + 1]!.x) i += 1;
  const p0 = line[i]!;
  const p1 = line[i + 1]!;
  const m = slopes(line);
  const h = p1.x - p0.x;
  if (h <= 0) return clamp01(p1.y);
  const t = (at - p0.x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const y =
    (2 * t3 - 3 * t2 + 1) * p0.y +
    (t3 - 2 * t2 + t) * h * m[i]! +
    (-2 * t3 + 3 * t2) * p1.y +
    (t3 - t2) * h * m[i + 1]!;
  return clamp01(y);
}

/** One curve as the 256-entry table the painter reads. */
export function curveLut(points: readonly CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    lut[v] = Math.round(sampleCurve(points, v / 255) * 255);
  }
  return lut;
}

// --- Tables -----------------------------------------------------------------

/** One table per channel: what an 8-bit value becomes. */
export type Channels = { r: Uint8Array; g: Uint8Array; b: Uint8Array };

const identityLut = (): Uint8Array => {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) lut[v] = v;
  return lut;
};

/** Build a table from a function on 0–1. */
function lutOf(map: (v: number) => number): Uint8Array {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    lut[v] = Math.round(clamp01(map(v / 255)) * 255);
  }
  return lut;
}

/** How hard a contrast slider pulls at each end of its travel.
 *
 *  The classic 8-bit contrast factor, which is finite at both ends — an
 *  algebraically pure `tan` version runs to infinity at +100 and turns the last
 *  few steps of the slider into a hard threshold. */
function contrastFactor(contrast: number): number {
  const c = Math.max(-1, Math.min(1, contrast)) * 255;
  return (259 * (c + 255)) / (255 * (259 - c));
}

/** Brightness the way a paint program means it: toward white rather than by a
 *  fixed offset, so lifting a picture does not clip its highlights flat before
 *  its shadows have moved. */
function lift(v: number, by: number): number {
  return by >= 0 ? v + (1 - v) * by : v * (1 + by);
}

/** How much of a colour-balance shift a tone takes.
 *
 *  Three overlapping windows over the tonal range, and the overlap is the
 *  point: a shift aimed at the shadows has to fade out through the midtones
 *  rather than stop at some boundary, or the picture bands where the range
 *  changes hands. */
export function toneWeight(range: BalanceRange, v: number): number {
  if (range === "shadows") return (1 - v) * (1 - v);
  if (range === "highlights") return v * v;
  const off = 2 * v - 1;
  return 1 - off * off;
}

/** How far a colour-balance slider at the end of its travel moves a tone. Full
 *  strength would take a midtone from grey to primary in one slider; half is a
 *  cast you can actually aim. */
export const BALANCE_SHIFT = 0.5;

/** Hold a value inside a byte. Only the paths that write a channel *back*
 *  through arithmetic of their own need it — a table's entries are bytes
 *  already. */
const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** The three tables an adjustment collapses into, or `null` for one that mixes
 *  the channels and has to be run per pixel. */
export function adjustLut(adjustment: Adjustment): Channels | null {
  switch (adjustment.kind) {
    case "brightness": {
      const factor = contrastFactor(adjustment.contrast);
      const lut = lutOf(
        (v) => (lift(v, adjustment.brightness) - 0.5) * factor + 0.5,
      );
      return { r: lut, g: lut, b: lut };
    }
    case "levels": {
      const black = clamp01(adjustment.black);
      const white = clamp01(adjustment.white);
      const span = white - black;
      const power = 1 / Math.max(0.01, adjustment.gamma);
      const lut = lutOf((v) =>
        span <= 0
          ? v >= white
            ? 1
            : 0
          : Math.pow(clamp01((v - black) / span), power),
      );
      return { r: lut, g: lut, b: lut };
    }
    case "curves": {
      // The per-channel line first, the composite over the top of it — the
      // order a grade is built in, so bending RGB lifts the graded picture.
      const rgb = curveLut(adjustment.curves.rgb);
      const per = (channel: CurveChannel) => {
        const own = curveLut(adjustment.curves[channel]);
        const out = new Uint8Array(256);
        for (let v = 0; v < 256; v += 1) out[v] = rgb[own[v]!]!;
        return out;
      };
      return { r: per("r"), g: per("g"), b: per("b") };
    }
    case "balance": {
      const shift = (amount: number) =>
        amount === 0
          ? identityLut()
          : lutOf(
              (v) =>
                v + amount * BALANCE_SHIFT * toneWeight(adjustment.range, v),
            );
      return {
        r: shift(adjustment.red),
        g: shift(adjustment.green),
        b: shift(adjustment.blue),
      };
    }
    default:
      return null;
  }
}

// --- Applying ---------------------------------------------------------------

/** Run an adjustment over a run of RGBA bytes, in place.
 *
 *  The bytes are canvas pixels — straight alpha, four to a pixel — and the
 *  alpha is never touched: an adjustment changes what colour the ink is, not
 *  how much of it there is. A fully transparent pixel is skipped outright,
 *  which on a layer's own surface is most of them. */
export function adjustPixels(
  data: Uint8ClampedArray,
  adjustment: Adjustment,
): void {
  switch (adjustment.kind) {
    case "balance":
      if (adjustment.luminosity === true) {
        applyBalanceKeepingLight(data, adjustment);
        return;
      }
      applyLut(data, adjustLut(adjustment));
      return;
    case "brightness":
    case "levels":
    case "curves":
      applyLut(data, adjustLut(adjustment));
      return;
    case "desaturate":
      applyDesaturate(data, adjustment);
      return;
    case "hue":
      applyHue(data, adjustment);
      return;
  }
}

/** Run three tables over the pixels. */
function applyLut(data: Uint8ClampedArray, lut: Channels | null): void {
  if (!lut) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = lut.r[data[i]!]!;
    data[i + 1] = lut.g[data[i + 1]!]!;
    data[i + 2] = lut.b[data[i + 2]!]!;
  }
}

/** Toward grey, by however much was asked for. A channel is mixed with the
 *  pixel's own brightness rather than replaced by it, so half-way is a picture
 *  with the colour knocked back rather than a grey one at half opacity. */
function applyDesaturate(
  data: Uint8ClampedArray,
  adjustment: Extract<Adjustment, { kind: "desaturate" }>,
): void {
  const amount = clamp01(adjustment.amount);
  if (amount === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const grey = luma(data[i]!, data[i + 1]!, data[i + 2]!);
    data[i] = data[i]! + (grey - data[i]!) * amount;
    data[i + 1] = data[i + 1]! + (grey - data[i + 1]!) * amount;
    data[i + 2] = data[i + 2]! + (grey - data[i + 2]!) * amount;
  }
}

/** Colour balance with the light held where it was: shift the colours, then
 *  scale the pixel back to the brightness it had. It is the difference between
 *  warming a picture and lightening it, and it is the reason the switch is
 *  there. */
function applyBalanceKeepingLight(
  data: Uint8ClampedArray,
  adjustment: Extract<Adjustment, { kind: "balance" }>,
): void {
  const lut = adjustLut(adjustment);
  if (!lut) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r0 = data[i]!;
    const g0 = data[i + 1]!;
    const b0 = data[i + 2]!;
    const r = lut.r[r0]!;
    const g = lut.g[g0]!;
    const b = lut.b[b0]!;
    const was = luma(r0, g0, b0);
    const now = luma(r, g, b);
    const scale = now > 0 ? was / now : 1;
    data[i] = clampByte(r * scale);
    data[i + 1] = clampByte(g * scale);
    data[i + 2] = clampByte(b * scale);
  }
}

/** Hue, saturation and lightness, per pixel.
 *
 *  There is no table for this one: a hue is an angle the three channels only
 *  have together, so every pixel goes round through HSL and back. It is the
 *  most expensive thing in this file and still one conversion per pixel — a few
 *  million floating-point operations over a window, which is a frame's work
 *  once per slider move rather than per stroke. */
function applyHue(
  data: Uint8ClampedArray,
  adjustment: Extract<Adjustment, { kind: "hue" }>,
): void {
  const turn = adjustment.hue / 360;
  const sat = Math.max(-1, Math.min(1, adjustment.saturation));
  const light = Math.max(-1, Math.min(1, adjustment.lightness));
  if (turn === 0 && sat === 0 && light === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const hsl = toHsl(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255);
    // The wheel wraps: turning past red comes back round to red.
    const h = (((hsl.h + turn) % 1) + 1) % 1;
    const s = lift(hsl.s, sat);
    const l = lift(hsl.l, light);
    const rgb = toRgb(h, s, l);
    data[i] = rgb.r * 255;
    data[i + 1] = rgb.g * 255;
    data[i + 2] = rgb.b * 255;
  }
}

/** RGB (0–1) to HSL (0–1, hue as a turn rather than as degrees). */
export function toHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const span = max - min;
  if (span === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? span / (2 - max - min) : span / (max + min);
  let h: number;
  if (max === r) h = (g - b) / span + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / span + 2;
  else h = (r - g) / span + 4;
  return { h: h / 6, s, l };
}

/** HSL (0–1) back to RGB (0–1). */
export function toRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let at = t;
  if (at < 0) at += 1;
  if (at > 1) at -= 1;
  if (at < 1 / 6) return p + (q - p) * 6 * at;
  if (at < 1 / 2) return q;
  if (at < 2 / 3) return p + (q - p) * (2 / 3 - at) * 6;
  return p;
}
