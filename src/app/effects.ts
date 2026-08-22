// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Effects: a change made *to* the picture, once.
//
// An effect is not a setting on the page and is not seen "through" — it is an
// edit. You choose how soft or how grainy, you apply it, and what comes back is
// a layer whose marks have been rasterised into a single bitmap with the effect
// already in it. Blur the same layer again and you blur the blur, exactly as you
// would with a real second pass. Nothing lives on: a line drawn afterwards is
// sharp, because the softening happened to the pixels that were there when you
// asked and to nothing else.
//
// That is a deliberate reversal. These two used to be *filters* — numbers on the
// drawing saying how the finished picture is composited, applied on every frame
// forever — which kept the document purely vector and cost exactly what it
// sounds like it costs: every stroke on a blurred layer re-softened the whole
// layer on every frame of the gesture, so rubbing out on a blurred watercolour
// crawled. A one-shot effect pays that price once, at the moment you ask for it.
//
// The price it pays instead is bytes and history: the marks that went into the
// bake are gone from the document (undo brings them back, a reload does not),
// and the layer is a PNG rather than a stroke list. That is the trade the word
// "effect" is making, and the panel says so.
//
// This module is pure and DOM-free: what the effects *are*, what they offer to
// set, and where they may be applied. The pixels are `effectPaint.ts`'s, and
// turning a layer into a baked bitmap is `bake.ts`'s.
//
// Nothing outside here knows an effect by name. The descriptors say what each
// one offers, the panel renders the list, and the dialog renders the controls —
// the same shape the tool plugins' dials use, and for the same reason: adding an
// effect should be a descriptor and its catalog strings, not a new dialog.

import { straightCurves, type Adjustment, type CurveSet } from "./adjust.ts";
import { CUTOUT_BAND, CUTOUT_BAND_MAX, CUTOUT_BAND_MIN } from "./cutout.ts";
import { SELECT_DRAW_TOOL_ID } from "./plugins/builtin/select.ts";
import type { TKey } from "./i18n/index.ts";
import type { Point } from "./types.ts";

/** One effect, as it is being set up. Never persisted — the drawing holds the
 *  *result*, not the recipe — so this type lives here rather than in the
 *  document model. */
export type Effect =
  | {
      kind: "blur";
      /** Gaussian standard deviation, in document pixels. */
      radius: number;
    }
  | {
      kind: "noise";
      /** How strongly the grain shows, 0–1. */
      amount: number;
      /** How big one speck is, in document pixels. */
      grain: number;
      /** Speckle the colours as well as the light. Absent — the usual case —
       *  means monochrome grain, which is what film leaves. */
      color?: boolean;
    }
  | {
      kind: "cutout";
      /** The traced subject: closed loops in document coordinates, read
       *  even-odd, stamped from the selection when the dialog opens. Not a
       *  setting — it is *what* the cut is aimed at, the way `scope` is where
       *  (see `cutout.ts` for what is done with it). */
      subject: readonly (readonly Point[])[];
      /** How far either side of the tracing the border is looked for, in
       *  document pixels. The tracing is a *prior*, strongest on the line and
       *  falling away outward, and this is where looking stops altogether — so
       *  it is both the reach and the promise: nothing outside the band can be
       *  taken or given back (see `cutout.ts`). */
      band: number;
      /** Softness of the cut edge, in document pixels. */
      feather: number;
      /** 0–1: how little colour difference still counts as the border. */
      tolerance: number;
      /** 0–1: how continuous the found border is required to be. */
      smoothness: number;
    }
  // …and the colour adjustments, which are effects in every way that matters
  // here — one pass over the pixels that are there, applied once — and differ
  // only in reaching them a pixel at a time. Their arithmetic is `adjust.ts`'s.
  | Adjustment;

export type EffectKind = Effect["kind"];

/** Which section of the panel an effect is listed under.
 *
 *  Three, and the split is by what you came to do rather than by how the
 *  pixels are reached: **Effects** are the passes that change what the marks
 *  *look like* — softened, grainy — **Image** is surgery on what the picture
 *  *is* — a subject cut out of its background — and **Colour** is the tonal
 *  work you would open an Image menu for. They share every mechanism (the
 *  same dialog, the same preview, the same bake), so this is one field and
 *  one filter rather than a second pipeline. */
