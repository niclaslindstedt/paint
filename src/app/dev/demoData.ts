// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The presentation demo's data (see `demo.ts`): one person's sketchbooks, drawn
// stroke by stroke through `hand.ts` into the app's own document format.
//
// Imports types and pure arithmetic only: this module is evaluated before the
// in-memory store is in place (`demo-boot.ts`), so nothing here may touch
// storage, the logger or the plugin registry at load.

import { graphiteInk } from "../plugins/graphite.ts";
import type { AppData, Drawing, Folder, Stroke } from "../types.ts";
import { Hand, type Pt } from "./hand.ts";
import { measure, write } from "./letters.ts";
// An unbranded monitoring panel, rendered once from a mock-up
// (`latency.jpg`, 1600 × 900): the screenshot the incident page annotates.
import latencyShot from "./latency.jpg?inline";

/** A millimetre of page, in document pixels (`units.ts`: 460 ppi). */
const MM = 460 / 25.4;
/** A point of type, in document pixels. */
const PT = 460 / 72;

/** The document version the bytes at rest are stamped with
 *  (`LATEST_VERSION` in `migrations.ts`, which the test holds this to). */
export const DOC_VERSION = 3;

/** The settings fields the demo brings its own of (see `demo.ts`). */
export const DEMO_SETTINGS_KEYS = [
  "canvasPresets",
  "customColors",
  "toolPresets",
] as const;

// Inks, off the toolbar's own palette where it has one.
const INK = "#111827";
const BLUE = "#2563eb";
const RED = "#ef4444";
const GREEN = "#16a34a";
const YELLOW = "#facc15";

type Ink = {
  color?: string;
  size: number;
  opacity?: number;
  dials?: Record<string, number>;
  layer?: string;
};

type TextInk = {
  size: number;
  color?: string;
  font?: "sans" | "serif" | "mono" | "casual";
  bold?: boolean;
  italic?: boolean;
  layer?: string;
};

/** One page being drawn: the strokes, in the order a person laid them. */
class Page {
  readonly strokes: Stroke[] = [];
  private n = 0;

  constructor(
    private readonly id: string,
    readonly hand: Hand,
  ) {}

  private stamp(): string {
    this.n += 1;
    return `${this.id}-s${this.n}`;
  }

  /** A freehand mark with `tool` (a plugin id) along `points`. */
  mark(tool: string, points: Pt[], ink: Ink): void {
    if (points.length < 2) return;
    this.strokes.push({
      id: this.stamp(),
      tool,
      ...(ink.color ? { color: ink.color } : {}),
      size: ink.size,
      ...(ink.opacity !== undefined ? { opacity: ink.opacity } : {}),
      ...(ink.dials ? { dials: ink.dials } : {}),
      ...(ink.layer ? { layer: ink.layer } : {}),
      shape: { kind: "path", points },
    });
  }

  marks(tool: string, list: Pt[][], ink: Ink): void {
    for (const points of list) this.mark(tool, points, ink);
  }

  /** A caption typed with the text tool, anchored at its top-left. */
  text(at: Pt, text: string, ink: TextInk): void {
    this.strokes.push({
      id: this.stamp(),
      tool: "text",
      ...(ink.color ? { color: ink.color } : {}),
      size: ink.size,
      ...(ink.layer ? { layer: ink.layer } : {}),
      shape: {
        kind: "text",
        at,
        text,
        ...(ink.font && ink.font !== "sans" ? { font: ink.font } : {}),
        ...(ink.bold ? { bold: true } : {}),
        ...(ink.italic ? { italic: true } : {}),
      },
    });
  }

  /** A picture dropped on the page, placed between two corners. */
  image(from: Pt, to: Pt, src: string, layer?: string): void {
    this.strokes.push({
      id: this.stamp(),
      tool: "image",
      size: 1,
      ...(layer ? { layer } : {}),
      shape: { kind: "image", from, to, src },
    });
  }
}

// ---- Work: "Upload path, v2" -------------------------------------------------

/** The hook: a service sketched for a colleague — boxes, arrows, the labels
 *  typed, one thing circled in red and one highlighted. */
