// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import type { StorageAdapter } from "@niclaslindstedt/oss-framework/storage";

import {
  hasInlineImages,
  imagePathFor,
  needsRefile,
  withExternalImages,
  type ImageStore,
} from "../src/app/imageStore.ts";

// Any decodable data URL will do — this layer moves bytes, it never decodes a
// picture.
const PNG = "data:image/png;base64,SGVsbG8=";
const OTHER_PNG = "data:image/png;base64,V29ybGQ=";
const JPEG = "data:image/jpeg;base64,SGVsbG8=";

const SKETCH = { id: "d1", name: "Sequence diagram" };
const SKETCH_1 = imagePathFor(SKETCH, 1, "image/png");

/** A fake byte store backed by a Map, with hooks a test can use to make one
 *  path fail and to watch how many reads/writes are in flight at once. */
function fakeStore(fail: { read?: Set<string>; write?: Set<string> } = {}): {
  store: ImageStore;
  files: Map<string, Uint8Array>;
  removed: string[];
  writes: string[];
  peakInFlight: () => number;
} {
  const files = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const writes: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const enter = async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    await Promise.resolve();
    inFlight -= 1;
  };
  const store: ImageStore = {
    async list() {
      return [...files.keys()];
    },
    async read(path) {
      await enter();
      if (fail.read?.has(path)) throw new Error(`no ${path}`);
      return files.get(path) ?? null;
    },
    async write(path, bytes) {
      await enter();
      if (fail.write?.has(path)) throw new Error(`cannot write ${path}`);
      writes.push(path);
      files.set(path, bytes);
    },
    async remove(path) {
      removed.push(path);
      files.delete(path);
    },
  };
  return { store, files, removed, writes, peakInFlight: () => peak };
}

/** A minimal in-memory inner adapter: `save` keeps the last text, `load`
 *  returns it. */
function fakeInner(initial: string | null = null) {
  const state = { text: initial };
  const adapter = {
    id: "test",
    label: "Test",
    async load() {
      return state.text === null ? null : { text: state.text, revision: "r1" };
    },
    async save(text: string) {
      state.text = text;
      return { revision: "r2" };
    },
  };
  return { adapter: adapter as unknown as StorageAdapter, state };
}

/** A document holding one drawing whose strokes are the given shapes. */
function doc(
  strokes: Record<string, unknown>[],
  drawing: { id: string; name: string } = SKETCH,
): string {
  return JSON.stringify({
    version: 2,
    folders: [],
    activeDrawingId: drawing.id,
    drawings: [{ ...drawing, width: 100, height: 100, strokes }],
  });
}

const imageStroke = (
  shape: Record<string, unknown>,
  id = "s1",
): Record<string, unknown> => ({
  id,
  tool: "image",
  size: 1,
  shape: {
    kind: "image",
    from: { x: 0, y: 0 },
    to: { x: 10, y: 10 },
    ...shape,
  },
});

const penStroke = {
  id: "s0",
  tool: "pencil",
  size: 2,
  shape: { kind: "path", points: [{ x: 1, y: 1 }] },
};

describe("imagePathFor", () => {
  it("names a file after the drawing, a stable tag, and its position", () => {
    expect(SKETCH_1).toMatch(/^images\/sequence-diagram-[0-9a-z]{4}-1\.png$/);
  });

  it("keeps two drawings that share a name apart", () => {
    const other = imagePathFor(
      { id: "d2", name: "Sequence diagram" },
      1,
      "image/png",
    );
    expect(other).not.toBe(SKETCH_1);
  });

  it("files a photo as a JPEG and an unnamed page under a fallback", () => {
    expect(imagePathFor({ id: "d1", name: "  " }, 2, "image/jpeg")).toMatch(
      /^images\/drawing-[0-9a-z]{4}-2\.jpg$/,
    );
  });

  it("survives a rename by tag, not by name", () => {
    const renamed = imagePathFor({ id: "d1", name: "Renamed" }, 1, "image/png");
    expect(renamed.split("-").slice(-2).join("-")).toBe(
      SKETCH_1.split("-").slice(-2).join("-"),
    );
  });
});

