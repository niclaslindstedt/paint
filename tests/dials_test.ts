// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { freehandBehaviour } from "../src/app/plugins/builtin/freehand.ts";
import { applyInk } from "../src/app/plugins/ink.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  dialChoice,
  dialReadout,
  extraDials,
  hasTuning,
  resolveDials,
  strokeDial,
  tunedDials,
} from "../src/app/plugins/dials.ts";
import { mm } from "../src/app/units.ts";
import {
  allPlugins,
  pluginById,
  registerPlugin,
  resetPlugins,
  toolPlugins,
} from "../src/app/plugins/registry.ts";
import type { ToolContext, ToolDial } from "../src/app/plugins/types.ts";
import type { Stroke } from "../src/app/types.ts";

// Dials are the second half of the plugin seam: a tool declares what it has to
// tune and the panel renders it, so what has to hold is the *arithmetic*
// underneath — which values reach a stroke, which ones don't, and that a mark
// drawn without touching anything is the mark the app always drew.
//
// That last one is the load-bearing property. It is why a dial costs a document
// nothing and why every painter can keep its own default argument: a dial left
// alone is absent everywhere, from the settings blob to the stroke.

const DIAL: ToolDial = {
  id: "wobble",
  nameKey: "dials.opacity.name",
  hintKey: "dials.opacity.hint",
  min: 0.5,
  max: 2,
  step: 0.1,
};

function plugin(dials: ToolDial[]) {
  registerPlugin({
    id: "test",
    core: true,
    nameKey: "tools.pencil.name",
    descriptionKey: "tools.pencil.description",
    icon: () => null,
    dials,
    behaviour: freehandBehaviour(),
  });
  return pluginById("test");
}

describe("resolving dials", () => {
  beforeEach(() => resetPlugins());

  it("fills every dial the tool offers, for the panel", () => {
    expect(resolveDials(plugin([DIAL]), undefined)).toEqual({ wobble: 1 });
    expect(resolveDials(plugin([DIAL]), { wobble: 1.4 })).toEqual({
      wobble: 1.4,
    });
  });

  it("hands on only what has been moved, for the mark", () => {
    expect(tunedDials(plugin([DIAL]), { wobble: 1 })).toEqual({});
    expect(tunedDials(plugin([DIAL]), { wobble: 1.4 })).toEqual({
      wobble: 1.4,
    });
  });

  it("pulls a stored value back into the dial's own range", () => {
    // A blob from another build, or a hand-edited one: a slider can't recover
    // from a value off its track.
    expect(resolveDials(plugin([DIAL]), { wobble: 9 })).toEqual({ wobble: 2 });
    expect(resolveDials(plugin([DIAL]), { wobble: -3 })).toEqual({
      wobble: 0.5,
    });
  });

  it("falls back to the default for a value that isn't a number", () => {
    const stored = { wobble: "loud" } as unknown as Record<string, number>;
    expect(resolveDials(plugin([DIAL]), stored)).toEqual({ wobble: 1 });
    expect(tunedDials(plugin([DIAL]), stored)).toEqual({});
  });

  it("ignores a stored dial the tool doesn't offer", () => {
    // Kept in the blob (a downgrade shouldn't forget it) but never handed to a
    // painter that has nothing to do with it.
    expect(tunedDials(plugin([DIAL]), { ghost: 0.2 })).toEqual({});
  });

  it("says a tool has nothing to tune rather than guessing", () => {
    expect(resolveDials(plugin([]), { wobble: 2 })).toEqual({});
    expect(resolveDials(undefined, { wobble: 2 })).toEqual({});
    expect(hasTuning(plugin([DIAL]), { wobble: 1 })).toBe(false);
    expect(hasTuning(plugin([DIAL]), { wobble: 1.1 })).toBe(true);
  });

  it("honours a dial whose rest is somewhere other than 1", () => {
    const feather = { ...DIAL, id: "feather", min: 0, max: 40, default: 0 };
    expect(resolveDials(plugin([feather]), undefined)).toEqual({ feather: 0 });
    expect(tunedDials(plugin([feather]), { feather: 0 })).toEqual({});
    expect(tunedDials(plugin([feather]), { feather: 12 })).toEqual({
      feather: 12,
    });
  });
});

