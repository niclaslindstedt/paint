#!/usr/bin/env node
// Generate the PWA install icons and the social-preview image from the same
// geometry as public/icons/icon.svg — a brush swipe drawn as a gradient stroke
// on the app's dark surface (the line-art style shared with the sibling notes,
// checklist and contacts apps). Pure Node (zlib + a minimal PNG encoder), so
// the pipeline needs no native image dependencies. Rerun with `npm run icons` /
// `make icons` after changing the mark.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// The app look's surface (see src/app/look.ts) and the mark's amber gradient —
// a distinct hue from the green-marked sibling apps. Kept in lockstep with the
// <linearGradient> stops in public/icons/icon.svg.
const BG = [11, 13, 16]; // #0b0d10
const GRAD_TOP = [253, 224, 71]; // #fde047
const GRAD_BOT = [249, 115, 22]; // #f97316
// The gradient runs top-to-bottom over the mark's vertical extent (unit space),
// matching the userSpaceOnUse y1=0.25 / y2=0.76 span in the SVG.
const GRAD_Y0 = 0.25;
const GRAD_Y1 = 0.76;

// The stroke ink at unit-space height `y`, interpolated along the gradient.
function markInk(y) {
  const t = Math.max(0, Math.min(1, (y - GRAD_Y0) / (GRAD_Y1 - GRAD_Y0)));
  return [
    GRAD_TOP[0] + (GRAD_BOT[0] - GRAD_TOP[0]) * t,
    GRAD_TOP[1] + (GRAD_BOT[1] - GRAD_TOP[1]) * t,
    GRAD_TOP[2] + (GRAD_BOT[2] - GRAD_TOP[2]) * t,
  ];
}

// --- minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Pack already-encoded PNG blobs into a single ICONDIR (a .ico file). PNG-
// compressed entries are honoured by every current browser and by Windows
// since Vista, so one .ico carrying 16/32/48 px PNGs is the whole legacy-
// favicon story — the raster fallback for tabs that don't render the SVG mark.
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // resource type: icon
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = header.length + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const e = dir.subarray(i * 16);
    e[0] = size >= 256 ? 0 : size; // width  (0 encodes 256)
    e[1] = size >= 256 ? 0 : size; // height (0 encodes 256)
    e[2] = 0; // palette size (0 for a true-colour PNG entry)
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8); // bytes in this entry
    e.writeUInt32LE(offset, 12); // byte offset from the file start
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the mark ----------------------------------------------------------------

// A single brush swipe: one sine-shaped stroke across the tile, thick enough to
// stay legible at 16 px. Sampling the curve into a polyline and measuring the
// distance to it gives round caps and joins for free — the same shape the
// <path> in public/icons/icon.svg traces.

// Half the stroke width in unit space (matching stroke-width 15 / linecap round
// on the 100 viewBox in icon.svg).
const STROKE_HALF = 0.075;

// The swipe, sampled once at module load: a full sine wave across x ∈ [0.17,
// 0.83] — up, over, down — the shape a brush leaves when you wave it across a
// page, and one that still reads at 16 px.
const SWIPE = Array.from({ length: 96 }, (_, i) => {
  const t = i / 95;
  return { x: 0.17 + t * 0.66, y: 0.5 + 0.23 * Math.sin(2 * Math.PI * t) };
});

// Whether unit-space point (x, y) lands on the swipe.
function inStroke(x, y) {
  let best = Infinity;
  for (const p of SWIPE) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < best) best = d;
    if (best < STROKE_HALF) return true;
  }
  return best < STROKE_HALF;
}

