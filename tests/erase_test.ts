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
import { dropHeldRelay, liftBounds, relayFixed } from "../src/app/relay.ts";
import { dropHeldRubbing } from "../src/app/plugins/rubber.ts";
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
// the pencil — and only the pencil: wax smears under a rubber rather than
// lifting, so the crayon's marks go back over the hole with the ink's.

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
      //
      // They are the *last* two asked for, not the only two. The pencil is a
      // lead pressed into the sheet now (see `plugins/lead.ts`), so a graphite
      // mark opens a field of its own before any of this starts — a surface the
      // relay knows nothing about and must not be confused with its own.
      expect(dom.created).toHaveLength(3);
      const [relaid, mask] = dom.created.slice(-2);
      // Two blits onto the page: the pencil's own field, and the relaid ink put
      // back over the hole.
      expect(ctx.calls.drawImage ?? 0).toBe(2);
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

  it("puts a crayon mark back — wax smears rather than lifts", () => {
    // The rubber is the pencil's companion and nobody else's: a crayon mark is
    // relaid over the hole exactly as an inked line is.
    const dom = withFakeDocument();
    try {
      const ctx = createFakeCanvas(400, 300).ctx;
      renderDrawing(
        ctx,
        drawing([mark("pencil"), mark("crayon"), mark("rubber")]),
        null,
        ink,
      );
      // The two relay surfaces, and on the first of them both marks again: the
      // pen's one stroke and the crayon's grain.
      expect(dom.created).toHaveLength(2);
      const [relaid] = dom.created;
      expect(relaid!.ctx.calls.stroke ?? 0).toBeGreaterThan(1);
    } finally {
      dom.restore();
    }
  });

  it("owes nothing back over marks it has a claim on", () => {
    // Every mark under this rub is liftable — by the flag, not by any name —
    // so there is nothing to put back and no relay surface is ever asked for.
    registerPlugin({
      id: "chalk",
      nameKey: "tools.graphite.name",
      descriptionKey: "tools.graphite.description",
      icon: () => null,
      liftable: true,
      behaviour: {
        start: (p) => ({
          tool: "chalk",
          size: 4,
          shape: { kind: "path", points: [p] },
        }),
        move: (draft) => draft,
        paint: (ctx2d) => ctx2d.stroke(),
      },
    });
    const dom = withFakeDocument();
    try {
      const ctx = createFakeCanvas(400, 300).ctx;
      renderDrawing(ctx, drawing([mark("chalk"), mark("rubber")]), null, ink);
      expect(dom.created).toHaveLength(0);
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

// A rubbing out can only change the picture where its reach crosses ink a
// rubber can take, and `liftBounds` is that patch — the box the canvas holds
// the whole live coat to, and skips it on when there is none (see `frame.ts`).

describe("where a rubbing out can change the picture", () => {
  it("is nowhere over ink alone", () => {
    expect(liftBounds([mark("rubber")], [mark("pencil")])).toBeNull();
    expect(liftBounds([mark("rubber")], [])).toBeNull();
  });

  it("is nowhere over a crayon mark — wax is not the rubber's to take", () => {
    expect(liftBounds([mark("rubber")], [mark("crayon")])).toBeNull();
  });

  it("is the patch where its reach crosses pencil", () => {
    const box = liftBounds([mark("rubber")], [mark("graphite")]);
    expect(box).not.toBeNull();
    // Both marks run the same path, so the patch covers it with the painters'
    // slack and no more.
    expect(box!.x).toBeLessThanOrEqual(20);
    expect(box!.y).toBeLessThanOrEqual(20);
    expect(box!.x + box!.width).toBeGreaterThanOrEqual(80);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(60);
  });

  it("is cut to the clip the caller is keeping", () => {
    const far = { x: 1000, y: 1000, width: 10, height: 10 };
    expect(liftBounds([mark("rubber")], [mark("graphite")], far)).toBeNull();
  });
});

// While a rubbing out is under the hand, only its mask changes from one frame
// to the next: the ink it is cut from is the committed marks, which are the
// same marks they were a millisecond ago. So the live path paints that ink
// once, onto a held surface, and reuses it — re-rendering it per pointer
// sample is what made rubbing at a page of washes crawl.

describe("the ink a live rubbing out is cut from", () => {
  it("is painted once and held between frames", () => {
    const dom = withFakeDocument();
    dropHeldRelay();
    try {
      const ctx = createFakeCanvas(400, 300).ctx;
      const before = [mark("pencil"), mark("graphite")];
      const rub = mark("rubber");

      relayFixed(ctx, [rub], { ...ink, live: true }, before);
      // Seven surfaces: the held window of fixed ink, the patch-sized pair
      // the cut is made on, and the live rubbing's own held walk — its three
      // weight unions and the surface they are combined on (see
      // `paintLiveRubbing` in `rubber.ts`).
      expect(dom.created).toHaveLength(7);
      const held = dom.created[0]!;
      const laid = held.ctx.calls.stroke ?? 0;
      // The pen's line is on the held ink; the pencil's is not — the rubber
      // has a claim on it, so it is being erased rather than put back.
      expect(laid).toBeGreaterThan(0);

      relayFixed(ctx, [rub], { ...ink, live: true }, before);
      // The next frame minted nothing and repainted no ink — only the mask.
      expect(dom.created).toHaveLength(7);
      expect(held.ctx.calls.stroke ?? 0).toBe(laid);
    } finally {
      dropHeldRelay();
      dropHeldRubbing();
      dom.restore();
    }
  });

  it("is repainted when the marks under it change", () => {
    const dom = withFakeDocument();
    dropHeldRelay();
    try {
      const ctx = createFakeCanvas(400, 300).ctx;
      const rub = mark("rubber");
      const first = [mark("pencil")];

      relayFixed(ctx, [rub], { ...ink, live: true }, first);
      const held = dom.created[0]!;
      const laid = held.ctx.calls.stroke ?? 0;

      // A mark landed between gestures: the held ink is stale and says so.
      relayFixed(ctx, [rub], { ...ink, live: true }, [
        ...first,
        mark("pencil"),
      ]);
      expect(held.ctx.calls.stroke ?? 0).toBeGreaterThan(laid);
    } finally {
      dropHeldRelay();
      dropHeldRubbing();
      dom.restore();
    }
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

// An effect being previewed is applied *inside* the renderer (see `render.ts`),
// which puts it in the path of the one caller that renders the page in order to
// ask questions about it rather than to show it: the snapshot the paint bucket
// and the colour dropper read (`probe.ts`).
//
// It must not reach it. An effect nobody has applied yet is not part of the
// drawing, and one behaving like ink instead would give the dropper a colour
// that is nowhere in the document and the bucket a softened edge with nothing to
// stop at. Invisible in pixels and in the document, so this is the only place it
// is pinned.

describe("the snapshot the bucket and the dropper read", () => {
  const softened = drawing([mark("pencil", "photo")], {
    layers: [
      { id: BASE_LAYER_ID, name: "" },
      { id: "photo", name: "Photo" },
    ],
  });
  const preview = {
    effect: { kind: "blur", radius: 12 } as const,
    layerIds: new Set(["photo"]),
  };

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

  it("lifts a previewed layer onto a surface when it is being shown", () => {
    const ctx = onCanvas();
    renderDrawing(ctx, softened, null, { ...ink, preview });
    // The give-away of the layer being composited on its own: a working
    // surface was made, and the finished layer blitted back off it.
    expect(ctx.calls.drawImage ?? 0).toBeGreaterThan(0);
  });

  it("paints the marks flat when the caller asks for them flat", () => {
    const ctx = onCanvas();
    renderDrawing(ctx, softened, null, { ...ink, preview, flat: true });
    // No surface, no blit — the same flat fold a drawing with no dialog open
    // gets, so the pixels the tools read are the ones that were painted.
    expect(ctx.calls.drawImage ?? 0).toBe(0);
    // …and the mark itself still landed.
    expect(order(ctx)).toContain("stroke@source-over");
  });
});
