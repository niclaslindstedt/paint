// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app's icon. The App Store refuses an app icon whose PNG carries an
// alpha channel — even one where every pixel is opaque — and says so only at
// upload, long after the build. `make icons` writes it as plain RGB; this
// keeps a hand-edited or re-exported file from bringing the channel back.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

/** The PNG chunks in file order, as [type, data]. */
function chunks(bytes: Buffer): [string, Buffer][] {
  const out: [string, Buffer][] = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString("latin1", pos + 4, pos + 8);
    out.push([type, bytes.subarray(pos + 8, pos + 8 + length)]);
    pos += 12 + length;
  }
  return out;
}

describe("the phone app's icon", () => {
  const png = readFileSync(join(root, "native", "assets", "icon.png"));

  it("is a 1024-pixel square PNG", () => {
    expect([...png.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const [type, ihdr] = chunks(png)[0]!;
    expect(type).toBe("IHDR");
    expect(ihdr.readUInt32BE(0)).toBe(1024);
    expect(ihdr.readUInt32BE(4)).toBe(1024);
  });

  it("has no alpha channel and no transparency chunk", () => {
    const all = chunks(png);
    const ihdr = all[0]![1];
    // Colour type 2 is truecolour (RGB); 4 and 6 carry alpha, and 3 (a
    // palette) can smuggle it back in through tRNS.
    expect(ihdr[9]).toBe(2);
    expect(all.map(([type]) => type)).not.toContain("tRNS");
  });
});
