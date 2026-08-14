// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The freehand family: tools that sample the pointer into a polyline. They
// differ only in their ink — where the colour comes from, how wide the nib is,
// how opaque it is, and which painter lays it down — so they share one
// behaviour factory. It is the clearest demonstration of what a tool plugin
// actually has to supply: the pencil, the marker, the airbrush, the crayon and
// the eraser are all one call to this with different arguments.

import type { Point } from "../../types.ts";
import { paintBrush } from "../bristle.ts";
import {
  paintCalligraphy,
  paintSoftPath,
  paintSpray,
  strokeHardness,
} from "../brushes.ts";
import { paintCrayon } from "../crayon.ts";
import { extraDials, strokeDial } from "../dials.ts";
import { applyInk, distance, paintPath, strokeColor } from "../ink.ts";
import {
  FULL_DETAIL,
  type DraftStroke,
  type ToolBehaviour,
  type ToolContext,
} from "../types.ts";

/** Samples closer together than this (in document pixels) are dropped: they
 *  can't change how the line looks, and keeping them would bloat the saved
 *  document on a slow, high-frequency pointer. */
const MIN_SAMPLE_DISTANCE = 1.5;

/** Which painter lays the polyline down. The geometry is identical across all
 *  of them — a freehand tool's whole character is in this choice. */
export type FreehandStyle =
  "line" | "brush" | "spray" | "crayon" | "calligraphy";

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
  const strokeFor = (p: Point, ctx: ToolContext): DraftStroke => {
    // The tool's own ink, turned down by however far the opacity dial is —
    // a highlighter at half stays a *highlighter*, at half.
    const opacity = (ink.opacity ?? 1) * (ctx.dials.opacity ?? 1);
    // Every other dial the toolbar handed over rides along on the mark. Only
    // the ones actually moved are there (see `plugins/dials.ts`), so an untuned
    // stroke carries no field at all.
    const extra = extraDials(ctx.dials);
    return {
      tool: "",
      // A background-painting tool (the eraser) records no colour at all, so it
      // follows the page for good: flipping the canvas theme must not leave old
      // eraser strokes painted in the previous page's colour. Ink tools record
      // one only when the user picked it.
      ...(ink.useBackground || !ctx.color ? {} : { color: ctx.color }),
      size: ctx.size * (ink.sizeScale ?? 1),
      ...(opacity < 1 ? { opacity } : {}),
      // Hardness is recorded, not resolved at paint time: a soft stroke is soft
      // for good, the way its colour and width are, so re-reading the dial later
      // can't re-edge marks you already made. The same goes for the rest of
      // them — that is the whole reason they are on the stroke.
      ...(ink.useHardness && ctx.dials.hardness !== undefined
        ? { hardness: ctx.dials.hardness }
        : {}),
      ...(extra ? { dials: extra } : {}),
      shape: { kind: "path", points: [p] },
    };
  };

  return {
    start: (p, ctx) => strokeFor(p, ctx),
    move: (draft, p) => {
      if (draft.shape.kind !== "path") return draft;
      const points = draft.shape.points;
      const last = points[points.length - 1];
      if (last && distance(last, p) < MIN_SAMPLE_DISTANCE) return draft;
      return { ...draft, shape: { kind: "path", points: [...points, p] } };
    },
    paint: (ctx2d, stroke, detail = FULL_DETAIL) => {
      if (stroke.shape.kind !== "path") return;
      applyInk(ctx2d, stroke);
      const points = stroke.shape.points;
      const hardness = strokeHardness(stroke);
      // How big this mark is coming out on the device it is bound for. Every
      // textured painter below spends it the same way: keep the detail the
      // screen can show, drop the detail it cannot.
      const scale = detail.scale;
      switch (ink.style) {
        case "brush":
          paintBrush(
            ctx2d,
            points,
            stroke.size,
            hardness,
            scale,
            strokeDial(stroke, "hair"),
            strokeDial(stroke, "splay"),
            // The one dial whose rest is nothing rather than one: paper that
            // does not wick is the ordinary case, so it has to be what a mark
            // carrying no `bleed` at all paints as.
            strokeDial(stroke, "bleed", 0),
          );
          return;
        case "spray":
          // The spray builds its cone as a gradient, which needs the colour as
          // a value rather than as a context setting.
          paintSpray(
            ctx2d,
            points,
            stroke.size,
            hardness,
            strokeColor(stroke),
            scale,
            strokeDial(stroke, "flow"),
          );
          return;
        case "crayon":
          paintCrayon(
            ctx2d,
            points,
            stroke.size,
            scale,
            strokeDial(stroke, "pressure"),
          );
          return;
        case "calligraphy":
          paintCalligraphy(ctx2d, points, stroke.size, scale);
          return;
        default:
          if (ink.useHardness) {
            paintSoftPath(ctx2d, points, stroke.size, hardness, scale);
            return;
          }
          paintPath(ctx2d, points, stroke.size);
      }
    },
  };
}
