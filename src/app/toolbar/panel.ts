// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the tool panels agree about their own shape.
//
// Two panels hang off the toolbar and they are the same panel with different
// halves of it showing: the width panel the size button opens (`SizePicker`),
// and the dials panel the cog beside the ink opens for a tool that has no width
// (`DialPicker`). They share the section order, the chip rows and the sliders,
// so they share the one number that says how big the thing may get.

/** How tall a tool panel is allowed to get before it starts scrolling.
 *
 *  The panel grows with the tool: a pencil is a title, a preset row and a
 *  width, where the watercolour brush is those plus four presets, two rendering
 *  choices with pictures on them, and four sliders with a sentence under each.
 *  On a phone that is taller than the screen, so the panel stood from the status
 *  bar to the toolbar and *was* the screen — a control covering the page it is a
 *  control for, with the mark it is about to make hidden behind it.
 *
 *  So it stops here and scrolls the rest. Two thirds of the window rather than a
 *  fixed height, because the thing it must not do is fill the screen and "the
 *  screen" is 600 points on a phone and 1400 on a desk; capped in pixels as
 *  well, because past that the panel is no longer growing towards its content —
 *  the longest tool runs out at around 500 — and a half-empty panel two feet
 *  tall is just a big panel.
 *
 *  `dvh` and not `vh`: on a phone the browser's own chrome slides in and out,
 *  and `vh` is measured against the *largest* the window ever gets, which is
 *  exactly the case this number exists to bound. */
export const MAX_PANEL_HEIGHT = "min(66dvh, 520px)";