describe("hasInlineImages / needsRefile", () => {
  it("spots a document that still carries bytes inline", () => {
    expect(hasInlineImages(doc([imageStroke({ src: PNG })]))).toBe(true);
    expect(hasInlineImages(doc([imageStroke({ srcPath: SKETCH_1 })]))).toBe(
      false,
    );
    expect(hasInlineImages(doc([penStroke]))).toBe(false);
    expect(hasInlineImages("not json")).toBe(false);
  });

  it("spots a reference the current layout would file elsewhere", () => {
    expect(needsRefile(doc([imageStroke({ srcPath: SKETCH_1 })]))).toBe(false);
    // The same file, but the drawing has since been renamed.
    expect(
      needsRefile(
        doc([imageStroke({ srcPath: SKETCH_1 })], {
          id: "d1",
          name: "Renamed",
        }),
      ),
    ).toBe(true);
    // The same drawing, but a picture ahead of this one was deleted.
    expect(
      needsRefile(
        doc([imageStroke({ srcPath: imagePathFor(SKETCH, 2, "image/png") })]),
      ),
    ).toBe(true);
  });
});

describe("withExternalImages: save", () => {
  it("writes the bytes out and strips them from the pushed document", async () => {
    const { store, files } = fakeStore();
    const { adapter, state } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    await wrapped.save(doc([penStroke, imageStroke({ src: PNG })]), undefined);

    expect([...files.keys()]).toEqual([SKETCH_1]);
    const pushed = JSON.parse(state.text!) as {
      drawings: { strokes: { shape: Record<string, unknown> }[] }[];
    };
    const shape = pushed.drawings[0]!.strokes[1]!.shape;
    expect(shape.src).toBeUndefined();
    expect(shape.srcPath).toBe(SKETCH_1);
    // The rest of the document is untouched.
    expect(pushed.drawings[0]!.strokes[0]!.shape.kind).toBe("path");
  });

  it("numbers a drawing's pictures in stroke order and follows the MIME type", async () => {
    const { store, files } = fakeStore();
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    await wrapped.save(
      doc([
        imageStroke({ src: PNG }, "s1"),
        penStroke,
        imageStroke({ src: JPEG }, "s2"),
      ]),
      undefined,
    );

    expect([...files.keys()]).toEqual([
      imagePathFor(SKETCH, 1, "image/png"),
      imagePathFor(SKETCH, 2, "image/jpeg"),
    ]);
  });

  it("does not re-upload an unchanged picture on the next save", async () => {
    const { store, writes } = fakeStore();
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    const text = doc([imageStroke({ src: PNG })]);
    await wrapped.save(text, undefined);
    await wrapped.save(text, undefined);
    expect(writes).toEqual([SKETCH_1]);

    // Different bytes at the same path do get written.
    await wrapped.save(doc([imageStroke({ src: OTHER_PNG })]), undefined);
    expect(writes).toEqual([SKETCH_1, SKETCH_1]);
  });

  it("keeps a picture inline when its file write fails", async () => {
    const { store } = fakeStore({ write: new Set([SKETCH_1]) });
    const { adapter, state } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    await wrapped.save(doc([imageStroke({ src: PNG })]), undefined);

    const pushed = JSON.parse(state.text!) as {
      drawings: { strokes: { shape: Record<string, unknown> }[] }[];
    };
    expect(pushed.drawings[0]!.strokes[0]!.shape.src).toBe(PNG);
  });

  it("prunes a file no stroke references any more", async () => {
    const { store, files, removed } = fakeStore();
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    await wrapped.save(
      doc([imageStroke({ src: PNG }, "s1"), imageStroke({ src: JPEG }, "s2")]),
      undefined,
    );
    expect(files.size).toBe(2);

    // The second picture is deleted from the page.
    await wrapped.save(doc([imageStroke({ src: PNG }, "s1")]), undefined);
    expect(removed).toEqual([imagePathFor(SKETCH, 2, "image/jpeg")]);
    expect([...files.keys()]).toEqual([SKETCH_1]);
  });

  it("stands the prune down when a picture could not be filed out", async () => {
    const failing = imagePathFor(SKETCH, 2, "image/jpeg");
    const { store, files, removed } = fakeStore({ write: new Set([failing]) });
    files.set("images/left-over-0000-1.png", new Uint8Array([1]));
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    await wrapped.save(
      doc([imageStroke({ src: PNG }, "s1"), imageStroke({ src: JPEG }, "s2")]),
      undefined,
    );

    // A short desired set is not evidence of an orphan.
    expect(removed).toEqual([]);
  });

  it("keeps the file of a stroke whose bytes were never read back", async () => {
    const { store, files, removed } = fakeStore();
    files.set(SKETCH_1, new Uint8Array([1, 2, 3]));
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    // The stroke has the reference but no bytes — a failed rehydrate.
    await wrapped.save(doc([imageStroke({ srcPath: SKETCH_1 })]), undefined);
    expect(removed).toEqual([]);
    expect(files.has(SKETCH_1)).toBe(true);
  });

  it("never prunes from a document it could not parse", async () => {
    const { store, files, removed } = fakeStore();
    files.set(SKETCH_1, new Uint8Array([1]));
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);

    await wrapped.save("not json", undefined);
    expect(removed).toEqual([]);
  });
});

