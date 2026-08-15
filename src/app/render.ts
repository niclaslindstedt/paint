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

import { strokeVisible, type Rect } from "./geometry.ts";
import { backgroundHidden, visibleStrokes } from "./layers.ts";
import { paintRegion } from "./plugins/brushes.ts";
import { pluginById } from "./plugins/registry.ts";
import { applyInk, paintPath, paintRect, paintSegment } from "./plugins/ink.ts";
import { FULL_DETAIL, type PaintDetail } from "./plugins/types.ts";
import type { Drawing, Stroke } from "./types.ts";

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

/** Paint one stroke through its tool's painter.
 *
 *  A stroke whose tool this build doesn't ship — a document written by a newer
 *  version, or one that used a plugin since removed — still renders: we fall
 *  back to a generic painter keyed off the shape kind. Losing the tool must
 *  never mean losing the drawing. (A mark from a lost *erasing* tool therefore
 *  comes back as a plain one. There is no honest alternative — the flag lived
 *  on the plugin, not on the stroke — and a visible mark beats a silent one.) */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  ink: InkContext,
  detail: PaintDetail = FULL_DETAIL,
): void {
  const resolved = resolveStrokeInk(stroke, ink);
  ctx.save();
  const plugin = pluginById(resolved.tool);
  // A rubbing out is the same painter laying the same mark, composited the
  // other way round: `destination-out` subtracts the mark's alpha from what is
  // already there. Set here rather than inside the painter so a tool only has
  // to *declare* that it erases — and so every painter, textured ones included,
  // rubs out exactly the shape it would have drawn.
  if (plugin?.erases) ctx.globalCompositeOperation = "destination-out";
  if (plugin) plugin.behaviour.paint(ctx, resolved, detail);
  else paintGeneric(ctx, resolved);
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
  options: RenderOptions,
): void {
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
  paintStrokes(
    ctx,
    visibleStrokes(drawing, { withoutBackground: options.transparentPage }),
    options,
  );
  if (draft) paintStroke(ctx, draft, options, detailFor(ctx, options));

  underlay(ctx, drawing, options);
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
    ctx.fillStyle = options.pageColor;
    ctx.fillRect(0, 0, drawing.width, drawing.height);
  }
  ctx.restore();
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
 *  transform says. Measured once per repaint rather than once per stroke. */
function detailFor(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
): PaintDetail {
  return { scale: options.scale ?? renderScale(ctx) };
}

// Screen-to-document mapping used to live here, back when the canvas element
// was the page and was laid out to fit the viewport. The page is now larger
// than the screen and the element is a window onto it, so that conversion is a
// property of the *view* rather than of the element's box — it lives in
// `viewport.ts` alongside the rest of the pan/zoom maths.
