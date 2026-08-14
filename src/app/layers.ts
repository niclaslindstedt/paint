// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Layers: the stack a drawing is painted in.
//
// A layer is a *view* of the stroke list, not a container for it. The document
// stays what it always was — one ordered array of strokes — and a stroke names
// the layer it sits on (`Stroke.layer`), exactly as it names the tool that drew
// it. Everything here is the arithmetic over that: which layer a mark belongs
// to, what order the marks come out in, and what the panel counts.
//
// Keeping the strokes flat is what makes the feature cheap. Undo is still
// `pop()` on one array, the migration is *nothing* (a document with no `layers`
// reads as a single implicit layer), and the sync bytes of a one-layer sketch
// are unchanged down to the byte. A tree of per-layer stroke arrays would have
// bought a nicer type and cost all three.
//
// Two rules hold the whole thing up:
//
//   1. **A stroke that names no layer belongs to the base.** That is every mark
//      drawn before the drawing had a stack. The base keeps a fixed id, so
//      those marks follow it when the stack is reordered rather than sliding to
//      whatever happens to be at the bottom.
//   2. **A stroke naming a layer that isn't there belongs to the base too.**
//      Deleting a layer takes its marks with it, so this is only reachable from
//      a document another build wrote — and a mark on a lost layer must still
//      be a mark on the page, never an invisible one.
//
// Pure and DOM-free, so the panel, the renderer and the store all read the same
// answers and a node test can drive the lot.

import type { Drawing, Layer, Stroke } from "./types.ts";

/** The id the implicit first layer takes when a drawing first grows a stack.
 *
 *  Fixed rather than minted, and that is the point: the marks already on the
 *  page name no layer, so they are recognised by *this* id being the base.
 *  Mint it instead and reordering the stack would drag every one of them to
 *  whichever layer had fallen to the bottom. */
export const BASE_LAYER_ID = "base";

/** The id of the sheet everything is drawn *on*.
 *
 *  It is a layer like any other — it can hold marks, be hidden, be reordered,
 *  be unlocked and drawn on — with one thing no other layer does: **the page
 *  colour is painted as part of it**. Hide it and the sheet goes with it, which
 *  is what makes a transparent export a matter of leaving one layer out rather
 *  than a separate rule buried in the exporter (see `render.ts`).
 *
 *  Fixed, like the base id, and for the same reason: it has to be recognisable
 *  in a document written by another build. */
export const BACKGROUND_LAYER_ID = "background";

/** The stack a drawing has before anyone touches it: the sheet, locked, with
 *  one layer to draw on above it.
 *
 *  Two rather than one, because one was a lie the panel had to keep: every mark
 *  landed on a layer called "Background" that was not the background, and there
 *  was nowhere to put the page colour. Locking the sheet is the other half —
 *  the layer you never mean to draw on is the one directly under your pencil.
 *
 *  Implicit, not stamped: a drawing that carries no `layers` array *reads* as
 *  this stack, so nothing on disk had to be rewritten and a fresh document is
 *  still byte-for-byte what this app has always written. Materialising it is
 *  what the first hide / lock / add does. */
export function defaultLayers(): Layer[] {
  return [
    { id: BACKGROUND_LAYER_ID, name: "", locked: true },
    { id: BASE_LAYER_ID, name: "" },
  ];
}

/** The stack, bottom first — always at least one layer. A drawing that has
 *  never been given one of its own reads as `defaultLayers`, which is what lets
 *  every caller work in terms of layers without first asking whether this
 *  drawing has any. */
export function drawingLayers(drawing: Drawing): Layer[] {
  const layers = drawing.layers;
  return layers && layers.length > 0 ? layers : defaultLayers();
}

/** Whether a layer refuses marks (see `Layer.locked`). */
export function isLocked(layer: Layer): boolean {
  return layer.locked === true;
}

/** Whether the drawing's sheet is switched off — the background layer is in the
 *  stack and hidden. The renderer asks before it fills the page: hiding the
 *  sheet has to take the colour with it, or the layer would be the only one in
 *  the stack whose eye did nothing. */
export function backgroundHidden(drawing: Drawing): boolean {
  return drawingLayers(drawing).some(
    (layer) => layer.id === BACKGROUND_LAYER_ID && layer.hidden === true,
  );
}

/** Whether the drawing carries a stack of its own, as opposed to the implicit
 *  single layer above. The store asks before stamping a layer onto a new mark:
 *  a one-layer drawing keeps writing strokes with no `layer` field at all. */
export function hasLayers(drawing: Drawing): boolean {
  return (drawing.layers?.length ?? 0) > 0;
}

/** Where in the stack a stroke sits, as an index into `layers` (see the two
 *  rules at the top of the file). */
