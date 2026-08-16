// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The second watercolour engine.
//
// A field simulation is exactly the kind of thing that is easy to write and
// hard to be sure of: it looks plausible whatever it is doing, and "that seems
// about right" is not a test. So the claims checked here are the ones the
// engine actually makes — that the same wash dries the same way every time,
// that the pigment ends up where the water left it rather than where the brush
// went, that the rim is darker than the middle, that a heavy pigment mottles
// and a staining one does not, and that a thirsty sheet pulls the water
// further. Each of them is a number the field emits, so none of them needs a
// canvas.

import { describe, expect, it } from "vitest";

import { groundProfile, SOLID_GROUND } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import {
  charge,
  createField,
  density,
  pigmentFor,
  step,
  type WashField,
} from "../src/app/plugins/washField.ts";
import { mm } from "../src/app/units.ts";

const CELL = mm(0.2);

/** A field big enough for a blot and the water that runs out of it. */
function sheet(
  ground: GroundProfile = SOLID_GROUND,
  granulation = 0.6,
  span = 70,
): WashField {
  return createField({
    x: 0,
    y: 0,
    width: span,
    height: span,
    cell: CELL,
    ground,
    granulation,
  });
}

/** A touch of a loaded brush in the middle of a field, dried to the end. */
function blot(
  field: WashField,
  o: { water?: number; pigment?: number; steps?: number } = {},
): Float32Array {
  const middle = (field.width * field.cell) / 2;
  charge(field, middle, middle, mm(2), o.water ?? 0.9, o.pigment ?? 0.7);
  for (let i = 0; i < (o.steps ?? 30); i++) step(field);
  return density(field);
}

/** How much of the sheet the wash ended up on. */
function covered(settled: Float32Array): number {
  let cells = 0;
  for (const v of settled) if (v > 0.002) cells++;
  return cells;
}

function total(settled: Float32Array): number {
  let sum = 0;
  for (const v of settled) sum += v;
  return sum;
}

/** The wash's mean density at each whole-cell radius from the middle — the
 *  radial profile a blot dried into. */
function profile(field: WashField, settled: Float32Array): number[] {
  const mid = (field.width - 1) / 2;
  const reach = Math.ceil(field.width / 2);
  const sums = new Array<number>(reach).fill(0);
  const counts = new Array<number>(reach).fill(0);
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) {
      const r = Math.round(Math.hypot(x - mid, y - mid));
      if (r >= reach) continue;
      sums[r]! += settled[y * field.width + x]!;
      counts[r]! += 1;
    }
  }
  return sums.map((sum, r) => (counts[r]! > 0 ? sum / counts[r]! : 0));
}

describe("pigment properties", () => {
  it("reads one dial as a whole pigment", () => {
    const phthalo = pigmentFor(0);
    const ultramarine = pigmentFor(2);
    // The axis a painter actually moves along: what settles into the paper does
    // not stain it, and what stains it does not settle.
    expect(phthalo.granulation).toBe(0);
    expect(phthalo.staining).toBe(1);
    expect(ultramarine.granulation).toBe(1);
    expect(ultramarine.staining).toBe(0);
    // …and a dye in solution creeps further than a suspension of grit.
    expect(phthalo.diffusion).toBeGreaterThan(ultramarine.diffusion);
  });

  it("clamps a dial past either end", () => {
    expect(pigmentFor(-3).granulation).toBe(0);
    expect(pigmentFor(99).granulation).toBe(1);
  });
});

