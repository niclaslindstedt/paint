// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The freehand family: tools that sample the pointer into a polyline. They
// differ only in their ink — where the colour comes from, how wide the nib is,
// how opaque it is, and which painter lays it down — so they share one
// behaviour factory. It is the clearest demonstration of what a tool plugin
// actually has to supply: the pencil, the marker, the airbrush, the crayon and
// the eraser are all one call to this with different arguments.

import type { Point } from "../../types.ts";
import {
  paintBrush,
  paintCalligraphy,
  paintCrayon,
  paintGlow,
  paintSoftPath,
  paintSpray,
  strokeHardness,
} from "../brushes.ts";
import { applyInk, distance, paintPath, strokeColor } from "../ink.ts";
import type { DraftStroke, ToolBehaviour, ToolContext } from "../types.ts";

/** Samples closer together than this (in document pixels) are dropped: they
 *  can't change how the line looks, and keeping them would bloat the saved
 *  document on a slow, high-frequency pointer. */
const MIN_SAMPLE_DISTANCE = 1.5;

/** Which painter lays the polyline down. The geometry is identical across all
 *  of them — a freehand tool's whole character is in this choice. */
export type FreehandStyle =
  "line" | "brush" | "spray" | "crayon" | "calligraphy" | "glow";

type FreehandInk = {
  /** Paint with the page background instead of the ink colour (the eraser). */
  useBackground?: boolean;
  /** Multiplier on the toolbar's size — a marker is fatter than a pencil. */
  sizeScale?: number;
  /** Ink opacity, 0–1. The highlighter is translucent so overlapping passes
   *  build up the way a real highlighter does. */
  opacity?: number;
  /** How the mark is painted. Defaults to a plain line. */
  style?: FreehandStyle;
  /** Record the toolbar's hardness on the stroke, so this tool's edge follows
   *  the dial. Only the painters that read it should ask for it. */
  useHardness?: boolean;
};

/** Build a freehand tool behaviour with the given ink. */
export function freehandBehaviour(ink: FreehandInk = {}): ToolBehaviour {
  const strokeFor = (p: Point, ctx: ToolContext): DraftStroke => ({
    tool: "",
    // A background-painting tool (the eraser) records no colour at all, so it
    // follows the page for good: flipping the canvas theme must not leave old
    // eraser strokes painted in the previous page's colour. Ink tools record
    // one only when the user picked it.
    ...(ink.useBackground || !ctx.color ? {} : { color: ctx.color }),
    size: ctx.size * (ink.sizeScale ?? 1),
    ...(ink.opacity !== undefined ? { opacity: ink.opacity } : {}),
    // Hardness is recorded, not resolved at paint time: a soft stroke is soft
    // for good, the way its colour and width are, so re-reading the dial later
    // can't re-edge marks you already made.
    ...(ink.useHardness ? { hardness: ctx.hardness } : {}),
    shape: { kind: "path", points: [p] },
  });

  return {
    start: (p, ctx) => strokeFor(p, ctx),
    move: (draft, p) => {
      if (draft.shape.kind !== "path") return draft;
      const points = draft.shape.points;
      const last = points[points.length - 1];
      if (last && distance(last, p) < MIN_SAMPLE_DISTANCE) return draft;
      return { ...draft, shape: { kind: "path", points: [...points, p] } };
    },
    paint: (ctx2d, stroke) => {
      if (stroke.shape.kind !== "path") return;
      applyInk(ctx2d, stroke);
      const points = stroke.shape.points;
      const hardness = strokeHardness(stroke);
      switch (ink.style) {
        case "brush":
          paintBrush(ctx2d, points, stroke.size, hardness);
          return;
        case "spray":
          // The spray builds its cone as a gradient, which needs the colour as
          // a value rather than as a context setting.
          paintSpray(ctx2d, points, stroke.size, hardness, strokeColor(stroke));
          return;
        case "crayon":
          paintCrayon(ctx2d, points, stroke.size);
          return;
        case "calligraphy":
          paintCalligraphy(ctx2d, points, stroke.size);
          return;
        case "glow":
          paintGlow(ctx2d, points, stroke.size);
          return;
        default:
          if (ink.useHardness) {
            paintSoftPath(ctx2d, points, stroke.size, hardness);
            return;
          }
          paintPath(ctx2d, points, stroke.size);
      }
    },
  };
}
