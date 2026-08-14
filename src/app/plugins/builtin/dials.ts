// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The dials the shipped tools offer, past the width they all share.
//
// The mechanism is in `plugins/dials.ts`; this is the *set*, kept beside the
// registrations that hand them out. Two rules hold it together:
//
//   - **A dial is a fraction of the tool's own normal.** 1 is always "the way
//     this tool draws", so every one of them reads out as a percentage and an
//     untouched dial is simply absent from the mark (see `plugins/dials.ts`).
//   - **A tool gets as many as its mark has axes, and no more.** The size panel
//     is opened mid-drawing, with one thumb, over the page you are working on,
//     so the bar is high: a dial has to change what the mark *is*, not restyle
//     what another dial already did. For most tools that is one or two. The
//     paintbrush is the exception and earns it — a head of hair is loaded or
//     dry, milled fine or coarse, new or worn open, on paper that wicks or
//     paper that does not, and no one of those four is any of the others.
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

/** How far the paintbrush's head has come apart with use — the *state* of the
 *  bundle, where `HAIR` is what it was milled from.
 *
 *  A brush out of its wrapper cuts a side you could rule against; one that has
 *  been washed a hundred times has a fringe on it, strays out of its lanes, and
 *  lays down a mark whose outer third is loose hair. Turned down it is the
 *  crisp flat, turned up it is the old favourite. */
export const SPLAY: ToolDial = {
  id: "splay",
  nameKey: "dials.splay.name",
  hintKey: "dials.splay.hint",
  min: 0,
  max: 2,
  step: 0.05,
};

/** How far a wet edge wicks into the sheet before it dries.
 *
 *  The one softness the brush has, and the one dial here that belongs to the
 *  *paper* rather than to the tool: bristle lays a hard edge on cartridge stock
 *  and a feathered one on blotting paper, and nothing about the head changes
 *  between them. It rests at nothing — a mark that always bled would look damp,
 *  and every drawing already made was made on paper that did not. */
export const BLEED: ToolDial = {
  id: "bleed",
  nameKey: "dials.bleed.name",
  hintKey: "dials.bleed.hint",
  min: 0,
  max: 2,
  step: 0.05,
  default: 0,
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
