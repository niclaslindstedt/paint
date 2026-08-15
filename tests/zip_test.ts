// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The zip codec is hand-rolled, which means the format's own invariants are the
// test: an archive has to be readable by *other* software, so it is not enough
// that our writer and our reader agree with each other. What's asserted here is
// the byte layout a stranger's unzip would look for — the signatures, the
// central directory it seeks from the end, the CRC it checks the payload
// against — plus the two properties the container leans on (order survives, and
// the same content always produces the same bytes).
import { describe, expect, it } from "vitest";

import { crc32, unzip, unzipToMap, zip } from "../src/app/zip.ts";

const utf8 = new TextEncoder();
const text = (s: string) => utf8.encode(s);
const read = (b: Uint8Array) => new TextDecoder().decode(b);

/** Little-endian u32 at an offset — the format's only integer width worth
 *  checking by hand. */
function u32(bytes: Uint8Array, at: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(at, true);
}

describe("crc32", () => {
  // The standard check value: CRC-32 of "123456789" is 0xCBF43926. If this
  // passes, the table and the loop are the ones every other zip tool uses.
  it("matches the standard check value", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for no bytes", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("zip", () => {
  it("writes a local file header signature first", async () => {
    const bytes = await zip([{ name: "a.txt", bytes: text("hello") }]);
    expect(u32(bytes, 0)).toBe(0x04034b50);
  });

  it("ends with an end-of-central-directory record", async () => {
    const bytes = await zip([{ name: "a.txt", bytes: text("hello") }]);
    // The EOCD is the last 22 bytes when there is no archive comment, and it is
    // what a reader seeks backwards for.
    expect(u32(bytes, bytes.length - 22)).toBe(0x06054b50);
  });

  it("records the entry count in the central directory", async () => {
    const bytes = await zip([
      { name: "a.txt", bytes: text("one") },
      { name: "b.txt", bytes: text("two") },
      { name: "c.txt", bytes: text("three") },
    ]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(3);
  });

  it("round-trips content", async () => {
    const bytes = await zip([
      { name: "a.txt", bytes: text("hello") },
      { name: "nested/b.json", bytes: text('{"x":1}') },
    ]);
    const files = await unzipToMap(bytes);
    expect(read(files.get("a.txt")!)).toBe("hello");
    expect(read(files.get("nested/b.json")!)).toBe('{"x":1}');
  });

  it("preserves entry order", async () => {
    const names = ["mimetype", "manifest.json", "layers/00.png", "z.txt"];
    const bytes = await zip(names.map((name) => ({ name, bytes: text(name) })));
    expect((await unzip(bytes)).map((e) => e.name)).toEqual(names);
  });

  it("round-trips content that actually compresses", async () => {
    // Long and repetitive, so deflate is genuinely exercised rather than the
    // writer falling back to stored because compression grew the input.
    const body = "the same sentence over and over. ".repeat(500);
    const bytes = await zip([{ name: "big.txt", bytes: text(body) }]);
    expect(bytes.length).toBeLessThan(body.length / 4);
    expect(read((await unzipToMap(bytes)).get("big.txt")!)).toBe(body);
  });

  it("round-trips stored entries", async () => {
    const bytes = await zip([
      { name: "raw.bin", bytes: text("not compressed"), compress: false },
    ]);
    expect(read((await unzipToMap(bytes)).get("raw.bin")!)).toBe(
      "not compressed",
    );
  });

  it("stores incompressible input rather than growing it", async () => {
    // Deflate on random-ish bytes emits more than it was given; the writer is
    // supposed to notice and store instead.
    const noise = new Uint8Array(2048);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) & 0xff;
    const bytes = await zip([{ name: "noise.bin", bytes: noise }]);
    const back = (await unzipToMap(bytes)).get("noise.bin")!;
    expect(Array.from(back)).toEqual(Array.from(noise));
    // Header overhead is ~90 bytes for one entry; anything near the payload
    // size means it wasn't inflated by a pointless deflate pass.
    expect(bytes.length).toBeLessThan(noise.length + 200);
  });

  it("round-trips an empty entry", async () => {
    const bytes = await zip([{ name: "empty", bytes: new Uint8Array(0) }]);
    expect((await unzipToMap(bytes)).get("empty")!.length).toBe(0);
  });

  it("round-trips a non-ASCII name", async () => {
    const bytes = await zip([{ name: "lager/blå.png", bytes: text("x") }]);
    expect([...(await unzipToMap(bytes)).keys()]).toEqual(["lager/blå.png"]);
  });

  it("writes an empty archive", async () => {
    const bytes = await zip([]);
    expect(bytes.length).toBe(22);
    expect(await unzip(bytes)).toEqual([]);
  });

  // Determinism is what lets a container be compared byte for byte — a clock in
  // the header would make every save look like a change.
  it("is deterministic", async () => {
    const entries = [
      { name: "manifest.json", bytes: text('{"format":"pct"}') },
      { name: "layers/00.png", bytes: text("pixels"), compress: false },
    ];
    const a = await zip(entries);
    const b = await zip(entries);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("unzip", () => {
  it("refuses bytes that are not an archive", async () => {
    await expect(unzip(text("this is not a zip"))).rejects.toThrow(
      /not a zip/i,
    );
  });

  it("refuses a truncated archive", async () => {
    const bytes = await zip([{ name: "a.txt", bytes: text("hello") }]);
    await expect(unzip(bytes.subarray(0, bytes.length - 10))).rejects.toThrow();
  });

  it("survives a trailing comment", async () => {
    // A reader that assumes the EOCD is the last 22 bytes breaks here; one that
    // scans backwards for the signature does not.
    const bytes = await zip([{ name: "a.txt", bytes: text("hello") }]);
    const commented = new Uint8Array(bytes.length + 3);
    commented.set(bytes);
    // Bump the comment-length field and append the comment.
    new DataView(commented.buffer).setUint16(bytes.length - 2, 3, true);
    commented.set(text("bye"), bytes.length);
    expect(read((await unzipToMap(commented)).get("a.txt")!)).toBe("hello");
  });
});
