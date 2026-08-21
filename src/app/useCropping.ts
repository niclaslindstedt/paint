// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useState } from "react";

import type { Box } from "./bounds.ts";
import type { CanvasSize } from "./canvasSize.ts";
import {
  cropRatio,
  cropsAnything,
  fitCropToRatio,
  initialCrop,
  roundCrop,
  DEFAULT_CUSTOM_RATIO,
  type CropRatioId,
  type CustomRatio,
} from "./crop.ts";
import type { Drawing } from "./types.ts";

// A crop, while it is being aimed.
//
// The rectangle over the page and the shape it is locked to are one piece of
// state with one rule tying them together — **change the shape and the rectangle
// you have already aimed is refitted rather than thrown away** — and that rule
// has to hold wherever the change came from: the dropdown, the two custom
// fields, or the crop opening in the first place. Written out in the screen it
// was the same three lines three times, in a component that is already about a
// dozen other things; here it is one place, and the screen is handed a control
// with a verb per thing you can do to a crop.
//
// It is screen state throughout, like the placement frame and the caption box:
// nothing reaches the document, and nothing costs an undo step, until Apply. The
// edit itself is not this hook's — it hands the box out and the screen routes it
// through the store with the rest of the page transforms, because a crop changes
// the page's shape and the *view* has to be told (see `CanvasScreen`).

export type CroppingControl = {
  /** The rectangle, in document pixels, or `null` when no crop is being
   *  aimed. */
  box: Box | null;
  ratio: CropRatioId;
  custom: CustomRatio;
  /** The shape the box is locked to as a number — width ÷ height — or `null`
   *  for a box that may be dragged into any shape at all. */
  shape: number | null;
  /** The crop as whole pixels: what the page would become. */
  size: CanvasSize;
  /** Whether applying it would take anything off the page. */
  crops: boolean;
  /** Put the rectangle up over the page. */
  start: () => void;
  setBox: (box: Box) => void;
  setRatio: (id: CropRatioId) => void;
  setCustom: (custom: CustomRatio) => void;
  /** Take the crop: hands the box to `onCrop` and puts the rectangle away. */
  apply: () => void;
  /** Leave the page as it was. */
  close: () => void;
};

export function useCropping(
  drawing: Drawing | null,
  onCrop: (box: Box) => void,
): CroppingControl {
  // What the *drag* has said, before any shape is applied to it. The rectangle
  // on screen is derived from this and the shape below, rather than stored:
  // that is what makes changing your mind free. Typing a custom ratio one digit
  // at a time is the case that proves it — "2", then "21", then "21" and "9" is
  // three shapes in three keystrokes, and a box refitted inside the last
  // refitted box each time would ratchet itself down to a stamp before you had
  // finished typing. Derived, every one of those keystrokes is measured from the
  // same rectangle you aimed, and the last one is the only one that counts.
  const [aimed, setAimed] = useState<Box | null>(null);
  // The shape outlives one crop — someone cropping a set of pictures to 16:9 is
  // cropping *all* of them to 16:9 — while the rectangle does not.
  const [ratio, setRatio] = useState<CropRatioId>("keep");
  const [custom, setCustom] = useState<CustomRatio>(DEFAULT_CUSTOM_RATIO);

  const page: CanvasSize = drawing
    ? { width: drawing.width, height: drawing.height }
    : { width: 0, height: 0 };
  const shape = drawing ? cropRatio(ratio, page, custom) : null;
  const box =
    aimed && drawing
      ? shape === null
        ? aimed
        : fitCropToRatio(aimed, shape, page)
      : null;

  // A crop belongs to the page it was opened over. Opening another drawing with
  // one still up drops it, exactly as it drops a floating picture: applying it
  // there would cut a page it was never aimed at.
  const openPage = drawing?.id;
  useEffect(() => setAimed(null), [openPage]);

  const start = useCallback(() => {
    if (!drawing) return;
    // The whole sheet, and the shape in hand does the rest: a crop opens on the
    // largest rectangle of that shape the page can hold, centred (see
    // `initialCrop`, which is this same derivation written out).
    setAimed(
      initialCrop({ width: drawing.width, height: drawing.height }, null),
    );
  }, [drawing]);

  const close = useCallback(() => setAimed(null), []);

  // Not hand-memoised: it closes over the *derived* rectangle, and the compiler
  // does a better job of that than a dependency list can (see the React
  // Compiler's `preserve-manual-memoization`).
  const apply = () => {
    if (box && drawing) {
      const sheet = { width: drawing.width, height: drawing.height };
      const rounded = roundCrop(box, sheet);
      // A rectangle that is still the whole sheet is an Apply that would cost an
      // undo step and change nothing. The button is dim for it; a keyboard
      // Enter can still ask, and this is what answers.
      if (cropsAnything(rounded, sheet)) onCrop(rounded);
    }
    setAimed(null);
  };

  return {
    box,
    ratio,
    custom,
    shape,
    size: box ? roundCrop(box, page) : page,
    crops: box !== null && cropsAnything(box, page),
    start,
    setBox: setAimed,
    setRatio,
    setCustom,
    apply,
    close,
  };
}