export type EffectGroup = "effects" | "image" | "color";

/** The panel's sections, in the order it shows them, each with the heading it
 *  folds under. Adding a group is a row here and a catalog string. */
export const EFFECT_GROUPS: readonly {
  id: EffectGroup;
  titleKey: TKey;
}[] = [
  { id: "effects", titleKey: "effects.title" },
  { id: "image", titleKey: "effects.imageTitle" },
  { id: "color", titleKey: "effects.colorTitle" },
];

/** What an effect may be applied to.
 *
 *  - `layer`    the layer you have selected, and nothing else.
 *  - `drawing`  every layer that would take it — see `effectTargets`.
 *
 *  There is no "the page" scope any more, because there is no page-wide
 *  compositing step to hang one on: an effect lands on layers, so applying it
 *  everywhere is applying it to all of them. */
export type EffectScope = "layer" | "drawing";

/** One numeric option on an effect — a slider in the dialog, keyed by the field
 *  it writes on the effect itself. */
export type EffectControl = {
  id: string;
  /** Catalog key for the label, interpolated with `{value}`. The unit belongs
   *  in the string, as it does for a tool dial. */
  nameKey: TKey;
  min: number;
  max: number;
  step: number;
  /** How the number reads: a real distance on the page, a fraction of full
   *  strength shown as a percentage, an 8-bit tone (0–255, which is how every
   *  histogram in the world labels its ends), or a bare factor shown to two
   *  decimals. */
  unit: "px" | "percent" | "level" | "factor" | "degrees";
};

/** One pick-one-of-several option — a segmented control in the dialog, keyed by
 *  the string field it writes. */
export type EffectChoice = {
  id: string;
  nameKey: TKey;
  options: readonly { value: string; labelKey: TKey }[];
};

/** The one control that is not a number: a tone curve, and which of its lines
 *  the hand is on. An effect declares it and the dialog renders the editor —
 *  the same "the descriptor says what it offers" arrangement as the sliders,
 *  with one more thing it can offer. */
export type EffectCurve = {
  /** The field holding the curve set. */
  id: string;
  /** The choice naming which line is being edited. */
  channelId: string;
  labelKey: TKey;
  hintKey: TKey;
  resetKey: TKey;
};

/** The other control that is not a slider: three numbers drawn *over a picture
 *  of the tones they are aimed at*.
 *
 *  A black point, a white point and a midtone gamma are perfectly expressible as
 *  three sliders, and were — but three sliders are the one shape that cannot
 *  answer the question you actually have in front of a levels control, which is
 *  "where does the picture start and where does it stop?". Drawn over a
 *  histogram the answer is the shape itself: pull the ends in to where the data
 *  is and the picture opens out.
 *
 *  So an effect may claim three of its own controls for a levels bar. The
 *  dialog then renders the bar instead of those sliders — they are the same
 *  three numbers on the same effect, reached by a control that shows what they
 *  are for. */
export type EffectLevels = {
  /** The controls it stands in for, by id. */
  blackId: string;
  whiteId: string;
  gammaId: string;
  labelKey: TKey;
  hintKey: TKey;
  resetKey: TKey;
  /** The button that puts the two ends on the ends of the data. */
  autoKey: TKey;
};

/** One on/off option — a toggle in the dialog. */
export type EffectSwitch = {
  id: string;
  nameKey: TKey;
  hintKey: TKey;
};

/** What one effect is: what it is called, what it offers to set, how far it may
 *  reach, and where it may be applied. */
