// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The magnifier a selection is placed under.
//
// A selection is the one gesture in the app where being a pixel out matters. A
// pencil line a pixel off is a pencil line; a window cut a pixel wide of the
// edge you meant is a hairline of the old ink left behind when you move what
// is inside it, or a hairline of the new ink shaved off. And the edge you are
// aiming at is under your own finger — on touch, literally.
//
// So while a selection is being dragged out or its corners adjusted, a round
// magnifier floats beside the point being placed and shows that part of the
// page at **300%** — three device pixels to the document pixel, the same
// reading of "percent" the zoom pill uses (see `nativeScale`) — with the
// outline drawn in it and a crosshair on the exact point. It is chrome: it
// paints after the mark cache has taken its copy of the screen, it never
// exports, and nothing about it reaches the document.
//
// It is painted from the document rather than magnified off the screen,
// deliberately. Blowing the frame up would show you the fitted-zoom pixels four
// times the size, which is precisely the picture that is not accurate enough to
// aim with; painting the page again at the loupe's own scale shows the edge
// where it really is. The window it repaints is a few dozen document pixels
// across, so the renderer's own cull leaves almost every mark on the page
// untouched (see `geometry.ts`).

import { paintOutline } from "./plugins/builtin/select.ts";
import { renderDrawing, type RenderOptions } from "./render.ts";
import type { SelectionRegion } from "./selection.ts";
import type { Drawing, Point, Stroke } from "./types.ts";

/** Device pixels per document pixel inside the glass — "300%" as the zoom
 *  readout counts it. */
export const LOUPE_ZOOM = 3;

/** How wide the glass is, in CSS pixels. Big enough to show the edge you are
 *  placing and what is on either side of it, small enough not to be the thing
 *  you are looking at. */
const LOUPE_SIZE = 132;

/** How far the glass floats from the point it is showing, in CSS pixels —
 *  clear of a fingertip, which is the pointer it exists for. */
const LOUPE_GAP = 26;

/** Everything the glass is painted from. */
export type Loupe = {
  /** The point being placed, in document coordinates — the middle of the
   *  glass, and where the crosshair sits. */
  at: Point;
  drawing: Drawing;
  options: RenderOptions;
  /** The gesture in flight, so a marquee being dragged shows in the glass as
   *  well as on the page. */
  draft: Stroke | null;
  /** The selection's outline, drawn inside the glass at its own scale so you
   *  can see exactly which pixels the window falls between. */
  region: SelectionRegion | null;
  /** The window being painted into, in device pixels, and the view it is
   *  painted through. */
  width: number;
  height: number;
  dpr: number;
  view: { scale: number; tx: number; ty: number };
};

/** Paint the glass onto the canvas, in device pixels. The context is left with
 *  the transform it arrived with. */
export function paintLoupe(ctx: CanvasRenderingContext2D, loupe: Loupe): void {
  const { at, dpr, view, width, height } = loupe;
  const size = LOUPE_SIZE * dpr;
  const radius = size / 2;
  // Where the point being placed is on the screen, in device pixels.
  const on = {
    x: (at.x * view.scale + view.tx) * dpr,
    y: (at.y * view.scale + view.ty) * dpr,
  };
  const gap = LOUPE_GAP * dpr;
  // Above and to the right by default, and on whichever side of the pointer
  // there is room for it — a glass that ran off the edge of the window would be
  // half a glass exactly when the edge is what you are aiming at.
  const centre = {
    x: on.x + gap + radius <= width ? on.x + gap + radius : on.x - gap - radius,
    y: on.y - gap - radius >= 0 ? on.y - gap - radius : on.y + gap + radius,
  };
  centre.x = Math.min(
    Math.max(centre.x, radius),
    Math.max(radius, width - radius),
  );
  centre.y = Math.min(
    Math.max(centre.y, radius),
    Math.max(radius, height - radius),
  );

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  ctx.clip();
  // The glass has a sheet of its own under it: the page is painted into it, and
  // what falls outside the page has to read as the desk rather than as whatever
  // the frame happened to have there.
  ctx.clearRect(centre.x - radius, centre.y - radius, size, size);

  // The page again, at the glass's own scale, with the point being placed in
  // the middle of it.
  const k = LOUPE_ZOOM;
  ctx.setTransform(k, 0, 0, k, centre.x - at.x * k, centre.y - at.y * k);
  const half = radius / k;
  renderDrawing(ctx, loupe.drawing, loupe.draft, {
    ...loupe.options,
    scale: k,
    clip: {
      x: at.x - half,
      y: at.y - half,
      width: half * 2,
      height: half * 2,
    },
    // The marks being dragged are shown on the page by the frame itself; the
    // glass shows the document, so it must not leave them out.
    omit: undefined,
  });
  if (loupe.region) paintOutline(ctx, loupe.region, k);
  ctx.restore();

  // The rim and the crosshair, in device pixels — chrome over chrome.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeStyle = "rgba(17,24,39,0.55)";
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, radius - ctx.lineWidth, 0, Math.PI * 2);
  ctx.stroke();
  const arm = 7 * dpr;
  ctx.beginPath();
  ctx.moveTo(centre.x - arm, centre.y);
  ctx.lineTo(centre.x + arm, centre.y);
  ctx.moveTo(centre.x, centre.y - arm);
  ctx.lineTo(centre.x, centre.y + arm);
  ctx.strokeStyle = "rgba(17,24,39,0.8)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  ctx.restore();
}
