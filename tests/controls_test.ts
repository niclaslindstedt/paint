// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { toMm } from "../src/app/units.ts";
import {
  hasDials,
  sizePreview,
  toolControl,
  usesInk,
  usesSize,
} from "../src/app/plugins/controls.ts";
import {
  pluginById,
  registerPlugin,
  resetPlugins,
  toolPlugins,
} from "../src/app/plugins/registry.ts";
import { freehandBehaviour } from "../src/app/plugins/builtin/freehand.ts";
import { handBehaviour } from "../src/app/plugins/builtin/hand.ts";
import { dropperBehaviour } from "../src/app/plugins/builtin/dropper.ts";
import { hasSwatches } from "../src/app/plugins/swatches.ts";

// What the toolbar offers beside the ink for the tool in hand: a width, a cog,
// or nothing (see `src/app/plugins/controls.ts`). Every answer is read off the
// descriptor, so these run with no DOM and a made-up tool is answered as
// confidently as a shipped one.

describe("toolControl", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("gives a width to everything that marks the page by its nib", () => {
    for (const id of ["pencil", "paintbrush", "airspray", "eraser", "text"]) {
      expect(toolControl(pluginById(id))).toBe("size");
    }
    // A shape draws at the width it is handed, so it gets one too.
    expect(toolControl(pluginById("rectangle"))).toBe("size");
  });

  it("gives the paint bucket a cog instead of a width", () => {
    // It fills the area it traced whatever the nib says, so a width would be a
    // slider that moved a number no mark reads — but the wash and the feathered
    // edge are real settings, and the cog is where they live.
    const bucket = pluginById("filler")!;
    expect(bucket.sizeless).toBe(true);
    expect(usesSize(bucket)).toBe(false);
    expect(hasDials(bucket)).toBe(true);
    expect(toolControl(bucket)).toBe("dials");
  });

  it("gives no button at all to a tool with nothing to set", () => {
    // The hand moves the view and the marquee chooses marks. Neither has a
    // width or a dial, and a button that opened an empty panel is worse than no
    // button. Note that neither declares `sizeless`: leaving no mark is already
    // on the descriptor.
    for (const id of ["hand", "select"]) {
      const plugin = pluginById(id)!;
      expect(plugin.sizeless).toBeUndefined();
      expect(toolControl(plugin)).toBe("none");
    }
  });

  it("gives the dropper a cog for the one thing it has to set", () => {
    // It leaves no mark, so it has no width — but how much page one press reads
    // is a real setting, and a tool with settings and no width is what the cog
    // is for.
    const dropper = pluginById("dropper")!;
    expect(usesSize(dropper)).toBe(false);
    expect(toolControl(dropper)).toBe("dials");
  });

  it("gives a tool that mixes its own inks a cog, and dims the ink button", () => {
    // The gradient pours from the colours on its own panel, so the toolbar's
    // ink means nothing while it is in hand — and the panel those colours live
    // in is the one the cog opens.
    const gradient = pluginById("gradient")!;
    expect(usesSize(gradient)).toBe(false);
    expect(toolControl(gradient)).toBe("dials");
    expect(usesInk(gradient)).toBe(false);
  });

  it("answers 'none' for a tool this build doesn't ship", () => {
    expect(toolControl(undefined)).toBe("none");
    expect(usesSize(undefined)).toBe(false);
  });

  it("reads a tool that is registered later, without being told about it", () => {
    registerPlugin({
      id: "washer",
      nameKey: "tools.filler.name",
      descriptionKey: "tools.filler.description",
      icon: () => null,
      sizeless: true,
      dials: [
        {
          id: "soak",
          nameKey: "dials.flow.name",
          hintKey: "dials.flow.hint",
          min: 0,
          max: 1,
          step: 0.1,
        },
      ],
      behaviour: handBehaviour,
    });
    expect(toolControl(pluginById("washer"))).toBe("dials");

    registerPlugin({
      id: "smudger",
      nameKey: "tools.pencil.name",
      descriptionKey: "tools.pencil.description",
      icon: () => null,
      behaviour: freehandBehaviour(),
    });
    // Nothing declared: a tool that marks the page has a width by default.
    expect(toolControl(pluginById("smudger"))).toBe("size");
  });
});

describe("usesInk", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("strikes the swatch out for the tools the colour means nothing to", () => {
    // Lifting ink, moving the view, choosing marks: none of the three paints,
    // and none of them writes the colour either.
    for (const id of ["eraser", "hand", "select"]) {
      expect(usesInk(pluginById(id))).toBe(false);
    }
  });

  it("keeps the dropper's swatch at full strength", () => {
    // The dropper paints nothing, so by the rule above it would be struck out —
    // but the swatch is where the colour it samples lands, and it is the *only*
    // place a sampled colour is shown. A struck-through read-out is a read-out
    // that says the tool did nothing.
    const dropper = pluginById("dropper")!;
    expect(dropper.picksColor).toBe(true);
    expect(usesInk(dropper)).toBe(true);
  });

  it("keeps it even for a sampling tool that carries inks of its own", () => {
    // The order inside `usesInk` is load-bearing, not incidental: a tool that
    // mixes its own colours loses the ink button, and a tool that *samples*
    // keeps it — so a tool that did both would come out struck through if the
    // swatch rule were asked first, and its one read-out would be crossed out.
    // Nothing ships like this today; the test is what stops the next rule added
    // here from quietly taking the dropper's swatch away with it.
    registerPlugin({
      id: "sampler",
      nameKey: "tools.dropper.name",
      descriptionKey: "tools.dropper.description",
      icon: () => null,
      picksColor: true,
      swatches: [{ id: "tint", nameKey: "swatches.from", default: "#ffffff" }],
      behaviour: dropperBehaviour,
    });
    const sampler = pluginById("sampler")!;
    expect(hasSwatches(sampler)).toBe(true);
    expect(usesInk(sampler)).toBe(true);
  });

  it("gives the ink to everything that lays it down", () => {
    for (const id of ["pencil", "paintbrush", "marker", "filler", "text"]) {
      expect(usesInk(pluginById(id))).toBe(true);
    }
    // …and to a tool this build doesn't ship: a swatch that works is the safer
    // guess about a tool nothing here can ask.
    expect(usesInk(undefined)).toBe(true);
  });
});

describe("sizePreview", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("is the press itself for every tool but the ones that rub out", () => {
    // An erasing mark is a hole, and a hole shows nothing on the bare page a
    // preview is — so both rubbers draw their width as the circle their nib is.
    // Everything else previews as the mark it leaves.
    const circles = toolPlugins()
      .filter((p) => sizePreview(p) === "circle")
      .map((p) => p.id);
    expect(circles).toEqual(["eraser", "rubber"]);
    expect(sizePreview(pluginById("pencil"))).toBe("press");
    expect(sizePreview(undefined)).toBe("press");
  });

  it("leaves a circled tool an ordinary tool everywhere else", () => {
    // The preview is a drawing decision and nothing more: the eraser still
    // takes a width, still has one to set, and still opens the size panel.
    const eraser = pluginById("eraser")!;
    expect(usesSize(eraser)).toBe(true);
    expect(toolControl(eraser)).toBe("size");
    // A block rubber, ten millimetres across the face.
    expect(toMm(eraser.defaultSize!)).toBeCloseTo(10, 6);
  });
});
