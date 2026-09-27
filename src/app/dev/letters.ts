// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Hand lettering for the presentation demo: the block capitals a person
// writes on a whiteboard or under a swatch, one pen stroke per line of each
// letter, traced by `hand.ts` like every other mark.
//
// Each glyph is drawn on a grid six units tall (y down, the cap line at 0 and
// the baseline at 6). A stroke is either `L` — straight runs between the
// points, the corners turned — or `C`, a curve through them. `write` sets a
// line of them with the drift a hand has: no two letters the same size, a
// slight forward slant, a baseline that wanders.

import { Hand, type Pt } from "./hand.ts";

type Part = ["L" | "C", ...[number, number][]];
type Glyph = { w: number; parts: Part[] };

const g = (w: number, ...parts: Part[]): Glyph => ({ w, parts });

const GLYPHS: Record<string, Glyph> = {
  A: g(4, ["L", [0, 6], [2, 0], [4, 6]], ["L", [0.8, 4], [3.2, 4]]),
  B: g(
    3.6,
    ["L", [0, 6], [0, 0]],
    ["C", [0, 0], [2.3, 0], [3.2, 0.8], [3.2, 2.2], [2.3, 3], [0, 3]],
    ["C", [0, 3], [2.6, 3], [3.6, 3.9], [3.6, 5.1], [2.6, 6], [0, 6]],
  ),
  C: g(3.7, [
    "C",
    [3.6, 1],
    [2.6, 0],
    [1.4, 0],
    [0.2, 1.2],
    [0, 3],
    [0.2, 4.8],
    [1.4, 6],
    [2.6, 6],
    [3.7, 5],
  ]),
  D: g(
    3.8,
    ["L", [0, 0], [0, 6]],
    ["C", [0, 0], [1.8, 0], [3.4, 1.2], [3.8, 3], [3.4, 4.8], [1.8, 6], [0, 6]],
  ),
  E: g(3.4, ["L", [3.4, 0], [0, 0], [0, 6], [3.4, 6]], ["L", [0, 3], [2.6, 3]]),
  F: g(3.3, ["L", [3.3, 0], [0, 0], [0, 6]], ["L", [0, 3], [2.5, 3]]),
  G: g(
    3.8,
    [
      "C",
      [3.6, 1],
      [2.6, 0],
      [1.4, 0],
      [0.2, 1.2],
      [0, 3],
      [0.2, 4.8],
      [1.4, 6],
      [2.6, 6],
      [3.7, 5],
      [3.7, 3.4],
    ],
    ["L", [2.1, 3.4], [3.8, 3.4]],
  ),
  H: g(
    3.6,
    ["L", [0, 0], [0, 6]],
    ["L", [3.6, 0], [3.6, 6]],
    ["L", [0, 3], [3.6, 3]],
  ),
  I: g(0.6, ["L", [0.3, 0], [0.3, 6]]),
  J: g(3, ["C", [3, 0], [3, 4.4], [2.5, 5.6], [1.4, 6], [0.3, 5.5], [0, 4.6]]),
  K: g(
    3.5,
    ["L", [0, 0], [0, 6]],
    ["L", [3.4, 0], [0, 3.8]],
    ["L", [1.2, 2.6], [3.6, 6]],
  ),
  L: g(3.1, ["L", [0, 0], [0, 6], [3.1, 6]]),
  M: g(4.6, ["L", [0, 6], [0, 0], [2.3, 4.2], [4.6, 0], [4.6, 6]]),
  N: g(3.7, ["L", [0, 6], [0, 0], [3.7, 6], [3.7, 0]]),
  O: g(4, [
    "C",
    [2, 0],
    [0.4, 0.9],
    [0, 3],
    [0.4, 5.1],
    [2, 6],
    [3.6, 5.1],
    [4, 3],
    [3.6, 0.9],
    [2, 0],
    [1.5, 0.15],
  ]),
  P: g(
    3.4,
    ["L", [0, 6], [0, 0]],
    ["C", [0, 0], [2.4, 0], [3.4, 0.8], [3.4, 2.4], [2.4, 3.2], [0, 3.2]],
  ),
  Q: g(
    4,
    [
      "C",
      [2, 0],
      [0.4, 0.9],
      [0, 3],
      [0.4, 5.1],
      [2, 6],
      [3.6, 5.1],
      [4, 3],
      [3.6, 0.9],
      [2, 0],
      [1.5, 0.15],
    ],
    ["L", [2.4, 4.4], [4.1, 6.3]],
  ),
  R: g(
    3.6,
    ["L", [0, 6], [0, 0]],
    ["C", [0, 0], [2.4, 0], [3.4, 0.8], [3.4, 2.4], [2.4, 3.2], [0, 3.2]],
    ["L", [1.5, 3.2], [3.6, 6]],
  ),
  S: g(3.5, [
    "C",
    [3.4, 0.9],
    [2.4, 0],
    [1.2, 0],
    [0.2, 0.8],
    [0.3, 2.2],
    [1.8, 3],
    [3.3, 3.8],
    [3.5, 5],
    [2.6, 6],
    [1.2, 6],
    [0, 5.1],
  ]),
  T: g(3.8, ["L", [0, 0], [3.8, 0]], ["L", [1.9, 0], [1.9, 6]]),
  U: g(3.6, [
    "C",
    [0, 0],
    [0, 4.2],
    [0.5, 5.5],
    [1.8, 6],
    [3.1, 5.5],
    [3.6, 4.2],
    [3.6, 0],
  ]),
  V: g(4, ["L", [0, 0], [2, 6], [4, 0]]),
  W: g(5.2, ["L", [0, 0], [1.3, 6], [2.6, 1.6], [3.9, 6], [5.2, 0]]),
  X: g(3.6, ["L", [0, 0], [3.6, 6]], ["L", [3.6, 0], [0, 6]]),
  Y: g(3.8, ["L", [0, 0], [1.9, 3]], ["L", [3.8, 0], [1.9, 3], [1.9, 6]]),
  Z: g(3.6, ["L", [0, 0], [3.6, 0], [0, 6], [3.6, 6]]),
  "0": g(3.2, [
    "C",
    [1.6, 0],
    [0.3, 0.9],
    [0, 3],
    [0.3, 5.1],
    [1.6, 6],
    [2.9, 5.1],
    [3.2, 3],
    [2.9, 0.9],
    [1.6, 0],
    [1.2, 0.2],
  ]),
  "1": g(1.6, ["L", [0.2, 1.2], [1.4, 0], [1.4, 6]]),
  "2": g(
    3.4,
    ["C", [0.1, 1.2], [1, 0.1], [2.4, 0], [3.3, 1], [3.1, 2.4], [0, 6]],
    ["L", [0, 6], [3.5, 6]],
  ),
  "3": g(
    3.4,
    ["C", [0.2, 0.8], [1.4, 0], [2.8, 0.2], [3.2, 1.4], [2.4, 2.8], [1.2, 3]],
    ["C", [1.2, 3], [2.8, 3.2], [3.5, 4.4], [2.9, 5.7], [1.4, 6], [0, 5.3]],
  ),
  "4": g(3.8, ["L", [2.7, 6], [2.7, 0], [0, 4.2], [3.8, 4.2]]),
  "5": g(
    3.4,
    ["L", [3.2, 0], [0.4, 0], [0.2, 2.6]],
    [
      "C",
      [0.2, 2.6],
      [1.6, 2.2],
      [3, 2.8],
      [3.5, 4.2],
      [2.8, 5.7],
      [1.4, 6],
      [0, 5.3],
    ],
  ),
  "6": g(3.3, [
    "C",
    [3, 0.3],
    [1.8, 0],
    [0.6, 0.9],
    [0, 3],
    [0.2, 5],
    [1.6, 6],
    [3, 5.4],
    [3.3, 4],
    [2.4, 3],
    [1, 3.1],
    [0.1, 4],
  ]),
  "7": g(3.6, ["L", [0, 0], [3.6, 0], [1.2, 6]]),
  "8": g(3.4, [
    "C",
    [1.7, 3],
    [0.4, 2.2],
    [0.5, 0.7],
    [1.7, 0],
    [2.9, 0.7],
    [3, 2.2],
    [1.7, 3],
    [0.1, 3.9],
    [0.2, 5.4],
    [1.7, 6],
    [3.2, 5.4],
    [3.3, 3.9],
    [1.7, 3],
  ]),
  "9": g(3.3, [
    "C",
    [3.2, 2.2],
    [2.2, 3],
    [0.8, 2.8],
    [0.1, 1.6],
    [0.8, 0.2],
    [2.2, 0],
    [3.2, 1],
    [3.3, 3],
    [2.8, 5],
    [1.4, 6],
    [0.3, 5.4],
  ]),
  "×": g(2.8, ["L", [0.2, 2.2], [2.6, 5]], ["L", [2.6, 2.2], [0.2, 5]]),
  "→": g(4.4, ["L", [0, 3.3], [4.3, 3.3]], ["L", [3, 2], [4.4, 3.3], [3, 4.6]]),
  "—": g(4.4, ["L", [0.1, 3.4], [4.3, 3.35]]),
  "-": g(2.4, ["L", [0.1, 3.4], [2.3, 3.4]]),
  "+": g(3, ["L", [0, 3.3], [3, 3.3]], ["L", [1.5, 1.8], [1.5, 4.8]]),
  "=": g(3, ["L", [0, 2.6], [3, 2.6]], ["L", [0, 4.2], [3, 4.2]]),
  ">": g(3, ["L", [0, 1.6], [3, 3.3], [0, 5]]),
  "<": g(3, ["L", [3, 1.6], [0, 3.3], [3, 5]]),
  "?": g(
    3.2,
    [
      "C",
      [0.2, 1.2],
      [1.2, 0],
      [2.6, 0.1],
      [3.2, 1.2],
      [2.8, 2.4],
      [1.6, 3.2],
      [1.6, 4.3],
    ],
    ["L", [1.6, 5.6], [1.65, 6]],
  ),
  "!": g(0.8, ["L", [0.4, 0], [0.4, 4.2]], ["L", [0.4, 5.6], [0.45, 6]]),
  ".": g(0.8, ["L", [0.4, 5.6], [0.45, 6]]),
  ",": g(0.9, ["L", [0.6, 5.3], [0.2, 6.8]]),
  ":": g(0.8, ["L", [0.4, 2.2], [0.45, 2.6]], ["L", [0.4, 5.6], [0.45, 6]]),
  "/": g(2.6, ["L", [2.6, -0.2], [0, 6.4]]),
  "'": g(0.6, ["L", [0.3, 0], [0.2, 1.6]]),
  "(": g(1.6, ["C", [1.6, -0.4], [0.4, 1.4], [0, 3.2], [0.4, 5], [1.6, 6.8]]),
  ")": g(1.6, ["C", [0, -0.4], [1.2, 1.4], [1.6, 3.2], [1.2, 5], [0, 6.8]]),
  "%": g(
    3.8,
    ["L", [3.4, 0], [0.4, 6]],
    [
      "C",
      [0.9, 0],
      [0.1, 0.5],
      [0.1, 1.5],
      [0.9, 2.1],
      [1.6, 1.5],
      [1.6, 0.5],
      [0.9, 0],
      [0.6, 0.1],
    ],
    [
      "C",
      [2.9, 3.9],
      [2.1, 4.4],
      [2.1, 5.4],
      [2.9, 6],
      [3.7, 5.4],
      [3.7, 4.4],
      [2.9, 3.9],
      [2.6, 4],
    ],
  ),
};

