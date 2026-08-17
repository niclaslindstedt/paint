// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Tool options — the app-wide settings a tool declares for itself.
//
// The seam's whole claim is that a tool can own a *rendering* setting without
// anything outside `plugins/` learning what it is: the panel renders whatever
// the descriptor lists, and the value goes into the settings blob under the
// option's own id. So these pin the two halves that hold that up — the
// resolution rules (a default per option, a stored value pulled back onto the
// control, an answer nobody offers refused) and the contract the wiring rests
// on: **an option id is a settings key, and its default is that setting's
// default.** The screen writes one with an ordinary `update`, so a descriptor
// that names something else would write a key nothing reads.

import { beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { hasSettings, toolControl } from "../src/app/plugins/controls.ts";
import {
  hasOptions,
  isToolOption,
  optionAnswer,
  optionValue,
  resolveOptions,
  shownOptions,
} from "../src/app/plugins/options.ts";
import {
  allPlugins,
  pluginById,
  resetPlugins,
} from "../src/app/plugins/registry.ts";
import { WASH_DETAIL_OPTION } from "../src/app/plugins/washOptions.ts";
import { MIN_WASH_DETAIL } from "../src/app/plugins/wash.ts";
import type { PaintPlugin, ToolOption } from "../src/app/plugins/types.ts";
import {
  defaultSettings,
  type AppSettings,
} from "../src/app/useAppSettings.ts";

/** A `choice` option with something hanging off one of its answers.
 *
 *  No tool ships one today — the two engine pickers that used to be the whole
 *  reason `choice` and `shownWhen` exist went away when the app settled on one
 *  watercolour and one pencil. The seam kept them: an option is what a *plugin*
 *  declares, and a build with one tool that wants a picker should not have to
 *  reintroduce the mechanism. So the mechanism is tested against a plugin's
 *  worth of declaration rather than against whatever the shipped tools happen to
 *  use this month. */
const NIB_OPTION: ToolOption = {
  kind: "choice",
  id: "testNib",
  nameKey: "options.title",
  answers: [
    {
      value: "round",
      nameKey: "options.washDetail",
      hintKey: "options.washDetailHint",
    },
    {
      value: "chisel",
      nameKey: "options.leadDetail",
      hintKey: "options.leadDetailHint",
    },
  ],
  default: "round",
};

/** …and one that only makes sense while a particular answer is picked. */
const NIB_ANGLE_OPTION: ToolOption = {
  kind: "range",
  id: "testNibAngle",
  nameKey: "options.title",
  hintKey: "options.leadDetailHint",
  min: -90,
  max: 90,
  step: 5,
  default: 0,
  shownWhen: { option: "testNib", is: "chisel" },
};

describe("the options a tool declares", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("hangs the wash setting off the brush it is about", () => {
    // It used to be a section of Settings → Tools. It belongs to the tool, so
    // it is declared by it and shown in its own panel.
    const watercolor = pluginById("watercolor");
    expect(watercolor?.options?.map((option) => option.id)).toEqual([
      "washDetail",
    ]);
    expect(hasOptions(watercolor)).toBe(true);
  });

  it("hangs the pencil's off the pencil, the same way", () => {
    // The second tool to have an opinion about how its own marks are painted,
    // and the seam held: one more descriptor, no screen the wiser.
    const graphite = pluginById("graphite");
    expect(graphite?.options?.map((option) => option.id)).toEqual([
      "leadDetail",
    ]);
    expect(hasOptions(graphite)).toBe(true);
    // …and by nothing else today. A tool with no opinion about how its marks
    // are painted declares none, and gets no such section at all.
    const withOptions = allPlugins().filter(hasOptions);
    expect(withOptions.map((plugin) => plugin.id)).toEqual([
      "graphite",
      "watercolor",
    ]);
  });

  it("leaves both shipped tools with nothing to choose between", () => {
    // The point of dropping the second watercolour and the second pencil: the
    // panel under the widths is two speed sliders now, not two questions about
    // rendering engines that only a swatch could answer.
    for (const id of ["graphite", "watercolor"]) {
      for (const option of pluginById(id)?.options ?? []) {
        expect(option.kind).toBe("range");
      }
    }
  });

  it("names settings that exist, at the values they default to", () => {
    // The contract the screen's `update` rests on: an option *is* a setting.
    const settings = defaultSettings() as unknown as Record<string, unknown>;
    for (const plugin of allPlugins()) {
      for (const option of plugin.options ?? []) {
        expect(Object.keys(defaultSettings())).toContain(option.id);
        expect(settings[option.id]).toEqual(option.default);
      }
    }
  });

  it("is nowhere near a dial", () => {
    // The two kinds must not collide: a dial rides on the stroke under its id,
    // an option lives in the settings blob under its own. A shared id would
    // mean one of them silently reading the other.
    for (const plugin of allPlugins()) {
      const dials = new Set((plugin.dials ?? []).map((dial) => dial.id));
      for (const option of plugin.options ?? []) {
        expect(dials.has(option.id)).toBe(false);
      }
    }
  });

  it("recognises an id some tool declares, and only that", () => {
    expect(isToolOption(allPlugins(), "washDetail")).toBe(true);
    expect(isToolOption(allPlugins(), "devMode")).toBe(false);
  });

  it("gives a widthless tool with only options somewhere to set them", () => {
    // The cog is offered on `hasSettings`, so a tool whose only setting is how
    // its marks are painted still gets a panel (see `plugins/controls.ts`).
    const tool = {
      id: "test-option-only",
      nameKey: "tools.watercolor.name",
      descriptionKey: "tools.watercolor.description",
      icon: () => null,
      sizeless: true,
      options: [NIB_OPTION],
      behaviour: {
        start: () => null,
        move: (draft: never) => draft,
        paint: () => undefined,
      },
    } as unknown as PaintPlugin;
    expect(hasSettings(tool)).toBe(true);
    expect(toolControl(tool)).toBe("dials");
  });
});

