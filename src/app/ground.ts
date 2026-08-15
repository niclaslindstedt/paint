// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ground: what the page is made of, and what that does to a mark.
//
// "Ground" is the painter's word for the prepared surface you work on — the
// sheet of paper, the primed cloth, the board — and it is the right word here
// because the surface is not decoration. Ask any watercolourist what changed
// between two washes and the first answer is the paper. The same brush, the
// same pigment and the same gesture leave a hard-edged stripe on a sealed
// digital sheet, a soft wandering stain on cold-pressed paper, and a mottled
// puddle on rough. So the ground is a property of the *drawing*, it travels
// with it, and every painter that has anything to say about the sheet reads it.
//
// A ground says three things, and everything else in this module falls out of
// them:
//
//   - **How much it drinks** (`absorbency`). This is the one that matters. A
//     sealed sheet holds paint on its face, so a second pass sits *on top* of
//     the first and covers it. Paper takes the water into its fibres, so paint
//     goes *into* the sheet and a second pass mixes with what is already in
//     there rather than hiding it — which is why a red wash over a blue one on
//     paper comes out purple and on a digital sheet comes out red. The wetter
//     the tool and the thirstier the sheet, the more true that is (`inkBlend`).
//   - **How coarse it is** (`tooth`, `pattern`). The pitch of the grain and how
//     it is arranged: the random dip of paper, the ribs of a laid sheet, the
//     over-and-under of cloth. It is painted onto the page (`groundPaint.ts`)
//     and it is what the pigment settles into.
//   - **How deep that grain is** (`bite`). How much of the tooth shows through
//     — hot-pressed paper has a grain you can barely find, rough has one you
//     can feel through the mark.
//
// What a ground does *not* touch is colour: the page's colour is the drawing's
// own (`Drawing.background`) and the canvas theme's. Kraft paper is brown
// because you pin it brown, and the tooth then reads on it — which is what
// keeps a rough sheet available on a black page as readily as on a white one.
//
// Nothing here knows a tool by name. A tool declares how wet it is
// (`PaintPlugin.wetness`) and this module answers what a mark that wet does on
// this ground; the renderer applies the answer (see `render.ts`).

import { isDarkColor } from "./canvas.ts";
import type { TKey } from "./i18n/index.ts";
import type { Ground } from "./types.ts";
import { mm } from "./units.ts";

/** How a ground's grain is arranged. Three real answers, because a sheet's
 *  grain comes from how it was made: paper is pressed out of a slurry and dips
 *  at random, laid paper carries the ribs of the wires it was couched on, and
 *  cloth is woven. */
export type GroundPattern = "none" | "tooth" | "ribs" | "cloth";

/** The numbers a painter actually reads off the sheet. */
export type GroundProfile = {
  /** How much the sheet drinks, 0 (a sealed digital page) to 1 (blotting
   *  paper). What makes a wet mark stain rather than cover. */
  absorbency: number;
  /** The pitch of the grain, in document pixels — the distance from one dip of
   *  the sheet to the next. 0 for a surface with no grain at all. */
  tooth: number;
  /** How deep that grain is, 0 (invisible) to 1 (you could feel it). */
  bite: number;
  /** How the grain is laid out. */
  pattern: GroundPattern;
};

/** The plain sheet: no grain, and nothing wet does anything unusual on it.
 *
 *  This is what a drawing with no ground of its own paints on, what a painter
 *  called with no ground assumes, and — deliberately — pixel-for-pixel the page
 *  this app had before grounds existed. Nothing about an existing drawing
 *  changes until someone picks a sheet for it. */
export const SOLID_GROUND: GroundProfile = {
  absorbency: 0,
  tooth: 0,
  bite: 0,
  pattern: "none",
};

/** Which shelf of the picker a stock sits on. Solid is its own family of one —
 *  it is the *absence* of a surface, and it belongs at the head of the list
 *  rather than filed under either material. */
export type GroundFamily = "solid" | "paper" | "canvas";

/** One stock the page can be cut from. */
export type GroundDescriptor = {
  /** Stable id. It is persisted on the drawing (`Drawing.ground`), so renaming
   *  one drops a page back to the solid sheet — pick it once. */
  id: string;
  family: GroundFamily;
  nameKey: TKey;
  /** The one line under the name saying what this stock is for. */
  hintKey: TKey;
  profile: GroundProfile;
};

