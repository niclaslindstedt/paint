// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The freehand family: tools that sample the pointer into a polyline. They
// differ only in their ink — where the colour comes from, how wide the nib is,
// how opaque it is, which painter lays it down, and whether it lays any down at
// all — so they share one behaviour factory. It is the clearest demonstration
// of what a tool plugin
// actually has to supply: the pencil, the marker, the airbrush, the crayon and
// the eraser are all one call to this with different arguments.

import { SOLID_GROUND } from "../../ground.ts";
import type { Point } from "../../types.ts";
import { paintBrush } from "../bristle.ts";
import { ROUND_HEAD, type BrushHead } from "../head.ts";
import {
  paintCalligraphy,
  paintNib,
  paintSoftPath,
  paintSpray,
  strokeHardness,
} from "../brushes.ts";
import { paintCrayon } from "../crayon.ts";
import { extraDials, strokeDial } from "../dials.ts";
import { applyInk, distance, paintPath, strokeColor } from "../ink.ts";
import { DEFAULT_LEAD_DETAIL, paintGraphiteOn } from "../lead.ts";
import { paintRubbing } from "../rubber.ts";
import { DEFAULT_WASH_DETAIL, paintWashOn } from "../wash.ts";
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

/** A nib angle as the painters want it. The dial is in degrees because that is
 *  what a tilt reads as to anyone setting one; the maths is in radians. */
function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Which painter lays the polyline down. The geometry is identical across all
 *  of them — a freehand tool's whole character is in this choice. */
export type FreehandStyle =
  | "line"
  | "brush"
  | "spray"
  | "crayon"
  | "calligraphy"
  | "nib"
  | "graphite"
  | "rubber"
  | "wash";

