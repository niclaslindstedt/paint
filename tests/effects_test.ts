// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { ADJUST_KINDS, CURVE_CHANNELS } from "../src/app/adjust.ts";
import {
  BLUR_TAIL,
  choiceValue,
  controlRange,
  controlReadout,
  controlValue,
  curveSet,
  defaultScope,
  EFFECT_GROUPS,
  effectDescriptor,
  effectReach,
  effectReadout,
  CONTEXTUAL_EFFECTS,
  EFFECTS,
  effectsIn,
  listedEffectsIn,
  offersScope,
  switchValue,
  unclaimedControls,
  withChoice,
  withControl,
  withCurveSet,
  withSwitch,
  type Effect,
} from "../src/app/effects.ts";

// What an effect *is*, kept honest without a canvas.
//
// The pixels are `effectPaint.ts`'s and need a real 2D context to say anything
// about; everything that decides what the dialog offers — what a control writes,
// how a number reads, where an effect may be applied, and how far it can move
// ink — is arithmetic over plain objects and belongs here.
//
// Nothing here is persisted, which is the whole point of the redesign: an effect
// is a recipe the dialog holds for as long as it is open, and the drawing keeps
// the *result* (see `bake.ts`). So what these tests pin is the contract between
// the descriptors and the UI, not a document shape.

const blur: Effect = { kind: "blur", radius: 6 };
const noise: Effect = { kind: "noise", amount: 0.35, grain: 2 };

describe("the catalog", () => {
  it("gives every effect a preset its own controls can hold", () => {
    for (const descriptor of EFFECTS) {
      expect(descriptor.preset.kind).toBe(descriptor.kind);
      for (const control of descriptor.controls) {
        const value = controlValue(descriptor.preset, control.id);
        expect(value).toBeGreaterThanOrEqual(control.min);
        expect(value).toBeLessThanOrEqual(control.max);
      }
      // A readout has to name a control that exists. An effect may have none —
      // a curve has no single number to stand for it — but a name that points
      // nowhere is a typo.
      if (descriptor.readout !== undefined) {
        expect(
          descriptor.controls.some((c) => c.id === descriptor.readout),
        ).toBe(true);
      }
      // Every pick-one has to arrive on one of its own options, or the dialog
      // opens with a segmented control showing nothing selected.
      for (const choice of descriptor.choices ?? []) {
        const value = choiceValue(descriptor.preset, choice.id);
        expect(choice.options.map((o) => o.value)).toContain(value);
      }
      // …and every effect has to have somewhere to go.
      expect(descriptor.scopes.length).toBeGreaterThan(0);
    }
  });

  it("ships blur and noise, blur first", () => {
    expect(effectsIn("effects").map((e) => e.kind)).toEqual(["blur", "noise"]);
    expect(effectDescriptor("noise")?.nameKey).toBe("effects.noise.name");
    expect(effectDescriptor("sepia")).toBeUndefined();
  });

  it("lists every colour adjustment under the colour section", () => {
    // The panel renders a section per group off this, so an adjustment with no
    // group — or one filed under the wrong heading — is a row nobody can find.
    expect(effectsIn("color").map((e) => e.kind)).toEqual(ADJUST_KINDS);
    expect(EFFECT_GROUPS.map((g) => g.id)).toEqual([
      "effects",
      "image",
      "color",
    ]);
    for (const group of EFFECT_GROUPS) {
      expect(effectsIn(group.id).length).toBeGreaterThan(0);
    }
    // …and every effect is in exactly one of them.
    expect(EFFECT_GROUPS.flatMap((group) => effectsIn(group.id)).length).toBe(
      EFFECTS.length,
    );
  });

  it("offers the aimed effect contextually rather than as a row", () => {
    // Delete background is cut *through* a tracing, so it has nothing to do
    // until there is one. It says so on its descriptor, and that one flag is
    // what keeps it out of every arranged section and puts it in the panel's
    // Contextual block instead (see `panelSections.ts` and `SidePanel.tsx`).
    expect(CONTEXTUAL_EFFECTS.map((e) => e.kind)).toEqual(["cutout"]);
    expect(effectDescriptor("cutout")?.contextual).toBe(true);
    // It is still a member of its group — it is only not *listed* by it.
    expect(effectsIn("image").map((e) => e.kind)).toEqual(["cutout"]);
    expect(listedEffectsIn("image")).toEqual([]);
    // …and nothing else has been quietly taken off a section on the way.
    for (const group of EFFECT_GROUPS) {
      expect(listedEffectsIn(group.id)).toEqual(
        effectsIn(group.id).filter((effect) => !effect.contextual),
      );
    }
  });

  it("lets the colour work reach the whole stack", () => {
    // A tone is a property of the picture rather than of the sheet a mark was
    // made on, so "grade the whole thing" is the ordinary thing to want.
    for (const kind of ADJUST_KINDS) {
      expect(effectDescriptor(kind)!.scopes).toEqual(["layer", "drawing"]);
      // Nothing here moves ink, so a bake crops to exactly the marks.
      expect(effectReach(effectDescriptor(kind)!.preset)).toBe(0);
    }
  });

  it("gives curves an editor, four lines, and a bent one to open on", () => {
    const curves = effectDescriptor("curves")!;
    expect(curves.curve?.id).toBe("curves");
    expect(curves.curve?.channelId).toBe("channel");
    expect(curves.readout).toBeUndefined();
    const set = curveSet(curves.preset, "curves");
    expect(Object.keys(set).sort()).toEqual([...CURVE_CHANNELS].sort());
    // An effect that arrives changing nothing reads as one that is broken, and
    // a straight line changes nothing.
    expect(set.rgb.length).toBeGreaterThan(2);
  });
});

