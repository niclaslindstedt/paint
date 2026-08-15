// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Turning the whole page around: mirror it, turn it a quarter, scale it, or
// change the sheet under it without touching a mark.
//
// All four are the same thing — a map from one point on the page to another —
// applied to every stroke's geometry and, where the page's shape changes, to
// the page itself. A vector document is what makes this cheap and exact: there
// is no resampling to lose, so mirroring a drawing twice returns the document it
// started as, byte for byte.
//
// Two shapes need more than their corners mapped, and both are noted where they
// are handled:
//
//   - **A caption** is not a shape that can be turned upside down and still be
//     read. Its *box* is mapped and the words stay upright — which is what every
//     drawing program does with type, and the only answer that leaves the page
//     legible.
//   - **A bitmap** has pixels of its own, so mapping its frame leaves the
//     picture inside it facing the wrong way. The bytes have to be redrawn, and
//     that needs a canvas — so this module takes the redraw as a *callback*
//     (`BitmapTurn`) and stays pure. The app hands in a DOM-backed one; a test
//     hands in nothing and gets the geometry, which is what it is testing.
//
// Pure and DOM-free on purpose: every rule below can be driven from a node test,
// and the store is left as the one place that knows about undo.

import { textBox } from "./plugins/builtin/text.ts";
import { clampCanvasSize, type CanvasSize } from "./canvasSize.ts";
import { scaleFilters } from "./filters.ts";
import type { Drawing, Point, Shape, Stroke } from "./types.ts";

/** Which way a mirror faces. `horizontal` swaps left and right (a mirror stood
 *  beside the page), `vertical` swaps top and bottom. */
export type MirrorAxis = "horizontal" | "vertical";

/** Which way a quarter turn goes. */
export type TurnDirection = "left" | "right";

/** How a bitmap is filtered when it is painted larger than it is.
 *
 *  It is a *painting* choice rather than a stored resolution — this document has
 *  no pixels of its own — so it survives a zoom: a picture scaled up with
 *  `nearest` has hard square pixels at 100% and at 800%, which is the whole
 *  point of asking for it. */
export type Sampling = "smooth" | "nearest";

/** Where the old page sits inside the new one when only the sheet is resized.
 *  Nine positions, the same grid every program that crops has used. */
export type ResizeAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export const RESIZE_ANCHORS: readonly ResizeAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/** Redraw a bitmap the way the page was just turned, handing back a new data
 *  URL — or `null` when it can't be done (no canvas, an image that hasn't
 *  finished decoding). A stroke whose bytes come back `null` keeps the ones it
 *  had: a picture facing the wrong way is a worse outcome than a picture, but
 *  losing it is worse than both. */
export type BitmapTurn = (
  src: string,
  op: { mirror?: MirrorAxis; turn?: TurnDirection },
) => string | null;

/** The edit a page transform produces — always a whole new stroke list, and the
 *  new sheet when the sheet's shape changed. Handed straight to the store's
 *  `patchActive`, so a transform is one undo step like any other edit. */
export type PageEdit = Partial<Drawing> & { strokes: Stroke[] };

/** Map every point of a shape, and the anchor of a caption with it. `size` is
 *  the stroke's width *after* the transform, which is what a caption needs to
 *  measure itself with. */
function mapShape(
  shape: Shape,
  at: (p: Point) => Point,
  size: number,
  before: Stroke,
): Shape {
  switch (shape.kind) {
    case "path":
      return { kind: "path", points: shape.points.map(at) };
    case "region":
      return {
        kind: "region",
        contours: shape.contours.map((loop) => loop.map(at)),
        // The ramp is two points on the page like any other geometry, so a page
        // turned, flipped or scaled turns, flips and scales the run of colour
        // with the area it fills.
        ...(shape.gradient
          ? {
              gradient: {
                ...shape.gradient,
                from: at(shape.gradient.from),
                to: at(shape.gradient.to),
              },
            }
          : {}),
      };
    case "segment":
    case "box":
    case "image":
      // Two opposite corners are enough for a box however it is turned: the
      // painters normalise the pair, so a corner pair that comes back swapped
      // describes the same rectangle.
      return { ...shape, from: at(shape.from), to: at(shape.to) };
    case "text": {
      // The words stay upright and the *box* moves: map all four corners of it
      // and hang the caption from whichever is now the top-left. Measured at the
      // size it had before the transform and rescaled, so a caption that was
      // half the page wide still is.
      const box = textBox(shape.text, {
        size: before.size,
        font: shape.font,
        bold: shape.bold,
        italic: shape.italic,
      });
      const corners = [
        at(shape.at),
        at({ x: shape.at.x + box.width, y: shape.at.y }),
        at({ x: shape.at.x, y: shape.at.y + box.height }),
        at({ x: shape.at.x + box.width, y: shape.at.y + box.height }),
      ];
      const turned = textBox(shape.text, {
        size,
        font: shape.font,
        bold: shape.bold,
        italic: shape.italic,
      });
      // A turned page puts the caption's box on its side; the words can't go
      // with it, so they hang from the top-left of where the box landed and run
      // the way they always did.
      const left = Math.min(...corners.map((p) => p.x));
      const top = Math.min(...corners.map((p) => p.y));
      const wide = Math.max(...corners.map((p) => p.x)) - left;
      const tall = Math.max(...corners.map((p) => p.y)) - top;
      return {
        ...shape,
        at: {
          // Centred in the box it landed in, so a caption keeps its place in the
          // picture even when the box it was measured into changed shape.
          x: left + (wide - turned.width) / 2,
          y: top + (tall - turned.height) / 2,
        },
      };
    }
  }
}

