// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a rubber could not have lifted.
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
// Nothing outside this module knows what a rubber is. It is two flags
// and a compositing pass, exactly as the plain eraser is one flag and a
// compositing mode.
//
// The flags are also the whole story of what the pass has to *cost*. A rubbing
// out can only change the picture where its own reach crosses ink a rubber can
// take (`liftBounds`), so the canvas holds the erase and the relay to that
// patch and skips both where there is none — and while one is under the hand,
// the ink it is cut from is the committed marks, which are the same marks they
// were a millisecond ago, so that ink is painted once and held between frames
// rather than re-rendered per pointer sample (`heldMaskedInk`). Rubbing at a
// page of washes used to re-run the watercolour simulation on every sample;
// now it costs the pencil marks actually under the rub.

import { strokeBounds, strokeVisible, type Rect } from "./geometry.ts";
import { pluginById } from "./plugins/registry.ts";
import {
  clipToMask,
  detailFor,
  paintStrokes,
  renderScale,
  resolveStrokeInk,
  strokeErases,
  strokeLifts,
  type RenderOptions,
} from "./render.ts";
import { createSurface, wipeSurface, type Surface } from "./surface.ts";
import type { Stroke } from "./types.ts";

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

/** Whether a rubber could take this mark off — `PaintPlugin.liftable`, read the
 *  way every flag is: off the descriptor, with a lost tool counting as one it
 *  could not. */
function liftableStroke(stroke: Stroke): boolean {
  return pluginById(stroke.tool)?.liftable === true;
}

/** Where a run of rubbings out can change the picture at all: the union of the
 *  patches where their reach crosses a mark a rubber can take
 *  (`PaintPlugin.liftable`), cut to `clip`. `null` when it crosses none.
 *
 *  `null` is the answer worth acting on. Everywhere else, the erase takes
 *  nothing the relay does not put straight back — so a caller that holds both
 *  halves to this box, or skips both when there is no box, paints the same
 *  picture for the cost of the pencil marks actually under the rub. That is
 *  what the canvas does with its gesture in flight (see `frame.ts`), and it is
 *  why rubbing at a page of ink and washes is a blit rather than a repaint. */
