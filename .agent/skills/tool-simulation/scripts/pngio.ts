// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Minimal PNG in/out for the simulation harnesses — node's zlib and nothing
// else, so the scripts need nothing installed. Writes truecolour 8-bit with
// filter 0 rows, and reads back only what it writes (which is all the
// harnesses ever ask of it).

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Write `rgb` (row-major, 3 bytes a pixel) as a PNG. */
export function writePng(
  rgb: Uint8Array,
  w: number,
  h: number,
  path: string,
): void {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  writeFileSync(path, out);
}

/** Read a PNG this module wrote (truecolour 8-bit, filter 0 rows). */
export function readPng(path: string): {
  rgb: Uint8Array;
  w: number;
  h: number;
} {
  const buf = readFileSync(path);
  let at = 8;
  let w = 0;
  let h = 0;
  const idat: Uint8Array[] = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (w * 3 + 1)];
    if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
    rgb.set(
      raw.subarray(y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1)),
      y * w * 3,
    );
  }
  return { rgb, w, h };
}

/** A white page to composite films onto, and the composite itself. */
export function whitePage(w: number, h: number): Float32Array {
  return new Float32Array(w * h * 3).fill(1);
}

export function compositeCell(
  page: Float32Array,
  at: number,
  shade: readonly [number, number, number, number],
): void {
  const [r, g, b, a] = shade;
  const o = at * 3;
  page[o] = page[o]! * (1 - a) + r * a;
  page[o + 1] = page[o + 1]! * (1 - a) + g * a;
  page[o + 2] = page[o + 2]! * (1 - a) + b * a;
}

export function pageToRgb(page: Float32Array): Uint8Array {
  const rgb = new Uint8Array(page.length);
  for (let i = 0; i < rgb.length; i++) {
    rgb[i] = Math.max(0, Math.min(255, Math.round(page[i]! * 255)));
  }
  return rgb;
}
