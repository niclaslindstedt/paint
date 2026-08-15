// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a document pixel is, in the real world.
//
// A drawing is a fixed grid of pixels (see `types.ts`), and for a long time
// that was the *only* thing a width meant: a nib was "6", and 6 was a number
// you could compare against 2 and against 16 and against nothing else. Was 6 a
// technical pen or a marker? The only way to find out was to draw with it.
//
// So the page is pinned to something physical. **A document pixel is one dot of
// an iPhone's screen — 460 pixels to the inch**, which is what every phone in
// the current line measures (and every OLED iPhone back to the 12).
//
// It could have been a printing resolution, and it was: 300 dpi, on the
// reasoning that a page is a piece of paper. But this app is not a page you
// print, it is a page you **draw on with a finger**, and the sheet it is really
// laid against is the glass under your hand. Calibrating to the screen makes the
// number on the size button a distance you can measure *on the device you are
// holding*: set the marker to 5 mm, hold the drawing at 1:1, and the band under
// your thumb is five millimetres wide. At 300 dpi that same band came out at
// three and a third — the app said one thing and the glass said another, and the
// glass is the one you can put a ruler on.
//
// Everything else follows from that single number:
//
//   - a millimetre of page is 18.11 pixels, so a 0.5 mm pencil lead is a
//     nine-pixel line and a 25 mm flat brush is a four-hundred-pixel band;
//   - the default 3200 × 2000 page is a sheet 177 × 110 mm — a postcard held
//     landscape, which is about what a phone-drawn sketch is;
//   - the new-drawing dialog's "A4" preset is A4 *here*, because it is written
//     in millimetres through this module rather than in the pixels of some
//     other machine's printer (see `canvasSize.ts`);
//   - a tool can be described the way its maker describes it. A pencil comes in
//     0.3, 0.5, 0.7 and 0.9 mm; a round brush numbered 6 is 4.8 mm across the
//     ferrule; type is set in points. Those are the numbers on the box, and now
//     they are the numbers in the app (see `plugins/gauge.ts`).
//
// Every physical constant in the painters is written in millimetres and
// converted here, so the paper's tooth, a brush's hair gauge and how far a
// loaded head runs all move with this number rather than having to be re-tuned
// beside it.
//
// Widths on strokes are still document pixels, and nothing already drawn moves:
// this module changes what a number *means*, not what any mark is.

/** Pixels per inch a document pixel stands for: an iPhone's screen.
 *
 *  460 is the whole current line — the 16, 16 Plus, 16 Pro and 16 Pro Max all
 *  measure it, as does every OLED iPhone since the 12. (The SE, at 326, is the
 *  one that does not, and it is the one nobody is drawing a watercolour on.) */
export const DPI = 460;

/** How many document pixels a millimetre of the page is. */
export const PX_PER_MM = DPI / 25.4;

/** …and a typographic point, which is what type is measured in everywhere
 *  outside this app. 72 to the inch, so a 12 pt caption is 77 px tall. */
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
