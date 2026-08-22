// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  FILL_GROUP_ID,
  GRADIENT_FROM,
  GRADIENT_MID,
  GRADIENT_SWATCHES,
  GRADIENT_TO,
  GRADIENT_TOOL_ID,
  gradientBehaviour,
} from "../src/app/plugins/builtin/gradient.ts";
import {
  groupMembers,
  pluginById,
  resetPlugins,
  toolbarEntries,
} from "../src/app/plugins/registry.ts";
import {
  hasPicked,
  inkOf,
  pickedSwatches,
  resolveSwatches,
} from "../src/app/plugins/swatches.ts";
import type { CanvasProbe, ToolContext } from "../src/app/plugins/types.ts";
import { translateStroke } from "../src/app/selection.ts";
import type { Point } from "../src/app/types.ts";

// The gradient is the bucket poured: the same press, the same flood, the same
// `region` stroke — inked with a ramp instead of one flat colour. A behaviour is
// pure over its probe, so the whole gesture runs here with no canvas.

/** A page with one square area on it, whatever is pressed. Stands in for the
 *  canvas's raster (see `CanvasProbe`). */
const page: CanvasProbe = {
  colorAt: () => "#ffffff",
  regionAt: () => [
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ],
  ],
  matchAt: () => null,
};

const ctx: ToolContext = {
  color: "#ef4444",
  size: 8,
  dials: {},
  filled: false,
  background: "#ffffff",
  probe: page,
};

/** Drive a whole gesture: press at `from`, drag to `to`, lift. */
function pour(from: Point, to: Point, over: Partial<ToolContext> = {}) {
  const full = { ...ctx, ...over };
  const begun = gradientBehaviour.start(from, full);
  if (!begun) return null;
  const dragged = gradientBehaviour.move(begun, to, full);
  return gradientBehaviour.end?.(dragged, full) ?? dragged;
}

/** The ramp on a poured mark, for the assertions below. */
function ramp(draft: { shape: { kind: string } } | null) {
  const shape = draft?.shape as
    | {
        kind: "region";
        gradient?: { from: Point; to: Point; stops: unknown[] };
      }
    | undefined;
  return shape?.kind === "region" ? shape.gradient : undefined;
}

describe("the gradient tool", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("floods the area under the press and runs the ramp along the drag", () => {
    const poured = pour({ x: 10, y: 10 }, { x: 90, y: 50 });
    expect(poured?.shape.kind).toBe("region");
    // The area is the bucket's — the outline the probe traced under the press.
    expect(
      poured?.shape.kind === "region" ? poured.shape.contours[0]?.length : 0,
    ).toBe(4);
    // …and the run is the gesture: where it started, where it let go.
    expect(ramp(poured)?.from).toEqual({ x: 10, y: 10 });
    expect(ramp(poured)?.to).toEqual({ x: 90, y: 50 });
  });

  it("does not re-aim the area mid-drag the way the bucket does", () => {
    // The bucket recomputes its fill from wherever the pointer is now, because
    // dragging it means "I meant that area instead". Dragging a gradient means
    // "run the colour this way", so the area has to stay where the press put
    // it — re-flooding would move the ground out from under the ramp.
    let asked = 0;
    const counting: CanvasProbe = {
      colorAt: () => "#ffffff",
      regionAt: (p) => {
        asked++;
        return page.regionAt(p);
      },
      matchAt: (p) => page.matchAt(p),
    };
    pour({ x: 10, y: 10 }, { x: 90, y: 50 }, { probe: counting });
    expect(asked).toBe(1);
  });

  it("pours the tool's own inks, not the toolbar's", () => {
    const poured = pour(
      { x: 10, y: 10 },
      { x: 90, y: 50 },
      { colors: { from: "#3b82f6", to: "#22c55e" } },
    );
    // No `color` on the mark at all: what inks it is the ramp, and every colour
    // in the ramp is recorded there.
    expect(poured?.color).toBeUndefined();
    expect(ramp(poured)?.stops).toEqual([
      { at: 0, color: "#3b82f6" },
      { at: 1, color: "#22c55e" },
    ]);
  });

  it("adds the middle colour only when there is one", () => {
    const plain = pour({ x: 10, y: 10 }, { x: 90, y: 50 });
    expect(ramp(plain)?.stops).toHaveLength(2);

    const three = pour(
      { x: 10, y: 10 },
      { x: 90, y: 50 },
      { colors: { mid: "#f59e0b" } },
    );
    expect(ramp(three)?.stops).toEqual([
      { at: 0, color: "#111827" },
      { at: 0.5, color: "#f59e0b" },
      { at: 1, color: "#ffffff" },
    ]);
  });

  it("still fills when the press never travelled", () => {
    // A tap is a fair way to use it — "fill that with a gradient, I don't much
    // mind which way" — and a ramp with no length would paint nothing at all,
    // so the run is laid across the area instead.
    const tapped = pour({ x: 10, y: 10 }, { x: 10, y: 10 });
    const run = ramp(tapped);
    expect(run?.from.x).toBe(0);
    expect(run?.to.x).toBe(100);
    expect(run?.from.y).toBe(30);
  });

  it("begins nothing without a page to read", () => {
    // The bucket's rule: no probe (a headless caller, a browser that refused
    // the pixels) means no fill rather than a wrong one.
    expect(
      gradientBehaviour.start({ x: 1, y: 1 }, { ...ctx, probe: null }),
    ).toBeNull();
  });

  it("carries the ramp with the marks when they are moved", () => {
    const poured = pour({ x: 10, y: 10 }, { x: 90, y: 50 })!;
    const moved = translateStroke({ ...poured, id: "a" }, 5, 7);
    const run = ramp(moved);
    // Both ends travel: a ramp left where it was would slide its colours across
    // the area on every move.
    expect(run?.from).toEqual({ x: 15, y: 17 });
    expect(run?.to).toEqual({ x: 95, y: 57 });
  });
});

