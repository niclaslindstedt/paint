// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Baking an effect — the edit that makes an effect an effect.
//
// `effects_test.ts` covers what an effect *is*; this covers what applying one
// does to the document, which is the whole of the redesign: a layer's marks are
// replaced by one image stroke of themselves with the effect in it, so nothing
// has to be re-softened on every frame afterwards.
//
// The pixels are unassertable without a real canvas (the fake hands back a stub
// data URL), and they are `effectPaint.ts`'s anyway. What is worth pinning here
// is everything around them: which layers a scope names, how big a bake is, what
// the stroke list looks like afterwards, and — most of all — what a bake that
// cannot happen does, because "quietly deleted the marks it was going to
// replace" is the one failure that loses work.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bakeBox,
  bakeEffect,
  bakeScale,
  MAX_BAKE_PIXELS,
} from "../src/app/bake.ts";
import { effectTargets } from "../src/app/bake.ts";
import { BLUR_TAIL, type Effect } from "../src/app/effects.ts";
import { BACKGROUND_LAYER_ID, BASE_LAYER_ID } from "../src/app/layers.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { IMAGE_TOOL_ID } from "../src/app/plugins/builtin/image.ts";
import { resetPlugins } from "../src/app/plugins/registry.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";
import { withFakeDocument } from "./support/fakeCanvas.ts";

const ink = { pageColor: "#ffffff", defaultInk: "#000000" };
const blur: Effect = { kind: "blur", radius: 4 };
const noise: Effect = { kind: "noise", amount: 0.3, grain: 2 };

let minted = 0;
const mint = () => `baked-${(minted += 1)}`;

let dom: ReturnType<typeof withFakeDocument>;

beforeEach(() => {
  minted = 0;
  resetPlugins();
  registerBuiltinPlugins();
  dom = withFakeDocument();
});

afterEach(() => {
  dom.restore();
  resetPlugins();
});

let next = 0;

/** A pencil line between two points, on `layer`. */
function line(from: number, to: number, layer?: string): Stroke {
  next += 1;
  return {
    id: `s${next}`,
    tool: "pencil",
    size: 2,
    ...(layer ? { layer } : {}),
    shape: {
      kind: "path",
      points: [
        { x: from, y: from },
        { x: to, y: to },
      ],
    },
  };
}

function drawing(strokes: Stroke[], over: Partial<Drawing> = {}): Drawing {
  return {
    id: "d1",
    name: "sketch",
    width: 400,
    height: 300,
    strokes,
    ...over,
  };
}

/** The stack every layered fixture here uses: the sheet, a base, and one on
 *  top. */
const stack = [
  { id: BACKGROUND_LAYER_ID, name: "", locked: true },
  { id: BASE_LAYER_ID, name: "" },
  { id: "top", name: "Top" },
];

describe("effectTargets", () => {
  const page = drawing(
    [line(10, 60), line(20, 70, "top"), line(30, 80, BACKGROUND_LAYER_ID)],
    { layers: stack },
  );

  it("names the one layer asked for, at layer scope", () => {
    expect(effectTargets(page, "layer", "top")).toEqual(["top"]);
    expect(effectTargets(page, "layer", BASE_LAYER_ID)).toEqual([
      BASE_LAYER_ID,
    ]);
  });

  it("skips the locked sheet at drawing scope, marks and all", () => {
    // A lock means "this sheet takes no edits", and rasterising every mark on
    // it is a bigger edit than the pencil line the lock is there to refuse.
    expect(effectTargets(page, "drawing", "top")).toEqual([
      BASE_LAYER_ID,
      "top",
    ]);
  });

  it("skips a hidden layer too", () => {
    const hidden = drawing(page.strokes, {
      layers: stack.map((l) => (l.id === "top" ? { ...l, hidden: true } : l)),
    });
    expect(effectTargets(hidden, "drawing", "top")).toEqual([BASE_LAYER_ID]);
  });

  it("names no layer that has nothing on it", () => {
    // Bottom of the dialog says so, and Apply is dead — better than a button
    // that lands an undo step and changes no pixel.
    const empty = drawing([], { layers: stack });
    expect(effectTargets(empty, "layer", "top")).toEqual([]);
    expect(effectTargets(empty, "drawing", "top")).toEqual([]);
  });
});