type FreehandInk = {
  /** Lift ink rather than lay it down (the eraser). The mark carries no colour
   *  — the renderer paints it with `destination-out`, where only its width and
   *  its opacity mean anything. */
  erases?: boolean;
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
  /** A tool that mixes its **own** colour instead of taking the toolbar's.
   *
   *  The pencil is the case: graphite is a mineral, and no amount of choosing a
   *  swatch makes one draw in red — but *which* grey it is still depends on the
   *  page, so the tool is handed the whole context and answers with a colour
   *  (see `graphiteInk`). Absent for every ordinary tool, which draws in the ink
   *  you picked. */
  ink?: (ctx: ToolContext) => string;
  /** Where this tool's chisel dial rests, for the `nib` style — 0 is a round
   *  bullet, 1 very nearly a flat. It has to agree with the `default` on the
   *  dial the plugin declares, because that is what an untuned mark resolves to
   *  (see `CHISEL` in `builtin/dials.ts`). */
  chisel?: number;
  /** Where this tool's nib-angle dial rests, in degrees off the horizontal —
   *  the same agreement as `chisel`. A tool that offers no angle dial simply
   *  draws at this one for ever. */
  angle?: number;
  /** What is on the end of the handle, for the `brush` style: a cone of hair
   *  that draws the same width whichever way you pull it, or a blade that lays
   *  its full width square across itself and closes to nothing on its edge (see
   *  `BrushHead`).
   *
   *  A property of the brush and not a dial, exactly like the marker's chisel:
   *  you do not turn a round into a flat, you pick up a different brush — and
   *  so a flat is a second registration of this same behaviour rather than a
   *  setting on the first. */
  head?: BrushHead["shape"];
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
    // A tool that mixes its own ink (the pencil) records that, whatever the
    // toolbar is holding — and records it *on the stroke*, so a page redrawn
    // on a sheet of another colour keeps the grey it was drawn in.
    const own = ink.erases ? undefined : ink.ink?.(ctx);
    return {
      tool: "",
      // A tool that lifts ink (the eraser) records no colour at all: what it
      // takes off the page is decided by where the nib went, not by what the
      // toolbar happened to be holding, and a colour on the mark would be a
      // number nothing ever reads. Ink tools record one only when the user
      // picked it.
      ...(ink.erases || !(own ?? ctx.color)
        ? {}
        : { color: own ?? ctx.color! }),
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
      // …and what it is coming out *on*. Absent — a painter called directly, a
      // test — is the plain solid sheet, which every painter below treats as
      // the page it has always painted on.
      const sheet = detail.ground ?? SOLID_GROUND;
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
            // carrying no `bleed` at all paints as — and then the sheet adds
            // its own, whether or not anyone asked. A loaded head on newsprint
            // feathers; on the solid page the sheet adds nothing, so a drawing
            // made before grounds existed paints unchanged.
            strokeDial(stroke, "bleed", 0) + sheet.absorbency * 1.1,
            // How much paint the head was dipped with — the multiplier on the
            // run the whole mark spends before it goes dry (see `capacityOf`).
            strokeDial(stroke, "load"),
            ink.head === "flat"
              ? {
                  shape: "flat",
                  // A flat is held at an angle the way a broad nib is, and the
                  // same dial says which — so the two tools that have a flat on
                  // them read the same number off the mark.
                  angle: radians(strokeDial(stroke, "angle", ink.angle ?? 0)),
                }
              : ROUND_HEAD,
            // …and the patch the caller is actually keeping, so a drag that
            // crosses the window costs the part of it that shows rather than
            // fifty hairs' worth of the whole thing (see `PaintDetail.clip`).
            detail.clip,
          );
          return;
        case "wash":
          paintWashOn(
            ctx2d,
            points,
            stroke.size,
            scale,
            strokeDial(stroke, "water"),
            strokeDial(stroke, "pigment"),
            // The colour's own doing, and the one of the three that rests
            // somewhere other than 1 — see `GRANULATION`.
            strokeDial(stroke, "granulation", 0.6),
            // …and the sheet, which is the other half of all of them (see
            // `paintWash`).
            sheet,
            // The simulation works in pigment rather than in ink, so it needs
            // the colour as a value: what it lays down is a *density*, and the
            // colour is what light has to get through (see `washSim.ts`).
            strokeColor(stroke),
            // …over a sheet of this colour, which is the other half of that:
            // pigment on a dark page eats into the dark rather than into the
            // light, and a simulation told nothing about the page paints a
            // white wash on a black one as nothing at all (see `washSim.ts`).
            detail.page ?? "#ffffff",
            // …and how finely the simulation is set to resolve, which is the
            // one of these that is about the *cost* of the mark rather than
            // about the mark (see `MIN_WASH_DETAIL`).
            detail.washDetail ?? DEFAULT_WASH_DETAIL,
            // …and whether this mark is still under the hand, which is the
            // other thing that is about the cost: a gesture is re-simulated on
            // every pointer sample where a landed mark is simulated once and
            // kept (see `PaintDetail.live`).
            detail.live === true,
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
            // …and the patch the caller is actually keeping, so a cone that
            // cannot reach it is never filled (see `PaintDetail.clip`). The one
            // painter here that is handed it, because it is the one whose cost
            // is a few hundred full-radius fills rather than one path.
            detail.clip,
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
          paintCalligraphy(
            ctx2d,
            points,
            stroke.size,
            scale,
            radians(strokeDial(stroke, "angle", ink.angle ?? -45)),
          );
          return;
        case "nib":
          paintNib(
            ctx2d,
            points,
            stroke.size,
            strokeDial(stroke, "chisel", ink.chisel ?? 0),
            radians(strokeDial(stroke, "angle", ink.angle ?? 0)),
            scale,
          );
          return;
        case "graphite":
          paintGraphiteOn(
            ctx2d,
            points,
            stroke.size,
            scale,
            strokeDial(stroke, "grade"),
            // The sheet the lead is being pressed into: how coarse the paper is,
            // how deep, and whether it dips at random or goes over and under.
            sheet,
            // The lead's own grey as a value: the field lays down a *load* and
            // works out the alpha itself, so it needs the colour rather than a
            // context setting (see `leadSim.ts`).
            strokeColor(stroke),
            // …how finely the simulation is set to work the mark out, which is
            // the one of these that is about the *cost* of the mark rather than
            // about the mark (see `MIN_LEAD_DETAIL`).
            detail.leadDetail ?? DEFAULT_LEAD_DETAIL,
            // …and the patch the caller is actually keeping, so a long scribble
            // being repainted where it grew costs the patch rather than the
            // scribble (see `PaintDetail.clip`).
            detail.clip,
          );
          return;
        case "rubber":
          // The one painter here whose alpha is spent taking something off
          // rather than putting it on — the tool that asks for it declares
          // `erases`, and the renderer has already turned the compositing round
          // (see `render.ts`).
          paintRubbing(
            ctx2d,
            points,
            stroke.size,
            scale,
            strokeDial(stroke, "pressure"),
          );
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
