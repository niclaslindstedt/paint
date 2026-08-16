// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Baking an effect into the drawing — where an effect stops being a preview and
// becomes what is on the page.
//
// One layer at a time: its marks are painted onto an off-screen surface at
// document size, the effect is composited over them (`effectPaint.ts`), and the
// result replaces those marks with a **single image stroke** sitting exactly
// where they were. From then on the layer is a bitmap. Draw on it and the new
// mark is sharp; rub something out and the rubber takes pixels off a picture
// rather than forcing a canvas-sized layer to be softened again on every frame
// of the gesture, which is the whole reason this module exists.
//
// Three things about that are deliberate, and all three are trades:
//
//   - **The strokes are gone.** Undo puts them back — a bake is one step like
//     any other edit — but a reload does not. That is what "an effect, not a
//     filter" means: you are changing the picture, and the panel says so before
//     you press it.
//   - **It is cropped to the ink.** The bitmap covers the marks that went into
//     it, grown by how far the effect can move ink (`effectReach`) and clipped
//     to the page. Baking the whole sheet would put megabytes of transparent
//     pixels in a document that has to be serialized on every edit; baking the ink alone
//     costs what the drawing actually has on it.
//   - **It has a resolution ceiling.** A bake past `MAX_BAKE_PIXELS` is
//     rasterised smaller and painted back at full size. A page is up to 8192
//     across and a PNG of grain does not compress, so the alternative is a
//     document that cannot be saved — see `MAX_BAKE_PIXELS`.
//
// Everything here is a pure function of the drawing plus a canvas. It mints no
// ids of its own (the caller passes the store's `freshId`, so a baked stroke is
// indistinguishable from any other) and it never touches the store.

import {
  clipToPage,
  padBox,
  strokeBounds,
  unionBox,
  type Box,
} from "./bounds.ts";
import { effectReach, type Effect } from "./effects.ts";
import { paintEffect } from "./effectPaint.ts";
import { drawingLayers, groupByLayer, hasLayers, isLocked } from "./layers.ts";
import { IMAGE_TOOL_ID } from "./plugins/builtin/image.ts";
import { paintStrokes, relayFixed, type InkContext } from "./render.ts";
import { createSurface } from "./surface.ts";
import type { Drawing, Stroke } from "./types.ts";

/** The most pixels one baked bitmap may be rasterised at.
 *
 *  Four megapixels is a little over a 4K frame — more than any screen shows of
 *  one layer, and the point past which the PNG stops fitting anywhere sensible.
 *  Grain is the case that decides it: noise is incompressible by construction,
 *  so a full-page speckled layer encodes at roughly a byte a pixel and a
 *  document is re-serialized on every edit. Past this the bake is rasterised smaller and
 *  the image stroke is painted back at the size it was cropped to, so the
 *  drawing is unchanged in *geometry* and only softer in detail. */
export const MAX_BAKE_PIXELS = 4_000_000;

/** Which layers an effect at this scope would land on.
 *
 *  A locked layer is left out, at both scopes. A lock means "this sheet takes no
 *  edits" — it is what stops a stray pencil line landing on the background of a
 *  fresh drawing — and rasterising every mark on it is a bigger edit than a
 *  pencil line. Unlock it and it is in.
 *
 *  Hidden layers are left out too: an effect you cannot see land is one you
 *  cannot judge, and "all layers" meaning "including the three I switched off"
 *  is a surprise with no undo prompt in front of it.
 *
 *  The background sheet is a layer like any other here — if it is unlocked,
 *  showing, and carries marks, those marks bake. The page *colour* is not a
 *  mark and is never touched. */
export function effectTargets(
  drawing: Drawing,
  scope: "layer" | "drawing",
  layerId: string,
): string[] {
  const marks = groupByLayer(drawing);
  const bakeable = (id: string) => (marks.get(id)?.length ?? 0) > 0;
  if (scope === "layer") return bakeable(layerId) ? [layerId] : [];
  return drawingLayers(drawing)
    .filter((layer) => !isLocked(layer) && !layer.hidden && bakeable(layer.id))
    .map((layer) => layer.id);
}

/** The drawing's stroke list with `effect` baked into every layer in
 *  `layerIds`, or `null` when nothing could be baked — no marks on any of them,
 *  or no DOM to rasterise in (a node test, a browser that refused a context).
 *
 *  `null` is a real answer rather than a failure: the caller lands no edit, so a
 *  bake that could not happen leaves the drawing exactly as it was rather than
 *  quietly deleting the marks it was going to replace. */
