// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  colorMask,
  despeckle,
  floodMask,
  grow,
  matchAt,
  regionAt,
  simplifyContour,
  traceContours,
  type BinaryMask,
} from "../src/app/flood.ts";
import type { Point } from "../src/app/types.ts";

// The paint bucket's whole pipeline is pure — flood an RGBA buffer, trace what
// was flooded, simplify the outline — so it is tested here on hand-built
// images, with no canvas anywhere. What the browser contributes (rasterising
// the page into that buffer) is the one part that isn't, and it lives in
// `probe.ts`.

/** Build an RGBA buffer from an ASCII picture: `.` is white page, `#` is a
 *  black mark. Reading the fixtures beats decoding index arithmetic. */
function image(rows: string[]): {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const height = rows.length;
  const width = rows[0]!.length;
  const pixels = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const i = (y * width + x) * 4;
      const value = cell === "#" ? 0 : 255;
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    });
  });
  return { pixels, width, height };
}

/** How many cells a mask holds. */
function area(mask: BinaryMask): number {
  return mask.data.reduce((n, cell) => n + cell, 0);
}

/** A mask from the same ASCII notation, for the tracing tests. */
function mask(rows: string[]): BinaryMask {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      data[y * width + x] = cell === "#" ? 1 : 0;
    });
  });
  return { width, height, data };
}

describe("floodMask", () => {
  const box = image([
    "..........",
    "..######..",
    "..#....#..",
    "..#....#..",
    "..######..",
    "..........",
  ]);

  it("fills the inside of a closed shape and stops at its walls", () => {
    const filled = floodMask(box.pixels, box.width, box.height, {
      x: 4,
      y: 2,
    })!;
    // The 4×2 hollow interior, and nothing else.
    expect(area(filled)).toBe(8);
    expect(filled.data[2 * box.width + 3]).toBe(1);
    // …not the wall, and not the page outside it.
    expect(filled.data[1 * box.width + 3]).toBe(0);
    expect(filled.data[0]).toBe(0);
  });

  it("fills the page around a shape without crossing into it", () => {
    const filled = floodMask(box.pixels, box.width, box.height, {
      x: 0,
      y: 0,
    })!;
    // The whole page, less the box's 16 wall cells and its 8-cell interior.
    expect(area(filled)).toBe(60 - 16 - 8);
  });

  it("leaks through a gap in the wall, the way a bucket does", () => {
    const leaky = image([
      "..........",
      "..######..",
      "..#....#..",
      "..#....#..",
      "..###.##..",
      "..........",
    ]);
    const filled = floodMask(leaky.pixels, leaky.width, leaky.height, {
      x: 4,
      y: 2,
    })!;
    expect(filled.data[5 * leaky.width + 0]).toBe(1);
  });

  it("declines a seed off the buffer", () => {
    expect(floodMask(box.pixels, box.width, box.height, { x: 40, y: 2 })).toBe(
      null,
    );
  });

  it("walks across a soft edge but not across a different colour", () => {
    // A row of near-white pixels (an anti-aliased edge) then a hard black one.
    const pixels = new Uint8ClampedArray(4 * 4);
    for (const [i, v] of [255, 245, 235, 0].entries()) {
      pixels[i * 4] = v;
      pixels[i * 4 + 1] = v;
      pixels[i * 4 + 2] = v;
      pixels[i * 4 + 3] = 255;
    }
    const filled = floodMask(pixels, 4, 1, { x: 0, y: 0 })!;
    expect([...filled.data]).toEqual([1, 1, 1, 0]);
  });
});

describe("grow", () => {
  it("expands the mask over the anti-aliased seam around a mark", () => {
    const before = mask(["...", ".#.", "..."]);
    expect(area(grow(before, 1))).toBe(9);
    expect(area(grow(before, 0))).toBe(1);
  });
});

