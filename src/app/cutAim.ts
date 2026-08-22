// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What Delete background is aiming at, drawn on the page while you trace it.
//
// The cut is the one thing in this app whose result depends on a *number the
// user cannot see*: the tracing says roughly where the border is, and the solve
// then searches a band either side of it for the real one (see `cutout.ts`).
// Everything inside that band is up for grabs — it can be taken from the
// subject or given back to it — and everything outside it is settled before the
// solve begins. A person who cannot see the band has no way to know why a cut
// kept the chair leg beside the arm, and no way to know that pulling the search
// width down to four pixels would have stopped it.
//
// So while a cut is being aimed the window stops being a marquee and starts
// being a diagram of the cut:
//
//   - **red** is the subject — what you have said to keep;
//   - **yellow** is the band, the strip either side of your line where the true
//     border is looked for. Nothing beyond it moves.
//
// With the selection pencil the band is the **nib's own swath**: what you paint
// is what is searched, and the yellow lands exactly under the stripe you just
// drew (see `CutoutOptions.nib`). That is the whole of the diagram's argument
// for a painted tracing — the band is not a number you have to picture, it is
// the width of the thing in your hand.
//
// Two colours over a photograph rather than the marching ants, because ants say
// "something is selected" and this has to say "here is what I will decide, and
// here is where I will decide it". The ants come back the moment the aim ends.
//
// It is chrome: painted after the mark cache has taken its copy of the screen,
// never exported, never in the document (see `frame.ts`).

import type { Point } from "./types.ts";

/** What the cut is being aimed with — the band it will search, in document
 *  pixels. The kind of effect it belongs to is the screen's business; all this
 *  needs is the distance. */
export type CutAim = {
  /** Half-width of the searched band, in document pixels (see
   *  `CutoutOptions.band`). */
  band: number;
  /** Half the width of the nib the outline was painted with, in document
   *  pixels, or 0 for an outline that was chosen rather than painted.
   *
   *  It moves the band: a painted outline is the rim of a stripe, so the band
   *  is centred a nib's half-width *inside* the contour — on the line the nib's
   *  centre walked — rather than on the contour itself (see
   *  `CutoutOptions.nib`). At the width the cut opens at, band and nib are the
   *  same number and the yellow is the stripe. */
  nib: number;
};

// Both washes sit at a fifth of full strength, and the line round the subject
// only halfway up. This is a diagram laid over a *photograph*, and the
// photograph is the thing being judged: a solid red subject under a solid
// yellow band would say exactly the same about where the cut looks while making
// it impossible to see the shoulder you are deciding about. Twenty percent is
// enough to read the two zones apart at a glance and little enough that the
// picture underneath is still the picture.

/** The subject's wash: what you have said to keep. */
const SUBJECT_FILL = "rgba(226, 62, 62, 0.20)";
const SUBJECT_LINE = "rgba(226, 62, 62, 0.55)";

/** The band. Translucent strokes whose width is twice the reach cover exactly
 *  what the cut may look at, and their edges come out hard — which is the
 *  honest picture: the cut's reach ends there, it does not fade. */
const BAND_FILL = "rgba(240, 196, 32, 0.20)";

/** How thick the line round the subject is drawn, in screen pixels — divided by
 *  the zoom on the way in, so it stays a line rather than fattening into a band
 *  of its own when the page is magnified. */
const LINE_WIDTH = 1.75;

/** Paint the aim over the page: the searched band, then the subject inside it.
 *
 *  The context arrives in document coordinates (as `paintChrome` keeps it) and
 *  leaves as it came. `scale` is the view's, used only to keep the outline a
 *  constant width on screen; `page` is the sheet, which the whole diagram is
 *  clipped to — a window may be drawn half off the paper and a band always
 *  reaches twenty pixels further, but there are no pixels out there to cut, and
 *  a wash spilling onto the desk would promise there were. */
export function paintCutAim(
  ctx: CanvasRenderingContext2D,
  region: readonly (readonly Point[])[],
  aim: CutAim,
  scale: number,
  page: { width: number; height: number },
): void {
  const loops = region.filter((loop) => loop.length >= 3);
  if (loops.length === 0) return;

  const path = new Path2D();
  for (const loop of loops) {
    path.moveTo(loop[0]!.x, loop[0]!.y);
    for (let i = 1; i < loop.length; i++) path.lineTo(loop[i]!.x, loop[i]!.y);
    path.closePath();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();

  // The band first, under everything, and drawn as *strokes* rather than as two
  // offset outlines: a stroke of width 2·r is the set of points within r of the
  // line, corners included, where an offset polygon would need mitring and
  // would get it wrong on a traced loop's kinks.
  //
  // With a nib the band is no longer symmetric about the contour — it runs from
  // `nib + reach` inside it to `reach − nib` outside — and there is no stroke
  // that draws a lopsided band directly. So it is drawn as its two halves, each
  // stroked wide and then clipped to the side of the contour it belongs on: the
  // inside half by the region itself, the outside half by everything but. With
  // no nib the two halves meet on the contour and are the single stroke this
  // always drew.
  const reach = Math.max(aim.band, aim.nib);
  if (reach + aim.nib > 0) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = BAND_FILL;
    // Inside the contour: everything from the band's inner rim out to the
    // contour, which is the whole of the band when the nib is as wide as the
    // search — the stripe the pencil painted, and nothing else.
    ctx.save();
    ctx.clip(path, "evenodd");
    ctx.lineWidth = (reach + aim.nib) * 2;
    ctx.stroke(path);
    ctx.restore();
    // …and outside it, the sliver the search reaches past what was painted.
    // Empty at the width the cut opens at, and the whole outward half of the
    // band for an outline that was never painted at all.
    if (reach > aim.nib) {
      const beyond = new Path2D();
      beyond.rect(0, 0, page.width, page.height);
      for (const loop of loops) {
        beyond.moveTo(loop[0]!.x, loop[0]!.y);
        for (let i = 1; i < loop.length; i++) {
          beyond.lineTo(loop[i]!.x, loop[i]!.y);
        }
        beyond.closePath();
      }
      ctx.save();
      ctx.clip(beyond, "evenodd");
      ctx.lineWidth = (reach - aim.nib) * 2;
      ctx.stroke(path);
      ctx.restore();
    }
  }

  // …then the subject, which is what the band is *around*. Even-odd, like every
  // other reading of a traced region here: a loop drawn inside another is a
  // hole in the subject rather than a second one (see `regionMask.ts`).
  ctx.fillStyle = SUBJECT_FILL;
  ctx.fill(path, "evenodd");
  ctx.strokeStyle = SUBJECT_LINE;
  ctx.lineWidth = LINE_WIDTH / scale;
  ctx.lineJoin = "round";
  ctx.stroke(path);
  ctx.restore();
}
