// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which storage backends a build offers (`src/app/storageBackends.ts`). The
// phone app has no Dropbox at all — whatever key the build environment holds —
// and no local folder, and the website and the desktop app keep both exactly
// as before. The build
// flag is a compile-time constant in a real build; here it is a global the
// test sets before importing the module afresh, as `donate_test.ts` does. The
// last cases build the phone app and the website for real and read what they
// wrote.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const root = join(__dirname, "..");

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

  it("offers no local folder, even where the host could pick one", async () => {
    const m = await backendsFor({ native: true }, "key");
    expect(m.offeredBackends(everyHost)).toEqual(["local", "icloud"]);
  });

  it("opens a stored Dropbox choice on this device", async () => {
    const m = await backendsFor({ native: true }, "key");
    expect(m.storedBackend("dropbox")).toBe("local");
    expect(m.storedBackend("icloud")).toBe("icloud");
  });

  it("opens a stored folder choice on this device", async () => {
    const m = await backendsFor({ native: true }, "key");
    expect(m.storedBackend("folder")).toBe("local");
  });
});

// Builds the app for real with the flags the build scripts set and returns
// which of `needles` its emitted files carry. NODE_ENV and the test runner's
// own variables are dropped, so it is the build CI ships.
function carried(env: Record<string, string>, needles: string[]): string[] {
  const out = mkdtempSync(join(tmpdir(), "storage-backends-"));
  try {
    const base = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          key !== "NODE_ENV" &&
          !key.startsWith("VITEST") &&
          !key.startsWith("VITE_"),
      ),
    );
    execFileSync(
      process.execPath,
      [
        join(root, "node_modules", "vite", "bin", "vite.js"),
        "build",
        "--outDir",
        out,
        "--emptyOutDir",
        "--logLevel",
        "error",
      ],
      { cwd: root, env: { ...base, ...env }, stdio: "pipe" },
    );
    const text = readdirSync(out, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
      .join("\n");
    return needles.filter((needle) => text.includes(needle));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// Each stands for code only Dropbox or the local folder needs: the Dropbox
// API's host and the folder flow's own log lines.
const DROPBOX_AND_FOLDER = [
  "api.dropboxapi.com",
  "folder: opening the directory picker",
  "folder: reconnected",
];

describe("the real builds", () => {
  it("leave Dropbox and the local folder out of the phone app", () => {
    expect(
      carried(
        { VITE_NATIVE_BUILD: "on", VITE_SHELL_BUILD: "on" },
        DROPBOX_AND_FOLDER,
      ),
    ).toEqual([]);
  }, 120_000);

  it("keep both in the website", () => {
    expect(carried({}, DROPBOX_AND_FOLDER)).toEqual(DROPBOX_AND_FOLDER);
  }, 120_000);
});