describe("resolving an option", () => {
  it("answers with the default for a value nobody set", () => {
    expect(optionValue(NIB_OPTION, undefined)).toBe("round");
    expect(optionValue(WASH_DETAIL_OPTION, undefined)).toBe(1);
  });

  it("refuses an answer the option does not offer", () => {
    expect(optionValue(NIB_OPTION, "chisel")).toBe("chisel");
    expect(optionValue(NIB_OPTION, "quantum")).toBe("round");
    expect(optionValue(NIB_OPTION, 3)).toBe("round");
  });

  it("pulls a number back onto its own track", () => {
    expect(optionValue(WASH_DETAIL_OPTION, 0.4)).toBe(0.4);
    expect(optionValue(WASH_DETAIL_OPTION, 0)).toBe(MIN_WASH_DETAIL);
    expect(optionValue(WASH_DETAIL_OPTION, 9)).toBe(1);
    expect(optionValue(WASH_DETAIL_OPTION, "half")).toBe(1);
  });

  it("reads every option a tool declares straight off the settings", () => {
    const settings: AppSettings = { ...defaultSettings(), washDetail: 0.35 };
    resetPlugins();
    registerBuiltinPlugins();
    expect(resolveOptions(pluginById("watercolor"), settings)).toEqual({
      washDetail: 0.35,
    });
    // A tool with none comes back empty, which is how the panel knows to show
    // no section rather than an empty heading.
    expect(resolveOptions(pluginById("pencil"), settings)).toEqual({});
  });

  it("finds the answer a value stands for, for the hint under the row", () => {
    expect(optionAnswer(NIB_OPTION, "chisel")?.nameKey).toBe(
      "options.leadDetail",
    );
    expect(optionAnswer(WASH_DETAIL_OPTION, 0.5)).toBeUndefined();
  });
});

describe("an option that belongs to one answer", () => {
  const options = [NIB_OPTION, NIB_ANGLE_OPTION];

  it("stays out of the way while another is picked", () => {
    // A setting about one answer's arithmetic has nothing to say while a
    // different answer is picked, and a control that moved nothing would be the
    // panel lying about itself.
    expect(
      shownOptions(options, { testNib: "round", testNibAngle: 0 }).map(
        (option) => option.id,
      ),
    ).toEqual(["testNib"]);
  });

  it("appears with it", () => {
    expect(
      shownOptions(options, { testNib: "chisel", testNibAngle: 0 }).map(
        (option) => option.id,
      ),
    ).toEqual(["testNib", "testNibAngle"]);
  });

  it("is a seam no shipped tool uses today, and that is the point", () => {
    // Both engine pickers are gone (see `plugins/wash.ts`, `plugins/lead.ts`).
    // A plugin interface that lost half of itself every time the app stopped
    // needing that half would be a worse interface, so `choice` and `shownWhen`
    // stay — tested here against a declaration rather than against a tool.
    for (const plugin of allPlugins()) {
      for (const option of plugin.options ?? []) {
        expect(option.shownWhen).toBeUndefined();
      }
    }
  });
});
