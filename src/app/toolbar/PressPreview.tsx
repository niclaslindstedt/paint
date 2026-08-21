// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useMemo, useRef } from "react";

import {
  lifeReach,
  pressBox,
  pressExtent,
  pressMarks,
  pressReach,
  pressScale,
} from "../press.ts";
import { sizePreview } from "../plugins/controls.ts";
import type { PaintPlugin } from "../plugins/types.ts";
import { paintStrokes, type InkContext } from "../render.ts";
import {
  TileCache,
  blit,
  enqueuePaint,
  rendererKey,
  tileCanvas,
  tileRatio,
} from "../tiles.ts";
import type { Stroke } from "../types.ts";
import { nativeScale } from "../viewport.ts";

// The nib preview: a press with the tool in your hand, painted for real.
//
// What the size button and the size panel show is not a picture of a number —
// it is the mark that width would leave, built by the tool that would leave it
// (`press.ts`) and painted by the same `paintStrokes` the page, the layer
// thumbnails and the PNG export go through. So an airbrush previews as a cone,
// a highlighter as a translucent band, the calligraphy pen as its flat, and a
// tool that lands next year previews as itself with nothing to add here.
//
// Three things follow from painting it rather than drawing a dot:
//
//   - **It is on your page.** The tile is the page colour, and the mark is the
//     ink you have picked, at the opacity it will land at — so a pale nib on a
//     dark sheet looks like a pale nib on a dark sheet, and the eraser has a
//     blot of ink to take a bite out of.
//   - **It follows the dials.** The Advanced sliders are in the same panel, and
//     turning hardness down softens the dab under your thumb as you drag it.
//   - **A row is one scale.** Every cell of a *row* is shrunk by the same amount
//     — the amount that fits the broadest width on it — so the row reads
//     fine-to-broad the way a row of nibs does, instead of five marks each
//     fitted to its own cell and all the same size.
//   - **A lone preview is life size.** A tile with nothing beside it to compare
//     against has no row to be a comparison in, and the toolbar's nib button is
//     the one that matters: it is the mark you are about to make, so it is drawn
//     at the page's own 100% — one document pixel to one device pixel — and the
//     tile clips whatever will not fit (`fit: "life"`). Fitted, it was a lie you
//     could catch in one press: a hairline pencil previewed as a dot three times
//     the dot it drew, because the row it was being scaled against ran up to a
//     nib wider than the button.
//   - **…and a tool can insist on life size even in a row.** `sizePreview:
//     "life"` — the type tool, because an "A" is the same letter at 10 pt and at
//     48 pt, so a row fitted to its own cells draws five identical letters and
//     says nothing about any of them. Half a letter at the size it will land at
//     says what a whole one shrunk to the cell cannot.
//
// Two kinds of tool fall back to the plain dot below: one whose press leaves no
// mark at all (the hand, the dropper), and one that asks for a circle because
// its mark cannot describe itself (`sizePreview: "circle"` — the eraser, whose
// press is a hole). Both come out of the same branch: no marks, so a dot.
//
// **A press is not cheap, and a panel opens ten of them.** The four preset
// chips and the five widths of the watercolour brush are nine real renders, and
// painting them in one effect flush is what made the size panel open a third of
// a second after it was pressed. So a tile is painted once and kept, painted one
// per frame rather than all at once, and — the half that makes the panel open
// already drawn — painted at idle before the button that opens it is pressed
// (see `warmPressTiles` and `tiles.ts`).

/** How much of the tile the broadest mark on the row is fitted into — and, at
 *  life size, how much of it a two-anchor gesture is allowed to span before the
 *  tile's own edge cuts it off (see `lifeReach`). */
const FILL = 0.88;

/** The smallest a mark may come out, in CSS pixels, before the fit gives up and
 *  draws it at a size that can be seen. */
const MIN_MARK = 4;

