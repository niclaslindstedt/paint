// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Rubbing out, in the one place it actually happens: the compositing.
//
// An erasing tool is not a tool that paints a pale colour — it is an ordinary
// painter run with `destination-out`, over a page whose sheet is laid down
// *afterwards* so the hole exposes it instead of going through it (see
// `render.ts`). Neither half shows up in a stroke, a colour, or a call count,
// which is why the recording context tracks the compositing each call was made
// with and why these tests are about nothing else.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { BACKGROUND_LAYER_ID, BASE_LAYER_ID } from "../src/app/layers.ts";
import { registerPlugin, resetPlugins } from "../src/app/plugins/registry.ts";
import {
  anyErases,
  anyLifts,
  paintStroke,
  renderDrawing,
  strokeErases,
  strokeLifts,
} from "../src/app/render.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";
import {
  createFakeCanvas,
  createFakeContext,
  withFakeDocument,
  type FakeContext,
} from "./support/fakeCanvas.ts";

const ink = { pageColor: "#fffdf5", defaultInk: "#111827" };

beforeEach(() => {
  resetPlugins();
  registerBuiltinPlugins();
});

afterEach(() => resetPlugins());

let next = 0;

function mark(tool: string, layer?: string): Stroke {
  return {
    id: `s${next++}`,
    tool,
    size: 8,
    ...(layer ? { layer } : {}),
    shape: {
      kind: "path",
      points: [
        { x: 20, y: 20 },
        { x: 80, y: 60 },
      ],
    },
  };
}

function drawing(strokes: Stroke[], over: Partial<Drawing> = {}): Drawing {
  return { id: "d", name: "d", width: 400, height: 300, strokes, ...over };
}

/** Every call that painted, as `call@composite` — the frame in the order the
 *  pixels saw it. */
function order(ctx: FakeContext): string[] {
  return ctx.painted.map((p) => `${p.call}@${p.composite}`);
}

/** The frame's composites in order, with runs of the same one collapsed. A
 *  textured painter draws one mark as several calls (the pencil lays three
 *  weights of grain, the rubber three of lift), and what these tests are about
 *  is the order the *modes* came in rather than how many calls each took. */
function phases(ctx: FakeContext): string[] {
  const out: string[] = [];
  for (const call of ctx.painted) {
    if (out[out.length - 1] !== call.composite) out.push(call.composite);
  }
  return out;
}

/** The page fill, if this frame laid one: the sheet is the one thing painted as
 *  a `fillRect` of the page colour. */
function sheet(ctx: FakeContext) {
  return ctx.painted.filter(
    (p) => p.call === "fillRect" && p.fillStyle === ink.pageColor,
  );
}

describe("what a tool declares", () => {
  it("names the eraser and nothing else", () => {
    expect(strokeErases(mark("eraser"))).toBe(true);
    expect(strokeErases(mark("pencil"))).toBe(false);
    expect(anyErases([mark("pencil"), mark("eraser")])).toBe(true);
    expect(anyErases([mark("pencil"), mark("marker")])).toBe(false);
  });

  it("says nothing about a tool this build doesn't ship", () => {
    // A mark from a plugin that isn't registered still renders (the generic
    // painter takes it), and it renders as an ordinary one: the flag lived on
    // the descriptor, and the descriptor is gone.
    expect(strokeErases(mark("some-future-tool"))).toBe(false);
  });
});

describe("painting one mark", () => {
  it("subtracts an erasing mark and adds every other one", () => {
    const ctx = createFakeContext();
    paintStroke(ctx, mark("pencil"), ink);
    expect(order(ctx)).toEqual(["stroke@source-over"]);

    const rubbing = createFakeContext();
    paintStroke(rubbing, mark("eraser"), ink);
    expect(order(rubbing)).toEqual(["stroke@destination-out"]);
  });

  it("leaves the mode behind it as it found it", () => {
    // The renderer wraps each mark in a save/restore pair, so an eraser stroke
    // in the middle of a document must not turn the rest of the page into one.
    const ctx = createFakeContext();
    paintStroke(ctx, mark("eraser"), ink);
    paintStroke(ctx, mark("pencil"), ink);
    expect(order(ctx)).toEqual([
      "stroke@destination-out",
      "stroke@source-over",
    ]);
  });
});