function indexOfStroke(
  stroke: Stroke,
  order: ReadonlyMap<string, number>,
  base: number,
): number {
  if (stroke.layer === undefined) return base;
  return order.get(stroke.layer) ?? base;
}

/** The stack as a lookup, plus the index the homeless marks fall to. */
function stackOrder(layers: readonly Layer[]) {
  const order = new Map<string, number>();
  layers.forEach((layer, index) => order.set(layer.id, index));
  return { order, base: order.get(BASE_LAYER_ID) ?? 0 };
}

/** The layer a stroke belongs to. */
export function strokeLayer(stroke: Stroke, drawing: Drawing): Layer {
  const layers = drawingLayers(drawing);
  const { order, base } = stackOrder(layers);
  return layers[indexOfStroke(stroke, order, base)]!;
}

/** How much of the stack a painter wants. */
export type PaintScope = {
  /** Leave the background layer out entirely — the sheet *and* anything drawn
   *  on it. What a transparent export asks for: the marks then land on nothing
   *  rather than on a page that happens to be the same colour. */
  withoutBackground?: boolean;
};

/** Every mark that should be painted, in the order it should be painted: layer
 *  by layer from the bottom of the stack up, and within a layer in the order it
 *  was drawn. Marks on a hidden layer are left out entirely, and so are the
 *  background layer's when `withoutBackground` is asked for.
 *
 *  This is the list the renderer folds over, so it is also what the exports,
 *  the bucket's snapshot and the crop-to-marks bounds see — one answer to "what
 *  is on this page", not four.
 *
 *  A drawing with one showing layer hands back **its own array**, unchanged and
 *  by reference. That matters more than it looks: the canvas's frame cache
 *  decides whether a frame can be blitted by comparing strokes one by one, so
 *  handing back a fresh copy of the same marks would be correct but would cost
 *  an allocation on every frame of every gesture for the common case. */
export function visibleStrokes(
  drawing: Drawing,
  scope: PaintScope = {},
): readonly Stroke[] {
  const drop = scope.withoutBackground === true;
  const layers = drawing.layers;
  if (!layers || layers.length === 0) return whole(drawing.strokes, drop);
  if (layers.length === 1) {
    if (layers[0]!.hidden) return [];
    if (drop && layers[0]!.id === BACKGROUND_LAYER_ID) return [];
    return whole(drawing.strokes, drop);
  }

  const buckets = bucketsOf(drawing, layers);
  const painted: Stroke[] = [];
  layers.forEach((layer, index) => {
    if (layer.hidden) return;
    if (drop && layer.id === BACKGROUND_LAYER_ID) return;
    painted.push(...buckets[index]!);
  });
  return painted;
}

/** A flat stroke list, with the background layer's marks dropped if they are
 *  not wanted. The array itself is handed back untouched whenever nothing has
 *  to come out of it — see the identity note on `visibleStrokes`. */
function whole(strokes: readonly Stroke[], drop: boolean): readonly Stroke[] {
  if (!drop) return strokes;
  const onSheet = (s: Stroke) => s.layer === BACKGROUND_LAYER_ID;
  return strokes.some(onSheet) ? strokes.filter((s) => !onSheet(s)) : strokes;
}

/** The drawing's marks split by layer, keyed by layer id and in the order they
 *  were drawn. What the panel paints each row's preview from — and what it
 *  counts for the delete prompt. Hidden layers are grouped like any other: the
 *  panel shows what is *on* a layer, not what is currently showing. */
export function groupByLayer(drawing: Drawing): Map<string, Stroke[]> {
  const layers = drawingLayers(drawing);
  const buckets = bucketsOf(drawing, layers);
  return new Map(layers.map((layer, index) => [layer.id, buckets[index]!]));
}

/** The marks of each layer, by stack position. The one pass both the paint
 *  order and the panel's grouping are built from. */
function bucketsOf(drawing: Drawing, layers: readonly Layer[]): Stroke[][] {
  const { order, base } = stackOrder(layers);
  const buckets: Stroke[][] = layers.map(() => []);
  for (const stroke of drawing.strokes) {
    buckets[indexOfStroke(stroke, order, base)]!.push(stroke);
  }
  return buckets;
}

/** A test for "is this mark on a locked layer?", built once against the
 *  drawing's stack.
 *
 *  A closure rather than a per-stroke lookup because the caller asks it of
 *  every visible mark on the page: a marquee dragged across a busy drawing
 *  would otherwise rebuild the stack's index once per stroke. A drawing with
 *  nothing locked answers `false` without looking at all.
 *
 *  It exists because a lock has to hold against more than the pencil. Marks on
 *  a locked layer are not selectable — the same rule the hidden layers get, and
 *  for the same reason: a lock that let a marquee pick up the sheet and drag it
 *  off the page would not be a lock. */
