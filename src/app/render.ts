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

import { CHECKER_SQUARE } from "./canvas.ts";
import { effectReach, type Effect } from "./effects.ts";
import { paintEffect } from "./effectPaint.ts";
import { strokeVisible, type Rect } from "./geometry.ts";
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
  backgroundHidden,
  paintedLayers,
  visibleStrokes,
  type PaintScope,
} from "./layers.ts";
import { paintRegion } from "./plugins/brushes.ts";
import { pluginById } from "./plugins/registry.ts";
import { applyInk, paintPath, paintRect, paintSegment } from "./plugins/ink.ts";
import { leadDetail } from "./plugins/lead.ts";
import { washDetail } from "./plugins/wash.ts";
import { FULL_DETAIL, type PaintDetail } from "./plugins/types.ts";
import {
  isRecorder,
  readTransform,
  relayFixed,
  type Transform,
} from "./relay.ts";
import { createSurface, wipeSurface, type Surface } from "./surface.ts";
import type { Drawing, Ground, Layer, Stroke } from "./types.ts";
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

/** An effect being shown on some layers without being applied to them. */
export type EffectPreview = {
  effect: Effect;
  /** The layers it would land on — what `effectTargets` answered for the scope
   *  the dialog is set to. */
  layerIds: ReadonlySet<string>;
};

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
  /** The two squares of the transparency chequer, painted under the marks where
   *  a page has no sheet at all (see `canvas.ts`). **Screen-only**, for the same
   *  reason the grid is: it is how "there is nothing here" is drawn, and an
   *  export that baked it in would have painted the nothing it was asked to
   *  leave out. An export therefore leaves it unset and the page stays
   *  genuinely empty. */
  checker?: readonly [string, string];
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
  /** Fold the stack flat: no layer is lifted onto a surface of its own, whatever
   *  it is carrying, and no effect preview is painted.
   *
   *  One caller, and it is not a view — it is the page snapshot the paint bucket
   *  and the colour dropper read (`probe.ts`). Those two tools answer questions
   *  about the *drawing*, and an effect that has not been applied yet is not
   *  part of it: a dropper that sampled a previewed blur would hand back a
   *  colour that is nowhere in the document, and a bucket flooding across a
   *  softened edge has no edge to stop at and would spill over the page. */
  flat?: boolean;
  /** An effect being tried on, painted but never kept (see `effects.ts`).
   *
   *  It is how the dialog's sliders show their answer on the drawing itself,
   *  and it is deliberately the *same* code the bake runs: the layers it names
   *  are each lifted onto a surface of their own and the effect is composited
   *  over that, which is exactly what `bake.ts` will rasterise if you apply it.
   *
   *  Held on the render options rather than on the document because it is a view
   *  and nothing more — no undo step, no push to the cloud, no row in the panel
   *  changing before the change is real. Pass an object that lives as long as
   *  the dialog: the mark cache compares it by identity, so a fresh one per
   *  frame would repaint the page per frame (see `cache.ts`). */
  preview?: EffectPreview;
  /** How finely the watercolour simulation resolves on this repaint (see
   *  `MIN_WASH_DETAIL`).
   *
   *  Absent — which is nearly every caller — means the detail the app has in
   *  force, so the thumbnails, the size preview, the page the colour dropper
   *  reads and the exported PNG cannot disagree about it. One caller sets it:
   *  the canvas, which passes the same value it read so the mark cache can *see*
   *  it change (see `frame.ts`), because a coarser field is a different picture
   *  of the same document. */
  washDetail?: number;
  /** …and how finely the graphite simulation works the pencil marks out (see
   *  `MIN_LEAD_DETAIL`). Absent means the same thing and it is set by the same
   *  caller for the same reason. */
  leadDetail?: number;
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
  /** These marks are the gesture still under the hand (see `PaintDetail.live`).
   *
   *  One caller: the canvas's in-flight coat (`frame.ts`), which is the only
   *  paint in the app that happens once per pointer sample rather than once per
   *  mark. It buys the expensive painters a cheaper setting for that coat and
   *  nothing else. */
  live?: boolean;
  /** Keep the topmost painted layer's pixels when it is lifted onto a surface
   *  for its wet marks — the mark cache's seam, and its alone (see `cache.ts`).
   *
   *  A wet mark mixes with its own layer, so a stroke landing on a thirsty
   *  sheet cannot be appended onto the finished picture and used to cost a
   *  full repaint instead. Keeping the layer's own surface, and the screen as
   *  it stood *below* that layer, is what lets the cache absorb the next wet
   *  mark by painting one stroke instead of the document. Only the topmost
   *  painted layer is offered — anything higher would sit on top of pixels the
   *  cache cannot reconstruct — and only when it is lifted for its wet marks
   *  rather than for an effect being previewed. */
  keepWet?: KeepWet;
};

