// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the toolbar offers for the tool in your hand, past the ink.
//
// There is one button beside the colour, and what it is depends on the tool
// holding it — but *not* on which tool that is. Every answer here is read off
// the descriptor, so a tool this module has never heard of gets the right
// button the day it registers:
//
//   - **A width, previewed as a press** — the pencil, the brushes, the shapes,
//     the type tool. The button is the mark that width leaves, and pressing it
//     opens the widths plus whatever else the tool tunes.
//   - **A width, previewed as a circle** — a tool whose mark can't describe
//     itself (`sizePreview: "circle"`). The eraser: its press is a hole, and a
//     hole shows nothing on a bare page.
//   - **A cog** — a tool with no width but settings of its own (`sizeless`).
//     The paint bucket fills the area it traced whatever the nib says, so
//     offering it a nib was offering it a slider that moved nothing; its wash
//     and its feathered edge are what it actually has, and the cog is where
//     they live.
//   - **Nothing at all** — a tool with neither. The hand moves the view, the
//     dropper reads a colour, the marquee chooses marks: a button that opened
//     an empty panel is worse than no button, so there isn't one.
//
// The old answer to the last two was a dimmed size button that still opened a
// panel of widths, and dimming is a promise that the control works *sometimes*.
// For these tools there is no sometimes.

import type { PaintPlugin } from "./types.ts";

/** Whether a width means anything to this tool's mark.
 *
 *  Two ways to have no width: say so (`sizeless`, for a tool that marks the
 *  page but not by the nib), or leave no mark at all — and the second is
 *  already on the descriptor, so the tools that navigate, sample or select
 *  need declare nothing. */
export function usesSize(plugin: PaintPlugin | undefined): boolean {
  if (!plugin) return false;
  if (plugin.sizeless) return false;
  return !(plugin.navigates || plugin.picksColor || plugin.selects);
}

/** Whether the colour in the toolbar means anything with this tool in hand.
 *
 *  Three ways to have no use for it, and all three are already on the
 *  descriptor: lift ink instead of laying it (`erases`), move the view
 *  (`navigates`), or choose marks (`selects`). The toolbar dims the swatch for
 *  those, which is the honest thing to say about a control that changes nothing
 *  until you pick up something that paints.
 *
 *  **A colour-sampling tool is the exception, and it is the interesting one.**
 *  The dropper never paints with the ink either — but it is the tool that
 *  *sets* it, so while it is in your hand the swatch is not an unreachable
 *  control: it is the read-out, the one place the colour you just picked is
 *  shown. Dimming it made every sampled colour look like a darker, weaker
 *  version of itself, which reads as the dropper having missed the colour it
 *  was aimed at. */
export function usesInk(plugin: PaintPlugin | undefined): boolean {
  if (!plugin) return true;
  if (plugin.picksColor) return true;
  return !(plugin.erases || plugin.navigates || plugin.selects);
}

/** How this tool's width is drawn — the mark it leaves, or a plain disc. See
 *  `PaintPlugin.sizePreview`. */
export function sizePreview(
  plugin: PaintPlugin | undefined,
): "press" | "circle" {
  return plugin?.sizePreview ?? "press";
}

/** Whether this tool has anything to tune past its width. */
export function hasDials(plugin: PaintPlugin | undefined): boolean {
  return (plugin?.dials?.length ?? 0) > 0;
}

/** Which button the toolbar puts beside the ink for this tool.
 *
 *  `"size"` — the width (and, under it, the tool's own dials).
 *  `"dials"` — a cog holding just those dials, for a tool with no width.
 *  `"none"` — neither; the slot stays empty. */
export type ToolControl = "size" | "dials" | "none";

export function toolControl(plugin: PaintPlugin | undefined): ToolControl {
  if (usesSize(plugin)) return "size";
  return hasDials(plugin) ? "dials" : "none";
}
