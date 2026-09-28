// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the device is (`src/app/locale.ts`): the country its languages point
// at, and the English the page is marked up as.

import { describe, expect, it } from "vitest";

import { deviceRegion, englishTag, regionOf } from "../src/app/locale.ts";

describe("regionOf", () => {
  it("reads the region subtag, past a script", () => {
    expect(regionOf("en-US")).toBe("US");
    expect(regionOf("sv_se")).toBe("SE");
    expect(regionOf("zh-Hant-TW")).toBe("TW");
    expect(regionOf("es-419")).toBe("419");
  });

  it("is null for a bare language", () => {
    expect(regionOf("en")).toBeNull();
    expect(regionOf("zh-Hant")).toBeNull();
  });
});

describe("deviceRegion", () => {
  it("is the first region the device's languages name", () => {
    expect(deviceRegion(["en", "sv-SE", "en-US"])).toBe("SE");
  });

  it("falls back to where the first language is most likely spoken", () => {
    expect(deviceRegion(["en"])).toBe("US");
    expect(deviceRegion(["sv"])).toBe("SE");
  });

  it("is null with nothing to go on", () => {
    expect(deviceRegion([])).toBeNull();
    expect(deviceRegion(["not a tag!"])).toBeNull();
  });
});

describe("englishTag", () => {
  it("is the device's own English", () => {
    expect(englishTag(["en-US"])).toBe("en-US");
    expect(englishTag(["sv-SE", "en-GB"])).toBe("en-GB");
    expect(englishTag(["en_au"])).toBe("en-AU");
  });

  it("is US English, the catalog's, when the device names none", () => {
    expect(englishTag([])).toBe("en-US");
    expect(englishTag(["en"])).toBe("en-US");
    expect(englishTag(["sv-SE"])).toBe("en-US");
  });
});
