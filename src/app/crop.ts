// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Cutting the page down to a rectangle you drew on it.
//
// A crop is the sheet resize you can *aim*. The Resize dialog already changes
// the sheet without touching a mark — nine anchors and two numbers — and that is
// enough to take an even strip off one edge, but it is not how anyone crops a
// picture: you look at the picture, you put a rectangle over the part of it you
// meant, and you pull the rectangle about until it is right. So the rectangle
// lives on the canvas over the drawing (`CropFrame.tsx`), the one question a
// rectangle can't answer for itself — what *shape* it is allowed to be — is
// asked in a small card beside it (`CropModal.tsx`), and everything either of
// them has to work out is here.
//
// Pure and DOM-free like the rest of the page arithmetic, so a whole drag can be
// driven from a node test (`tests/crop_test.ts`) without a canvas under it.
//
// Three rules shape every number below:
//
//   - **the box stays on the page.** You are choosing part of a sheet that
//     exists; a crop that hangs off it would be a resize with extra steps, and
//     that is the dialog next door.
//   - **the corner opposite your hand holds still.** Pull the bottom-right and
//     the top-left stays where it is — the gesture every crop tool has had since
//     the first one, and the same rule `dragCorner` follows in the resize
//     dialog's preview.
//   - **a locked ratio wins.** When a shape has been asked for, the drag decides
//     how *big* the box is and the ratio decides what shape it is; the axis you
//     pulled furthest is the one that leads, so a mostly-sideways drag reads as
//     a sideways drag rather than fighting the wobble in it.

import type { Box } from "./bounds.ts";
import { MIN_CANVAS_SIDE, type CanvasSize } from "./canvasSize.ts";
import type { Point } from "./types.ts";

/** The eight grips on the frame: four corners and four edges. Photoshop's set,
 *  and the one every hand already knows. */
export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const CROP_HANDLES: readonly CropHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** The shapes the dropdown offers.
 *
 *  `keep` is the page's own ratio — crop in, keep the proportions the drawing
 *  already has — and `free` is no shape at all. The rest are the ratios people
 *  actually name out loud, plus `custom`, which is two numbers you type.
 *
 *  These ids are *not* persisted anywhere: the choice lives for as long as the
 *  crop does. Renaming one costs nothing. */
export type CropRatioId =
  "keep" | "free" | "1:1" | "4:3" | "3:2" | "16:9" | "9:16" | "custom";

/** The named ratios, as the sides they are quoted by. */
export const CROP_RATIOS: readonly { id: CropRatioId; w: number; h: number }[] =
  [
    { id: "1:1", w: 1, h: 1 },
    { id: "4:3", w: 4, h: 3 },
    { id: "3:2", w: 3, h: 2 },
    { id: "16:9", w: 16, h: 9 },
    { id: "9:16", w: 9, h: 16 },
  ];

/** The order the dropdown lists them in: keep it, or change it. */
export const CROP_RATIO_ORDER: readonly CropRatioId[] = [
  "keep",
  "free",
  ...CROP_RATIOS.map((r) => r.id),
  "custom",
];

/** A ratio the user typed rather than picked. */
export type CustomRatio = { w: number; h: number };

export const DEFAULT_CUSTOM_RATIO: CustomRatio = { w: 3, h: 2 };

/** The smallest crop worth taking. The same floor a page has, because that is
 *  exactly what the box becomes. */
export const MIN_CROP = MIN_CANVAS_SIDE;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** What a choice from the dropdown means as a number — width ÷ height — or
 *  `null` for a box that may be any shape at all.
 *
 *  A custom ratio with a nonsense side in it (zero, a half-typed minus) is
 *  `null` too: an unconstrained drag is a better answer to "3 : " than a box
 *  that has collapsed to a line. */
export function cropRatio(
  id: CropRatioId,
  page: CanvasSize,
  custom: CustomRatio = DEFAULT_CUSTOM_RATIO,
): number | null {
  if (id === "free") return null;
  if (id === "keep") {
    return page.width > 0 && page.height > 0 ? page.width / page.height : null;
  }
  if (id === "custom") {
    return custom.w > 0 && custom.h > 0 ? custom.w / custom.h : null;
  }
  const preset = CROP_RATIOS.find((r) => r.id === id);
  return preset ? preset.w / preset.h : null;
}

/** A pair of sides as the ratio people would write down: 1920 × 1080 is 16:9.
 *
 *  Whole numbers only, and a pair that reduces to nothing sensible is handed
 *  back as it came — the label is a courtesy, not a contract. */
export function simplifyRatio(width: number, height: number): CustomRatio {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return { w: 1, h: 1 };
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const by = gcd(w, h) || 1;
  return { w: w / by, h: h / by };
}

/** Which axis a handle lets the pointer decide. A side grip moves one edge, so
 *  only that axis is being pulled and the other has to be *derived* from it — or
 *  dragging the right edge inwards with a ratio on would shrink nothing, the
 *  untouched height having voted for the width it already had. */
function leadOf(handle: CropHandle): "width" | "height" | "larger" {
  if (handle === "e" || handle === "w") return "width";
  if (handle === "n" || handle === "s") return "height";
  return "larger";
}

/** The size a ratio-locked box takes when a drag asks for `width × height`:
 *  the shape is kept, the leading axis decides how big, the floor and the sheet
 *  are the two limits. */
