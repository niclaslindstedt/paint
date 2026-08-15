// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The renderer: paint a drawing onto a 2D context, in document coordinates.
//
// It is deliberately dumb — clear the page, then hand each stroke to the tool
// plugin that drew it. That indirection is what keeps the core free of tool
// knowledge: a stroke names its tool, the registry resolves the painter.
//
// The same function paints the on-screen canvas, the in-flight gesture, and the
// off-screen canvas the PNG export rasterises, so what you export is exactly
// what you saw.
//
// **The sheet goes on last, underneath.** The marks are painted onto nothing
// and the page colour is laid *under* them at the end (`destination-over`),
// which is pixel-for-pixel the same picture as painting the page first — and it
// is what lets a tool rub something out. An erasing mark (`PaintPlugin.erases`)
// paints with `destination-out`: it removes what it covers instead of covering
// it. Painted over an opaque page that would punch a hole clean through the
// sheet to the desk; painted before the sheet arrives it takes off ink and
// nothing else, and the page comes back up through the hole.
//
// So an eraser lifts ink down to the sheet, whatever layer it was drawn on —
// the same thing a rubber does to a drawing on paper, and the same thing this
// tool always *looked* like it did. What is new is that the hole is a real one:
// a transparent export has nothing in it, where it used to have page-coloured
// smears.
//
// **The sheet is also a material.** A drawing carries a ground — solid, paper,
// canvas (see `ground.ts`) — and it changes how the marks land as well as how
// the page looks: its grain is painted under them, a wet mark on a sheet that
// soaks mixes with what is under it instead of covering it, and it drags a
// little of what it crossed into its own wet edge. All of that is read off the
// drawing's ground and the tool's declared wetness, so no part of the renderer
// knows what watercolour is called.

import { filterReach, svgFilter } from "./filters.ts";
import { paintFilters } from "./filterPaint.ts";
import { strokeBounds, strokeVisible, type Rect } from "./geometry.ts";
import {
  groundProfile,
  groundStains,
  inkBlend,
  stains,
  SOLID_GROUND,
  type GroundProfile,
} from "./ground.ts";
import { paintGroundTexture } from "./groundPaint.ts";
import {
  anyLayerFiltered,
  backgroundHidden,
  drawingLayers,
  layerFilters,
  paintedLayers,
  visibleStrokes,
  type PaintScope,
} from "./layers.ts";
import { paintRegion } from "./plugins/brushes.ts";
import { pluginById } from "./plugins/registry.ts";
import { applyInk, paintPath, paintRect, paintSegment } from "./plugins/ink.ts";
import { FULL_DETAIL, type PaintDetail } from "./plugins/types.ts";
import { createSurface, type Surface } from "./surface.ts";
import type { Drawing, Filter, Ground, Stroke } from "./types.ts";
import { liftUnder } from "./wet.ts";

/** The colours a repaint resolves absent stroke ink against. */
export type InkContext = {
  /** The page the drawing is painted on. */
  pageColor: string;
  /** The default ink for that page (see `canvas.ts`). */
  defaultInk: string;
};

/** Give a stroke a concrete colour.
 *
 *  A stroke records a colour only when the user picked one; everything else
 *  resolves here, at paint time, against the page's default ink. That
 *  indirection is what makes the canvas theme a *view* of a drawing rather than
 *  an edit to it — flipping a sketch from a dark page to a light one re-inks it
 *  instead of leaving it invisible, and nothing in the document changes.
 *
 *  An erasing mark is resolved like any other and the colour is then thrown
 *  away by the compositing: `destination-out` reads a source's alpha and
 *  nothing else. */
export function resolveStrokeInk(stroke: Stroke, ink: InkContext): Stroke {
  if (stroke.color) return stroke;
  return { ...stroke, color: ink.defaultInk };
}

/** Whether this mark takes ink off the page rather than putting it on — read
 *  off the descriptor of the plugin that drew it (`PaintPlugin.erases`).
 *
 *  Asked outside this module by the two places that paint marks onto pixels
 *  they didn't lay the sheet under: the canvas's frame, and the mark cache. A
 *  mark that erases leaves a hole, and both have to put the page back under it
 *  (see `underlay`). */
export function strokeErases(stroke: Stroke): boolean {
  return pluginById(stroke.tool)?.erases === true;
}

/** Whether any of these marks erases. */
export function anyErases(strokes: readonly Stroke[]): boolean {
  return strokes.some(strokeErases);
}

/** Whether this mark is a rubbing out that only takes off what a rubber could
 *  actually have lifted — read off `PaintPlugin.lifts`.
 *
 *  It is painted exactly like any other erasing mark, because there is no other
 *  way to take pixels off a canvas: what makes it selective happens afterwards,
 *  in `relayFixed`. */
export function strokeLifts(stroke: Stroke): boolean {
  const plugin = pluginById(stroke.tool);
  return plugin?.erases === true && plugin.lifts === true;
}

/** Whether any of these marks is a lifting one. */
export function anyLifts(strokes: readonly Stroke[]): boolean {
  return strokes.some(strokeLifts);
}

