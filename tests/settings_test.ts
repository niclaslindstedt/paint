// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { pluginById } from "../src/app/plugins/registry.ts";
import {
  SETTINGS_VERSION,
  SIZES,
  defaultSettings,
  groupMemberFor,
  parseSettings,
  sizesFor,
  toolSize,
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
      expect(toolSize(settings, "pencil")).toBe(3);
      expect(toolSize(settings, "text")).toBe(32);
      expect(toolSize(settings, "eraser")).toBe(8);
    });

    it("answers with the width that tool was last set to", () => {
      const settings = { ...defaultSettings(), toolSizes: { pencil: 11 } };
      expect(toolSize(settings, "pencil")).toBe(11);
      // …and only that tool: a fat pencil is not a fat brush.
      expect(toolSize(settings, "paintbrush")).toBe(6);
    });

    it("falls back to the middle of the shared row for a tool it can't find", () => {
      expect(toolSize(defaultSettings(), "quill")).toBe(SIZES[1]);
    });
  });

  describe("sizesFor", () => {
    it("offers the app's three widths for a tool with no scale of its own", () => {
      expect(sizesFor(pluginById("pencil"), [])).toEqual([...SIZES]);
    });

    it("offers a tool's own scale where it declares one", () => {
      expect(sizesFor(pluginById("text"), [])).toEqual([16, 24, 32, 48, 72]);
    });

    it("folds the widths the user kept into the row, fine to broad", () => {
      expect(sizesFor(pluginById("pencil"), [9, 4])).toEqual([2, 4, 6, 9, 16]);
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