function uploadPath(): Drawing {
  const p = new Page("upload", new Hand(0x5eed01));
  const h = p.hand;
  const pen: Ink = { color: INK, size: 0.9 * MM };
  const blue: Ink = { color: BLUE, size: 1.1 * MM };
  const red: Ink = { color: RED, size: 1.3 * MM };
  const label: TextInk = { size: 13 * PT, color: INK };
  const small: TextInk = { size: 9 * PT, color: "#374151", font: "mono" };

  p.text({ x: 130, y: 110 }, "Upload path, v2", {
    size: 20 * PT,
    bold: true,
    color: INK,
  });
  p.text({ x: 134, y: 262 }, "draft — walk Sam through it", small);

  // The boxes.
  p.marks("pencil", h.box(150, 430, 520, 220), pen);
  p.text({ x: 222, y: 492 }, "app / web", label);

  p.marks("pencil", h.box(150, 990, 520, 220, { strokes: 2 }), pen);
  // Two more behind it, drawn as the edges that show: there are three.
  p.mark("pencil", h.line({ x: 176, y: 962 }, { x: 698, y: 960 }), pen);
  p.mark("pencil", h.line({ x: 698, y: 960 }, { x: 700, y: 1182 }), pen);
  p.text({ x: 250, y: 1052 }, "api ×3", label);

  p.marks("pencil", h.box(1060, 990, 580, 220), pen);
  p.text({ x: 1150, y: 1052 }, "blob store", label);

  p.marks("pencil", h.box(150, 1560, 520, 220, { strokes: 2 }), pen);
  for (const x of [500, 545, 590]) {
    p.mark("pencil", h.line({ x, y: 1580 }, { x: x + 2, y: 1762 }), pen);
  }
  p.text({ x: 200, y: 1622 }, "queue", label);

  p.marks("pencil", h.box(150, 2130, 520, 220), pen);
  p.text({ x: 212, y: 2192 }, "worker ×4", label);

  // The database, as everyone draws one.
  const dbTop = h.loop(1350, 2110, 240, 62, {
    turns: 1.04,
    tilt: 0.02,
    start: Math.PI,
  });
  p.mark("pencil", dbTop, pen);
  p.mark(
    "pencil",
    h.line({ x: 1110, y: 2112 }, { x: 1112, y: 2440 }, { bow: 0.004 }),
    pen,
  );
  p.mark(
    "pencil",
    h.line({ x: 1590, y: 2110 }, { x: 1588, y: 2440 }, { bow: -0.004 }),
    pen,
  );
  p.mark(
    "pencil",
    h.curve([
      { x: 1112, y: 2440 },
      { x: 1230, y: 2498 },
      { x: 1350, y: 2506 },
      { x: 1470, y: 2496 },
      { x: 1588, y: 2440 },
    ]),
    pen,
  );
  p.text({ x: 1302, y: 2250 }, "db", label);

  // The arrows.
  p.marks("marker", h.arrow({ x: 410, y: 668 }, { x: 412, y: 968 }), blue);
  p.text({ x: 450, y: 760 }, "POST /uploads", small);

  p.marks(
    "marker",
    h.arrow(
      { x: 690, y: 520 },
      { x: 1330, y: 968 },
      {
        via: [
          { x: 1000, y: 470 },
          { x: 1300, y: 640 },
        ],
      },
    ),
    blue,
  );
  p.text({ x: 930, y: 380 }, "PUT, signed URL", small);

  p.marks("marker", h.arrow({ x: 408, y: 1232 }, { x: 410, y: 1536 }), blue);
  p.text({ x: 450, y: 1340 }, "enqueue(upload_id)", small);

  p.marks("marker", h.arrow({ x: 410, y: 1800 }, { x: 408, y: 2108 }), blue);

  p.marks("marker", h.arrow({ x: 690, y: 2250 }, { x: 1086, y: 2256 }), blue);
  p.text({ x: 760, y: 2290 }, "upsert", small);

  // The point of the sketch: the retries, circled and written in.
  p.mark("marker", h.loop(410, 1672, 350, 190), red);
  p.marks(
    "marker",
    h.arrow(
      { x: 780, y: 1650 },
      { x: 1010, y: 1600 },
      { bow: -0.08, head: 34 },
    ),
    red,
  );
  p.marks(
    "marker",
    write(
      h,
      "RETRY ×3,\nTHEN DEAD-\nLETTER",
      { x: 1050, y: 1500 },
      { cap: 88 },
    ),
    { color: RED, size: 0.8 * MM },
  );

  // …and the one thing to remember, highlighted.
  p.mark(
    "highlighter",
    h.line(
      { x: 440, y: 1375 },
      { x: 1170, y: 1373 },
      { bow: 0.003, speed: 2600 },
    ),
    { color: YELLOW, size: 5 * MM, opacity: 0.45 },
  );

  return {
    id: "demo-upload-path",
    name: "Upload path, v2",
    width: 1800,
    height: 2800,
    strokes: p.strokes,
    favorite: true,
    folderId: "demo-diagrams",
  };
}

// ---- Work: "The 03:00 spike" -------------------------------------------------

/** A screenshot dropped on the page and marked up: the spike circled, the
 *  cause written beside it, and what to do about it underneath. */
