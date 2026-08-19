// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Numbers instead of squinting, for the chalk: the alpha the engine writes
// under controlled conditions, measured off the pixels it actually put
// through `putImageData` (the probe lesson), and what a mark costs. Every
// retune should re-run this.
//
//   npx vite-node .agent/skills/tool-simulation/scripts/chalk-probe.ts

import { groundProfile } from "../../../../src/app/ground.ts";
import type { Point } from "../../../../src/app/types.ts";

// --- The shim: a page of alphas, written by the engine's own blit -----------

const W = 1000;
const H = 340;
const page = new Float32Array(W * H);

type FakeImage = { data: Uint8ClampedArray; width: number; height: number };

function fakeCanvas() {
  const canvas: {
    width: number;
    height: number;
    _image: FakeImage | null;
    getContext: (kind: string) => unknown;
  } = { width: 1, height: 1, _image: null, getContext: () => ctx };
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
      for (let y = 0; y < outH; y++) {
        const py = Math.round(dy) + y;
        if (py < 0 || py >= H) continue;
        const sy = Math.min(sh - 1, Math.floor((y * sh) / outH));
        for (let x = 0; x < outW; x++) {
          const px = Math.round(dx) + x;
          if (px < 0 || px >= W) continue;
          const sx = Math.min(sw - 1, Math.floor((x * sw) / outW));
          const a = image.data[(sy * image.width + sx) * 4 + 3]! / 255;
          if (a <= 0) continue;
          const out = py * W + px;
          page[out] = page[out]! + a * (1 - page[out]!);
        }
      }
    },
  };
  return canvas;
}

(globalThis as { document?: unknown }).document = {
  createElement: () => fakeCanvas(),
};

const { paintSimulatedChalk } =
  await import("../../../../src/app/plugins/chalkSim.ts");

const ctx = fakeCanvas().getContext("2d") as CanvasRenderingContext2D;
const slate = groundProfile({ stock: "cold" });

function clear(): void {
  page.fill(0);
}

function run(length: number, gap: number, from = 60, y = 170): Point[] {
  const points: Point[] = [];
  for (let x = from; x <= from + length; x += gap) points.push({ x, y });
  return points;
}

/** Mean alpha and coverage over a window, read the lead's way: mean over the
 *  cells that hold anything, coverage as the share over a floor. The two move
 *  independently and the difference is the medium. */
function meanAndCover(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { mean: number; cover: number } {
  let sum = 0;
  let n = 0;
  let over = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const a = page[y * W + x]!;
      sum += a;
      n++;
      if (a > 0.08) over++;
    }
  }
  return { mean: n ? sum / n : 0, cover: n ? over / n : 0 };
}

// --- Pressure: coverage moves far more than brightness ----------------------
for (const press of [0.55, 1, 1.45]) {
  clear();
  paintSimulatedChalk(
    ctx,
    run(800, 5),
    100,
    1,
    press,
    slate,
    "#fff",
    undefined,
  );
  const core = meanAndCover(100, 800, 140, 200);
  console.log(
    `press ${press}: core mean ${core.mean.toFixed(3)} cover ${core.cover.toFixed(3)}`,
  );
}

// --- The dust halo: sparse specks past the face's edge ----------------------
{
  clear();
  paintSimulatedChalk(ctx, run(800, 5), 100, 1, 1, slate, "#fff", undefined);
  const halo = meanAndCover(100, 800, 106, 116); // 54–64px off axis; face is 50, dust reaches 65
  console.log(
    `halo band: mean ${halo.mean.toFixed(3)} cover ${halo.cover.toFixed(3)} (want sparse: cover ~0.01–0.06)`,
  );
}

// --- Crossings brighten -----------------------------------------------------
{
  clear();
  paintSimulatedChalk(ctx, run(300, 5), 100, 1, 1, slate, "#fff", undefined);
  const once = meanAndCover(150, 250, 140, 200).mean;
  paintSimulatedChalk(
    ctx,
    run(300, 5, 60, 171),
    100,
    1,
    1,
    slate,
    "#fff",
    undefined,
  );
  const twice = meanAndCover(150, 250, 140, 200).mean;
  console.log(
    `one pass ${once.toFixed(3)}, crossed ${twice.toFixed(3)} (want brighter, not doubled)`,
  );
}

// --- The same gesture six times: six sticks, not one ------------------------
{
  const seen: number[] = [];
  for (let i = 0; i < 6; i++) {
    clear();
    const y = 170;
    const pts: Point[] = [];
    // Shift the start so the mark seed changes, as six real strokes would.
    for (let x = 60 + i * 7; x <= 460 + i * 7; x += 5) pts.push({ x, y });
    paintSimulatedChalk(ctx, pts, 100, 1, 1, slate, "#fff", undefined);
    seen.push(meanAndCover(150 + i * 7, 400 + i * 7, 140, 200).mean);
  }
  const lo = Math.min(...seen);
  const hi = Math.max(...seen);
  console.log(
    `six strokes, core means ${lo.toFixed(3)}–${hi.toFixed(3)} (a seeded engine scatters a little)`,
  );
}

// --- Speed says little ------------------------------------------------------
{
  clear();
  const pts = [...run(300, 2), ...run(300, 16, 370), ...run(290, 2, 680)];
  paintSimulatedChalk(ctx, pts, 100, 1, 1, slate, "#fff", undefined);
  const slow = meanAndCover(100, 300, 140, 200).mean;
  const fast = meanAndCover(420, 620, 140, 200).mean;
  console.log(
    `slow ${slow.toFixed(3)} vs fast ${fast.toFixed(3)} (abrasive: want fast ≳ 0.8× slow)`,
  );
}

// --- Streaks on a broad drag: lanes, measured on a smoothed field -----------
{
  clear();
  paintSimulatedChalk(ctx, run(800, 6), 200, 1, 1, slate, "#fff", undefined);
  // Across-profile of the band, averaged along the mark, then contrast.
  const rows: number[] = [];
  for (let y = 95; y < 245; y++) {
    let sum = 0;
    for (let x = 200; x < 700; x++) sum += page[y * W + x]!;
    rows.push(sum / 500);
  }
  const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
  const sd = Math.sqrt(
    rows.reduce((a, b) => a + (b - mean) ** 2, 0) / rows.length,
  );
  console.log(
    `broad drag lanes: profile mean ${mean.toFixed(3)} sd ${sd.toFixed(3)} (sd/mean ~0.08–0.2 reads as streaks)`,
  );
}

// --- Cost --------------------------------------------------------------------
function time(label: string, iters: number, work: () => void): void {
  const times: number[] = [];
  for (let i = 0; i < iters + 3; i++) {
    const t0 = performance.now();
    work();
    times.push(performance.now() - t0);
  }
  // JIT warm-up lies (the memoise-the-press lesson): read the steady tail.
  const tail = times.slice(3);
  tail.sort((a, b) => a - b);
  console.log(label, tail[Math.floor(tail.length / 2)]!.toFixed(2), "ms");
}

time("letter stroke (300px, 100px stick):", 20, () => {
  clear();
  paintSimulatedChalk(
    ctx,
    run(300, 5),
    100,
    1,
    1,
    slate,
    "#fff",
    undefined,
    true,
  );
});
time("board sweep (800px, 200px side):", 10, () => {
  clear();
  paintSimulatedChalk(
    ctx,
    run(800, 6),
    200,
    1,
    1,
    slate,
    "#fff",
    undefined,
    true,
  );
});