describe("reading a dial off a mark", () => {
  it("falls back to the painter's own rest value when it wasn't recorded", () => {
    const bare = {
      id: "a",
      tool: "crayon",
      size: 4,
      shape: { kind: "path", points: [] },
    } as Stroke;
    expect(strokeDial(bare, "pressure")).toBe(1);
    expect(strokeDial(bare, "feather", 0)).toBe(0);
    expect(strokeDial({ ...bare, dials: { pressure: 1.4 } }, "pressure")).toBe(
      1.4,
    );
  });
});

describe("what a stroke carries", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  const ctx = (dials: Record<string, number>): ToolContext => ({
    color: "#ef4444",
    size: 4,
    dials,
    filled: false,
    background: "#ffffff",
  });

  it("records nothing at all when no dial was moved", () => {
    const draft = freehandBehaviour({ style: "crayon" }).start(
      { x: 0, y: 0 },
      ctx({}),
    )!;
    expect(draft.dials).toBe(undefined);
    expect(draft.opacity).toBe(undefined);
  });

  it("multiplies the opacity dial into the tool's own ink", () => {
    // A highlighter turned to half is half of a *highlighter*, not half of an
    // opaque line.
    const draft = freehandBehaviour({ opacity: 0.35 }).start(
      { x: 0, y: 0 },
      ctx({ opacity: 0.5 }),
    )!;
    expect(draft.opacity).toBeCloseTo(0.175);
  });

  it("keeps opacity and hardness in their own fields, not under `dials`", () => {
    // Both predate dials and are read by code that runs for every plugin —
    // `applyInk` and `strokeHardness` — so a second copy would be a second
    // source of truth.
    const draft = freehandBehaviour({
      style: "brush",
      useHardness: true,
    }).start({ x: 0, y: 0 }, ctx({ hardness: 0.4, hair: 1.6 }))!;
    expect(draft.hardness).toBe(0.4);
    expect(draft.dials).toEqual({ hair: 1.6 });
    expect(extraDials({ opacity: 0.5, hardness: 0.4 })).toBe(undefined);
  });
});

