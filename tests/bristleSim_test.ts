// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paintbrush's paint: the head, the reservoir, and what a stroke costs.
//
// The quill's test file one shelf along, because it is the quill's
// architecture at a third thickness of medium. The walk's claims are the
// brush's: one head is the round and the flat both (the projection), a drag
// spends its dip and runs dry — sooner on paper that drinks — and what a
// starving head still catches is the sheet's own grain. The economies are the
// ones the frame rate rests on: a landed mark is worked out once and blitted
// thereafter, the gesture in flight is walked incrementally to the *same*
// film a single walk would lay, and the lift of a finished stroke is a
// promotion rather than a second walk. And when none of it can run, the
// vector painter still draws.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groundProfile, SOLID_GROUND } from "../src/app/ground.ts";
import type { GroundProfile } from "../src/app/ground.ts";
import {
  bearing,
  catching,
  createBristleField,
  paintCoverage,
  painted,
  settling,
  type BristleField,
} from "../src/app/plugins/bristleField.ts";
import {
  markSeed,
  penFor,
  printOf,
  spanOf,
  splayOf,
} from "../src/app/plugins/bristleHead.ts";
import {
  advanceDrag,
  drag,
  forgetDriedPaint,
  openDrag,
  paintBristle,
  paintDryness,
  paintFlow,
  paintSimulatedPaint,
  projected,
} from "../src/app/plugins/bristleSim.ts";
import type { Point } from "../src/app/types.ts";
import {
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

const SIZE = 36;

function sheet(stock?: string): GroundProfile {
  return stock ? groundProfile({ stock }) : SOLID_GROUND;
}

function fieldOver(
  width: number,
  height: number,
  ground: GroundProfile = SOLID_GROUND,
): BristleField {
  return createBristleField({
    x: 0,
    y: 0,
    width,
    height,
    cell: 1,
    ground,
    wick: 0,
  });
}

/** A straight stroke along `y = 70`, sampled the way the canvas stores one:
 *  the gap between points *is* the hand's speed. */
function run(length: number, gap: number, from = 30): Point[] {
  const points: Point[] = [];
  for (let x = from; x <= from + length; x += gap) {
    points.push({ x, y: 70 });
  }
  return points;
}

/** Mean film over a column window of the band. */
function meanFilm(field: BristleField, x0: number, x1: number): number {
  const film = painted(field);
  let sum = 0;
  let n = 0;
  for (let y = 45; y < 95; y++) {
    for (let x = x0; x < x1; x++) {
      const held = film[y * field.width + x]!;
      if (held > 0) {
        sum += held;
        n++;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

describe("the head", () => {
  it("is the round and the flat both, by projection", () => {
    // A round lays its width whichever way the path runs…
    expect(projected(18, 1, 1, 0)).toBeCloseTo(18);
    expect(projected(18, 1, 0, 1)).toBeCloseTo(18);
    expect(projected(18, 1, 0.7071, 0.7071)).toBeCloseTo(18, 3);
    // …a flat lays its full width square across itself, closes to the
    // blade's own thickness along its edge, and swells between the two.
    expect(projected(18, 0.14, 1, 0)).toBeCloseTo(18);
    expect(projected(18, 0.14, 0, 1)).toBeCloseTo(18 * 0.14, 3);
    const diagonal = projected(18, 0.14, 0.7071, 0.7071);
    expect(diagonal).toBeGreaterThan(18 * 0.14);
    expect(diagonal).toBeLessThan(18);
  });

  it("lays a band as wide as the projection says on the page", () => {
    // Straight down the page with the blade at -45°: about cos 45° of the
    // head, plus the blade's own body.
    const field = fieldOver(500, 300);
    const points: Point[] = [];
    for (let y = 30; y <= 270; y += 3) points.push({ x: 250, y });
    drag(field, points, SIZE, 1, -Math.PI / 4, 1, 1, 1);
    const film = painted(field);
    let left = Infinity;
    let right = -Infinity;
    for (let x = 0; x < 500; x++) {
      if (film[150 * field.width + x]! > 0.05) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    const band = right - left;
    expect(band).toBeGreaterThan(SIZE * 0.55);
    expect(band).toBeLessThan(SIZE * 0.9);
  });

  it("bears down across the section like a cone, and like a blade squared off", () => {
    // A round curves away from the paper toward its rim, so what it lays
    // falls off across the band and the two sides of the mark are not ruled.
    expect(bearing(0, 1)).toBeCloseTo(1);
    expect(bearing(0.5, 1)).toBeCloseTo(1);
    expect(bearing(0.95, 1)).toBeLessThan(0.5);
    expect(bearing(1, 1)).toBeCloseTo(0);
    // A chisel ferrule is cut square: every hair along the blade meets the
    // sheet with the same length of hair behind it, all the way to the rim.
    for (const u of [0, 0.5, 0.95, 1]) expect(bearing(u, 0)).toBe(1);
    // …and the filbert between them keeps some of each.
    expect(bearing(0.95, 0.5)).toBeGreaterThan(bearing(0.95, 1));
    expect(bearing(0.95, 0.5)).toBeLessThan(1);
  });
});

describe("the hand on the head", () => {
  /** How wide the band is where the walk has passed `x`, in cells holding any
   *  film at all — the mark's own width, which is what the pressure moves. */
  function bandAt(field: BristleField, x: number): number {
    const film = painted(field);
    let top = Infinity;
    let bottom = -Infinity;
    for (let y = 0; y < field.height; y++) {
      if (film[y * field.width + x]! > 0.02) {
        if (y < top) top = y;
        bottom = y;
      }
    }
    return bottom < top ? 0 : bottom - top + 1;
  }

  /** …and how far from parallel the band's two sides run over a stretch of
   *  it, as a share of its own width — the wander a leaned-on head has and a
   *  gathered one has not. Scale-free on purpose: a pressed head is not
   *  supposed to be merely a wider one. */
  function wander(field: BristleField, from: number, to: number): number {
    const widths: number[] = [];
    for (let x = from; x <= to; x += 4) widths.push(bandAt(field, x));
    const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
    const sd = Math.sqrt(
      widths.reduce((a, b) => a + (b - mean) ** 2, 0) / widths.length,
    );
    return sd / mean;
  }

  function bandFor(press: number, flatness = 0): BristleField {
    const field = createBristleField({
      x: 0,
      y: 0,
      width: 900,
      height: 220,
      cell: 1,
      ground: sheet("cold"),
      wick: 0.45,
    });
    drag(field, run(800, 3), SIZE, flatness, 0, 1, 1, 1, press);
    return field;
  }

  it("draws with the point of a round, or with its belly", () => {
    // The stroke the tool is bought for: the same cone lays a line well
    // inside its ferrule held on its tip, and a band half again as wide as
    // the ferrule leaned on. Nothing else in the brush may reach past the
    // number on the size button — this is the hand, and it is what pressing
    // a bundle of hair out of a metal collar does.
    const light = bandAt(bandFor(0.4), 400);
    const rest = bandAt(bandFor(1), 400);
    const heavy = bandAt(bandFor(2), 400);
    expect(light).toBeLessThan(rest * 0.8);
    expect(heavy).toBeGreaterThan(rest * 1.25);
    expect(heavy).toBeLessThan(rest * 1.6);
  });

  it("hardly moves a blade, whose collar holds the hairs where they are", () => {
    // A cone has a belly to put down and a chisel ferrule has not, so the
    // dial is the round's dial and fades out with the flatness rather than
    // being switched off — a filbert keeps some of it, as it keeps some of
    // everything else.
    const round = splayOf(2, 0) - 1;
    const filbert = splayOf(2, 0.55) - 1;
    const flat = splayOf(2, 1) - 1;
    expect(flat).toBeGreaterThan(0);
    expect(flat).toBeLessThan(round * 0.45);
    expect(filbert).toBeGreaterThan(flat);
    expect(filbert).toBeLessThan(round);
    // …and the same, measured on the paper rather than on the number.
    const widened = (flatness: number) =>
      bandAt(bandFor(2, flatness), 400) / bandAt(bandFor(1, flatness), 400);
    expect(widened(1)).toBeLessThan(widened(0));
  });

  it("is the mark it always was under an ordinary hand", () => {
    // The dial rests where every painter's own default argument does, so a
    // page drawn without opening the panel is the page it was before the dial
    // existed — cell for cell, not nearly (see `tunedDials`).
    for (const flatness of [0, 0.55, 1]) {
      expect(splayOf(1, flatness)).toBe(1);
    }
    const spec = {
      x: 0,
      y: 0,
      width: 700,
      height: 220,
      cell: 1,
      ground: sheet("cold"),
      wick: 0.45,
    };
    const points = run(600, 3);
    const untouched = createBristleField(spec);
    drag(untouched, points, SIZE, 0, 0, 1, 1, 1);
    const rested = createBristleField(spec);
    drag(rested, points, SIZE, 0, 0, 1, 1, 1, 1);
    const a = painted(untouched);
    const b = painted(rested);
    let worst = 0;
    for (let i = 0; i < a.length; i++)
      worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
    expect(worst).toBe(0);
  });

  it("puts the bundle out of its own shape, not merely wider", () => {
    // The half of the dial that is not the width: a head bearing down is a
    // bundle out of its ferrule's grip, so its two sides stop being parallel,
    // its strands clump, and the partings between them stay open where a
    // gathered head's close over. Measured as a share of the band's own
    // width, so a wider mark cannot pass by being wider.
    expect(wander(bandFor(2), 200, 600)).toBeGreaterThan(
      wander(bandFor(1), 200, 600) * 1.5,
    );
    expect(wander(bandFor(0.4), 200, 600)).toBeLessThan(
      wander(bandFor(1), 200, 600),
    );
  });

  it("empties the head sooner, because more paint is coming off it", () => {
    // The film per unit of paper does not change with the pressure — what
    // changes is how much paper the head is covering, so the same dip is
    // spent over a shorter run and a leaned-on stroke scratches dry where a
    // light one is still laying paint.
    const rested = fieldOver(2000, 200);
    const leaned = fieldOver(2000, 200);
    const points = run(1900, 3);
    drag(rested, points, SIZE, 0, 0, 1, 1, 1);
    drag(leaned, points, SIZE, 0, 0, 1, 1, 1, 2);
    expect(meanFilm(leaned, 200, 400)).toBeGreaterThan(
      meanFilm(rested, 200, 400) * 0.9,
    );
    expect(meanFilm(leaned, 1500, 1700)).toBeLessThan(
      meanFilm(rested, 1500, 1700) * 0.7,
    );
  });
});

describe("the angle the head is held at", () => {
  const blade = (angle: number, flatness = 1) =>
    penFor(SIZE, flatness, angle, 1, 1, 1, SOLID_GROUND);

  it("leans the print off the path for a blade held obliquely, and for nothing else", () => {
    // Travelling right, so the path's axes are `t = (1, 0)`, `n = (0, 1)`.
    const along = (pen: ReturnType<typeof blade>) => printOf(pen, 1, 0, 0, 1);
    // A round's print is a disc: it reaches its half-width every way it is
    // asked, and every slice of it is centred on the path.
    const round = along(blade(-Math.PI / 4, 0));
    expect(round.reach).toBeCloseTo(SIZE / 2, 1);
    expect(round.across).toBeCloseTo(SIZE / 2, 1);
    expect(round.lean).toBeCloseTo(0);
    // A blade pulled square across itself lays its full width, stands almost
    // nothing out along the path, and leans nowhere either — this is the one
    // shape the mark was always right for.
    const square = along(blade(Math.PI / 2));
    expect(square.across).toBeCloseTo(SIZE / 2, 1);
    expect(square.reach).toBeLessThan(SIZE * 0.1);
    expect(square.lean).toBeCloseTo(0);
    // …and one held at 45° to the way the hand is going stands a corner out
    // ahead of the path and half a blade off to the side of it. That lean is
    // what the angle dial *does* to a drag; without it the head loses its
    // angle the moment the mark stops being a press.
    const oblique = along(blade(-Math.PI / 4));
    expect(Math.abs(oblique.lean)).toBeGreaterThan(SIZE * 0.3);
    // The blade is turned up and to the right, so the corner that leads is
    // the upper one — up the page is −y, and the normal here is +y.
    expect(oblique.lean).toBeLessThan(0);
    expect(along(blade(Math.PI / 4)).lean).toBeGreaterThan(0);
  });

  it("covers the whole band once the print has passed, and part of it before", () => {
    // A print that leans nowhere: the section is centred wherever it is
    // asked for, and tapers over the reach at the ends.
    const flat = { reach: 10, across: 8, lean: 0, chord: 8 };
    expect(spanOf(flat, -1, 1)).toEqual({ mid: 0, half: 8 });
    expect(spanOf(flat, 0.6, 1).mid).toBeCloseTo(0);
    expect(spanOf(flat, 0.6, 1).half).toBeLessThan(8);
    // …and one that leans: away from the ends it is still the whole band,
    // but the part of it that has arrived at an end stands off to one side.
    const oblique = { reach: 10, across: 8, lean: 6, chord: Math.sqrt(28) };
    expect(spanOf(oblique, -1, 1).mid).toBeCloseTo(0);
    expect(spanOf(oblique, -1, 1).half).toBeCloseTo(8);
    const entering = spanOf(oblique, -1, -0.6);
    expect(entering.mid).toBeLessThan(-1);
    expect(entering.half).toBeLessThan(8);
  });

  it("cuts the two ends of a drag at the angle the blade is held at", () => {
    // A flat held at −45° and dragged straight across the page leaves a
    // *parallelogram*: the corner that leads is the top one, so the top of
    // the mark starts and finishes further along than the bottom of it. Cut
    // square across the path instead — which is what a walk that only
    // projects the width leaves — and the two would start together.
    const field = fieldOver(600, 300);
    const points: Point[] = [];
    for (let x = 150; x <= 400; x += 6) points.push({ x, y: 150 });
    drag(field, points, SIZE, 1, -Math.PI / 4, 1, 1, 1);
    const film = painted(field);
    const from = (y: number) => {
      for (let x = 0; x < 600; x++) if (film[y * 600 + x]! > 0.02) return x;
      return Infinity;
    };
    const to = (y: number) => {
      for (let x = 599; x >= 0; x--) if (film[y * 600 + x]! > 0.02) return x;
      return -Infinity;
    };
    // Two rows a quarter of a head either side of the path: a cut at 45°
    // carries the mark's edge the same distance along as it is across, and
    // cut square across the path they would begin and end together.
    const off = Math.round(SIZE * 0.25);
    expect(from(150 - off) - from(150 + off)).toBeGreaterThan(off);
    // The lift slants the same way, and shallower — the head is coming up by
    // then, so what draws out of the leading corner is a fan of hair ends
    // rather than the whole blade (see `lifting`).
    expect(to(150 - off) - to(150 + off)).toBeGreaterThan(2);
    // …and turned the other way it slants the other way.
    const other = fieldOver(600, 300);
    drag(other, points, SIZE, 1, Math.PI / 4, 1, 1, 1);
    const mirror = painted(other);
    const mirrorFrom = (y: number) => {
      for (let x = 0; x < 600; x++) if (mirror[y * 600 + x]! > 0.02) return x;
      return Infinity;
    };
    expect(mirrorFrom(150 - off) - mirrorFrom(150 + off)).toBeLessThan(-off);
  });

  it("keeps that angle as a press turns into a drag", () => {
    // The head has to be carried clear of its own *print* before there is a
    // drag to lay, and a blade's print reaches further along the path the
    // more of its edge points that way. Measured against the narrow way it
    // can stand instead, a press turned into a drag after two pixels of
    // travel — and the angled bar a tap leaves came out square across the
    // direction of travel the moment the hand moved at all.
    const axis = (points: Point[]): number => {
      const field = fieldOver(300, 300);
      drag(field, points, SIZE, 1, -Math.PI / 4, 1, 1, 1);
      const film = painted(field);
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < film.length; i++) {
        if (film[i]! <= 0.02) continue;
        n++;
        sx += i % 300;
        sy += Math.floor(i / 300);
      }
      let xx = 0;
      let yy = 0;
      let xy = 0;
      for (let i = 0; i < film.length; i++) {
        if (film[i]! <= 0.02) continue;
        const x = (i % 300) - sx / n;
        const y = Math.floor(i / 300) - sy / n;
        xx += x * x;
        yy += y * y;
        xy += x * y;
      }
      // Which way the mark is longest, in degrees off the horizontal.
      return (Math.atan2(2 * xy, xx - yy) / 2) * (180 / Math.PI);
    };
    const pressed = [{ x: 150, y: 150 }];
    const nudged = [
      { x: 150, y: 150 },
      { x: 154, y: 150 },
      { x: 158, y: 150 },
      { x: 162, y: 150 },
    ];
    // The press lies along the blade…
    expect(axis(pressed)).toBeGreaterThan(-50);
    expect(axis(pressed)).toBeLessThan(-40);
    // …and so does the same press once the hand has carried it a few pixels
    // sideways, which is a drag of a *twelfth* of what the blade is long.
    expect(axis(nudged)).toBeGreaterThan(-55);
    expect(axis(nudged)).toBeLessThan(-35);
  });
});

describe("the two ends of a mark", () => {
  /** How far past `endX` the mark reaches along the row the path ran down. */
  function past(field: BristleField, endX: number, y = 70): number {
    const film = painted(field);
    let far = 0;
    for (let x = endX; x < field.width; x++) {
      if (film[y * field.width + x]! > 0.02) far = x - endX;
    }
    return far;
  }

  /** The same straight stroke, ending at x = 430, left at `speed` — the last
   *  stretch sampled at the gap a hand moving that fast leaves behind. */
  function lifted(speed: number): Point[] {
    const points = run(300, 6);
    for (let x = 330 + speed; x <= 430; x += speed) points.push({ x, y: 70 });
    return points;
  }

  it("does not stamp the head's own print at the head of a stroke", () => {
    // A swept touch-down takes the sheet with part of the bundle and opens to
    // the ferrule over the first stretch — so the mark does *not* begin with
    // a disc the diameter of the brush, which is wider than the stroke it
    // would be starting.
    const field = fieldOver(600, 200);
    drag(field, run(400, 14), SIZE, 0, 0, 1, 1, 1);
    const film = painted(field);
    const across = (x: number) => {
      let n = 0;
      for (let y = 0; y < 200; y++) if (film[y * 600 + x]! > 0.02) n++;
      return n;
    };
    // The entry is narrower than the body it opens into…
    expect(across(32)).toBeLessThan(across(200) * 0.85);
    // …and nothing reaches a half-head back behind where the hand touched.
    let behind = 0;
    for (let x = 0; x < 30; x++) if (across(x) > 0) behind = 30 - x;
    expect(behind).toBeLessThan(SIZE * 0.4);
  });

  it("draws the lift out into trailing hairs rather than closing it", () => {
    const field = fieldOver(600, 200);
    const points = run(400, 14);
    drag(field, points, SIZE, 0, 0, 1, 1, 1);
    const end = points[points.length - 1]!.x;
    // Something carries on past the last point the hand reached — the hairs
    // are bent backwards by then and come off the sheet still bent…
    expect(past(field, end)).toBeGreaterThan(2);
    // …and it is a fan out of the middle, not the whole width of the head:
    // the band has already narrowed by the time the hand let go.
    const film = painted(field);
    const wide = (x: number) => {
      let n = 0;
      for (let y = 0; y < 200; y++) if (film[y * 600 + x]! > 0.02) n++;
      return n;
    };
    expect(wide(end - 2)).toBeLessThan(wide(end - Math.round(SIZE)) * 0.9);
  });

  it("ends a flick and a stop differently, off the hand's own speed", () => {
    // A hand that stopped and then lifted leaves the stub of a standing head:
    // short, wide and full. One still travelling leaves the bent-back tips
    // strung out behind it — longer, narrower and paler. Same path, same
    // brush, same first point: only the way the hand left the paper differs.
    const slow = lifted(3);
    const fast = lifted(48);
    const stop = fieldOver(700, 200);
    const flick = fieldOver(700, 200);
    drag(stop, slow, SIZE, 0, 0, 1, 1, 1);
    drag(flick, fast, SIZE, 0, 0, 1, 1, 1);
    const stopped = slow[slow.length - 1]!.x;
    const flicked = fast[fast.length - 1]!.x;
    // The fan runs further past the last point the hand reached…
    expect(past(flick, flicked)).toBeGreaterThan(past(stop, stopped) * 1.5);
    // …it is paler, the head being on its way off the paper the whole time…
    expect(meanFilm(flick, flicked - 20, flicked)).toBeLessThan(
      meanFilm(stop, stopped - 20, stopped) * 0.8,
    );
    // …and the band it tapers out of is narrower.
    const wide = (field: BristleField, x: number) => {
      const film = painted(field);
      let n = 0;
      for (let y = 0; y < 200; y++) if (film[y * 700 + x]! > 0.02) n++;
      return n;
    };
    expect(wide(flick, flicked - 4)).toBeLessThan(wide(stop, stopped - 4));
  });

  it("prints the whole head for a press, and the same print when it jitters", () => {
    // A finger resting on the glass never holds still. The mark it leaves has
    // to be the mark a still one leaves — a press that shifted two pixels used
    // to lose its whole blot, and before that a quarter of it as a wedge.
    const still = fieldOver(300, 300);
    drag(still, [{ x: 150, y: 150 }], SIZE, 0, 0, 1, 1, 1);
    const moved = fieldOver(300, 300);
    drag(
      moved,
      [
        { x: 150, y: 150 },
        { x: 151, y: 151 },
        { x: 150, y: 152 },
      ],
      SIZE,
      0,
      0,
      1,
      1,
      1,
    );
    const a = painted(still);
    const b = painted(moved);
    let inked = 0;
    let lost = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i]! > 0.02) inked++;
      if (a[i]! > 0.02 && b[i]! <= 0.02) lost++;
    }
    // A press prints the head: a disc about as wide as the ferrule.
    expect(inked).toBeGreaterThan(Math.PI * (SIZE / 2) ** 2 * 0.6);
    // …and the jittered one is the same mark, give or take its rim.
    expect(lost / inked).toBeLessThan(0.15);
  });
});

describe("one brush per stroke", () => {
  /** How much two marks of the same shape differ, cell for cell. */
  function apart(a: BristleField, b: BristleField): number {
    const one = painted(a);
    const two = painted(b);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < one.length; i++) {
      if (one[i]! > 0.02 || two[i]! > 0.02) {
        sum += Math.abs(one[i]! - two[i]!);
        n++;
      }
    }
    return n === 0 ? 0 : sum / n;
  }

  it("gives two strokes of the same shape two different brushes", () => {
    // Every hashed trait of the head used to come off the strand's index
    // alone, so one stroke was the template for the next: the same fringe at
    // the touch-down, the same rails down the body, the same fan at the lift,
    // every time anyone drew with the tool.
    const here = fieldOver(600, 200);
    const there = fieldOver(600, 200);
    drag(here, run(400, 6), SIZE, 0, 0, 1, 1, 1);
    drag(there, run(400, 6, 90), SIZE, 0, 0, 1, 1, 1);
    // Laid over each other (the second starts 60 px along), the two marks are
    // not the same mark.
    const one = painted(here);
    const two = painted(there);
    let sum = 0;
    let n = 0;
    for (let y = 45; y < 95; y++) {
      for (let x = 120; x < 400; x++) {
        const a = one[y * 600 + x]!;
        const b = two[y * 600 + x + 60]!;
        if (a > 0.02 || b > 0.02) {
          sum += Math.abs(a - b);
          n++;
        }
      }
    }
    expect(sum / n).toBeGreaterThan(0.05);
  });

  it("gives the same stroke the same brush, every time it is worked out", () => {
    // …and it has to be the same one: the mark under the hand, the mark the
    // dried-mark store re-walks, and the mark the PNG export renders are one
    // mark, so the randomness is hashed off the gesture rather than drawn.
    const once = fieldOver(600, 200);
    const again = fieldOver(600, 200);
    drag(once, run(400, 6), SIZE, 0, 0, 1, 1, 1);
    drag(again, run(400, 6), SIZE, 0, 0, 1, 1, 1);
    expect(apart(once, again)).toBe(0);
  });

  it("seeds off the first point alone, so a gesture cannot re-seed as it grows", () => {
    // The `grows` contract: nothing about a settled pixel may depend on the
    // path after it, and the brush the stroke is being drawn with is the most
    // settled thing there is.
    const start = { x: 30, y: 70 };
    expect(markSeed([start, { x: 60, y: 70 }])).toBe(
      markSeed([start, { x: 60, y: 90 }, { x: 90, y: 90 }]),
    );
    expect(markSeed([start])).not.toBe(markSeed([{ x: 31, y: 70 }]));
  });
});

describe("the paper", () => {
  it("takes fully from a wet head and only its high ground from a dry one", () => {
    // A wet head bridges the whole relief — bar the meniscus shoulder over
    // the very deepest dips, which is an edge and not a refusal.
    expect(catching(0.5, 0)).toBe(1);
    expect(catching(0.1, 0)).toBe(1);
    expect(catching(0.9, 0)).toBeGreaterThan(0.5);
    // A starving one only reaches the high ground.
    expect(catching(0.9, 1)).toBe(0);
    expect(catching(0.5, 1)).toBe(0);
    expect(catching(0.05, 1)).toBeGreaterThan(0);
  });

  it("settles a wet film into its dips, gently", () => {
    const relief = 0.7;
    expect(settling(0.7, 1, relief)).toBeGreaterThan(1);
    expect(settling(0.05, 1, relief)).toBeLessThan(1);
    // Gently: body paint is dense, so the swing that shades an ink would
    // print as seams here (see `SETTLE` in `bristleField.ts`).
    expect(settling(1, 1.4, relief)).toBeLessThanOrEqual(1.45);
    expect(settling(0, 1.4, relief)).toBeGreaterThanOrEqual(0.55);
  });

  it("breaks a starved drag up on the tooth rather than fading it", () => {
    const field = createBristleField({
      x: 0,
      y: 0,
      width: 440,
      height: 160,
      cell: 1,
      ground: sheet("rough"),
      wick: 0,
    });
    drag(field, run(340, 3), SIZE, 0, 0, 1, 0.08, 1);
    expect(paintCoverage(field, 0.1)).toBeLessThan(0.35);
  });
});

describe("the reservoir", () => {
  it("flows freely while charged and starves towards empty", () => {
    expect(paintFlow(1)).toBe(1);
    expect(paintFlow(0.6)).toBe(1);
    expect(paintFlow(0.2)).toBeLessThan(paintFlow(0.4));
    expect(paintFlow(0)).toBeGreaterThan(0.1);
    expect(paintDryness(1)).toBe(0);
    expect(paintDryness(0.6)).toBe(0);
    expect(paintDryness(0.1)).toBeGreaterThan(0);
    expect(paintDryness(0)).toBe(1);
  });

  it("spends itself along the stroke: a low dip thins and gives out", () => {
    const field = fieldOver(2000, 160);
    drag(field, run(1900, 3), SIZE, 0, 0, 1, 0.4, 1);
    const head = meanFilm(field, 100, 300);
    const tail = meanFilm(field, 1600, 1800);
    expect(tail).toBeLessThan(head * 0.35);
  });

  it("shades with the hand: a fast sweep lays less than a slow one", () => {
    const field = fieldOver(1000, 160);
    const points = [
      ...run(266, 2, 50),
      ...run(266, 16, 320),
      ...run(264, 2, 590),
    ];
    drag(field, points, SIZE, 0, 0, 1, 1, 1);
    const slow = meanFilm(field, 120, 280);
    const fast = meanFilm(field, 380, 540);
    expect(fast).toBeLessThan(slow * 0.8);
  });

  it("is drunk faster by a thirsty sheet, so the same dip runs less on paper", () => {
    const onSolid = fieldOver(2000, 160);
    const onCold = createBristleField({
      x: 0,
      y: 0,
      width: 2000,
      height: 160,
      cell: 1,
      ground: sheet("cold"),
      wick: 0,
    });
    const points = run(1900, 3);
    drag(onSolid, points, SIZE, 0, 0, 1, 0.4, 1);
    drag(onCold, points, SIZE, 0, 0, 1, 0.4, 1);
    expect(meanFilm(onCold, 800, 1000)).toBeLessThan(
      meanFilm(onSolid, 800, 1000) * 0.75,
    );
  });

  it("runs about half as far squeezed flat, off the same dip", () => {
    const round = fieldOver(2000, 200);
    const flat = fieldOver(2000, 200);
    const points = run(1900, 3);
    drag(round, points, SIZE, 0, 0, 1, 0.5, 1);
    drag(flat, points, SIZE, 1, 0, 1, 0.5, 1);
    // The blade lies across the travel here (angle 0, path along x), so it
    // lays its full width — off a reservoir the ferrule squeezed in half.
    expect(meanFilm(flat, 900, 1100)).toBeLessThan(
      meanFilm(round, 900, 1100) * 0.8,
    );
  });
});

describe("the gesture in flight", () => {
  it("walked sample by sample, lays the film one whole walk would", () => {
    const points: Point[] = [];
    for (let d = 0; d <= 600; d += 3) {
      points.push({ x: 30 + d * 0.9, y: 150 + 70 * Math.sin(d / 55) });
    }
    for (const [flatness, angle, load, press] of [
      [0, 0, 1, 1],
      [1, -Math.PI / 4, 0.7, 1],
      // …and a head leaned on, whose band is wider than the one the walk
      // settles its touches inside: the pressure is in the head's own
      // footprint, so every reach the live walk measures has to have grown
      // with it (see `movingTail`).
      [0, 0, 1, 1.8],
    ] as const) {
      const spec = {
        x: 0,
        y: 0,
        width: 640,
        height: 320,
        cell: 1,
        ground: sheet("cold"),
        wick: 0.45,
      };
      const whole = createBristleField(spec);
      drag(whole, points, SIZE, flatness, angle, 1, load, 1, press);

      const grown = createBristleField(spec);
      const state = openDrag(
        grown,
        SIZE,
        flatness,
        angle,
        1,
        load,
        markSeed(points),
        press,
      );
      for (let n = 1; n <= points.length; n += 3) {
        advanceDrag(state, points.slice(0, n));
      }
      if (state.points.length !== points.length) {
        advanceDrag(state, points.slice());
      }

      const a = painted(whole);
      const b = painted(grown);
      let worst = 0;
      for (let i = 0; i < a.length; i++) {
        worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
      }
      expect(worst).toBeLessThan(0.001);
    }
  });

  it("keeps the leaving hairs on the tail, and settles as the end moves on", () => {
    const points = run(700, 3);
    const state = openDrag(
      fieldOver(800, 200),
      SIZE,
      0,
      0,
      1,
      1,
      markSeed(points),
    );
    advanceDrag(state, points.slice(0, 100));
    // The lift's raggedness rides the provisional tail: it is in the undo
    // log, never in the settled film, so the next advance takes it back out
    // and the walk settles further in.
    expect(state.undo.length).toBeGreaterThan(0);
    const settled = state.settled;
    advanceDrag(state, points.slice(0, 130));
    expect(state.undo.length).toBeGreaterThan(0);
    expect(state.settled).toBeGreaterThan(settled);
  });
});

// --- What a repaint costs ----------------------------------------------------

let dom: ReturnType<typeof withFakeDocument>;
let ctx: FakeContext;

beforeEach(() => {
  forgetDriedPaint();
  dom = withFakeDocument();
  ctx = createFakeContext();
});

afterEach(() => {
  dom.restore();
  vi.unstubAllGlobals();
});

/** How many simulations have actually been flushed to pixels — a blit of a
 *  held mark writes no image data, so this is the bill. */
function flushes(): number {
  return dom.created.reduce(
    (count, canvas) => count + (canvas.ctx.calls.putImageData ?? 0),
    0,
  );
}

describe("the dried-mark store", () => {
  it("works a landed mark out once and blits it thereafter", () => {
    const points = run(300, 3);
    expect(paintSimulatedPaint(ctx, points, SIZE)).toBe(true);
    const cost = flushes();
    expect(cost).toBeGreaterThan(0);
    expect(paintSimulatedPaint(ctx, points, SIZE)).toBe(true);
    expect(paintSimulatedPaint(ctx, points, SIZE)).toBe(true);
    expect(flushes()).toBe(cost);
  });

  it("dries the same path again when the head or the ink changes", () => {
    const points = run(300, 3);
    paintSimulatedPaint(ctx, points, SIZE);
    const one = flushes();
    paintSimulatedPaint(ctx, points, SIZE, 1, 0.55);
    const two = flushes();
    expect(two).toBeGreaterThan(one);
    paintSimulatedPaint(
      ctx,
      points,
      SIZE,
      1,
      0,
      0,
      1,
      1,
      SOLID_GROUND,
      "#aa2200",
    );
    const three = flushes();
    expect(three).toBeGreaterThan(two);
    // …the hand included: the pressure decides the width of the band and half
    // the texture in it, so a mark asked for at another one may not be blitted
    // from this one (see `Ask` in `bristleStore.ts`).
    paintSimulatedPaint(
      ctx,
      points,
      SIZE,
      1,
      0,
      0,
      1,
      1,
      SOLID_GROUND,
      "#aa2200",
      "#ffffff",
      1.6,
    );
    expect(flushes()).toBeGreaterThan(three);
  });

  it("promotes the gesture in hand at the lift instead of walking it again", () => {
    const points = run(600, 3);
    // The gesture grows live…
    for (let n = 4; n <= points.length; n += 4) {
      paintBristle(ctx, points.slice(0, n), SIZE, { live: true });
    }
    const live = flushes();
    expect(live).toBeGreaterThan(0);
    // …and the landed ask for the finished path is a promotion, not a second
    // walk: at most one small patch for the tail the last live frame had not
    // seen yet, never the whole mark again.
    const landed = points.slice();
    expect(paintSimulatedPaint(ctx, landed, SIZE)).toBe(true);
    const lifted = flushes();
    expect(lifted).toBeLessThanOrEqual(live + 1);
    // A later repaint of the landed mark is a blit of the promoted pixels.
    expect(paintSimulatedPaint(ctx, landed, SIZE)).toBe(true);
    expect(flushes()).toBe(lifted);
  });
});

describe("the fall-through", () => {
  it("hands a landed mark no field can draw to the vector painter", () => {
    dom.restore();
    vi.unstubAllGlobals();
    const bare = createFakeContext();
    paintBristle(bare, run(120, 3), SIZE, { load: 0.6 });
    // The hairs were stroked…
    expect(bare.calls.stroke ?? 0).toBeGreaterThan(0);
    // …and the borrowed alpha was put back.
    expect(bare.globalAlpha).toBe(1);
  });

  it("draws a live gesture it cannot field as a plain line, not stale hairs", () => {
    dom.restore();
    vi.unstubAllGlobals();
    const bare = createFakeContext();
    paintBristle(bare, run(120, 3), SIZE, { live: true });
    // One path, not a head of them: the vector painter's texture is fitted
    // to the whole mark, which is exactly what a growing gesture repainted a
    // patch at a time cannot use (see `PaintPlugin.grows`).
    expect(bare.calls.stroke ?? 0).toBe(1);
    expect(bare.globalAlpha).toBe(1);
  });

  it("never opens a field for a hairline", () => {
    expect(paintSimulatedPaint(ctx, run(120, 3), SIZE, 0.01)).toBe(false);
    expect(paintSimulatedPaint(ctx, run(120, 3), 1)).toBe(false);
  });
});
