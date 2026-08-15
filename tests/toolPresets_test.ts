// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The presets a tool ships with — the settings its medium is actually used at.
//
// Two halves are worth pinning down, and they are the two the feature is made
// of. The **mechanism**: a preset declares only the dials it moves, and what
// comes out of the seam is a whole tool, so applying one puts the dials it says
// nothing about *back*. And the **set** itself, which is content and would
// otherwise rot quietly: a preset naming a dial its tool does not have, or a
// name with no string behind it, is a chip that does nothing and looks fine.
//
// The set's own rules are checked here rather than trusted, because they are
// the ones a future tool will break by accident: every tool ships one preset
// that is exactly the tool as it comes (so the panel opens with a chip lit),
// nobody ships a row of one (that is what a default is for), and no preset
// wanders off the widths its tool is made in.

import { describe, expect, it } from "vitest";

import { en } from "../src/app/i18n/en.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { isRealSize } from "../src/app/plugins/gauge.ts";
import {
  MAX_BUILTIN_PRESETS,
  isStockPreset,
  toolPresets,
} from "../src/app/plugins/presets.ts";
import { allPlugins, pluginById } from "../src/app/plugins/registry.ts";
import type { PaintPlugin } from "../src/app/plugins/types.ts";
import { activePreset, presetMatches } from "../src/app/presets.ts";
import {
  defaultSettings,
  gaugeFor,
  toolSize,
  withPreset,
} from "../src/app/useAppSettings.ts";

registerBuiltinPlugins();

/** Every tool that ships presets, which is most of the ones that leave a
 *  mark. */
const withPresets = allPlugins().filter((p) => (p.presets?.length ?? 0) > 0);

/** What `t()` would resolve a catalog key to, walked by hand — the tests run in
 *  node with no i18n runtime, and a key with no string behind it is exactly the
 *  failure this file is here to catch. */
function catalogHas(key: string): boolean {
  let at: unknown = en;
  for (const part of key.split(".")) {
    if (typeof at !== "object" || at === null) return false;
    at = (at as Record<string, unknown>)[part];
  }
  return typeof at === "string";
}

