// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { freehandBehaviour } from "../src/app/plugins/builtin/freehand.ts";
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

  it("gives no tool more than two dials, bar the media that have more", () => {
    // The size panel is opened mid-drawing, with one thumb. A third slider is
    // a settings screen — so the bar for one is that it changes what the mark
    // *is* rather than restyling what another dial already did.
    //
    // The exceptions are named here rather than waved through by a raised
    // limit. A head of hair is loaded or dry, dipped with much or little
    // paint, milled fine or coarse, new or worn open, and on paper that wicks
    // or paper that does not, and no one of those five is any of the others; a
    // wash is water, pigment and what the sheet does with what is left; a
    // dipped pen is how much page shows, which way the flat is turned, and how
    // much ink the dip took — the reservoir the whole ink simulation spends
    // (see `quillSim.ts`). A tool turning up on this list that is not one of
    // these four is a tool that has grown a settings screen.
    const over = allPlugins().filter((p) => (p.dials?.length ?? 0) > 2);
    expect(over.map((p) => p.id)).toEqual([
      "paintbrush",
      "flatbrush",
      "watercolor",
      "calligraphy",
    ]);
  });

  it("keeps even those inside a panel you can still use with a thumb", () => {
    for (const id of ["paintbrush", "flatbrush", "watercolor", "calligraphy"]) {
      expect(pluginById(id)!.dials!.length).toBeLessThanOrEqual(6);
    }
  });

  it("offers dials only on tools that touch the page at all", () => {
    // A dial changes what a press *does*. Every tool that leaves a mark can
    // have one, and so can the one that reads the page rather than marking it
    // — the dropper's sample size is exactly this kind of setting. The hand and
    // the marquee change nothing about the page either way, and neither has
    // one.
    const touchesPage = (id: string) => {
      const p = pluginById(id)!;
      return !p.navigates && !p.selects;
    };
    for (const p of toolPlugins()) {
      if ((p.dials?.length ?? 0) > 0) expect(touchesPage(p.id)).toBe(true);
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
    const hair = brush.dials!.find((d) => d.id === "hair")!;
    expect(dialReadout(hair, 1.35)).toBe("135");
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
