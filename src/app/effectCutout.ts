// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Painting the Delete background effect — the canvas half of `cutout.ts`.
//
// `cutout.ts` is pure: pixels and a tracing in, an alpha mask out. This is
// the shim that reads the pixels off whatever context the effect pipeline
// hands in (the screen during the dialog, a bake's off-screen surface — see
// `effectPaint.ts`), maps the traced subject from document coordinates onto
// that canvas, and multiplies the found mask into the picture's alpha.
//
// The solve is the one effect expensive enough to be worth remembering: a
// dialog's slider repaints the preview per pointer sample, and the mask only
// changes when the draft or the window does. So results are kept on the draft
// itself (a WeakMap — a closed dialog's drafts take their masks with them),
// keyed by the window they were solved for.

import { cutout } from "./cutout.ts";
import type { EffectPaint, Region } from "./effectPaint.ts";
import type { Effect } from "./effects.ts";
import type { Point } from "./types.ts";

type CutoutEffect = Extract<Effect, { kind: "cutout" }>;

/** The few most recent windows' masks per draft. Two is enough for the two
 *  windows a dialog paints (the canvas behind and the phone-width peek); one
 *  more absorbs a pan without a re-solve on the way back. */
const REMEMBERED = 3;

const remembered = new WeakMap<
  CutoutEffect,
  Map<string, Uint8ClampedArray | null>
>();

/** Cut the picture on `ctx` down to the traced subject. */
export function paintCutout(
  ctx: CanvasRenderingContext2D,
  region: Region,
  effect: CutoutEffect,
  paint: EffectPaint,
): void {
  if (effect.subject.length === 0) return;
  let image: ImageData;
  try {
    image = ctx.getImageData(region.x, region.y, region.width, region.height);
  } catch {
    return;
  }
  if (!image?.data || image.data.length < region.width * region.height * 4) {
    return;
  }

  const alpha = solve(image, region, effect, paint);
  if (!alpha) return;
  const data = image.data;
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i]!;
    if (a === 255) continue;
    data[i * 4 + 3] = (data[i * 4 + 3]! * a) / 255;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(image, region.x, region.y);
  ctx.restore();
}

function solve(
  image: ImageData,
  region: Region,
  effect: CutoutEffect,
  paint: EffectPaint,
): Uint8ClampedArray | null {
  const key = `${region.x},${region.y},${region.width},${region.height},${paint.scale}`;
  let masks = remembered.get(effect);
  if (masks?.has(key)) return masks.get(key) ?? null;

  // The tracing, from document coordinates onto this window's pixels.
  const scale = paint.scale;
  const subject: Point[][] = effect.subject.map((loop) =>
    loop.map((p) => ({
      x: paint.page.x + p.x * scale - region.x,
      y: paint.page.y + p.y * scale - region.y,
    })),
  );
  // The band is a document distance like every effect's, but it may not
  // starve: zoomed far out, twenty document pixels is two on screen, and a
  // two-pixel band has no border to find. The preview is then coarser than
  // the bake — which is already true of every pixel on a zoomed-out screen.
  const result = cutout(image.data, region.width, region.height, subject, {
    band: Math.max(4, Math.round(effect.band * scale)),
    feather: effect.feather * scale,
    tolerance: effect.tolerance,
    smoothness: effect.smoothness,
  });

  if (!masks) {
    masks = new Map();
    remembered.set(effect, masks);
  }
  if (masks.size >= REMEMBERED) {
    const oldest = masks.keys().next().value;
    if (oldest !== undefined) masks.delete(oldest);
  }
  masks.set(key, result?.alpha ?? null);
  return result?.alpha ?? null;
}