// --- How much room the ink needs ---------------------------------------------
// A stroke's own box is its geometry — its anchors and its nib. Half the tools
// here paint well past it: the airbrush's cone is over three times the nib, the
// pen's flat is twice it, the crayon frays, a soft edge haloes. Fitting the
// geometry alone cropped the airbrush's cone into a soft square, and a fixed
// allowance big enough for the airbrush shrank the pencil to nothing.
//
// So the ink is *measured*, not guessed at: the mark is painted once into an
// off-screen tile and read back as the box its pixels actually reach. It costs
// one small `getImageData` per tool per tuning, it is cached, and — the reason
// it is worth it — it is right for a painter this file has never heard of,
// which is the whole promise the plugin seam makes.

/** The measuring tile, in pixels, and the share of it the mark's *geometry* is
 *  drawn into. The rest is the room texture is allowed to spread into before
 *  the measurement clips it — four times the nib, which is past anything the
 *  media here reach. */
const TRIAL = 96;
const TRIAL_FIT = 0.25;

/** How much alpha counts as ink. Above nothing, so an airbrush's cone is
 *  measured where it stops *reading* rather than where it stops existing. */
const INK_FLOOR = 12;

/** How many measurements to keep. A row asks for one, and a new one arrives
 *  only when a tool is retuned or a width is kept — but a colour drag would
 *  eventually fill a map that nothing ever emptied. */
const MEASURED_MAX = 64;

const measured = new Map<string, InkMeasure>();

/** What one trial paint says about a medium, every number a multiple of the
 *  geometry the strokes claim — so one measurement answers for every width on
 *  the row (see `reachFor`).
 *
 *  `reach` is how far past that geometry the ink goes. `left` and `bottom` are
 *  where the ink actually starts, measured from the middle of the box, and they
 *  matter only where the tile shows *part* of a mark: a stroke's box is a line
 *  of type with the white under the letter in it, so a clipped sample hung on
 *  the box can be a tile of nothing at all. The corner where the letter meets
 *  its baseline has ink in it by construction. */
type InkMeasure = { reach: number; left: number; bottom: number };

const NO_INK: InkMeasure = { reach: 1, left: 0, bottom: 0 };

/** A tile kept for measuring, made once — the same trick `textBox` uses to
 *  measure type, and for the same reason: a canvas per question is a canvas per
 *  repaint. */
let trial: CanvasRenderingContext2D | null | undefined;

/** How far the ink of `marks` actually reaches, as a multiple of the box the
 *  strokes claim. 1 for a mark that paints exactly its geometry (a pencil dab,
 *  a rectangle); over 3 for an airbrush cone.
 *
 *  Measured off the widest mark on a row and applied to the rest of it: the
 *  ratio is a property of the *medium* rather than of the width, so measuring
 *  every cell would be the same answer several times over. */
function inkReach(marks: readonly Stroke[], ink: InkContext): InkMeasure {
  const at = pressBox(marks);
  const geometry = pressExtent(marks);
  if (!at || geometry <= 0) return NO_INK;
  if (trial === undefined) {
    const canvas =
      typeof document === "undefined" ? null : document.createElement("canvas");
    if (canvas) {
      canvas.width = TRIAL;
      canvas.height = TRIAL;
    }
    trial = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;
  }
  if (!trial) return NO_INK;

  const scale = (TRIAL * TRIAL_FIT) / geometry;
  trial.setTransform(1, 0, 0, 1, 0, 0);
  trial.clearRect(0, 0, TRIAL, TRIAL);
  trial.setTransform(scale, 0, 0, scale, TRIAL / 2, TRIAL / 2);
  trial.translate(-(at.x + at.width / 2), -(at.y + at.height / 2));
  paintStrokes(trial, marks, ink);

  const pixels = trial.getImageData(0, 0, TRIAL, TRIAL).data;
  const middle = TRIAL / 2;
  let reach = 0;
  let left = TRIAL;
  let bottom = -1;
  for (let y = 0; y < TRIAL; y++) {
    for (let x = 0; x < TRIAL; x++) {
      if (pixels[(y * TRIAL + x) * 4 + 3]! < INK_FLOOR) continue;
      // How far from the centre this pixel sits — the mark is centred on the
      // tile it is previewed in too, so that distance is what has to fit.
      reach = Math.max(
        reach,
        Math.abs(x + 0.5 - middle),
        Math.abs(y + 0.5 - middle),
      );
      if (x < left) left = x;
      if (y > bottom) bottom = y;
    }
  }
  if (reach <= 0 || bottom < 0) return NO_INK;
  return {
    reach: Math.max(1, (reach * 2) / scale / geometry),
    // The trial is painted centred, so where the ink starts *is* the offset —
    // backed out of the trial's own scale and into multiples of the geometry,
    // which is what makes one measurement answer for the whole row.
    left: (left - middle) / scale / geometry,
    bottom: (bottom + 1 - middle) / scale / geometry,
  };
}

