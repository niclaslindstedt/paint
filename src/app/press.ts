// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a press with a tool actually leaves behind.
//
// The size button and the size panel used to draw a grey dot the width of the
// nib. It told you a number you could already read off the button's label, and
// it told you nothing else: an airbrush, a highlighter and a calligraphy pen
// set to six all showed the same six-pixel circle, when what they leave on the
// page is a soft cone, a broad translucent band and a hairline flat. So the
// preview is no longer a drawing of a width — it is *the mark itself*, built by
// the tool that would make it and painted by the painter that would paint it.
//
// Nothing here knows a tool by name. A press is simulated through the plugin
// contract every tool already implements (`start` / `move` / `end`), so the
// preview is right for a tool this module has never heard of — including one
// that lands after it:
//
//   - **A press is a press.** `start` at a point, then `end`. That is what a
//     freehand tool's tap is, and every one of the media painters already draws
//     one (a dab of the head, a single cone, a nib's flat, a speck of wax).
//   - **A mark that needs two anchors gets the shortest gesture that leaves
//     one.** The shape tools drop a press that never travelled — it is a
//     mis-tap, not a zero-size rectangle — so when `end` throws the press away
//     we press, drag and lift instead. What comes back is a real rectangle at
//     the width being chosen.
//   - **A tool that reads the page is handed one.** The bucket needs a probe or
//     it begins nothing (`ToolContext.probe`), so the preview lends it a page
//     with one round area on it. It fills that area for real, feather and all.
//   - **A tool that types is asked for a caption.** `entersText` is the flag
//     that says a press opens a caret rather than a gesture, so the mark that
//     stands for one is a letter set at the size being chosen.
//
// Whatever comes back is an ordinary `Stroke`, so `render.ts` paints it exactly
// as the page would — same painters, same dials, same ink resolution. A tool
// that leaves nothing at all on a press (the hand, the dropper) comes back
// empty, and the caller falls back to a plain dot.

import { strokeBounds, unionBox, type Box } from "./bounds.ts";
import { textStroke } from "./plugins/builtin/text.ts";
import { withId } from "./plugins/types.ts";
import type {
  CanvasProbe,
  DraftStroke,
  PaintPlugin,
  ToolContext,
} from "./plugins/types.ts";
import type { Point, Stroke } from "./types.ts";

/** Where the press lands. The marks come back around the origin and the caller
 *  centres them on whatever it is drawing into, so this is only ever the middle
 *  of the preview. */
const AT: Point = { x: 0, y: 0 };

/** The letter a typing tool's press stands for. Deliberately not a catalog
 *  string: it is a *sample of the type size*, the way the typeface picker's
 *  names are samples of the faces, and a letterform reads as one in every
 *  language that has letters. */
const SAMPLE = "A";

/** How far a two-anchor gesture travels, as a multiple of the widest width on
 *  the row. Fixed against the *row* rather than against each width, which is
 *  what makes the row read: every rectangle in it is the same rectangle, drawn
 *  with a finer or a broader line. */
const REACH = 3;

/** How far a two-anchor gesture should travel for a row whose widest width is
 *  `widest`, in document pixels. */
export function pressReach(widest: number): number {
  return Math.max(4, widest * REACH);
}

/** The marks a single press with `plugin` leaves, in press coordinates.
 *
 *  Empty for a tool whose press leaves no mark at all: the hand moves the view,
 *  the dropper reads a colour, and neither has anything to preview. Also empty
 *  for a tool that would rub one out — a hole in a bare page is nothing to
 *  paint, which is why the eraser previews its width as a circle instead (see
 *  `PaintPlugin.sizePreview`). */
export function pressMarks(
  plugin: PaintPlugin | undefined,
  ctx: ToolContext,
  reach: number,
): Stroke[] {
  if (!plugin) return [];
  const mark = pressDraft(plugin, ctx, reach);
  if (!mark) return [];
  return [withId({ ...mark, tool: plugin.id }, "press")];
}

