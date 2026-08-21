// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  selectDrawBehaviour,
  SELECT_ERASE_MODE,
} from "../src/app/plugins/builtin/select.ts";
import {
  eraseRegionStroke,
  ERASE_REGION_TOOL_ID,
} from "../src/app/plugins/builtin/eraseRegion.ts";
import type { ToolContext } from "../src/app/plugins/types.ts";
import { regionHolds } from "../src/app/selection.ts";
import type { Point } from "../src/app/types.ts";

// The selection pencil: a pure behaviour like every other tool's, so a whole
// gesture — press, drag, lift, "what did this choose?" — drives here with no
// canvas. What is different from its siblings is the answer's arithmetic: the
// stroke's capsule combined with the selection as it stands, which is why the
// context (and its `selection`) appears in these tests where the marquees'
// never need one.

const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  color: null,
  size: 10,
  dials: {},
  filled: false,
  background: "#ffffff",
  ...over,
});

/** Drive one whole gesture and ask what it chose. */
function drawn(
  points: readonly Point[],
  context: ToolContext,
): Point[][] | null {
  let draft = selectDrawBehaviour.start(points[0]!, context)!;
  for (const p of points.slice(1)) {
    draft = selectDrawBehaviour.move(draft, p, context);
  }
  const committed = selectDrawBehaviour.end!(draft, context)!;
  return selectDrawBehaviour.selection!(committed, context);
}

