// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { SHIPPED_DEFAULTS } from "../src/app/defaults.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { allPlugins, pluginById } from "../src/app/plugins/registry.ts";
import { gaugeSizes } from "../src/app/plugins/gauge.ts";
import { formatMm, mm, toMm, toPt } from "../src/app/units.ts";
import {
  LIVE_SETTINGS,
  MAX_SIZE,
  PX_PER_MM,
  SETTINGS_VERSION,
  defaultSettings,
  gaugeFor,
  groupMemberFor,
  parseSettings,
  presetsFor,
  sizesFor,
  toolSize,
  withLiveSettings,
} from "../src/app/useAppSettings.ts";

// The settings blob is the one thing an install carries across every upgrade,
// so what `parseSettings` does with an *older* blob matters more than what it
// does with a fresh one: a field that didn't exist when the blob was written is
// missing, not false, and reading it as false silently denies an upgrading
// install a feature the build ships switched on.
//
// `defaultSettings()` reads the default toolbar off the plugin registry, so the
// builtins have to be registered before the first call memoises it.
registerBuiltinPlugins();

describe("parseSettings", () => {
  it("falls back to the defaults for a blob that isn't an object", () => {
    expect(parseSettings("null")).toEqual(defaultSettings());
    expect(parseSettings("[1,2,3]")).toEqual(defaultSettings());
  });

  it("keeps the choices a blob does hold", () => {
    const parsed = parseSettings(
      JSON.stringify({ activeTool: "marker", showGrid: true }),
    );
    expect(parsed.activeTool).toBe("marker");
    expect(parsed.showGrid).toBe(true);
  });

  // The four defaults are the newest fields in the blob, so every install that
  // upgrades into this build has a blob that names none of them: what they read
  // as then is the whole of whether an existing install gets the white sheet
  // and the pen this release ships.
  describe("the defaults", () => {
    it("are the shipped ones for a blob written before they existed", () => {
      const parsed = parseSettings(JSON.stringify({ activeTool: "marker" }));
      expect(parsed.defaultTool).toBe(SHIPPED_DEFAULTS.tool);
      expect(parsed.defaultPreset).toBe(SHIPPED_DEFAULTS.preset);
      expect(parsed.defaultColor).toBe(SHIPPED_DEFAULTS.ink);
      expect(parsed.defaultPageColor).toBe(SHIPPED_DEFAULTS.page);
    });

    it("keep the ones a blob does hold", () => {
      const blob = {
        defaultTool: "graphite",
        defaultPreset: "sketch",
        defaultColor: "#ef4444",
        defaultPageColor: "#fef3c7",
      };
      expect(parseSettings(JSON.stringify(blob))).toMatchObject(blob);
    });

    // `null` is a value here rather than a gap: it is how "follow the app
    // theme" — the answer this app had before the defaults were settings — is
    // written down, and reading it as "unset" would keep handing the shipped
    // white sheet back to somebody who asked for the theme's.
    it("keep an explicit follow-the-theme", () => {
      const blob = { defaultColor: null, defaultPageColor: null };
      const parsed = parseSettings(JSON.stringify(blob));
      expect(parsed.defaultColor).toBeNull();
      expect(parsed.defaultPageColor).toBeNull();
    });

    it("fall back for a value that isn't a colour or a tool", () => {
      const blob = {
        defaultTool: 7,
        defaultColor: { r: 1 },
        defaultPageColor: ["#fff"],
      };
      const parsed = parseSettings(JSON.stringify(blob));
      expect(parsed.defaultTool).toBe(SHIPPED_DEFAULTS.tool);
      expect(parsed.defaultColor).toBe(SHIPPED_DEFAULTS.ink);
      expect(parsed.defaultPageColor).toBe(SHIPPED_DEFAULTS.page);
    });

    // The same "keep what you can't use" rule every other id in the blob
    // follows: a downgrade and an upgrade back must not forget the choice, and
    // what is offered is re-resolved at the moment a tool is handed over.
    it("keep a tool this build doesn't ship", () => {
      const blob = { defaultTool: "quill", defaultPreset: "swan" };
      const parsed = parseSettings(JSON.stringify(blob));
      expect(parsed.defaultTool).toBe("quill");
      expect(parsed.defaultPreset).toBe("swan");
    });
  });

  describe("toolSizes", () => {
    it("is empty for a blob that has never resized anything", () => {
      expect(parseSettings(JSON.stringify({})).toolSizes).toEqual({});
    });

    it("keeps a width per tool", () => {
      const blob = { toolSizes: { pencil: 3, paintbrush: 12 } };
      expect(parseSettings(JSON.stringify(blob)).toolSizes).toEqual({
        pencil: 3,
        paintbrush: 12,
      });
    });

    it("drops values that aren't usable widths", () => {
      const blob = {
        toolSizes: { pencil: 0, marker: -4, crayon: "fat", glow: 9999 },
      };
      expect(parseSettings(JSON.stringify(blob)).toolSizes).toEqual({});
    });

    it("forgets the one width every tool used to share", () => {
      // Seeding it into all fifteen would hand an upgrading install the very
      // thing per-tool widths replaced: a paintbrush set to a pencil's width.
      const parsed = parseSettings(JSON.stringify({ size: 24 }));
      expect("size" in parsed).toBe(false);
      expect(parsed.toolSizes).toEqual({});
    });
  });

  describe("toolSize", () => {
    it("falls back to the width the tool's own plugin opens at", () => {
      const settings = defaultSettings();
      // A 0.5 mm liner, a 12 pt caption and a 10 mm block rubber — three
      // tools, three scales, and every one of them the size that tool is
      // reached for at most of the time.
      expect(toMm(toolSize(settings, "pencil"))).toBeCloseTo(0.5, 6);
      expect(toPt(toolSize(settings, "text"))).toBeCloseTo(12, 6);
      expect(toMm(toolSize(settings, "eraser"))).toBeCloseTo(10, 6);
    });

    it("answers with the width that tool was last set to", () => {
      const settings = { ...defaultSettings(), toolSizes: { pencil: 11 } };
      expect(toolSize(settings, "pencil")).toBe(11);
      // …and only that tool: a fat pencil is not a fat brush. The brush opens
      // on a #6 round, which is 4.8 mm of ferrule.
      expect(toMm(toolSize(settings, "paintbrush"))).toBeCloseTo(4.8, 3);
    });

    it("falls back to the middle of the default ladder for a tool it can't find", () => {
      expect(toMm(toolSize(defaultSettings(), "quill"))).toBeCloseTo(1, 3);
    });
  });

  describe("sizesFor", () => {
    it("offers the five widths the tool is really made in", () => {
      // The ISO ladder every technical pen is drawn to.
      const rounded = sizesFor(pluginById("pencil")).map(
        (px) => Math.round(toMm(px) * 100) / 100,
      );
      expect(rounded).toEqual([0.18, 0.25, 0.35, 0.5, 0.7]);
      // Five, for every tool that has a width at all: it is what a thumb can
      // hit without reading, and what a real rack of one implement holds
      // between fine and broad.
      for (const plugin of allPlugins()) {
        if (!plugin.gauge) continue;
        expect(plugin.gauge.steps).toHaveLength(5);
      }
    });

    it("offers a tool's own scale where it declares one", () => {
      // Type, in points — the one gauge that isn't millimetres of page.
      expect(sizesFor(pluginById("text"))).toEqual(
        gaugeSizes(gaugeFor(pluginById("text"))),
      );
    });

    it("offers the gauge's five and nothing else", () => {
      // There used to be a sixth kind — widths the user "kept" beside them.
      // A bare width was a worse version of a saved *tool*, which carries the
      // dials with it and has a name and a mark on it (see `presets.ts`).
      for (const id of ["pencil", "graphite", "paintbrush", "text"]) {
        expect(sizesFor(pluginById(id))).toHaveLength(5);
      }
    });
  });

  describe("showToolName", () => {
    it("stays on for a blob written before the flag existed", () => {
      expect(
        parseSettings(JSON.stringify({ activeTool: "pencil" })).showToolName,
      ).toBe(true);
    });

    it("honours an explicit off", () => {
      expect(
        parseSettings(JSON.stringify({ showToolName: false })).showToolName,
      ).toBe(false);
    });

    it("ignores a value that isn't a boolean", () => {
      expect(
        parseSettings(JSON.stringify({ showToolName: "no" })).showToolName,
      ).toBe(true);
    });
  });

  describe("toolDials", () => {
    it("is empty for a blob that has never tuned anything", () => {
      expect(parseSettings(JSON.stringify({ size: 4 })).toolDials).toEqual({});
    });

    it("keeps a tuning for a tool this build no longer ships", () => {
      // Same rule as `enabledPlugins`: downgrading and upgrading again
      // shouldn't silently forget how you had a tool set.
      const blob = { toolDials: { ghosttool: { hair: 1.5 } } };
      expect(parseSettings(JSON.stringify(blob)).toolDials).toEqual({
        ghosttool: { hair: 1.5 },
      });
    });

    it("drops values that aren't numbers, and tools left with none", () => {
      const blob = { toolDials: { crayon: { pressure: "hard" }, x: null } };
      expect(parseSettings(JSON.stringify(blob)).toolDials).toEqual({});
    });

    it("hands the old global hardness to the tools that offer the dial", () => {
      // Before dials, one slider set the edge for every soft-edged tool. A blob
      // written then means "both of these were soft", so both get it.
      const parsed = parseSettings(JSON.stringify({ hardness: 0.25 }));
      expect(parsed.toolDials).toEqual({
        paintbrush: { hardness: 0.25 },
        airspray: { hardness: 0.25 },
      });
    });

    it("drops the old field once it has been folded in", () => {
      // Kept, it would be re-seeded on every load — which would quietly undo
      // ever putting a hardness dial back to default.
      const parsed = parseSettings(JSON.stringify({ hardness: 0.25 }));
      expect("hardness" in parsed).toBe(false);
    });

    it("leaves a tool that has since been tuned alone", () => {
      const blob = {
        hardness: 0.25,
        toolDials: { paintbrush: { hardness: 1 } },
      };
      const parsed = parseSettings(JSON.stringify(blob));
      expect(parsed.toolDials.paintbrush).toEqual({ hardness: 1 });
      expect(parsed.toolDials.airspray).toEqual({ hardness: 0.25 });
    });

    it("seeds nothing from a hardness that was already the default", () => {
      expect(parseSettings(JSON.stringify({ hardness: 1 })).toolDials).toEqual(
        {},
      );
    });
  });

  describe("toolColors", () => {
    it("is empty for a blob that has never re-coloured a tool", () => {
      expect(parseSettings(JSON.stringify({ size: 4 })).toolColors).toEqual({});
    });

    it("keeps the inks of a tool this build no longer ships", () => {
      // The tunings' rule, for the same reason: downgrading and upgrading again
      // shouldn't forget how you had a ramp mixed.
      const blob = { toolColors: { ghosttool: { from: "#ff0000" } } };
      expect(parseSettings(JSON.stringify(blob)).toolColors).toEqual({
        ghosttool: { from: "#ff0000" },
      });
    });

    it("keeps a swatch that is switched off, which is a value and not a gap", () => {
      const blob = { toolColors: { gradient: { mid: "" } } };
      expect(parseSettings(JSON.stringify(blob)).toolColors).toEqual({
        gradient: { mid: "" },
      });
    });

    it("drops values that aren't strings, and tools left with none", () => {
      const blob = { toolColors: { gradient: { from: 12 }, x: null } };
      expect(parseSettings(JSON.stringify(blob)).toolColors).toEqual({});
    });
  });

  describe("toolOrder", () => {
    it("is empty for a toolbar nobody has rearranged", () => {
      expect(parseSettings(JSON.stringify({})).toolOrder).toEqual([]);
    });

    it("keeps an order, ids this build doesn't know included", () => {
      // `orderEntries` ignores an id it can't place, so keeping one costs
      // nothing — and dropping it would lose the arrangement on a downgrade.
      const blob = { toolOrder: ["hand", "ghosttool", "pencil"] };
      expect(parseSettings(JSON.stringify(blob)).toolOrder).toEqual([
        "hand",
        "ghosttool",
        "pencil",
      ]);
    });

    it("throws away an order that isn't a list of ids", () => {
      expect(parseSettings(JSON.stringify({ toolOrder: 7 })).toolOrder).toEqual(
        [],
      );
      expect(
        parseSettings(JSON.stringify({ toolOrder: [1, "pencil"] })).toolOrder,
      ).toEqual(["pencil"]);
    });
  });

  describe("groupTools", () => {
    it("is empty until a family has been picked from", () => {
      expect(parseSettings(JSON.stringify({})).groupTools).toEqual({});
    });

    it("keeps the member each group last had in hand", () => {
      const blob = { groupTools: { shapes: "star", bad: 3 } };
      expect(parseSettings(JSON.stringify(blob)).groupTools).toEqual({
        shapes: "star",
      });
    });
  });

  describe("the shapes-behind-one-button upgrade", () => {
    it("switches the family on for a blob written before it existed", () => {
      // Version 3 listed the shapes one by one. Those ids no longer name
      // anything switchable, so an install carrying them would have lost its
      // shapes altogether without the version bump seeding the group.
      const blob = {
        settingsVersion: 3,
        enabledPlugins: ["rectangle", "ellipse", "line"],
      };
      const parsed = parseSettings(JSON.stringify(blob));
      expect(parsed.enabledPlugins).toContain("shapes");
      expect(parsed.enabledPlugins).toContain("select");
      expect(parsed.settingsVersion).toBe(SETTINGS_VERSION);
      // …and the old ids are kept rather than pruned, the same way every other
      // unknown id is: downgrading and upgrading again forgets nothing.
      expect(parsed.enabledPlugins).toContain("rectangle");
    });

    it("leaves a blob already at this version alone", () => {
      const blob = {
        settingsVersion: SETTINGS_VERSION,
        enabledPlugins: ["pencil"],
      };
      expect(parseSettings(JSON.stringify(blob)).enabledPlugins).toEqual([
        "pencil",
      ]);
    });
  });

  describe("the felt-tip upgrade", () => {
    it("hands an older install the two pens without taking anything away", () => {
      // Version 7 opened on the graphite pencil and the watercolour brush;
      // version 8 opens on the marker and the highlighter instead. Seeding only
      // ever *adds*, and that is the point: a user who has been sketching with
      // the pencil for a year does not lose it because the box it ships in
      // changed.
      const blob = {
        settingsVersion: 7,
        enabledPlugins: ["graphite", "watercolor", "airspray"],
      };
      const parsed = parseSettings(JSON.stringify(blob));
      expect(parsed.enabledPlugins).toContain("marker");
      expect(parsed.enabledPlugins).toContain("highlighter");
      expect(parsed.enabledPlugins).toContain("graphite");
      expect(parsed.enabledPlugins).toContain("watercolor");
      expect(parsed.settingsVersion).toBe(SETTINGS_VERSION);
    });
  });
});