/** What the mark cache hands a repaint to keep the wet layer's pixels with. */
export type KeepWet = {
  /** The surface to lift the layer onto — the caller's own, not the shared
   *  scratch, because it outlives the repaint. */
  into: Surface;
  /** Called when the canvas holds everything painted *below* the layer — every
   *  lower layer, and not yet the sheet, which goes under at the end. */
  below: (layer: Layer) => void;
  /** Called when the layer's marks are all on `into` and composited onto the
   *  page: the two surfaces now reconstruct this repaint. Not called when the
   *  lift fell back to painting the layer straight on. */
  kept: (layer: Layer, strokes: readonly Stroke[]) => void;
};

/** Paint `marks` with the context held to the sheet — nothing outside the page's
 *  own rectangle lands.
 *
 *  **A mark belongs to the page, not to the desk it is lying on.** The canvas
 *  element is a window onto a page that is usually smaller than it (see
 *  `PaintCanvas.tsx`), so a gesture that begins or wanders past the sheet's edge
 *  used to paint on the grey around it: ink floating off the paper on screen,
 *  which then vanished on export, because an export rasterises the page and
 *  nothing else. The screen and the file disagreed about the drawing, and the
 *  screen was the one that was wrong.
 *
 *  So the clip is here rather than in the pointer handling, and it is the same
 *  clip for every surface that paints marks: the screen, the mark cache, the
 *  thumbnails and the export all cut at the same edge, so they cannot disagree.
 *  Held marks are unchanged — a stroke that runs off the page is still the whole
 *  stroke in the document, and moving it back on brings all of it back.
 *
 *  Not the sheet itself, which is laid *under* the marks afterwards and is
 *  already the page's own rectangle (see `underlay`), and not the chrome, whose
 *  whole job is to draw where the page ends. */
export function onSheet(
  ctx: CanvasRenderingContext2D,
  drawing: { width: number; height: number },
  marks: () => void,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, drawing.width, drawing.height);
  ctx.clip();
  marks();
  ctx.restore();
}

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

/** The transparency chequer, clipped to the page. Squares are laid in document
 *  coordinates so they sit still under a pan and grow under a zoom — a chequer
 *  that stayed screen-sized would crawl across the drawing whenever the view
 *  moved, which reads as something painted on rather than as the absence of it.
 *
 *  **The dark squares go down first**, which looks backwards and is not: this is
 *  called under `destination-over` (see `underlay`), where each fill lands
 *  *behind* everything already painted. So the squares are laid first and the
 *  flat sheet behind them fills what is left — paint the sheet first and it
 *  would cover the page in one colour, with every square that followed hidden
 *  behind the very fill it was meant to sit on. */
function paintChecker(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  [even, odd]: readonly [string, string],
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, drawing.width, drawing.height);
  ctx.clip();
  const step = CHECKER_SQUARE;
  const cols = Math.ceil(drawing.width / step);
  const rows = Math.ceil(drawing.height / step);
  ctx.fillStyle = odd;
  ctx.beginPath();
  for (let row = 0; row < rows; row += 1) {
    for (let col = row % 2; col < cols; col += 2) {
      ctx.rect(col * step, row * step, step, step);
    }
  }
  ctx.fill();
  ctx.fillStyle = even;
  ctx.fillRect(0, 0, drawing.width, drawing.height);
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
  // A sheet at a time when some layer has to be composited as a unit: one an
  // effect is being previewed on, and one that carries wet marks on a ground
  // that mixes them (see `paintStack`). Everything else is one flat fold, as it
  // always was — and that is every drawing with no dialog open on it.
  const preview = options.flat ? undefined : options.preview;
  const apart =
    !options.flat &&
    (preview !== undefined ||
      anyStains(strokes, groundProfile(options.ground)));
  // Every mark below is held to the sheet: what is off the page is not on the
  // drawing (see `onSheet`).
  onSheet(ctx, drawing, () => {
    if (apart) {
      // The stack does its own relaying — a rubbing out on a layer composited by
      // itself is scoped to that layer's surface, so what it owes is scoped to it
      // too.
      paintStack(ctx, drawing, scope, options, preview);
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
  });

  underlay(ctx, drawing, options);
}