/** One stroke through a point map, with its width scaled by `scale` and its
 *  bitmap redrawn by `bitmap` where one is offered. */
function mapStroke(
  stroke: Stroke,
  at: (p: Point) => Point,
  scale: number,
  bitmap?: { turn: BitmapTurn; op: Parameters<BitmapTurn>[1] },
): Stroke {
  const size = stroke.size * scale;
  const next: Stroke = {
    ...stroke,
    size,
    shape: mapShape(stroke.shape, at, size, stroke),
  };
  if (bitmap && next.shape.kind === "image" && next.shape.src) {
    const src = bitmap.turn(next.shape.src, bitmap.op);
    if (src) next.shape = { ...next.shape, src };
  }
  return next;
}

/** Mirror the page. The sheet keeps its size; every mark crosses it. */
export function mirrorDrawing(
  drawing: Drawing,
  axis: MirrorAxis,
  bitmap?: BitmapTurn,
): PageEdit {
  const at =
    axis === "horizontal"
      ? (p: Point) => ({ x: drawing.width - p.x, y: p.y })
      : (p: Point) => ({ x: p.x, y: drawing.height - p.y });
  return {
    strokes: drawing.strokes.map((stroke) =>
      mapStroke(
        stroke,
        at,
        1,
        bitmap ? { turn: bitmap, op: { mirror: axis } } : undefined,
      ),
    ),
  };
}

/** Turn the page a quarter. The sheet's sides swap with it — a landscape page
 *  turned is a portrait one — which is the difference between turning the paper
 *  and turning what is drawn on it. */
export function turnDrawing(
  drawing: Drawing,
  direction: TurnDirection,
  bitmap?: BitmapTurn,
): PageEdit {
  const at =
    direction === "right"
      ? (p: Point) => ({ x: drawing.height - p.y, y: p.x })
      : (p: Point) => ({ x: p.y, y: drawing.width - p.x });
  return {
    width: drawing.height,
    height: drawing.width,
    strokes: drawing.strokes.map((stroke) =>
      mapStroke(
        stroke,
        at,
        1,
        bitmap ? { turn: bitmap, op: { turn: direction } } : undefined,
      ),
    ),
  };
}

/** Scale the whole drawing to a new page size: every mark, and every nib, grows
 *  or shrinks with the sheet.
 *
 *  `sampling` rides onto the bitmaps rather than resampling them — see
 *  `Sampling`. A page with no pictures on it is unaffected by the choice, which
 *  is why the modal offers it as a detail rather than as a question. */
export function scaleDrawing(
  drawing: Drawing,
  to: CanvasSize,
  sampling: Sampling = "smooth",
): PageEdit {
  const sx = to.width / drawing.width;
  const sy = to.height / drawing.height;
  const at = (p: Point) => ({ x: p.x * sx, y: p.y * sy });
  // A round nib has no answer for a page stretched more one way than the other,
  // so it takes the average of the two — the mark stays in proportion with the
  // drawing at every size that keeps its shape, which is nearly all of them.
  const scale = (sx + sy) / 2;
  return {
    width: to.width,
    height: to.height,
    // A filter set in document pixels — a blur's radius — is a distance on the
    // page exactly as a nib width is, so it grows with the sheet. Leaving it
    // alone would hand back a drawing scaled up and noticeably sharper. The
    // stack's own filters go the same way, or a scaled page would come back
    // with its layers softened by a different amount than the page they are on.
    ...(drawing.filters
      ? { filters: scaleFilters(drawing.filters, scale) }
      : {}),
    ...(drawing.layers
      ? {
          layers: drawing.layers.map((layer) =>
            layer.filters
              ? { ...layer, filters: scaleFilters(layer.filters, scale) }
              : layer,
          ),
        }
      : {}),
    strokes: drawing.strokes.map((stroke) => {
      const next = mapStroke(stroke, at, scale);
      if (next.shape.kind !== "image") return next;
      const shape = { ...next.shape };
      if (sampling === "nearest") shape.smoothing = "nearest";
      else delete shape.smoothing;
      return { ...next, shape };
    }),
  };
}

