// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where a dropped image lands, and how it is nudged and stretched before it is
// settled.
//
// A drop doesn't commit anything: the image floats over the page as a
// *placement* — a box you can drag and resize — until you click away from it or
// press Enter, and only then does it become a stroke. All the arithmetic behind
// that lives here, pure and DOM-free, so the whole interaction can be driven in
// a test (`tests/placement_test.ts`); `ImagePlacement.tsx` owns the pointers and
// the frame.
//
// Two rules shape the numbers below:
//
//   - the origin is fixed. The box is clamped to x/y ≥ 0, and the page grows on
//     the right and the bottom to contain it (see `pageFitting`). Growing to the
//     left would mean shifting every mark already on the page.
//   - the aspect ratio is kept. A corner drag scales the image; it never
//     squashes it, which is almost never what someone dragging a photo meant.

import { pageFitting, type Box } from "./bounds.ts";
import type { Point } from "./types.ts";

/** The corner a resize drag is holding. */
export type Corner = "nw" | "ne" | "se" | "sw";

export const CORNERS: readonly Corner[] = ["nw", "ne", "se", "sw"];

/** An image floating over the page, not yet part of the document. */
export type Placement = {
  /** The bitmap, as the data URL the stroke will carry. */
  src: string;
  /** Where it sits, in document pixels. */
  box: Box;
  /** Width ÷ height of the source bitmap — what a corner drag preserves. */
  aspect: number;
};

/** The smallest a placement may be scaled to, in document pixels — small
 *  enough to be a stamp, big enough to still have grabbable corners. */
export const MIN_PLACEMENT = 24;

/** Where an imported image lands when it is dropped.
 *
 *  An image that outgrows the page in either direction is placed at the origin
 *  at its full size: settling it grows the page to fit, so the picture becomes
 *  the whole sheet. Anything smaller is centred on whatever part of the page you
 *  were looking at — you dropped it where you were working — and nudged back
 *  inside the sheet rather than half off it. */
export function initialPlacement(
  image: { src: string; width: number; height: number },
  page: { width: number; height: number },
  viewCenter: Point | null,
): Placement {
  const aspect = image.width / Math.max(1, image.height);
  const outgrows = image.width >= page.width || image.height >= page.height;
  if (outgrows) {
    return {
      src: image.src,
      aspect,
      box: { x: 0, y: 0, width: image.width, height: image.height },
    };
  }
  const center = viewCenter ?? { x: page.width / 2, y: page.height / 2 };
  const x = center.x - image.width / 2;
  const y = center.y - image.height / 2;
  return {
    src: image.src,
    aspect,
    box: {
      x: Math.max(0, Math.min(x, page.width - image.width)),
      y: Math.max(0, Math.min(y, page.height - image.height)),
      width: image.width,
      height: image.height,
    },
  };
}

/** Shift a placement by a document-space delta, keeping its origin on the
 *  page. It may hang off the right and the bottom — that is what grows the
 *  sheet when it settles. */
export function movePlacement(box: Box, dx: number, dy: number): Box {
  return {
    ...box,
    x: Math.max(0, box.x + dx),
    y: Math.max(0, box.y + dy),
  };
}

/** The corner a drag pivots around — the one diagonally opposite the handle. */
function anchorOf(box: Box, corner: Corner): Point {
  const anchorOnRight = corner === "nw" || corner === "sw";
  const anchorOnBottom = corner === "nw" || corner === "ne";
  return {
    x: anchorOnRight ? box.x + box.width : box.x,
    y: anchorOnBottom ? box.y + box.height : box.y,
  };
}

/** Resize a placement by dragging `corner` to `pointer`, keeping the aspect
 *  ratio and the opposite corner pinned. */
export function resizePlacement(
  box: Box,
  corner: Corner,
  pointer: Point,
  aspect: number,
  min = MIN_PLACEMENT,
): Box {
  const anchor = anchorOf(box, corner);
  const px = Math.max(0, pointer.x);
  const py = Math.max(0, pointer.y);
  const ratio = aspect > 0 ? aspect : 1;

  let width = Math.abs(px - anchor.x);
  let height = Math.abs(py - anchor.y);
  // Follow whichever axis the pointer pulled furthest, and derive the other —
  // so the box tracks the finger without ever changing shape.
  if (width / ratio >= height) height = width / ratio;
  else width = height * ratio;

  const holdsLeft = corner === "nw" || corner === "sw";
  const holdsTop = corner === "nw" || corner === "ne";
  // A drag towards the top-left stops at the page's edge rather than pushing
  // the box off it; the other axis follows so the shape survives the clamp.
  if (holdsTop && height > anchor.y) {
    height = anchor.y;
    width = height * ratio;
  }
  if (holdsLeft && width > anchor.x) {
    width = anchor.x;
    height = width / ratio;
  }
  if (width < min) {
    width = min;
    height = width / ratio;
  }
  if (height < min) {
    height = min;
    width = height * ratio;
  }

  return {
    x: Math.max(0, holdsLeft ? anchor.x - width : anchor.x),
    y: Math.max(0, holdsTop ? anchor.y - height : anchor.y),
    width,
    height,
  };
}

/** The page a settled placement needs: the current one, grown to contain it. */
export function pageForPlacement(
  page: { width: number; height: number },
  box: Box,
): { width: number; height: number } {
  return pageFitting(page, box);
}