describe("widths in millimetres", () => {
  it("prints a fine nib to two decimals and a broad one whole", () => {
    // A hundredth of a millimetre separates two technical pens and means
    // nothing at all once the nib is wider than a pencil.
    expect(formatMm(mm(0.18))).toBe("0.18");
    expect(formatMm(mm(4.8))).toBe("4.8");
    expect(formatMm(mm(5))).toBe("5");
    expect(formatMm(mm(140))).toBe("140");
  });

  it("pins a document pixel to a dot of an iPhone's screen", () => {
    // The whole calibration: 460 pixels to the inch, so a millimetre is
    // 18.11 px and a width is a distance you can measure on the glass.
    expect(PX_PER_MM).toBeCloseTo(460 / 25.4, 6);
    expect(Math.round(mm(210))).toBe(3803);
  });

  it("stops at a nib as wide as the page", () => {
    // A4's short edge: the widest mark that is still a nib rather than a fill.
    expect(toMm(MAX_SIZE)).toBeCloseTo(210, 6);
  });

  it("drops the widths an older blob let the user keep", () => {
    // They are gone entirely: a bare width was a worse version of a saved
    // *tool*, and there is nothing in a number to build one out of — no name
    // to give it. Both shapes the field ever had read as absent.
    for (const blob of [
      { customSizes: [4, 96] },
      { customSizes: { p: [4] } },
    ]) {
      const settings = parseSettings(JSON.stringify(blob));
      expect("customSizes" in settings).toBe(false);
      expect(presetsFor(settings, "pencil")).toEqual([]);
    }
  });
});