/** The draft a press produces, tried the three ways a tool can answer one. */
function pressDraft(
  plugin: PaintPlugin,
  ctx: ToolContext,
  reach: number,
): DraftStroke | null {
  // A typed mark. The press opens a caret rather than a gesture (see
  // `entersText`), so there is no draft to drive — the mark that stands for one
  // is a letter at the size being chosen.
  if (plugin.entersText) {
    return textStroke(SAMPLE, AT, {
      color: ctx.color,
      size: ctx.size,
      opacity: ctx.dials.opacity,
    });
  }

  // A tool whose drag *chooses* marks rather than leaving one. It builds an
  // ordinary two-corner draft — that is how the marquee inherits the whole drag
  // pipeline — but the box never reaches the document, so there is no mark to
  // preview and its width means nothing. The flag is the same one the canvas
  // reads (`selects`); nothing here knows what a selection tool is called.
  if (plugin.selects) return null;

  const behaviour = plugin.behaviour;
  // The page the tools that read one are lent, so a bucket previews a fill
  // rather than nothing.
  const page: ToolContext = { ...ctx, probe: ctx.probe ?? pagePatch(reach) };

  // The press itself: down and up in the same place.
  const pressed = behaviour.start(AT, page);
  if (pressed) {
    const kept = behaviour.end ? behaviour.end(pressed, page) : pressed;
    if (kept) return kept;
  }

  // …and, for a tool that throws a press away because its mark needs two
  // anchors, the shortest gesture that does leave one. Drawn corner to corner
  // so a box tool comes out square and a two-point tool comes out diagonal.
  const half = reach / 2;
  const begun = behaviour.start({ x: -half, y: half }, page);
  if (!begun) return null;
  const dragged = behaviour.move(begun, { x: half, y: -half }, page);
  return behaviour.end ? behaviour.end(dragged, page) : dragged;
}

/** A page with one round area on it, for the tools that read the page instead
 *  of the document (see `CanvasProbe`). It is the whole of the preview's page:
 *  a bucket pressed anywhere on it fills the blot, which is what a bucket press
 *  looks like. */
function pagePatch(reach: number): CanvasProbe {
  const radius = reach / 2;
  const loop: Point[] = [];
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    loop.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return {
    colorAt: () => null,
    regionAt: () => [loop],
  };
}

/** The box a set of press marks covers, or `null` when there are none. */
export function pressBox(marks: readonly Stroke[]): Box | null {
  let box: Box | null = null;
  for (const mark of marks) {
    const next = strokeBounds(mark);
    if (!next) continue;
    box = box ? unionBox(box, next) : next;
  }
  return box;
}

/** How much room a set of press marks takes up, in document pixels — the longer
 *  side of its box.
 *
 *  This is the mark's *geometry*: its anchors and its nib, which is all a stroke
 *  can say about itself (see `strokeBounds`). What a painter actually lays down
 *  can be a good deal wider — the airbrush's cone is over three times its nib,
 *  the calligraphy nib's flat is twice it, the crayon frays past its edge — and
 *  no number on the stroke knows that. A preview that has to fit the ink rather
 *  than the geometry measures the painted mark instead of guessing at an
 *  allowance here (see `toolbar/PressPreview.tsx`). */
export function pressExtent(marks: readonly Stroke[]): number {
  const box = pressBox(marks);
  if (!box) return 0;
  return Math.max(box.width, box.height);
}

/** How far to shrink a press so it fits the box it is previewed in.
 *
 *  Measured against `widest` — the same press at the broadest width on the row
 *  — rather than against itself, so every cell of a row is drawn at one scale
 *  and the row reads fine-to-broad. A row whose widest mark already fits is
 *  left alone: at nib widths the preview is then the mark at *life size*, which
 *  is the most useful thing a width preview can be.
 *
 *  `floor` is the one liberty taken. Against a row holding a kept width of 96 a
 *  two-pixel nib works out at a third of a pixel — mathematically present,
 *  invisible in practice — so a mark that would come out smaller than that is
 *  drawn at the floor instead. */
export function pressScale(
  extent: number,
  widest: number,
  room: number,
  floor: number,
): number {
  if (extent <= 0) return 1;
  const scale = widest > 0 ? Math.min(1, room / widest) : 1;
  if (extent * scale >= floor) return scale;
  return Math.min(1, floor / extent);
}