function spike(): Drawing {
  const p = new Page("spike", new Hand(0x5eed02));
  const h = p.hand;
  const pen: Ink = { color: INK, size: 0.7 * MM };
  const red: Ink = { color: RED, size: 1.3 * MM };
  const redFine: Ink = { color: RED, size: 0.8 * MM };
  const green: Ink = { color: GREEN, size: 1.3 * MM };

  p.text({ x: 110, y: 110 }, "The 03:00 spike", {
    size: 20 * PT,
    bold: true,
    color: INK,
  });
  // The screenshot, 1600 × 900, at a hair over 1:1 across the page.
  const from = { x: 90, y: 330 };
  const k = 1620 / 1600;
  const at = (x: number, y: number): Pt => ({
    x: from.x + x * k,
    y: from.y + y * k,
  });
  p.image(from, at(1600, 900), latencyShot);

  // The spike, circled, and what it is.
  const peak = at(1026, 470);
  p.mark("marker", h.loop(peak.x, peak.y, 120, 300, { tilt: 0.06 }), red);
  p.marks(
    "marker",
    h.arrow(
      at(1080, 800),
      { x: 1000, y: 1400 },
      { via: [at(1120, 960), { x: 1080, y: 1300 }], head: 40 },
    ),
    red,
  );
  p.marks(
    "marker",
    write(
      h,
      "NIGHTLY BACKUP —\nSAME DISK AS THE WAL",
      { x: 150, y: 1410 },
      { cap: 72 },
    ),
    redFine,
  );
  // "max 884", underlined twice.
  p.mark("marker", h.line(at(728, 812), at(852, 810), { bow: 0.02 }), redFine);
  p.mark("marker", h.line(at(736, 830), at(846, 829), { bow: -0.02 }), redFine);

  // What to do about it.
  p.text({ x: 150, y: 1720 }, "Next", {
    size: 15 * PT,
    bold: true,
    color: INK,
  });
  const items = [
    "move the backup to the replica",
    "alert on p99 > 800 ms for 5 min",
    "ask Priya about disk IOPS",
  ];
  items.forEach((item, i) => {
    const y = 1880 + i * 135;
    p.marks("pencil", h.box(150, y, 76, 76, { corner: 6, speed: 900 }), pen);
    p.text({ x: 270, y: y - 2 }, item, { size: 12 * PT, color: INK });
  });
  // The first one is done.
  p.mark(
    "marker",
    h.curve(
      [
        { x: 158, y: 1910 },
        { x: 186, y: 1950 },
        { x: 204, y: 1960 },
        { x: 238, y: 1886 },
        { x: 262, y: 1850 },
      ],
      { speed: 1300 },
    ),
    green,
  );
  p.mark(
    "marker",
    h.line(
      { x: 262, y: 1916 },
      { x: 1300, y: 1912 },
      { bow: 0.004, speed: 2600 },
    ),
    { color: INK, size: 0.5 * MM },
  );

  // The fix, sketched: the backup moves off the primary.
  p.marks("pencil", h.box(180, 2320, 480, 190), pen);
  p.text({ x: 236, y: 2376 }, "primary", { size: 13 * PT, color: INK });
  p.marks("pencil", h.box(1000, 2320, 480, 190, { strokes: 2 }), pen);
  p.text({ x: 1062, y: 2376 }, "replica", { size: 13 * PT, color: INK });
  p.marks("marker", h.arrow({ x: 680, y: 2414 }, { x: 980, y: 2416 }), {
    color: BLUE,
    size: 1.1 * MM,
  });
  p.marks(
    "marker",
    write(h, "BACKUP FROM HERE", { x: 420, y: 2590 }, { cap: 58 }),
    { color: GREEN, size: 0.8 * MM },
  );
  p.marks(
    "marker",
    h.arrow(
      { x: 1230, y: 2620 },
      { x: 1250, y: 2530 },
      { bow: -0.15, head: 28 },
    ),
    { color: GREEN, size: 0.9 * MM },
  );

  return {
    id: "demo-spike",
    name: "The 03:00 spike",
    width: 1800,
    height: 2800,
    strokes: p.strokes,
    favorite: true,
    folderId: "demo-incidents",
  };
}

// ---- Work: "Sign-in with PKCE" ------------------------------------------------

/** A sequence diagram on three layers: the lifelines, the messages, and the
 *  notes in red over the top — what the Layers frame opens. */