/** Where the old page's top-left corner lands inside a new sheet of `to`, given
 *  the corner (or edge, or middle) the two are lined up by. */
export function anchorOffset(
  from: CanvasSize,
  to: CanvasSize,
  anchor: ResizeAnchor,
): Point {
  const dx = to.width - from.width;
  const dy = to.height - from.height;
  const x = anchor.includes("left")
    ? 0
    : anchor.includes("right")
      ? dx
      : dx / 2;
  const y = anchor.startsWith("top")
    ? 0
    : anchor.startsWith("bottom")
      ? dy
      : dy / 2;
  return { x, y };
}

/** Resize the *sheet* and nothing else: the marks keep their size and their
 *  spacing, and the page grows or is cropped around them.
 *
 *  Cropping is this with a smaller sheet — a mark that ends up off the page is
 *  kept in the document rather than deleted, so undo isn't the only way back and
 *  growing the page again brings it into view. Nothing off the sheet is painted
 *  or exported, which is what makes it a crop. */
export function resizeCanvas(
  drawing: Drawing,
  to: CanvasSize,
  anchor: ResizeAnchor,
): PageEdit {
  const shift = anchorOffset(drawing, to, anchor);
  const at = (p: Point) => ({ x: p.x + shift.x, y: p.y + shift.y });
  return {
    width: to.width,
    height: to.height,
    strokes:
      shift.x === 0 && shift.y === 0
        ? drawing.strokes
        : drawing.strokes.map((stroke) => mapStroke(stroke, at, 1)),
  };
}

/** The size a page becomes when one side is typed and the proportions are
 *  kept — the other side follows. Rounded to whole pixels, because a page is
 *  measured in them. */
export function keepProportions(
  from: CanvasSize,
  side: "width" | "height",
  value: number,
): CanvasSize {
  if (from.width <= 0 || from.height <= 0) return { ...from };
  return side === "width"
    ? { width: value, height: Math.round((value * from.height) / from.width) }
    : { width: Math.round((value * from.width) / from.height), height: value };
}

// --- Pulling a corner --------------------------------------------------------
//
// The resize dialog draws the new page over the old one, and the new page can
// be *dragged* by its corners — the gesture every crop tool has, rather than
// two numbers you have to picture. The arithmetic is here, with the rest of the
// page maths, because it is exactly that: arithmetic over two sizes, and it is
// the part worth a test. The dialog owns the pointer.

/** The four corners the new page can be pulled by. */
export type ResizeCorner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const RESIZE_CORNERS: readonly ResizeCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/** The corner a drag holds still: the one opposite the one in your hand.
 *
 *  That is what makes it feel like a crop rather than a stretch — pull the
 *  bottom-right and the top-left of the drawing stays where it is. In canvas
 *  mode the dialog writes this straight into the anchor, so the picture and the
 *  edit agree without anyone having to set both. */
export function cornerAnchor(corner: ResizeCorner): ResizeAnchor {
  const top = corner.startsWith("top");
  const left = corner.endsWith("left");
  return `${top ? "bottom" : "top"}-${left ? "right" : "left"}` as ResizeAnchor;
}

/** The size a corner drag lands on: `start` with the pulled corner moved by
 *  `delta` document pixels, the opposite corner staying put.
 *
 *  With `keepRatio` the page holds the proportions it had when the drag began,
 *  and the axis that moved *further, in proportion* is the one that leads — so
 *  a mostly-sideways pull reads as a sideways pull rather than fighting the
 *  vertical wobble in it.
 *
 *  Sides are rounded and clamped to the supported range, so a drag can be as
 *  wild as it likes and still hand back a page. */
export function dragCorner(
  start: CanvasSize,
  corner: ResizeCorner,
  delta: Point,
  options: { keepRatio?: boolean } = {},
): CanvasSize {
  const dx = corner.endsWith("left") ? -delta.x : delta.x;
  const dy = corner.startsWith("top") ? -delta.y : delta.y;
  let width = start.width + dx;
  let height = start.height + dy;

  if (options.keepRatio && start.width > 0 && start.height > 0) {
    const sw = width / start.width;
    const sh = height / start.height;
    const scale = Math.abs(sw - 1) >= Math.abs(sh - 1) ? sw : sh;
    width = start.width * scale;
    height = start.height * scale;
  }

  return clampCanvasSize({ width, height });
}
