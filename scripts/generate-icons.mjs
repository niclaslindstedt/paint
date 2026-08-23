#!/usr/bin/env node
// Generate the PWA install icons and the social-preview image from the same
// geometry as public/icons/icon.svg — a stylized pen drawn as a solid green
// silhouette on the app's dark surface (the style shared with the sibling
// notes, checklist and contacts marks). Pure Node (zlib + a minimal PNG
// encoder), so the pipeline needs no native image dependencies. Rerun with
// `npm run icons` / `make icons` after changing the mark.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// The app look's surface (see src/app/look.ts) and the mark's ink: one flat
// green, the hue the sibling apps' marks wear, so a home screen holding
// several of them reads as one family. Flat rather than graded on purpose —
// at 16 px a ramp is a colour nobody picked, and the siblings are flat.
// Kept in lockstep with the `fill` in public/icons/icon.svg.
const BG = [11, 13, 16]; // #0b0d10
const MARK = [110, 231, 167]; // #6ee7a7

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

// The other .ico, and it exists because a resource compiler is not a browser.
//
// `encodeIco` above packs PNG-compressed entries, which every current browser
// and Windows itself read happily. The Windows RESOURCE COMPILER does not:
// `tauri-build` embeds `icons/icon.ico` into the executable through `llvm-rc`
// (or `rc.exe`), and those parse the classic DIB entry rather than a PNG one —
// so the desktop shell's icon is packed the old way instead.
//
// A DIB entry is a `BITMAPINFOHEADER` whose height is DOUBLED, because the
// format still describes two stacked bitmaps: the bottom-up BGRA colour one,
// and a 1-bit AND mask. The mask is all zeroes (every pixel opaque as far as
// it is concerned) and the alpha channel does the real work, which is what
// every 32-bit icon since Windows XP does. Its rows are still padded to four
// bytes, and a parser that reads the header will read them.
function dibEntry(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight — colour + mask
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Bottom-up: the last row of the image is the first row of the DIB.
    const from = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      const at = from + x * 4;
      const to = (y * size + x) * 4;
      pixels[to] = rgba[at + 2]; // B
      pixels[to + 1] = rgba[at + 1]; // G
      pixels[to + 2] = rgba[at]; // R
      pixels[to + 3] = rgba[at + 3]; // A
    }
  }

  const maskStride = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
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

// The app mark: a stylized pen held at 45°. It is built the way the sibling
// marks are (the notes page, the checklist tick): **solid** shapes in one flat
// colour, filling the tile corner to corner, with the detail cut *out* of them
// in the background colour rather than drawn as thin lines. A hairline outline
// survives neither a 16 px favicon nor a phone's home screen two rows down; a
// solid silhouette does, and it is what puts this icon in the same family as
// the others rather than beside them.
//
// Three pieces, which is the ceiling before a mark reads as texture: barrel,
// collar, nib. They are what tell a pen from the pencil-shaped things — the
// barrel widens toward the collar instead of tapering to the tip, the collar
// is the widest part, and the nib comes to a point in a third of the length.
//
// The geometry is written upright — barrel at the top, nib at the bottom — and
// turned as a whole, which is how `icon.svg` states it too
// (`transform="translate(1.4 -1.4) rotate(45 50 50)"`). Kept in lockstep with
// that file: the point lists below are its `d` attributes.

// Every solid piece is drawn *and* outlined with a round-joined stroke this
// wide, which is what rounds its corners — the soft-cornered geometry the
// sibling marks wear (`stroke-linejoin="round"` on a filled path in the SVG).
// It also blunts the nib's point, which is what keeps the tip from
// disappearing into a single pale pixel at favicon size.
const ROUND = 6;

const UPRIGHT = {
  fills: [
    // The barrel. It starts above the tile's box because the mark is turned
    // onto the diagonal, which is where the room is: upright it would be half
    // again too long, turned it fills the tile corner to corner.
    [
      [38, 2],
      [62, 2],
      [64, 50],
      [36, 50],
    ],
    // The collar — the band the nib seats into, and the widest part of the
    // pen, so what comes out below it reads as a nib rather than as more
    // barrel.
    [
      [33, 60],
      [67, 60],
      [67, 72],
      [33, 72],
    ],
    // The nib, coming to a point. The taper is steep on purpose: turned 45°
    // and seen at 16 px, a gentle one reads as another block of barrel.
    [
      [38, 82],
      [62, 82],
      [50, 114],
    ],
  ],
};

// Nothing is drawn *on* the mark: the seams above and below the collar are the
// gaps between three solid pieces, so the unlit tile shows through them — the
// way the notes page's lines are cut out of its silhouette rather than ruled
// across it. The gaps are 10 units of raw geometry because the round-joined
// outline eats 3 from each side; what ships is the 4 that is left.

// Rotate 45° about the tile's centre, then nudge the turned mark back onto it
// (the nib reaches further past the centre than the barrel's blunt end does,
// so the rotation alone leaves it hanging low and left). Applied once at
// module load; everything downstream works in unit space.
const COS45 = Math.SQRT1_2;
const NUDGE_X = 1.4;
const NUDGE_Y = -1.4;
const turn = (points) =>
  points.map(([x, y]) => {
    const dx = x - 50;
    const dy = y - 50;
    return [
      (50 + (dx - dy) * COS45 + NUDGE_X) / 100,
      (50 + (dx + dy) * COS45 + NUDGE_Y) / 100,
    ];
  });
const FILLS = UPRIGHT.fills.map(turn);

const ROUND_HALF = ROUND / 2 / 100;

