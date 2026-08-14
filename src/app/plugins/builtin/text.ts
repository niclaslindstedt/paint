// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The text tool — the one mark that is typed rather than drawn.
//
// Every other tool turns a pointer gesture into a stroke. This one can't: a
// caption has to be *entered*, and a keyboard is not a gesture. So the plugin
// declares `entersText` and its `start` returns nothing at all; the canvas reads
// the flag, opens a caret at the press instead of beginning a stroke, and the
// screen hands the finished words back through `textStroke` below (see
// `TextEntry.tsx`). It is the same shape the dropped image already uses — a
// painter here, a way in somewhere else — and it keeps the tool-id branching out
// of the canvas, which only ever asks the descriptor what kind of tool it holds.
//
// What the tool offers past the ink every mark has is a **typeface**, a weight
// and a slant. Those are properties of the caption rather than of the gesture,
// so they ride on the shape and are chosen in the entry bar while you type — the
// only moment they mean anything.

import type { Point } from "../../types.ts";
import { applyInk } from "../ink.ts";
import type { DraftStroke, ToolBehaviour } from "../types.ts";

/** The plugin id every caption is tagged with. Persisted on the stroke, so it
 *  is fixed for good. */
export const TEXT_TOOL_ID = "text";

/** One typeface on offer. `stack` is a CSS font-family list rather than a single
 *  name: the app ships no font files (that would be a download on the entry
 *  path — see `CLAUDE.md`), so each face is the best of what the device already
 *  has, with a generic family behind it that every platform answers. */
export type TextFont = {
  /** Stable id — it is persisted on every caption set in this face. */
  id: string;
  /** What the picker calls it. Deliberately not a catalog string: each one is
   *  rendered *in its own face*, which is the sample and the label at once and
   *  reads the same in every language. */
  label: string;
  stack: string;
};

/** The four faces the tool offers, in picker order: the two a document is
 *  actually set in, the one that lines up in columns, and the one that doesn't
 *  look typed at all. Four is the whole list on purpose — a font menu is a
 *  different feature, and this is a sketchpad. */