/** Paint the stack a sheet at a time, so a layer that has to be composited as a
 *  unit can be — one an effect is being previewed on, and one carrying wet marks
 *  on a ground that mixes them.
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
 *  Only reached when some layer *is* previewing or mixing. Every other drawing
 *  keeps the flat fold above, which is not merely an optimisation: painting
 *  layer by layer changes what an eraser reaches. In one pass a rubbing out on
 *  the top layer takes ink off everything already painted, whatever layer it was
 *  drawn on, and that is the behaviour this app has always had. Splitting a
 *  layer onto its own surface necessarily scopes its erasing to that surface —
 *  which must not happen to a drawing nobody has a dialog open on.
 *
 *  So the rule is: **a layer is only lifted onto a surface when it has
 *  something to do there** — an effect to show, or wet marks to mix. Every other
 *  layer paints straight onto the page, in order, and goes on erasing
 *  everything under it. */
function paintStack(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  scope: PaintScope,
  options: RenderOptions,
  preview: EffectPreview | undefined,
): void {
  const ground = groundProfile(options.ground);
  // What a rubbing out on a layer painted straight onto the page has to put
  // back: everything already painted, whatever layer it was on — because that is
  // exactly what it just took off. A layer painted apart settles its own inside
  // its surface.
  const under: Stroke[] = [];
  const walk = paintedLayers(drawing, scope);
  walk.forEach(({ layer, strokes }, at) => {
    const shown = preview?.layerIds.has(layer.id) ? preview.effect : null;
    if (!shown && !anyStains(strokes, ground)) {
      paintStrokes(ctx, strokes, options);
      relayFixed(ctx, strokes, options, under);
    } else {
      // The mark cache may ask to keep this layer's pixels — only the topmost
      // painted layer, and only one lifted for its wet marks: a preview is a
      // dialog being tried on, and its pixels are nothing to keep.
      const keep =
        !shown && at === walk.length - 1 ? options.keepWet : undefined;
      if (keep) keep.below(layer);
      const apart = paintLayerApart(
        ctx,
        drawing,
        strokes,
        shown,
        options,
        keep?.into,
      );
      if (keep && apart) keep.kept(layer, strokes);
    }
    under.push(...strokes);
  });
}

/** The one surface layers are lifted onto, held between repaints.
 *
 *  A layer painted apart needs a canvas the size of the one being painted, and
 *  on a sheet that soaks it needs one on **every full repaint** — which during
 *  a pan of a wet page is twice a frame, once per strip (see `cache.ts`).
 *  Minting a screen-sized canvas that often spends more time in the allocator
 *  and the collector than in the rasteriser, so one is kept and resized to fit
 *  instead, exactly as the wet painter keeps its scratch (see `wet.ts`). One
 *  slot is enough: layers are painted apart one at a time, each composited
 *  onto the page before the next begins, and nothing inside `paintLayerApart`
 *  can reach it again while it is in use. */
let apartHeld: Surface | null = null;

/** That surface, sized to `width`×`height` and cleared — or `null` where there
 *  is no DOM to make one in, which is `createSurface`'s own answer. */
function apartSurface(width: number, height: number): Surface | null {
  const held = apartHeld ?? createSurface(width, height);
  if (!held) return null;
  apartHeld = held;
  return wipeSurface(held, width, height);
}

/** One layer painted apart: its marks onto a surface of their own, an effect
 *  over that if one is being previewed, and the result composited onto the page.
 *
 *  A layer with no effect at all reaches here when its wet marks have to mix
 *  among themselves rather than with the stack below — the surface is then the
 *  whole point and there is nothing to apply over it.
 *
 *  The surface matches the canvas being painted pixel for pixel and inherits its
 *  transform, so the layer's marks land in exactly the places they would have
 *  landed painting straight onto it — the compositing is the only difference.
 *  Falling back to painting straight on is the right failure: a browser that
 *  won't give us a second canvas should show a plain layer rather than a missing
 *  one, which is the same call the mark cache makes.
 *
 *  The window cull is **widened by the effect's reach** before the marks go
 *  down. A blur moves ink, so a mark just off the edge of the window still fogs
 *  its way into it, and culling it for being out of frame would leave the edge
 *  of the layer lighter than its middle — a seam that moves as you pan.
 *
 *  `into` is a surface the caller wants the layer lifted onto instead of the
 *  shared scratch — the mark cache keeping the wet layer's pixels (see
 *  `KeepWet`). Answers whether the lift actually happened: a `false` fell back
 *  to painting the layer straight on, and there is nothing on `into` to keep. */