function pkce(): Drawing {
  const p = new Page("pkce", new Hand(0x5eed03));
  const h = p.hand;
  const pen: Ink = { color: INK, size: 0.8 * MM };
  const dash: Ink = { color: "#6b7280", size: 0.5 * MM };
  const msg: Ink = { color: BLUE, size: 0.9 * MM, layer: "demo-messages" };
  const back: Ink = {
    color: "#6b7280",
    size: 0.7 * MM,
    layer: "demo-messages",
  };
  const tag: TextInk = {
    size: 8.5 * PT,
    font: "mono",
    color: "#1f2937",
    layer: "demo-messages",
  };

  p.text({ x: 110, y: 100 }, "Sign-in with PKCE", {
    size: 18 * PT,
    bold: true,
    color: INK,
  });

  const xs = [240, 680, 1120];
  const names = ["app", "sheet", "auth"];
  xs.forEach((x, i) => {
    p.marks("pencil", h.box(x - 170, 330, 340, 150, { corner: 10 }), pen);
    const name = names[i]!;
    p.text({ x: x - name.length * 21, y: 366 }, name, {
      size: 12 * PT,
      color: INK,
    });
    p.marks(
      "pencil",
      h.dashes({ x, y: 500 }, { x: x + h.j(6), y: 2660 }),
      dash,
    );
  });

  const send = (
    a: number,
    b: number,
    y: number,
    label: string,
    ret = false,
  ) => {
    const from = { x: xs[a]! + (b > a ? 12 : -12), y };
    const to = { x: xs[b]! + (b > a ? -12 : 12), y: y + h.j(6) };
    if (ret) {
      // A return, dashed, the way sequence diagrams say "the answer".
      const dir = b > a ? 1 : -1;
      p.marks(
        "marker",
        h.dashes(from, { x: to.x - dir * 30, y: to.y }, 30, 20),
        back,
      );
      p.marks(
        "marker",
        h.arrow({ x: to.x - dir * 60, y: to.y }, to, { head: 32 }),
        back,
      );
    } else {
      p.marks("marker", h.arrow(from, to, { head: 36 }), msg);
    }
    const left = Math.min(xs[a]!, xs[b]!) + 40;
    const lines = label.split("\n").length;
    p.text({ x: left, y: y - 40 - lines * 66 }, label, tag);
  };
  send(0, 1, 760, "open /authorize\n+ code_challenge");
  send(1, 2, 980, "consent");
  send(2, 1, 1180, "302 ?code=…", true);
  send(1, 0, 1400, "code", true);
  send(0, 2, 1700, "POST /token\n+ code_verifier");
  send(2, 0, 1960, "access + refresh", true);
  send(0, 2, 2280, "POST /token\nrefresh_token");
  send(2, 0, 2540, "new access", true);

  // The notes layer: the two lines that make it PKCE.
  const note: Ink = { color: RED, size: 0.8 * MM, layer: "demo-notes" };
  const circle: Ink = { ...note, size: 1.1 * MM };
  p.mark("marker", h.loop(545, 648, 340, 102, { turns: 1.08 }), circle);
  p.marks(
    "marker",
    write(h, "SHA-256 OF\nTHE VERIFIER", { x: 1230, y: 560 }, { cap: 58 }),
    note,
  );
  p.marks(
    "marker",
    h.arrow({ x: 1210, y: 630 }, { x: 900, y: 648 }, { bow: 0.05, head: 30 }),
    note,
  );
  p.mark("marker", h.loop(530, 1588, 330, 102, { turns: 1.08 }), circle);
  p.marks(
    "marker",
    write(
      h,
      "SENT ONCE,\nNEVER VIA\nTHE SHEET",
      { x: 1230, y: 1440 },
      { cap: 58 },
    ),
    note,
  );
  p.marks(
    "marker",
    h.arrow({ x: 1210, y: 1560 }, { x: 875, y: 1588 }, { bow: 0.05, head: 30 }),
    note,
  );
  p.mark(
    "highlighter",
    h.line(
      { x: 270, y: 1902 },
      { x: 790, y: 1900 },
      { bow: 0.003, speed: 2600 },
    ),
    { color: YELLOW, size: 5 * MM, opacity: 0.45, layer: "demo-notes" },
  );

  return {
    id: "demo-pkce",
    name: "Sign-in with PKCE",
    width: 1800,
    height: 2800,
    strokes: p.strokes,
    layers: [
      { id: "background", name: "", locked: true },
      { id: "base", name: "Lifelines" },
      { id: "demo-messages", name: "Messages" },
      { id: "demo-notes", name: "Notes" },
    ],
    activeLayerId: "demo-notes",
    folderId: "demo-diagrams",
  };
}

// ---- Work: "Deploy states" ----------------------------------------------------

/** A state machine drawn the whiteboard way: circles, curved arrows, every
 *  word lettered by hand. */
