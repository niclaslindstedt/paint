// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The chalk's exercise sheet: every behaviour the board engine claims, drawn
// end-to-end through the public painter (`paintSimulatedChalk`) with no DOM —
// judge it against the reference photographs, crop with `zoom.ts`, retune.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/chalk-sheet.ts
//
// The rows are the claims: pressure moves coverage, ends are blunt, a second
// pass bolds, crossings brighten, broad drags streak, dust halos the mark,
// speed says little — and the same gesture six times over is six sticks, not
// one stick six times (the per-mark seeding every medium owes).
//
// The document shim is the probe lesson made code: capture `putImageData` and
// `drawImage`, composite the written pixels onto a dark board, and what the
// sheet shows is what the app would show — budgets, store, fallback included.

import { groundProfile, SOLID_GROUND } from "../../../../src/app/ground.ts";
import type { GroundProfile } from "../../../../src/app/ground.ts";
import type { Point } from "../../../../src/app/types.ts";
import { writePng } from "./pngio.ts";

// --- A board to draw on, and the shim that catches the engine's pixels ------

const W = 1100;
const H = 2000;
const BOARD: [number, number, number] = [0x2c, 0x31, 0x33];
const CHALK = "#f5f2ea";

const page = new Float32Array(W * H * 3);
for (let at = 0; at < W * H; at++) {
  page[at * 3] = BOARD[0];
  page[at * 3 + 1] = BOARD[1];
  page[at * 3 + 2] = BOARD[2];
}

type FakeImage = { data: Uint8ClampedArray; width: number; height: number };

function fakeCanvas() {
  const canvas: {
    width: number;
    height: number;
    _image: FakeImage | null;
    getContext: (kind: string) => unknown;
  } = {
    width: 1,
    height: 1,
    _image: null,
    getContext: () => ctx,
  };
  const ctx = {
    canvas,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
    globalAlpha: 1,
    save() {},
    restore() {},
    createImageData(w: number, h: number): FakeImage {
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    },
    putImageData(image: FakeImage): void {
      canvas._image = image;
    },
    // The page-side blit: composite the field's pixels onto the board.
    // Bilinear over the destination rect — the app blits its field with
    // `imageSmoothingQuality: "high"`, and judging a coarsened mark through a
    // nearest-neighbour blit shows a mosaic of squares the app never draws.
    drawImage(
      source: { _image: FakeImage | null },
      _sx: number,
      _sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw?: number,
      dh?: number,
    ): void {
      const image = source._image;
      if (!image) return;
      const outW = Math.round(dw ?? sw);
      const outH = Math.round(dh ?? sh);
      const read = (sx: number, sy: number, c: number): number => {
        const cx = Math.max(0, Math.min(sw - 1, sx));
        const cy = Math.max(0, Math.min(sh - 1, sy));
        return image.data[(cy * image.width + cx) * 4 + c]!;
      };
      for (let y = 0; y < outH; y++) {
        const py = Math.round(dy) + y;
        if (py < 0 || py >= H) continue;
        const v = ((y + 0.5) * sh) / outH - 0.5;
        const y0 = Math.floor(v);
        const fy = v - y0;
        for (let x = 0; x < outW; x++) {
          const px = Math.round(dx) + x;
          if (px < 0 || px >= W) continue;
          const u = ((x + 0.5) * sw) / outW - 0.5;
          const x0 = Math.floor(u);
          const fx = u - x0;
          const mix = (c: number): number =>
            read(x0, y0, c) * (1 - fx) * (1 - fy) +
            read(x0 + 1, y0, c) * fx * (1 - fy) +
            read(x0, y0 + 1, c) * (1 - fx) * fy +
            read(x0 + 1, y0 + 1, c) * fx * fy;
          const a = mix(3) / 255;
          if (a <= 0) continue;
          const out = (py * W + px) * 3;
          page[out] = page[out]! * (1 - a) + mix(0) * a;
          page[out + 1] = page[out + 1]! * (1 - a) + mix(1) * a;
          page[out + 2] = page[out + 2]! * (1 - a) + mix(2) * a;
        }
      }
    },
  };
  return canvas;
}

(globalThis as { document?: unknown }).document = {
  createElement: () => fakeCanvas(),
};

// Imported AFTER the shim so `createSurface` finds a document.
const { paintSimulatedChalk } =
  await import("../../../../src/app/plugins/chalkSim.ts");

const pageCtx = fakeCanvas().getContext("2d") as CanvasRenderingContext2D;

/** A path from a parametric position+speed function, stored at the spacing
 *  the speed asks for — the same encoding the app's canvas uses. */
function pathOf(
  fn: (t: number) => { x: number; y: number; speed: number },
  n = 600,
): Point[] {
  const pts: Point[] = [];
  let { x, y } = fn(0);
  pts.push({ x, y });
  for (let i = 1; i <= n; i++) {
    const p = fn(i / n);
    if (Math.hypot(p.x - x, p.y - y) >= Math.max(1.5, p.speed)) {
      pts.push({ x: p.x, y: p.y });
      x = p.x;
      y = p.y;
    }
  }
  return pts;
}

