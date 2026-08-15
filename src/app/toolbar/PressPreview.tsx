// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useMemo, useRef } from "react";

import {
  pressBox,
  pressExtent,
  pressMarks,
  pressReach,
  pressScale,
} from "../press.ts";
import { sizePreview } from "../plugins/controls.ts";
import type { PaintPlugin } from "../plugins/types.ts";
import { paintStrokes, type InkContext } from "../render.ts";
import type { Stroke } from "../types.ts";

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
//   - **The row is one scale.** Every cell is shrunk by the same amount — the
//     amount that fits the broadest width on the row — so the row reads
//     fine-to-broad the way a row of nibs does, instead of five marks each
//     fitted to its own cell and all the same size.
//
// Two kinds of tool fall back to the plain dot below: one whose press leaves no
// mark at all (the hand, the dropper), and one that asks for a circle because
// its mark cannot describe itself (`sizePreview: "circle"` — the eraser, whose
// press is a hole). Both come out of the same branch: no marks, so a dot.

/** How much of the tile the broadest mark on the row is fitted into. */
const FILL = 0.88;

/** The smallest a mark may come out, in CSS pixels, before the fit gives up and
 *  draws it at a size that can be seen. */
const MIN_MARK = 4;

/** Device pixels per CSS pixel, capped: past three the tile costs more to paint
 *  than it can show. */
function ratio(): number {
  return Math.min(window.devicePixelRatio || 1, 3);
}

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

const measured = new Map<string, number>();

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
function inkReach(marks: readonly Stroke[], ink: InkContext): number {
  const at = pressBox(marks);
  const geometry = pressExtent(marks);
  if (!at || geometry <= 0) return 1;
  if (trial === undefined) {
    const canvas =
      typeof document === "undefined" ? null : document.createElement("canvas");
    if (canvas) {
      canvas.width = TRIAL;
      canvas.height = TRIAL;
    }
    trial = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;
  }
  if (!trial) return 1;

  const scale = (TRIAL * TRIAL_FIT) / geometry;
  trial.setTransform(1, 0, 0, 1, 0, 0);
  trial.clearRect(0, 0, TRIAL, TRIAL);
  trial.setTransform(scale, 0, 0, scale, TRIAL / 2, TRIAL / 2);
  trial.translate(-(at.x + at.width / 2), -(at.y + at.height / 2));
  paintStrokes(trial, marks, ink);

  const pixels = trial.getImageData(0, 0, TRIAL, TRIAL).data;
  const middle = TRIAL / 2;
  let reach = 0;
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
    }
  }
  if (reach <= 0) return 1;
  return Math.max(1, (reach * 2) / scale / geometry);
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
): number {
  const known = measured.get(key);
  if (known !== undefined) return known;
  const reach = inkReach(marks, ink);
  if (measured.size >= MEASURED_MAX) measured.clear();
  measured.set(key, reach);
  return reach;
}

type Props = {
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
  /** The fill toggle, for the tools that honour it. */
  filled?: boolean;
  /** The tile's side, in CSS pixels. */
  box?: number;
};

export function PressPreview({
  plugin,
  size,
  of,
  color,
  background,
  dials,
  filled = false,
  box = 26,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // One string standing for everything that changes the mark. The simulation
  // and the repaint both hang off it, so the preview costs nothing while the
  // toolbar re-renders for reasons it doesn't care about — a pan moves the zoom
  // readout, not the nib.
  const tuning = JSON.stringify(dials);
  const key = `${plugin?.id}|${size}|${of}|${color}|${background}|${filled}|${tuning}`;
  const marks = useMemo(() => {
    // A tool that asks for a circle is not simulated at all: there is no press
    // to paint, and the dot below is the whole preview.
    if (sizePreview(plugin) === "circle") {
      return { press: [] as Stroke[], reach: () => 1, widest: 0 };
    }
    // The yardstick: the broadest width on the row — or the width in hand when
    // it is broader still, which is what the slider is doing while it is being
    // dragged past everything the row offers.
    const top = Math.max(of, size);
    const travel = pressReach(top);
    const ink = { color, dials, filled, background };
    const press = pressMarks(plugin, { ...ink, size }, travel);
    const widest =
      size === top ? press : pressMarks(plugin, { ...ink, size: top }, travel);
    return {
      press,
      // How far this medium's ink reaches past the geometry, measured once and
      // shared by every cell of the row (see `inkReach`).
      reach: () =>
        reachFor(`${plugin?.id}|${filled}|${tuning}`, widest, {
          pageColor: background,
          defaultInk: color,
        }),
      widest: pressExtent(widest),
    };
    // Everything the marks are built from is in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const at = pressBox(marks.press);
    if (!at) return;
    const dpr = ratio();
    const side = Math.max(1, Math.round(box * dpr));
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The geometry, grown by however far this medium's ink reaches past it —
    // so what is fitted to the tile is the mark that lands, not the box the
    // stroke claims.
    const reach = marks.reach();
    const scale = pressScale(
      pressExtent(marks.press) * reach,
      marks.widest * reach,
      box * FILL,
      MIN_MARK,
    );
    // Centred on the tile by the mark's own box: a caption hangs from its
    // top-left and a dab sits on the press, and neither should decide where the
    // preview sits.
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, side / 2, side / 2);
    ctx.translate(-(at.x + at.width / 2), -(at.y + at.height / 2));
    // `paintStrokes` reads the detail off this transform, so the textured
    // painters drop the specks and hairs that would land inside one device
    // pixel here without being told the preview is small.
    paintStrokes(ctx, marks.press, {
      pageColor: background,
      defaultInk: color,
    });

    // The page last, under the mark — the same order the canvas paints in, and
    // for the same reason: a tool that rubs out has to take ink off without
    // taking the sheet with it (see `render.ts`). Opaque, because a preview of
    // a white nib on nothing is nothing.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, side, side);
    ctx.globalCompositeOperation = "source-over";
  }, [marks, background, color, box]);

  if (marks.press.length === 0) return <SizeDot size={size} of={of} />;

  return (
    <canvas
      ref={canvasRef}
      // Decorative: the button beside it is labelled with the width itself, and
      // a screen reader gains nothing from a picture of a dab of ink.
      aria-hidden="true"
      style={{ width: `${box}px`, height: `${box}px` }}
      className="rounded-[3px]"
    />
  );
}

/** The fallback: the width as a plain dot, for a tool whose press leaves no
 *  mark to paint — the hand, the dropper, or one this build doesn't ship.
 *
 *  `of` is the widest width on the row it belongs to, and it switches the dot
 *  from absolute to *relative*: at the nib widths a drawing tool offers the two
 *  readings are the same thing, but a row whose scale runs past the cap would
 *  otherwise draw five identical dots for five sizes. */
export function SizeDot({
  size,
  of,
  cap = 18,
  className = "bg-fg",
}: {
  size: number;
  of?: number;
  cap?: number;
  className?: string;
}) {
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
