// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bootDemo,
  demoStorage,
  MemoryStorage,
  SETTINGS_KEY,
} from "../src/app/dev/demo.ts";
import {
  buildDemo,
  DOC_VERSION,
  SKETCHBOOK_PRESET,
} from "../src/app/dev/demoData.ts";
import {
  LATEST_VERSION,
  parseDoc,
  serializeDoc,
} from "../src/app/migrations.ts";
import type { AppData, Drawing, Point } from "../src/app/types.ts";

// The presentation demo (`VITE_SEED=demo`): what the App Store screenshots are
// taken of, and the live demo. It is held to three things — the documents are
// the app's own format and hold together, the marks are a hand's rather than a
// program's (the simulated media read hand speed off the sample spacing, so a
// machine-even stroke would paint as one), and the demo never touches the
// device's own drawings, backends or iCloud.

const NOW = Date.parse("2026-09-26T09:41:00Z");

function docs(): Record<string, AppData> {
  const { storage } = buildDemo(NOW);
  return {
    default: parseDoc(storage["paint:doc"]!),
    sketchbook: parseDoc(storage["paint:doc:sketchbook"]!),
  };
}

function drawings(): Drawing[] {
  return Object.values(docs()).flatMap((d) => d.drawings);
}

const gap = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

describe("the demo's documents", () => {
  it("is stamped with the version the app writes", () => {
    expect(DOC_VERSION).toBe(LATEST_VERSION);
  });

  it("is the same demo on every boot at the same moment", () => {
    expect(buildDemo(NOW)).toEqual(buildDemo(NOW));
  });

  it("parses, and round-trips through the app's own format", () => {
    for (const doc of Object.values(docs())) {
      expect(parseDoc(serializeDoc(doc))).toEqual(doc);
    }
  });

  it("names two sketchbooks, each opening on a drawing it holds", () => {
    const { storage } = buildDemo(NOW);
    const registry = JSON.parse(storage["paint:namespaces"]!) as {
      slug: string;
    }[];
    expect(registry.map((n) => n.slug)).toEqual(["default", "sketchbook"]);
    expect(storage["paint:namespace:active"]).toBe("default");
    for (const doc of Object.values(docs())) {
      expect(doc.drawings.some((d) => d.id === doc.activeDrawingId)).toBe(true);
    }
    // The first frame is the upload sketch, and it is what the app opens on.
    expect(docs().default!.activeDrawingId).toBe("demo-upload-path");
  });

  it("files every drawing in a folder that exists, and gives every mark a unique id", () => {
    for (const doc of Object.values(docs())) {
      const folders = new Set(doc.folders.map((f) => f.id));
      for (const d of doc.drawings) {
        if (d.folderId) expect(folders.has(d.folderId)).toBe(true);
      }
    }
    const ids = drawings().flatMap((d) => [
      d.id,
      ...d.strokes.map((s) => s.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts every mark on a layer the drawing has", () => {
    for (const d of drawings()) {
      const layers = new Set((d.layers ?? []).map((l) => l.id));
      for (const s of d.strokes) {
        if (s.layer) expect(layers.has(s.layer)).toBe(true);
      }
    }
    const pkce = drawings().find((d) => d.id === "demo-pkce")!;
    expect(pkce.layers!.map((l) => l.name)).toEqual([
      "",
      "Lifelines",
      "Messages",
      "Notes",
    ]);
    // Every named layer carries marks: the Layers frame shows three thumbnails.
    for (const id of ["demo-messages", "demo-notes"]) {
      expect(pkce.strokes.some((s) => s.layer === id)).toBe(true);
    }
  });

  it("keeps every mark on its page", () => {
    for (const d of drawings()) {
      for (const s of d.strokes) {
        const pts =
          s.shape.kind === "path"
            ? s.shape.points
            : s.shape.kind === "text"
              ? [s.shape.at]
              : s.shape.kind === "image"
                ? [s.shape.from, s.shape.to]
                : [];
        for (const p of pts) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(d.width);
          expect(p.y).toBeLessThanOrEqual(d.height);
        }
      }
    }
  });

  it("opens the sketchbook page on the canvas preset whose kit is the media", () => {
    const cold = drawings().find((d) => d.id === "demo-cold")!;
    expect(cold.canvasPreset).toBe(SKETCHBOOK_PRESET.id);
    expect(cold.ground?.stock).toBe("cold");
    const tools = new Set(cold.strokes.map((s) => s.tool));
    for (const tool of SKETCHBOOK_PRESET.kit.tools.filter(
      (t) => t !== "paintbrush",
    )) {
      expect(tools.has(tool)).toBe(true);
    }
  });

  it("carries the screenshot the incident page marks up", () => {
    const spike = drawings().find((d) => d.id === "demo-spike")!;
    const image = spike.strokes.find((s) => s.shape.kind === "image");
    expect(
      image?.shape.kind === "image" &&
        image.shape.src?.startsWith("data:image/jpeg"),
    ).toBe(true);
  });
});

describe("the hand", () => {
  const paths = () =>
    drawings().flatMap((d) =>
      d.strokes.flatMap((s) =>
        s.shape.kind === "path" ? [s.shape.points] : [],
      ),
    );

  it("keeps the freehand tools' sample floor, as the tool itself would", () => {
    for (const points of paths()) {
      const length = points
        .slice(1)
        .reduce((sum, p, i) => sum + gap(points[i]!, p), 0);
      if (length < 3) continue; // a dot
      for (let i = 1; i < points.length; i++) {
        expect(gap(points[i - 1]!, points[i]!)).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it("samples like a pointer: slow at the ends, spread out in the middle", () => {
    let checked = 0;
    for (const points of paths()) {
      if (points.length < 16) continue;
      const gaps = points.slice(1).map((p, i) => gap(points[i]!, p));
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const sd = Math.sqrt(
        gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length,
      );
      // Evenly resampled geometry has a coefficient of variation near 0.
      expect(sd / mean).toBeGreaterThan(0.15);
      const q = Math.floor(gaps.length / 4);
      const ends = [...gaps.slice(0, q), ...gaps.slice(-q)];
      const middle = gaps.slice(q, gaps.length - q);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(avg(middle)).toBeGreaterThan(avg(ends));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("staying off the device", () => {
  const device = () => {
    const store = new MemoryStorage();
    store.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        showToolName: false,
        canvasPresets: [{ id: "mine" }],
        customColors: ["#123456"],
      }),
    );
    store.setItem("paint:language", "sv");
    store.setItem("paint:footer-collapsed", "true");
    store.setItem("paint:doc", '{"their":"drawings"}');
    store.setItem("paint:doc:teaching", "{}");
    store.setItem("paint:namespaces", '[{"slug":"teaching"}]');
    store.setItem("paint:namespace:active", "teaching");
    store.setItem("paint:sync:backend", "dropbox");
    store.setItem("paint:sync:dropbox", '{"token":"secret"}');
    store.setItem("paint:sync:encrypted", "1");
    return store;
  };

  it("carries this device's look and nothing else", () => {
    const memory = demoStorage(device());
    expect(memory.getItem("paint:language")).toBe("sv");
    expect(memory.getItem("paint:footer-collapsed")).toBe("true");
    expect(memory.getItem("paint:doc:teaching")).toBeNull();
    expect(memory.getItem("paint:sync:backend")).toBeNull();
    expect(memory.getItem("paint:sync:dropbox")).toBeNull();
    expect(memory.getItem("paint:sync:encrypted")).toBeNull();
    expect(memory.getItem("paint:namespace:active")).toBe("default");
    const demo = JSON.parse(memory.getItem("paint:doc")!) as AppData;
    expect(demo.drawings.map((d) => d.id)).toEqual(
      docs().default!.drawings.map((d) => d.id),
    );
    const settings = JSON.parse(memory.getItem(SETTINGS_KEY)!);
    expect(settings.showToolName).toBe(false);
    expect(settings.canvasPresets).toEqual([SKETCHBOOK_PRESET]);
    expect(settings.customColors).toEqual([]);
  });

  it("swaps the store before the app reads it, and leaves the device's untouched", () => {
    const real = device();
    const before = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: real.length }, (_, i) => [
          real.key(i),
          real.getItem(real.key(i)!),
        ]),
      ),
    );
    const win = { localStorage: real } as unknown as Window & typeof globalThis;
    Object.defineProperty(win, "localStorage", {
      configurable: true,
      value: real,
    });
    vi.stubGlobal("window", win);
    expect(bootDemo()).toBe(true);
    expect(win.localStorage).not.toBe(real);
    win.localStorage.setItem("paint:doc", "{}");
    const after = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: real.length }, (_, i) => [
          real.key(i),
          real.getItem(real.key(i)!),
        ]),
      ),
    );
    expect(after).toBe(before);
  });
});

