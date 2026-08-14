// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import {
  pressBox,
  pressExtent,
  pressMarks,
  pressReach,
  pressScale,
} from "../src/app/press.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { pluginById, resetPlugins } from "../src/app/plugins/registry.ts";
import type { ToolContext } from "../src/app/plugins/types.ts";

// The size button and the size panel don't draw a picture of a width any more —
// they simulate a press and paint what comes back (see `src/app/press.ts`). The
// simulation is pure, so the whole of it runs here with no canvas: what these
// pin is that every kind of tool gets the mark it should out of the one
// contract, including the three that can't answer a press directly (the shapes,
// the bucket, the text tool) and the two that leave nothing at all.

const ctx: ToolContext = {
  color: "#ef4444",
  size: 8,
  dials: {},
  filled: false,
  background: "#ffffff",
};

const reach = pressReach(16);

function press(tool: string, over: Partial<ToolContext> = {}) {
  return pressMarks(pluginById(tool), { ...ctx, ...over }, reach);
}

describe("pressMarks", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("is a tap for a tool that draws freehand", () => {
    const [mark, ...rest] = press("pencil");
    expect(rest).toEqual([]);
    expect(mark?.tool).toBe("pencil");
    expect(mark?.shape).toEqual({ kind: "path", points: [{ x: 0, y: 0 }] });
    // The pencil draws at the width it is given; the mark is the nib itself.
    expect(mark?.size).toBe(8);
  });

  it("presses at the tool's own scale, not the toolbar's number", () => {
    // A highlighter is six times the number on the button (see the builtin
    // registrations) — which is the whole reason a dot the size of the number
    // was the wrong preview.
    expect(press("highlighter")[0]?.size).toBe(8 * 6);
    expect(press("crayon")[0]?.size).toBe(8 * 2);
  });

  it("draws with the tool as it is tuned", () => {
    const [soft] = press("paintbrush", { dials: { hardness: 0.2 } });
    expect(soft?.hardness).toBe(0.2);
    const [pale] = press("pencil", { dials: { opacity: 0.5 } });
    expect(pale?.opacity).toBe(0.5);
  });

  it("lays ink under a tool that paints with the page", () => {
    const [under, mark] = press("eraser");
    // The eraser records no colour of its own — it follows the page for good —
    // so without something to lift it would preview as page on page.
    expect(mark?.color).toBeUndefined();
    expect(under?.color).toBe("#ef4444");
    expect(under?.size).toBeGreaterThan(mark?.size ?? 0);
    // …and it is the blot that comes first: painted in order, the bite lands on
    // top of the ink rather than under it.
    expect(press("eraser").map((m) => m.id)).toEqual(["press-under", "press"]);
  });

  it("gives a two-anchor tool the shortest gesture that leaves a mark", () => {
    // A shape tool drops a press that never travelled (it is a mis-tap, not a
    // zero-size rectangle), so the preview presses, drags and lifts.
    const [box] = press("rectangle");
    expect(box?.shape).toEqual({
      kind: "box",
      from: { x: -reach / 2, y: reach / 2 },
      to: { x: reach / 2, y: -reach / 2 },
    });
    const [line] = press("line");
    expect(line?.shape.kind).toBe("segment");
  });

  it("honours the fill toggle where the tool does", () => {
    expect(press("ellipse", { filled: true })[0]?.filled).toBe(true);
    expect(press("ellipse")[0]?.filled).toBeUndefined();
  });

  it("lends the bucket a page to fill", () => {
    // The bucket begins nothing without a probe, so the preview hands it one
    // with a single round area on it — and gets a real region back.
    const [fill] = press("filler");
    expect(fill?.shape.kind).toBe("region");
    const at = pressBox([fill!])!;
    expect(at.width).toBeCloseTo(reach, 0);
  });

  it("previews a typing tool as type", () => {
    const [caption] = press("text", { size: 32 });
    expect(caption?.shape.kind).toBe("text");
    expect(caption?.size).toBe(32);
  });

  it("leaves nothing for a tool that leaves nothing", () => {
    expect(press("hand")).toEqual([]);
    expect(press("dropper")).toEqual([]);
    expect(pressMarks(undefined, ctx, reach)).toEqual([]);
  });
});

describe("pressExtent", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("is the mark's geometry, and grows with the width", () => {
    // A pencil's dab is exactly its nib. What a *medium* lays down reaches
    // further than that, and no number on a stroke knows how far — the preview
    // measures the painted mark rather than guessing here.
    expect(pressExtent(press("pencil", { size: 2 }))).toBe(2);
    expect(pressExtent(press("pencil", { size: 16 }))).toBe(16);
    // …and a tool that draws at a scale of its own says so through the mark it
    // makes, not through the number on the button.
    expect(pressExtent(press("highlighter", { size: 2 }))).toBe(12);
  });

  it("is nothing at all when there is no mark", () => {
    expect(pressExtent([])).toBe(0);
    expect(pressBox([])).toBeNull();
  });
});

describe("pressScale", () => {
  it("fits the broadest mark on the row into the room it has", () => {
    // Everything on the row is drawn at the scale the *widest* needs, which is
    // what makes a row of presses a comparison rather than five marks each
    // filled to its own cell.
    expect(pressScale(100, 200, 50, 4)).toBeCloseTo(0.25);
    expect(pressScale(200, 200, 50, 4)).toBeCloseTo(0.25);
  });

  it("never magnifies a mark that already fits", () => {
    // A nib row's widest is about a button across, and there the preview is the
    // mark at life size.
    expect(pressScale(8, 16, 40, 4)).toBe(1);
  });

  it("floors a mark the row's scale would shrink out of sight", () => {
    // Against a kept width of 96 a fine nib works out at a fraction of a pixel.
    // Drawn at the floor it is a speck you can at least see.
    const scale = pressScale(10, 200, 25, 4);
    expect(10 * scale).toBeCloseTo(4);
  });

  it("still never magnifies to reach the floor", () => {
    // A mark that is smaller than the floor at life size is drawn at life size:
    // blowing a one-pixel nib up to four would be the preview lying about the
    // one thing it is for.
    expect(pressScale(2, 200, 25, 4)).toBe(1);
  });

  it("copes with a mark that has no size at all", () => {
    expect(pressScale(0, 0, 25, 4)).toBe(1);
  });
});
