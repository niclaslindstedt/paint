// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  BLUR_TAIL,
  controlReadout,
  controlValue,
  defaultScope,
  effectDescriptor,
  effectReach,
  effectReadout,
  EFFECTS,
  offersScope,
  switchValue,
  withControl,
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
      // The readout has to name a control that exists, or an effect has nothing
      // to say for itself.
      expect(descriptor.controls.some((c) => c.id === descriptor.readout)).toBe(
        true,
      );
      // …and every effect has to have somewhere to go.
      expect(descriptor.scopes.length).toBeGreaterThan(0);
    }
  });

  it("ships blur and noise, blur first", () => {
    expect(EFFECTS.map((e) => e.kind)).toEqual(["blur", "noise"]);
    expect(effectDescriptor("noise")?.nameKey).toBe("effects.noise.name");
    expect(effectDescriptor("sepia")).toBeUndefined();
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

  it("reads a strength as a percentage and a distance as pixels", () => {
    const [radius] = effectDescriptor("blur")!.controls;
    const [amount] = effectDescriptor("noise")!.controls;
    expect(controlReadout(radius!, 6)).toBe(6);
    expect(controlReadout(amount!, 0.35)).toBe(35);
    expect(effectReadout(blur)).toBe("6 px");
    expect(effectReadout(noise)).toBe("35%");
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