describe("traceContours", () => {
  it("traces a filled square as its four corners", () => {
    const loops = traceContours(mask(["....", ".##.", ".##.", "...."]));
    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ]);
  });

  it("traces a hole as a loop of its own, so the fill can leave it empty", () => {
    const loops = traceContours(
      mask(["#####", "#####", "##.##", "#####", "#####"]),
    );
    // The outer edge, and the hole in the middle.
    expect(loops).toHaveLength(2);
    expect(loops.map((loop) => loop.length)).toEqual([4, 4]);
  });

  it("finds nothing in an empty mask", () => {
    expect(traceContours(mask(["...", "..."]))).toEqual([]);
  });
});

describe("simplifyContour", () => {
  it("drops the points a run doesn't need", () => {
    const staircase: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0.4 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const simplified = simplifyContour(staircase, 1);
    expect(simplified.length).toBeLessThan(staircase.length);
    expect(simplified).toContainEqual({ x: 10, y: 10 });
  });

  it("keeps a corner a coarse tolerance would cut", () => {
    const corner: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(simplifyContour(corner, 0.5)).toEqual(corner);
  });
});

describe("regionAt", () => {
  const page = image([
    "..........",
    "..######..",
    "..#....#..",
    "..#....#..",
    "..######..",
    "..........",
  ]);

  it("hands back outlines in document coordinates", () => {
    const contours = regionAt(page.pixels, page.width, page.height, {
      x: 4,
      y: 2,
    })!;
    expect(contours).not.toBeNull();
    expect(contours.length).toBeGreaterThan(0);
    // The interior is x 3–6, y 2–3; grown by the default two cells it reaches
    // into the wall, which is exactly what stops a fill leaving a pale halo.
    const xs = contours.flat().map((p) => p.x);
    const ys = contours.flat().map((p) => p.y);
    expect(Math.min(...xs)).toBeLessThanOrEqual(3);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(6);
    expect(Math.min(...ys)).toBeLessThanOrEqual(2);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(4);
  });

  it("scales a coarse snapshot back onto the page", () => {
    // Half-resolution snapshot: a mask cell is two document pixels.
    const contours = regionAt(
      page.pixels,
      page.width,
      page.height,
      { x: 8, y: 4 },
      { scale: 0.5, growBy: 0, epsilon: 0 },
    )!;
    const xs = contours.flat().map((p) => p.x);
    // The traced interior spans mask x 3–7, which is document x 6–14.
    expect(Math.min(...xs)).toBe(6);
    expect(Math.max(...xs)).toBe(14);
  });

  it("gives up on a tap off the page", () => {
    expect(
      regionAt(page.pixels, page.width, page.height, { x: 99, y: 99 }),
    ).toBeNull();
  });

  it("coarsens an outline rather than filing a huge one", () => {
    // A comb: every other row is walled off halfway across, so the page around
    // it traces as a staircase of dozens of steps.
    const ragged = image(
      Array.from({ length: 40 }, (_, y) =>
        y % 2 === 0 ? ".".repeat(40) : ".".repeat(20) + "#".repeat(20),
      ),
    );
    const contours = regionAt(
      ragged.pixels,
      ragged.width,
      ragged.height,
      { x: 1, y: 1 },
      { scale: 1, maxPoints: 40 },
    )!;
    expect(contours.flat().length).toBeLessThanOrEqual(40);
  });
});