export function bakeEffect(
  drawing: Drawing,
  effect: Effect,
  layerIds: readonly string[],
  ink: InkContext,
  mintId: () => string,
): Stroke[] | null {
  const marks = groupByLayer(drawing);
  const layered = hasLayers(drawing);
  let strokes: Stroke[] = [...drawing.strokes];
  let baked = false;
  for (const layerId of layerIds) {
    const own = marks.get(layerId);
    if (!own || own.length === 0) continue;
    const src = rasterise(drawing, own, effect, ink);
    if (!src) continue;
    const stroke: Stroke = {
      id: mintId(),
      tool: IMAGE_TOOL_ID,
      // An image carries no nib, but every stroke has a width; 1 keeps its
      // bounding box exact (see `strokeBounds`).
      size: 1,
      shape: {
        kind: "image",
        from: { x: src.box.x, y: src.box.y },
        to: { x: src.box.x + src.box.width, y: src.box.y + src.box.height },
        src: src.url,
      },
      // A drawing that has never grown a stack keeps writing strokes with no
      // layer field at all, exactly as the store does when it lands a mark.
      ...(layered ? { layer: layerId } : {}),
    };
    // The bitmap takes the place of the *first* mark it replaces, so a layer
    // that was painted between two others stays between them. Within a layer
    // the order no longer matters — there is one mark left.
    const doomed = new Set(own.map((s) => s.id));
    const at = strokes.findIndex((s) => doomed.has(s.id));
    strokes = strokes.filter((s) => !doomed.has(s.id));
    strokes.splice(at < 0 ? strokes.length : at, 0, stroke);
    baked = true;
  }
  return baked ? strokes : null;
}

/** The area a bake covers: the marks, grown by how far the effect can move ink,
 *  and clipped to the page. `null` for marks that carry no geometry at all, or
 *  for a layer drawn entirely off the sheet.
 *
 *  Clipping to the page is what stops a mark dragged half a mile off the corner
 *  from minting a bitmap to match. Nothing outside the sheet is painted anyway
 *  (`render.ts` clips there too), so nothing visible is lost — but a mark that
 *  was hanging off the edge no longer *exists* off the edge once it is baked,
 *  and growing the page afterwards will not bring it back. */
export function bakeBox(
  drawing: Drawing,
  strokes: readonly Stroke[],
  effect: Effect,
): Box | null {
  let box: Box | null = null;
  for (const stroke of strokes) {
    const bounds = strokeBounds(stroke);
    if (!bounds) continue;
    box = box ? unionBox(box, bounds) : bounds;
  }
  if (!box) return null;
  const grown = clipToPage(padBox(box, effectReach(effect)), drawing);
  return grown.width > 0 && grown.height > 0 ? grown : null;
}

/** How many pixels per document pixel a box of this size may be baked at — 1
 *  unless the box is bigger than the ceiling allows. */
export function bakeScale(box: Box): number {
  const pixels = box.width * box.height;
  if (!(pixels > MAX_BAKE_PIXELS)) return 1;
  return Math.sqrt(MAX_BAKE_PIXELS / pixels);
}

/** One layer's marks, with the effect over them, as a PNG data URL and the box
 *  it belongs in. */
function rasterise(
  drawing: Drawing,
  strokes: readonly Stroke[],
  effect: Effect,
  ink: InkContext,
): { url: string; box: Box } | null {
  const box = bakeBox(drawing, strokes, effect);
  if (!box) return null;
  const scale = bakeScale(box);
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const surface = createSurface(width, height);
  if (!surface) return null;
  const ctx = surface.ctx;
  // Document coordinates with the box's corner at the origin, so the marks land
  // in the places they land on the page and the effect's distances mean what
  // they mean everywhere else.
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  const options = {
    pageColor: ink.pageColor,
    defaultInk: ink.defaultInk,
    ground: drawing.ground,
    scale,
  };
  paintStrokes(ctx, strokes, options);
  // A rubbing out that only lifts what a rubber can lift took everything for
  // the length of one composite; this puts the rest back (see `render.ts`).
  relayFixed(ctx, strokes, options);
  paintEffect(ctx, effect, {
    page: {
      x: -box.x * scale,
      y: -box.y * scale,
      width: drawing.width * scale,
      height: drawing.height * scale,
    },
    scale,
    pageColor: ink.pageColor,
    // There is no sheet under a layer — that is the background layer's job and
    // it is somewhere else in the stack — so a blur fades into nothing at the
    // edges, which is what a softened cut-out should do.
    transparent: true,
  });
  try {
    return { url: surface.canvas.toDataURL("image/png"), box };
  } catch {
    // A canvas that won't hand its pixels back (a tainted one, which this can't
    // be, or a browser out of memory). Nothing is baked and nothing is lost.
    return null;
  }
}