export type EffectDescriptor = {
  kind: EffectKind;
  /** Which of the panel's sections lists it. */
  group: EffectGroup;
  nameKey: TKey;
  hintKey: TKey;
  controls: readonly EffectControl[];
  switches: readonly EffectSwitch[];
  /** Pick-one options, shown above the sliders. */
  choices?: readonly EffectChoice[];
  /** A tone curve, for the one effect that is a line rather than a number. */
  curve?: EffectCurve;
  /** A levels bar, for the one effect whose three numbers are places on a
   *  histogram. The controls it names are rendered by the bar rather than as
   *  sliders of their own — see `unclaimedControls`. */
  levels?: EffectLevels;
  /** The control whose value stands for the effect on the panel's row — the one
   *  that says how much of it there is. Absent for an effect with no single
   *  number to stand for it, which is what a curve is. */
  readout?: string;
  /** The effect as it arrives, which is deliberately a *visible* setting: an
   *  effect applied that changes nothing reads as one that is broken. */
  preset: Effect;
  /**
   * The preview costs more than a frame, so a slider hands its value over when
   * the hand lets go rather than on every sample of the drag.
   *
   * Most of these are a composite or a lookup over pixels that are already on
   * screen, and cheap enough that the page can follow a thumb. Three are not: a
   * cut solves for the subject's true edge in a band around the tracing, a blur
   * copies the window off and lays it back through a filter, and a grain builds
   * a speck tile and repeats it across the sheet. At the hundred-odd samples a
   * second a pointer reports, the page stops *following* the slider and starts
   * running behind it — and a preview a second out of date is worse than one
   * that waits, because the number under your thumb and the picture in front of
   * you are answering different questions.
   *
   * So on these the readout follows the drag and the picture waits for the
   * release. Which is only a change of *when*: it is the same draft, the same
   * composite, and the same nothing-lands-until-Apply as every other effect.
   */
  settles?: boolean;
  /**
   * Listed by the **page's own section** rather than by its group's.
   *
   * A group whose every effect says this has no section of its own to print,
   * and Image is that group: the one effect in it is surgery on what the
   * picture *is*, which is what the page's section — resize, crop, turn — is
   * already the list of. Two headings both reading IMAGE, one under the other,
   * said less than one does.
   *
   * It is a row like any other row there, on always, and switchable from
   * Settings → Panel under the same id it would have had in its own section.
   */
  listedOnPage?: boolean;
  /**
   * The tool put into the hand when this effect's dialog opens.
   *
   * An effect that is *aimed* is useless without the thing that aims it, and
   * the press that opens it is the moment the user has decided to aim: opening
   * Delete background with nothing traced used to be a dialog whose only
   * content was "trace the subject first" and no way to start. Naming the tool
   * here means the dialog arrives with the pencil that makes a tracing already
   * in the hand — one flag on the descriptor rather than a screen that knows
   * which effect needs which tool.
   */
  aimTool?: string;
  /** The scopes this effect offers, in the order the dialog shows them, with
   *  the default first.
   *
   *  Grain is a property of the *sheet a mark was made on* — the same speck
   *  field laid over every layer of a stack would be the same dust twice, and
   *  scattering it across a photo layer and a caption layer alike is not a thing
   *  anyone means. So noise is a layer's, full stop. A blur is a distance, and
   *  "soften the whole drawing" is a perfectly ordinary thing to want, so it
   *  offers both. */
  scopes: readonly EffectScope[];
};

/** How soft a blur may be asked to be, in document pixels. Past this the page
 *  is a fog rather than a picture, and every pixel of it costs. */
export const MAX_BLUR = 48;

/** How big one speck of grain may be. Past a few pixels it stops reading as
 *  noise and starts reading as a pattern. */
export const MAX_GRAIN = 8;

/** What the grain's strength slider means at the top of its travel.
 *
 *  Every pixel of the page gets a speck, so raw alpha reads far heavier than
 *  the number suggests — at full opacity the drawing disappears under the dust.
 *  This is the ceiling that makes the slider's whole range worth having: 100% is
 *  heavy grain, not a snowstorm. */
export const GRAIN_CEILING = 0.45;

/** How far past its standard deviation a Gaussian is worth sampling. Three is
 *  where it falls under a thousandth and stops being visible. */
export const BLUR_TAIL = 3;

/** Every effect, in the order the panel lists them — the softening passes
 *  first, then the colour work. One registry rather than two: which section a
 *  row appears under is the descriptor's `group`, and everything downstream (the
 *  dialog, the preview, the bake) is the same machinery for all of them. */
