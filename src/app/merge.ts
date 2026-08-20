// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Putting layers back together: merging a few of them into one, and flattening
// the whole stack down to the single layer a drawing has when the panel that
// shows stacks has been switched off.
//
// It is the counterpart of `layers.ts`'s arithmetic rather than more of it,
// which is why it is a file of its own: everything there answers "which layer
// is this mark on?", and everything here answers "what does the document look
// like once these layers are one layer?". Both are pure and DOM-free, so a
// whole merge can be driven in a node test without a canvas.
//
// Two rules hold this module up, and they are the two that make a merge
// something you can press without reading the manual:
//
//   1. **A merge never loses a mark.** The marks on every layer being merged —
//      hidden ones included — come out on the layer they were merged into, in
//      the order they were painted. That is the opposite of the usual "flatten
//      discards hidden layers", and deliberately so: a hidden layer is one you
//      switched off for a minute, and a button that quietly threw that work
//      away would be a button nobody could afford to press. What you see change
//      is on screen the instant you press it, and undo is one step.
//   2. **A lock is a lock.** A locked layer is neither merged away nor merged
//      into — the same rule that stops it being deleted or restacked. Unlock it
//      first; the padlock is on its row.
//
// The sheet at the bottom (`BACKGROUND_LAYER_ID`) is the one layer with a rule
// of its own. It may be merged *into* — that is what flattening a drawing onto
// its page means — but never merged *away*, because deleting it would take the
// page's colour with it. And it can only be a destination while it is showing:
// merging a drawing onto a sheet that is switched off would put every mark on
// the one layer nothing paints.

import {
  BACKGROUND_LAYER_ID,
  BASE_LAYER_ID,
  backgroundHidden,
  drawingLayers,
  groupByLayer,
  isLocked,
  transparentLayers,
} from "./layers.ts";
import type { Drawing, Layer, Stroke } from "./types.ts";

/** What a merge leaves behind — the patch the store applies to the drawing.
 *  Every field is one the drawing already has, so applying it is one
 *  `patchActive` and therefore one undo step. */
export type MergeResult = {
  layers: Layer[];
  strokes: Stroke[];
  activeLayerId: string;
};

/** Whether `id` may be merged away — dropped from the stack, its marks handed
 *  to another layer. */
export function canMergeFrom(drawing: Drawing, id: string): boolean {
  const layer = drawingLayers(drawing).find((l) => l.id === id);
  if (!layer) return false;
  // The sheet stays: it carries the page colour, and a drawing with no page is
  // not a thing this panel can offer to make.
  if (layer.id === BACKGROUND_LAYER_ID) return false;
  return !isLocked(layer);
}

/** Whether `id` may be merged *into* — kept, holding everything else's marks. */
export function canMergeInto(drawing: Drawing, id: string): boolean {
  const layer = drawingLayers(drawing).find((l) => l.id === id);
  if (!layer) return false;
  if (isLocked(layer)) return false;
  // A sheet that is switched off is the page being transparent (see
  // `layers.ts`). Merging onto it would move the whole drawing onto the one
  // layer that isn't painted, so it is offered only while it is showing.
  if (layer.id === BACKGROUND_LAYER_ID && layer.hidden === true) return false;
  return true;
}

/** Whether there is a merge to make at all: two layers that could be one. */
export function canMergeAnything(drawing: Drawing): boolean {
  const layers = drawingLayers(drawing);
  const from = layers.filter((l) => canMergeFrom(drawing, l.id));
  if (from.length === 0) return false;
  const into = layers.filter((l) => canMergeInto(drawing, l.id));
  // Two distinct layers, one of which is being merged away: the destination
  // may be the sheet, which is never in `from`.
  return into.some((l) => from.some((other) => other.id !== l.id));
}

/** Whether this set of layers can be merged into `target`.
 *
 *  `sources` is every layer taking part, the destination included — that is
 *  what the dialog's ticks mean, and it keeps "merge A and B into B" from
 *  needing two different ways to say the same thing. */
export function canMergeLayers(
  drawing: Drawing,
  sources: readonly string[],
  target: string,
): boolean {
  const picked = new Set(sources);
  if (picked.size < 2) return false;
  if (!picked.has(target)) return false;
  if (!canMergeInto(drawing, target)) return false;
  const layers = drawingLayers(drawing);
  for (const id of picked) {
    if (!layers.some((layer) => layer.id === id)) return false;
    if (id !== target && !canMergeFrom(drawing, id)) return false;
  }
  return true;
}