describe("withExternalImages: load", () => {
  it("reads the bytes back onto the stroke", async () => {
    const { store } = fakeStore();
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);
    await wrapped.save(doc([imageStroke({ src: PNG })]), undefined);

    const snap = await wrapped.load();
    const loaded = JSON.parse(snap!.text) as {
      drawings: { strokes: { shape: Record<string, unknown> }[] }[];
    };
    const shape = loaded.drawings[0]!.strokes[0]!.shape;
    expect(shape.src).toBe(PNG);
    expect(shape.srcPath).toBe(SKETCH_1);
    expect(snap!.revision).toBe("r1");
  });

  it("leaves the reference in place when the file cannot be read", async () => {
    const { store } = fakeStore({ read: new Set([SKETCH_1]) });
    const { adapter } = fakeInner(doc([imageStroke({ srcPath: SKETCH_1 })]));
    const wrapped = withExternalImages(adapter, store);

    const snap = await wrapped.load();
    const shape = (
      JSON.parse(snap!.text) as {
        drawings: { strokes: { shape: Record<string, unknown> }[] }[];
      }
    ).drawings[0]!.strokes[0]!.shape;
    expect(shape.src).toBeUndefined();
    expect(shape.srcPath).toBe(SKETCH_1);
  });

  it("asks for a sweep when the stored copy still holds bytes inline", async () => {
    const { store } = fakeStore();
    const { adapter } = fakeInner(doc([imageStroke({ src: PNG })]));
    let swept = 0;
    const wrapped = withExternalImages(adapter, store, () => {
      swept += 1;
    });

    await wrapped.load();
    expect(swept).toBe(1);
  });

  it("asks for a sweep when a reference has gone stale", async () => {
    const { store } = fakeStore();
    const { adapter } = fakeInner(
      doc([imageStroke({ srcPath: SKETCH_1 })], { id: "d1", name: "Renamed" }),
    );
    let swept = 0;
    const wrapped = withExternalImages(adapter, store, () => {
      swept += 1;
    });

    await wrapped.load();
    expect(swept).toBe(1);
  });

  it("asks for nothing when the copy is already filed out", async () => {
    const { store, files } = fakeStore();
    files.set(SKETCH_1, new Uint8Array([1]));
    const { adapter } = fakeInner(doc([imageStroke({ srcPath: SKETCH_1 })]));
    let swept = 0;
    const wrapped = withExternalImages(adapter, store, () => {
      swept += 1;
    });

    await wrapped.load();
    expect(swept).toBe(0);
  });

  it("passes an absent document straight through", async () => {
    const { store } = fakeStore();
    const { adapter } = fakeInner(null);
    const wrapped = withExternalImages(adapter, store);
    expect(await wrapped.load()).toBeNull();
  });

  it("keeps only a few reads in flight at once", async () => {
    const { store, peakInFlight } = fakeStore();
    const strokes = Array.from({ length: 30 }, (_, i) =>
      imageStroke({ src: PNG }, `s${i}`),
    );
    const { adapter } = fakeInner();
    const wrapped = withExternalImages(adapter, store);
    await wrapped.save(doc(strokes), undefined);

    // A fresh wrapper, so nothing is remembered from the save.
    const reader = withExternalImages(adapter, store);
    await reader.load();
    expect(peakInFlight()).toBeLessThanOrEqual(4);
    expect(peakInFlight()).toBeGreaterThan(1);
  });
});
