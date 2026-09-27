// Pixel measurement for glyph work, with no dependencies.
//
// Everything here exists because you cannot judge line art by eye at the size
// it ships at. A glyph that "looks a bit heavy" is heavy by a number, and the
// number is what you iterate against. Node's zlib does the only hard part of
// reading a PNG, so this needs nothing installed.

import { inflateSync } from "node:zlib";

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode an 8-bit, non-interlaced PNG (grey / RGB / RGBA). */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let off = 8;
  let width = 0;
  let height = 0;
  let ch = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error("only 8-bit pngs are supported");
      if (body[12] !== 0) throw new Error("interlaced pngs are not supported");
      ch = CHANNELS[body[9]];
      if (!ch) throw new Error("colour type " + body[9] + " unsupported");
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
  }
  return { width, height, ch, data: out };
}

/** Ink mask for line art on a dark ground.
 *
 *  The cut is half of the *crop's own* brightest pixel, never a fixed level. A
 *  design sheet is usually a soft screenshot and a freshly rendered SVG is
 *  crisp; at a fixed threshold the soft one measures thinner than it is and the
 *  crisp one thicker, so you end up correcting a difference in the ruler.
 *  Half-maximum is where a symmetric edge actually crosses, and reads both the
 *  same. */
export function inkMask(img, box, frac = 0.5) {
  // Re-centring produces fractional origins; a fractional index reads nothing
  // and the mask comes back as noise, which looks like a drawing bug and is
  // not one. Snap to the pixel grid before sampling.
  const x0 = Math.round(box.x0);
  const y0 = Math.round(box.y0);
  const w = Math.round(box.w);
  const h = Math.round(box.h);
  const luma = new Float32Array(w * h);
  let peak = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      const i = (sy * img.width + sx) * img.ch;
      const r = img.data[i];
      const g = img.ch >= 3 ? img.data[i + 1] : r;
      const b = img.ch >= 3 ? img.data[i + 2] : r;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luma[y * w + x] = L;
      if (L > peak) peak = L;
    }
  }
  const cut = Math.max(28, peak * frac);
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (luma[i] >= cut) m[i] = 1;
  return { m, w, h };
}

function components(mask) {
  const { m, w, h } = mask;
  const lab = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || lab[i] !== -1) continue;
    const id = comps.length;
    const c = {
      n: 0,
      touches: false,
      minX: 1e9,
      minY: 1e9,
      maxX: -1,
      maxY: -1,
    };
    lab[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p / w) | 0;
      c.n++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.touches = true;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (m[q] && lab[q] === -1) {
            lab[q] = id;
            stack.push(q);
          }
        }
      }
    }
    comps.push(c);
  }
  return { lab, comps };
}

/** Keep only the ink that belongs to the glyph.
 *
 *  A crop out of a contact sheet also catches whatever is nearby — the cell's
 *  border rule, the top of a caption. Those run out of the crop and the glyph
 *  does not, so dropping every blob that touches the edge removes them. Blobs
 *  sitting wholly outside a centred circle go too. A spray of dots or the two
 *  rings on a line tool are separate blobs and legitimately stay. */
export function keepGlyph(mask, radiusFrac = 0.46) {
  const { m, w, h } = mask;
  const { lab, comps } = components(mask);
  const R = Math.min(w, h) * radiusFrac;
  const ok = comps.map((c) => {
    if (c.touches) return false;
    const bx = (c.minX + c.maxX) / 2;
    const by = (c.minY + c.maxY) / 2;
    return Math.hypot(bx - w / 2, by - h / 2) <= R;
  });
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (m[i] && ok[lab[i]]) out[i] = 1;
  return { m: out, w, h };
}

/** The largest connected blob's bounding box — the body of a compound glyph
 *  (the pail under a bucket's drop and handle), which is what you compare when
 *  a satellite shape is stretching the overall box. */
export function largestPart(mask) {
  const { comps } = components(mask);
  if (!comps.length) return null;
  const c = comps.sort((a, b) => b.n - a.n)[0];
  return { w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 };
}

/** Geometry of a line-art mask.
 *
 *  `stroke` is 2*area/perimeter: a stroke of width w and length L has area w*L
 *  and an outline of about 2L, so the ratio recovers w without a skeleton.
 *  `strokeRatio` divides that by the artwork's diagonal, which is what makes
 *  two drawings at different sizes comparable at all. */
export function measure({ m, w, h }) {
  let area = 0;
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!area) return null;
  let perim = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        !m[y * w + x - 1] ||
        !m[y * w + x + 1] ||
        !m[(y - 1) * w + x] ||
        !m[(y + 1) * w + x];
      if (edge) perim++;
    }
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const stroke = (2 * area) / perim;
  return {
    area,
    bw,
    bh,
    stroke,
    strokeRatio: stroke / Math.hypot(bw, bh),
    fill: area / (bw * bh),
    centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    box: { minX, minY, maxX, maxY },
  };
}

function normalise(mask, mm, N) {
  const g = new Uint8Array(N * N);
  const { minX, minY, maxX, maxY } = mm.box;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const s = Math.max(bw, bh);
  const ox = (s - bw) / 2;
  const oy = (s - bh) / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const sx = Math.round(minX - ox + ((x + 0.5) * s) / N);
      const sy = Math.round(minY - oy + ((y + 0.5) * s) / N);
      if (sx < 0 || sy < 0 || sx >= mask.w || sy >= mask.h) continue;
      g[y * N + x] = mask.m[sy * mask.w + sx];
    }
  }
  return g;
}

/** Overlap of two masks after each is scaled from its own bounding box into a
 *  common grid — compares shape, with size and placement taken out. Thin line
 *  art scores low even when it is right, so read it as a trend across rounds
 *  rather than as a grade. */
export function iou(a, b, N = 96) {
  const ga = normalise(a.mask, a.mm, N);
  const gb = normalise(b.mask, b.mm, N);
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < N * N; i++) {
    if (ga[i] && gb[i]) inter++;
    if (ga[i] || gb[i]) uni++;
  }
  return uni ? inter / uni : 0;
}

/** Text picture of a mask, normalised so two drawings at different resolutions
 *  downsample identically and a 45-degree gap survives in both or neither. */
export function ascii(mask, mm, cols = 46) {
  const rows = Math.round(cols / 2);
  const g = normalise(mask, mm, cols);
  let out = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out += g[Math.round((r * cols) / rows) * cols + c] ? "#" : ".";
    }
    out += "\n";
  }
  return out;
}
