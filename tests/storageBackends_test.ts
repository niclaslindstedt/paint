// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which storage backends a build offers (`src/app/storageBackends.ts`). The
// phone app has no Dropbox at all — whatever key the build environment holds —
// and the website and the desktop app keep it exactly as before. The build
// flag is a compile-time constant in a real build; here it is a global the
// test sets before importing the module afresh, as `donate_test.ts` does.

import { afterEach, describe, expect, it, vi } from "vitest";

async function backendsFor(flags: { native: boolean }, appKey: string) {
  vi.stubGlobal("__NATIVE_BUILD__", flags.native);
  vi.stubEnv("VITE_DROPBOX_APP_KEY", appKey);
  vi.resetModules();
  return import("../src/app/storageBackends.ts");
}

const everyHost = { folder: true, icloud: true };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the website and the desktop app", () => {
  it("offer Dropbox when the build carries its app key", async () => {
    const m = await backendsFor({ native: false }, "key");
    expect(m.DROPBOX_IN_BUILD).toBe(true);
    expect(m.DROPBOX_APP_KEY).toBe("key");
    expect(m.offeredBackends(everyHost)).toEqual([
      "local",
      "folder",
      "dropbox",
      "icloud",
    ]);
    expect(m.offeredBackends({ folder: true, icloud: false })).toEqual([
      "local",
      "folder",
      "dropbox",
    ]);
  });

  it("hide it without the key, but keep a stored choice to explain", async () => {
    const m = await backendsFor({ native: false }, "");
    expect(m.offeredBackends(everyHost)).toEqual(["local", "folder", "icloud"]);
    expect(m.storedBackend("dropbox")).toBe("dropbox");
  });

  it("read every stored choice as before", async () => {
    const m = await backendsFor({ native: false }, "key");
    expect(m.storedBackend("dropbox")).toBe("dropbox");
    expect(m.storedBackend("folder")).toBe("folder");
    expect(m.storedBackend("icloud")).toBe("icloud");
    expect(m.storedBackend("gdrive")).toBe("local");
    expect(m.storedBackend(null)).toBe("local");
  });
});

describe("the phone app", () => {
  it("offers no Dropbox, whatever key the build env holds", async () => {
    const m = await backendsFor({ native: true }, "key");
    expect(m.DROPBOX_IN_BUILD).toBe(false);
    expect(m.DROPBOX_APP_KEY).toBe("");
    expect(m.offeredBackends(everyHost)).not.toContain("dropbox");
    expect(m.offeredBackends({ folder: false, icloud: true })).toEqual([
      "local",
      "icloud",
    ]);
  });

  it("opens a stored Dropbox choice on this device", async () => {
    const m = await backendsFor({ native: true }, "key");
    expect(m.storedBackend("dropbox")).toBe("local");
    expect(m.storedBackend("icloud")).toBe("icloud");
  });
});