/** The stocks this build ships, in the order the picker lays them out: the
 *  plain sheet first, then the papers from smoothest to roughest, then cloth.
 *
 *  They are real sorts with real behaviour rather than a list of textures. A
 *  watercolour paper is sold in exactly three surfaces — hot-pressed,
 *  cold-pressed and rough — and the difference between them is the difference
 *  between three quite different paintings; cartridge is what a sketchbook is;
 *  laid is the ribbed writing paper an ink drawing wants; newsprint drinks
 *  everything you put on it and is why a marker bleeds on it; kraft is the
 *  brown wrapping stock people draw on because it is there. Cotton duck and
 *  linen are the two cloths a stretched canvas is made of, and both are primed
 *  — which is why they are *less* thirsty than any of the papers, not more.
 *
 *  Numbers are in millimetres of real sheet (see `units.ts`), so the grain is
 *  the size it would be under a ruler at 1:1 rather than a value someone
 *  liked. */
export const GROUNDS: readonly GroundDescriptor[] = [
  {
    id: "solid",
    family: "solid",
    nameKey: "grounds.solid.name",
    hintKey: "grounds.solid.hint",
    profile: SOLID_GROUND,
  },
  {
    id: "hot",
    family: "paper",
    nameKey: "grounds.hot.name",
    hintKey: "grounds.hot.hint",
    // Hot-pressed: rolled smooth between heated plates. It still drinks like
    // paper — that is what makes it paper — it just has almost nothing for the
    // pigment to settle into.
    profile: {
      absorbency: 0.5,
      tooth: mm(0.18),
      bite: 0.12,
      pattern: "tooth",
    },
  },
  {
    id: "cold",
    family: "paper",
    nameKey: "grounds.cold.name",
    hintKey: "grounds.cold.hint",
    // Cold-pressed (NOT), the sheet most watercolour is painted on: enough
    // tooth to granulate, not so much that a line breaks up.
    profile: {
      absorbency: 0.75,
      tooth: mm(0.55),
      bite: 0.42,
      pattern: "tooth",
    },
  },
  {
    id: "rough",
    family: "paper",
    nameKey: "grounds.rough.name",
    hintKey: "grounds.rough.hint",
    // Rough: dried without pressing at all. A dry brush skips across the peaks
    // and a wash pools in the valleys, which is the whole reason to buy it.
    profile: {
      absorbency: 0.88,
      tooth: mm(0.8),
      bite: 0.62,
      pattern: "tooth",
    },
  },
  {
    id: "cartridge",
    family: "paper",
    nameKey: "grounds.cartridge.name",
    hintKey: "grounds.cartridge.hint",
    profile: {
      absorbency: 0.4,
      tooth: mm(0.3),
      bite: 0.22,
      pattern: "tooth",
    },
  },
  {
    id: "laid",
    family: "paper",
    nameKey: "grounds.laid.name",
    hintKey: "grounds.laid.hint",
    // The ribs of the wires the sheet was couched on, about a millimetre apart,
    // with a chain line every inch or so. Sized writing paper, so it holds ink
    // on its face rather than drinking it.
    profile: {
      absorbency: 0.32,
      tooth: mm(0.9),
      bite: 0.3,
      pattern: "ribs",
    },
  },
  {
    id: "newsprint",
    family: "paper",
    nameKey: "grounds.newsprint.name",
    hintKey: "grounds.newsprint.hint",
    // Unsized, short-fibred and thirsty: everything wet spreads on it, which is
    // exactly what a marker does to a newspaper.
    profile: {
      absorbency: 1,
      tooth: mm(0.25),
      bite: 0.3,
      pattern: "tooth",
    },
  },
  {
    id: "kraft",
    family: "paper",
    nameKey: "grounds.kraft.name",
    hintKey: "grounds.kraft.hint",
    profile: {
      absorbency: 0.68,
      tooth: mm(0.45),
      bite: 0.5,
      pattern: "tooth",
    },
  },
  {
    id: "cotton",
    family: "canvas",
    nameKey: "grounds.cotton.name",
    hintKey: "grounds.cotton.hint",
    // Cotton duck, primed: a coarse over-and-under weave that shows through
    // everything, and a ground that holds paint on its face.
    profile: {
      absorbency: 0.28,
      tooth: mm(0.5),
      bite: 0.7,
      pattern: "cloth",
    },
  },
  {
    id: "linen",
    family: "canvas",
    nameKey: "grounds.linen.name",
    hintKey: "grounds.linen.hint",
    profile: {
      absorbency: 0.22,
      tooth: mm(0.34),
      bite: 0.6,
      pattern: "cloth",
    },
  },
];

/** The stock with this id, or `undefined` for one this build doesn't ship. */
export function groundById(
  id: string | undefined,
): GroundDescriptor | undefined {
  return id === undefined ? undefined : GROUNDS.find((g) => g.id === id);
}

/** The stocks on one shelf of the picker, in catalog order. */
export function groundsInFamily(family: GroundFamily): GroundDescriptor[] {
  return GROUNDS.filter((g) => g.family === family);
}