export const TEXT_FONTS: readonly TextFont[] = [
  {
    id: "sans",
    label: "Sans",
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "mono",
    label: "Mono",
    stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  {
    id: "casual",
    label: "Casual",
    stack: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive',
  },
];

/** The face a caption that names none is set in. */
export const DEFAULT_TEXT_FONT = TEXT_FONTS[0]!.id;

/** The type sizes the size panel offers for this tool, in document pixels — the
 *  tool's own `sizes`, because the three nib widths every other tool shares are
 *  a hairline, a line and a fat line, and none of them is readable type. */
export const TEXT_SIZES = [16, 24, 32, 48, 72] as const;

/** What the tool opens at: big enough to read on a page three thousand pixels
 *  wide, small enough to caption something. */
export const DEFAULT_TEXT_SIZE = 32;

/** Line spacing, as a multiple of the type size. */
export const TEXT_LINE_HEIGHT = 1.3;

/** A rough width-per-character, as a fraction of the type size — what a caption
 *  is worth when there is nothing to measure it with (a node test, a document
 *  rendered outside a browser). Generous on purpose: over-measuring pads a box,
 *  under-measuring clips a glyph off the edge of an export. */
export const TEXT_WIDE_CHAR = 0.75;

/** The face for an id, falling back to the default for one this build no longer
 *  ships — a caption never loses its words to a missing font. */
export function textFont(id: string | undefined): TextFont {
  return (
    TEXT_FONTS.find((f) => f.id === id) ??
    TEXT_FONTS.find((f) => f.id === DEFAULT_TEXT_FONT)!
  );
}

/** How a caption is styled, everywhere it is drawn — the canvas, the entry box
 *  floating over it, and the SVG export all build the same shorthand, so what
 *  you typed is what lands. */
export function fontSpec(style: {
  size: number;
  font?: string;
  bold?: boolean;
  italic?: boolean;
}): string {
  const slant = style.italic ? "italic " : "";
  const weight = style.bold ? "700 " : "400 ";
  return `${slant}${weight}${style.size}px ${textFont(style.font).stack}`;
}

/** A caption's lines. Newlines are kept in the stroke, so a typed paragraph is
 *  one mark rather than one per line — it moves, undoes and exports as the one
 *  thing it was typed as. */
export function textLines(text: string): string[] {
  return text.split("\n");
}

/** A scratch context kept for measuring type. Made once, on the first question
 *  asked, and `null` where there is no document to make one from. */
let ruler: CanvasRenderingContext2D | null | undefined;

/** How wide one line of type comes out, in document pixels.
 *
 *  Measured for real wherever there is a canvas to measure with — the page's own
 *  glyphs, in the face and weight the mark is actually set in — and estimated
 *  from the character count where there isn't. Both callers that need it are
 *  about *space* rather than paint: the box a repaint culls against, and the
 *  crop a "just the marks" export takes. */
export function measureText(text: string, font: string): number {
  if (ruler === undefined) {
    ruler =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  if (!ruler) return 0;
  ruler.font = font;
  return ruler.measureText(text).width;
}

/** The space a caption takes up, from its top-left anchor: as wide as its
 *  longest line and as tall as its lines stacked.
 *
 *  The one measurement of a text mark, so the page-fit, the export crop and the
 *  repaint's culling can't disagree about how much room a caption needs. */
export function textBox(
  text: string,
  style: { size: number; font?: string; bold?: boolean; italic?: boolean },
): { width: number; height: number } {
  const lines = textLines(text);
  const spec = fontSpec(style);
  let width = 0;
  for (const line of lines) {
    width = Math.max(
      width,
      measureText(line, spec) || line.length * style.size * TEXT_WIDE_CHAR,
    );
  }
  return { width, height: lines.length * style.size * TEXT_LINE_HEIGHT };
}

export const textBehaviour: ToolBehaviour = {
  // No gesture types a word: the press opens a caret, and the caption arrives
  // through `textStroke` when the typing is finished.
  start: () => null,
  move: (draft) => draft,
  paint: (ctx2d, stroke) => {
    const shape = stroke.shape;
    if (shape.kind !== "text") return;
    if (!shape.text) return;
    // The ink for the colour and the opacity; the width is the type size, so
    // the line width `applyInk` set means nothing here and nothing strokes.
    applyInk(ctx2d, stroke);
    ctx2d.font = fontSpec({
      size: stroke.size,
      font: shape.font,
      bold: shape.bold,
      italic: shape.italic,
    });
    // Anchored at the top-left: it is where the caret was, which is the one
    // point the person typing was actually looking at.
    ctx2d.textBaseline = "top";
    const step = stroke.size * TEXT_LINE_HEIGHT;
    const lines = textLines(shape.text);
    for (let i = 0; i < lines.length; i++) {
      ctx2d.fillText(lines[i]!, shape.at.x, shape.at.y + i * step);
    }
  },
};

/** The mark a finished caption becomes. Built here rather than in the screen
 *  that collects the words, so the one place that knows what a text stroke looks
 *  like is the plugin that paints it. */
export function textStroke(
  text: string,
  at: Point,
  ink: {
    /** The picked ink, or `null` to let the caption follow the page (see
     *  `Stroke.color`). */
    color: string | null;
    size: number;
    font?: string;
    bold?: boolean;
    italic?: boolean;
    opacity?: number;
  },
): DraftStroke {
  return {
    tool: TEXT_TOOL_ID,
    ...(ink.color ? { color: ink.color } : {}),
    size: ink.size,
    ...(ink.opacity !== undefined && ink.opacity < 1
      ? { opacity: ink.opacity }
      : {}),
    shape: {
      kind: "text",
      at,
      text,
      // Only what differs from a caption set the way the tool opens, so an
      // ordinary line of type serialises as small as it reads.
      ...(ink.font && ink.font !== DEFAULT_TEXT_FONT ? { font: ink.font } : {}),
      ...(ink.bold ? { bold: true } : {}),
      ...(ink.italic ? { italic: true } : {}),
    },
  };
}