describe("groupMemberFor", () => {
  // Only the ids matter here — `groupMemberFor` is a lookup, not a renderer.
  const members = [{ id: "rectangle" }, { id: "ellipse" }, { id: "star" }];
  const entry = { id: "shapes", members } as unknown as Parameters<
    typeof groupMemberFor
  >[1];

  it("shows the family member actually in hand", () => {
    const settings = { ...defaultSettings(), groupTools: { shapes: "star" } };
    expect(groupMemberFor(settings, entry, "ellipse")?.id).toBe("ellipse");
  });

  it("falls back to the one you had last", () => {
    const settings = { ...defaultSettings(), groupTools: { shapes: "star" } };
    expect(groupMemberFor(settings, entry, "pencil")?.id).toBe("star");
  });

  it("opens on the first member for a family nobody has picked from", () => {
    expect(groupMemberFor(defaultSettings(), entry, "pencil")?.id).toBe(
      "rectangle",
    );
  });

  it("ignores a remembered member this build no longer ships", () => {
    const settings = { ...defaultSettings(), groupTools: { shapes: "blob" } };
    expect(groupMemberFor(settings, entry, "pencil")?.id).toBe("rectangle");
  });
});

describe("withLiveSettings", () => {
  // What the Settings dialog commits when Save is pressed. Two kinds of setting
  // live in that dialog: the ones it stages in a draft until Save, and the ones
  // it writes straight through because they have to be *seen* to be judged — a
  // tool appearing in the toolbar behind the dialog, the page repainting, a
  // watercolour engine you can only pick by looking at it.
  //
  // The draft is seeded when the dialog opens, so its copy of a live setting is
  // whatever it was before the control was touched. Committing the draft whole
  // is therefore how a change the user watched happen gets silently undone by
  // pressing Save — which is exactly what the watercolour engine did.

  it("keeps the draft's staged settings", () => {
    const live = defaultSettings();
    const draft = { ...live, showGrid: !live.showGrid, devMode: true };
    const saved = withLiveSettings(draft, live);
    expect(saved.showGrid).toBe(!live.showGrid);
    expect(saved.devMode).toBe(true);
  });

  it("takes every live-applied setting from the committed blob", () => {
    // The draft holds the values the dialog opened with; `live` holds what the
    // user has since done to the switchboard and the brush.
    const draft = defaultSettings();
    const live: typeof draft = {
      ...draft,
      enabledPlugins: [...draft.enabledPlugins, "watercolor"],
      toolOrder: ["eraser", "pencil"],
    };
    const saved = withLiveSettings(draft, live);
    for (const key of LIVE_SETTINGS) expect(saved[key]).toEqual(live[key]);
  });

  it("leaves the staged half of the General tab alone", () => {
    // The grid and the tool-name label used to apply live from the Canvas tab.
    // They are staged settings now (see `LIVE_SETTINGS`), so Save has to take
    // them from the *draft* — reading them off the committed blob would revert
    // the toggle the user just flipped, which is the same bug the other way up.
    const live = defaultSettings();
    const draft = {
      ...live,
      showGrid: !live.showGrid,
      showToolName: !live.showToolName,
    };
    const saved = withLiveSettings(draft, live);
    expect(saved.showGrid).toBe(draft.showGrid);
    expect(saved.showToolName).toBe(draft.showToolName);
  });

  it("does not revert the wash detail", () => {
    // The bug this exists for, on its own: move the detail slider on the
    // brush's own panel, press Save in the dialog, and the detail has to still
    // be the one you set rather than the one the dialog opened with.
    const draft = { ...defaultSettings(), washDetail: 1 };
    const live = { ...draft, washDetail: 0.4 };
    expect(withLiveSettings(draft, live).washDetail).toBe(0.4);
  });

  it("changes neither of the blobs it was handed", () => {
    const draft = defaultSettings();
    const live = { ...draft, washDetail: 0.4 };
    withLiveSettings(draft, live);
    expect(draft.washDetail).toBe(1);
    expect(live.washDetail).toBe(0.4);
  });
});