describe("the shipped set", () => {
  it("covers every tool whose medium has more than one way of being held", () => {
    // Not an inventory for its own sake: this is the list, and a tool dropping
    // off it should be a decision somebody made rather than a merge nobody
    // noticed.
    expect(withPresets.map((p) => p.id).sort()).toEqual([
      "airspray",
      "calligraphy",
      "crayon",
      "eraser",
      "filler",
      "flatbrush",
      "graphite",
      "highlighter",
      "marker",
      "paintbrush",
      "pencil",
      "watercolor",
    ]);
  });

  it("ships none where one would do, and puts that one in the defaults", () => {
    // The escape hatch, and the reason it is not an omission: a row of one chip
    // is a worse default than a default. A rectangle is ruled at half a
    // millimetre and type is set at twelve point, so that is where they open —
    // and neither carries a preset row saying so a second time.
    for (const id of ["rectangle", "ellipse", "line", "text"]) {
      const plugin = pluginById(id);
      expect(plugin?.presets).toBeUndefined();
      expect(plugin?.defaultSize).toBeGreaterThan(0);
    }
    // …and the tools with neither a dial nor a mark have nothing to preset at
    // all.
    for (const id of ["hand", "dropper", "select"]) {
      expect(pluginById(id)?.presets).toBeUndefined();
    }
  });

  it("opens every row with the tool exactly as it comes", () => {
    // What makes the panel explain itself: open it on a tool nobody has touched
    // and a chip is already lit, so the row reads as "one of these is what you
    // are holding" rather than as five unexplained words.
    for (const plugin of withPresets) {
      const stock = plugin.presets!.filter((p) => isStockPreset(plugin, p));
      expect([plugin.id, stock.length]).toEqual([plugin.id, 1]);
      expect([plugin.id, isStockPreset(plugin, plugin.presets![0]!)]).toEqual([
        plugin.id,
        true,
      ]);
    }
  });

  it("is a row you can read at a glance", () => {
    for (const plugin of withPresets) {
      expect(plugin.presets!.length).toBeGreaterThan(1);
      expect(plugin.presets!.length).toBeLessThanOrEqual(MAX_BUILTIN_PRESETS);
    }
  });

  it("names dials its tool actually has, at values it can be set to", () => {
    // A preset naming a dial the tool dropped is a chip that silently does less
    // than it says, which is the one failure mode this seam has.
    for (const plugin of withPresets) {
      const offered = new Map((plugin.dials ?? []).map((d) => [d.id, d]));
      for (const preset of plugin.presets!) {
        for (const [id, at] of Object.entries(preset.dials ?? {})) {
          const dial = offered.get(id);
          expect([plugin.id, preset.id, id, Boolean(dial)]).toEqual([
            plugin.id,
            preset.id,
            id,
            true,
          ]);
          expect(at).toBeGreaterThanOrEqual(dial!.min);
          expect(at).toBeLessThanOrEqual(dial!.max);
        }
      }
    }
  });

  it("sets a width the tool is really made in, and none at all when it has no width", () => {
    for (const plugin of withPresets) {
      for (const preset of plugin.presets!) {
        if (plugin.sizeless) {
          // A width no mark reads is not a setting (see `PresetSettings`).
          expect([plugin.id, preset.id, preset.size]).toEqual([
            plugin.id,
            preset.id,
            undefined,
          ]);
          continue;
        }
        expect(preset.size).toBeDefined();
        // Inside the range a shop stocks — the middle band of the tool's own
        // slider — rather than merely a positive number.
        expect([plugin.id, preset.id]).toEqual(
          isRealSize(gaugeFor(plugin), preset.size!)
            ? [plugin.id, preset.id]
            : [plugin.id, `${preset.id} is off the rack`],
        );
      }
    }
  });

  // Only English is walked here: `en` is the catalog's *type* source and `sv`
  // has to satisfy it, so a key missing from the translation is a compile
  // error rather than something a test could add.
  it("gives every preset a name in the catalog", () => {
    for (const plugin of withPresets) {
      for (const preset of plugin.presets!) {
        expect([preset.nameKey, catalogHas(preset.nameKey)]).toEqual([
          preset.nameKey,
          true,
        ]);
      }
    }
  });

  it("has no two presets of one tool with the same id", () => {
    for (const plugin of withPresets) {
      const ids = plugin.presets!.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("resolving one", () => {
  const brush = pluginById("paintbrush")!;

  it("fills in every dial the preset has no opinion about", () => {
    // The whole reason the seam exists: a preset is written as the ways it
    // differs from the tool, and comes out as the whole tool — so a tool that
    // grows a sixth dial next year does not mean editing four presets.
    const dry = toolPresets(brush).find((p) => p.id === "dry")!;
    expect(Object.keys(dry.dials).sort()).toEqual(
      brush.dials!.map((d) => d.id).sort(),
    );
    // Declared…
    expect(dry.dials.splay).toBe(1.6);
    // …and not declared, so it rests where the brush rests it.
    expect(dry.dials.bleed).toBe(0);
  });

  it("comes back empty for a tool that ships none", () => {
    expect(toolPresets(pluginById("rectangle"))).toEqual([]);
    expect(toolPresets(undefined)).toEqual([]);
  });
});

describe("wearing one", () => {
  it("puts the width and every dial in your hand, and the rest back", () => {
    const brush = pluginById("paintbrush")!;
    const [wet, dry] = [
      toolPresets(brush).find((p) => p.id === "glaze")!,
      toolPresets(brush).find((p) => p.id === "dry")!,
    ];
    const glazed = withPreset(defaultSettings(), "paintbrush", wet);
    expect(glazed.toolDials.paintbrush).toEqual({
      opacity: 0.25,
      hair: 0.8,
      splay: 0.5,
      bleed: 0.7,
    });
    // …and the one after it is that one and nothing else: the glaze's bleed
    // does not survive into the dry brush, which is the half a
    // slider-at-a-time apply would miss.
    const dried = withPreset(glazed, "paintbrush", dry);
    expect(dried.toolDials.paintbrush).toEqual({
      opacity: 0.6,
      hardness: 0.25,
      hair: 1.3,
      splay: 1.6,
    });
    expect(toolSize(dried, "paintbrush")).toBe(dry.size);
  });

  it("leaves no tuning at all behind when it is the tool as it ships", () => {
    // A stock preset is the way back: press it and the blob is what a fresh
    // install writes, rather than a set of values that happen to equal the
    // defaults.
    const brush = pluginById("paintbrush")!;
    const tuned = withPreset(
      defaultSettings(),
      "paintbrush",
      toolPresets(brush).find((p) => p.id === "hog")!,
    );
    expect(tuned.toolDials.paintbrush).toBeDefined();
    const back = withPreset(tuned, "paintbrush", toolPresets(brush)[0]!);
    expect(back.toolDials.paintbrush).toBeUndefined();
    expect(toolSize(back, "paintbrush")).toBe(brush.defaultSize);
  });

  it("writes no width for a tool that has none", () => {
    const bucket = pluginById("filler")!;
    const wash = toolPresets(bucket).find((p) => p.id === "wash")!;
    const filled = withPreset(defaultSettings(), "filler", wash);
    expect(filled.toolSizes.filler).toBeUndefined();
    expect(filled.toolDials.filler).toEqual({
      opacity: 0.45,
      feather: wash.dials.feather,
    });
  });
});

describe("which chip is lit", () => {
  const stockOf = (plugin: PaintPlugin) => toolPresets(plugin)[0]!;

  it("is lit on a tool nobody has touched", () => {
    for (const plugin of withPresets) {
      const settings = defaultSettings();
      const on = activePreset(
        toolPresets(plugin),
        toolSize(settings, plugin.id),
        stockOf(plugin).dials,
      );
      expect([plugin.id, on?.id]).toEqual([plugin.id, stockOf(plugin).id]);
    }
  });

  it("goes out when a dial moves, and is not a mode", () => {
    const pencil = pluginById("graphite")!;
    const shading = toolPresets(pencil).find((p) => p.id === "shading")!;
    expect(presetMatches(shading, shading.size!, shading.dials)).toBe(true);
    expect(
      presetMatches(shading, shading.size!, { ...shading.dials, grade: 1 }),
    ).toBe(false);
  });

  it("is matched on the dials alone for a tool with no width", () => {
    // The bucket sets three dials and no nib, so what it is *on* cannot depend
    // on a width it does not have.
    const [flat, , wash] = toolPresets(pluginById("filler")!);
    expect(presetMatches(flat!, 99, flat!.dials)).toBe(true);
    expect(presetMatches(wash!, 99, flat!.dials)).toBe(false);
  });
});
