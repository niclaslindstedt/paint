// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What's new is the website's and the desktop app's alone
// (`src/app/changelogBuilt.ts`): the phone app's version history is the App
// Store's What's New. The first cases set the build flags as globals before
// importing the module afresh, which is how Vitest resolves a bare `__NAME__`
// without a `define`; the last builds the phone app and the website for real
// and reads what they wrote.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type Flags = { native: boolean; shell: boolean };

const root = join(__dirname, "..");

async function load(flags: Flags) {
  vi.stubGlobal("__NATIVE_BUILD__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.resetModules();
  return (await import("../src/app/changelogBuilt.ts")).CHANGELOG_BUILT;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CHANGELOG_BUILT", () => {
  it("is on for the website and the desktop app", async () => {
    expect(await load({ native: false, shell: false })).toBe(true);
    expect(await load({ native: false, shell: true })).toBe(true);
  });

  it("is off for the phone app", async () => {
    // The phone build sets both flags (`native/scripts/bundle-web.mjs`).
    expect(await load({ native: true, shell: true })).toBe(false);
  });
});

// The heading of the latest release in the CHANGELOG — text only What's new
// carries into a bundle.
function latestReleaseHeading(): string {
  const heading = /^## \[\d+\.\d+\.\d+\]/m.exec(
    readFileSync(join(root, "CHANGELOG.md"), "utf8"),
  );
  if (!heading) throw new Error("CHANGELOG.md has no released version");
  return heading[0];
}

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

// Builds the app for real with the flags the build scripts set, and returns
// the files that carry `needle`. NODE_ENV and the test runner's own variables
// are dropped, so it is the build CI ships.
function filesCarrying(env: Record<string, string>, needle: string): string[] {
  const out = mkdtempSync(join(tmpdir(), "changelog-built-"));
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
    return [...files(out)]
      .filter((path) => readFileSync(path).includes(needle))
      .map((path) => path.slice(out.length + 1));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe("the real builds", () => {
  const heading = latestReleaseHeading();

  it("leave the version history out of the phone app", () => {
    expect(
      filesCarrying(
        { VITE_NATIVE_BUILD: "on", VITE_SHELL_BUILD: "on" },
        heading,
      ),
    ).toEqual([]);
  }, 120_000);

  it("keep it in the website", () => {
    expect(filesCarrying({}, heading)).not.toEqual([]);
  }, 120_000);
});
