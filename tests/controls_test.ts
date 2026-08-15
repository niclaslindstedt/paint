// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  hasDials,
  sizePreview,
  toolControl,
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

  it("gives no button at all to a tool that leaves no mark", () => {
    // The hand moves the view, the dropper reads a colour, the marquee chooses
    // marks. None of them has a width or a dial, and a button that opened an
    // empty panel is worse than no button. Note that none of the three declares
    // `sizeless`: leaving no mark is already on the descriptor.
    for (const id of ["hand", "dropper", "select"]) {
      const plugin = pluginById(id)!;
      expect(plugin.sizeless).toBeUndefined();
      expect(toolControl(plugin)).toBe("none");
    }
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

describe("sizePreview", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("is the press itself for every tool but the one that rubs out", () => {
    // The eraser's mark is a hole, and a hole shows nothing on the bare page a
    // preview is — so its width is drawn as the circle its nib is. Everything
    // else previews as the mark it leaves.
    const circles = toolPlugins()
      .filter((p) => sizePreview(p) === "circle")
      .map((p) => p.id);
    expect(circles).toEqual(["eraser"]);
    expect(sizePreview(pluginById("pencil"))).toBe("press");
    expect(sizePreview(undefined)).toBe("press");
  });

  it("leaves a circled tool an ordinary tool everywhere else", () => {
    // The preview is a drawing decision and nothing more: the eraser still
    // takes a width, still has one to set, and still opens the size panel.
    const eraser = pluginById("eraser")!;
    expect(usesSize(eraser)).toBe(true);
    expect(toolControl(eraser)).toBe("size");
    expect(eraser.defaultSize).toBe(8);
  });
});
