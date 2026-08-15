// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a wet mark does to the marks it lands on.
//
// A wash on paper is not a translucent sheet laid over the picture. It is water
// going *into* a sheet that already has colour in it, and the water takes some
// of that colour with it: an ink line a brush crosses softens and feathers out
// into the wet, a first wash and a second one mix where they meet, and the
// pigment that was there before ends up carried a little way outside where it
// was. That is why the order matters — red over blue is not blue over red, on
// paper or here — and it is the whole reason a watercolourist works in passes.
//
// The rest of the mixing is compositing (`ground.ts` picks `multiply` or
// `screen`, and two stains genuinely mix rather than one hiding the other).
// This module is the part compositing cannot do: **moving** what is already
// painted.
//
// The trick is short. Before the mark is laid down:
//
//   1. take a copy of the pixels inside the mark's footprint,
//   2. smear that copy outwards — a ring of offset copies at a fraction of the
//      alpha each, which averages into a blur without needing a blur,
//   3. keep only the part of the smear that falls inside the mark's own shape,
//      by masking it with the mark painted onto a scratch surface, and
//   4. lay it back down.
//
// Then the mark itself goes on top, stained. What you see is the colour that
// was under the brush pulled out into the water and softened, with the mark's
// own edge still crisp — which is what a wet edge crossing a dry line actually
// looks like.
//
// Three things keep it affordable. It is scoped to the mark's bounding box, so
// a small stroke costs a small copy; it is skipped outright past a pixel budget
// (a page-sized wash would otherwise copy the screen three times); and it runs
// only on a ground that soaks — every drawing on the plain solid sheet, which
// is all of them until someone picks a sheet, never reaches this file.
//
// It is deterministic, like every other texture in the app: the smear's
// directions are hashed off the copy index rather than drawn at random, so a
// repaint, a pan and the exported PNG all produce the same bleed.

import { padBox, strokeBounds } from "./bounds.ts";
import { hashedRandom } from "./plugins/grain.ts";
import { mm } from "./units.ts";
import { createSurface, resizeSurface, type Surface } from "./surface.ts";
import type { Stroke } from "./types.ts";

/** How many offset copies the smear is built from. Eight is the fewest that
 *  reads as water rather than as a doubled image. */
const COPIES = 8;

/** How opaque each of those copies is.
 *
 *  Not `1 / COPIES`, which is what an *average* of the neighbourhood would be —
 *  and an average is the wrong picture. A line that has bled is not a fainter
 *  line spread out; it is ink that has travelled, and where the copies overlap
 *  it stacks back up towards the density it had. At an eighth each, a hairline
 *  crossing a wide wash smears down to a couple of percent and is invisible;
 *  at this it reads as the colour having run, which is the thing being drawn. */
const COPY_ALPHA = 0.34;

/** The most device pixels a lift will copy. Past it the mark is a page-sized
 *  wash and the smear would cost three screen-sized copies for an effect
 *  nobody can see at that size — so the mark simply stains without lifting,
 *  which is the graceful half of the behaviour rather than a broken one. */
const BUDGET = 3_000_000;

/** How far the water carries what it lifted, as a share of the mark's width —
 *  and the two ends of what that is allowed to come to, in real millimetres.
 *
 *  Bounded because bleeding is a property of the *paper*, not of the brush: ink
 *  runs a millimetre or two into a wet sheet whether the wash over it was laid
 *  with a rigger or with a mop. Unbounded, a page-wide wash would drag
 *  everything under it half an inch sideways. */
const CARRY = 0.15;
const CARRY_LEAST = mm(0.4);
const CARRY_MOST = mm(2.5);

/** Scratch surfaces, held rather than allocated per mark: a busy page repaints
 *  hundreds of marks and three fresh canvases each would spend more time in the
 *  allocator than in the rasteriser. They are resized to fit and cleared on
 *  every use, so nothing leaks between marks. */
const scratch: {
  snap: Surface | null;
  smear: Surface | null;
  mask: Surface | null;
} = { snap: null, smear: null, mask: null };

