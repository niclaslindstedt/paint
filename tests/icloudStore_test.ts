// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two file stores the iCloud backend is built from
// (`src/app/icloudStore.ts`).
//
// The stores are thin, and that is exactly why they are worth pinning: every
// byte of an image or a layer and every byte of the document goes through them, and the
// one conversion they own — base64, because the bridge to a host is a string
// channel — is the kind that works on a smiley and fails on a PNG.

import { describe, expect, it } from "vitest";

import {
  base64ToBytes,
  bytesToBase64,
  icloudFileStore,
  icloudByteFileStore,
} from "../src/app/icloudStore.ts";
import type { ICloudHost } from "../src/app/icloudHost.ts";

/** An in-memory host: the container as a map of path to base64. */
function fakeHost(seed: Record<string, Uint8Array> = {}) {
  const files = new Map<string, Uint8Array>(Object.entries(seed));
  const calls: string[] = [];
  const host: ICloudHost = {
    version: 1,
    status: async () => "ready",
    async list() {
      calls.push("list");
      return [...files.keys()].map((path) => ({ path, rev: `${path.length}` }));
    },
    async read(path) {
      const bytes = files.get(path);
      return bytes === undefined
        ? null
        : new TextDecoder().decode(bytes as Uint8Array<ArrayBuffer>);
    },
    async write(path, text) {
      files.set(path, new TextEncoder().encode(text));
    },
    async readBytes(path) {
      const bytes = files.get(path);
      return bytes === undefined ? null : bytesToBase64(bytes);
    },
    async writeBytes(path, base64) {
      files.set(path, base64ToBytes(base64));
    },
    async remove(path) {
      files.delete(path);
    },
  };
  return { host, files, calls };
}

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    // Every byte value, so a signed/unsigned slip or a lost high bit shows up
    // here rather than as a corrupt picture on somebody's phone.
    const all = new Uint8Array(256).map((_, i) => i);
    expect([...base64ToBytes(bytesToBase64(all))]).toEqual([...all]);
  });

  it("round-trips a payload larger than one chunk", () => {
    // The encoder walks the array in 32 KB chunks rather than spreading it
    // into one `fromCharCode` call, because a rendered layer overflows
    // the argument limit. This is the case that catches losing the seam.
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    const round = base64ToBytes(bytesToBase64(big));
    expect(round.length).toBe(big.length);
    expect(round[0]).toBe(big[0]);
    expect(round[199_999]).toBe(big[199_999]);
  });

  it("round-trips an empty payload", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
    expect(base64ToBytes("").length).toBe(0);
  });
});

describe("the document store", () => {
  it("lists what the host holds, with revisions", async () => {
    const { host } = fakeHost({
      "paint-default.json": new TextEncoder().encode("{}"),
    });
    await expect(icloudFileStore(host).list()).resolves.toEqual([
      { path: "paint-default.json", rev: "18" },
    ]);
  });

  it("reads a missing file as nothing, not as an error", async () => {
    // This is what a first launch sees, and the framework's adapter reads it
    // as "no document stored yet" — an error here would be a failed sync.
    const { host } = fakeHost();
    await expect(icloudFileStore(host).read("paint-x.json")).resolves.toBe(
      null,
    );
  });

  it("writes text through unchanged", async () => {
    const { host, files } = fakeHost();
    const store = icloudFileStore(host);
    // Non-ASCII on purpose: a drawing's name is arbitrary user text.
    await store.write("paint-default.json", '{"name":"Sjön vid gården"}');
    expect(await store.read("paint-default.json")).toBe(
      '{"name":"Sjön vid gården"}',
    );
    expect(files.has("paint-default.json")).toBe(true);
  });

  it("drops a malformed listing row rather than the whole listing", async () => {
    const { host } = fakeHost();
    const broken: ICloudHost = {
      ...host,
      list: async () => [{ path: "a.json", rev: "1" }, { path: "" }] as never,
    };
    await expect(icloudFileStore(broken).list()).resolves.toEqual([
      { path: "a.json", rev: "1" },
    ]);
  });

  it("removes a file", async () => {
    const { host, files } = fakeHost({ "a.json": new Uint8Array([1]) });
    await icloudFileStore(host).remove("a.json");
    expect(files.size).toBe(0);
  });
});

describe("the byte store", () => {
  it("round-trips image bytes verbatim", async () => {
    const { host } = fakeHost();
    const store = icloudByteFileStore(host);
    // A JPEG's first bytes — the ones a text-mode transport mangles.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
    await store.write("images/sketch-photo-1.jpg", jpeg);
    expect([
      ...((await store.read("images/sketch-photo-1.jpg")) ?? []),
    ]).toEqual([...jpeg]);
  });

  it("reads a missing file as nothing", async () => {
    const { host } = fakeHost();
    await expect(
      icloudByteFileStore(host).read("images/gone.png"),
    ).resolves.toBe(null);
  });

  it("lists paths, so the image sweep and the layer save can scope themselves", async () => {
    const { host } = fakeHost({
      "paint-default.json": new Uint8Array([1]),
      "images/a.png": new Uint8Array([2]),
      "drawings/b.pct/layer-1.png": new Uint8Array([3]),
    });
    await expect(icloudByteFileStore(host).list()).resolves.toEqual([
      "paint-default.json",
      "images/a.png",
      "drawings/b.pct/layer-1.png",
    ]);
  });
});