describe("the wet field", () => {
  it("dries the same wash the same way every time", () => {
    // The whole contract. A repaint, a pan, an undo and the exported PNG all
    // run the field again from the document, so two runs that differed by a
    // pixel would mean a page that changes when you look away from it.
    const first = blot(sheet());
    const second = blot(sheet());
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it("finds the same paper wherever the field is opened over it", () => {
    // The sheet's height is hashed off the *page*, not off the mark, so two
    // washes that overlap agree about where the paper is low. Two fields whose
    // grids line up on the same page coordinates must see the same bed.
    const here = createField({
      x: 40 * CELL,
      y: 40 * CELL,
      width: 20,
      height: 20,
      cell: CELL,
      ground: groundProfile({ stock: "rough" }),
      granulation: 0.6,
    });
    const wider = createField({
      x: 0,
      y: 0,
      width: 60,
      height: 60,
      cell: CELL,
      ground: groundProfile({ stock: "rough" }),
      granulation: 0.6,
    });
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        expect(here.bed[y * 20 + x]).toBeCloseTo(
          wider.bed[(y + 40) * 60 + (x + 40)]!,
          6,
        );
      }
    }
  });

  it("puts every grain of pigment somewhere and invents none", () => {
    const field = sheet();
    const middle = (field.width * field.cell) / 2;
    charge(field, middle, middle, mm(2), 0.9, 0.7);
    let laid = 0;
    for (const v of field.suspended) laid += v;
    for (let i = 0; i < 45; i++) step(field);
    // Nothing was created and nothing lost: the wash on the sheet is the
    // pigment that went onto it. (The water is not conserved — it evaporates —
    // but what it was carrying has nowhere to go except the paper.)
    expect(total(density(field))).toBeCloseTo(laid, 3);
    // …and none of it is still in the water once the field has been read.
    for (const v of field.suspended) expect(v).toBe(0);
  });

  it("takes the water off the sheet and leaves the colour behind", () => {
    const field = sheet();
    const middle = (field.width * field.cell) / 2;
    charge(field, middle, middle, mm(2), 0.9, 0.7);
    for (let i = 0; i < 45; i++) step(field);
    let standing = 0;
    for (const v of field.water) standing += v;
    expect(standing).toBe(0);
    expect(total(field.deposit)).toBeGreaterThan(0);
  });

  it("carries the pigment past where the brush went", () => {
    // The mark is wider than the head that laid it, because the water ran on
    // and took the colour with it. The head here is 2 mm across — ten cells —
    // so a wash confined to it would cover about 78 of them.
    const settled = blot(sheet());
    expect(covered(settled)).toBeGreaterThan(200);
  });

  it("dries darkest at the rim", () => {
    // The coffee-ring, and the single most recognisable thing about the medium.
    // Nothing strokes an outline here: the edge evaporates faster, the middle
    // flows out to replace what left, and the pigment it carried is stranded
    // where it arrived. So the darkest ring of the mark is out at its edge and
    // not in the middle where the brush actually was.
    const field = sheet();
    const settled = blot(field, { steps: 45 });
    const rings = profile(field, settled);
    const edge = rings.findIndex((d, r) => r > 1 && d < 0.002);
    let darkest = 1;
    for (let r = 1; r < edge; r++) {
      if (rings[r]! > rings[darkest]!) darkest = r;
    }
    // Out past two thirds of the way to the wet edge…
    expect(darkest).toBeGreaterThan(edge * 0.66);
    // …and heavier than the pale middle it was drawn out of.
    const middle = rings.slice(1, 5).reduce((a, b) => a + b, 0) / 4;
    expect(rings[darkest]!).toBeGreaterThan(middle);
  });

  it("mottles with a heavy pigment and dries flat with a staining one", () => {
    // Granulation is not a texture drawn over the wash — it is a heavy pigment
    // dropping into the sheet's valleys, so it only shows where there are
    // valleys and only for a pigment that sinks.
    const rough = groundProfile({ stock: "rough" });
    const uneven = (granulation: number) => {
      const field = sheet(rough, granulation);
      const settled = blot(field, { steps: 45 });
      const mid = (field.width - 1) / 2;
      const inside: number[] = [];
      for (let y = 0; y < field.height; y++) {
        for (let x = 0; x < field.width; x++) {
          if (Math.hypot(x - mid, y - mid) > 7) continue;
          inside.push(settled[y * field.width + x]!);
        }
      }
      const mean = inside.reduce((a, b) => a + b, 0) / inside.length;
      const variance =
        inside.reduce((a, b) => a + (b - mean) ** 2, 0) / inside.length;
      return Math.sqrt(variance) / Math.max(mean, 1e-6);
    };
    expect(uneven(2)).toBeGreaterThan(uneven(0));
  });

  it("runs further on paper that drinks than on a sealed sheet", () => {
    // Capillary creep: the wet edge frays into thirsty stock and stops where
    // the water put it on a sealed one.
    const sealed = covered(blot(sheet(SOLID_GROUND), { steps: 45 }));
    const paper = covered(
      blot(sheet(groundProfile({ stock: "newsprint" })), { steps: 45 }),
    );
    expect(paper).toBeGreaterThan(sealed);
  });

  it("lays a heavier wash for more pigment on the brush", () => {
    const thin = total(blot(sheet(), { pigment: 0.3 }));
    const strong = total(blot(sheet(), { pigment: 1.2 }));
    expect(strong).toBeGreaterThan(thin * 2);
  });

  it("spreads further for more water on the brush", () => {
    const dry = covered(blot(sheet(), { water: 0.3 }));
    const loaded = covered(blot(sheet(), { water: 1.6 }));
    expect(loaded).toBeGreaterThan(dry);
  });

  it("leaves a charge off the sheet where it lands off the field", () => {
    // A brushful outside the grid must not wrap round to the other side of it,
    // which is the classic way an index into a flat array goes wrong.
    const field = sheet();
    charge(field, -50 * CELL, 10 * CELL, mm(2), 1, 1);
    expect(total(field.water)).toBe(0);
  });
});

// --- The mottle on a coarse grid ---------------------------------------------
//
// A long stroke blows the simulation's cell budget and is worked out on a
// coarser grid (see `washSim.ts`), and the sheet's pools are then held to a
// floor of a few cells (see `createField`). The floor keeps the *bed* smooth —
// but the pigment that granulates rolls to the bottoms of those pools, and a
// pool spanning the floor bottoms out in a single cell. What that dried into
// was a mosaic of arithmetic-sized squares across the middle of every long
// wash: a pixelated trail, at exactly the strokes big enough to be coarsened.
// So the rolling stands down as the grid coarsens past the paper, and these
// pin both halves: the fade itself, and the picture it exists for.