describe("the sheet, under the marks", () => {
  it("goes down last, and underneath", () => {
    const ctx = createFakeContext();
    renderDrawing(ctx, drawing([mark("pencil")]), null, ink);
    expect(order(ctx)).toEqual([
      // Clear first: a repaint may be landing on pixels somebody already
      // blitted, and an under-fill would leave those in place.
      "clearRect@source-over",
      "stroke@source-over",
      "fillRect@destination-over",
    ]);
  });

  it("survives a rubbing out that would otherwise go through it", () => {
    const ctx = createFakeContext();
    renderDrawing(ctx, drawing([mark("pencil"), mark("eraser")]), null, ink);
    expect(order(ctx)).toEqual([
      "clearRect@source-over",
      "stroke@source-over",
      "stroke@destination-out",
      "fillRect@destination-over",
    ]);
    expect(sheet(ctx)).toHaveLength(1);
  });

  it("takes the gesture in flight with it", () => {
    // The draft is painted before the sheet arrives, or an eraser would show a
    // hole through the page for as long as the finger was down and heal it on
    // commit.
    const ctx = createFakeContext();
    renderDrawing(ctx, drawing([mark("pencil")]), mark("eraser"), ink);
    expect(order(ctx)).toEqual([
      "clearRect@source-over",
      "stroke@source-over",
      "stroke@destination-out",
      "fillRect@destination-over",
    ]);
  });

  it("rules the grid between the sheet and the marks", () => {
    const ctx = createFakeContext();
    renderDrawing(ctx, drawing([mark("pencil")]), null, { ...ink, grid: 40 });
    expect(order(ctx)).toEqual([
      "clearRect@source-over",
      "stroke@source-over",
      // The ruling, then the page under it: both are backdrops, and they go
      // down in the order they are read off the page.
      "stroke@destination-over",
      "fillRect@destination-over",
    ]);
  });

  it("leaves a real hole when there is no sheet to expose", () => {
    // A transparent export, and the hidden background layer that is the same
    // thing said by the document. Either way the rubbing out is the last thing
    // painted and nothing fills what it took.
    const transparent = createFakeContext();
    renderDrawing(
      transparent,
      drawing([mark("pencil"), mark("eraser")]),
      null,
      {
        ...ink,
        transparentPage: true,
      },
    );
    expect(sheet(transparent)).toHaveLength(0);

    const hidden = createFakeContext();
    renderDrawing(
      hidden,
      drawing([mark("pencil", BASE_LAYER_ID)], {
        layers: [
          { id: BACKGROUND_LAYER_ID, name: "", locked: true, hidden: true },
          { id: BASE_LAYER_ID, name: "" },
        ],
      }),
      null,
      ink,
    );
    expect(sheet(hidden)).toHaveLength(0);
  });
});

// The rubber takes ink off exactly like the plain eraser — there is no
// other way to give up pixels — and then everything it could never have lifted
// is laid straight back over the hole (`relayFixed`). Which marks those are is
// two descriptor flags and nothing else: `lifts` on the rubber, `liftable` on
// the two media that sit on the sheet rather than soaking into it.

describe("a rubbing out that only lifts what a rubber can", () => {
  it("is named by the flags and not by the tool", () => {
    expect(strokeLifts(mark("rubber"))).toBe(true);
    // The plain eraser erases and lifts nothing selectively: it is a hole.
    expect(strokeErases(mark("eraser"))).toBe(true);
    expect(strokeLifts(mark("eraser"))).toBe(false);
    expect(strokeLifts(mark("graphite"))).toBe(false);
    expect(anyLifts([mark("pencil"), mark("rubber")])).toBe(true);
    expect(anyLifts([mark("pencil"), mark("eraser")])).toBe(false);
  });

  it("still paints as a hole — the sparing happens afterwards", () => {
    const ctx = createFakeContext();
    paintStroke(ctx, mark("rubber"), ink);
    expect(phases(ctx)).toEqual(["destination-out"]);
  });

  it("lays the ink it could not have lifted back over the hole", () => {
    const dom = withFakeDocument();
    try {
      const ctx = createFakeCanvas(400, 300).ctx;
      renderDrawing(
        ctx,
        drawing([mark("pencil"), mark("graphite"), mark("rubber")]),
        null,
        ink,
      );
      // The give-away: two working surfaces — the ink on one, a picture of how
      // much of it went on the other — and the first blitted back on top.
      expect(dom.created).toHaveLength(2);
      expect(ctx.calls.drawImage ?? 0).toBe(1);
      const [relaid, mask] = dom.created;
      // The pen's line goes back and the pencil's does not: graphite is
      // `liftable`, ink is not.
      expect(relaid!.ctx.calls.stroke ?? 0).toBe(1);
      // …cut to where the rubbing out actually went, by blitting the mask over
      // it the one way round that keeps an overlap and throws the rest away.
      expect(relaid!.ctx.draws).toHaveLength(1);
      expect(relaid!.ctx.draws[0]!.image).toBe(mask);
      expect(relaid!.ctx.draws[0]!.composite).toBe("destination-in");
      // The mask is the same mark painted the ordinary way round: what comes
      // out is a picture of the fraction that went, not another hole.
      expect(
        mask!.ctx.painted.every((p) => p.composite === "source-over"),
      ).toBe(true);
    } finally {
      dom.restore();
    }
  });

  it("does nothing at all to a drawing nobody rubbed at", () => {
    const dom = withFakeDocument();
    try {
      const ctx = createFakeCanvas(400, 300).ctx;
      renderDrawing(ctx, drawing([mark("pencil"), mark("eraser")]), null, ink);
      // The plain eraser is indifferent to what is under it, so there is
      // nothing to put back and no surface is ever asked for.
      expect(dom.created).toHaveLength(0);
    } finally {
      dom.restore();
    }
  });

  it("keeps a hole somebody took out earlier a hole", () => {
    // The marks laid back are the ones that were on the page *in order*, plain
    // erasers included — otherwise rubbing at a patch would resurrect the ink
    // an eraser took out of it before.
    const dom = withFakeDocument();
    try {
      const ctx = createFakeCanvas(400, 300).ctx;
      renderDrawing(
        ctx,
        drawing([mark("pencil"), mark("eraser"), mark("rubber")]),
        null,
        ink,
      );
      const relaid = dom.created[0]!.ctx;
      expect(order(relaid)).toEqual([
        "stroke@source-over",
        "stroke@destination-out",
      ]);
    } finally {
      dom.restore();
    }
  });

  it("puts the ink back unmasked rather than losing it with no surface", () => {
    // No DOM to mint a surface in — a browser that refused one, or the SVG
    // export's recorder. The ink then also lands where the rubber never went,
    // which is a stacking order nobody will notice; losing it outright is the
    // failure that would show.
    const ctx = createFakeContext();
    renderDrawing(
      ctx,
      drawing([mark("pencil"), mark("graphite"), mark("rubber")]),
      null,
      ink,
    );
    expect(phases(ctx)).toEqual([
      // The page cleared and the two marks laid down…
      "source-over",
      // …the rubbing out…
      "destination-out",
      // …the pen's line again, over the hole…
      "source-over",
      // …and the sheet under the lot.
      "destination-over",
    ]);
  });
});