export const EFFECTS: readonly EffectDescriptor[] = [
  {
    kind: "blur",
    group: "effects",
    nameKey: "effects.blur.name",
    hintKey: "effects.blur.hint",
    readout: "radius",
    controls: [
      {
        id: "radius",
        nameKey: "effects.blur.radius",
        min: 1,
        max: MAX_BLUR,
        step: 1,
        unit: "px",
      },
    ],
    switches: [],
    settles: true,
    preset: { kind: "blur", radius: 6 },
    scopes: ["layer", "drawing"],
  },
  {
    kind: "noise",
    group: "effects",
    nameKey: "effects.noise.name",
    hintKey: "effects.noise.hint",
    readout: "amount",
    controls: [
      {
        id: "amount",
        nameKey: "effects.noise.amount",
        min: 0.05,
        max: 1,
        step: 0.05,
        unit: "percent",
      },
      {
        id: "grain",
        nameKey: "effects.noise.grain",
        min: 1,
        max: MAX_GRAIN,
        step: 1,
        unit: "px",
      },
    ],
    switches: [
      {
        id: "color",
        nameKey: "effects.noise.color",
        hintKey: "effects.noise.colorHint",
      },
    ],
    settles: true,
    preset: { kind: "noise", amount: 0.35, grain: 2 },
    scopes: ["layer"],
  },
  {
    kind: "cutout",
    group: "image",
    // Surgery on the picture, so it is listed with the page's own actions
    // rather than under a second Image heading — see `listedOnPage`.
    listedOnPage: true,
    // …and it is aimed, so opening it hands you the thing that aims it.
    aimTool: SELECT_DRAW_TOOL_ID,
    nameKey: "effects.cutout.name",
    hintKey: "effects.cutout.hint",
    readout: "feather",
    controls: [
      // The reach comes first: it is the one dial that says *where the cut is
      // allowed to look*, and the band it names is drawn on the page while you
      // trace (see `SelectionFrame.tsx`), so it is the dial you set by eye
      // rather than by result.
      {
        id: "band",
        nameKey: "effects.cutout.band",
        min: CUTOUT_BAND_MIN,
        max: CUTOUT_BAND_MAX,
        step: 1,
        unit: "px",
      },
      {
        id: "feather",
        nameKey: "effects.cutout.feather",
        min: 0,
        max: 10,
        step: 1,
        unit: "px",
      },
      {
        id: "tolerance",
        nameKey: "effects.cutout.tolerance",
        min: 0.05,
        max: 1,
        step: 0.05,
        unit: "percent",
      },
      {
        id: "smoothness",
        nameKey: "effects.cutout.smoothness",
        min: 0,
        max: 1,
        step: 0.05,
        unit: "percent",
      },
    ],
    switches: [],
    settles: true,
    // The preset's subject is empty by construction — the real one is stamped
    // from the selection when the dialog opens (see `useEffecting.ts`), which
    // is also why this effect alone can arrive with nothing to do.
    preset: {
      kind: "cutout",
      subject: [],
      band: CUTOUT_BAND,
      feather: 1,
      tolerance: 0.5,
      smoothness: 0.35,
    },
    // A cut is aimed through a tracing of *one* picture's subject; "cut every
    // layer to it" would slice captions and sketches to a photo's silhouette.
    scopes: ["layer"],
  },
  {
    kind: "brightness",
    group: "color",
    nameKey: "effects.brightness.name",
    hintKey: "effects.brightness.hint",
    readout: "contrast",
    controls: [
      {
        id: "brightness",
        nameKey: "effects.brightness.brightness",
        min: -1,
        max: 1,
        step: 0.01,
        unit: "percent",
      },
      {
        id: "contrast",
        nameKey: "effects.brightness.contrast",
        min: -1,
        max: 1,
        step: 0.01,
        unit: "percent",
      },
    ],
    switches: [],
    // Contrast alone rather than a nudge of both: brightness and contrast pull
    // against each other in the shadows, and a preset that set both landed on a
    // picture that looked untouched — which is the one thing a preset here may
    // not do.
    preset: { kind: "brightness", brightness: 0, contrast: 0.35 },
    scopes: ["layer", "drawing"],
  },
  {
    kind: "levels",
    group: "color",
    nameKey: "effects.levels.name",
    hintKey: "effects.levels.hint",
    readout: "gamma",
    controls: [
      {
        id: "black",
        nameKey: "effects.levels.black",
        min: 0,
        max: 0.9,
        step: 1 / 255,
        unit: "level",
      },
      {
        id: "white",
        nameKey: "effects.levels.white",
        min: 0.1,
        max: 1,
        step: 1 / 255,
        unit: "level",
      },
      {
        id: "gamma",
        nameKey: "effects.levels.gamma",
        min: 0.1,
        max: 3,
        step: 0.01,
        unit: "factor",
      },
    ],
    switches: [],
    levels: {
      blackId: "black",
      whiteId: "white",
      gammaId: "gamma",
      labelKey: "effects.levels.editor",
      hintKey: "effects.levels.editorHint",
      resetKey: "effects.levels.reset",
      autoKey: "effects.levels.auto",
    },
    preset: { kind: "levels", black: 0.06, white: 0.94, gamma: 1 },
    scopes: ["layer", "drawing"],
  },
  {
    kind: "curves",
    group: "color",
    nameKey: "effects.curves.name",
    hintKey: "effects.curves.hint",
    controls: [],
    switches: [],
    choices: [
      {
        id: "channel",
        nameKey: "effects.curves.channel",
        options: [
          { value: "rgb", labelKey: "effects.curves.channelRgb" },
          { value: "r", labelKey: "effects.curves.channelRed" },
          { value: "g", labelKey: "effects.curves.channelGreen" },
          { value: "b", labelKey: "effects.curves.channelBlue" },
        ],
      },
    ],
    curve: {
      id: "curves",
      channelId: "channel",
      labelKey: "effects.curves.editor",
      hintKey: "effects.curves.editorHint",
      resetKey: "effects.curves.reset",
    },
    // The gentle S every photograph gets sooner or later: shadows down a
    // little, highlights up a little. It is a *visible* setting for the same
    // reason every other preset here is one — the dialog previews, and a curve
    // that arrives straight previews as nothing at all.
    preset: {
      kind: "curves",
      channel: "rgb",
      curves: {
        ...straightCurves(),
        rgb: [
          { x: 0, y: 0 },
          { x: 0.25, y: 0.2 },
          { x: 0.75, y: 0.8 },
          { x: 1, y: 1 },
        ],
      },
    },
    scopes: ["layer", "drawing"],
  },
  {
    kind: "hue",
    group: "color",
    nameKey: "effects.hue.name",
    hintKey: "effects.hue.hint",
    readout: "saturation",
    controls: [
      {
        id: "hue",
        nameKey: "effects.hue.hue",
        min: -180,
        max: 180,
        step: 1,
        unit: "degrees",
      },
      {
        id: "saturation",
        nameKey: "effects.hue.saturation",
        min: -1,
        max: 1,
        step: 0.01,
        unit: "percent",
      },
      {
        id: "lightness",
        nameKey: "effects.hue.lightness",
        min: -1,
        max: 1,
        step: 0.01,
        unit: "percent",
      },
    ],
    switches: [],
    preset: { kind: "hue", hue: 0, saturation: 0.3, lightness: 0 },
    scopes: ["layer", "drawing"],
  },
  {
    kind: "balance",
    group: "color",
    nameKey: "effects.balance.name",
    hintKey: "effects.balance.hint",
    readout: "red",
    choices: [
      {
        id: "range",
        nameKey: "effects.balance.range",
        options: [
          { value: "shadows", labelKey: "effects.balance.rangeShadows" },
          { value: "midtones", labelKey: "effects.balance.rangeMidtones" },
          { value: "highlights", labelKey: "effects.balance.rangeHighlights" },
        ],
      },
    ],
    controls: [
      {
        id: "red",
        nameKey: "effects.balance.red",
        min: -1,
        max: 1,
        step: 0.01,
        unit: "percent",
      },
      {
        id: "green",
        nameKey: "effects.balance.green",
        min: -1,
        max: 1,
        step: 0.01,
        unit: "percent",
      },
      {
        id: "blue",
        nameKey: "effects.balance.blue",
        min: -1,
        max: 1,
        step: 0.01,
        unit: "percent",
      },
    ],
    switches: [
      {
        id: "luminosity",
        nameKey: "effects.balance.luminosity",
        hintKey: "effects.balance.luminosityHint",
      },
    ],
    preset: {
      kind: "balance",
      range: "midtones",
      red: 0.25,
      green: 0,
      blue: -0.15,
    },
    scopes: ["layer", "drawing"],
  },
  {
    kind: "desaturate",
    group: "color",
    nameKey: "effects.desaturate.name",
    hintKey: "effects.desaturate.hint",
    readout: "amount",
    controls: [
      {
        id: "amount",
        nameKey: "effects.desaturate.amount",
        min: 0.05,
        max: 1,
        step: 0.05,
        unit: "percent",
      },
    ],
    switches: [],
    preset: { kind: "desaturate", amount: 1 },
    scopes: ["layer", "drawing"],
  },
];

