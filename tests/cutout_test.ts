// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Delete background cut (`cutout.ts`), driven the way the effect drives
// it: an RGBA buffer and a rough tracing in, a border and an alpha mask out.
// Pure and node-run, like every pixel algorithm here — the scenes are built by
// hand, so "the found border is the subject's edge" is a distance to a circle
// rather than a look at a screen.

import { describe, expect, it } from "vitest";

import { cutout, resampleClosed } from "../src/app/cutout.ts";
import type { Point } from "../src/app/types.ts";

/** An RGBA buffer painted by a function of position. */
function scene(
  width: number,
  height: number,
  paint: (x: number, y: number) => readonly [number, number, number],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const base = (y * width + x) * 4;
      rgba[base] = r;
      rgba[base + 1] = g;
      rgba[base + 2] = b;
      rgba[base + 3] = 255;
    }
  }
  return rgba;
}

/** A dark disc on a light ground — a subject with one clean border. */
function disc(cx: number, cy: number, radius: number) {
  return scene(120, 120, (x, y) =>
    Math.hypot(x - cx, y - cy) <= radius
      ? ([40, 60, 50] as const)
      : ([230, 225, 210] as const),
  );
}

/** A rough tracing around (cx, cy): a ring of points whose radius wobbles —
 *  the kind of loop a finger draws, never the true border. */
function wobble(cx: number, cy: number, radius: number, by: number): Point[] {
  const loop: Point[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const r = radius + (i % 2 === 0 ? by : -by);
    loop.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return loop;
}

/** Mean distance of a loop's points from a centre. */
function meanRadius(loop: readonly Point[], cx: number, cy: number): number {
  const total = loop.reduce(
    (sum, p) => sum + Math.hypot(p.x - cx, p.y - cy),
    0,
  );
  return total / loop.length;
}

describe("cutout", () => {
  it("snaps a wobbly tracing onto the subject's true border", () => {
    const rgba = disc(60, 60, 30);
    const result = cutout(rgba, 120, 120, [wobble(60, 60, 30, 6)]);
    expect(result).not.toBeNull();
    const border = result!.contours[0]!;
    // The tracing wobbled between 24 and 36 px out; the found border sits on
    // the disc's edge at 30, everywhere.
    expect(Math.abs(meanRadius(border, 60, 60) - 30)).toBeLessThan(1.5);
    for (const p of border) {
      expect(Math.abs(Math.hypot(p.x - 60, p.y - 60) - 30)).toBeLessThan(3);
    }
  });

  it("keeps the subject and deletes the ground", () => {
    const rgba = disc(60, 60, 30);
    const result = cutout(rgba, 120, 120, [wobble(60, 60, 30, 6)])!;
    const alpha = result.alpha;
    expect(alpha[60 * 120 + 60]).toBeGreaterThan(250);
    expect(alpha[5 * 120 + 5]).toBe(0);
    expect(alpha[115 * 120 + 10]).toBe(0);
  });

  it("recovers a tracing whose centre is off, not just its wobble", () => {
    // Drawn around the wrong spot — 6 px off — but the true border still runs
    // inside the band, so the cut still finds it.
    const rgba = disc(60, 60, 30);
    const result = cutout(rgba, 120, 120, [wobble(66, 63, 30, 4)])!;
    expect(Math.abs(meanRadius(result.contours[0]!, 60, 60) - 30)).toBeLessThan(
      2,
    );
  });

  it("scores a real border high and a border through nothing low", () => {
    const found = cutout(disc(60, 60, 30), 120, 120, [wobble(60, 60, 30, 6)])!;
    // A blank scene has no border to find anywhere in the band: the cut
    // follows the hand, and says so with a confidence near the floor.
    const blank = scene(120, 120, () => [200, 200, 200] as const);
    const nothing = cutout(blank, 120, 120, [wobble(60, 60, 30, 6)])!;
    expect(found.separation).toBeGreaterThan(0.15);
    expect(found.confidence).toBeGreaterThan(0.5);
    expect(nothing.separation).toBeLessThan(0.05);
    expect(nothing.confidence).toBeLessThan(found.confidence - 0.3);
  });

  it("cuts the same cut every time", () => {
    const rgba = disc(60, 60, 30);
    const once = cutout(rgba, 120, 120, [wobble(60, 60, 30, 6)])!;
    const twice = cutout(rgba, 120, 120, [wobble(60, 60, 30, 6)])!;
    expect(twice.contours).toEqual(once.contours);
    expect(twice.confidence).toBe(once.confidence);
  });

  it("feathers the edge when asked and keeps it crisp when not", () => {
    const rgba = disc(60, 60, 30);
    const soft = (feather: number) => {
      const alpha = cutout(rgba, 120, 120, [wobble(60, 60, 30, 4)], {
        feather,
      })!.alpha;
      let between = 0;
      for (const a of alpha) if (a > 10 && a < 245) between++;
      return between;
    };
    expect(soft(4)).toBeGreaterThan(soft(0) * 2);
  });

  it("takes two loops as two subjects", () => {
    const rgba = scene(120, 120, (x, y) =>
      Math.hypot(x - 35, y - 60) <= 18 || Math.hypot(x - 85, y - 60) <= 18
        ? ([40, 60, 50] as const)
        : ([230, 225, 210] as const),
    );
    const result = cutout(rgba, 120, 120, [
      wobble(35, 60, 18, 4),
      wobble(85, 60, 18, 4),
    ])!;
    expect(result.contours).toHaveLength(2);
    expect(result.alpha[60 * 120 + 35]).toBeGreaterThan(250);
    expect(result.alpha[60 * 120 + 85]).toBeGreaterThan(250);
    // The ground between the two is background, not bridge.
    expect(result.alpha[60 * 120 + 60]).toBe(0);
  });

  it("answers null for a tracing with nothing in it", () => {
    const rgba = disc(60, 60, 30);
    expect(cutout(rgba, 120, 120, [])).toBeNull();
    expect(
      cutout(rgba, 120, 120, [
        [
          { x: 10, y: 10 },
          { x: 11, y: 10 },
        ],
      ]),
    ).toBeNull();
  });
});

describe("resampleClosed", () => {
  it("walks a loop at the asked step", () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];
    const walked = resampleClosed(square, 1);
    expect(Math.abs(walked.length - 160)).toBeLessThanOrEqual(1);
    // Every resampled point still lies on the square's edge.
    for (const p of walked) {
      const onEdge =
        ((p.x === 0 || p.x === 40) && p.y >= 0 && p.y <= 40) ||
        ((p.y === 0 || p.y === 40) && p.x >= 0 && p.x <= 40);
      expect(onEdge).toBe(true);
    }
  });
});