function deployStates(): Drawing {
  const p = new Page("deploy", new Hand(0x5eed04));
  const h = p.hand;
  const ring: Ink = { color: INK, size: 1.1 * MM };
  const edge: Ink = { color: BLUE, size: 1 * MM };
  const word: Ink = { color: INK, size: 0.7 * MM };
  const small: Ink = { color: "#4b5563", size: 0.5 * MM };

  p.marks(
    "marker",
    write(h, "DEPLOY STATES", { x: 130, y: 130 }, { cap: 110 }),
    { ...word, size: 0.9 * MM },
  );
  p.mark(
    "marker",
    h.line({ x: 120, y: 290 }, { x: 1020, y: 286 }, { bow: 0.01, speed: 2600 }),
    { color: BLUE, size: 0.9 * MM },
  );

  const node = (cx: number, cy: number, label: string) => {
    const cap = 62;
    const width = measure(label, cap);
    p.mark("marker", h.loop(cx, cy, Math.max(230, width / 2 + 70), 160), ring);
    p.marks(
      "marker",
      write(h, label, { x: cx - width / 2, y: cy - cap / 2 }, { cap }),
      word,
    );
  };
  node(450, 620, "QUEUED");
  node(1300, 1060, "BUILDING");
  node(450, 1500, "CANARY");
  node(1300, 1960, "LIVE");
  node(470, 2400, "ROLLED BACK");

  const say = (text: string, at: Pt) =>
    p.marks("marker", write(h, text, at, { cap: 46 }), small);
  p.marks(
    "marker",
    h.arrow(
      { x: 660, y: 700 },
      { x: 1080, y: 930 },
      {
        via: [
          { x: 900, y: 680 },
          { x: 1040, y: 800 },
        ],
      },
    ),
    edge,
  );
  say("PUSH", { x: 880, y: 620 });
  p.marks(
    "marker",
    h.arrow(
      { x: 1080, y: 1180 },
      { x: 680, y: 1420 },
      {
        via: [
          { x: 1000, y: 1330 },
          { x: 800, y: 1420 },
        ],
      },
    ),
    edge,
  );
  say("GREEN", { x: 940, y: 1380 });
  p.marks(
    "marker",
    h.arrow(
      { x: 680, y: 1580 },
      { x: 1080, y: 1880 },
      {
        via: [
          { x: 850, y: 1620 },
          { x: 1000, y: 1760 },
        ],
      },
    ),
    edge,
  );
  say("1H AT 5%", { x: 900, y: 1560 });
  p.marks(
    "marker",
    h.arrow(
      { x: 300, y: 1680 },
      { x: 330, y: 2210 },
      {
        via: [
          { x: 180, y: 1850 },
          { x: 200, y: 2060 },
        ],
      },
    ),
    { ...edge, color: RED },
  );
  say("ERRORS > 1%", { x: 400, y: 1900 });
  p.marks(
    "marker",
    h.arrow(
      { x: 1520, y: 1180 },
      { x: 1520, y: 1820 },
      {
        via: [
          { x: 1680, y: 1400 },
          { x: 1680, y: 1640 },
        ],
      },
    ),
    { ...edge, color: "#9ca3af" },
  );
  say("HOTFIX", { x: 1370, y: 1480 });

  p.marks(
    "marker",
    write(h, "RED = PAGES ON-CALL", { x: 1000, y: 2560 }, { cap: 44 }),
    { color: RED, size: 0.5 * MM },
  );

  return {
    id: "demo-deploy",
    name: "Deploy states",
    width: 1800,
    height: 2800,
    strokes: p.strokes,
    folderId: "demo-diagrams",
  };
}

// ---- Sketchbook: "Cold-pressed tests" ------------------------------------------

const PAPER = "#f5efe0";
const ULTRA = "#34479b";
const SIENNA = "#a4502a";
const GAMBOGE = "#e0a21c";

/** The canvas preset the sketchbook's pages are made on: A5-ish, on
 *  cold-pressed, with a toolbar of the simulated media — which is what the
 *  media frame shows in the toolbar. */
export const SKETCHBOOK_PRESET = {
  id: "demo-sketchbook",
  name: "Sketchbook, cold-pressed",
  size: { width: 2400, height: 3700 },
  ground: { stock: "cold" },
  kit: {
    tools: [
      "graphite",
      "watercolor",
      "paintbrush",
      "chalk",
      "crayon",
      "calligraphy",
    ],
    order: [
      "graphite",
      "watercolor",
      "paintbrush",
      "chalk",
      "crayon",
      "calligraphy",
      "pencil",
    ],
  },
};

/** The media study: a sheet of cold-pressed paper with the simulated media
 *  tried out on it — washes, a graphite scale, a shaded sphere, chalk, crayon
 *  and a broad nib — each labelled in pencil. */