/** What one kind offers. Every kind has a descriptor, so this only answers
 *  `undefined` for a string that is not an effect at all. */
export function effectDescriptor(kind: string): EffectDescriptor | undefined {
  return EFFECTS.find((effect) => effect.kind === kind);
}

/** Every effect filed under one group, in registry order — what the group *is*,
 *  contextual ones included. */
export function effectsIn(group: EffectGroup): EffectDescriptor[] {
  return EFFECTS.filter((effect) => effect.group === group);
}

/** The effects a group's own section actually **lists** — the same set minus
 *  the ones the page's section lists instead (see
 *  `EffectDescriptor.listedOnPage`). The panel and the settings page both ask
 *  here, so "this one has no row of its own" is one rule in one place; a group
 *  with nothing left to list stops being a section at all rather than printing
 *  a heading over an empty box. */
export function listedEffectsIn(group: EffectGroup): EffectDescriptor[] {
  return effectsIn(group).filter((effect) => !effect.listedOnPage);
}

/** The effects the page's own section lists, in registry order — the surgery on
 *  the picture, sitting with resize and crop rather than under a heading of its
 *  own. */
export const PAGE_EFFECTS: readonly EffectDescriptor[] = EFFECTS.filter(
  (effect) => effect.listedOnPage,
);

/** Give an effect the traced subject it is aimed through. A no-op for every
 *  effect that does not take one, so the dialog can stamp the selection on
 *  whatever it opens without knowing which effect wants it — and a no-op for
 *  the *same* tracing handed in twice, so a screen that re-aims an open effect
 *  as the outline is drawn (see `useEffecting`) hands the mark cache the draft
 *  it already has rather than a copy of it. */