describe("selectDrawBehaviour", () => {
  it("selects the stroke's own capsule", () => {
    const region = drawn(
      [
        { x: 20, y: 20 },
        { x: 60, y: 20 },
      ],
      ctx(),
    )!;
    expect(region).not.toBeNull();
    // Inside the capsule: along the path and within the nib's half-width.
    expect(regionHolds(region, { x: 40, y: 20 })).toBe(true);
    expect(regionHolds(region, { x: 40, y: 23 })).toBe(true);
    // …and not past it.
    expect(regionHolds(region, { x: 40, y: 30 })).toBe(false);
    expect(regionHolds(region, { x: 80, y: 20 })).toBe(false);
  });

  it("selects a dab for a tap — a pencil pressed to the page leaves a dot", () => {
    const region = drawn([{ x: 30, y: 30 }], ctx())!;
    expect(region).not.toBeNull();
    expect(regionHolds(region, { x: 30, y: 30 })).toBe(true);
    expect(regionHolds(region, { x: 30, y: 40 })).toBe(false);
  });

  it("adds each stroke to the selection as it stands", () => {
    const first = drawn(
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
      ],
      ctx(),
    )!;
    const both = drawn(
      [
        { x: 10, y: 40 },
        { x: 30, y: 40 },
      ],
      ctx({ selection: first }),
    )!;
    expect(regionHolds(both, { x: 20, y: 10 })).toBe(true);
    expect(regionHolds(both, { x: 20, y: 40 })).toBe(true);
    expect(regionHolds(both, { x: 20, y: 25 })).toBe(false);
  });

  it("erases from the selection under its erase mode", () => {
    const base = drawn(
      [
        { x: 0, y: 20 },
        { x: 60, y: 20 },
      ],
      ctx({ size: 20 }),
    )!;
    const bitten = drawn(
      [
        { x: 30, y: 5 },
        { x: 30, y: 35 },
      ],
      ctx({ size: 12, dials: { mode: SELECT_ERASE_MODE }, selection: base }),
    )!;
    expect(regionHolds(bitten, { x: 5, y: 20 })).toBe(true);
    expect(regionHolds(bitten, { x: 55, y: 20 })).toBe(true);
    expect(regionHolds(bitten, { x: 30, y: 20 })).toBe(false);
  });

  it("reads a held modifier as the other verb — Ctrl flips whichever chip is down", () => {
    const base = drawn(
      [
        { x: 0, y: 20 },
        { x: 60, y: 20 },
      ],
      ctx({ size: 20 }),
    )!;
    // Chip on Add, Ctrl held: the stroke erases.
    const bitten = drawn(
      [
        { x: 30, y: 5 },
        { x: 30, y: 35 },
      ],
      ctx({ size: 12, modifier: true, selection: base }),
    )!;
    expect(regionHolds(bitten, { x: 30, y: 20 })).toBe(false);
    // Chip on Erase, Ctrl held: the stroke adds again.
    const added = drawn(
      [
        { x: 100, y: 20 },
        { x: 120, y: 20 },
      ],
      ctx({
        size: 12,
        modifier: true,
        dials: { mode: SELECT_ERASE_MODE },
        selection: base,
      }),
    )!;
    expect(regionHolds(added, { x: 110, y: 20 })).toBe(true);
  });

  it("stamps the verb on the draft at the press, so releasing Ctrl mid-drag changes nothing", () => {
    const base = drawn(
      [
        { x: 0, y: 20 },
        { x: 60, y: 20 },
      ],
      ctx({ size: 20 }),
    )!;
    // The press is held with Ctrl…
    let draft = selectDrawBehaviour.start(
      { x: 30, y: 5 },
      ctx({ size: 12, modifier: true, selection: base }),
    )!;
    expect(draft.dials?.mode).toBe(SELECT_ERASE_MODE);
    // …and the key comes up before the lift. The gesture stays an erase: the
    // verb rides the draft, not the keyboard.
    const after = ctx({ size: 12, selection: base });
    draft = selectDrawBehaviour.move(draft, { x: 30, y: 35 }, after);
    const region = selectDrawBehaviour.selection!(
      selectDrawBehaviour.end!(draft, after)!,
      after,
    )!;
    expect(regionHolds(region, { x: 30, y: 20 })).toBe(false);
  });

  it("answers null once an erase takes the last of the selection", () => {
    const base = drawn([{ x: 30, y: 30 }], ctx({ size: 8 }))!;
    expect(
      drawn(
        [
          { x: 30, y: 30 },
          { x: 30, y: 30.5 },
        ],
        ctx({ size: 60, dials: { mode: SELECT_ERASE_MODE }, selection: base }),
      ),
    ).toBeNull();
  });

  it("asked with no context, answers the stroke alone — what a caller with no selection to offer means", () => {
    const context = ctx();
    let draft = selectDrawBehaviour.start({ x: 10, y: 10 }, context)!;
    draft = selectDrawBehaviour.move(draft, { x: 30, y: 10 }, context);
    const region = selectDrawBehaviour.selection!(draft)!;
    expect(regionHolds(region, { x: 20, y: 10 })).toBe(true);
  });

  it("thins the pointer stream as it draws, the lasso's way", () => {
    const context = ctx();
    let draft = selectDrawBehaviour.start({ x: 0, y: 0 }, context)!;
    for (let i = 0; i < 100; i++) {
      draft = selectDrawBehaviour.move(draft, { x: i * 0.1, y: 0 }, context);
    }
    if (draft.shape.kind !== "path") throw new Error("expected a path");
    expect(draft.shape.points.length).toBeLessThan(10);
  });
});

describe("eraseRegionStroke", () => {
  it("files the selection's area as one erasing mark with the feather on its dials", () => {
    const region = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    ];
    const stroke = eraseRegionStroke(region, 6);
    expect(stroke.tool).toBe(ERASE_REGION_TOOL_ID);
    expect(stroke.dials).toEqual({ feather: 6 });
    expect(stroke.shape).toEqual({ kind: "region", contours: region });
    // …and the contours are copies: a stroke must not share points with the
    // window that goes on being slid and stretched after the delete.
    expect(stroke.shape.kind === "region" && stroke.shape.contours[0]).not.toBe(
      region[0],
    );
  });

  it("records no dials at all for a hard delete", () => {
    const stroke = eraseRegionStroke([[{ x: 0, y: 0 }]], 0);
    expect(stroke.dials).toBeUndefined();
  });
});
