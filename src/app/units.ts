// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a document pixel is, in the real world.
//
// A drawing is a fixed grid of pixels (see `types.ts`), and for a long time
// that was the *only* thing a width meant: a nib was "6", and 6 was a number
// you could compare against 2 and against 16 and against nothing else. Was 6 a
// technical pen or a marker? The only way to find out was to draw with it.
//
// So the page is pinned to a real sheet of paper. **A document pixel is one
// dot of a 300 dpi print** — the resolution every scanner, every inkjet and
// every print shop assumes, and the one the new-drawing dialog already offers
// under "Print" (A4 at 300 dpi is 2480 × 3508, and it is a preset because that
// is what a page *is*). Everything else here follows from that single choice:
//
//   - a millimetre of page is 11.81 pixels, so a 0.5 mm pencil lead is a
//     six-pixel line and a 25 mm flat brush is a three-hundred-pixel band;
//   - the default 3200 × 2000 page is a sheet 271 × 169 mm — a little wider
//     than A4 on its side, which is about what a sketchbook spread is;
//   - a tool can be described the way its maker describes it. A pencil comes in
//     0.3, 0.5, 0.7 and 0.9 mm; a round brush numbered 6 is 4.8 mm across the
//     ferrule; type is set in points. Those are the numbers on the box, and now
//     they are the numbers in the app (see `plugins/gauge.ts`).
//
// The painters were already drawing at very nearly this scale — the crayon's
// tooth is documented as "a fifth of a millimetre… about two pixels", which is
// 254 dpi — so pinning it down mostly *ratified* the constants they had rather
// than moving them. The ones that were written against a page of some other
// size now say what they are in millimetres and convert here.
//
// Widths on strokes are still document pixels, and nothing already drawn moves:
// this module changes what a number *means*, not what any mark is.

/** Dots per inch a document pixel stands for. */
export const DPI = 300;

/** How many document pixels a millimetre of the page is. */
export const PX_PER_MM = DPI / 25.4;

/** …and a typographic point, which is what type is measured in everywhere
 *  outside this app. 72 to the inch, so a 12 pt caption is 50 px tall. */
export const PX_PER_PT = DPI / 72;

/** Millimetres of page, in document pixels. The conversion every physical
 *  constant in the painters and every gauge in the toolbox is written through,
 *  so the numbers in the source read as the implement they describe. */
export function mm(millimetres: number): number {
  return millimetres * PX_PER_MM;
}

/** Document pixels, in millimetres of page. */
export function toMm(px: number): number {
  return px / PX_PER_MM;
}

/** Points of type, in document pixels. */
export function pt(points: number): number {
  return points * PX_PER_PT;
}

/** Document pixels, in points of type. */
export function toPt(px: number): number {
  return px / PX_PER_PT;
}

/** A width as the pickers print it, in millimetres.
 *
 *  Three precisions, because a millimetre covers four orders of magnitude of
 *  implement here and no single one of them reads: a technical pen is 0.18 and
 *  needs both decimals, a brush is 4.8 and needs one, a decorator's brush is
 *  140 and needs none. The rule is simply "about three significant figures,
 *  and never a decimal that says nothing" — 5.0 prints as 5. */
export function formatMm(px: number): string {
  const value = toMm(px);
  const places = value < 1 ? 2 : value < 10 ? 1 : 0;
  return trim(value.toFixed(places));
}

/** A type size as the text tool's picker prints it, in points. Whole points
 *  above 10 (nobody sets a caption in 11.5), one decimal below. */
export function formatPt(px: number): string {
  const value = toPt(px);
  return trim(value.toFixed(value < 10 ? 1 : 0));
}

/** Drop a trailing `.0` / `.50` so a round number reads as one. */
function trim(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