export function withSubject(
  effect: Effect,
  subject: readonly (readonly Point[])[],
): Effect {
  if (effect.kind !== "cutout" || effect.subject === subject) return effect;
  return { ...effect, subject };
}

/** Whether this draft has what it needs to land: a traced subject for the
 *  effect that is aimed through one, and trivially yes for every other. The
 *  dialog reads it the way it reads `empty` — a dead Apply with a line saying
 *  why, rather than a button that silently does nothing. */
export function hasSubject(effect: Effect): boolean {
  return effect.kind !== "cutout" || effect.subject.length > 0;
}

/** The scope an effect opens on — the first it offers, which is always the
 *  narrower one. An effect that lands on more of the drawing than you meant is
 *  the mistake worth defaulting away from: it is destructive, and the way back
 *  is undo. */
export function defaultScope(descriptor: EffectDescriptor): EffectScope {
  return descriptor.scopes[0] ?? "layer";
}

/** Whether an effect offers a choice of scope at all. A single-scope effect
 *  shows no picker — one option is not a decision. */
export function offersScope(descriptor: EffectDescriptor): boolean {
  return descriptor.scopes.length > 1;
}

/** The controls the dialog should draw a slider for: every one the effect
 *  declares, less any a richer control has claimed.
 *
 *  One claimer today — the levels bar, which is three of them at once — but the
 *  dialog asks this rather than knowing that, so the next control that stands in
 *  for a handful of numbers is a descriptor field and nothing else. */
export function unclaimedControls(
  descriptor: EffectDescriptor,
): readonly EffectControl[] {
  const levels = descriptor.levels;
  if (!levels) return descriptor.controls;
  const claimed = new Set([levels.blackId, levels.whiteId, levels.gammaId]);
  return descriptor.controls.filter((control) => !claimed.has(control.id));
}