/** Whether a rubbing out has to put this mark back — every mark except the two
 *  a rubber has a genuine claim on: ink it could have lifted (`liftable`), and
 *  a lifting mark itself, which is a hole rather than something on the page.
 *
 *  A mark whose tool this build doesn't ship counts as one to put back. The flag
 *  lived on the descriptor and the descriptor is gone, so the honest reading is
 *  the same one `strokeErases` makes: a mark that is on the page, and nothing
 *  saying a rubber takes it off. */
function relaid(stroke: Stroke): boolean {
  const plugin = pluginById(stroke.tool);
  if (!plugin) return true;
  return plugin.liftable !== true && !(plugin.erases === true && plugin.lifts);
}

/** How wet the tool that drew this mark is (`PaintPlugin.wetness`) — 0 for a
 *  pencil, 1 for a loaded watercolour brush, and 0 for a mark whose tool this
 *  build doesn't ship. Read off the plugin rather than off the stroke for the
 *  same reason `erases` is: it is a property of the *implement*, and a document
 *  written before wetness existed has to answer it too. */
export function strokeWetness(stroke: Stroke): number {
  return pluginById(stroke.tool)?.wetness ?? 0;
}

/** Whether this mark soaks into `ground` — mixing with what is under it instead
 *  of covering it, and dragging some of it along (see `ground.ts`). */
export function strokeStains(stroke: Stroke, ground: GroundProfile): boolean {
  return stains(strokeWetness(stroke), ground);
}

/** Whether any of these marks soaks in. Asked by the mark cache before it takes
 *  its shortcut, and by the renderer before it lifts a layer onto a surface. */
export function anyStains(
  strokes: readonly Stroke[],
  ground: GroundProfile,
): boolean {
  if (!groundStains(ground)) return false;
  return strokes.some((stroke) => strokeStains(stroke, ground));
}

/** Paint one stroke through its tool's painter.
 *
 *  A stroke whose tool this build doesn't ship — a document written by a newer
 *  version, or one that used a plugin since removed — still renders: we fall
 *  back to a generic painter keyed off the shape kind. Losing the tool must
 *  never mean losing the drawing. (A mark from a lost *erasing* tool therefore
 *  comes back as a plain one. There is no honest alternative — the flag lived
 *  on the plugin, not on the stroke — and a visible mark beats a silent one.)
 *
 *  **What the sheet does to the mark happens here**, and it is two things (see
 *  `ground.ts`). A wet mark on a sheet that soaks *mixes* with what is under it
 *  rather than covering it — `multiply` on a light page, `screen` on a dark one
 *  — and it *lifts* a little of whatever it crossed into its own wet edge before
 *  it lands (`wet.ts`). Both are read off the tool's declared wetness and the
 *  drawing's ground; neither knows a tool by name, and on the plain solid sheet
 *  neither happens at all. */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  ink: InkContext,
  detail: PaintDetail = FULL_DETAIL,
): void {
  const resolved = resolveStrokeInk(stroke, ink);
  const plugin = pluginById(resolved.tool);
  // Laying the mark down, as a function, because a wet one is painted twice:
  // once onto a scratch surface to cut its bleed to its own shape, and once for
  // real. Both have to be the *same* mark, or the bleed would follow an outline
  // the mark does not have.
  const lay = (target: CanvasRenderingContext2D) => {
    if (plugin) plugin.behaviour.paint(target, resolved, detail);
    else paintGeneric(target, resolved);
  };

  // An erasing tool is dry by definition: it takes ink off, and a hole cannot
  // soak into anything.
  const blend = inkBlend(
    plugin?.erases ? 0 : (plugin?.wetness ?? 0),
    detail.ground ?? SOLID_GROUND,
    ink.pageColor,
  );
  // The water goes down before the pigment does, so what it lifts is what was
  // on the page *before* this mark — which is exactly why laying red over blue
  // is not the same picture as laying blue over red.
  if (blend.lift > 0) liftUnder(ctx, resolved, blend.lift, lay);

  ctx.save();
  // A rubbing out is the same painter laying the same mark, composited the
  // other way round: `destination-out` subtracts the mark's alpha from what is
  // already there. Set here rather than inside the painter so a tool only has
  // to *declare* that it erases — and so every painter, textured ones included,
  // rubs out exactly the shape it would have drawn.
  if (plugin?.erases) ctx.globalCompositeOperation = "destination-out";
  else if (blend.mode !== "source-over") {
    ctx.globalCompositeOperation = blend.mode;
  }
  lay(ctx);
  ctx.restore();
}

/** How many device pixels one document pixel is about to become, read off the
 *  context's own transform.
 *
 *  Asking the context rather than being told means every caller gets it right
 *  for free: the screen at whatever zoom, the PNG export at 1:1, the bucket's
 *  half-resolution snapshot. The scale is the length of the transformed unit
 *  vector, so a flip or a rotation (neither of which this app does today, but
 *  the maths is no longer for it) reads the same as the zoom it is worth. */