describe("the fill family", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("puts the bucket and the gradient behind one button", () => {
    expect(groupMembers(FILL_GROUP_ID).map((p) => p.id)).toEqual([
      "filler",
      GRADIENT_TOOL_ID,
    ]);
  });

  it("keeps the tool's id on a fill that was dragged, not only on a tapped one", () => {
    // The bucket rebuilds its draft from scratch on every move — that is how
    // dragging re-aims it — and the id the canvas stamped onto the draft has to
    // survive that. It didn't: a dragged fill was filed under no tool at all,
    // and the renderer painted it through its unknown-tool fallback, quietly
    // dropping the feathered edge.
    const bucket = pluginById("filler")!.behaviour;
    const begun = { ...bucket.start({ x: 10, y: 10 }, ctx)!, tool: "filler" };
    expect(bucket.move(begun, { x: 40, y: 30 }, ctx).tool).toBe("filler");
  });

  it("keeps the bucket's own id as the family's, so an old blob keeps it", () => {
    // A settings blob written before the gradient existed has `filler` in its
    // enabled list and its toolbar order. The group takes that id, so such an
    // install finds the pair where its bucket was rather than losing the button.
    expect(FILL_GROUP_ID).toBe("filler");
    const entries = toolbarEntries(["filler"]);
    const fills = entries.find((e) => e.id === "filler");
    expect(fills?.kind).toBe("group");
  });
});

describe("tool swatches", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("is declared on the descriptor, and only by the gradient", () => {
    expect(pluginById(GRADIENT_TOOL_ID)?.swatches).toEqual(GRADIENT_SWATCHES);
    expect(pluginById("filler")?.swatches).toBeUndefined();
  });

  it("resolves to what the tool ships with until something is picked", () => {
    const plugin = pluginById(GRADIENT_TOOL_ID);
    expect(resolveSwatches(plugin, undefined)).toEqual({
      from: "#111827",
      mid: "",
      to: "#ffffff",
    });
    // …and nothing is *held*, so a fresh install writes no colours at all.
    expect(pickedSwatches(plugin, undefined)).toEqual({});
    expect(hasPicked(plugin, undefined)).toBe(false);
  });

  it("holds only what differs from the tool as it ships", () => {
    const plugin = pluginById(GRADIENT_TOOL_ID);
    const stored = { from: "#111827", to: "#3b82f6" };
    expect(pickedSwatches(plugin, stored)).toEqual({ to: "#3b82f6" });
    expect(hasPicked(plugin, stored)).toBe(true);
  });

  it("keeps 'off' as a value for a swatch that may be absent", () => {
    const plugin = pluginById(GRADIENT_TOOL_ID);
    // The middle stop rests off, so switching it off is not a difference…
    expect(resolveSwatches(plugin, { mid: "" }).mid).toBe("");
    expect(pickedSwatches(plugin, { mid: "" })).toEqual({});
    // …and a colour on it is.
    expect(pickedSwatches(plugin, { mid: "#f59e0b" })).toEqual({
      mid: "#f59e0b",
    });
  });

  it("falls back to the rest colour for anything unreadable", () => {
    const plugin = pluginById(GRADIENT_TOOL_ID);
    const stored = { from: "not a colour", to: "#22c55e" } as Record<
      string,
      string
    >;
    expect(resolveSwatches(plugin, stored).from).toBe("#111827");
  });

  it("hands a behaviour its own inks, or the ones it was built with", () => {
    expect(inkOf(ctx, GRADIENT_FROM)).toBe("#111827");
    expect(inkOf({ ...ctx, colors: { from: "#ef4444" } }, GRADIENT_FROM)).toBe(
      "#ef4444",
    );
    // An absent colour is `null` rather than an empty string: the tool asks
    // "have I got a middle stop?", not "what is it".
    expect(inkOf(ctx, GRADIENT_MID)).toBeNull();
    expect(inkOf({ ...ctx, colors: { mid: "" } }, GRADIENT_MID)).toBeNull();
    expect(inkOf(ctx, GRADIENT_TO)).toBe("#ffffff");
  });
});
