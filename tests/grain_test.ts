// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { driftNoise, driftWalk } from "../src/app/plugins/grain.ts";

// The grain is what every textured painter is built out of, and the one thing
// it must never do is give a different answer for the same place: a mark is
// repainted on every pan, every undo and every export, and a texture that
// wandered would shimmer. So the walk that reads it cheaply has to agree with
// the function it stands in for, exactly.

describe("driftWalk", () => {
  it("answers exactly what driftNoise answers", () => {
    const walk = driftWalk();
    walk.reset(91);
    for (let t = 0; t < 40; t += 0.13) {
      expect(walk.at(t)).toBe(driftNoise(t, 91));
    }
  });

  it("keeps agreeing after it has been pointed somewhere else", () => {
    const walk = driftWalk();
    walk.reset(4);
    walk.at(12.5);
    walk.reset(7);
    // A fresh run starts over at the beginning of the path, so the walk has to
    // let go of the cell the last one left it in.
    expect(walk.at(0.25)).toBe(driftNoise(0.25, 7));
    expect(walk.at(3.75)).toBe(driftNoise(3.75, 7));
  });

  it("agrees when it is asked to go backwards", () => {
    // Jumping about costs it a rehash rather than a wrong answer.
    const walk = driftWalk();
    walk.reset(23);
    expect(walk.at(9.6)).toBe(driftNoise(9.6, 23));
    expect(walk.at(1.2)).toBe(driftNoise(1.2, 23));
    expect(walk.at(9.6)).toBe(driftNoise(9.6, 23));
  });
});
