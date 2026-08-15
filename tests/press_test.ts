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
    // Most tools now lay down exactly the width on the button — that is what
    // it means for a width to be a real distance — but the ones whose painter
    // works to a scale of its own still say so here, and the preview follows
    // the mark rather than the number. A broad nib is drawn twice the number
    // it is handed, so the tool asks for half of what you set; an airbrush
    // throws a cone 3.2 times its own, so it asks for a 3.2nd.
    expect(press("calligraphy")[0]?.size).toBe(8 * 0.5);
    expect(press("airspray")[0]?.size).toBeCloseTo(8 / 3.2, 6);
    // …and the ones that don't are the number itself.
    expect(press("highlighter")[0]?.size).toBe(8);
    expect(press("crayon")[0]?.size).toBe(8);
  });

  it("draws with the tool as it is tuned", () => {
    const [soft] = press("paintbrush", { dials: { hardness: 0.2 } });
    expect(soft?.hardness).toBe(0.2);
    const [pale] = press("pencil", { dials: { opacity: 0.5 } });
    expect(pale?.opacity).toBe(0.5);
  });

  it("presses a tool that lifts ink like any other", () => {
    // A rubbing out is an ordinary mark here — the same tap the pencil makes,
    // at the eraser's own scale — and it records no colour of its own, because
    // what it takes off is decided by the nib rather than by the toolbar.
    const [mark, ...rest] = press("eraser");
    expect(rest).toEqual([]);
    expect(mark?.tool).toBe("eraser");
    expect(mark?.color).toBeUndefined();
    // Nothing is fabricated under it for the bite to show against: on a bare
    // page the mark paints as nothing, which is why the eraser previews its
    // width as a circle instead (see `plugins/controls.ts`).
    expect(pluginById("eraser")?.sizePreview).toBe("circle");
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
    // The marquee builds a two-corner draft like any shape tool, but the box
    // chooses marks rather than becoming one and never reaches the document —
    // so there is no press to show and no width that would change it.
    expect(press("select")).toEqual([]);
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
    // …and a tool that draws at a scale of its own carries that scale on the
    // stroke rather than in the number on the button: the broad nib's painter
    // draws a flat twice what it is handed, so the tool hands it half of the
    // width you set. What that half comes out as on paper is the painter's
    // business, and the preview measures the *painted* mark rather than this.
    expect(pressExtent(press("calligraphy", { size: 12 }))).toBe(6);
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
