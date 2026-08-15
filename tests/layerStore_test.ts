// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The backend's layer tree. Two things are being guarded, and both are about
// *not* moving bytes.
//
// The plan is a set difference — what the drawings want against what the
// backend has — so the property that matters is that an untouched layer plans
// no write at all. That is the whole reason the file name carries a content
// hash, and it is what makes pressing Save after an afternoon on one layer cost
// one layer.
//
// The run is about failure. A save that half-worked must not prune, because
// "no drawing wants this file" is only a sound judgement when every drawing was
// actually filed — the same rule the image externaliser follows, and the one
// that keeps a throttled upload from costing a picture.
import { describe, expect, it } from "vitest";

import type { ByteFileStore } from "../src/app/imageFileStore.ts";
import {
  planLayerSave,
  runLayerSave,
  scopeToDrawings,
} from "../src/app/layerStore.ts";
import { drawingFolder, planLayers } from "../src/app/pct.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

const INK = { pageColor: "#ffffff", defaultInk: "#000000" };

function stroke(id: string, layer?: string): Stroke {
  return {
    id,
    tool: "pencil",
    size: 4,
    ...(layer ? { layer } : {}),
    shape: { kind: "segment", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
  };
}

function drawing(over: Partial<Drawing> = {}): Drawing {
  return {
    id: "d1",
    name: "Flow",
    width: 400,
    height: 300,
    strokes: [],
    ...over,
  };
}

/** Every path a drawing's layers would be filed at — what a backend holds after
 *  one clean save. */
function filedPaths(d: Drawing): string[] {
  const folder = drawingFolder(d);
  return [
    ...planLayers(d, INK).map((p) => `${folder}/${p.entry.src}`),
    `${folder}/manifest.json`,
  ];
}

/** An in-memory byte store, optionally failing writes to named paths. */
function fakeStore(seed: string[] = [], failOn: RegExp | null = null) {
  const files = new Map<string, Uint8Array>();
  for (const path of seed) files.set(path, new Uint8Array(1));
  const store: ByteFileStore & { files: Map<string, Uint8Array> } = {
    files,
    list: () => Promise.resolve([...files.keys()]),
    read: (path) => Promise.resolve(files.get(path) ?? null),
    write: (path, bytes) => {
      if (failOn?.test(path)) return Promise.reject(new Error("nope"));
      files.set(path, bytes);
      return Promise.resolve();
    },
    remove: (path) => {
      files.delete(path);
      return Promise.resolve();
    },
  };
  return store;
}

const render = () => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

describe("scopeToDrawings", () => {
  it("hides everything outside the drawings tree", async () => {
    const store = scopeToDrawings(
      fakeStore([
        "paint-default.json",
        "images/flow-abcd-1.png",
        "drawings/flow-abcd/manifest.json",
      ]),
    );
    expect(await store.list()).toEqual(["drawings/flow-abcd/manifest.json"]);
  });
});

describe("planLayerSave", () => {
  it("writes every layer of a drawing the backend has never seen", () => {
    const d = drawing({ strokes: [stroke("a")] });
    const plan = planLayerSave([d], [], INK);
    // The implicit stack is the sheet plus one layer to draw on.
    expect(plan.writes).toHaveLength(2);
    expect(plan.manifests).toHaveLength(1);
    expect(plan.prune).toEqual([]);
  });

  it("names the manifest inside the drawing's folder", () => {
    const d = drawing();
    expect(planLayerSave([d], [], INK).manifests[0]!.path).toBe(
      `${drawingFolder(d)}/manifest.json`,
    );
  });

  // The point of the whole layout.
  it("writes nothing when nothing changed", () => {
    const d = drawing({ strokes: [stroke("a")] });
    const plan = planLayerSave([d], filedPaths(d), INK);
    expect(plan.writes).toEqual([]);
    expect(plan.prune).toEqual([]);
  });

  it("still rewrites the manifest — a rename moves no pixels", () => {
    const d = drawing({ strokes: [stroke("a")] });
    expect(planLayerSave([d], filedPaths(d), INK).manifests).toHaveLength(1);
  });

  it("writes only the layer that changed", () => {
    const before = drawing({
      layers: [
        { id: "bg", name: "" },
        { id: "one", name: "One" },
        { id: "two", name: "Two" },
      ],
      strokes: [stroke("a", "one"), stroke("b", "two")],
    });
    const after: Drawing = {
      ...before,
      strokes: [...before.strokes, stroke("c", "two")],
    };
    const plan = planLayerSave([after], filedPaths(before), INK);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]!.layerId).toBe("two");
  });

  it("prunes the layer a change superseded", () => {
    const before = drawing({ strokes: [stroke("a")] });
    const after: Drawing = { ...before, strokes: [stroke("a"), stroke("b")] };
    const plan = planLayerSave([after], filedPaths(before), INK);
    expect(plan.prune).toHaveLength(1);
    expect(plan.prune[0]).toMatch(/^drawings\/flow-.*\/layers\/01-.*\.png$/);
  });

  it("prunes the whole folder a rename left behind", () => {
    const before = drawing({ name: "Flow", strokes: [stroke("a")] });
    const after: Drawing = { ...before, name: "Flow chart" };
    const plan = planLayerSave([after], filedPaths(before), INK);
    // Everything at the old address is now an orphan, manifest included.
    expect(plan.prune).toHaveLength(3);
    expect(plan.prune.every((p) => p.startsWith(drawingFolder(before)))).toBe(
      true,
    );
    expect(plan.writes).toHaveLength(2);
  });

  it("prunes the folder of a drawing that is gone", () => {
    const gone = drawing({ id: "d2", name: "Deleted" });
    expect(planLayerSave([], filedPaths(gone), INK).prune).toEqual(
      filedPaths(gone),
    );
  });

  it("keeps two drawings in folders of their own", () => {
    const plan = planLayerSave(
      [drawing({ id: "d1", name: "One" }), drawing({ id: "d2", name: "Two" })],
      [],
      INK,
    );
    expect(plan.manifests).toHaveLength(2);
    expect(new Set(plan.writes.map((w) => w.path)).size).toBe(
      plan.writes.length,
    );
  });

  // A theme flip re-inks every mark that never picked a colour, so the pixels
  // genuinely moved even though the document did not.
  it("re-writes the layers when the canvas theme flips", () => {
    const d = drawing({ strokes: [stroke("a")] });
    const dark = { pageColor: "#111111", defaultInk: "#eeeeee" };
    expect(planLayerSave([d], filedPaths(d), dark).writes.length).toBe(2);
  });
});

