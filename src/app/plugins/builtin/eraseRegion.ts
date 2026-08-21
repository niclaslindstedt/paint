// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The feathered delete — a plugin with no button, like the dropped image.
//
// Delete through a hard-edged selection is a real edit to the marks: what the
// window holds is cut away, vector against vector, and the document afterwards
// is exactly the drawing minus what was chosen (see `eraseRegion` in
// `selection.ts`). A *feathered* delete cannot be that — a fade has no outline
// to cut along — so it is the other thing this app already knows how to do to
// pixels it wants gone: an **erasing mark**. The selection's area lands as one
// `region` stroke whose plugin declares `erases`, the renderer composites it
// `destination-out` like any eraser line, and the feather is the same softened
// skirt the paint bucket pours — running outward from the outline, so the fade
// is *in the corners and edges* of what was chosen rather than a shrinking of
// it.
//
// That buys the honest semantics of the eraser, and it costs the eraser's too:
// the mark lifts ink down to the sheet, whatever layer the ink was on, exactly
// as a wide rubber dragged over the window would. One undo step takes it back,
// like every other mark.
//
// Hidden, because no gesture draws one — it arrives from the Delete key (and
// the menu's Delete, and the rubber's tap) through a selection that carries a
// feather (see `useSelection.ts`). The stroke persists, so the id is fixed.

import type { Point } from "../../types.ts";
import { paintRegion } from "../brushes.ts";
import { strokeDial } from "../dials.ts";
import { applyInk } from "../ink.ts";
import { FULL_DETAIL, type DraftStroke, type ToolBehaviour } from "../types.ts";

/** The plugin id every feathered delete is tagged with. Persisted on the
 *  stroke, so it is fixed for good. */
export const ERASE_REGION_TOOL_ID = "erase-region";

export const eraseRegionBehaviour: ToolBehaviour = {
  // No gesture draws one: it arrives from the Delete key.
  start: () => null,
  move: (draft) => draft,
  paint: (ctx2d, stroke, detail = FULL_DETAIL) => {
    if (stroke.shape.kind !== "region") return;
    // The colour is thrown away by the compositing — `destination-out` reads
    // alpha and nothing else — but the alpha ramp of the feather is real, so
    // the ink is applied exactly as the bucket applies it.
    applyInk(ctx2d, stroke);
    paintRegion(
      ctx2d,
      stroke.shape.contours,
      strokeDial(stroke, "feather", 0),
      detail.scale,
    );
  },
};

/** The mark one feathered delete files: the selection's own contours, with the
 *  feather it was cut with riding the dials the way the bucket's does. Built
 *  here so the one place that knows what this stroke looks like is the plugin
 *  that paints it — the same arrangement the dropped image has. */
export function eraseRegionStroke(
  region: readonly (readonly Point[])[],
  feather: number,
): DraftStroke {
  return {
    tool: ERASE_REGION_TOOL_ID,
    // A fill has no nib, but a stroke carries a width and the renderer's
    // fallback painter would read it — the bucket's own note.
    size: 1,
    ...(feather > 0 ? { dials: { feather } } : {}),
    shape: {
      kind: "region",
      contours: region.map((loop) => loop.map((p) => ({ ...p }))),
    },
  };
}