function paintLayerApart(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  strokes: readonly Stroke[],
  effect: Effect | null,
  options: RenderOptions,
  into?: Surface,
): boolean {
  // A recorder rather than a canvas: an SVG has no pixels to composite, and
  // nothing that reaches it needs any. An effect preview never exports — it is a
  // dialog that is open on the screen — and a layer here only to mix its wet
  // marks has nothing to record either, because the mixing *is* pixels. Both
  // paint as a plain layer, which is the same call the whole export makes about
  // the sheet's grain (see `groundPaint.ts`).
  if (isRecorder(ctx)) {
    paintStrokes(ctx, strokes, options);
    return false;
  }

  const canvas = ctx.canvas;
  const surface =
    canvas && canvas.width > 0 && canvas.height > 0
      ? into
        ? wipeSurface(into, canvas.width, canvas.height)
        : apartSurface(canvas.width, canvas.height)
      : null;
  if (!surface) {
    paintStrokes(ctx, strokes, options);
    return false;
  }
  const view = readTransform(ctx);
  if (view) {
    surface.ctx.setTransform(view.a, view.b, view.c, view.d, view.e, view.f);
  }
  const scale = options.scale ?? renderScale(ctx);
  const scoped = {
    ...options,
    scale,
    clip: padRect(options.clip, effect ? effectReach(effect) : 0),
  };
  paintStrokes(surface.ctx, strokes, scoped);
  // Scoped to this layer, like the erasing it answers: a rubbing out here
  // reaches no further than the surface it is painted on, so neither does the
  // ink it owes back.
  relayFixed(surface.ctx, strokes, scoped);
  // The effect, over the layer's own pixels — the same composite `bake.ts` will
  // rasterise if this preview is applied. There is no sheet under them, so the
  // blur fades into nothing at the page's edge.
  if (effect) {
    paintEffect(surface.ctx, effect, {
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
  return true;
}

/** Where the page's rectangle falls on a canvas under `view`, in canvas pixels
 *  — what `paintEffect` works in. Without a readable transform the best guess
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
  // …and, where there is no sheet, the chequer under everything, so a rubbed-out
  // patch on a transparent page shows the nothing it went back to rather than a
  // hole through to the app behind it. Only a screen asks for it (see
  // `RenderOptions.checker`).
  if (withoutBackground && options.checker) {
    paintChecker(ctx, drawing, options.checker);
  }
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
 *  transform says, plus the sheet the marks are landing on and how finely the
 *  two simulations are set to resolve. All of them are resolved once per repaint rather than once per
 *  stroke.
 *
 *  Exported for the one other module that paints marks through the plugin
 *  contract: the relay pass, whose mask is the lifting marks painted the
 *  ordinary way round (see `relay.ts`). */
export function detailFor(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
): PaintDetail {
  return {
    scale: options.scale ?? renderScale(ctx),
    ground: groundProfile(options.ground),
    // The sheet's colour, for the painters that work in pigment rather than in
    // a fill: it is what says which way a stain runs, and it is the same
    // reading of the same page `inkBlend` makes below (see `PaintDetail.page`).
    page: options.pageColor,
    washDetail: options.washDetail ?? washDetail(),
    leadDetail: options.leadDetail ?? leadDetail(),
    // The same box the stroke cull uses, handed down so a painter can skip the
    // stamps that cannot reach it as well (see `PaintDetail.clip`). A mark that
    // covers the window is one stroke to the cull and three hundred cones to
    // the painter, and only the painter can drop the other two hundred.
    ...(options.clip ? { clip: options.clip } : {}),
    // …and whether these marks are the gesture in flight, which is the other
    // thing a painter may spend differently on (see `PaintDetail.live`).
    ...(options.live ? { live: true } : {}),
  };
}

// Screen-to-document mapping used to live here, back when the canvas element
// was the page and was laid out to fit the viewport. The page is now larger
// than the screen and the element is a window onto it, so that conversion is a
// property of the *view* rather than of the element's box — it lives in
// `viewport.ts` alongside the rest of the pan/zoom maths.
