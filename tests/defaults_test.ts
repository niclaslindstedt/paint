// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a fresh start is made of.
//
// The app has a starting state — a sheet, an ink, a tool, and how that tool is
// set — and it is worth pinning down for two reasons. It is **content**: the
// shipped answer names a plugin id and a preset id, and either one can be
// renamed out from under it by a change three files away, leaving a default
// that silently hands over something else. And it is a **projection**: applying
// it writes a width and a set of dials into the settings blob, and the rule
// that a default which happens to be the tool as it ships leaves no trace at
// all is exactly the kind of thing that rots quietly.

import { describe, expect, it } from "vitest";

import { SHIPPED_DEFAULTS, paintDefaults } from "../src/app/defaults.ts";
import {
  defaultPresetFor,
  paintDefaultsFrom,
  withDefaults,
  withPreset,
} from "../src/app/kit.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { toolPresets } from "../src/app/plugins/presets.ts";
import { pluginById } from "../src/app/plugins/registry.ts";
import { defaultSettings, toolSize } from "../src/app/useAppSettings.ts";

registerBuiltinPlugins();

describe("what this build ships", () => {
  it("names a tool that exists and actually marks the page", () => {
    const plugin = pluginById(SHIPPED_DEFAULTS.tool);
    expect(plugin, SHIPPED_DEFAULTS.tool).toBeDefined();
    expect(plugin!.navigates).toBeFalsy();
    expect(plugin!.picksColor).toBeFalsy();
    expect(plugin!.selects).toBeFalsy();
  });

  it("names a preset that tool actually ships", () => {
    const presets = toolPresets(pluginById(SHIPPED_DEFAULTS.tool));
    expect(presets.map((p) => p.id)).toContain(SHIPPED_DEFAULTS.preset);
  });

  it("is what a fresh install's settings say", () => {
    expect(paintDefaultsFrom(defaultSettings())).toEqual(SHIPPED_DEFAULTS);
  });

  it("is what a module with no app around it reads", () => {
    expect(paintDefaults()).toEqual(SHIPPED_DEFAULTS);
  });
});

describe("resolving the preset", () => {
  it("finds the one the tool ships with", () => {
    const preset = defaultPresetFor(defaultSettings(), "pencil");
    expect(preset?.size).toBe(
      toolPresets(pluginById("pencil")).find((p) => p.id === "liner")?.size,
    );
  });

  it("finds one the user saved under that id", () => {
    const settings = {
      ...defaultSettings(),
      defaultTool: "paintbrush",
      defaultPreset: "my-brush",
      toolPresets: {
        paintbrush: [
          { id: "my-brush", name: "My brush", size: 40, dials: { load: 0.9 } },
        ],
      },
    };
    expect(defaultPresetFor(settings, "paintbrush")?.size).toBe(40);
  });

  // A preset thrown away, or one from a build that shipped a different set, is
  // not an error — the tool simply arrives as its maker built it.
  it("comes back empty for an id nothing carries", () => {
    const settings = { ...defaultSettings(), defaultPreset: "no-such-preset" };
    expect(defaultPresetFor(settings, "pencil")).toBeNull();
    expect(
      defaultPresetFor({ ...defaultSettings(), defaultPreset: null }, "pencil"),
    ).toBeNull();
  });
});

describe("going back to them", () => {
  it("puts the default tool in your hand and unpins the ink", () => {
    const used = {
      ...defaultSettings(),
      activeTool: "airspray",
      color: "#ef4444",
    };
    const back = withDefaults(used);
    expect(back.activeTool).toBe(SHIPPED_DEFAULTS.tool);
    // `null` rather than the default colour itself: an unpicked ink *is* the
    // default, resolved at paint time, so changing the default later still
    // reaches the page.
    expect(back.color).toBeNull();
  });

  it("leaves no width or tuning behind for a shipped default", () => {
    // The pen's liner is the pen exactly as it comes, so a blob that has been
    // reset is the blob a fresh install writes rather than one carrying numbers
    // that happen to equal the defaults.
    const fattened = withPreset(defaultSettings(), "pencil", {
      size: 40,
      dials: { opacity: 0.4 },
    });
    expect(fattened.toolSizes.pencil).toBe(40);
    const back = withDefaults(fattened);
    expect(back.toolSizes.pencil).toBeUndefined();
    expect(back.toolDials.pencil).toBeUndefined();
    expect(toolSize(back, "pencil")).toBe(pluginById("pencil")!.defaultSize);
  });

  it("sets the tool to a default that is not its stock one", () => {
    const guide = toolPresets(pluginById("pencil")).find(
      (p) => p.id === "guide",
    )!;
    const back = withDefaults({
      ...defaultSettings(),
      defaultPreset: "guide",
    });
    expect(toolSize(back, "pencil")).toBe(guide.size);
    expect(back.toolDials.pencil).toEqual({ opacity: guide.dials.opacity });
  });

  it("keeps everything that isn't the kit", () => {
    const mine = {
      ...defaultSettings(),
      customColors: ["#123456"],
      toolSizes: { marker: 40 },
      showGrid: true,
    };
    const back = withDefaults(mine);
    expect(back.customColors).toEqual(["#123456"]);
    expect(back.toolSizes.marker).toBe(40);
    expect(back.showGrid).toBe(true);
  });

  // A default naming a tool that has since been switched off would otherwise
  // hand over a canvas that ignores the pointer.
  it("hands over something that draws when the default is switched off", () => {
    const back = withDefaults({
      ...defaultSettings(),
      defaultTool: "watercolor",
      enabledPlugins: [],
    });
    const plugin = pluginById(back.activeTool)!;
    expect(plugin.navigates).toBeFalsy();
    expect(plugin.picksColor).toBeFalsy();
    expect(plugin.selects).toBeFalsy();
  });
});