describe("colorMask", () => {
  // Two marks of the same ink with clear page between them, which is the case
  // the flood and the match answer differently.
  const twins = image(["..........", "..##..##..", "..##..##..", ".........."]);

  it("takes every pixel of the colour, connected to the seed or not", () => {
    const matched = colorMask(twins.pixels, twins.width, twins.height, {
      x: 2,
      y: 1,
    })!;
    expect(area(matched)).toBe(8);
    // …where the flood from the same seed stops at the gap and takes four.
    const flooded = floodMask(twins.pixels, twins.width, twins.height, {
      x: 2,
      y: 1,
    })!;
    expect(area(flooded)).toBe(4);
  });

  it("takes the page when the page is what was pressed", () => {
    const matched = colorMask(twins.pixels, twins.width, twins.height, {
      x: 0,
      y: 0,
    })!;
    expect(area(matched)).toBe(40 - 8);
  });

  it("widens with the tolerance it is given", () => {
    const shades = image(["..", ".."]);
    // A near-white pixel: outside a tight tolerance, inside a loose one.
    shades.pixels[4] = 230;
    shades.pixels[5] = 230;
    shades.pixels[6] = 230;
    const tight = colorMask(shades.pixels, 2, 2, { x: 0, y: 0 }, 4)!;
    expect(area(tight)).toBe(3);
    const loose = colorMask(shades.pixels, 2, 2, { x: 0, y: 0 }, 40)!;
    expect(area(loose)).toBe(4);
  });

  it("gives up on a seed off the buffer", () => {
    expect(
      colorMask(twins.pixels, twins.width, twins.height, { x: 99, y: 0 }),
    ).toBeNull();
  });
});

describe("despeckle", () => {
  it("drops the runs under the bar and keeps the ones over it", () => {
    const speckled = mask([
      "####.#....",
      "####......",
      "####...#..",
      "..........",
    ]);
    const cleaned = despeckle(speckled, 6);
    expect(area(cleaned)).toBe(12);
    // The block survives whole; both single cells go.
    expect(cleaned.data[5]).toBe(0);
    expect(cleaned.data[2 * 10 + 7]).toBe(0);
    expect(cleaned.data[0]).toBe(1);
  });

  it("counts a run four-connected, so a diagonal chain is specks", () => {
    const diagonal = mask(["#...", ".#..", "..#.", "...#"]);
    expect(area(despeckle(diagonal, 2))).toBe(0);
  });

  it("hands the mask straight back when nothing can be too small", () => {
    const one = mask(["#."]);
    expect(despeckle(one, 1)).toEqual(one);
  });
});

describe("matchAt", () => {
  const twins = image(["..........", "..##..##..", "..##..##..", ".........."]);

  it("outlines both places the colour appears, not just the one pressed", () => {
    const contours = matchAt(
      twins.pixels,
      twins.width,
      twins.height,
      { x: 2, y: 1 },
      { scale: 1, growBy: 0, epsilon: 0, minCells: 2 },
    )!;
    expect(contours).toHaveLength(2);
    const xs = contours.flat().map((p) => p.x);
    expect(Math.min(...xs)).toBe(2);
    expect(Math.max(...xs)).toBe(8);
  });

  it("chooses the page with the marks left out of it as holes", () => {
    // The press every tracing tool has to refuse — the bare sheet — is the one
    // this answers usefully: the sheet's own outline, with a hole where each
    // mark is. That is "the background, and not what is drawn on it".
    const contours = matchAt(
      twins.pixels,
      twins.width,
      twins.height,
      { x: 0, y: 0 },
      { scale: 1, growBy: 0, epsilon: 0, minCells: 2 },
    )!;
    expect(contours).toHaveLength(3);
  });

  it("throws the speckle away before it traces", () => {
    // One stray pixel of the ink, the kind a photograph has thousands of. Left
    // in, it is a closed loop of its own in the selection.
    const noisy = image([
      "..........",
      "..###..#..",
      "..###.....",
      "..###.....",
      "..........",
    ]);
    const contours = matchAt(
      noisy.pixels,
      noisy.width,
      noisy.height,
      { x: 2, y: 1 },
      { scale: 1, growBy: 0, epsilon: 0 },
    )!;
    expect(contours).toHaveLength(1);
  });

  it("gives up on a press off the page", () => {
    expect(
      matchAt(twins.pixels, twins.width, twins.height, { x: 99, y: 99 }),
    ).toBeNull();
  });
});