describe("runLayerSave", () => {
  it("writes the pixels and the index", async () => {
    const store = fakeStore();
    const d = drawing({ strokes: [stroke("a")] });
    const result = await runLayerSave(
      store,
      planLayerSave([d], [], INK),
      render,
    );
    expect(result.written).toBe(2);
    expect(result.failed).toBe(0);
    expect(store.files.has(`${drawingFolder(d)}/manifest.json`)).toBe(true);
  });

  it("prunes orphans once everything is filed", async () => {
    const orphan = "drawings/flow-b40p/layers/99-stale.png";
    const store = fakeStore([orphan]);
    const d = drawing({ strokes: [stroke("a")] });
    const result = await runLayerSave(
      store,
      planLayerSave([d], [orphan], INK),
      render,
    );
    expect(result.pruned).toBe(1);
    expect(store.files.has(orphan)).toBe(false);
  });

  // The rule that keeps a bad network from costing a picture.
  it("holds the prune when a layer write failed", async () => {
    const orphan = "drawings/flow-b40p/layers/99-stale.png";
    const store = fakeStore([orphan], /layers\//);
    const d = drawing({ strokes: [stroke("a")] });
    const result = await runLayerSave(
      store,
      planLayerSave([d], [orphan], INK),
      render,
    );
    expect(result.failed).toBeGreaterThan(0);
    expect(result.pruned).toBe(0);
    expect(store.files.has(orphan)).toBe(true);
  });

  it("holds the prune when the manifest itself failed", async () => {
    const orphan = "drawings/flow-b40p/layers/99-stale.png";
    const store = fakeStore([orphan], /manifest\.json$/);
    const d = drawing({ strokes: [stroke("a")] });
    const result = await runLayerSave(
      store,
      planLayerSave([d], [orphan], INK),
      render,
    );
    expect(result.failed).toBe(1);
    expect(store.files.has(orphan)).toBe(true);
  });

  // A layer that couldn't be rendered is a failure like any other — it must not
  // leave the manifest claiming a file that was never written.
  it("counts a render that threw as a failure", async () => {
    const store = fakeStore();
    const result = await runLayerSave(
      store,
      planLayerSave([drawing()], [], INK),
      () => Promise.reject(new Error("no canvas")),
    );
    expect(result.written).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("does nothing at all for an unchanged drawing", async () => {
    const d = drawing({ strokes: [stroke("a")] });
    const store = fakeStore(filedPaths(d));
    const result = await runLayerSave(
      store,
      planLayerSave([d], filedPaths(d), INK),
      () => Promise.reject(new Error("should not render")),
    );
    expect(result.written).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.pruned).toBe(0);
  });
});
