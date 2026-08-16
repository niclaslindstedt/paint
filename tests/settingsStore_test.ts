// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeAll, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  DEVICE_ONLY_KEYS,
  SETTINGS_FILE,
  fileSettingsStore,
  mergeSyncedSettings,
  serializeSettings,
  syncedSettings,
} from "../src/app/settingsStore.ts";
import {
  defaultSettings,
  type AppSettings,
} from "../src/app/useAppSettings.ts";
import type { ByteFileStore } from "../src/app/imageFileStore.ts";

// What travels with a backend and what stays on the device. The split is the
// whole contract of `settings.json`: a kit follows you to the other machine,
// a debug toggle does not.

// `defaultSettings()` reads the plugin registry for which tools ship switched
// on, and the registry is filled by a side-effecting call at app start.
beforeAll(() => registerBuiltinPlugins());

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...defaultSettings(), ...patch };
}

/** An in-memory `ByteFileStore` — the shape the folder and cloud transports
 *  satisfy, so the settings store can be driven without a directory handle or
 *  a network. */
function memoryFiles(seed: Record<string, string> = {}) {
  const files = new Map<string, Uint8Array>();
  for (const [path, text] of Object.entries(seed)) {
    files.set(path, new TextEncoder().encode(text));
  }
  const store: ByteFileStore = {
    async list() {
      return [...files.keys()];
    },
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, bytes) {
      files.set(path, bytes);
    },
    async remove(path) {
      files.delete(path);
    },
  };
  return {
    store,
    text: (path: string) => {
      const bytes = files.get(path);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
  };
}

describe("which settings travel", () => {
  it("leaves the device-only settings out of the file", () => {
    const travelling = syncedSettings(
      settings({ devMode: true, captureLogs: true }),
    );
    for (const key of DEVICE_ONLY_KEYS) {
      expect(travelling).not.toHaveProperty(key);
    }
  });

  it("carries the kit — the tools, their widths, and the mixed colours", () => {
    const travelling = syncedSettings(
      settings({
        toolSizes: { pencil: 0.7 },
        customColors: ["#ff0088"],
        toolOrder: ["pencil", "brush"],
      }),
    );
    expect(travelling.toolSizes).toEqual({ pencil: 0.7 });
    expect(travelling.customColors).toEqual(["#ff0088"]);
    expect(travelling.toolOrder).toEqual(["pencil", "brush"]);
  });

  it("does not carry the backend choice — it was never in AppSettings", () => {
    // A settings file naming the backend it is read from would be a loop; the
    // choice lives in its own localStorage key (see `useSyncEngine`). This
    // pins that it never leaks in by way of a new field.
    const travelling = syncedSettings(settings()) as Record<string, unknown>;
    for (const key of ["backend", "encrypted", "dropbox", "gdrive"]) {
      expect(travelling).not.toHaveProperty(key);
    }
  });
});

describe("adopting a backend's copy", () => {
  it("takes the backend's kit and keeps this device's debug toggles", () => {
    const here = settings({ devMode: true, captureLogs: true });
    const there = serializeSettings(
      settings({ devMode: false, captureLogs: false, textFont: "serif" }),
    );
    const merged = mergeSyncedSettings(here, there);
    expect(merged.textFont).toBe("serif");
    expect(merged.devMode).toBe(true);
    expect(merged.captureLogs).toBe(true);
  });

  it("survives a file that has been hand-edited to nonsense", () => {
    // The file lands in a folder the user can open, so someone will eventually
    // edit it. A bad field falls back to the default rather than breaking the
    // app — `parseSettings` is doing the work, and this pins that the merge
    // actually routes through it.
    const merged = mergeSyncedSettings(
      settings(),
      JSON.stringify({ enabledPlugins: "not a list", toolSizes: 42 }),
    );
    expect(Array.isArray(merged.enabledPlugins)).toBe(true);
    expect(merged.toolSizes).toEqual({});
  });

  it("round-trips a settings blob unchanged but for the device-only pair", () => {
    const here = settings({
      toolSizes: { pencil: 1.4 },
      customColors: ["#123456"],
      devMode: true,
    });
    const merged = mergeSyncedSettings(here, serializeSettings(here));
    expect(merged).toEqual(here);
  });
});

describe("the file on the backend", () => {
  it("reads null when the backend holds no settings yet", async () => {
    const { store } = memoryFiles();
    expect(await fileSettingsStore(store).load()).toBeNull();
  });

  it("writes settings.json at the root, as readable indented JSON", async () => {
    const files = memoryFiles();
    await fileSettingsStore(files.store).save(serializeSettings(settings()));
    const written = files.text(SETTINGS_FILE);
    expect(written).not.toBeNull();
    // Indented on purpose — the file sits in a folder people open and diff.
    expect(written).toContain("\n  ");
    expect(() => JSON.parse(written!) as unknown).not.toThrow();
  });

  it("round-trips through the byte transport", async () => {
    const files = memoryFiles();
    const backend = fileSettingsStore(files.store);
    const here = settings({ customColors: ["#abcdef"] });
    await backend.save(serializeSettings(here));
    const raw = await backend.load();
    expect(raw).not.toBeNull();
    expect(mergeSyncedSettings(settings(), raw!).customColors).toEqual([
      "#abcdef",
    ]);
  });

  it("does not disturb the drawings or the images beside it", async () => {
    const files = memoryFiles({
      "paint.json": "{}",
      "images/d1-a-0.png": "bytes",
    });
    await fileSettingsStore(files.store).save(serializeSettings(settings()));
    expect(await files.store.list()).toEqual(
      expect.arrayContaining([
        "paint.json",
        "images/d1-a-0.png",
        SETTINGS_FILE,
      ]),
    );
  });
});
