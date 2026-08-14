// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { defaultSettings, parseSettings } from "../src/app/useAppSettings.ts";

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
      JSON.stringify({ activeTool: "marker", size: 24, showGrid: true }),
    );
    expect(parsed.activeTool).toBe("marker");
    expect(parsed.size).toBe(24);
    expect(parsed.showGrid).toBe(true);
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
});
