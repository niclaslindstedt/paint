// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A stick of wax pressed onto a sheet.
//
// The field is the crayon's whole physics — the tooth catching crumbs, the
// valleys filling in under a second pass, the burnish a leaned-on stick
// cannot go past — and every one of those is a claim about numbers in a
// `Float32Array`, so it can be tested with no canvas anywhere: open a field,
// press the face onto it, and ask the paper what it took.

import { describe, expect, it } from "vitest";

import { SOLID_GROUND, groundProfile } from "../src/app/ground.ts";
import {
  createWaxField,
  laid,
  rub,
  waxCoverage,
  type WaxFieldSpec,
} from "../src/app/plugins/waxField.ts";
import { dragWax } from "../src/app/plugins/waxSim.ts";
import type { Point } from "../src/app/types.ts";

const PATCH: WaxFieldSpec = {
  x: 0,
  y: 0,
  width: 60,
  height: 60,
  cell: 1,
  ground: SOLID_GROUND,
  soft: 1,
};

/** A face profile that presses evenly — the field alone, no walk on top. */
const FLAT = new Float32Array(129).fill(1);
const MID = 64;

/** One full-force pass of a 12-px face over the middle of the patch. */
function pass(field: ReturnType<typeof createWaxField>, force: number): void {
  for (let x = 10; x <= 50; x += 3) {
    rub(field, x, 30, 0, 1, 6, 1.5, force, 0.25, FLAT, MID);
  }
}

function totalLoad(field: ReturnType<typeof createWaxField>): number {
  let sum = 0;
  for (const held of laid(field)) sum += held;
  return sum;
}

describe("the tooth", () => {
  it("lets a second pass reach ground the first could not", () => {
    // Wax stands the surface up (`LEVELLING`), so colouring something in
    // works: the pass over a patch already waxed reaches valleys the first
    // pass rode over, and the mark closes toward solid instead of merely
    // darkening the same crowns.
    const field = createWaxField({
      ...PATCH,
      ground: groundProfile({ stock: "cold" }),
    });
    pass(field, 0.8);
    const once = waxCoverage(field);
    pass(field, 0.8);
    pass(field, 0.8);
    const thrice = waxCoverage(field);
    expect(once).toBeGreaterThan(0);
    expect(thrice).toBeGreaterThan(once * 1.15);
  });

  it("burnishes: a cell holds only so much, however long you scribble", () => {
    const field = createWaxField(PATCH);
    for (let i = 0; i < 10; i++) pass(field, 1.5);
    const early = totalLoad(field);
    for (let i = 0; i < 10; i++) pass(field, 1.5);
    const late = totalLoad(field);
    // Ten more full-force passes add almost nothing: the stick is polishing.
    expect(late).toBeLessThan(early * 1.08);
    // The float-noise slack is the `Float32Array` rounding the cap up.
    for (const held of laid(field)) {
      expect(held).toBeLessThanOrEqual(field.cap + 1e-6);
    }
  });
});

describe("the box of sticks", () => {
  it("digs deeper and sheds more the softer the stick", () => {
    const ground = groundProfile({ stock: "cold" });
    const china = createWaxField({ ...PATCH, ground, soft: 0.3 });
    const pastel = createWaxField({ ...PATCH, ground, soft: 1.7 });
    pass(china, 0.8);
    pass(pastel, 0.8);
    // The pastel reaches tooth the china marker rides over, and leaves more
    // of itself on the tooth both can reach.
    expect(waxCoverage(pastel)).toBeGreaterThan(waxCoverage(china));
    expect(totalLoad(pastel)).toBeGreaterThan(totalLoad(china) * 1.5);
  });
});

describe("the sheet", () => {
  it("is the same paper under every mark, whichever way the stick went", () => {
    // The clump gate smears with the drag, but the paper's height is the
    // page's: two fields worked over the same patch in different directions
    // agree about where the sheet is low, which is what keeps the grain the
    // user sees painted under the marks one sheet.
    const ground = groundProfile({ stock: "rough" });
    const across = createWaxField({ ...PATCH, ground });
    const down = createWaxField({ ...PATCH, ground });
    across.ax = 1;
    across.ay = 0;
    down.ax = 0;
    down.ay = 1;
    rub(across, 30, 30, 0, 1, 20, 2, 1, 1, FLAT, MID);
    rub(down, 30, 30, 1, 0, 20, 2, 1, 1, FLAT, MID);
    for (let at = 0; at < across.sheet.length; at++) {
      if (across.ready[at] === 1 && down.ready[at] === 1) {
        expect(across.sheet[at]).toBe(down.sheet[at]);
      }
    }
  });

  it("holds more wax the rougher the stock", () => {
    const smooth = createWaxField(PATCH);
    const rough = createWaxField({
      ...PATCH,
      ground: groundProfile({ stock: "rough" }),
    });
    expect(rough.cap).toBeGreaterThan(smooth.cap);
  });
});

describe("a whole gesture", () => {
  it("lays the same mark on every repaint", () => {
    // Nothing here is random: a mark that grained differently on a pan, an
    // undo or the export would shimmer.
    const points: Point[] = [];
    for (let d = 0; d <= 40; d += 1.5) {
      points.push({ x: 10 + d, y: 30 + Math.sin(d / 9) * 4 });
    }
    const ground = groundProfile({ stock: "cold" });
    const once = createWaxField({ ...PATCH, ground });
    const again = createWaxField({ ...PATCH, ground });
    const patch = { x: 0, y: 0, width: 60, height: 60 };
    dragWax(once, points, 6, 1.5, 1, 1, patch);
    dragWax(again, points, 6, 1.5, 1, 1, patch);
    expect(laid(again)).toEqual(laid(once));
    expect(waxCoverage(once)).toBeGreaterThan(0);
  });
});