/** `inkReach`, remembered. The key is what changes the *medium* — the tool and
 *  how it is tuned — and deliberately not the width: the mark is measured
 *  against its own geometry, so how far a spray cone reaches past its nib is
 *  the same answer at every width, and a slider dragged across its whole track
 *  costs one measurement rather than ninety-six. */
function reachFor(
  key: string,
  marks: readonly Stroke[],
  ink: InkContext,
): InkMeasure {
  const known = measured.get(key);
  if (known !== undefined) return known;
  const reach = inkReach(marks, ink);
  if (measured.size >= MEASURED_MAX) measured.clear();
  measured.set(key, reach);
  return reach;
}

/** Everything a press tile is a picture of.
 *
 *  The preview's own props, and also what a warming pass is handed: the panel
 *  can paint the tiles it is about to show before it shows them precisely
 *  because a tile is a function of nothing but this (see `warmPressTiles`). */
export type PressTile = {
  /** The tool the press is made with. Absent — a tool this build doesn't ship
   *  — falls back to the dot. */
  plugin: PaintPlugin | undefined;
  /** The width being previewed. */
  size: number;
  /** The broadest width on the row this preview belongs to: what every cell of
   *  it is scaled against, so the row is one comparison. */
  of: number;
  /** The ink in hand, already resolved against the page by the caller. */
  color: string;
  /** The page it lands on. */
  background: string;
  /** The tool's dials, resolved — the preview draws with them, so it is the
   *  mark this tool makes *as you have it set*. */
  dials: Readonly<Record<string, number>>;
  /** …and its own inks, for a tool that carries them (see
   *  `plugins/swatches.ts`). Absent for every tool that draws with the
   *  toolbar's, which is all of them but the gradient. */
  colors?: Readonly<Record<string, string>>;
  /** The fill toggle, for the tools that honour it. */
  filled?: boolean;
  /** The tile's side, in CSS pixels. */
  box?: number;
  /** How big to draw the mark in that tile.
   *
   *  `"row"` — the default — fits it to the row it belongs to: every cell
   *  shrunk by the amount the broadest width on the row needs, so a row of
   *  widths is one comparison rather than five marks each filled to its own
   *  cell (see `pressScale`).
   *
   *  `"life"` draws it at the page's own 100% instead — one document pixel to
   *  one device pixel — and lets the tile clip what will not fit. For a preview
   *  that is *alone*: the toolbar's nib button has no row beside it, so there is
   *  nothing for a fitted mark to be a comparison with, and the only useful
   *  thing it can be is the mark you are about to make at the size you are
   *  about to make it. A tool can ask for the same treatment inside a row with
   *  `sizePreview: "life"`. */
  fit?: "row" | "life";
};

/** Whether this tile is drawn at life size.
 *
 *  Two ways to ask, and they are asked by different people for the same reason.
 *  A **caller** asks (`fit: "life"`) when its tile stands alone and a fitted
 *  mark would be scaled against a row that isn't on the screen. A **tool** asks
 *  (`sizePreview: "life"`) when its preview has nothing to say but the number,
 *  and then it is life size everywhere, the width row included. */
function atLife(tile: PressTile): boolean {
  return tile.fit === "life" || sizePreview(tile.plugin) === "life";
}

/** The scale life size paints at: one document pixel to one device pixel, which
 *  is the zoom the canvas readout calls 100% (see `nativeScale`). Document
 *  pixels per CSS pixel, like every other scale here. */
function lifeScale(): number {
  return nativeScale(
    typeof window === "undefined" ? 1 : window.devicePixelRatio,
  );
}

