// The glyph workbench: render a set of SVG glyphs out of a source file, then
// look at them the three ways that actually catch mistakes — a contact sheet,
// an overlay against the design, and a table of numbers.
//
//   node glyphs.mjs render  [--config c.json]
//   node glyphs.mjs measure [--config c.json] [--stroke 1.3]
//   node glyphs.mjs contact [--config c.json]
//   node glyphs.mjs overlay [--config c.json] [--only Bucket]
//   node glyphs.mjs ascii    --only Bucket
//   node glyphs.mjs calibrate --sheet a        (grid overlay to find centres)
//
// See SKILL.md for the loop these fit into.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ascii,
  decodePng,
  inkMask,
  iou,
  keepGlyph,
  largestPart,
  measure,
} from "./png.mjs";

// ---------------------------------------------------------------- config ---

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "measure";
const flag = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i === -1 ? fallback : argv[i + 1];
};

const configPath = resolve(flag("config", "glyphs.config.json"));
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const root = dirname(configPath);
const at = (p) => resolve(root, p);

const OUT = at(cfg.out ?? ".glyphwork");
const CELL = cfg.cell ?? 116;
const GLYPH_PX = cfg.glyphPx ?? 84;
const COLS = cfg.cols ?? 8;
const ONLY = flag("only", null);
mkdirSync(OUT, { recursive: true });

const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const pick = (list) => (ONLY ? list.filter((g) => same(g.label, ONLY)) : list);

// ------------------------------------------------------- source → markup ---

const source = readFileSync(at(cfg.source), "utf8");

/** Stroke widths of the `const base = {...}` objects the glyphs spread, so a
 *  set with a lighter weight for one family is rendered as it really is. */
function strokeTable() {
  const table = {};
  const re = /const (\w+) = \{([^}]*)\}/g;
  let m;
  while ((m = re.exec(source))) {
    const body = m[2];
    const own = /strokeWidth:\s*([\d.]+)/.exec(body);
    const from = /\.\.\.(\w+)/.exec(body);
    if (own) table[m[1]] = parseFloat(own[1]);
    else if (from && table[from[1]] !== undefined) table[m[1]] = table[from[1]];
  }
  return table;
}

const STROKES = strokeTable();
const strokeOverride = flag("stroke", null);

const CAMEL_ATTR =
  /\b(strokeWidth|strokeDasharray|strokeLinecap|strokeLinejoin|strokeOpacity|fillOpacity|clipPath|textAnchor)=/g;