/** What a drawing's ground actually paints as.
 *
 *  An absent ground, and a stock this build has never heard of, both come back
 *  as the plain sheet: a page must never fail to paint because the document
 *  named a surface we don't have. The `texture` setting scales how far the
 *  grain shows and nothing else — how much the sheet *drinks* is what the stock
 *  is, and turning the visible grain down does not make rough paper behave like
 *  a sealed one. */
export function groundProfile(ground: Ground | undefined): GroundProfile {
  const stock = groundById(ground?.stock);
  if (!stock) return SOLID_GROUND;
  const texture = ground?.texture;
  if (texture === undefined || texture === 1) return stock.profile;
  return {
    ...stock.profile,
    bite: stock.profile.bite * Math.max(0, Math.min(2, texture)),
  };
}

/** How much of what is under it a mark this wet takes up and carries — the
 *  number that makes a sheet's absorbency and a tool's wetness one thing.
 *
 *  It is a *product*, and it has to be: a dry pencil on blotting paper disturbs
 *  nothing, and a loaded brush on glass has nothing to soak into. Both ends of
 *  that are zero and only the middle is interesting. */
export function wetting(wetness: number, ground: GroundProfile): number {
  const wet = Math.max(0, Math.min(1, wetness));
  return wet * Math.max(0, Math.min(1, ground.absorbency));
}

/** Below this much wetting a mark simply lies on the page: it composites the
 *  ordinary way, and nothing under it moves.
 *
 *  A floor rather than a fade because the compositing rule below it and the one
 *  above it are two different operations and there is no half of one — so the
 *  threshold is set low enough that everything the app calls a wet tool clears
 *  it on any real paper, and everything it calls dry misses it on every ground
 *  there is. */
export const WETTING_FLOOR = 0.14;

/** What a mark of this wetness does on this ground. */
export type InkBlend = {
  /** How the mark is composited over what is already painted.
   *
   *  `source-over` is paint sitting on the surface: the mark covers what it is
   *  over, which is what a sealed sheet does and what this app has always done.
   *
   *  A mark that has soaked in mixes with the colour it soaked into instead.
   *  On a light sheet that is `multiply` — two transparent layers of pigment
   *  subtract light from the page, so blue over yellow is green and red over
   *  blue is purple. On a dark sheet the page is the *absence* of ink and the
   *  same physics runs the other way, so it is `screen`: the marks add up
   *  towards light rather than down towards black, and a wash on a black page
   *  goes on reading as a wash instead of vanishing into it. */
  mode: "source-over" | "multiply" | "screen";
  /** How much of what is already on the sheet this mark lifts and carries into
   *  its own wet edge, 0–1 (see `wet.ts`). This is what makes a pen line
   *  *bleed* when a wash crosses it, and what makes the order two washes were
   *  laid in visible in the result. */
  lift: number;
  /** How much further than usual the water carries past the nib — a multiplier
   *  the wet painters apply to their own spread. */
  spread: number;
};

/** How a mark this wet lands on this ground, over a page of this colour.
 *
 *  The page colour is here for one decision only — which way a stain runs (see
 *  `InkBlend.mode`) — and it is the *page*, not the mark: a sheet is dark or it
 *  is not, and every mark on it has to agree about that or two washes would
 *  mix one way and their overlap another. */
export function inkBlend(
  wetness: number,
  ground: GroundProfile,
  pageColor: string,
): InkBlend {
  const wet = wetting(wetness, ground);
  if (wet < WETTING_FLOOR) {
    return { mode: "source-over", lift: 0, spread: 1 };
  }
  return {
    mode: isDarkColor(pageColor) ? "screen" : "multiply",
    // What is carried is most of what the water found, because the water goes
    // *through* what is under it: a line the wash crossed comes out soft-edged
    // and blurred into it, not merely tinted. It stays short of everything
    // (`wet` is at most 1 and this is a fraction of it) so the mark under the
    // water is still the mark that was drawn.
    lift: wet * 0.85,
    spread: 1 + wet * 0.8,
  };
}

/** Whether a mark this wet does anything at all to what is under it on this
 *  ground — the cheap test the renderer and the mark cache ask before they do
 *  any of the expensive work. */
export function stains(wetness: number, ground: GroundProfile): boolean {
  return wetting(wetness, ground) >= WETTING_FLOOR;
}

/** Whether *anything* can stain on this ground. A sealed sheet answers no
 *  however wet the brush is, which is what lets every solid-page drawing — all
 *  of them, until someone picks a sheet — skip the whole mechanism. */
export function groundStains(ground: GroundProfile): boolean {
  return stains(1, ground);
}