export type WriteOptions = {
  /** Height of a capital, in document pixels. */
  cap: number;
  /** Forward slant (shear of x by y); a hand leans a little. */
  slant?: number;
  /** Letter-spacing, in grid units. */
  tracking?: number;
  /** Pen speed while lettering, document pixels a second. */
  speed?: number;
};

/** The width `text` takes at `cap`, for placing it (grid units → pixels). */
export function measure(text: string, cap: number, tracking = 1.3): number {
  const unit = cap / 6;
  let w = 0;
  for (const ch of text.toUpperCase()) {
    w += ch === " " ? 2.6 : (GLYPHS[ch]?.w ?? 2.6) + tracking;
  }
  return Math.max(0, w - tracking) * unit;
}

/**
 * Letter `text` in block capitals starting at `at` (the top of the first
 * capital). A newline starts the next line below. Returns one point list per
 * pen stroke, in the order they were written.
 */
export function write(
  hand: Hand,
  text: string,
  at: Pt,
  o: WriteOptions,
): Pt[][] {
  const unit = o.cap / 6;
  const slant = o.slant ?? 0.12;
  const tracking = o.tracking ?? 1.3;
  const strokes: Pt[][] = [];
  let lineTop = at.y;
  for (const line of text.toUpperCase().split("\n")) {
    let x = at.x;
    // The baseline drifts over a line, and each letter sits a little off it.
    const drift = hand.j(0.12);
    let i = 0;
    for (const ch of line) {
      if (ch === " ") {
        x += 2.6 * unit * hand.r(0.85, 1.15);
        i += 1;
        continue;
      }
      const glyph = GLYPHS[ch];
      if (!glyph) continue;
      const k = hand.r(0.93, 1.07);
      const u = unit * k;
      const dy = (drift * i + hand.j(0.18)) * unit + (1 - k) * 6 * unit;
      const lean = slant + hand.j(0.05);
      const place = ([gx, gy]: [number, number]): Pt => ({
        x: x + gx * u + (6 - gy) * u * lean,
        y: lineTop + dy + gy * u,
      });
      for (const [kind, ...pts] of glyph.parts) {
        const placed = pts.map(place);
        const speed = o.speed ?? Math.max(500, o.cap * 9);
        strokes.push(
          kind === "C" || placed.length === 2
            ? hand.curve(placed, { speed, wander: o.cap * 0.012 })
            : hand.trace(corners(placed), { speed, wander: o.cap * 0.012 }),
        );
      }
      x += (glyph.w + tracking) * u;
      i += 1;
    }
    lineTop += o.cap * 1.55;
  }
  return strokes;
}

/** A polyline guide at a 2 px step, corners kept sharp. */
function corners(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let s = 0; s < n; s++) {
      out.push({
        x: a.x + ((b.x - a.x) * s) / n,
        y: a.y + ((b.y - a.y) * s) / n,
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}
