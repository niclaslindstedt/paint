// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone wrapper's copy of the site (`native/scripts/bundle-web.mjs`): what
// it is built with, and what it must not carry.
//
// The phone app is the shell edition — no service worker, no update prompt —
// for the desktop shell's reason: the site ships inside the binary, and a
// worker in the WebView would serve an old copy of it after the store had
// delivered a new one.

import { describe, expect, it } from "vitest";

import {
  WEB_BUILD_FLAGS,
  updateMachinery,
  webBuildEnv,
} from "../native/scripts/web-build.mts";

describe("the phone app's web build", () => {
  it("is both the native channel and the shell medium", () => {
    expect(WEB_BUILD_FLAGS).toEqual({
      VITE_NATIVE_BUILD: "on",
      VITE_SHELL_BUILD: "on",
    });
  });

  it("keeps the caller's environment and overrides a stray flag", () => {
    const env = webBuildEnv({
      PATH: "/bin",
      VITE_DROPBOX_APP_KEY: "key",
      VITE_SHELL_BUILD: "off",
    });
    expect(env.PATH).toBe("/bin");
    expect(env.VITE_DROPBOX_APP_KEY).toBe("key");
    expect(env.VITE_SHELL_BUILD).toBe("on");
    expect(env.VITE_NATIVE_BUILD).toBe("on");
  });
});

describe("the webroot check", () => {
  it("passes a shell build", () => {
    expect(
      updateMachinery([
        "index.html",
        "assets/index-abc123.js",
        "icons/icon.svg",
        "privacy/index.html",
      ]),
    ).toEqual([]);
  });

  it("finds a website build's update cycle", () => {
    expect(
      updateMachinery([
        "index.html",
        "version.json",
        "sw.js",
        "precache-manifest.json",
        "manifest.webmanifest",
      ]),
    ).toEqual(["precache-manifest.json", "sw.js", "version.json"]);
  });

  it("looks only at the root, where a worker controls the page", () => {
    expect(updateMachinery(["docs/sw.js", "assets/version.json"])).toEqual([]);
  });
});
