// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Donate row is the website's alone (`src/app/donate.ts`). The build flags
// are compile-time constants in a real build; here they are globals the test
// sets before importing the module afresh, which is how Vitest resolves a bare
// `__NAME__` without a `define`.

import { afterEach, describe, expect, it, vi } from "vitest";

async function donateUrlFor(
  flags: { native: boolean; shell: boolean },
  configured: string,
): Promise<string | null> {
  vi.stubGlobal("__NATIVE_BUILD__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.stubEnv("VITE_DONATE_URL", configured);
  vi.resetModules();
  return (await import("../src/app/donate.ts")).DONATE_URL;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("DONATE_URL", () => {
  it("points the website at the configured target", async () => {
    expect(
      await donateUrlFor(
        { native: false, shell: false },
        "https://donate.example",
      ),
    ).toBe("https://donate.example");
  });

  it("falls back to GitHub Sponsors on the website when none is set", async () => {
    expect(await donateUrlFor({ native: false, shell: false }, "")).toBe(
      "https://github.com/sponsors/niclaslindstedt",
    );
  });

  it("gives the phone app no Donate link, whatever the build env says", async () => {
    expect(
      await donateUrlFor(
        { native: true, shell: false },
        "https://donate.example",
      ),
    ).toBeNull();
  });

  it("gives the desktop app no Donate link either", async () => {
    expect(
      await donateUrlFor(
        { native: false, shell: true },
        "https://donate.example",
      ),
    ).toBeNull();
  });
});