/** The document with `sources` merged into `target`, or `null` when that is not
 *  a merge this drawing allows (see {@link canMergeLayers}).
 *
 *  The stroke list is rebuilt bottom-up rather than filtered in place. It has
 *  to be: paint order is layer by layer and then in drawing order, so marks
 *  that used to be two layers apart have to be interleaved into one bucket in
 *  the order they were *painted*, which their positions in the flat array do
 *  not say on their own. Everything not being merged keeps the layer it names,
 *  so a document that never stamped its base layer still doesn't. */
export function mergedStack(
  drawing: Drawing,
  sources: readonly string[],
  target: string,
): MergeResult | null {
  if (!canMergeLayers(drawing, sources, target)) return null;
  const picked = new Set(sources);
  const layers = drawingLayers(drawing);
  const marks = groupByLayer(drawing);

  const strokes: Stroke[] = [];
  for (const layer of layers) {
    for (const stroke of marks.get(layer.id) ?? []) {
      strokes.push(
        picked.has(layer.id) && layer.id !== target
          ? { ...stroke, layer: target }
          : stroke,
      );
    }
  }

  const next = layers
    .filter((layer) => layer.id === target || !picked.has(layer.id))
    // The destination comes out showing whatever it was before: it now holds
    // marks from layers you could see, and a merge that hid them would be a
    // merge that looked like a delete.
    .map((layer) => (layer.id === target ? showing(layer) : layer));

  return { layers: next, strokes, activeLayerId: target };
}

/** The whole drawing on one layer — what switching the layers panel off leaves
 *  behind, and the only merge that ignores a lock.
 *
 *  It has to ignore locks, because the panel with the padlock in it is the one
 *  being switched off: a stack half of which could not be merged would leave
 *  the user holding layers with nothing left to manage them with. The dialog
 *  that asks for this says as much before it happens, and undo is one step.
 *
 *  Two shapes come out of it, and which one depends on the page rather than on
 *  the stack:
 *
 *    - **A page with a sheet** collapses to the sheet alone, unlocked, holding
 *      every mark. One layer, and the one you now draw on.
 *    - **A page with no sheet** — a transparent page, which is the background
 *      layer switched off (see `layers.ts`) — keeps that switched-off sheet and
 *      collapses everything above it onto the base layer. Merging onto a hidden
 *      background would have taken the whole drawing off the screen, and a page
 *      being transparent is what the page *is* rather than something a mode
 *      change gets to decide.
 *
 *  `null` when the drawing is already in one of those two shapes, so a
 *  sketchbook full of one-layer drawings isn't rewritten to say what it already
 *  said. */
export function flattenedStack(drawing: Drawing): MergeResult | null {
  if (isFlattened(drawing)) return null;
  const transparent = backgroundHidden(drawing);
  const target = transparent ? BASE_LAYER_ID : BACKGROUND_LAYER_ID;
  const layers = drawingLayers(drawing);
  const marks = groupByLayer(drawing);

  const strokes: Stroke[] = [];
  for (const layer of layers) {
    for (const stroke of marks.get(layer.id) ?? []) {
      strokes.push(
        stroke.layer === target ? stroke : { ...stroke, layer: target },
      );
    }
  }

  const next = transparent
    ? transparentLayers()
    : [{ id: BACKGROUND_LAYER_ID, name: "" }];

  return { layers: next, strokes, activeLayerId: target };
}

/** Whether the drawing is already down to the single layer {@link
 *  flattenedStack} would leave — the one thing the panel-off state needs to be
 *  able to ask before it edits anything. */
export function isFlattened(drawing: Drawing): boolean {
  const layers = drawing.layers;
  if (!layers) return false; // The implicit stack is the sheet plus one layer.
  if (backgroundHidden(drawing)) {
    return (
      layers.length === 2 &&
      layers[0]!.id === BACKGROUND_LAYER_ID &&
      layers[1]!.id === BASE_LAYER_ID &&
      !isLocked(layers[1]!) &&
      layers[1]!.hidden !== true
    );
  }
  return (
    layers.length === 1 &&
    layers[0]!.id === BACKGROUND_LAYER_ID &&
    !isLocked(layers[0]!)
  );
}

/** A layer with its eye back on — and without the `hidden` key at all when it
 *  was never set, so a merge doesn't add bytes to a document that said nothing.
 */
function showing(layer: Layer): Layer {
  if (layer.hidden !== true) return layer;
  const next = { ...layer };
  delete next.hidden;
  return next;
}
