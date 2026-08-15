// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { onImageDecoded } from "./images.ts";
import { paintStrokes } from "./render.ts";
import type { Drawing, Stroke } from "./types.ts";

// A layer's marks, painted small: the preview in each row of the layers panel.
//
// It replaces the mark count that used to sit under the layer's name, and it
// answers a question the count never could. "4 marks" tells you a layer is not
// empty; a picture tells you *which* layer this is — the one with the diagram,
// the one with the labels, the one with the photo — which is the only thing you
// ever open the panel to find out.
//
// It is painted through the same `paintStrokes` the screen and every export go
// through, so a preview can't drift from the page: a new tool appears in it the
// day it is registered, with nothing here to teach.
//
// The whole sheet is shown, not a crop of the marks. Where a layer's work sits
// on the page is half of what tells two layers apart, and a crop would blow a
// stray dot up to fill the frame and make an almost-empty layer look busy.
//
// One liberty is taken, and it is the difference between a preview and a grey
// smudge: a mark thinner than a pixel at preview scale is painted *at* a pixel.
// A 6-pixel pencil line on a 3200-pixel page comes out at 0.075 device pixels
// in a 40-pixel box — mathematically present, invisible in practice. Fattening
// only the marks that would vanish keeps the picture honest about position and
// colour while making it a picture at all.

/** The square cell a preview sits in, in CSS pixels. The sheet is fitted
 *  *inside* it at its own proportions and centred, rather than the preview
 *  taking the page's shape outright: every row then starts its name at the same
 *  place, which a column of previews that were 40 wide on one drawing and 14 on
 *  the next would not. */
const THUMB_BOX = 34;

/** …but never thinner than this on the short side, so an extreme panorama is
 *  still a sliver you can see rather than a hairline. */
const MIN_THUMB_SIDE = 10;

/** The narrowest a mark is allowed to come out, in device pixels. */
const MIN_MARK_PX = 1.5;

type Props = {
  /** The page the layer belongs to — for its size and nothing else. */
  drawing: Drawing;
  /** The marks on this layer, in the order they were drawn. */
  strokes: readonly Stroke[];
  /** The sheet colour and the ink an unpicked mark resolves to, exactly as the
   *  canvas resolved them — so the preview is the page, not a guess at it. */
  pageColor: string;
  defaultInk: string;
};

/** The sheet's size in CSS pixels, fitted inside the square cell. */
export function thumbnailSize(drawing: Drawing): {
  width: number;
  height: number;
} {
  const aspect = drawing.width / drawing.height;
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return { width: THUMB_BOX, height: THUMB_BOX };
  }
  const fit = (side: number) =>
    Math.round(Math.max(MIN_THUMB_SIDE, Math.min(THUMB_BOX, side)));
  return aspect >= 1
    ? { width: THUMB_BOX, height: fit(THUMB_BOX / aspect) }
    : { width: fit(THUMB_BOX * aspect), height: THUMB_BOX };
}

export function LayerThumbnail({
  drawing,
  strokes,
  pageColor,
  defaultInk,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = thumbnailSize(drawing);
  // A bitmap decodes after the paint that first asked for it, so a dropped
  // picture would sit missing from its preview until something else repainted
  // — the same problem the canvas has, answered the same way.
  const [decodedAt, setDecodedAt] = useState(0);
  useEffect(() => onImageDecoded(() => setDecodedAt((n) => n + 1)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = canvas.width / drawing.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // `paintStrokes` reads the detail off this transform, so the textured
    // painters drop the bristles and specks that would land inside one pixel
    // here without being asked to.
    paintStrokes(ctx, legible(strokes, scale), { pageColor, defaultInk });

    // Then the sheet, *under* the marks — the order the canvas paints in, so a
    // layer whose marks include a rubbing out previews with the page showing
    // through the hole rather than with the hole punched through the page (see
    // `render.ts`). Opaque rather than left transparent, because a preview of
    // white marks on nothing is nothing.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = pageColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }, [
    drawing.width,
    drawing.height,
    strokes,
    pageColor,
    defaultInk,
    width,
    height,
    decodedAt,
  ]);

  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: `${THUMB_BOX}px`, height: `${THUMB_BOX}px` }}
    >
      <canvas
        ref={canvasRef}
        // Decorative: the row is named by its layer, and the marks it holds are
        // read out beside it. A screen reader gains nothing from the picture.
        aria-hidden="true"
        style={{ width: `${width}px`, height: `${height}px` }}
        className="rounded-xs border border-line"
      />
    </span>
  );
}

/** The marks, with anything too thin to survive the shrink widened to a pixel.
 *
 *  Only `size` is touched, and only on the strokes that need it: a fill, a
 *  region, and a dropped image are painted rather than stroked, so they are
 *  already as visible as they will ever be and pass through untouched. The
 *  originals are never mutated — the document has no idea this happened. */
function legible(strokes: readonly Stroke[], scale: number): Stroke[] {
  const floor = MIN_MARK_PX / scale;
  return strokes.map((stroke) =>
    stroke.size >= floor ? stroke : { ...stroke, size: floor },
  );
}
