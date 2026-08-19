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
import { paintBristle } from "../bristleSim.ts";
import {
  paintNib,
  paintSoftPath,
  paintSpray,
  strokeHardness,
} from "../brushes.ts";
import { paintInk } from "../quillSim.ts";
import { paintChalkOn } from "../chalk.ts";
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
  | "chalk"
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
  /** Where this tool's flatness dial rests, for the `brush` style: 0 is the
   *  round that draws the same width whichever way you pull it, 1 the blade
   *  that lays its full width square across itself and closes to a hairline
   *  along its edge — the same agreement as `chisel`. The paintbrush rests at
   *  round; the hidden legacy flat rests at 1, which is what keeps every
   *  stroke ever drawn with it a flat (see `builtin/index.ts`). */
  flatness?: number;
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
          // The brush *simulates* its paint (see `plugins/bristleSim.ts`):
          // a finite dip spent along the drag, a comb of hairs, and the
          // sheet deciding what a starving head can still catch. The mark's
          // whole shape rides on two numbers with first-class dials — how
          // far the head is squeezed toward a blade, and which way the blade
          // is turned — so one tool is the round and the flat both.
          paintBristle(ctx2d, points, stroke.size, {
            scale,
            hardness,
            flatness: strokeDial(stroke, "flatness", ink.flatness ?? 0),
            // A flat is held at an angle the way a broad nib is, and the
            // same dial says which — so the two tools that have a flat on
            // them read the same number off the mark.
            angle: radians(strokeDial(stroke, "angle", ink.angle ?? 0)),
            // How much paint the head was dipped with — the reservoir the
            // whole drag spends before it goes dry.
            load: strokeDial(stroke, "load"),
            // The sheet: its grain is what a slab settles into and a
            // starving head breaks up on, and a thirsty one drinks the
            // reservoir and feathers the edges.
            ground: sheet,
            // The simulation works in paint film rather than in a fill, so
            // it needs the colour as a value — and the page it is landing
            // on, which says which way the film reads (see `washSim.ts`).
            color: strokeColor(stroke),
            page: detail.page ?? "#ffffff",
            // …and whether this mark is still under the hand, which decides
            // only which room holds its field (see `PaintDetail.live`).
            live: detail.live === true,
            // …and the patch the caller is actually keeping, read by the
            // vector fallback the seam keeps for marks too small for a
            // field (see `PaintDetail.clip`).
            clip: detail.clip,
            // The legacy texture dials, read by that fallback alone: marks
            // drawn before the simulation carry them, and the painter that
            // still draws the smallest marks still honours them.
            hair: strokeDial(stroke, "hair"),
            splay: strokeDial(stroke, "splay"),
            bleed: strokeDial(stroke, "bleed", 0),
          });
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
        case "chalk":
          // The chalk *simulates* its board (see `plugins/chalkSim.ts`): a
          // soft stick scrubbed over the page's own sheet, and the mark is
          // whatever the sheet kept — the sparkle that never closes into
          // solid colour, the streaks down a broad drag, the dust falling
          // past the edge, and the second pass that bolds a letter.
          paintChalkOn(
            ctx2d,
            points,
            stroke.size,
            scale,
            // How hard the hand bore down — the chalk's one axis, recorded on
            // the mark like every other dial so re-setting it later cannot
            // re-press a line already drawn.
            strokeDial(stroke, "pressure"),
            // The sheet the stick is scrubbed over: its tooth is what breaks
            // a light line into specks and holds the pinholes open in a
            // heavy one.
            sheet,
            // The simulation lays a *load* and works the alpha out itself,
            // so it needs the colour as a value (see `chalkSim.ts`).
            strokeColor(stroke),
            // …and the patch the caller is actually keeping, so a long sweep
            // being repainted where it grew costs the patch rather than the
            // sweep (see `PaintDetail.clip`).
            detail.clip,
            // …and whether this mark is still under the hand, which decides
            // only whether the dried-mark store is consulted (see
            // `chalkStore.ts`).
            detail.live === true,
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
          paintInk(
            ctx2d,
            points,
            stroke.size,
            scale,
            radians(strokeDial(stroke, "angle", ink.angle ?? -45)),
            // How much ink the nib was dipped with for this stroke — the
            // pen's own dip, the way the brushes carry theirs. It is spent as
            // the stroke travels, which is where the shading, the railing and
            // the running dry all come from (see `quillSim.ts`).
            strokeDial(stroke, "load"),
            // The sheet: a thirsty one feathers the edge and breaks a starving
            // stroke on its tooth; the solid page does neither.
            sheet,
            // The simulation works in ink film rather than in a fill, so it
            // needs the colour as a value — and the page it is landing on,
            // which says which way the film reads (see `washSim.ts`).
            strokeColor(stroke),
            detail.page ?? "#ffffff",
            // …and whether this mark is still under the hand, which decides
            // only which slot of the dried-mark store holds it (see
            // `PaintDetail.live`).
            detail.live === true,
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
            // …and how hard the hand was bearing down on it, which is the other
            // half of what a pencil line is: the grade is the lead, this is the
            // hand (see `PRESS` in `builtin/dials.ts`). Recorded on the mark
            // like every other dial, so re-setting it later cannot re-press a
            // line already drawn.
            strokeDial(stroke, "pressure"),
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
            // …and whether this mark is still under the hand, which decides
            // only whether the dried-mark store is consulted: a landed mark
            // dries once and is blitted on every repaint after (see
            // `leadStore.ts`).
            detail.live === true,
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
            // …and the patch the caller is actually keeping — for a live
            // rubbing out that is the pencil ink under the hand, and the grain
            // outside it is never laid (see `PaintDetail.clip`).
            detail.clip,
            // …and whether this mark is still under the hand, which routes it
            // through the held walk that lays each press once instead of the
            // whole gesture twice a frame (see `paintLiveRubbing`).
            detail.live === true,
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