describe("bakeBox", () => {
  it("covers the marks, grown by how far the effect can move ink", () => {
    const page = drawing([]);
    const marks = [line(100, 200)];
    // The nib is half a pixel each way on a 2px line; the blur adds its tail.
    const grain = bakeBox(page, marks, noise)!;
    expect(grain).toEqual({ x: 99, y: 99, width: 102, height: 102 });
    const soft = bakeBox(page, marks, blur)!;
    expect(soft.x).toBe(grain.x - blur.radius * BLUR_TAIL);
    expect(soft.width).toBe(grain.width + blur.radius * BLUR_TAIL * 2);
  });

  it("clips to the page — nothing outside the sheet was ever painted", () => {
    const page = drawing([]);
    const box = bakeBox(page, [line(-100, 500)], noise)!;
    expect(box).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it("answers nothing for marks that are entirely off the sheet", () => {
    expect(bakeBox(drawing([]), [line(-500, -400)], noise)).toBeNull();
    expect(bakeBox(drawing([]), [], noise)).toBeNull();
  });
});

describe("bakeScale", () => {
  it("rasterises at document size until the ceiling says otherwise", () => {
    expect(bakeScale({ x: 0, y: 0, width: 400, height: 300 })).toBe(1);
  });

  it("shrinks a bake that would not fit anywhere sensible", () => {
    const huge = { x: 0, y: 0, width: 8192, height: 8192 };
    const scale = bakeScale(huge);
    expect(scale).toBeLessThan(1);
    // Right up to the ceiling and no further — a bake softer than it has to be
    // is work thrown away.
    expect(huge.width * scale * (huge.height * scale)).toBeCloseTo(
      MAX_BAKE_PIXELS,
      0,
    );
  });
});

describe("bakeEffect", () => {
  it("replaces a layer's marks with one picture of them, and leaves the rest", () => {
    const base = line(10, 60);
    const above = line(20, 70, "top");
    const page = drawing([base, above], { layers: stack });
    const strokes = bakeEffect(page, blur, ["top"], ink, mint)!;

    // The other layer is untouched — the same object, not a copy.
    expect(strokes.filter((s) => s.id === base.id)).toEqual([base]);
    // …and the baked layer is one image stroke where its marks were.
    const baked = strokes.find((s) => s.layer === "top")!;
    expect(strokes.filter((s) => s.layer === "top")).toHaveLength(1);
    expect(baked.tool).toBe(IMAGE_TOOL_ID);
    expect(baked.shape.kind).toBe("image");
    const box = bakeBox(page, [above], blur)!;
    expect(baked.shape).toMatchObject({
      from: { x: box.x, y: box.y },
      to: { x: box.x + box.width, y: box.y + box.height },
      src: "data:image/png;base64,stub",
    });
  });

  it("keeps the layer's place in the flat list", () => {
    // The bitmap takes the place of the first mark it replaces, so a layer that
    // was painted between two others stays between them.
    const first = line(10, 20, "top");
    const middle = line(30, 40);
    const last = line(50, 60, "top");
    const page = drawing([first, middle, last], { layers: stack });
    const strokes = bakeEffect(page, noise, ["top"], ink, mint)!;
    expect(strokes.map((s) => s.layer)).toEqual(["top", undefined]);
    expect(strokes[1]).toBe(middle);
    expect(strokes).toHaveLength(2);
  });

  it("bakes each named layer on its own, at drawing scope", () => {
    const page = drawing([line(10, 60), line(20, 70, "top")], {
      layers: stack,
    });
    const strokes = bakeEffect(
      page,
      blur,
      effectTargets(page, "drawing", "top"),
      ink,
      mint,
    )!;
    // Two bitmaps, not one: the stack survives an effect applied across it, so
    // you can still reorder and hide what you softened.
    expect(strokes).toHaveLength(2);
    expect(strokes.every((s) => s.tool === IMAGE_TOOL_ID)).toBe(true);
    // Both are stamped, base included: the drawing carries a stack, so every
    // mark on it names its layer the way the store writes one.
    expect(strokes.map((s) => s.layer)).toEqual([BASE_LAYER_ID, "top"]);
  });

  it("writes no layer field on a drawing that has no stack of its own", () => {
    // A one-layer sketch keeps writing strokes exactly the way the store does.
    const page = drawing([line(10, 60)]);
    const baked = bakeEffect(page, noise, [BASE_LAYER_ID], ink, mint)!;
    expect(baked).toHaveLength(1);
    expect(baked[0]!.layer).toBeUndefined();
  });

  it("lands nothing rather than deleting the marks it could not bake", () => {
    // The one failure worth being careful about: a bake that cannot happen must
    // leave the drawing exactly as it was, not empty the layer it was aiming at.
    const page = drawing([line(10, 60)], { layers: stack });
    expect(bakeEffect(page, noise, ["top"], ink, mint)).toBeNull();
    expect(bakeEffect(page, noise, [], ink, mint)).toBeNull();
    // …including when there is no DOM to rasterise in at all.
    dom.restore();
    expect(bakeEffect(page, noise, [BASE_LAYER_ID], ink, mint)).toBeNull();
    dom = withFakeDocument();
  });
});