function coldPressed(): Drawing {
  const p = new Page("cold", new Hand(0x5eed05));
  const h = p.hand;
  const lead = (grade: number, size = 0.5 * MM, pressure?: number): Ink => ({
    color: graphiteInk(PAPER, grade),
    size,
    dials: { grade, ...(pressure !== undefined ? { pressure } : {}) },
  });
  const label = (text: string, at: Pt, cap = 54) =>
    p.marks(
      "graphite",
      write(h, text, at, { cap, speed: 900 }),
      lead(1, 0.5 * MM),
    );

  label("COLD-PRESSED, 300 G — TESTS", { x: 150, y: 120 }, 84);

  // Watercolour: a graded wash, wet-in-wet, a glaze.
  const band = (x0: number, x1: number, y: number, ink: Ink) =>
    p.mark(
      "watercolor",
      h.curve(
        [
          { x: x0, y: y + h.j(8) },
          { x: (x0 * 2 + x1) / 3, y: y + h.j(14) },
          { x: (x0 + x1 * 2) / 3, y: y + h.j(14) },
          { x: x1, y: y + h.j(8) },
        ],
        { speed: 900, wander: 3 },
      ),
      ink,
    );
  [1.4, 1, 0.65, 0.38].forEach((pigment, i) =>
    band(220, 760, 420 + i * 140, {
      color: ULTRA,
      size: 12 * MM,
      dials: { pigment },
    }),
  );
  label("GRADED", { x: 220, y: 1000 });

  const wet = { water: 1.7, pigment: 0.55, granulation: 0.9 };
  band(960, 1330, 520, { color: ULTRA, size: 19 * MM, dials: wet });
  band(980, 1300, 760, { color: ULTRA, size: 19 * MM, dials: wet });
  band(1270, 1600, 640, { color: SIENNA, size: 19 * MM, dials: wet });
  label("WET IN WET", { x: 980, y: 1000 });

  p.mark(
    "watercolor",
    h.curve(
      [
        { x: 1900, y: 400 },
        { x: 1890, y: 640 },
        { x: 1905, y: 880 },
      ],
      { speed: 800, wander: 3 },
    ),
    { color: GAMBOGE, size: 19 * MM, dials: { pigment: 1.2 } },
  );
  band(1740, 2230, 640, {
    color: ULTRA,
    size: 12 * MM,
    dials: { water: 1.1, pigment: 0.5, granulation: 0.35 },
  });
  label("GLAZE", { x: 1800, y: 1000 });

  // Graphite: a value scale, hard to soft.
  const grades: [number, string][] = [
    [0.7, "2H"],
    [1, "HB"],
    [1.25, "2B"],
    [1.5, "4B"],
    [1.68, "6B"],
    [1.8, "8B"],
  ];
  grades.forEach(([grade, name], i) => {
    const x = 180 + i * 355;
    p.mark(
      "graphite",
      h.zigzag(x, 1210, 280, 280, 13, -0.95, 3000),
      lead(grade, 1.8 * MM, 1.1),
    );
    label(name, { x: x + 100, y: 1530 }, 50);
  });

  // A sphere lit from the top left, shaded where its surface turns away
  // from the light (the terminator is an ellipse, not a line), and the
  // shadow it casts.
  const c = { x: 620, y: 2120 };
  const r = 330;
  const light = { x: -0.42, y: -0.5, z: 0.76 };
  const facing = (q: Pt) => {
    const x = (q.x - c.x) / r;
    const y = (q.y - c.y) / r;
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    return x * light.x + y * light.y + z * light.z;
  };
  const inBall = (q: Pt) => Math.hypot(q.x - c.x, q.y - c.y) < r * 0.97;
  p.mark(
    "graphite",
    h.loop(c.x, c.y, r, r, { turns: 1.03, speed: 1600, wander: 2 }),
    lead(1.12, 0.7 * MM),
  );
  // Half-tone, then the core shadow as a band past the terminator — with the
  // reflected light at the rim left lighter — the way a sphere is shaded.
  const tone = (
    upTo: number,
    from: number,
    grade: number,
    press: number,
    angle: number,
    spacing: number,
  ) =>
    p.mark(
      "graphite",
      h.zigzag(c.x - r, c.y - r, r * 2, r * 2, spacing, angle, 3200, (q) => {
        const f = facing(q);
        return inBall(q) && f < upTo && f > from;
      }),
      lead(grade, 1.8 * MM, press),
    );
  // Hatched across the terminator, so each pass ends on the curve.
  tone(0.72, -2, 0.8, 0.6, 0.85, 17);
  tone(0.42, -2, 1, 0.8, 0.7, 15);
  tone(0.18, -0.3, 1.5, 1.05, 0.95, 13);
  p.mark(
    "graphite",
    h.zigzag(c.x - 40, c.y + r - 60, 640, 160, 12, -0.25, 3200, (q) => {
      const dx = (q.x - (c.x + 250)) / 330;
      const dy = (q.y - (c.y + r + 20)) / 62;
      return dx * dx + dy * dy < 1 && Math.hypot(q.x - c.x, q.y - c.y) > r;
    }),
    lead(1.25, 1.8 * MM, 0.85),
  );
  p.mark(
    "graphite",
    h.line(
      { x: 150, y: c.y + r + 70 },
      { x: 1150, y: c.y + r + 64 },
      { bow: 0.002 },
    ),
    lead(0.7, 0.7 * MM, 0.6),
  );

  // Chalk and crayon.
  const chalk: Ink = { color: "#c2553d", size: 9.5 * MM };
  p.mark(
    "chalk",
    h.curve(
      [
        { x: 1400, y: 1820 },
        { x: 1650, y: 1760 },
        { x: 1900, y: 1850 },
        { x: 2200, y: 1790 },
      ],
      { speed: 1200 },
    ),
    chalk,
  );
  p.mark(
    "chalk",
    h.curve(
      [
        { x: 1400, y: 1980 },
        { x: 1700, y: 2040 },
        { x: 2000, y: 1960 },
        { x: 2220, y: 2020 },
      ],
      { speed: 1200 },
    ),
    { ...chalk, dials: { pressure: 1.45 } },
  );
  label("CHALK", { x: 1420, y: 2110 });
  p.mark("crayon", h.zigzag(1400, 2260, 800, 260, 60, -1.2, 2200), {
    color: "#2f7d4f",
    size: 8 * MM,
  });
  label("CRAYON", { x: 1420, y: 2620 });

  // A broad nib, warming up, then a word.
  const nib: Ink = { color: "#1f2a44", size: 2.5 * MM };
  const zig: Pt[] = [];
  for (let i = 0; i <= 8; i++)
    zig.push({ x: 190 + i * 100, y: i % 2 ? 2880 : 3050 });
  p.mark("calligraphy", h.trace(zig, { speed: 900, wander: 2 }), nib);
  for (let i = 0; i < 5; i++) {
    p.mark(
      "calligraphy",
      h.loop(1270 + i * 170, 2965, 50, 92, {
        turns: 1.02,
        speed: 700,
        tilt: 0.25,
      }),
      nib,
    );
  }
  p.marks(
    "calligraphy",
    write(
      h,
      "PAPER",
      { x: 190, y: 3200 },
      { cap: 240, slant: 0.18, speed: 700 },
    ),
    nib,
  );
  label("ITALIC NIB, 2.5 MM", { x: 1300, y: 3330 });

  return {
    id: "demo-cold",
    name: "Cold-pressed tests",
    width: 2400,
    height: 3700,
    background: PAPER,
    ground: { stock: "cold" },
    canvasPreset: SKETCHBOOK_PRESET.id,
    strokes: p.strokes,
    favorite: true,
    folderId: "demo-studies",
  };
}

