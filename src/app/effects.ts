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

import type { TKey } from "./i18n/index.ts";

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
    };

export type EffectKind = Effect["kind"];

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
  /** How the number reads: a real distance on the page, or a fraction of full
   *  strength shown as a percentage. */
  unit: "px" | "percent";
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
  nameKey: TKey;
  hintKey: TKey;
  controls: readonly EffectControl[];
  switches: readonly EffectSwitch[];
  /** The control whose value stands for the effect on the panel's row — the one
   *  that says how much of it there is. */
  readout: string;
  /** The effect as it arrives, which is deliberately a *visible* setting: an
   *  effect applied that changes nothing reads as one that is broken. */
  preset: Effect;
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

/** The effects, in the order the panel lists them. */
export const EFFECTS: readonly EffectDescriptor[] = [
  {
    kind: "blur",
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
    preset: { kind: "blur", radius: 6 },
    scopes: ["layer", "drawing"],
  },
  {
    kind: "noise",
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
    preset: { kind: "noise", amount: 0.35, grain: 2 },
    scopes: ["layer"],
  },
];

/** What one kind offers. Every kind has a descriptor, so this only answers
 *  `undefined` for a string that is not an effect at all. */
export function effectDescriptor(kind: string): EffectDescriptor | undefined {
  return EFFECTS.find((effect) => effect.kind === kind);
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
  return control.unit === "percent"
    ? Math.round(value * 100)
    : Math.round(value);
}

/** How an effect's strength reads at a glance: the number that says how much of
 *  it there is, with its unit. Not a catalog string — "px" and "%" are symbols. */
export function effectReadout(effect: Effect): string {
  const descriptor = effectDescriptor(effect.kind);
  const control = descriptor?.controls.find((c) => c.id === descriptor.readout);
  if (!control) return "";
  const value = controlValue(effect, control.id);
  return control.unit === "percent"
    ? `${Math.round(value * 100)}%`
    : `${Math.round(value)} px`;
}