function ratioSize(
  width: number,
  height: number,
  ratio: number,
  page: CanvasSize,
  lead: "width" | "height" | "larger",
): { width: number; height: number } {
  let w =
    lead === "width"
      ? width
      : lead === "height"
        ? height * ratio
        : Math.max(width, height * ratio);
  // Neither side may go under the floor — expressed as one number, because with
  // the shape fixed a minimum height *is* a minimum width.
  w = Math.max(w, MIN_CROP, MIN_CROP * ratio);
  let h = w / ratio;
  // …and neither may outgrow the sheet. Shrinking both by one factor is what
  // keeps the shape through the clamp.
  const shrink = Math.min(1, page.width / w, page.height / h);
  w *= shrink;
  h = w / ratio;
  return { width: w, height: h };
}

/** Slide a box back onto the page without changing its size. */
function ontoPage(box: Box, page: CanvasSize): Box {
  return {
    x: clamp(box.x, 0, page.width - box.width),
    y: clamp(box.y, 0, page.height - box.height),
    width: box.width,
    height: box.height,
  };
}

/** The box a crop opens on: the whole page when nothing constrains it, and
 *  otherwise the largest rectangle of that shape centred on the sheet.
 *
 *  Opening on the whole page rather than on some polite inset matters — the
 *  first thing you see is the picture you have, uncovered, and every drag from
 *  there takes something away. An inset would have you dragging *outwards* to
 *  get back what was never being cropped. */
export function initialCrop(page: CanvasSize, ratio: number | null): Box {
  if (ratio === null) {
    return { x: 0, y: 0, width: page.width, height: page.height };
  }
  const size = ratioSize(page.width, page.height, ratio, page, "larger");
  return {
    x: (page.width - size.width) / 2,
    y: (page.height - size.height) / 2,
    ...size,
  };
}

/** The box a *changed* ratio leaves you with: the biggest one of the new shape
 *  that fits inside the one you had, on the same middle.
 *
 *  Inside rather than around it, so picking a shape can never hand back more of
 *  the picture than the box you were looking at — a crop only ever takes away,
 *  and a dropdown that grew the rectangle back over the part you had just
 *  excluded would read as undoing your drag. */
export function fitCropToRatio(
  box: Box,
  ratio: number | null,
  page: CanvasSize,
): Box {
  if (ratio === null) return box;
  const size = ratioSize(
    Math.min(box.width, box.height * ratio),
    box.height,
    ratio,
    page,
    "width",
  );
  return ontoPage(
    {
      x: box.x + (box.width - size.width) / 2,
      y: box.y + (box.height - size.height) / 2,
      ...size,
    },
    page,
  );
}

/** Slide the whole box by a document-space delta, keeping it on the sheet. */
export function moveCrop(box: Box, delta: Point, page: CanvasSize): Box {
  return ontoPage({ ...box, x: box.x + delta.x, y: box.y + delta.y }, page);
}

/** The box a grip drag lands on: `start` with the edges that handle owns moved
 *  by `delta` document pixels, everything else holding still.
 *
 *  Measured from the box the drag *began* on rather than accumulated frame by
 *  frame, so a drag is exact, reversible, and never drifts under a ratio that
 *  keeps rounding it. */
export function dragCrop(
  start: Box,
  handle: CropHandle,
  delta: Point,
  page: CanvasSize,
  ratio: number | null,
): Box {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  // Each moving edge follows the pointer, stopping at the sheet on one side and
  // at the floor's worth of room on the other.
  const left_ = west ? clamp(start.x + delta.x, 0, right - MIN_CROP) : start.x;
  const right_ = east
    ? clamp(right + delta.x, start.x + MIN_CROP, page.width)
    : right;
  const top_ = north ? clamp(start.y + delta.y, 0, bottom - MIN_CROP) : start.y;
  const bottom_ = south
    ? clamp(bottom + delta.y, start.y + MIN_CROP, page.height)
    : bottom;

  const pulled: Box = {
    x: left_,
    y: top_,
    width: right_ - left_,
    height: bottom_ - top_,
  };
  if (ratio === null) return pulled;

  const size = ratioSize(
    pulled.width,
    pulled.height,
    ratio,
    page,
    leadOf(handle),
  );
  // What holds still: the edge opposite the one in your hand, and — on an axis
  // this handle doesn't touch — the middle, so a side grip opens the box evenly
  // rather than dragging it sideways.
  const anchorX = west ? right : east ? start.x : start.x + start.width / 2;
  const anchorY = north ? bottom : south ? start.y : start.y + start.height / 2;
  return ontoPage(
    {
      x: west
        ? anchorX - size.width
        : east
          ? anchorX
          : anchorX - size.width / 2,
      y: north
        ? anchorY - size.height
        : south
          ? anchorY
          : anchorY - size.height / 2,
      ...size,
    },
    page,
  );
}

/** The box as whole pixels — what the readout says and what the edit uses. A
 *  page is measured in pixels, so a crop that lands on a fraction of one is
 *  rounded before anyone is shown a number they can't have. */
export function roundCrop(box: Box, page: CanvasSize): Box {
  const x = clamp(Math.round(box.x), 0, Math.max(0, page.width - MIN_CROP));
  const y = clamp(Math.round(box.y), 0, Math.max(0, page.height - MIN_CROP));
  return {
    x,
    y,
    width: clamp(Math.round(box.width), MIN_CROP, page.width - x),
    height: clamp(Math.round(box.height), MIN_CROP, page.height - y),
  };
}

/** Whether this crop would actually take anything off the page. A box that is
 *  still the whole sheet is an Apply that costs an undo step and changes
 *  nothing, so the button says so by going dim. */
export function cropsAnything(box: Box, page: CanvasSize): boolean {
  const rounded = roundCrop(box, page);
  return (
    rounded.x > 0 ||
    rounded.y > 0 ||
    rounded.width < page.width ||
    rounded.height < page.height
  );
}