describe("where an effect may be applied", () => {
  it("keeps grain to one layer and lets a blur reach the whole stack", () => {
    // Grain belongs to the sheet a mark was made on; the same speck field laid
    // over every layer of a stack would be the same dust twice.
    expect(effectDescriptor("noise")!.scopes).toEqual(["layer"]);
    expect(effectDescriptor("blur")!.scopes).toEqual(["layer", "drawing"]);
  });

  it("opens on the narrower scope, and only offers a picker when there are two", () => {
    // An effect is destructive and the way back is undo, so the default is the
    // one that touches least.
    for (const descriptor of EFFECTS) {
      expect(defaultScope(descriptor)).toBe("layer");
    }
    expect(offersScope(effectDescriptor("blur")!)).toBe(true);
    expect(offersScope(effectDescriptor("noise")!)).toBe(false);
  });
});

describe("the controls", () => {
  it("reads and writes an option by the field it names", () => {
    expect(controlValue(blur, "radius")).toBe(6);
    expect(controlValue(blur, "amount")).toBe(0);
    expect(withControl(blur, "radius", 12)).toEqual({
      kind: "blur",
      radius: 12,
    });
  });

  it("drops a switch turned off rather than writing it false", () => {
    const on = withSwitch(noise, "color", true);
    expect(switchValue(on, "color")).toBe(true);
    expect(withSwitch(on, "color", false)).toEqual(noise);
    expect(switchValue(noise, "color")).toBe(false);
  });

  it("reads and writes a pick-one and a curve set", () => {
    const balance = effectDescriptor("balance")!.preset;
    expect(choiceValue(balance, "range")).toBe("midtones");
    expect(choiceValue(balance, "nothing")).toBe("");
    expect(choiceValue(withChoice(balance, "range", "shadows"), "range")).toBe(
      "shadows",
    );
    // An effect with no curve on it still hands the editor something to draw.
    expect(curveSet(blur, "curves").rgb).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    const bent = {
      rgb: [
        { x: 0, y: 0.2 },
        { x: 1, y: 1 },
      ],
    } as never;
    expect(curveSet(withCurveSet(blur, "curves", bent), "curves")).toBe(bent);
  });

  it("reads a strength as a percentage and a distance as pixels", () => {
    const [radius] = effectDescriptor("blur")!.controls;
    const [amount] = effectDescriptor("noise")!.controls;
    expect(controlReadout(radius!, 6)).toBe(6);
    expect(controlReadout(amount!, 0.35)).toBe(35);
    expect(effectReadout(blur)).toBe("6 px");
    expect(effectReadout(noise)).toBe("35%");

    // A tone reads the way a histogram labels its ends, a gamma to two
    // decimals, and an angle in degrees.
    const levels = effectDescriptor("levels")!;
    const black = levels.controls.find((c) => c.id === "black")!;
    const gamma = levels.controls.find((c) => c.id === "gamma")!;
    const turn = effectDescriptor("hue")!.controls.find((c) => c.id === "hue")!;
    expect(controlReadout(black, 0.06)).toBe(15);
    expect(controlReadout(gamma, 1.25)).toBe(1.25);
    expect(controlReadout(turn, -37.4)).toBe(-37);
    expect(effectReadout(levels.preset)).toBe("1");
    // A curve has no single number to stand for it, and says so rather than
    // making one up.
    expect(effectReadout(effectDescriptor("curves")!.preset)).toBe("");
  });
});

describe("a control claimed by a richer one", () => {
  it("leaves the levels sliders to the bar that draws them", () => {
    const levels = effectDescriptor("levels")!;
    const claimed = unclaimedControls(levels).map((c) => c.id);
    // All three of them are the bar's, so the dialog draws no slider at all
    // for this effect — the same three fields, reached by a control that shows
    // what they are for.
    expect(claimed).toEqual([]);
    expect(levels.controls).toHaveLength(3);
  });

  it("leaves every other effect's sliders exactly as they were", () => {
    for (const descriptor of EFFECTS) {
      if (descriptor.levels) continue;
      expect(unclaimedControls(descriptor)).toBe(descriptor.controls);
    }
  });

  it("only ever claims controls the effect actually has", () => {
    for (const descriptor of EFFECTS) {
      const levels = descriptor.levels;
      if (!levels) continue;
      for (const id of [levels.blackId, levels.whiteId, levels.gammaId]) {
        expect(controlRange(descriptor, id)).not.toBeNull();
      }
    }
  });
});

describe("effectReach", () => {
  it("is how far a blur can move ink, and nothing for the rest", () => {
    // What a bake grows its crop by, and what a preview pads its window cull
    // by: ink this far outside still fogs its way in, and cutting it off would
    // slice the fog square at the edge.
    expect(effectReach(blur)).toBe(blur.radius * BLUR_TAIL);
    // Grain lands on the pixel it is over, so it moves nothing.
    expect(effectReach(noise)).toBe(0);
  });
});