/** One levels control's declared range, for the bar that has to place a handle
 *  inside it. `null` for a descriptor whose levels field names a control it does
 *  not have — which no descriptor in the box does, and which the bar then simply
 *  renders without. */
export function controlRange(
  descriptor: EffectDescriptor,
  id: string,
): EffectControl | null {
  return descriptor.controls.find((control) => control.id === id) ?? null;
}

/** How far this effect can move ink, in document pixels.
 *
 *  Zero for grain, which lands on the pixel it is over. A blur is not local, and
 *  the number decides how much room the bake has to leave around the marks: crop
 *  a softened layer to the ink it started with and the fog is sliced off square
 *  at the edge. */
export function effectReach(effect: Effect): number {
  return effect.kind === "blur" ? effect.radius * BLUR_TAIL : 0;
}

/** Read one option off an effect by id. An effect is a flat record of
 *  primitives by construction, which is what lets the dialog render a
 *  descriptor's controls without knowing which effect it is looking at. */
export function controlValue(effect: Effect, id: string): number {
  const value = (effect as unknown as Record<string, unknown>)[id];
  return typeof value === "number" ? value : 0;
}

/** Move one option. */
export function withControl(effect: Effect, id: string, value: number): Effect {
  return { ...effect, [id]: value } as Effect;
}

/** Read one pick-one option off an effect by id. */
export function choiceValue(effect: Effect, id: string): string {
  const value = (effect as unknown as Record<string, unknown>)[id];
  return typeof value === "string" ? value : "";
}

/** Move one pick-one option. */
export function withChoice(effect: Effect, id: string, value: string): Effect {
  return { ...effect, [id]: value } as Effect;
}

/** Read the curve set off an effect that has one — the straight lines for one
 *  that doesn't, so the editor always has something to draw. */
export function curveSet(effect: Effect, id: string): CurveSet {
  const value = (effect as unknown as Record<string, unknown>)[id];
  return value && typeof value === "object"
    ? (value as CurveSet)
    : straightCurves();
}

/** Replace the curve set. */
export function withCurveSet(
  effect: Effect,
  id: string,
  curves: CurveSet,
): Effect {
  return { ...effect, [id]: curves } as Effect;
}

export function switchValue(effect: Effect, id: string): boolean {
  return (effect as unknown as Record<string, unknown>)[id] === true;
}

/** Flip one switch. Switching it *off* drops the field rather than writing
 *  `false`, so an effect set back to its default is the object it started as. */
export function withSwitch(effect: Effect, id: string, on: boolean): Effect {
  const next = { ...effect } as unknown as Record<string, unknown>;
  if (on) next[id] = true;
  else delete next[id];
  return next as unknown as Effect;
}

/** How one slider's number reads: a strength as a whole percentage, a distance
 *  as whole document pixels. What the catalog string's `{value}` is filled
 *  with, exactly as a tool dial's is. */
export function controlReadout(control: EffectControl, value: number): number {
  if (control.unit === "percent") return Math.round(value * 100);
  // A tone reads the way a histogram labels its ends: 0 is black, 255 is white.
  if (control.unit === "level") return Math.round(value * 255);
  // A bare factor is the one number here that is not whole — 1.00 is neutral
  // and the interesting part of a gamma is the second decimal.
  if (control.unit === "factor") return Math.round(value * 100) / 100;
  return Math.round(value);
}

/** How an effect's strength reads at a glance: the number that says how much of
 *  it there is, with its unit. Not a catalog string — "px" and "%" are symbols. */
export function effectReadout(effect: Effect): string {
  const descriptor = effectDescriptor(effect.kind);
  if (!descriptor?.readout) return "";
  const control = descriptor.controls.find((c) => c.id === descriptor.readout);
  if (!control) return "";
  const value = controlReadout(control, controlValue(effect, control.id));
  return `${value}${UNIT_SUFFIX[control.unit]}`;
}

/** What a number wears after it. Not catalog strings — "px", "%" and "°" are
 *  symbols, and a level or a factor wears nothing at all. */
const UNIT_SUFFIX: Record<EffectControl["unit"], string> = {
  px: " px",
  percent: "%",
  degrees: "°",
  level: "",
  factor: "",
};