// ---- Work: "Retry backoff" and "Desk cable tray" -------------------------------

/** A graph sketched to settle an argument: exponential backoff, capped, with
 *  the jitter band around it. */
function retryBackoff(): Drawing {
  const p = new Page("backoff", new Hand(0x5eed06));
  const h = p.hand;
  const pen: Ink = { color: INK, size: 0.7 * MM };
  const blue: Ink = { color: BLUE, size: 1 * MM };
  const small: Ink = { color: "#4b5563", size: 0.5 * MM };

  p.text({ x: 120, y: 110 }, "Retry backoff", {
    size: 20 * PT,
    bold: true,
    color: INK,
  });
  p.text({ x: 124, y: 262 }, "base 1 s, ×2, cap 30 s, full jitter", {
    size: 9 * PT,
    font: "mono",
    color: "#374151",
  });
  // Axes, each an arrow.
  const o = { x: 220, y: 1500 };
  p.marks(
    "pencil",
    h.arrow({ x: o.x, y: o.y + 20 }, { x: o.x + 2, y: 500 }, { head: 34 }),
    pen,
  );
  p.marks(
    "pencil",
    h.arrow({ x: o.x - 20, y: o.y }, { x: 1640, y: o.y - 4 }, { head: 34 }),
    pen,
  );
  p.marks("marker", write(h, "WAIT", { x: 270, y: 480 }, { cap: 46 }), small);
  p.marks(
    "marker",
    write(h, "ATTEMPT", { x: 1400, y: 1560 }, { cap: 46 }),
    small,
  );
  // The curve: 1, 2, 4, 8, 16, then the cap.
  const waits = [1, 2, 4, 8, 16, 30, 30];
  const at = (i: number, w: number): Pt => ({
    x: o.x + 180 + i * 190,
    y: o.y - w * 34,
  });
  const curve = waits.map((w, i) => at(i, w));
  // Doubling, then flat at the cap: two strokes, the way it is drawn.
  p.mark("marker", h.curve(curve.slice(0, 6), { speed: 1400 }), blue);
  p.mark("marker", h.line(curve[5]!, curve[6]!, { bow: 0.01 }), blue);
  waits.forEach((w, i) => {
    const q = at(i, w);
    p.mark(
      "marker",
      h.loop(q.x, q.y, 14, 14, { turns: 1.3, speed: 500 }),
      blue,
    );
    p.marks(
      "marker",
      write(h, `${w}S`, { x: q.x - 40, y: q.y - 90 }, { cap: 40 }),
      small,
    );
  });
  p.marks(
    "marker",
    write(h, "SLEEP = RAND(0, WAIT)", { x: 520, y: 1700 }, { cap: 54 }),
    { color: RED, size: 0.8 * MM },
  );
  p.marks(
    "marker",
    h.arrow({ x: 1000, y: 1680 }, { x: 1050, y: 1380 }, { bow: 0.1, head: 30 }),
    { color: RED, size: 0.8 * MM },
  );

  return {
    id: "demo-backoff",
    name: "Retry backoff",
    width: 1800,
    height: 2800,
    strokes: p.strokes,
    folderId: "demo-diagrams",
  };
}

