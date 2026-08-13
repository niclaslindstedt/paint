// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Colour conversions for the custom mixer.
//
// The picker is a hue strip beside a saturation/value square — the arrangement
// every paint program uses, because it is the one where "the same colour but
// lighter" is a straight line. The document, meanwhile, stores plain `#rrggbb`
// hex, because that is what a canvas context and a CSS colour both want. These
// are the two conversions between them, kept pure and away from the component
// so they can be tested without a DOM.

/** A colour as the mixer holds it: hue 0–360, saturation and value 0–1. */
export type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

/** Normalise a user-typed or stored colour to `#rrggbb`, or `null` when it is
 *  not one. Accepts the three-digit short form and a missing `#`. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full}`;
}

/** HSV to `#rrggbb`. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector]!;
  const byte = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** `#rrggbb` to HSV. Anything unparseable comes back as black, which is a
 *  colour rather than a crash — the mixer opens somewhere sane whatever it was
 *  handed. */
export function hexToHsv(hex: string): Hsv {
  const normalized = normalizeHex(hex);
  if (!normalized) return { h: 0, s: 0, v: 0 };
  const n = Number.parseInt(normalized.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  let h = 0;
  if (span !== 0) {
    if (max === r) h = 60 * (((g - b) / span + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / span + 2);
    else h = 60 * ((r - g) / span + 4);
  }
  return { h, s: max === 0 ? 0 : span / max, v: max };
}

/** Whether two colours are the same swatch, whatever case or short form they
 *  were written in. */
export function sameColor(a: string, b: string): boolean {
  return normalizeHex(a) === normalizeHex(b);
}

/** The same colour at a given opacity, as a CSS `rgba(…)` string.
 *
 *  The soft brushes need this: a canvas gradient stop takes a colour, not a
 *  colour plus a `globalAlpha`, so an airbrush's falloff has to carry its own
 *  alpha. Anything unparseable comes back unchanged — the caller then gets a
 *  fully opaque stamp rather than an exception. */
export function withAlpha(color: string, alpha: number): string {
  const normalized = normalizeHex(color);
  if (!normalized) return color;
  const n = Number.parseInt(normalized.slice(1), 16);
  const a = clamp(alpha, 0, 1);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${a.toFixed(3)})`;
}