/** What a press tile is made of: the marks a single press leaves, the yardstick
 *  they are scaled against, and how far this medium's ink reaches past its own
 *  geometry.
 *
 *  The simulation half of a tile, and the cheap half — driving the plugin
 *  contract builds stroke geometry, where painting that geometry is what runs a
 *  watercolour. Kept apart from the painting so the component can ask "is there
 *  a mark here at all?" (the dot's question, answered every render) without
 *  asking "what does it look like?" (the queue's). */
function pressFor(tile: PressTile): {
  press: Stroke[];
  reach: () => InkMeasure;
  widest: number;
} {
  const {
    plugin,
    size,
    of,
    color,
    background,
    dials,
    colors,
    filled,
    box = DEFAULT_BOX,
  } = tile;
  // A tool that asks for a circle is not simulated at all: there is no press
  // to paint, and the dot below is the whole preview.
  if (sizePreview(plugin) === "circle") {
    return { press: [], reach: () => NO_INK, widest: 0 };
  }
  // The yardstick: the broadest width on the row — or the width in hand when
  // it is broader still, which is what the slider is doing while it is being
  // dragged past everything the row offers.
  const top = Math.max(of, size);
  // How far a two-anchor gesture travels. Against the row when the row is what
  // the mark will be scaled against, and against the *tile* when nothing will
  // be scaled at all — a life-size rectangle three times a broad nib is off the
  // tile, and an unfilled one leaves the tile in the middle of its outline with
  // no ink on it (see `lifeReach`).
  const travel = atLife(tile)
    ? lifeReach((box * FILL) / lifeScale())
    : pressReach(top);
  const ink = { color, dials, colors, filled: filled ?? false, background };
  const press = pressMarks(plugin, { ...ink, size }, travel);
  const widest =
    size === top ? press : pressMarks(plugin, { ...ink, size: top }, travel);
  const tuning = JSON.stringify(dials) + JSON.stringify(colors ?? {});
  return {
    press,
    // How far this medium's ink reaches past the geometry, measured once and
    // shared by every cell of the row (see `inkReach`). The engines in force
    // are in the key with the tuning: the same brush painted by the other
    // watercolour is a different mark, and it reaches differently.
    reach: () =>
      reachFor(`${plugin?.id}|${filled}|${tuning}|${rendererKey()}`, widest, {
        pageColor: background,
        defaultInk: color,
      }),
    widest: pressExtent(widest),
  };
}

/** How big to draw the press in its tile, in document pixels per CSS pixel.
 *
 *  Two answers. The ordinary one fits the row (`pressScale`) against the
 *  geometry *grown by however far this medium's ink reaches past it*, so what
 *  is fitted is the mark that lands rather than the box the stroke claims.
 *
 *  The other is life size — the scale the canvas calls 100%, one document pixel
 *  to one device pixel — so the sample measures on the glass what it will
 *  measure on the page, and the tile clips the rest. Nothing is measured for it:
 *  the ink allowance exists to stop a fitted mark being cropped, and this one is
 *  *meant* to be.
 *
 *  Where life size hangs the mark is the one thing a tool still decides. The
 *  default is the middle of its box, which is where a dab, a band and a cone all
 *  want to be. A tool that asked for life size *itself* (`sizePreview: "life"` —
 *  the type tool) gets the corner where its ink starts instead: a sample too big
 *  for the tile has to be clipped somewhere, the one corner guaranteed to have
 *  ink in it is the one the letter stands on, and it is also how type reads — a
 *  row of samples sharing a baseline and a left margin, each running as far up
 *  and to the right as its size takes it. */
function drawScale(
  tile: PressTile,
  marks: ReturnType<typeof pressFor>,
  box: number,
): { scale: number; offX: number; offY: number } {
  const extent = pressExtent(marks.press);
  if (atLife(tile)) {
    const scale = lifeScale();
    if (sizePreview(tile.plugin) !== "life") return { scale, offX: 0, offY: 0 };
    const ink = marks.reach();
    const half = (box / 2 - ((1 - FILL) / 2) * box) / scale;
    return {
      scale,
      offX: ink.left * extent + half,
      offY: ink.bottom * extent - half,
    };
  }
  const ink = marks.reach();
  return {
    scale: pressScale(
      extent * ink.reach,
      marks.widest * ink.reach,
      box * FILL,
      MIN_MARK,
    ),
    offX: 0,
    offY: 0,
  };
}