describe("the shipped set", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("gives no tool more than two dials, bar the ones that have more", () => {
    // The size panel is opened mid-drawing, with one thumb. A third slider is
    // a settings screen — so the bar for one is that it changes what the mark
    // *is* rather than restyling what another dial already did.
    //
    // The exceptions are named here rather than waved through by a raised
    // limit. A head of hair is loaded or dry, dipped with much or little
    // paint, squeezed toward a blade or left round, and turned one way or the
    // other when it is a blade, and no one of those four is any of the
    // others; a wash is water, pigment and what the sheet does with what is
    // left; and a felt tip is a *nib*, which takes how chiselled it is and
    // which way that chisel is turned before it takes anything else — on a
    // wedge the angle decides which direction comes out broad and which comes
    // out a hairline, which is not a restyling of the chisel dial but the other
    // half of the same nib. A tool turning up on this list that is not one of
    // these four is a tool that has grown a settings screen.
    const over = allPlugins().filter((p) => (p.dials?.length ?? 0) > 2);
    expect(over.map((p) => p.id)).toEqual([
      "paintbrush",
      "watercolor",
      "marker",
      "highlighter",
    ]);
  });

  it("keeps even those inside a panel you can still use with a thumb", () => {
    for (const id of ["graphite", "watercolor", "calligraphy"]) {
      expect(pluginById(id)!.dials!.length).toBeLessThanOrEqual(4);
    }
    // The paintbrush carries one more than any of them, and the extra one is
    // not a fifth thing about the brush: four of them say which head is in
    // your hand — how wet and gathered, how charged, how squeezed toward a
    // blade, and turned which way — and the last says how hard you are
    // bearing on it (see `BEARING` in `plugins/builtin/dials.ts`). It is the
    // axis a round brush is *bought* for, it is the one control here a stylus
    // will one day move for you mid-stroke, and it cannot be folded into any
    // of the other four: a pressed #6 is a wider mark that behaves worse,
    // where a #10 is simply a bigger brush.
    expect(pluginById("paintbrush")!.dials!.length).toBeLessThanOrEqual(5);
  });

  it("gives the simulated media no opacity", () => {
    // Every one of these works its mark out from a physical model and already
    // carries the dial that lightens it the way the medium does — the hand on
    // the pencil and the crayon, the pigment in the water, the dip on the
    // brush and the nib. A flat alpha over the finished mark fades the paper
    // back out of it, which is the one thing the simulation is there to put
    // in, so the panel offers the medium's own control and not both.
    for (const id of [
      "graphite",
      "paintbrush",
      "watercolor",
      "crayon",
      "calligraphy",
    ]) {
      const dials = pluginById(id)!.dials!;
      expect(dials.map((d) => d.id)).not.toContain("opacity");
      expect(dials.length).toBeGreaterThan(0);
    }
  });

  it("still paints a mark that already carries one", () => {
    // The dial went; the field did not. `Stroke.opacity` is read by every
    // painter exactly as it was, so a wash laid down at 55% before the panel
    // lost the slider still paints at 55% — a document does not change because
    // a tool did.
    const stroke: Stroke = {
      id: "s",
      tool: "watercolor",
      size: 10,
      opacity: 0.55,
      shape: { kind: "path", points: [{ x: 0, y: 0 }] },
    };
    const context = { globalAlpha: 1 } as CanvasRenderingContext2D;
    applyInk(context, stroke);
    expect(context.globalAlpha).toBe(0.55);
  });

  it("offers dials only on tools whose press does something to tune", () => {
    // A dial changes what a press *does*. Every tool that leaves a mark can
    // have one, so can the one that reads the page rather than marking it —
    // the dropper's sample size is exactly this kind of setting — and so can
    // the selection pencil, whose press chooses an area the nib's width and
    // fades a Delete by its feather.
    //
    // A marquee with no nib is the one case worth pinning down. Most of them
    // drag out a shape and there is nothing about that to tune, so they carry
    // nothing; the one that *reads the page* — the colour match — is tuned by
    // how far a colour may drift and still be chosen, which is a property of
    // the reading rather than of a nib. So a nibless selection tool may have
    // dials, and every one it has must be that kind.
    const READS_THE_PAGE = new Set(["tolerance"]);
    for (const p of toolPlugins()) {
      const dials = p.dials ?? [];
      if (dials.length === 0) continue;
      expect(p.navigates ?? false).toBe(false);
      if (p.selects && p.sizeless) {
        expect(dials.every((d) => READS_THE_PAGE.has(d.id))).toBe(true);
      }
    }
  });

  it("keeps every dial's rest inside its own range", () => {
    for (const p of allPlugins()) {
      for (const dial of p.dials ?? []) {
        const rest = dial.default ?? 1;
        expect(rest).toBeGreaterThanOrEqual(dial.min);
        expect(rest).toBeLessThanOrEqual(dial.max);
        expect(dial.max).toBeGreaterThan(dial.min);
      }
    }
  });

  it("reads a fraction out as a percentage and a distance in millimetres", () => {
    const brush = pluginById("paintbrush")!;
    const load = brush.dials!.find((d) => d.id === "load")!;
    expect(dialReadout(load, 1.35)).toBe("135");
    // The bucket's feather is the one dial that measures the page, and the
    // page is measured in millimetres now — the number on the stroke is still
    // document pixels, the readout is what changed.
    const feather = pluginById("filler")!.dials!.find(
      (d) => d.id === "feather",
    )!;
    expect(dialReadout(feather, mm(12))).toBe("12");
  });

  it("reads a tilt out as the degrees it is, sign and all", () => {
    // The nib angle is neither a fraction of anything nor a distance on the
    // page — showing −45° as −4500% would be nonsense.
    const angle = pluginById("calligraphy")!.dials!.find(
      (d) => d.id === "angle",
    )!;
    expect(dialReadout(angle, -45)).toBe("-45");
    expect(dialReadout(angle, 30)).toBe("30");
  });

  it("reads a graded dial out by the trade's own name for the value", () => {
    // A pencil is not 62% of an HB, it is a 3H — and there is nothing between
    // a 2B and a 3B, so the panel offers the ladder as chips rather than as a
    // slider to hunt along (see `ToolDial.choices`).
    const grade = pluginById("graphite")!.dials!.find((d) => d.id === "grade")!;
    expect(grade.choices?.map((c) => c.label)).toContain("HB");
    expect(dialReadout(grade, 1)).toBe("HB");
    expect(dialReadout(grade, 1.5)).toBe("4B");
    // A value from another build lands on the nearest grade rather than
    // between two of them.
    expect(dialReadout(grade, 1.47)).toBe("4B");
    // …and the stored number is still what it always was: how much darker than
    // an HB this lead lays down. That is what keeps every pencil line already
    // drawn drawing exactly as it did.
    expect(dialChoice(grade, 1.25)?.value).toBe(1.25);
  });
});