export function liftBounds(
  lifted: readonly Stroke[],
  others: readonly Stroke[],
  clip?: Rect,
): Rect | null {
  const reach = meet(reachOf(lifted), clip);
  if (!reach) return null;
  let box: Rect | null = null;
  for (const stroke of others) {
    if (!liftableStroke(stroke)) continue;
    const bounds = strokeBounds(stroke);
    if (!bounds) continue;
    const patch = meet(bounds, reach);
    if (patch) box = box ? cover(box, patch) : patch;
  }
  return box;
}

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
  if (!strokes.some(strokeLifts)) return;
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

  // The gesture in flight cuts on held surfaces — the expensive half of the
  // pair below survives from one pointer sample to the next. Everything else
  // (a full repaint, the mark cache's append, an export) cuts fresh.
  const patch =
    (options.live ? heldMaskedInk(ctx, group, scoped, reach) : null) ??
    maskedInk(ctx, relay, group.lifted, scoped, reach);
  if (!patch) {
    // No surface to mask on: a context that isn't a canvas (the SVG export's
    // recorder), or a browser that refused one. Put the ink back unmasked — it
    // then also lands where the rubber never went, which is a stacking order
    // nobody will notice, where losing the ink outright is the one failure that
    // would show. Same call the layer-apart path makes.
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
  if (isRecorder(ctx)) return null;
  const canvas = ctx.canvas;
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
  const view = readTransform(ctx) ?? IDENTITY;
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

// --- The gesture in flight, cut on held surfaces -----------------------------
//
// While a rubbing out is under the hand, `relayGroup` runs once per pointer
// sample — and of the two surfaces it cuts with, only the mask actually
// changes. The ink is rendered from the *committed* marks, which are the same
// marks they were a millisecond ago; re-rendering them per sample is what made
// rubbing at a busy page crawl, because a watercolour mark is a simulation and
// the frame was re-running it for every centimetre the finger moved.
//
// So the live path keeps three surfaces instead of minting two: the ink,
// window-sized, painted once and reused for as long as nothing it depends on
// changes — validated the way the mark cache validates its own pixels, by
// stroke identity, view and colours — and a patch-sized pair the cut is made
// on each frame. A second gesture over an unchanged page reuses the ink the
// first one paid for.

/** The committed ink a live rubbing out is being cut from, and everything the
 *  pixels depend on. */
type HeldInk = {
  /** The marks the pixels were painted from, element for element. A stroke is
   *  immutable, so the same objects are the same picture — `grewFrom`'s
   *  argument, made here about reuse instead of appending. */
  relay: readonly Stroke[];
  view: Transform;
  width: number;
  height: number;
  /** Everything else that decides what the marks look like, flat enough to
   *  compare in one go (see `lookOf`). */
  look: string;
  ink: Surface;
};

let heldInk: HeldInk | null = null;
/** …and the patch-sized pair the cut is made on, kept for the allocator's sake
 *  exactly as the layer-apart surface is (see `render.ts`). */
let heldCut: { ink: Surface; mask: Surface } | null = null;

/** Drop the held surfaces. Tests only — the app holds them for its lifetime,
 *  the way it holds the layer-apart scratch. */
export function dropHeldRelay(): void {
  heldInk = null;
  heldCut = null;
}

/** `maskedInk` for the gesture in flight: the same cut, made on held surfaces,
 *  with the ink re-rendered only when something it depends on changed. `null`
 *  falls back to the unheld path. */
function heldMaskedInk(
  ctx: CanvasRenderingContext2D,
  group: LiftGroup,
  options: RenderOptions,
  reach: Rect,
): { ink: Surface; at: { x: number; y: number } } | null {
  if (isRecorder(ctx)) return null;
  const canvas = ctx.canvas;
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
  const view = readTransform(ctx) ?? IDENTITY;
  const patch = onCanvas(reach, view, canvas);
  if (!patch) return null;
  const scoped = { ...options, scale: options.scale ?? renderScale(ctx) };
  // The whole relay run rather than the slice the reach can see: the held ink
  // covers the window, so a reach that grows as the gesture does keeps cutting
  // from the same pixels instead of invalidating them.
  const held = heldInkFor(group.relay, view, canvas, scoped);
  if (!held) return null;
  const cut = heldCutFor(patch.width, patch.height);
  if (!cut) return null;

  // The fixed ink for this patch, copied out of the held window…
  cut.ink.ctx.drawImage(held.ink.canvas, -patch.x, -patch.y);
  // …and the rubbing painted fresh — it really does change every frame — the
  // ordinary way round, which is the mask that says how much went.
  cut.mask.ctx.setTransform(
    view.a,
    view.b,
    view.c,
    view.d,
    view.e - patch.x,
    view.f - patch.y,
  );
  paintMask(cut.mask.ctx, group.lifted, scoped);
  cut.ink.ctx.save();
  cut.ink.ctx.setTransform(1, 0, 0, 1, 0, 0);
  cut.ink.ctx.globalAlpha = 1;
  cut.ink.ctx.globalCompositeOperation = "destination-in";
  cut.ink.ctx.drawImage(cut.mask.canvas, 0, 0);
  cut.ink.ctx.restore();
  return { ink: cut.ink, at: patch };
}

/** The held ink, reused when nothing it depends on changed and re-rendered
 *  when something did. `null` where there is no DOM to make a surface in. */
function heldInkFor(
  relay: readonly Stroke[],
  view: Transform,
  canvas: { width: number; height: number },
  options: RenderOptions,
): HeldInk | null {
  const look = lookOf(options);
  if (
    heldInk &&
    heldInk.width === canvas.width &&
    heldInk.height === canvas.height &&
    heldInk.look === look &&
    sameView(heldInk.view, view) &&
    sameRun(heldInk.relay, relay)
  ) {
    return heldInk;
  }
  const ink = heldInk?.ink ?? createSurface(canvas.width, canvas.height);
  if (!ink) return null;
  wipeSurface(ink, canvas.width, canvas.height);
  ink.ctx.setTransform(view.a, view.b, view.c, view.d, view.e, view.f);
  // Culled to the window the canvas is showing, which is all the held pixels
  // can hold anyway — the same cull the frame under it ran. Painted *landed*,
  // whatever the caller's own coat was: these are the committed marks, and a
  // `live` flag riding in from the gesture would route them through the
  // painters' live paths — and past the dried-mark stores that make them a
  // blit (see `PaintDetail.live`).
  paintStrokes(ink.ctx, relay, {
    ...options,
    clip: windowOf(view, canvas),
    live: undefined,
  });
  heldInk = {
    relay,
    view: { ...view },
    width: canvas.width,
    height: canvas.height,
    look,
    ink,
  };
  return heldInk;
}

/** The patch-sized pair, wiped and resized to fit. */
function heldCutFor(
  width: number,
  height: number,
): { ink: Surface; mask: Surface } | null {
  if (!heldCut) {
    const ink = createSurface(width, height);
    const mask = ink && createSurface(width, height);
    heldCut = ink && mask ? { ink, mask } : null;
  }
  if (!heldCut) return null;
  wipeSurface(heldCut.ink, width, height);
  wipeSurface(heldCut.mask, width, height);
  return heldCut;
}

/** The option values that change what the held ink looks like, as one
 *  comparable string. The view and the marks are compared apart because they
 *  are the ones that change for interesting reasons; these are the ones that
 *  change together with everything else (a theme flip, a detail slider), where
 *  any change repaints the whole frame anyway. */
function lookOf(options: RenderOptions): string {
  return [
    options.pageColor,
    options.defaultInk,
    options.transparentPage,
    options.washDetail,
    options.leadDetail,
    options.ground?.stock,
    options.ground?.texture,
  ].join("|");
}

function sameView(a: Transform, b: Transform): boolean {
  return (
    a.a === b.a &&
    a.b === b.b &&
    a.c === b.c &&
    a.d === b.d &&
    a.e === b.e &&
    a.f === b.f
  );
}

/** Whether two runs are the same marks — by identity, stroke by stroke, for
 *  `grewFrom`'s reason: a stroke is immutable, so anything that rewrote one
 *  makes new objects and honestly fails the test. */
function sameRun(a: readonly Stroke[], b: readonly Stroke[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** The slice of the page the canvas is showing under `view`, in document
 *  coordinates — the held ink's cull. `undefined` for a view that can't be
 *  inverted, which culls nothing rather than everything. */
function windowOf(
  view: Transform,
  canvas: { width: number; height: number },
): Rect | undefined {
  const det = view.a * view.d - view.b * view.c;
  if (!det || !Number.isFinite(det)) return undefined;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [
    [0, 0],
    [canvas.width, 0],
    [0, canvas.height],
    [canvas.width, canvas.height],
  ]) {
    const dx = px! - view.e;
    const dy = py! - view.f;
    xs.push((view.d * dx - view.c * dy) / det);
    ys.push((view.a * dy - view.b * dx) / det);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// --- The plumbing under both paths -------------------------------------------

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
    // Cut to the same window the rub itself was cut to: the mask measures how
    // much ink went, and a rub held inside a selection took none outside it.
    for (const mask of resolved.clip ?? []) clipToMask(ctx, mask);
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

export type Transform = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** The context's transform, or `null` where the context can't report one — the
 *  recording context an SVG export paints onto, and the fakes in the tests. */
export function readTransform(ctx: CanvasRenderingContext2D): Transform | null {
  const read = (
    ctx as CanvasRenderingContext2D & { getTransform?: () => Transform }
  ).getTransform;
  if (typeof read !== "function") return null;
  const m = read.call(ctx);
  return Number.isFinite(m.a) ? m : null;
}

/** Whether this "context" is the SVG export's recorder rather than a real
 *  canvas (see `svg.ts`). Duck-typed for the same reason `renderScale`
 *  duck-types `getTransform` — the painters are written against the canvas API,
 *  and the recorder answers the subset of it they use.
 *
 *  Asked by the places that would otherwise reach for a second surface and
 *  read pixels back off it. A vector file has neither, so all of them fall
 *  back to recording the marks plainly. */
export function isRecorder(ctx: CanvasRenderingContext2D): boolean {
  return typeof (ctx as unknown as { toSvg?: unknown }).toSvg === "function";
}