/** …and the painting half: the press, fitted and centred on a tile of its own.
 *  `null` for a press that leaves no mark, or where a 2D context is not to be
 *  had. */
function paintPress(
  tile: PressTile,
  marks: ReturnType<typeof pressFor>,
): HTMLCanvasElement | null {
  const { color, background, box = DEFAULT_BOX } = tile;
  const at = pressBox(marks.press);
  if (!at) return null;
  const dpr = tileRatio();
  const made = tileCanvas(box, box, dpr);
  if (!made) return null;
  const { canvas, ctx } = made;
  const side = canvas.width;

  const { scale, offX, offY } = drawScale(tile, marks, box);
  // Centred on the tile by the mark's own box: a caption hangs from its
  // top-left and a dab sits on the press, and neither should decide where the
  // preview sits.
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, side / 2, side / 2);
  ctx.translate(-(at.x + at.width / 2 + offX), -(at.y + at.height / 2 + offY));
  // `paintStrokes` reads the detail off this transform, so the textured
  // painters drop the specks and hairs that would land inside one device
  // pixel here without being told the preview is small.
  paintStrokes(ctx, marks.press, { pageColor: background, defaultInk: color });

  // The page last, under the mark — the same order the canvas paints in, and
  // for the same reason: a tool that rubs out has to take ink off without
  // taking the sheet with it (see `render.ts`). Opaque, because a preview of
  // a white nib on nothing is nothing.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, side, side);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** Everything that decides a tile's pixels, folded into one string — the tuning
 *  and the ink, and with them the tile's own size on this screen and the
 *  engines the renderer is painting with. */
function pressKey(tile: PressTile): string {
  const tuning = JSON.stringify(tile.dials) + JSON.stringify(tile.colors ?? {});
  return [
    tile.plugin?.id,
    tile.size,
    tile.of,
    tile.color,
    tile.background,
    tile.filled ?? false,
    tile.box ?? DEFAULT_BOX,
    tile.fit ?? "row",
    tileRatio(),
    // What life size comes to on this screen. Not the same number as
    // `tileRatio`, which is capped — a tile painted at 4× and one painted at 5×
    // are the same picture, but the *mark* on them is not the same size.
    atLife(tile) ? lifeScale() : "",
    rendererKey(),
    tuning,
  ].join("|");
}

/** Presses already painted. A panel's worth is ten or so, and a dial dragged
 *  across its track mints one per step per cell, so the cap is a few panels
 *  deep and the oldest go first. */
const painted = new TileCache(120);

/** The tile's side when the caller doesn't say. */
const DEFAULT_BOX = 26;

/** Paint the presses a panel is about to show, before it is opened.
 *
 *  This is what makes the size panel open drawn rather than open and then fill
 *  in: called at idle with the very tiles the panel would render (see
 *  `SizePicker`), it puts them through the same one-per-frame queue while
 *  nobody is waiting, and the panel's own effects then find every one of them
 *  in the cache and blit it. Calling it warm costs a map lookup each.
 *
 *  Returns the way to call the rest of it off. A warming pass is queued from an
 *  effect, and the ink or the tuning it was warming *for* can change while it
 *  is still standing in line — so the pass that replaces it takes the last one
 *  back out of the queue rather than leaving a trail of pictures nobody will
 *  ever look at. */
export function warmPressTiles(tiles: readonly PressTile[]): () => void {
  if (typeof document === "undefined" || typeof window === "undefined")
    return () => {};
  const queued: Array<() => void> = [];
  for (const tile of tiles) {
    const key = pressKey(tile);
    if (painted.has(key)) continue;
    queued.push(
      enqueuePaint(() => {
        // Looked up again inside the job: the panel may have opened while this
        // stood in the queue, and painted the very tile it was queued for.
        if (painted.has(key)) return;
        const canvas = paintPress(tile, pressFor(tile));
        if (canvas) painted.remember(key, canvas);
      }),
    );
  }
  return () => queued.forEach((cancel) => cancel());
}

