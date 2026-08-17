// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ink film into pixels.
//
// A film of ink is something light has to get through, so each cell of the
// quill field becomes a transmittance and then the colour-and-alpha pair that
// composites to the same thing — the wash's own arithmetic (`washFilm`), which
// is exact under the `multiply` a wet mark on absorbent paper already uses and
// mirrored on a dark page the same way. Sharing it is the point: ink and
// watercolour are the same physics at two thicknesses, and the two media must
// agree about what a page colour means.
//
// It lives apart from the walk (`quillSim.ts`) because it is a different kind
// of thing: the walk decides what the paper took, this decides what that looks
// like — and it is the one part of the engine that is pure per-cell arithmetic
// over the finished film, which is why it is a lookup table and a tight loop.

import { isDarkColor } from "../canvas.ts";
import type { Surface } from "../surface.ts";
import { keeping, washFilm } from "./washSim.ts";

/** How much optical density one unit of film is worth — the number that turns
 *  the field's arithmetic into `washFilm`'s Beer–Lambert. Set so one pass of a
 *  full nib reads as wet ink — strong, but translucent enough that a crossing
 *  visibly deepens and the shading of the hand shows through. It has to sit in
 *  the middle of the curve: much higher and every stroke saturates to the same
 *  solid, which is exactly the perfect nib this engine replaced. */
const DENSITY = 0.55;

/** The floor under a channel's transmittance, tighter than the wash's own
 *  (`KEEP_LEAST`): even india ink at one pass is a film, not paint, so the
 *  blackest ink still lets a little through — which is what leaves its pools,
 *  crossings and slow curves somewhere darker to go. Without it a near-black
 *  ink clips to solid and the whole simulation disappears into the flat fill
 *  it replaced. */
const KEEP_FLOOR = 0.06;

/** How the shade table is indexed: film in `[0, LUT_SPAN)` over `LUT_SIZE`
 *  steps. Film past the span — three or four full passes over one cell — is
 *  clamped, where the alpha curve is flat to the eye anyway. */
const LUT_SIZE = 512;
const LUT_SPAN = 4;

/** The least alpha worth writing into a pixel. */
const FAINT = 1 / 512;

/** The shade one cell of film dries to, tabulated once per mark: film is a
 *  continuous quantity but the eye is not, and three `Math.pow` per cell of a
 *  page-wide flourish is the sort of bill a lookup was invented for. */
export type ShadeLut = { rgba: Uint8Array };

/** `density` is how much optical density one unit of film is worth — the
 *  medium's thickness. It defaults to the ink's; the paintbrush passes its
 *  own, higher one, because body paint covers in one pass where an ink film
 *  shades (see `bristleSim.ts`). Same curve, third medium. */
export function shadeLut(
  color: string,
  page: string,
  density = DENSITY,
): ShadeLut {
  const dark = isDarkColor(page);
  const kept = keeping(color, dark);
  // The ink's own, slightly higher floor (see `KEEP_FLOOR`).
  const keep: [number, number, number] = [
    Math.max(KEEP_FLOOR, kept[0]),
    Math.max(KEEP_FLOOR, kept[1]),
    Math.max(KEEP_FLOOR, kept[2]),
  ];
  const rgba = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const film = ((i + 0.5) * LUT_SPAN) / LUT_SIZE;
    const shade = washFilm(keep, film * density, dark);
    if (!shade || shade[3] < FAINT) continue;
    rgba[i * 4] = byte(shade[0]);
    rgba[i * 4 + 1] = byte(shade[1]);
    rgba[i * 4 + 2] = byte(shade[2]);
    rgba[i * 4 + 3] = byte(shade[3]);
  }
  return { rgba };
}

/** Turn a patch of what the paper took into the field canvas's pixels — the
 *  patch is the whole field for a landed mark, and the dirty box of one
 *  advance for the gesture in flight. `false` where the browser will not give
 *  us an image to write into.
 *
 *  The field is any patch with a film over it — the quill's and the
 *  paintbrush's both, which is the point: what the paper took differs per
 *  medium, what a film of it looks like does not. */
export function drawPatch(
  surface: Surface,
  field: { width: number; film: Float32Array },
  lut: ShadeLut,
  x0: number,
  y0: number,
  width: number,
  height: number,
): boolean {
  const film = field.film;
  const rgba = lut.rgba;
  const scale = LUT_SIZE / LUT_SPAN;
  let image: ImageData;
  try {
    image = surface.ctx.createImageData(width, height);
  } catch {
    return false;
  }
  const pixels = image.data;
  for (let row = 0; row < height; row++) {
    let at = (y0 + row) * field.width + x0;
    let out = row * width * 4;
    for (let col = 0; col < width; col++, at++, out += 4) {
      const held = film[at]!;
      if (held <= 0) {
        pixels[out + 3] = 0;
        continue;
      }
      let index = (held * scale) | 0;
      if (index >= LUT_SIZE) index = LUT_SIZE - 1;
      const from = index * 4;
      pixels[out] = rgba[from]!;
      pixels[out + 1] = rgba[from + 1]!;
      pixels[out + 2] = rgba[from + 2]!;
      pixels[out + 3] = rgba[from + 3]!;
    }
  }
  surface.ctx.putImageData(image, x0, y0);
  return true;
}

function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