function scratchFor(
  which: "snap" | "smear" | "mask",
  width: number,
  height: number,
): Surface | null {
  const held = scratch[which] ?? createSurface(width, height);
  if (!held) return null;
  scratch[which] = held;
  resizeSurface(held, width, height);
  held.ctx.setTransform(1, 0, 0, 1, 0, 0);
  held.ctx.globalAlpha = 1;
  held.ctx.globalCompositeOperation = "source-over";
  held.ctx.clearRect(0, 0, held.canvas.width, held.canvas.height);
  return held;
}

/** The context's transform, or `null` where it cannot report one (the SVG
 *  export's recorder, and the fakes in the tests). Without it there is no way
 *  to know which pixels the mark covers, so the lift is skipped. */
function readTransform(
  ctx: CanvasRenderingContext2D,
): { a: number; d: number; e: number; f: number } | null {
  const read = (
    ctx as CanvasRenderingContext2D & {
      getTransform?: () => { a: number; d: number; e: number; f: number };
    }
  ).getTransform;
  if (typeof read !== "function") return null;
  const m = read.call(ctx);
  return Number.isFinite(m.a) && m.a !== 0 ? m : null;
}

/** Lift what is already painted under `stroke` into the mark's own footprint.
 *
 *  `strength` is `InkBlend.lift` — how much of it the water takes. `paintMark`
 *  paints the mark exactly as the renderer is about to, and is used only to cut
 *  the smear to the mark's shape: whatever the tool draws is the shape the water
 *  reached, so a wash's wandering wet edge bleeds along its bays and a straight
 *  nib bleeds in a straight line, with nothing here knowing which tool it is.
 *
 *  Does nothing — and costs a bounding box — where there is no DOM, no readable
 *  transform, or nothing under the mark to lift. */
export function liftUnder(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  strength: number,
  paintMark: (target: CanvasRenderingContext2D) => void,
): void {
  if (strength <= 0) return;
  const canvas = ctx.canvas;
  if (!canvas || !canvas.width || !canvas.height) return;
  const view = readTransform(ctx);
  if (!view) return;
  const bounds = strokeBounds(stroke);
  if (!bounds) return;

  // The mark's footprint on the canvas, in device pixels, grown by how far the
  // water carries and then clipped to the canvas — a mark half off screen lifts
  // the half that is on it.
  const carry = Math.min(
    CARRY_MOST,
    Math.max(CARRY_LEAST, stroke.size * CARRY),
  );
  const box = padBox(bounds, carry * 2);
  const scale = Math.abs(view.a);
  const x = Math.max(0, Math.floor(box.x * view.a + view.e));
  const y = Math.max(0, Math.floor(box.y * view.d + view.f));
  const right = Math.min(
    canvas.width,
    Math.ceil((box.x + box.width) * view.a + view.e),
  );
  const bottom = Math.min(
    canvas.height,
    Math.ceil((box.y + box.height) * view.d + view.f),
  );
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return;
  if (width * height > BUDGET) return;

  const snap = scratchFor("snap", width, height);
  if (!snap) return;
  snap.ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);

  const smear = scratchFor("smear", width, height);
  if (!smear) return;
  // A ring of copies at even alpha: the average of eight nearby readings of the
  // same pixels, which is a blur built out of the one operation a canvas is
  // fastest at. The radii are uneven so the ring does not print as a ring.
  const reach = Math.max(1, carry * scale);
  smear.ctx.globalAlpha = COPY_ALPHA;
  for (let i = 0; i < COPIES; i++) {
    const angle = (i / COPIES) * Math.PI * 2;
    const out = reach * (0.4 + hashedRandom(i, 0, 23) * 0.8);
    smear.ctx.drawImage(
      snap.canvas,
      Math.cos(angle) * out,
      Math.sin(angle) * out,
    );
  }

  // …cut to the mark's own shape. The mark is painted on a surface of its own
  // in the same document coordinates the page is painted in, so it lands
  // exactly where the real one is about to.
  const mask = scratchFor("mask", width, height);
  if (!mask) return;
  mask.ctx.setTransform(view.a, 0, 0, view.d, view.e - x, view.f - y);
  paintMark(mask.ctx);
  smear.ctx.setTransform(1, 0, 0, 1, 0, 0);
  smear.ctx.globalAlpha = 1;
  smear.ctx.globalCompositeOperation = "destination-in";
  smear.ctx.drawImage(mask.canvas, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = Math.min(1, strength);
  ctx.drawImage(smear.canvas, x, y);
  ctx.restore();
}
