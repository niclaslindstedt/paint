// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dials the shipped tools offer, past the width they all share.
//
// The mechanism is in `plugins/dials.ts`; this is the *set*, kept beside the
// registrations that hand them out. Two rules hold it together:
//
//   - **A dial is a fraction of the tool's own normal.** 1 is always "the way
//     this tool draws", so every one of them reads out as a percentage and an
//     untouched dial is simply absent from the mark (see `plugins/dials.ts`).
//   - **A tool gets two at most.** The size panel is opened mid-drawing, with
//     one thumb, over the page you are working on. Everything a tool *could*
//     expose is not what belongs there — these are the two knobs that change
//     what the mark is, and the rest of the medium stays the medium.
//
// Each one is wired to something a painter actually does. A slider that scales
// a number nobody can see is worse than no slider.

import type { ToolDial } from "../types.ts";

/** How much of the page shows through. The one dial nearly every marking tool
 *  offers, because it is the one thing every mark has: it lands on
 *  `Stroke.opacity`, multiplied into whatever the tool's own ink already was,
 *  so a highlighter turned down to a third is a third of a highlighter. */
export const OPACITY: ToolDial = {
  id: "opacity",
  nameKey: "dials.opacity.name",
  hintKey: "dials.opacity.hint",
  min: 0.1,
  max: 1,
  step: 0.05,
};

/** Edge crispness — the dial that used to live in the open under the width, and
 *  the reason this whole seam exists: it was only ever right for two tools, and
 *  it meant something different to each of them. Soft is a splayed dry head on
 *  the paintbrush and a wide fading cone on the airbrush; hard is a loaded head
 *  and a tight core. */
export const HARDNESS: ToolDial = {
  id: "hardness",
  nameKey: "dials.hardness.name",
  hintKey: "dials.hardness.hint",
  min: 0,
  max: 1,
  step: 0.05,
};

/** The gauge of the paintbrush's hair. The head is milled from filament of a
 *  fixed thickness (see `bristle.ts`), and this is which rack you took the
 *  brush off: fine sable leaves many thin partings, coarse hog leaves few broad
 *  ones. It changes the streaks, never the width. */
export const HAIR: ToolDial = {
  id: "hair",
  nameKey: "dials.hair.name",
  hintKey: "dials.hair.hint",
  min: 0.5,
  max: 2,
  step: 0.05,
};

/** How much paint the airbrush lets through per pass. Coverage there is built
 *  from overlap rather than from one opaque dab, so this is the trigger: low
 *  builds up over many passes, high covers in one. */
export const FLOW: ToolDial = {
  id: "flow",
  nameKey: "dials.flow.name",
  hintKey: "dials.flow.hint",
  min: 0.4,
  max: 2.5,
  step: 0.05,
};

/** How hard the crayon is bearing down. Wax only sticks to the peaks it is
 *  pressed onto, so a light hand leaves the paper's speckle showing through and
 *  a heavy one fills the valleys in until the mark is solid. */
export const PRESSURE: ToolDial = {
  id: "pressure",
  nameKey: "dials.pressure.name",
  hintKey: "dials.pressure.hint",
  min: 0.5,
  max: 1.5,
  step: 0.05,
};

/** How far the paint bucket's edge fades out past the outline it traced, in
 *  document pixels.
 *
 *  The one dial that measures the *page* rather than a fraction of a tool, and
 *  the one whose rest is nothing: a bucket fills to a hard edge unless you ask
 *  it not to. It is what turns the tool from a flat-colour bucket into a way of
 *  laying a soft wash behind a sketch — and it stays a vector fill, so the fade
 *  survives a zoom to eight hundred percent. */
export const FEATHER: ToolDial = {
  id: "feather",
  nameKey: "dials.feather.name",
  hintKey: "dials.feather.hint",
  min: 0,
  max: 40,
  step: 1,
  default: 0,
  unit: "px",
};
