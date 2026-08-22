// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { dropperBehaviour } from "../src/app/plugins/builtin/dropper.ts";
import { SAMPLE } from "../src/app/plugins/builtin/dials.ts";
import { pluginById, resetPlugins } from "../src/app/plugins/registry.ts";
import { averageAt } from "../src/app/probe.ts";
import type { CanvasProbe, ToolContext } from "../src/app/plugins/types.ts";
import { mm } from "../src/app/units.ts";

// What a press with the dropper reads off the page, and how much of the page it
// reads. The sample size is the tool's own dial, so the *canvas* never learns
// its name — it asks the behaviour (`ToolBehaviour.pick`), which is pure over
// the probe and needs no DOM at all.

/** A page that reports what it was asked for, so the assertions can be about
 *  the question rather than about any particular colour. */
function watching(): { probe: CanvasProbe; asked: (number | undefined)[] } {
  const asked: (number | undefined)[] = [];
  return {
    asked,
    probe: {
      colorAt: (_p, radius) => {
        asked.push(radius);
        return "#123456";
      },
      regionAt: () => null,
      matchAt: () => null,
    },
  };
}

const ctx: ToolContext = {
  color: null,
  size: 8,
  dials: {},
  filled: false,
  background: "#ffffff",
};

describe("the colour dropper", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("reads the single pixel under the pointer until it is told otherwise", () => {
    const page = watching();
    const read = dropperBehaviour.pick?.(
      { x: 5, y: 5 },
      {
        ...ctx,
        probe: page.probe,
      },
    );
    expect(read).toBe("#123456");
    // Zero, not undefined: the point *is* the rest of this dial, and the probe
    // takes it as "the one pixel".
    expect(page.asked).toEqual([0]);
  });

  it("averages a disc when the sample size is turned up", () => {
    const page = watching();
    dropperBehaviour.pick?.(
      { x: 5, y: 5 },
      {
        ...ctx,
        dials: { sample: mm(1) },
        probe: page.probe,
      },
    );
    expect(page.asked).toEqual([mm(1)]);
  });

  it("reads nothing without a page, and pins nothing", () => {
    expect(dropperBehaviour.pick?.({ x: 5, y: 5 }, ctx)).toBeNull();
  });

  it("leaves no mark whatever it is set to", () => {
    // The whole tool: a sampled colour is a change to the toolbar, not a mark
    // on the page, so nothing may reach the document or the undo history.
    const page = watching();
    expect(
      dropperBehaviour.start({ x: 1, y: 1 }, { ...ctx, probe: page.probe }),
    ).toBeNull();
  });

  it("declares the sample size as its one dial", () => {
    const dropper = pluginById("dropper")!;
    expect(dropper.dials).toEqual([SAMPLE]);
    // Pressed rather than dragged, and resting on the point — which has to
    // agree with what the behaviour above falls back to.
    expect(SAMPLE.choices?.[0]?.value).toBe(0);
    expect(SAMPLE.default).toBe(0);
  });
});

// --- The averaging itself ----------------------------------------------------
// The one part of a sample that isn't in the behaviour: reading the disc off a
// rasterised page (see `src/app/probe.ts`). The rasterising needs a browser; the
// arithmetic does not, so it is exercised here on a hand-built buffer.

/** A snapshot from an ASCII picture: `.` is white, `#` is black, `r` is red. */
function shot(rows: string[]) {
  const height = rows.length;
  const width = rows[0]!.length;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const inks: Record<string, [number, number, number]> = {
    ".": [255, 255, 255],
    "#": [0, 0, 0],
    r: [255, 0, 0],
  };
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const [red, green, blue] = inks[cell] ?? [0, 0, 0];
      const i = (y * width + x) * 4;
      pixels[i] = red!;
      pixels[i + 1] = green!;
      pixels[i + 2] = blue!;
      pixels[i + 3] = 255;
    });
  });
  return { pixels, width, height, scale: 1 };
}

describe("averageAt", () => {
  it("reads nothing when the disc covers no whole pixel", () => {
    // Under one pixel of radius there is nothing to average, and the caller
    // falls back to the single pixel under the pointer.
    expect(averageAt(shot(["..", ".."]), 0, 0, 0.4)).toBeNull();
  });

  it("averages what is inside the disc and nothing outside it", () => {
    // A black speck on white, sampled wide enough to take in the whole 3×3
    // block: the corners fall outside the disc, so five pixels are averaged —
    // one black and four white — and the answer is a pale grey rather than
    // either colour that is actually there. That is the point of the setting.
    const page = shot(["...", ".#.", "..."]);
    expect(averageAt(page, 1, 1, 1)).toBe("#cccccc");
  });

  it("keeps to the page at its edge", () => {
    // A disc hanging off the corner averages the part of it that is on the
    // page, rather than reading off the end of the buffer.
    const page = shot(["r.", ".."]);
    expect(averageAt(page, 0, 0, 1)).toBe("#ffaaaa");
  });
});
