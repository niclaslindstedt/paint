// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The window the colour tools read the page through.
//
// The dropper wants the colour under the pointer and the bucket wants the shape
// of the area under it, and neither question can be answered from the document:
// a stroke list says what was drawn, not what is on top after twenty passes of
// a translucent highlighter. So both are answered from a *raster* — the same
// renderer the screen and the PNG export use, run once onto an off-screen
// canvas at the moment of the press.
//
// It is deliberately not the on-screen canvas being read. That one is a window:
// it holds only what is currently scrolled into view, at whatever zoom, so a
// fill would come out differently depending on where you had panned to. A
// snapshot of the whole page at a fixed resolution makes a tool's answer a
// property of the drawing instead of a property of your scroll position.
//
// This module is the one place in the tool path that needs a DOM. Everything it
// feeds — the flood, the tracing, the tool behaviours — is pure (see
// `flood.ts`), which is why the tools stay testable in node.

import { regionAt as traceRegion } from "./flood.ts";
import type { CanvasProbe } from "./plugins/types.ts";
import { renderDrawing, type InkContext } from "./render.ts";
import type { Drawing, Point } from "./types.ts";

/** The longest side of the snapshot, in pixels.
 *
 *  The default page is 3200×2000, and rasterising that at 1:1 for every bucket
 *  tap is 6.4 million pixels to flood and trace. Half that resolution costs an
 *  outline that can sit up to a pixel or two off the line it was aimed at —
 *  invisible under a bucket fill, which is already an approximate gesture — and
 *  buys a tap that lands in well under a frame. */
const MAX_SNAPSHOT_SIDE = 1800;

/** A page snapshot: the pixels, and the scale they were taken at. */
type Snapshot = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  scale: number;
};

/** Rasterise a drawing off-screen. `null` when the browser gives no 2D context
 *  or refuses to hand the pixels back — the tools then simply do nothing, which
 *  is the right failure for a press that can't be answered. */
function snapshot(drawing: Drawing, ink: InkContext): Snapshot | null {
  const scale = Math.min(
    1,
    MAX_SNAPSHOT_SIDE / Math.max(drawing.width, drawing.height),
  );
  const width = Math.max(1, Math.round(drawing.width * scale));
  const height = Math.max(1, Math.round(drawing.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  // The page is painted opaque (no `transparentPage`) and the grid is left off:
  // the tools must read the drawing, not the drawing aid — a bucket that
  // stopped at a grid line would be unusable.
  renderDrawing(ctx, drawing, null, ink);
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    return { pixels: data, width, height, scale };
  } catch {
    // A tainted canvas. Nothing this app draws can taint one, but a browser
    // running with images disabled or a privacy extension faking the read can
    // still throw here, and a dropper that does nothing beats one that crashes.
    return null;
  }
}

function toHex(r: number, g: number, b: number): string {
  const pair = (n: number) => n.toString(16).padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/** Build a probe over one drawing.
 *
 *  The snapshot is taken **lazily and once per probe**: a probe is made fresh
 *  for each press (the document may have changed since the last one), and a
 *  press that never reaches a colour tool costs nothing at all. Within a single
 *  press — a bucket drag re-aiming across three areas — the same pixels answer
 *  every question, which is both faster and more consistent than re-reading a
 *  page that is not changing while the pointer is down. */
export function createProbe(drawing: Drawing, ink: InkContext): CanvasProbe {
  let taken = false;
  let page: Snapshot | null = null;
  const pixels = (): Snapshot | null => {
    if (!taken) {
      taken = true;
      page = snapshot(drawing, ink);
    }
    return page;
  };

  const onPage = (p: Point): boolean =>
    p.x >= 0 && p.y >= 0 && p.x < drawing.width && p.y < drawing.height;

  return {
    colorAt(p) {
      if (!onPage(p)) return null;
      const shot = pixels();
      if (!shot) return null;
      const x = Math.min(shot.width - 1, Math.floor(p.x * shot.scale));
      const y = Math.min(shot.height - 1, Math.floor(p.y * shot.scale));
      const i = (y * shot.width + x) * 4;
      return toHex(shot.pixels[i]!, shot.pixels[i + 1]!, shot.pixels[i + 2]!);
    },
    regionAt(p) {
      if (!onPage(p)) return null;
      const shot = pixels();
      if (!shot) return null;
      return traceRegion(shot.pixels, shot.width, shot.height, p, {
        scale: shot.scale,
      });
    },
  };
}