// Distance from unit-space (px, py) to the segment (ax, ay)–(bx, by). A segment
// within half a width of the point is a capsule, so round caps and joins fall
// out of the distance field rather than being drawn.
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether (px, py) is within `half` of any segment of `polylines`. */
function nearAny(polylines, px, py, half, closed = false) {
  for (const line of polylines) {
    const last = closed ? line.length : line.length - 1;
    for (let i = 0; i < last; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[(i + 1) % line.length];
      if (distToSegment(px, py, ax, ay, bx, by) < half) return true;
    }
  }
  return false;
}

/** Whether (px, py) is inside `polygon` — even-odd ray crossing. */
function inPolygon(polygon, px, py) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// Whether unit-space point (x, y) lands on the pen: inside a solid piece, or
// within the round-join outline that softens its corners.
function inStroke(x, y) {
  return (
    FILLS.some((polygon) => inPolygon(polygon, x, y)) ||
    nearAny(FILLS, x, y, ROUND_HALF, true)
  );
}

// Render size×size RGBA. `pad` insets the mark (maskable icons need a safe
// zone); `radius` rounds the background corners (0 = square, for maskable).
// Returns the raw buffer: the .ico entries below need pixels rather than a PNG.
function renderIconRgba(size, { pad = 0.12, radius = 0.2 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = radius * size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      // Rounded-rect background coverage.
      const dx = Math.max(r - px, px - (size - 1 - r), 0);
      const dy = Math.max(r - py, py - (size - 1 - r), 0);
      const outside = Math.hypot(dx, dy) - r;
      // A square tile has no corner to fall outside of, so it is opaque
      // throughout: the coverage formula below only describes a *rounded* one
      // (at `radius: 0` every pixel sits exactly on its own edge, which read as
      // half-transparent and left the maskable and apple-touch icons ghosted).
      const bgAlpha = r === 0 ? 1 : Math.max(0, Math.min(1, 0.5 - outside));
      // Mark coverage in padded unit space, 3×3 supersampled for smooth edges.
      let hit = 0;
      for (const oy of [1 / 6, 0.5, 5 / 6]) {
        for (const ox of [1 / 6, 0.5, 5 / 6]) {
          const sx = ((px + ox) / size - pad) / (1 - 2 * pad);
          const sy = ((py + oy) / size - pad) / (1 - 2 * pad);
          if (inStroke(sx, sy)) hit += 1 / 9;
        }
      }
      const [br, bg2, bb] = BG;
      const [fr, fg2, fb] = MARK;
      rgba[i] = Math.round(br + (fr - br) * hit);
      rgba[i + 1] = Math.round(bg2 + (fg2 - bg2) * hit);
      rgba[i + 2] = Math.round(bb + (fb - bb) * hit);
      rgba[i + 3] = Math.round(bgAlpha * 255);
    }
  }
  return rgba;
}

/** The same mark, encoded as a PNG — what every icon file but the Windows
 *  `.ico` below is. */
function renderIcon(size, options) {
  return encodePng(size, size, renderIconRgba(size, options));
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
      // The pen, drawn from the same geometry and in the same ink as the icons.
      if (
        px >= markX &&
        px < markX + markSize &&
        py >= markY &&
        py < markY + markSize
      ) {
        const sx = (px - markX) / markSize;
        const sy = (py - markY) / markSize;
        if (inStroke(sx, sy)) [cr, cg, cb] = MARK;
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
// The DESKTOP SHELL's icons (tauri/src-tauri/icons/), from the same geometry
// and the same ink as everything above — so the app in the dock, the tile on
// the home screen and the favicon in the tab are one mark rather than three
// that resemble each other.
//
// Two things make this a separate set rather than a reference to `public/`:
//
//   - **Tauri refuses a paletted PNG at COMPILE time**, inside
//     `generate_context!`, with `icon … is not RGBA`. These are RGBA (colour
//     type 6, see `encodePng`), so that is satisfied by construction here —
//     but it is why the sizes are re-rendered rather than symlinked to
//     whichever file happened to be the right shape.
//   - **`tauri-build` refuses a MISSING `icon.ico` outright** on a Windows
//     target ("required for generating a Windows Resource file"), and it must
//     be the DIB flavour a resource compiler can read — see `encodeIcoDib`.
//
// `radius: 0` throughout: every desktop draws its own mask over an app icon
// (macOS its squircle, Windows its square), so a tile that rounded its own
// corners first would sit inside a second rounding.
const tauriIconsDir = join(root, "tauri", "src-tauri", "icons");
mkdirSync(tauriIconsDir, { recursive: true });
const TAURI_SIZES = [32, 128, 256, 512];
for (const size of TAURI_SIZES) {
  writeFileSync(
    join(tauriIconsDir, `${size}x${size}.png`),
    renderIcon(size, { pad: 0.12, radius: 0 }),
  );
}
// Windows' own ladder: 16 and 32 are the ones actually drawn (the title bar,
// the taskbar, Explorer's small views), 48 is the shell's medium icon, and 256
// is what a large-icon view scales from. The three small ones are bitmaps and
// 256 is a PNG, which is the layout every Windows icon has worn since Vista —
// a 256 bitmap would be a quarter-megabyte of uncompressed BGRA in a file the
// repository carries, for the one size the format was extended to compress.
writeFileSync(
  join(tauriIconsDir, "icon.ico"),
  encodeIco([
    ...[16, 32, 48].map((size) => ({
      size,
      data: dibEntry(size, renderIconRgba(size, { pad: 0.08, radius: 0 })),
    })),
    { size: 256, data: renderIcon(256, { pad: 0.08, radius: 0 }) },
  ]),
);

console.log(
  "icons: wrote pwa-192/512/512-maskable, apple-touch-180, og.png, favicon.ico, " +
    `and ${TAURI_SIZES.length} desktop icons + icon.ico`,
);