/** The other thing people sketch: a thing to build, with its measurements. */
function cableTray(): Drawing {
  const p = new Page("tray", new Hand(0x5eed07));
  const h = p.hand;
  const pen: Ink = { color: INK, size: 0.7 * MM };
  const dim: Ink = { color: "#4b5563", size: 0.45 * MM };
  const word: Ink = { color: INK, size: 0.6 * MM };

  p.marks(
    "marker",
    write(h, "DESK CABLE TRAY", { x: 130, y: 130 }, { cap: 90 }),
    word,
  );
  // The desk from above, the tray under its back edge.
  p.marks("pencil", h.box(160, 420, 1480, 700, { corner: 12 }), pen);
  p.marks("pencil", h.box(300, 460, 1200, 150, { corner: 6, strokes: 2 }), pen);
  for (const x of [420, 800, 1180]) {
    p.mark("pencil", h.loop(x, 535, 18, 18, { turns: 1.2, speed: 500 }), pen);
  }
  // Dimensions.
  p.marks(
    "pencil",
    h.arrow({ x: 900, y: 1200 }, { x: 170, y: 1202 }, { head: 26 }),
    dim,
  );
  p.marks(
    "pencil",
    h.arrow({ x: 900, y: 1200 }, { x: 1630, y: 1198 }, { head: 26 }),
    dim,
  );
  p.marks("marker", write(h, "160 CM", { x: 820, y: 1240 }, { cap: 50 }), word);
  p.marks(
    "pencil",
    h.arrow({ x: 1560, y: 535 }, { x: 1560, y: 465 }, { head: 20 }),
    dim,
  );
  p.marks(
    "pencil",
    h.arrow({ x: 1560, y: 535 }, { x: 1560, y: 605 }, { head: 20 }),
    dim,
  );
  p.marks("marker", write(h, "12", { x: 1612, y: 510 }, { cap: 44 }), word);
  p.marks(
    "marker",
    write(h, "M4 × 12, EVERY 38 CM", { x: 300, y: 700 }, { cap: 48 }),
    { ...word, color: BLUE },
  );
  p.marks(
    "marker",
    h.arrow({ x: 560, y: 690 }, { x: 440, y: 570 }, { bow: 0.1, head: 24 }),
    { ...dim, color: BLUE },
  );
  // The side view: the bracket.
  p.mark(
    "pencil",
    h.curve(
      [
        { x: 400, y: 1600 },
        { x: 400, y: 1900 },
        { x: 420, y: 1960 },
        { x: 700, y: 1960 },
        { x: 720, y: 1900 },
        { x: 720, y: 1760 },
      ],
      { speed: 1300 },
    ),
    pen,
  );
  p.mark("pencil", h.line({ x: 300, y: 1600 }, { x: 900, y: 1596 }), {
    ...pen,
    size: 1.2 * MM,
  });
  p.marks("marker", write(h, "SIDE", { x: 960, y: 1570 }, { cap: 48 }), word);
  p.marks(
    "marker",
    write(h, "POWER BRICK\nSITS HERE", { x: 800, y: 1800 }, { cap: 48 }),
    { ...word, color: RED },
  );
  p.marks(
    "marker",
    h.arrow({ x: 790, y: 1850 }, { x: 640, y: 1900 }, { bow: -0.1, head: 24 }),
    { ...dim, color: RED },
  );

  return {
    id: "demo-tray",
    name: "Desk cable tray",
    width: 1800,
    height: 2800,
    strokes: p.strokes,
  };
}

// ---- the shelf ---------------------------------------------------------------

type Built = {
  /** `localStorage` keys and values, exactly as the app writes them. */
  storage: Record<string, string>;
  /** Fields merged over the device's settings blob. */
  settings: Record<string, unknown>;
};

function stampTimes(drawings: Drawing[], now: number): Drawing[] {
  // Most recent first, as the menu sorts them: an hour apart, back from now.
  return drawings.map((d, i) => {
    const at = new Date(now - (i + 1) * 3_600_000 * (1 + i)).toISOString();
    return { ...d, createdAt: at, updatedAt: at };
  });
}

function doc(folders: Folder[], drawings: Drawing[], active: string): string {
  const data: AppData = { folders, drawings, activeDrawingId: active };
  return JSON.stringify({ version: DOC_VERSION, ...data });
}

/** Everything the demo puts in the in-memory store, placed from `now`. */
export function buildDemo(now: number = Date.now()): Built {
  const day = 86_400_000;
  const made = (days: number) => new Date(now - days * day).toISOString();
  const work = stampTimes(
    [
      uploadPath(),
      spike(),
      pkce(),
      deployStates(),
      retryBackoff(),
      cableTray(),
    ],
    now,
  );
  const workFolders: Folder[] = [
    { id: "demo-diagrams", name: "Diagrams", createdAt: made(60) },
    { id: "demo-incidents", name: "Incidents", createdAt: made(30) },
  ];
  const sketchbook = stampTimes([coldPressed()], now);
  const sketchFolders: Folder[] = [
    { id: "demo-studies", name: "Studies", createdAt: made(90) },
  ];
  const namespaces = [
    { slug: "default", name: "Work" },
    { slug: "sketchbook", name: "Sketchbook" },
  ];
  return {
    storage: {
      "paint:namespaces": JSON.stringify(namespaces),
      "paint:namespace:active": "default",
      "paint:doc": doc(workFolders, work, work[0]!.id),
      "paint:doc:sketchbook": doc(sketchFolders, sketchbook, sketchbook[0]!.id),
    },
    settings: {
      canvasPresets: [SKETCHBOOK_PRESET],
      customColors: [],
      toolPresets: {},
    },
  };
}