type Mark = {
  points: Point[];
  size?: number;
  press?: number;
  ground?: GroundProfile;
  claim?: string;
};

const slate = groundProfile({ stock: "cold" });
const rough = groundProfile({ stock: "rough" });

const marks: Mark[] = [
  {
    claim: "pressure: light is a chain of specks, heavy nearly covers",
    press: 0.55,
    points: pathOf((t) => ({ x: 80 + 940 * t, y: 100, speed: 5 })),
  },
  {
    press: 1,
    points: pathOf((t) => ({ x: 80 + 940 * t, y: 220, speed: 5 })),
  },
  {
    press: 1.45,
    points: pathOf((t) => ({ x: 80 + 940 * t, y: 340, speed: 5 })),
  },
  {
    claim: "the reference S: blunt ends, ragged edge, sparkle in the core",
    points: pathOf(
      (t) => ({
        x: 250 + 100 * Math.sin(2 * Math.PI * t),
        y: 480 + 240 * t,
        speed: 4 + 4 * Math.sin(Math.PI * t),
      }),
      800,
    ),
  },
  ...Array.from({ length: 6 }, (_, i) => ({
    ...(i === 0
      ? { claim: "the same gesture six times over is six sticks, not one" }
      : {}),
    points: pathOf((t) => ({
      x: 480 + i * 105,
      y: 470 + 250 * t,
      speed: 5,
    })),
  })),
  {
    claim: "crossings brighten where they add",
    points: pathOf((t) => ({ x: 100 + 320 * t, y: 830 + 160 * t, speed: 5 })),
  },
  {
    points: pathOf((t) => ({ x: 420 - 320 * t, y: 850 + 120 * t, speed: 5 })),
  },
  {
    claim: "a second pass bolds: one pass above the same path twice",
    points: pathOf((t) => ({
      x: 520 + 480 * t,
      y: 840 + 25 * Math.sin(6 * t),
      speed: 5,
    })),
  },
  {
    points: [
      ...pathOf((t) => ({
        x: 520 + 480 * t,
        y: 970 + 25 * Math.sin(6 * t),
        speed: 5,
      })),
      ...pathOf((t) => ({
        x: 1000 - 480 * t,
        y: 970 + 25 * Math.sin(6 * (1 - t)),
        speed: 5,
      })),
    ],
  },
  {
    claim: "a broad side drag streaks along itself",
    size: 180,
    points: pathOf((t) => ({
      x: 120 + 860 * t,
      y: 1180 + 30 * Math.sin(Math.PI * t),
      speed: 6,
    })),
  },
  {
    claim: "taps: a patch of grain, not a disc",
    points: [{ x: 160, y: 1420 }],
  },
  { points: [{ x: 340, y: 1420 }] },
  { size: 180, points: [{ x: 620, y: 1430 }] },
  {
    claim: "speed says little: crawl / flick / crawl along one band",
    points: [
      ...pathOf((t) => ({ x: 80 + 300 * t, y: 1600, speed: 2 }), 400),
      ...pathOf((t) => ({ x: 380 + 320 * t, y: 1600, speed: 18 }), 400),
      ...pathOf((t) => ({ x: 700 + 300 * t, y: 1600, speed: 2 }), 400),
    ],
  },
  {
    claim: "papers: solid page / cold-press / rough",
    ground: SOLID_GROUND,
    points: pathOf((t) => ({
      x: 80 + 940 * t,
      y: 1730 + 20 * Math.sin(2 * Math.PI * t),
      speed: 4,
    })),
  },
  {
    ground: slate,
    points: pathOf((t) => ({
      x: 80 + 940 * t,
      y: 1840 + 20 * Math.sin(2 * Math.PI * t),
      speed: 4,
    })),
  },
  {
    ground: rough,
    points: pathOf((t) => ({
      x: 80 + 940 * t,
      y: 1950 + 20 * Math.sin(2 * Math.PI * t),
      speed: 4,
    })),
  },
];

for (const mark of marks) {
  if (mark.claim) console.log("row:", mark.claim);
  const ran = paintSimulatedChalk(
    pageCtx,
    mark.points,
    mark.size ?? 90,
    1,
    mark.press ?? 1,
    mark.ground ?? slate,
    CHALK,
  );
  if (!ran) console.log("  !! fell through to the plain painter");
}

const rgb = new Uint8Array(W * H * 3);
for (let at = 0; at < rgb.length; at++) {
  rgb[at] = Math.max(0, Math.min(255, Math.round(page[at]!)));
}
const out = "chalk-sheet.png";
writePng(rgb, W, H, out);
console.log(`wrote ${out}`);