export function lockedMarks(drawing: Drawing): (stroke: Stroke) => boolean {
  const layers = drawingLayers(drawing);
  if (!layers.some(isLocked)) return () => false;
  const { order, base } = stackOrder(layers);
  return (stroke) => isLocked(layers[indexOfStroke(stroke, order, base)]!);
}

/** The drawing's marks with everything on `layerId` dropped — what deleting a
 *  layer leaves behind. Membership is resolved against the stack the drawing
 *  still has, so deleting the base takes the marks that never named a layer
 *  with it rather than stranding them on the next one up. */
export function strokesExcept(drawing: Drawing, layerId: string): Stroke[] {
  const layers = drawingLayers(drawing);
  const { order, base } = stackOrder(layers);
  return drawing.strokes.filter(
    (stroke) => layers[indexOfStroke(stroke, order, base)]!.id !== layerId,
  );
}

/** The layer new marks land on: the one the drawing points at, or the topmost
 *  one that will take a mark when it points at nothing (or at a layer that has
 *  since gone, or at a locked one).
 *
 *  Locked layers are skipped rather than selected-and-refused, so a fresh
 *  drawing — whose bottom layer is the locked sheet — lands its first pencil
 *  line on the layer above it without anyone having chosen anything. A stack
 *  that is locked all the way down has no answer and hands back the top: it is
 *  `drawableLayer` that reports there is nowhere to draw. */
export function activeLayer(drawing: Drawing): Layer {
  const layers = drawingLayers(drawing);
  const picked = layers.find((layer) => layer.id === drawing.activeLayerId);
  if (picked && !isLocked(picked)) return picked;
  const open = [...layers].reverse().find((layer) => !isLocked(layer));
  return open ?? picked ?? layers[layers.length - 1]!;
}

/** The layer a mark drawn now would land on, or `null` when every layer in the
 *  stack is locked and none would take it. */
export function drawableLayer(drawing: Drawing): Layer | null {
  const layer = activeLayer(drawing);
  return isLocked(layer) ? null : layer;
}

/** Whether `layerId` can be deleted from the drawing's stack.
 *
 *  Three things stop it, and they are the same three however you got here — the
 *  panel dims the bin with this, and the store refuses with it, so a keyboard,
 *  a stale render and a future caller all get the same answer:
 *
 *    - the last layer stays (a drawing always has somewhere to draw);
 *    - a locked layer stays (that is most of what a lock is);
 *    - and the last *unlocked* layer stays, or deleting it would leave a stack
 *      that takes no marks at all — a page you can't draw on, reachable in one
 *      press and only escapable by adding a layer or unlocking one. */
export function canDeleteLayer(drawing: Drawing, layerId: string): boolean {
  const layers = drawingLayers(drawing);
  if (layers.length < 2) return false;
  const doomed = layers.find((layer) => layer.id === layerId);
  if (!doomed || isLocked(doomed)) return false;
  return layers.some((layer) => layer.id !== layerId && !isLocked(layer));
}

/** The id to stamp on a mark drawn now, or `undefined` on a drawing that has no
 *  stack of its own — a single-layer document keeps writing strokes with no
 *  layer field, so it stays exactly the document it was. */
export function activeLayerId(drawing: Drawing): string | undefined {
  return hasLayers(drawing) ? activeLayer(drawing).id : undefined;
}

/** Move the layer at `from` to `to`, keeping everything else in order. Out-of
 *  range indices hand the stack back untouched, so the panel's up / down
 *  buttons need no bounds arithmetic of their own. */
export function reorderLayers(
  layers: readonly Layer[],
  from: number,
  to: number,
): Layer[] {
  if (from === to) return [...layers];
  if (from < 0 || from >= layers.length) return [...layers];
  if (to < 0 || to >= layers.length) return [...layers];
  const next = [...layers];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** The number a freshly added layer should wear: one past the highest already
 *  in use, so a stack that has had layers deleted from it doesn't hand out a
 *  name it is still showing. `name` renders the number the way the catalog
 *  does, which is the only thing this needs to know about language.
 *
 *  The sheet is not counted. It is a layer, but it is not *Layer n* — the
 *  drawing's first numbered layer sits on top of it, so counting it would open
 *  every new drawing on "Layer 1" and offer "Layer 3" next. */
export function nextLayerName(
  layers: readonly Layer[],
  name: (n: number) => string,
): string {
  const taken = new Set(layers.map((layer) => layer.name));
  let n = layers.filter((layer) => layer.id !== BACKGROUND_LAYER_ID).length + 1;
  while (taken.has(name(n))) n++;
  return name(n);
}