export function renderScale(ctx: CanvasRenderingContext2D): number {
  const read = (
    ctx as CanvasRenderingContext2D & {
      getTransform?: () => { a: number; b: number };
    }
  ).getTransform;
  if (typeof read !== "function") return 1;
  const m = read.call(ctx);
  const scale = Math.hypot(m.a, m.b);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** The fallback painter for an unknown tool: honour the geometry, ignore the
 *  tool's flourishes (an unknown arrow renders as a plain line). */
function paintGeneric(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  applyInk(ctx, stroke);
  const shape = stroke.shape;
  if (shape.kind === "path") paintPath(ctx, shape.points, stroke.size);
  else if (shape.kind === "segment") paintSegment(ctx, shape.from, shape.to);
  else if (shape.kind === "box") {
    paintRect(ctx, shape.from, shape.to, stroke.filled ?? false);
  } else if (shape.kind === "region") {
    paintRegion(ctx, shape.contours);
  } else if (shape.kind === "text") {
    // The size is the type size, exactly as it is for the tool that types one
    // (see `plugins/builtin/text.ts`); the face is whatever this build can
    // manage without it.
    ctx.font = `${stroke.size}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(shape.text, shape.at.x, shape.at.y);
  }
}

/** How a repaint treats the page, and what it inks unpicked strokes with. */
export type RenderOptions = InkContext & {
  /** What the sheet is made of (see `ground.ts`). Absent means the plain solid
   *  page — no grain, and nothing wet behaves any differently on it — which is
   *  what every drawing painted before grounds existed is.
   *
   *  Only the callers that paint marks **without a drawing** need set it: the
   *  mark cache appending a finished gesture, a layer thumbnail, a size
   *  preview. `renderDrawing` and `underlay` are handed the drawing and take
   *  the sheet off that instead, so what a page is painted on can never depend
   *  on a caller having remembered to say. */
  ground?: Ground;
  /** Leave the background layer out: no page fill, and none of the marks drawn
   *  on the sheet either. What a transparent export asks for — the drawing then
   *  lands on nothing rather than on a page that happens to match, and a patch
   *  the eraser took out is a hole rather than a page-coloured smear. */
  transparentPage?: boolean;
  /** Rule a grid of this spacing (document pixels) across the page, under the
   *  marks. A **screen-only** drawing aid: the PNG export leaves it unset, so a
   *  grid can never reach an exported file. */
  grid?: number;
  /** Paint only the marks that can reach this box, in document coordinates.
   *  The canvas passes the slice of the page its window is actually showing;
   *  the export and the bucket's snapshot, which want the whole page, leave it
   *  unset. Marks outside it are skipped before their painter runs (see
   *  `geometry.ts`) — this is the difference between a zoomed-in repaint
   *  costing what is on screen and costing the whole document. */
  clip?: Rect;
  /** Device pixels per document pixel, for the painters that thin their detail
   *  to match (see `PaintDetail`). Read off the context's transform when it
   *  isn't given, which is right for every caller in the app — pass it only to
   *  paint at a scale the transform doesn't reflect. */
  scale?: number;
  /** Paint the marks as they were *made*, not as the page is looked at: the
   *  layers' own filters are skipped and the stack is folded flat.
   *
   *  One caller, and it is not a view — it is the page snapshot the paint bucket
   *  and the colour dropper read (`probe.ts`). Those two tools answer questions
   *  about the drawing, and a filter is not part of the drawing (see
   *  `Layer.filters`): a dropper that sampled a blurred layer would hand back a
   *  colour that is nowhere in the document, and a bucket flooding across a
   *  softened edge has no edge to stop at and would spill over the page.
   *
   *  The page's own filters never reach the snapshot anyway — they are
   *  composited outside the renderer — so this is what keeps a layer's filters
   *  behaving like them rather than like ink. */
  unfiltered?: boolean;
  /** Marks to leave off this repaint, by stroke id.
   *
   *  One caller: the canvas, while a selection is being dragged. The marks in
   *  flight are painted where the finger has got to instead, and painting them
   *  in both places at once would show a drag hovering over the copy it came
   *  from. Nothing about the *document* changes — this is a view of it with a
   *  few marks lifted off, exactly as a hidden layer is.
   *
   *  Pass a set that lives as long as the drag: the canvas's mark cache compares
   *  it by identity, so a fresh set each frame would repaint the whole page each
   *  frame (see `cache.ts`). */
  omit?: ReadonlySet<string>;
};

/** The grid's ink. Deliberately a fixed translucent grey rather than a theme
 *  colour: it has to read as a faint guide on a white sheet and on a black one,
 *  and it is never the thing you are looking at. */
const GRID_INK = "rgba(120,130,145,0.25)";

/** Rule the grid across the page, clipped to it — the guide belongs to the
 *  sheet, not to the desk it is lying on. Lines are drawn one document pixel
 *  wide; the view transform thins or fattens them with the zoom, which is what
 *  makes the grid recede when you pull back. */
function paintGrid(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  step: number,
): void {
  if (step <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, drawing.width, drawing.height);
  ctx.clip();
  ctx.strokeStyle = GRID_INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < drawing.width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, drawing.height);
  }
  for (let y = step; y < drawing.height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(drawing.width, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Repaint a whole drawing, plus an optional in-flight stroke on top.
 *
 *  A repaint is still a fold over the document rather than an incremental
 *  composite, and that is what keeps the model the single source of truth: an
 *  undo, a synced document arriving and a colour change all go through this one
 *  path, and there is no stale-pixel state to reconcile.
 *
 *  What it is *not* is a promise to draw everything, every time. Two things are
 *  skipped, and neither can change the picture: marks that cannot reach the
 *  window being painted, and detail finer than the device pixels it would land
 *  in. Everything that is on screen is still painted from the document, in
 *  order, every frame. See `cache.ts` for the other half of the story — the
 *  canvas keeps the *committed* marks as pixels, so a repaint during a gesture
 *  is this function called with one stroke rather than a thousand.
 *
 *  "In order" is the drawing's *paint* order: the layer stack from the bottom
 *  up, marks in the order they were drawn within each layer, and nothing at all
 *  from a hidden layer (`layers.ts`). A drawing with no stack of its own is its
 *  stroke list, exactly as before. */
export function renderDrawing(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  draft: Stroke | null,
  given: RenderOptions,
): void {
  // The sheet is the *drawing's*, so it is taken from the drawing rather than
  // from what the caller remembered to pass. Every path below is handed the
  // resolved options, which is what stops a repaint and an export from ever
  // disagreeing about which paper the page is on (see `RenderOptions.ground`).
  const options: RenderOptions = { ...given, ground: drawing.ground };
  // Start from nothing. The sheet is laid under the marks at the end rather
  // than painted before them (see the note at the top of the file), but the
  // page still has to be *cleared* first: a caller may be repainting over
  // pixels it has already blitted, and an under-fill leaves those alone.
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, drawing.width, drawing.height);
  ctx.restore();

  // Hiding the sheet takes the colour but keeps what was drawn on it; a
  // transparent export takes both, which is what makes it transparent.
  const scope = { withoutBackground: options.transparentPage };
  const strokes = visibleStrokes(drawing, scope);
  // A sheet at a time when some layer has to be composited as a unit: one that
  // carries filters, and one that carries wet marks on a ground that mixes them
  // (see `paintStack`). Everything else is one flat fold, as it always was.
  const apart =
    !options.unfiltered &&
    (anyLayerFiltered(drawing) ||
      anyStains(strokes, groundProfile(options.ground)));
  if (apart) {
    // The stack does its own relaying — a rubbing out on a layer composited by
    // itself is scoped to that layer's surface, so what it owes is scoped to it
    // too.
    paintStack(ctx, drawing, scope, options);
  } else {
    paintStrokes(ctx, strokes, options);
    // A rubbing out that only lifts what a rubber can lift took everything for
    // the length of one composite; this puts the rest back.
    relayFixed(ctx, strokes, options);
  }
  if (draft) {
    paintStroke(ctx, draft, options, detailFor(ctx, options));
    // The gesture in flight, over everything already on the page — which is the
    // order it was painted in, so it is the order it owes ink back in.
    relayFixed(ctx, [draft], options, strokes);
  }

  underlay(ctx, drawing, options);
}

/** Paint the stack a sheet at a time, so a layer that has to be composited as a
 *  unit can be — one carrying filters of its own (see `Layer.filters`), and one
 *  carrying wet marks on a ground that mixes them.
 *
 *  **This is what keeps wet mixing inside a layer.** A wash mixes with what it
 *  is painted over and drags a little of it along (see `paintStroke`), and "what
 *  it is painted over" is whatever is on the pixels underneath — which, painted
 *  flat, would be every lower layer as well. Giving the layer a surface of its
 *  own makes the answer "the marks on this sheet", so a wash mixes with the ink
 *  beside it and leaves the layer below alone. That is the useful behaviour as
 *  well as the tidy one: putting a mark on another layer is how you keep it out
 *  of the water.
 *
 *  Only reached when some layer *is* filtered or mixing. Every other drawing keeps the
 *  flat fold above, which is not merely an optimisation: painting layer by layer
 *  changes what an eraser reaches. In one pass a rubbing out on the top layer
 *  takes ink off everything already painted, whatever layer it was drawn on,
 *  and that is the behaviour this app has always had. Splitting a layer onto its
 *  own surface necessarily scopes its erasing to that surface — which is exactly
 *  what makes a filtered layer erasable *through* to the ones below, and exactly
 *  what must not happen to a drawing nobody has filtered.
 *
 *  So the rule is: **a layer is only lifted onto a surface when it has
 *  something to do there** — filters to apply, or wet marks to mix. Every other
 *  layer paints straight onto the page, in order, and goes on erasing
 *  everything under it. */
function paintStack(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  scope: PaintScope,
  options: RenderOptions,
): void {
  const ground = groundProfile(options.ground);
  // What a rubbing out on a layer painted straight onto the page has to put
  // back: everything already painted, whatever layer it was on — because that is
  // exactly what it just took off. A layer painted apart settles its own inside
  // its surface.
  const under: Stroke[] = [];
  for (const { layer, strokes } of paintedLayers(drawing, scope)) {
    const filters = layerFilters(layer);
    if (filters.length === 0 && !anyStains(strokes, ground)) {
      paintStrokes(ctx, strokes, options);
      relayFixed(ctx, strokes, options, under);
    } else {
      paintLayerApart(ctx, drawing, strokes, filters, options);
    }
    under.push(...strokes);
  }
}

/** One layer painted apart: its marks onto a surface of their own, any filters
 *  over that, and the result composited onto the page.
 *
 *  A layer with no filters at all reaches here when its wet marks have to mix
 *  among themselves rather than with the stack below — the surface is then the
 *  whole point and there is nothing to apply over it.
 *
 *  The surface matches the canvas being painted pixel for pixel and inherits its
 *  transform, so the layer's marks land in exactly the places they would have
 *  landed painting straight onto it — the compositing is the only difference.
 *  Falling back to painting straight on is the right failure: a browser that
 *  won't give us a second canvas should show an unfiltered layer rather than a
 *  missing one, which is the same call the mark cache makes.
 *
 *  The window cull is **widened by the filters' reach** before the marks go
 *  down. A blur moves ink, so a mark just off the edge of the window still fogs
 *  its way into it, and culling it for being out of frame would leave the edge
 *  of the layer lighter than its middle — a seam that moves as you pan. */
function paintLayerApart(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  strokes: readonly Stroke[],
  filters: readonly Filter[],
  options: RenderOptions,
): void {
  // A recorder rather than a canvas: an SVG has no pixels to composite, so the
  // layer is recorded into a group of its own and the same two effects travel
  // as SVG filter primitives (see `svg.ts`). Duck-typed for the same reason
  // `renderScale` duck-types `getTransform` — the painters are written against
  // the canvas API, and a recorder that answers more of it gets more.
  //
  // A layer here only to mix its wet marks has nothing to record: the mixing is
  // pixels — blending and bleeding — and a vector file has neither. It paints
  // as a plain layer, which is the same call the whole export makes about the
  // sheet's grain (see `groundPaint.ts`).
  const recorder = asFilterRecorder(ctx);
  if (recorder && filters.length === 0) {
    paintStrokes(ctx, strokes, options);
    return;
  }
  if (recorder) {
    recorder.beginFilterGroup();
    paintStrokes(ctx, strokes, options);
    recorder.endFilterGroup(svgFilter(filters, `layer-filter-${filterId++}`));
    return;
  }

  const canvas = ctx.canvas;
  const surface =
    canvas && canvas.width > 0 && canvas.height > 0
      ? createSurface(canvas.width, canvas.height)
      : null;
  if (!surface) {
    paintStrokes(ctx, strokes, options);
    return;
  }
  const view = readTransform(ctx);
  if (view) {
    surface.ctx.setTransform(view.a, view.b, view.c, view.d, view.e, view.f);
  }
  const scale = options.scale ?? renderScale(ctx);
  const scoped = {
    ...options,
    scale,
    clip: padRect(options.clip, filterReach(filters)),
  };
  paintStrokes(surface.ctx, strokes, scoped);
  // Scoped to this layer, like the erasing it answers: a rubbing out here
  // reaches no further than the surface it is painted on, so neither does the
  // ink it owes back.
  relayFixed(surface.ctx, strokes, scoped);
  // The layer's own filters, over the layer's own pixels. There is no sheet
  // under them — that is the background layer's job and it is somewhere else in
  // this stack — so the blur fades into nothing at the page's edge, which is
  // what a filtered cut-out should do.
  if (filters.length > 0) {
    paintFilters(surface.ctx, filters, {
      page: pageOn(view, drawing),
      scale,
      pageColor: options.pageColor,
      transparent: true,
    });
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(surface.canvas, 0, 0);
  ctx.restore();
}

/** Paint marks that are not part of the cached page — the gesture in flight and
 *  a selection being dragged — through the filters of the layers they sit on.
 *
 *  The canvas paints those on top of a blitted page rather than inside a
 *  repaint (see `frame.ts`), so without this a line drawn on a blurred layer
 *  would come out sharp under the finger and soften the instant it committed.
 *  A mark that changes the moment you let go of it reads as a bug whichever way
 *  round it happens.
 *
 *  Marks are grouped into **runs** rather than gathered per layer, so the order
 *  they were handed over in survives — the caller has already put them in paint
 *  order and this must not reshuffle them.
 *
 *  What it cannot do is make the preview identical to the committed result: a
 *  blur of the mark alone is not a blur of the layer with the mark in it, so
 *  where the new stroke overlaps existing ones the softening shifts slightly on
 *  commit. It is the same picture a fraction differently blended, which is far
 *  less than the alternative of watching the whole stroke change focus.
 *
 *  A **wet** mark in flight is the same trade the other way round. It is
 *  painted onto the finished picture rather than onto its layer's own surface,
 *  so under the finger it mixes with everything showing beneath it and on commit
 *  it mixes only with its own layer (see `paintStack`). A wash drawn on the one
 *  layer a drawing has — which is most of them — comes out identical either way;
 *  on a stack it settles a shade when you lift, and the alternative is a preview
 *  that shows no mixing at all, since a fresh surface has nothing on it to mix
 *  with.
 *
 *  `landsOn` names the layer for marks that carry none — the draft, which is not
 *  stamped with its layer until the store commits it. */
export function paintDetached(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  strokes: readonly Stroke[],
  options: RenderOptions,
  landsOn?: string,
): void {
  if (
    !anyLayerFiltered(drawing) ||
    options.unfiltered ||
    strokes.length === 0
  ) {
    paintStrokes(ctx, strokes, options);
    return;
  }
  // Resolved once for the stack rather than once per mark: a drag can carry
  // hundreds of strokes and every one of them would otherwise re-walk it.
  const byLayer = new Map<string, readonly Filter[]>();
  for (const layer of drawingLayers(drawing)) {
    byLayer.set(layer.id, layerFilters(layer));
  }
  const layerOf = (stroke: Stroke) => stroke.layer ?? landsOn ?? "";

  let run: Stroke[] = [];
  let runLayer = "";
  const flush = () => {
    if (run.length === 0) return;
    const filters = byLayer.get(runLayer) ?? [];
    if (filters.length === 0) paintStrokes(ctx, run, options);
    else paintLayerApart(ctx, drawing, run, filters, options);
    run = [];
  };
  for (const stroke of strokes) {
    const layer = layerOf(stroke);
    if (run.length > 0 && layer !== runLayer) flush();
    runLayer = layer;
    run.push(stroke);
  }
  flush();
}

/** Where the page's rectangle falls on a canvas under `view`, in canvas pixels
 *  — what `paintFilters` works in. Without a readable transform the best guess
 *  is the page at the origin, which is what an export paints at anyway. */
function pageOn(
  view: Transform | null,
  drawing: Drawing,
): { x: number; y: number; width: number; height: number } {
  const scale = view ? Math.hypot(view.a, view.b) || 1 : 1;
  return {
    x: view?.e ?? 0,
    y: view?.f ?? 0,
    width: drawing.width * scale,
    height: drawing.height * scale,
  };
}

/** A context that can record a filtered group rather than composite one. */
type FilterRecorder = {
  beginFilterGroup: () => void;
  endFilterGroup: (filter: { id: string; markup: string } | null) => void;
};

function asFilterRecorder(
  ctx: CanvasRenderingContext2D,
): FilterRecorder | null {
  const candidate = ctx as unknown as Partial<FilterRecorder>;
  return typeof candidate.beginFilterGroup === "function" &&
    typeof candidate.endFilterGroup === "function"
    ? (candidate as FilterRecorder)
    : null;
}

/** Distinguishes one layer's `<filter>` from the next inside a file. Only ever
 *  read while a single export is being written, and only ever has to be unique
 *  within it — an id colliding across two files means nothing. */
let filterId = 0;

type Transform = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

/** The context's transform, or `null` where the context can't report one — the
 *  recording context an SVG export paints onto, and the fakes in the tests. */
function readTransform(ctx: CanvasRenderingContext2D): Transform | null {
  const read = (
    ctx as CanvasRenderingContext2D & { getTransform?: () => Transform }
  ).getTransform;
  if (typeof read !== "function") return null;
  const m = read.call(ctx);
  return Number.isFinite(m.a) ? m : null;
}

/** Grow a cull box by `by` on every side, in document pixels. An absent box
 *  means "cull nothing" and stays that way. */
function padRect(clip: Rect | undefined, by: number): Rect | undefined {
  if (!clip || by <= 0) return clip;
  return {
    x: clip.x - by,
    y: clip.y - by,
    width: clip.width + by * 2,
    height: clip.height + by * 2,
  };
}

/** Lay the grid and the sheet *under* everything already painted.
 *
 *  This is the other half of erasing. Both are backdrops — the marks belong on
 *  top of them — and painting them last with `destination-over` puts them
 *  exactly where painting them first would have, with one difference that is
 *  the whole point: a hole an eraser took out of the marks is filled by them
 *  rather than punched through them. A drawing with nothing erased in it comes
 *  out identical either way.
 *
 *  Exported because the two callers that paint marks onto pixels somebody else
 *  laid the sheet under — the canvas's in-flight gesture (`frame.ts`) and the
 *  mark cache's append (`cache.ts`) — have to put it back afterwards. */
export function underlay(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  options: RenderOptions,
): void {
  // The sheet is the background layer's to paint (see `layers.ts`), so it goes
  // down only while that layer is in play: hidden by its own eye, or dropped by
  // a transparent export, and the page stays empty.
  const withoutBackground =
    options.transparentPage === true || backgroundHidden(drawing);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-over";
  // The grid first, so it ends up between the sheet and the marks — which is
  // where it was when it was painted before them, and which is why a rubbed-out
  // patch shows the ruling again rather than bare page.
  if (options.grid) paintGrid(ctx, drawing, options.grid);
  if (!withoutBackground) {
    // Then the sheet's own grain, between the page colour and the ruling: the
    // paper is what the grid is ruled on. Laid *under* the marks like
    // everything else here, which is what makes it show through a wash in
    // proportion to how transparent the wash is — the tooth reading through
    // watercolour and not through an opaque line is the whole of why paper
    // looks like paper.
    paintGroundTexture(
      ctx,
      drawing,
      // The drawing's own sheet, for `renderDrawing`'s reason: the grain
      // belongs to the page and not to whoever asked for the repaint.
      groundProfile(drawing.ground),
      options.scale ?? renderScale(ctx),
    );
    ctx.fillStyle = options.pageColor;
    ctx.fillRect(0, 0, drawing.width, drawing.height);
  }
  ctx.restore();
}

// --- What a rubber could not have lifted -------------------------------------
//
// A rubber (`PaintPlugin.lifts`) still paints with `destination-out`,
// because that is the only way a canvas gives up pixels: for the length of one
// composite it takes off graphite, ink, paint and photographs alike. What makes
// it a *rubber* is what happens next — everything it could never have lifted is
// laid straight back over the hole.
//
// Which is exact where it matters and approximate where it doesn't, and both
// halves are worth writing down:
//
//   - **The weight is exact.** A run of erasing lanes at alphas a₁…aₙ removes
//     1 − ∏(1 − aᵢ) of what is under it; the *same* lanes painted normally onto
//     an empty surface come out at alpha 1 − ∏(1 − aᵢ). So the mask is, to the
//     pixel, the fraction that went — and opaque ink laid back through it lands
//     at exactly the strength it started at, whatever the pressure dial said.
//   - **The order is approximate.** The ink goes back on *top*, after the whole
//     run, rather than back into the place in the stack it came from. Inside the
//     rubbed patch, ink that had graphite drawn over it comes out in front of
//     it — but that graphite is the thing being rubbed away there, so the pixels
//     the shortcut costs are pixels that are on their way out anyway.
//
// Nothing outside this section knows what a rubber is. It is two flags
// and a compositing pass, exactly as the plain eraser is one flag and a
// compositing mode.

/** One rubbing out — or a run of them with nothing laid between — and the marks
 *  that were already on the page when it happened. */
type LiftGroup = {
  /** Marks to put back: everything painted before these lifting marks that a
   *  rubber has no claim on. Erasing marks are in here too and in their original
   *  order, so a hole somebody took out earlier stays a hole. */
  relay: readonly Stroke[];
  /** The lifting marks whose footprint decides where any of it goes back. */
  lifted: readonly Stroke[];
};

/** Split a run into the groups above: a new one each time fresh ink lands after
 *  a rubbing out, because from then on there is more to put back.
 *
 *  In practice that is one group. Two are what you get from sketching, rubbing,
 *  and then inking over the top — and having them separate is what stops the
 *  second lot of ink being laid back over a patch that was rubbed before it
 *  existed, which on a translucent mark (a highlighter) would show as a
 *  double-strength blot in the shape of the rub. */
function liftGroups(
  strokes: readonly Stroke[],
  before: readonly Stroke[],
): LiftGroup[] {
  const groups: LiftGroup[] = [];
  const relay: Stroke[] = before.filter(relaid);
  let lifted: Stroke[] = [];
  const close = () => {
    // A group with nothing but holes behind it has nothing to put back.
    if (lifted.length > 0 && relay.some((stroke) => !strokeErases(stroke))) {
      groups.push({ relay: [...relay], lifted });
    }
    lifted = [];
  };
  for (const stroke of strokes) {
    if (strokeLifts(stroke)) {
      lifted.push(stroke);
      continue;
    }
    // Ink a rubber may take: nothing to put back, and nothing that closes a
    // group either — a second pencil line drawn beside the first does not
    // change what the rubbing out before it owes.
    if (!relaid(stroke)) continue;
    close();
    relay.push(stroke);
  }
  close();
  return groups;
}

/** Lay back the ink a rubbing out took off but could never have lifted.
 *
 *  `strokes` is the run just painted, in paint order; `before` is what was
 *  already on these pixels when it started — empty for a repaint that folded the
 *  whole document, the committed marks for the canvas's gesture in flight and
 *  for the mark cache's append.
 *
 *  A no-op, and a cheap one, for every drawing nobody has reached for the pencil
 *  eraser in. */
export function relayFixed(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  options: RenderOptions,
  before: readonly Stroke[] = [],
): void {
  if (!anyLifts(strokes)) return;
  for (const group of liftGroups(strokes, before)) {
    relayGroup(ctx, group, options);
  }
}

/** One group put back: the ink, masked by where the rubbing out went. */
function relayGroup(
  ctx: CanvasRenderingContext2D,
  group: LiftGroup,
  options: RenderOptions,
): void {
  // Nothing outside the rubbed patch can have changed, so nothing outside it is
  // worth repainting — which is what keeps this the cost of the *mark* rather
  // than the cost of the document.
  const reach = meet(reachOf(group.lifted), options.clip);
  if (!reach) return;
  const relay = group.relay.filter((stroke) => strokeVisible(stroke, reach));
  if (!relay.some((stroke) => !strokeErases(stroke))) return;
  const scoped = { ...options, clip: reach };

  const patch = maskedInk(ctx, relay, group.lifted, scoped, reach);
  if (!patch) {
    // No surface to mask on: a context that isn't a canvas (the SVG export's
    // recorder), or a browser that refused one. Put the ink back unmasked — it
    // then also lands where the rubber never went, which is a stacking order
    // nobody will notice, where losing the ink outright is the one failure that
    // would show. Same call the filtered-layer path makes.
    paintStrokes(ctx, relay, scoped);
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(patch.ink.canvas, patch.at.x, patch.at.y);
  ctx.restore();
}

/** The ink of a group, kept only where the rubbing out actually reached: the
 *  marks on one surface, the rubbing out on another, and `destination-in` to cut
 *  the first to the second. `null` where there is no surface to be had.
 *
 *  The surfaces are cut to **the rubbed patch** rather than to the canvas, and
 *  that is the difference between this costing the mark and costing the screen:
 *  a rubbing out happens once a frame for as long as a finger is down, and two
 *  phone-sized canvases a frame is a lot of pixels to mint and throw away for a
 *  patch a centimetre across. */
function maskedInk(
  ctx: CanvasRenderingContext2D,
  relay: readonly Stroke[],
  lifted: readonly Stroke[],
  options: RenderOptions,
  reach: Rect,
): { ink: Surface; at: { x: number; y: number } } | null {
  if (asFilterRecorder(ctx)) return null;
  const canvas = ctx.canvas;
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
  const view = readTransform(ctx) ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const patch = onCanvas(reach, view, canvas);
  if (!patch) return null;

  const ink = createSurface(patch.width, patch.height);
  const mask = ink && createSurface(patch.width, patch.height);
  if (!ink || !mask) return null;
  // The page's own transform, slid over so the patch's corner is the surface's
  // origin: the marks then land in the same places they would have landed on
  // the canvas, and the blit at the end simply puts them back.
  for (const surface of [ink, mask]) {
    surface.ctx.setTransform(
      view.a,
      view.b,
      view.c,
      view.d,
      view.e - patch.x,
      view.f - patch.y,
    );
  }
  const scoped = { ...options, scale: options.scale ?? renderScale(ctx) };
  paintStrokes(ink.ctx, relay, scoped);
  paintMask(mask.ctx, lifted, scoped);

  ink.ctx.save();
  ink.ctx.setTransform(1, 0, 0, 1, 0, 0);
  ink.ctx.globalAlpha = 1;
  ink.ctx.globalCompositeOperation = "destination-in";
  ink.ctx.drawImage(mask.canvas, 0, 0);
  ink.ctx.restore();
  return { ink, at: patch };
}

/** Where a box of page lands on the canvas under `view`, in whole canvas pixels
 *  and clamped to it. `null` when none of it is on the canvas at all — a rubbing
 *  out that has been scrolled off the screen.
 *
 *  All four corners are transformed rather than the two the app's own pan and
 *  zoom would need, because a box under a rotation is not the box its corners
 *  are, and the maths is four lines either way. */
function onCanvas(
  box: Rect,
  view: Transform,
  canvas: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ]) {
    xs.push(view.a * px! + view.c * py! + view.e);
    ys.push(view.b * px! + view.d * py! + view.f);
  }
  // Outwards to whole pixels, so the patch cannot land half a pixel off the
  // hole it is filling.
  const x = Math.max(0, Math.floor(Math.min(...xs)));
  const y = Math.max(0, Math.floor(Math.min(...ys)));
  const width = Math.min(canvas.width, Math.ceil(Math.max(...xs))) - x;
  const height = Math.min(canvas.height, Math.ceil(Math.max(...ys))) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** The lifting marks painted as marks rather than as holes, onto an empty
 *  surface: the same painter, the same alphas, composited the ordinary way
 *  round. What comes out is a picture of how much went. */
function paintMask(
  ctx: CanvasRenderingContext2D,
  lifted: readonly Stroke[],
  options: RenderOptions,
): void {
  const detail = detailFor(ctx, options);
  for (const stroke of lifted) {
    if (!strokeVisible(stroke, options.clip)) continue;
    const resolved = resolveStrokeInk(stroke, options);
    ctx.save();
    pluginById(resolved.tool)?.behaviour.paint(ctx, resolved, detail);
    ctx.restore();
  }
}

/** How far a run of marks reaches, as one box. `null` when none of them can say
 *  — which for a rubbing out means there is nothing to put back either. */
function reachOf(strokes: readonly Stroke[]): Rect | null {
  let box: Rect | null = null;
  for (const stroke of strokes) {
    const bounds = strokeBounds(stroke);
    if (!bounds) continue;
    box = box ? cover(box, bounds) : bounds;
  }
  return box;
}

/** The smallest box holding both. */
function cover(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Where two boxes overlap, or `null` when they don't. An absent second box is
 *  "everywhere", which is what an unculled repaint passes. */
function meet(a: Rect | null, b: Rect | undefined): Rect | null {
  if (!a) return null;
  if (!b) return a;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Paint a run of strokes onto an already-prepared page — the marks half of a
 *  repaint, without the page or the grid.
 *
 *  Split out because the canvas's layer cache needs exactly this: the same
 *  loop, over the strokes that arrived since it last painted, onto pixels it is
 *  keeping. */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  options: RenderOptions,
): void {
  const detail = detailFor(ctx, options);
  const clip = options.clip;
  const omit = options.omit;
  for (const stroke of strokes) {
    if (omit?.has(stroke.id)) continue;
    if (!strokeVisible(stroke, clip)) continue;
    paintStroke(ctx, stroke, options, detail);
  }
}

/** The detail to paint at: what the caller said, or what the context's own
 *  transform says, plus the sheet the marks are landing on. Both are resolved
 *  once per repaint rather than once per stroke. */
function detailFor(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
): PaintDetail {
  return {
    scale: options.scale ?? renderScale(ctx),
    ground: groundProfile(options.ground),
  };
}

// Screen-to-document mapping used to live here, back when the canvas element
// was the page and was laid out to fit the viewport. The page is now larger
// than the screen and the element is a window onto it, so that conversion is a
// property of the *view* rather than of the element's box — it lives in
// `viewport.ts` alongside the rest of the pan/zoom maths.
