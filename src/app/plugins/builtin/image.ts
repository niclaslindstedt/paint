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
  paint: (ctx2d, stroke) => {
    const shape = stroke.shape;
    if (shape.kind !== "image") return;
    const img = cachedImage(shape.src);
    if (!img) return;
    const box = normalizeBox(shape.from, shape.to);
    if (box.width <= 0 || box.height <= 0) return;
    ctx2d.globalAlpha = stroke.opacity ?? 1;
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
