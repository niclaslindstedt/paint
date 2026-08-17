// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { TileCache, rendererKey } from "../src/app/tiles.ts";
import { setWashEngine, washEngine } from "../src/app/plugins/wash.ts";

/** A stand-in for a painted tile: the cache only ever hands back what it was
 *  given, so what that is doesn't matter here. */
function tile(name: string): HTMLCanvasElement {
  return { name } as unknown as HTMLCanvasElement;
}

describe("TileCache", () => {
  it("hands back what it was given", () => {
    const cache = new TileCache(4);
    const swatch = tile("a");
    cache.remember("a", swatch);
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBe(swatch);
  });

  it("knows nothing about a key it was never given", () => {
    const cache = new TileCache(4);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("a")).toBeUndefined();
  });

  it("forgets the oldest when it is full, and keeps the rest", () => {
    const cache = new TileCache(2);
    cache.remember("a", tile("a"));
    cache.remember("b", tile("b"));
    cache.remember("c", tile("c"));
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("re-remembering a key is not a second entry", () => {
    const cache = new TileCache(2);
    cache.remember("a", tile("a"));
    cache.remember("a", tile("a again"));
    cache.remember("b", tile("b"));
    expect(cache.get("a")).toEqual(tile("a again"));
    expect(cache.has("b")).toBe(true);
  });
});

describe("rendererKey", () => {
  it("changes when an engine does — the other watercolour is another picture", () => {
    const before = rendererKey();
    const was = washEngine();
    setWashEngine(was === "simple" ? "simulation" : "simple");
    expect(rendererKey()).not.toBe(before);
    setWashEngine(was);
    expect(rendererKey()).toBe(before);
  });
});