const attrs = (sw) =>
  `viewBox="${cfg.viewBox ?? "0 0 24 24"}" fill="none" stroke="currentColor" ` +
  `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;

/** Pull each exported glyph's markup out of the source and turn it into plain
 *  SVG: resolve the spread bases, drop the JSX-only attributes, un-camel the
 *  rest. */
function extract() {
  const found = new Map();
  const re = new RegExp(
    "export function (\\w+)\\([^)]*\\)\\s*\\{\\s*return \\(\\s*" +
      "([\\s\\S]*?)\\n {2}\\);\\n\\}",
    "g",
  );
  let m;
  while ((m = re.exec(source))) {
    let body = m[2];
    for (const [name, sw] of Object.entries(STROKES)) {
      body = body.replaceAll(`{...${name}}`, attrs(strokeOverride ?? sw));
    }
    found.set(
      m[1],
      body
        .replace(/ className=\{[^}]*\}/g, "")
        .replace(/\{filled \? "currentColor" : "none"\}/g, '"none"')
        .replace(/\{[a-zA-Z]+\}/g, "")
        .replace(CAMEL_ATTR, (a) =>
          a.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
        )
        .replace(/ aria-hidden="true"/g, "")
        .trim(),
    );
  }
  return found;
}

const MARKUP = extract();
const svgOf = (g) => MARKUP.get(g.export) ?? '<svg viewBox="0 0 24 24"></svg>';

const missing = cfg.glyphs.filter((g) => !MARKUP.has(g.export));
if (missing.length) {
  console.warn("not found in source:", missing.map((g) => g.export).join(", "));
}

// ------------------------------------------------------------- chromium ----

function shoot(html, png, width, height, scale = 1) {
  const htmlPath = `${OUT}/${html}`;
  execFileSync(
    cfg.chromium ?? "chromium",
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      `--force-device-scale-factor=${scale}`,
      `--window-size=${width},${height}`,
      `--screenshot=${OUT}/${png}`,
      htmlPath,
    ],
    { stdio: "ignore" },
  );
  return `${OUT}/${png}`;
}

const page = (css, body) =>
  `<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`;

// -------------------------------------------------------------- render -----

/** A bare grid of the glyphs, one per cell, for measuring. Nothing else is on
 *  the page: no labels, no borders, nothing that could land inside a crop. */
function render() {
  const cells = cfg.glyphs
    .map((g) => `<div class="c">${svgOf(g)}</div>`)
    .join("");
  writeFileSync(
    `${OUT}/mine.html`,
    page(
      `*{margin:0;padding:0}body{background:#000;color:#fff}
       .g{display:grid;grid-template-columns:repeat(${COLS},${CELL}px)}
       .c{width:${CELL}px;height:${CELL}px;display:flex;
          align-items:center;justify-content:center}
       .c svg{width:${GLYPH_PX}px;height:${GLYPH_PX}px;display:block}`,
      `<div class="g">${cells}</div>`,
    ),
  );
  const rows = Math.ceil(cfg.glyphs.length / COLS);
  shoot("mine.html", "mine.png", COLS * CELL, rows * CELL);
  return `${OUT}/mine.png`;
}

// ----------------------------------------------------------- reference -----

const sheetCache = {};
function sheetImage(key) {
  const s = cfg.sheets?.[key];
  if (!s) throw new Error("no sheet named " + key);
  sheetCache[key] ??= decodePng(readFileSync(at(s.path)));
  return { spec: s, img: sheetCache[key] };
}

/** Re-centre a hand-picked coordinate on the ink it actually surrounds. A few
 *  pixels out reads as a drawing error at overlay zoom when it is nothing of
 *  the kind, and a coordinate typed off a screenshot is always a little out. */
function refCrop(g) {
  const { spec, img } = sheetImage(g.ref.sheet);
  const half = spec.cut / 2;
  const cut = (x, y) =>
    keepGlyph(
      inkMask(img, {
        x0: x - half,
        y0: y - half,
        w: spec.cut,
        h: spec.cut,
      }),
    );

  const probe = cut(g.ref.x, g.ref.y);
  const pm = measure(probe);
  if (!pm) return { spec, img, cx: g.ref.x, cy: g.ref.y, mask: probe, mm: pm };

  // Nudge onto the ink, but only a little. A coordinate typed off a screenshot
  // is a few pixels out and worth correcting; a large correction means the cut
  // caught something it should not have, and chasing that makes it worse — so
  // the shift is capped, and a cut that comes back with noticeably less ink
  // (a clipped glyph) or noticeably more (a caption pulled in) is discarded.
  const lim = spec.cut * 0.1;
  const nudge = (d) => Math.max(-lim, Math.min(lim, d));
  const cx = g.ref.x + nudge(pm.centre.x - half);
  const cy = g.ref.y + nudge(pm.centre.y - half);
  const mask = cut(cx, cy);
  const mm = measure(mask);
  if (!mm || mm.area < pm.area * 0.9 || mm.area > pm.area * 1.12) {
    return { spec, img, cx: g.ref.x, cy: g.ref.y, mask: probe, mm: pm };
  }
  return { spec, img, cx, cy, mask, mm };
}

function mineCrop(png, index) {
  const col = index % COLS;
  const row = (index / COLS) | 0;
  const mask = keepGlyph(
    inkMask(png, { x0: col * CELL, y0: row * CELL, w: CELL, h: CELL }),
  );
  return { mask, mm: measure(mask) };
}

// -------------------------------------------------------------- measure ----

function table() {
  const png = decodePng(readFileSync(render()));
  const rows = [];
  const dens = [];
  cfg.glyphs.forEach((g, i) => {
    const mine = mineCrop(png, i);
    if (!mine.mm) return rows.push([g.label, "EMPTY", "", "", "", "", ""]);
    if (!g.ref) {
      rows.push([
        g.label,
        "-",
        (mine.mm.strokeRatio * 1000).toFixed(1),
        "-",
        String(Math.round(mine.mm.fill * 100)),
        (mine.mm.bw / mine.mm.bh).toFixed(2),
        "-",
      ]);
      dens.push([g.label, mine.mm.strokeRatio]);
      return;
    }
    const ref = refCrop(g);
    if (!ref.mm) {
      rows.push([g.label, "NO INK", "", "", "", "", ""]);
      return;
    }
    dens.push([g.label, mine.mm.fill / ref.mm.fill]);
    rows.push([
      g.label,
      (ref.mm.strokeRatio * 1000).toFixed(1),
      (mine.mm.strokeRatio * 1000).toFixed(1),
      (
        ((mine.mm.strokeRatio - ref.mm.strokeRatio) / ref.mm.strokeRatio) *
        100
      ).toFixed(0) + "%",
      Math.round(ref.mm.fill * 100) + "/" + Math.round(mine.mm.fill * 100),
      (ref.mm.bw / ref.mm.bh).toFixed(2) +
        "/" +
        (mine.mm.bw / mine.mm.bh).toFixed(2),
      (iou(ref, mine) * 100).toFixed(0),
    ]);
  });

  const head = [
    "glyph",
    "strokeR ref",
    "mine",
    "diff",
    "fill r/m",
    "aspect",
    "IoU%",
  ];
  const wid = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
  );
  const line = (cs) => cs.map((c, i) => String(c).padEnd(wid[i])).join("  ");
  console.log(line(head));
  console.log(wid.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((r) => console.log(line(r)));

  if (!cfg.sheets) {
    // No design to match: the set has to be consistent with itself instead, so
    // flag whichever glyph is furthest from the set's own middle.
    const vals = dens.map(([, v]) => v).sort((a, b) => a - b);
    const med = vals[vals.length >> 1];
    const off = dens
      .map(([l, v]) => [l, v / med])
      .filter(([, r]) => Math.abs(r - 1) > 0.18)
      .map(([l, r]) => `${l} ${(r * 100 - 100).toFixed(0)}%`);
    console.log(
      "\nagainst the set's own median weight:",
      off.length ? "off — " + off.join(", ") : "all within 18%",
    );
    return;
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const simple = new Set(cfg.simple ?? []);
  console.log(
    "\nink density mine/ref — simple:",
    mean(dens.filter(([l]) => simple.has(l)).map(([, v]) => v)).toFixed(3),
    " rest:",
    mean(dens.filter(([l]) => !simple.has(l)).map(([, v]) => v)).toFixed(3),
  );
}

// --------------------------------------------------------------- sheets ----

const refBackground = (g, display) => {
  const { spec, cx, cy } = refCrop(g);
  const z = (display / spec.cut) * (spec.scale ?? 1);
  const url = "file://" + at(spec.path);
  const { width, height } = sheetImage(g.ref.sheet).img;
  return (
    `background-image:url('${url}');` +
    `background-size:${width * z}px ${height * z}px;` +
    `background-position:${-(cx * z - display / 2)}px ` +
    `${-(cy * z - display / 2)}px;background-repeat:no-repeat;`
  );
};

function contact() {
  const D = 128;
  const rows = pick(cfg.glyphs)
    .map((g) => {
      const ref = g.ref
        ? `<div class="ref" style="${refBackground(g, D)}"></div>`
        : `<div class="ref"></div>`;
      const sizes = (cfg.sizes ?? [96, 18])
        .map(
          (s) =>
            `<div class="m" style="width:${Math.max(s, 40)}px">` +
            `<span style="width:${s}px;height:${s}px">${svgOf(g)}</span></div>`,
        )
        .join("");
      const l = `<div class="l">${g.label}</div>`;
      return `<div class="row">${l}${ref}${sizes}</div>`;
    })
    .join("");
  writeFileSync(
    `${OUT}/contact.html`,
    page(
      `body{background:#050506;color:#7ee787;font:12px ui-monospace,monospace;
            margin:0;padding:14px}
       .row{display:flex;gap:14px;align-items:center;margin-bottom:6px;
            border:1px solid #14181c;border-radius:6px;padding:4px 8px;
            background:#0a0c0e}
       .l{width:150px;color:#c9d1d9;font-size:13px;font-weight:700}
       .ref{width:${D}px;height:${D}px;border-right:1px dashed #1e242a}
       .m{display:flex;align-items:center;justify-content:center;height:${D}px}
       .m span{display:block}.m svg{width:100%;height:100%;display:block}`,
      rows,
    ),
  );
  const n = pick(cfg.glyphs).length;
  console.log(shoot("contact.html", "contact.png", 560, 30 + n * 140, 1.6));
}

function overlay() {
  const D = 260;
  const rows = pick(cfg.glyphs)
    .filter((g) => g.ref)
    .map(
      (g) =>
        `<div class="row"><div class="l">${g.label}</div>
         <div class="s"><div class="ref" style="${refBackground(g, D)}"></div>
         <div class="o">${svgOf(g)}</div></div></div>`,
    )
    .join("");
  writeFileSync(
    `${OUT}/overlay.html`,
    page(
      `body{background:#050506;color:#c9d1d9;font:13px ui-monospace,monospace;
            margin:0;padding:14px}
       .row{display:flex;gap:14px;align-items:center;margin-bottom:6px}
       .l{width:130px;font-weight:700}
       .s{position:relative;width:${D}px;height:${D}px}
       .s .ref{position:absolute;inset:0}
       .o{position:absolute;inset:0;color:#ff4d9d;opacity:.75;
          mix-blend-mode:screen}
       .o svg{width:100%;height:100%;display:block}`,
      rows,
    ),
  );
  const n = pick(cfg.glyphs).filter((g) => g.ref).length;
  console.log(shoot("overlay.html", "overlay.png", 440, 30 + n * 272, 2.2));
}

/** Grid over a design sheet, to read glyph centres off before configuring
 *  them. Coordinates are in the sheet's own pixels. */
function calibrate() {
  const key = flag("sheet", Object.keys(cfg.sheets ?? {})[0]);
  const { spec, img } = sheetImage(key);
  const step = Number(flag("step", 50));
  let marks = "";
  for (let x = 0; x <= img.width; x += step)
    marks += `<div class="v" style="left:${x}px"><b>${x}</b></div>`;
  for (let y = 0; y <= img.height; y += step)
    marks += `<div class="h" style="top:${y}px"><b>${y}</b></div>`;
  writeFileSync(
    `${OUT}/calibrate.html`,
    page(
      `body{margin:0;background:#111}
       .w{position:relative;width:${img.width}px;height:${img.height}px;
          transform:scale(${flag("zoom", 0.62)});transform-origin:0 0}
       img{display:block;width:${img.width}px;height:${img.height}px}
       .v{position:absolute;top:0;bottom:0;width:1px;background:#00e5ff88}
       .h{position:absolute;left:0;right:0;height:1px;background:#00e5ff88}
       b{color:#00e5ff;font:10px monospace;position:absolute}`,
      `<div class="w"><img src="file://${at(spec.path)}" />${marks}</div>`,
    ),
  );
  console.log(
    shoot(
      "calibrate.html",
      "calibrate.png",
      Math.ceil(img.width * Number(flag("zoom", 0.62))),
      Math.ceil(img.height * Number(flag("zoom", 0.62))),
      1.6,
    ),
  );
}

function showAscii() {
  const png = decodePng(readFileSync(`${OUT}/mine.png`));
  cfg.glyphs.forEach((g, i) => {
    if (ONLY && !same(g.label, ONLY)) return;
    const mine = mineCrop(png, i);
    if (g.ref) {
      const ref = refCrop(g);
      console.log(`=== ${g.label} — design`);
      console.log(ascii(ref.mask, ref.mm));
      const part = largestPart(ref.mask);
      const mypart = largestPart(mine.mask);
      if (part && mypart) {
        const d = `${part.w}x${part.h}`;
        const m = `${mypart.w}x${mypart.h}`;
        console.log(`largest part  design ${d}  mine ${m}`);
      }
    }
    console.log(`=== ${g.label} — mine`);
    console.log(ascii(mine.mask, mine.mm));
  });
}

const commands = {
  render,
  measure: table,
  contact,
  overlay,
  calibrate,
  ascii: showAscii,
};
const run = commands[cmd];
if (!run) {
  console.error("unknown command: " + cmd);
  console.error("try: " + Object.keys(commands).join(", "));
  process.exit(1);
}
run();
