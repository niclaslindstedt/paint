// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dropped image — a plugin with no button.
//
// Every mark on the page names the plugin that paints it, so a bitmap dropped
// onto the canvas needs one too. It has no gesture: `start` returns null, and
// the descriptor is `hidden`, so it never reaches the toolbar or Settings →
// Tools. Placing an image is a drop plus the placement overlay
// (`ImagePlacement.tsx`); this is only the painter at the other end of it.
//
// Decoding is asynchronous and painting is not, so the painter asks the image
// cache for a decoded bitmap and paints nothing when it isn't ready yet — the
// canvas repaints as soon as it lands (see `images.ts`).

import type { Box } from "../../bounds.ts";
import { cachedImage } from "../../images.ts";
import { normalizeBox } from "../ink.ts";
import type { DraftStroke, ToolBehaviour } from "../types.ts";

export const imageBehaviour: ToolBehaviour = {
  // No gesture draws an image: it arrives as a file.
  start: () => null,
  move: (draft) => draft,
  paint: (ctx2d, stroke, detail) => {
    const shape = stroke.shape;
    if (shape.kind !== "image") return;
    // No bytes yet: a stroke loaded from a backend whose image file couldn't be
    // read holds only the reference (see `imageStore.ts`). Paint nothing.
    if (!shape.src) return;
    const img = cachedImage(shape.src);
    if (!img) return;
    const box = normalizeBox(shape.from, shape.to);
    if (box.width <= 0 || box.height <= 0) return;
    ctx2d.globalAlpha = stroke.opacity ?? 1;
    // A picture scaled up as pixel art keeps its pixels square. Set at paint
    // time rather than baked into the bytes, so it holds at every zoom (see
    // `transform.ts`).
    //
    // …and so does *any* picture, once the view is in among the document's own
    // pixels (see `pixelGrid.ts`). Interpolated at that zoom a bitmap is a soft
    // gradient with no pixel edges in it at all, which makes the grid ruled
    // over it look like it is lying about where the boundaries are — it isn't;
    // there was simply nothing on screen to line up with. The two cases differ
    // in where they are decided and in what they mean: `smoothing` is a fact
    // about the picture and travels with the mark into an export, this is a
    // fact about the view and never leaves the screen.
    if (shape.smoothing === "nearest" || detail?.pixels) {
      ctx2d.imageSmoothingEnabled = false;
    }
    ctx2d.drawImage(img, box.x, box.y, box.width, box.height);
  },
};

/** The plugin id every image stroke is tagged with. Persisted on the stroke, so
 *  it is fixed for good. */
export const IMAGE_TOOL_ID = "image";

/** The mark a placed picture becomes. Both drops build it here — the canvas
 *  settling a placement and the sidebar starting a drawing from a file — so the
 *  one place that knows what an image stroke looks like is the plugin that
 *  paints it. */
export function imageStroke(src: string, box: Box): DraftStroke {
  return {
    tool: IMAGE_TOOL_ID,
    // An image carries no nib, but every stroke has a width; 1 keeps its
    // bounding box exact (see `strokeBounds`).
    size: 1,
    shape: {
      kind: "image",
      from: { x: box.x, y: box.y },
      to: { x: box.x + box.width, y: box.y + box.height },
      src,
    },
  };
}
