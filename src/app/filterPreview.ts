// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page as it *would* look, while the sliders are still being moved.
//
// A filter's dialog lands nothing on the drawing until Apply — that is what
// makes it free to open one, drag the radius from end to end and think better
// of it. But a number in page pixels is not something anyone can picture, and a
// dialog that asks you to guess and then look is a dialog you open twice.
//
// So the screen paints the *draft* instead: this hands back a drawing that
// carries the filter being set up, the canvas paints that, and the document is
// never told. Three things make it cheap enough to do on every pointer sample
// of a slider drag:
//
//   - **The marks are the same objects.** A shallow copy of the drawing with
//     one field replaced, so the frame cache's stroke-by-stroke comparison still
//     passes and a page filter costs one composite over a blit (see `cache.ts`
//     and `filterPaint.ts`) rather than a repaint of the document.
//   - **It is the store's own edit, without the store.** `withFilter` is what
//     `setFilter` and `setLayerFilter` apply, so the preview and what Apply
//     lands cannot disagree — one of each kind, in the declared order.
//   - **Nothing else sees it.** The preview goes to the canvas and stops there:
//     no undo step, no push to the cloud, no row in the panel changing its
//     readout before the change is real.

import { withFilter, type FilterTarget } from "./filters.ts";
import { drawingLayers } from "./layers.ts";
import type { Drawing, Filter } from "./types.ts";

/** `drawing` seen through `draft`, set where `target` says.
 *
 *  A view of the document for one paint, never a document to keep: hand it to
 *  the canvas, not to the store.
 *
 *  A target naming a layer the stack doesn't have — a row deleted out from
 *  under an open dialog — previews nothing rather than growing a layer back. */
export function previewFilter(
  drawing: Drawing,
  target: FilterTarget,
  draft: Filter,
): Drawing {
  if (target.layerId === undefined) {
    return { ...drawing, filters: withFilter(drawing.filters, draft) };
  }
  // The implicit stack is materialised here exactly as the store materialises
  // it when a layer is first asked to carry something — a drawing that has
  // never had layers of its own still has the two everyone paints.
  const layers = drawingLayers(drawing);
  if (!layers.some((layer) => layer.id === target.layerId)) return drawing;
  return {
    ...drawing,
    layers: layers.map((layer) =>
      layer.id === target.layerId
        ? { ...layer, filters: withFilter(layer.filters, draft) }
        : layer,
    ),
  };
}