export function PressPreview(props: PressTile) {
  const { size, of, background, box = DEFAULT_BOX } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // One string standing for everything that changes the picture. The
  // simulation, the cache and the repaint all hang off it, so the preview costs
  // nothing while the toolbar re-renders for reasons it doesn't care about — a
  // pan moves the zoom readout, not the nib.
  const key = pressKey(props);
  // Everything the marks are built from is in `key`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const marks = useMemo(() => pressFor(props), [key]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || marks.press.length === 0) return;
    // Painted before: a blit, on the spot. The queue is only for pixels that
    // have to be worked out.
    const kept = painted.get(key);
    if (kept) {
      blit(canvas, kept);
      return;
    }
    return enqueuePaint(() => {
      const tile = painted.get(key) ?? paintPress(props, marks);
      if (!tile) return;
      painted.remember(key, tile);
      blit(canvas, tile);
    });
    // `key` is what `props` amounts to here, and `marks` is built from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, marks]);

  // No mark to paint: the plain dot. At life size it is the nib itself, in the
  // tile's own room; in a row it is the width relative to the row's widest.
  if (marks.press.length === 0)
    return atLife(props) ? (
      <SizeDot size={size} life cap={box} />
    ) : (
      <SizeDot size={size} of={of} />
    );

  return (
    <canvas
      ref={canvasRef}
      // Decorative: the button beside it is labelled with the width itself, and
      // a screen reader gains nothing from a picture of a dab of ink.
      aria-hidden="true"
      // The page's own colour behind the canvas, so a tile still in the queue
      // reads as a blank sheet rather than as a hole in the row.
      style={{
        width: `${box}px`,
        height: `${box}px`,
        backgroundColor: background,
      }}
      className="rounded-[3px]"
    />
  );
}

/** The fallback: the width as a plain dot, for a tool whose press leaves no
 *  mark to paint — the eraser and the rubber, whose press is a hole and shows
 *  nothing on a bare page (`sizePreview: "circle"`); the hand and the dropper,
 *  which leave nothing at all; or a tool this build doesn't ship.
 *
 *  Three readings, and they answer three different questions.
 *
 *  `life` is the nib itself: the width in document pixels taken down to CSS
 *  pixels at the page's own 100%, so a 10 mm block rubber is drawn as wide as
 *  10 mm of page will be under your finger. It is **clipped** by the tile
 *  rather than shrunk into it — a board eraser is wider than a toolbar button
 *  and there is no drawing of it at life size that isn't — and clipped rather
 *  than *capped* because those are not the same picture: a capped disc is a
 *  clean circle, which is exactly what a nib that fits looks like, so the one
 *  reading the row needs to survive ("this one is past the tile") would be the
 *  one it lost. Cut off, an oversize nib reads as cut off.
 *
 *  `of` — the widest width on the row it belongs to — switches the dot from
 *  absolute to *relative*: at the nib widths a drawing tool offers the two
 *  readings are the same thing, but a row whose scale runs past the cap would
 *  otherwise draw five identical dots for five sizes.
 *
 *  Neither is the width in CSS pixels, plain, up to the cap. */
export function SizeDot({
  size,
  of,
  cap = 18,
  className = "bg-fg",
  life = false,
}: {
  size: number;
  of?: number;
  /** The most room the dot has, in CSS pixels: what it is capped at in the two
   *  fitted readings, and the tile it is clipped by at life size. */
  cap?: number;
  className?: string;
  life?: boolean;
}) {
  if (life) {
    // A one-pixel nib is one device pixel of ink here, exactly as it is on the
    // page — floored at a pixel so a hairline is a speck rather than nothing.
    const d = Math.max(1, size * lifeScale());
    return (
      <span
        aria-hidden="true"
        className="relative block overflow-hidden rounded-[3px]"
        style={{ width: `${cap}px`, height: `${cap}px` }}
      >
        <span
          className={`absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full ${className}`}
          style={{ width: `${d}px`, height: `${d}px` }}
        />
      </span>
    );
  }
  const d =
    of && of > cap
      ? // The floor keeps the smallest size on the row a visible dot rather
        // than a speck.
        Math.round(3 + (Math.min(size, of) / of) * (cap - 3))
      : Math.max(2, Math.min(size, cap));
  return (
    <span
      aria-hidden="true"
      className={`rounded-full ${className}`}
      style={{ width: `${d}px`, height: `${d}px` }}
    />
  );
}
