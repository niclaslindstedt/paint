// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Crop a region of a rendered sheet at N× nearest-neighbour, so texture and
// shading can actually be judged. Small renders lie: a mark that looks like a
// flat dark ribbon at 1× is often a perfectly good simulation whose character
// only reads at 3×. Never retune from the full sheet — crop first.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/zoom.ts -- \
//     <sheet.png> <x> <y> <w> <h> [zoom=3] [out=zoom.png]

import { readPng, writePng } from "./pngio.ts";

const args = process.argv.slice(2).filter((a) => a !== "--");
const [file, xs, ys, ws, hs, zs, out] = args;
if (!file || !xs || !ys || !ws || !hs) {
  console.error("usage: zoom.ts <sheet.png> <x> <y> <w> <h> [zoom] [out]");
  process.exit(1);
}
const cx = Number(xs);
const cy = Number(ys);
const cw = Number(ws);
const ch = Number(hs);
const Z = Number(zs ?? 3);
const target = out ?? file.replace(/\.png$/, `-zoom.png`);

const { rgb, w, h } = readPng(file);
const scaled = new Uint8Array(cw * Z * ch * Z * 3);
for (let y = 0; y < ch * Z; y++) {
  for (let x = 0; x < cw * Z; x++) {
    const sx = Math.min(w - 1, cx + Math.floor(x / Z));
    const sy = Math.min(h - 1, cy + Math.floor(y / Z));
    const s = (sy * w + sx) * 3;
    const d = (y * cw * Z + x) * 3;
    scaled[d] = rgb[s]!;
    scaled[d + 1] = rgb[s + 1]!;
    scaled[d + 2] = rgb[s + 2]!;
  }
}
writePng(scaled, cw * Z, ch * Z, target);
console.log(`wrote ${target}`);