describe("the demo build's refusals", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reports no iCloud host, even with one installed", async () => {
    vi.stubEnv("VITE_SEED", "demo");
    const host = {
      version: 1,
      status: () => 0,
      list: () => 0,
      read: () => 0,
      write: () => 0,
      readBytes: () => 0,
      writeBytes: () => 0,
      remove: () => 0,
    };
    const win: Record<string, unknown> = {};
    vi.stubGlobal("window", win);
    vi.resetModules();
    const { getICloudHost } = await import("../src/app/icloudHost.ts");
    win.__paintICloud = host;
    expect(getICloudHost()).toBeNull();
  });

  it("never opens the device's database, and keeps edits in the in-memory store", async () => {
    vi.stubEnv("VITE_SEED", "demo");
    const opened = vi.fn();
    vi.stubGlobal("indexedDB", { open: opened });
    const memory = new MemoryStorage();
    memory.setItem("paint:doc", '{"demo":true}');
    vi.stubGlobal("localStorage", memory);
    vi.resetModules();
    const db = await import("../src/app/docDb.ts");
    expect(await db.hydrateDoc("default")).toBe('{"demo":true}');
    const errors: string[] = [];
    db.putDoc("default", '{"edited":true}', (m) => errors.push(m));
    await db.flushDocWrites();
    expect(await db.putDocDurable("sketchbook", "{}")).toBe(true);
    expect(opened).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    expect(memory.getItem("paint:doc")).toBe('{"edited":true}');
  });
});
