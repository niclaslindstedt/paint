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
});
