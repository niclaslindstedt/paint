// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the app calls itself (`brand.ts`), and where the plugin that writes the
// `<head>` puts it (`pwa-plugin.ts`). An app build says its store listing's
// name when it was given one; the website says "Paint" whatever the
// environment holds, because the listing is a deployment and the website is
// the project.

import { describe, expect, it } from "vitest";

import { APP_NAME, appDisplayName } from "../brand.ts";
import { buildManifest } from "../pwa-plugin.ts";

describe("appDisplayName", () => {
  it("is the listing name in an app build that was given one", () => {
    expect(appDisplayName(true, "Nird Paint")).toBe("Nird Paint");
    expect(appDisplayName(true, "  Nird Paint\n")).toBe("Nird Paint");
  });

  it("is the project name in an app build that was not", () => {
    expect(appDisplayName(true, undefined)).toBe(APP_NAME);
    expect(appDisplayName(true, "   ")).toBe(APP_NAME);
  });

  it("is the project name on the website, whatever the environment says", () => {
    expect(APP_NAME).toBe("Paint");
    expect(appDisplayName(false, "Nird Paint")).toBe("Paint");
  });
});

describe("the manifest's name", () => {
  it("is the name the build was given", () => {
    const manifest = JSON.parse(buildManifest("/", "Nird Paint"));
    expect(manifest.name).toBe("Nird Paint");
    expect(manifest.short_name).toBe("Nird Paint");
  });

  it("defaults to the project name", () => {
    expect(JSON.parse(buildManifest("/")).name).toBe("Paint");
  });

  it("keeps the channel names apart on the side channels", () => {
    expect(JSON.parse(buildManifest("/preview/", "Nird Paint")).name).toBe(
      "Paint (preview)",
    );
  });
});