describe("the mottle on a coarse grid", () => {
  /** A cell the budget would force on a long stroke — coarse enough that the
   *  bed's floor of 3.5 cells beats the bare sheet's own tooth. */
  const COARSE = mm(0.2);

  /** A wide brush swept in an S across a coarse sheet, laid over time the way
   *  a gesture is: the shape of the stroke that used to pixelate. */
  function sweep(granulation: number): {
    settled: Float32Array;
    width: number;
    height: number;
  } {
    const width = 170;
    const height = 110;
    const field = createField({
      x: 0,
      y: 0,
      width,
      height,
      cell: COARSE,
      ground: SOLID_GROUND,
      granulation,
    });
    for (let i = 0; i < 48; i++) {
      const t = i / 47;
      charge(
        field,
        (25 + t * 120) * COARSE,
        (55 + Math.sin(t * Math.PI * 2) * 28) * COARSE,
        mm(4),
        0.4,
        0.22,
      );
      if (i % 5 === 4) step(field);
    }
    for (let i = 0; i < 40; i++) step(field);
    return { settled: density(field), width, height };
  }

  /** How rough the wash's body is cell to cell: the mean distance of each
   *  well-inked cell from its four neighbours, per unit of ink. A texture at
   *  the paper's pitch spans cells and barely registers; a mosaic of single
   *  cells is exactly what it reads. */
  function roughness(wash: ReturnType<typeof sweep>): number {
    const { settled, width, height } = wash;
    let mean = 0;
    let cells = 0;
    for (const v of settled) {
      if (v > 0) {
        mean += v;
        cells++;
      }
    }
    mean /= cells;
    let noise = 0;
    let ink = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const at = y * width + x;
        if (settled[at]! < mean * 0.5) continue;
        const avg =
          (settled[at - 1]! +
            settled[at + 1]! +
            settled[at - width]! +
            settled[at + width]!) /
          4;
        noise += Math.abs(settled[at]! - avg);
        ink += settled[at]!;
      }
    }
    return noise / ink;
  }

  it("rolls the mottle only on a grid fine enough to draw it", () => {
    const grid = (cell: number) =>
      createField({
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        cell,
        ground: SOLID_GROUND,
        granulation: 1,
      });
    // Every short mark: the pools span many cells, and the mottle is theirs.
    expect(grid(mm(0.05)).resolve).toBe(1);
    // A budget-coarsened one: the pools are the floor's own size, and rolling
    // pigment into them would print the grid.
    expect(grid(COARSE).resolve).toBe(0);
  });

  it("granulates no rougher per cell than a staining pigment dries", () => {
    // The user-visible half. A heavy pigment on a grid too coarse to draw its
    // pools must not granulate into single cells — before the fade, this wash
    // dried a quarter *rougher* than the staining one, and that quarter was
    // the pixelated trail.
    expect(roughness(sweep(2))).toBeLessThan(roughness(sweep(0)));
  });
});

// --- The box the arithmetic actually runs in ---------------------------------
//
// The field is stepped inside a box drawn round the water rather than over the
// whole grid: the sheet a mark has not reached, and the sheet it has already
// dried out of, are cells whose every term is zero, and visiting them is the
// difference between a wash costing its own wet area and costing its bounding
// box (see `damp` in `washField.ts`).
//
// That is only sound while the box holds every wet cell there is. Nothing in the
// picture would say if it stopped — a wash whose leading edge fell outside would
// simply stop spreading, which looks like a wash that stopped spreading — so it
// is asserted directly, on every step, rather than inferred from a shape.

describe("the damp box", () => {
  /** Every cell with water in it, and whether the box holds all of them. */
  function outside(field: WashField): number {
    let loose = 0;
    for (let y = 0; y < field.height; y++) {
      for (let x = 0; x < field.width; x++) {
        if (field.water[y * field.width + x]! <= 0) continue;
        if (
          x < field.left ||
          x > field.right ||
          y < field.top ||
          y > field.bottom
        ) {
          loose++;
        }
      }
    }
    return loose;
  }

  it("holds every wet cell, on every step of a drying wash", () => {
    const field = sheet(groundProfile({ stock: "newsprint" }), 1.2, 90);
    const middle = (field.width * field.cell) / 2;
    // Laid in three touches with the sheet drying between them, which is the
    // shape that actually exercises it: the box has to open for water arriving
    // on a sheet that has begun to dry back.
    for (let touch = 0; touch < 3; touch++) {
      charge(field, middle + touch * mm(3), middle, mm(2), 1, 0.8);
      for (let i = 0; i < 12; i++) {
        step(field);
        expect(outside(field)).toBe(0);
      }
    }
  });

  it("closes on a sheet that has dried out", () => {
    const field = sheet();
    blot(field, { steps: 200 });
    // Nothing wet left, so there is nothing left to step: the box is the one no
    // cell is inside, and the steps after it cost nothing.
    expect(field.right).toBeLessThan(field.left);
  });
});
