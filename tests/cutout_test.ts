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

/** A clean ring of points at one radius — a tracing drawn steadily, where
 *  `wobble` is one drawn by a hand. */
function ring(cx: number, cy: number, radius: number, n = 48): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
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

  it("reads the tracing as a prior: two edges, and the nearer one wins", () => {
    // Three bands of tone, so there are two real borders inside one search:
    // dark to mid at 30, mid to light at 42. Both are genuine edges and both
    // separate their sides, so the picture cannot say which one the subject
    // ends at — only the tracing can. Trace the near one and the cut keeps
    // the near one; trace the far one and it keeps that instead. Nothing about
    // the picture changes between these two runs.
    const rgba = scene(140, 140, (x, y) => {
      const d = Math.hypot(x - 70, y - 70);
      if (d <= 30) return [40, 55, 45] as const;
      if (d <= 42) return [132, 130, 118] as const;
      return [230, 225, 210] as const;
    });
    const near = cutout(rgba, 140, 140, [ring(70, 70, 30)])!;
    const far = cutout(rgba, 140, 140, [ring(70, 70, 42)])!;
    expect(Math.abs(meanRadius(near.contours[0]!, 70, 70) - 30)).toBeLessThan(
      2,
    );
    expect(Math.abs(meanRadius(far.contours[0]!, 70, 70) - 42)).toBeLessThan(2);
  });

  it("looks no further than the band, and the band is the user's to set", () => {
    // The subject's edge is 12 px outside the tracing. A hand-width band finds
    // it; a one-pixel band cannot reach it and says so by keeping the line as
    // drawn — which is exactly what someone who has traced carefully wants (see
    // `CUTOUT_BAND_MIN`).
    const rgba = disc(60, 60, 42);
    const wide = cutout(rgba, 120, 120, [ring(60, 60, 30)], { band: 20 })!;
    const tight = cutout(rgba, 120, 120, [ring(60, 60, 30)], { band: 1 })!;
    expect(Math.abs(meanRadius(wide.contours[0]!, 60, 60) - 42)).toBeLessThan(
      2,
    );
    expect(Math.abs(meanRadius(tight.contours[0]!, 60, 60) - 30)).toBeLessThan(
      1.5,
    );
  });

  it("searches the whole swath a nib painted, and nothing past it", () => {
    // Two real borders: subject to mid at 30, mid to ground at 50. The hand
    // laid the nib's *inner* rim on the true one at 30 and coloured outward, so
    // what it painted is the stripe 30–46 and the outline it left behind is at
    // 46 — sixteen pixels adrift of everything it meant.
    //
    // Told the nib's half-width, the cut searches that stripe: the band moves
    // onto the line the nib's centre walked (38) and reaches exactly as far as
    // the nib did, so the border at 30 is in and the one at 50 is out. Told
    // nothing, it searches twenty pixels either side of a line nobody drew,
    // where the wrong border is the nearer of the two — and takes it.
    const rgba = scene(140, 140, (x, y) => {
      const d = Math.hypot(x - 70, y - 70);
      if (d <= 30) return [40, 55, 45] as const;
      if (d <= 50) return [132, 130, 118] as const;
      return [230, 225, 210] as const;
    });
    const painted = [ring(70, 70, 46, 64)];
    const aimed = cutout(rgba, 140, 140, painted, { band: 8, nib: 8 })!;
    expect(Math.abs(meanRadius(aimed.contours[0]!, 70, 70) - 30)).toBeLessThan(
      2,
    );
    const blind = cutout(rgba, 140, 140, painted, { band: 20 })!;
    expect(Math.abs(meanRadius(blind.contours[0]!, 70, 70) - 50)).toBeLessThan(
      2,
    );
  });

  it("takes the nib's centre and the nib's rim as the same aim", () => {
    // The same border and the same pencil, aimed the two ways a hand aims one:
    // running the nib's centre along the border (a stripe from 22 to 38), and
    // laying its rim against it and colouring outward (30 to 46). Neither is
    // recoverable from the outline — 38 and 46 are just two rings — and with
    // the whole swath priced alike both land on the border at 30.
    const rgba = disc(60, 60, 30);
    const centred = cutout(rgba, 120, 120, [ring(60, 60, 38, 64)], {
      band: 8,
      nib: 8,
    })!;
    const rimmed = cutout(rgba, 120, 120, [ring(60, 60, 46, 64)], {
      band: 8,
      nib: 8,
    })!;
    for (const found of [centred, rimmed]) {
      expect(
        Math.abs(meanRadius(found.contours[0]!, 60, 60) - 30),
      ).toBeLessThan(1.5);
    }
  });

  it("never looks inside a swath that has been filled in", () => {
    // The middle of a painted outline, filled in with the gap filler, is not a
    // second tracing: the hand said nothing about it, so nothing in it may be
    // taken for the border however hard an edge sits there. Here a bright core
    // at 20 is a far stronger edge than the subject's own at 30, and the cut
    // does not reach it — the band is the stripe from 30 to 46 and stops.
    const rgba = scene(140, 140, (x, y) => {
      const d = Math.hypot(x - 70, y - 70);
      if (d <= 20) return [250, 240, 60] as const;
      if (d <= 30) return [40, 55, 45] as const;
      return [225, 220, 208] as const;
    });
    const filled = cutout(rgba, 140, 140, [ring(70, 70, 46, 64)], {
      band: 8,
      nib: 8,
    })!;
    expect(Math.abs(meanRadius(filled.contours[0]!, 70, 70) - 30)).toBeLessThan(
      2,
    );
    // …and the core is kept, whole.
    expect(filled.alpha[70 * 140 + 70]).toBeGreaterThan(250);
  });

  it("searches the nib's swath however narrow the band is set", () => {
    // The band may be widened past the nib but not narrowed inside it: the
    // stripe is the width of the thing that drew the outline, not a preference,
    // and half of what the hand painted being unexaminable is not a setting
    // worth offering. Being precise is reaching for a finer pencil.
    const rgba = disc(60, 60, 30);
    const found = cutout(rgba, 120, 120, [ring(60, 60, 46, 64)], {
      band: 1,
      nib: 8,
    })!;
    expect(Math.abs(meanRadius(found.contours[0]!, 60, 60) - 30)).toBeLessThan(
      1.5,
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