// Render size×size RGBA. `pad` insets the mark (maskable icons need a safe
// zone); `radius` rounds the background corners (0 = square, for maskable).
function renderIcon(size, { pad = 0.12, radius = 0.2 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = radius * size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      // Rounded-rect background coverage.
      const dx = Math.max(r - px, px - (size - 1 - r), 0);
      const dy = Math.max(r - py, py - (size - 1 - r), 0);
      const outside = Math.hypot(dx, dy) - r;
      const bgAlpha = Math.max(0, Math.min(1, 0.5 - outside));
      // Stroke coverage in padded unit space, 3×3 supersampled for smooth
      // edges on the thin outline. The gradient ink is sampled at the pixel's
      // own height so the stroke shades top-to-bottom.
      let hit = 0;
      for (const oy of [1 / 6, 0.5, 5 / 6]) {
        for (const ox of [1 / 6, 0.5, 5 / 6]) {
          const sx = ((px + ox) / size - pad) / (1 - 2 * pad);
          const sy = ((py + oy) / size - pad) / (1 - 2 * pad);
          if (inStroke(sx, sy)) hit += 1 / 9;
        }
      }
      const [br, bg2, bb] = BG;
      const sy = ((py + 0.5) / size - pad) / (1 - 2 * pad);
      const [fr, fg2, fb] = markInk(sy);
      rgba[i] = Math.round(br + (fr - br) * hit);
      rgba[i + 1] = Math.round(bg2 + (fg2 - bg2) * hit);
      rgba[i + 2] = Math.round(bb + (fb - bb) * hit);
      rgba[i + 3] = Math.round(bgAlpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

// The 1200×630 Open Graph card: the mark on the left, accent bars suggesting
// contact rows on the right.
function renderOg() {
  const w = 1200;
  const h = 630;
  const rgba = Buffer.alloc(w * h * 4);
  const markSize = 440;
  const markX = 120;
  const markY = (h - markSize) / 2;
  // The swatch row mirrors the app's own toolbar palette (see PALETTE in
  // src/app/useAppSettings.ts), so the card and the app agree on the colours.
  const rows = [
    { x: 660, y: 250, w: 90, h: 90, rgb: [239, 68, 68] },
    { x: 770, y: 250, w: 90, h: 90, rgb: [245, 158, 11] },
    { x: 880, y: 250, w: 90, h: 90, rgb: [34, 197, 94] },
    { x: 660, y: 360, w: 90, h: 90, rgb: [59, 130, 246] },
    { x: 770, y: 360, w: 90, h: 90, rgb: [168, 85, 247] },
    { x: 880, y: 360, w: 90, h: 90, rgb: [255, 255, 255] },
  ];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      let [cr, cg, cb] = BG;
      // The brush swipe, drawn with the same gradient stroke as the icons.
      if (
        px >= markX &&
        px < markX + markSize &&
        py >= markY &&
        py < markY + markSize
      ) {
        const sx = (px - markX) / markSize;
        const sy = (py - markY) / markSize;
        if (inStroke(sx, sy)) [cr, cg, cb] = markInk(sy).map(Math.round);
      }
      // The colour swatches.
      for (const rrow of rows) {
        if (
          px >= rrow.x &&
          px < rrow.x + rrow.w &&
          py >= rrow.y &&
          py < rrow.y + rrow.h
        ) {
          [cr, cg, cb] = rrow.rgb;
        }
      }
      rgba[i] = cr;
      rgba[i + 1] = cg;
      rgba[i + 2] = cb;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(w, h, rgba);
}

writeFileSync(join(iconsDir, "pwa-192.png"), renderIcon(192));
writeFileSync(join(iconsDir, "pwa-512.png"), renderIcon(512));
writeFileSync(
  join(iconsDir, "pwa-512-maskable.png"),
  renderIcon(512, { pad: 0.22, radius: 0 }),
);
writeFileSync(
  join(iconsDir, "apple-touch-icon-180.png"),
  renderIcon(180, { pad: 0.12, radius: 0 }),
);
writeFileSync(join(root, "public", "og.png"), renderOg());

// favicon.ico — the browser-tab fallback for engines that ignore the SVG
// favicon (Safari, search crawlers) and for the implicit /favicon.ico request.
// Packs the mark at the three classic tab sizes; a hair less padding than the
// install icons so the thin outline stays legible at 16 px. Lives at the public
// root so it deploys as `<base>favicon.ico` (see pwa-plugin.ts link tag).
writeFileSync(
  join(root, "public", "favicon.ico"),
  encodeIco(
    [16, 32, 48].map((size) => ({
      size,
      data: renderIcon(size, { pad: 0.08 }),
    })),
  ),
);
console.log(
  "icons: wrote pwa-192/512/512-maskable, apple-touch-180, og.png, favicon.ico",
);