describe("an erasing tool that isn't the eraser", () => {
  it("needs the flag and nothing else", () => {
    // The promise the plugin seam makes: a tool that rubs out declares it and
    // is composited for it, with no painter of its own and nothing in the
    // renderer that knows its name.
    registerPlugin({
      id: "scraper",
      nameKey: "tools.eraser.name",
      descriptionKey: "tools.eraser.description",
      icon: () => null,
      erases: true,
      behaviour: {
        start: (p) => ({
          tool: "scraper",
          size: 4,
          shape: { kind: "path", points: [p] },
        }),
        move: (draft) => draft,
        paint: (ctx2d) => ctx2d.stroke(),
      },
    });
    const ctx = createFakeContext();
    paintStroke(ctx, mark("scraper"), ink);
    expect(order(ctx)).toEqual(["stroke@destination-out"]);
  });
});

// A layer's filters are applied *inside* the renderer (see `Layer.filters`),
// which puts them in the path of the one caller that renders the page in order
// to ask questions about it rather than to show it: the snapshot the paint
// bucket and the colour dropper read (`probe.ts`).
//
// They must not reach it. A filter is not part of the drawing — the page's own
// never could reach the snapshot, because they are composited outside the
// renderer — and a layer's behaving like ink instead would give the dropper a
// colour that is nowhere in the document and the bucket a softened edge with
// nothing to stop at. Invisible in pixels and in the document, so this is the
// only place it is pinned.

describe("the snapshot the bucket and the dropper read", () => {
  const softened = drawing([mark("pencil", "photo")], {
    layers: [
      { id: BASE_LAYER_ID, name: "" },
      {
        id: "photo",
        name: "Photo",
        filters: [{ kind: "blur", radius: 12 }],
      },
    ],
  });

  // A canvas-shaped fake rather than a bare context: lifting a layer onto a
  // surface needs a canvas to size it from and a document to mint it in, and
  // without both the renderer correctly falls back to painting flat — which
  // would make this test pass for the wrong reason.
  let dom: ReturnType<typeof withFakeDocument>;
  beforeEach(() => {
    dom = withFakeDocument();
  });
  afterEach(() => dom.restore());

  const onCanvas = () => createFakeCanvas(400, 300).ctx;

  it("lifts a filtered layer onto a surface when it is being shown", () => {
    const ctx = onCanvas();
    renderDrawing(ctx, softened, null, ink);
    // The give-away of the layer being composited on its own: a working
    // surface was made, and the finished layer blitted back off it.
    expect(ctx.calls.drawImage ?? 0).toBeGreaterThan(0);
  });

  it("paints the marks flat when the caller asks for them unfiltered", () => {
    const ctx = onCanvas();
    renderDrawing(ctx, softened, null, { ...ink, unfiltered: true });
    // No surface, no blit — the same flat fold a drawing with no filtered
    // layer gets, so the pixels the tools read are the ones that were painted.
    expect(ctx.calls.drawImage ?? 0).toBe(0);
    // …and the mark itself still landed.
    expect(order(ctx)).toContain("stroke@source-over");
  });
});
