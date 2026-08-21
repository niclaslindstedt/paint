// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a frame of a gesture in flight costs.
//
// Like the mark cache, the whole point of the trail is the work it *doesn't* do
// — so what these assert is which frames repaint the gesture from its first
// point, which repaint only the patch it grew into, and how big that patch is.
// Getting the first wrong is a canvas that crawls as you draw; getting the
// second wrong is a stale rectangle of screen that stays wrong until something
// else forces a repaint, which is the worse of the two and the reason every
// case that isn't certain has to come out "repaint it all".
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { paintFrame, type Frame } from "../src/app/frame.ts";
import { registerPlugin, resetPlugins } from "../src/app/plugins/registry.ts";
import type { PaintDetail } from "../src/app/plugins/types.ts";
import type { Drawing, Point, Stroke } from "../src/app/types.ts";
import { createFakeCanvas, withFakeDocument } from "./support/fakeCanvas.ts";
import { createTrail } from "../src/app/trail.ts";

/** Every `paint` call any tool below made, with the detail it was handed —
 *  which is where the patch shows up, as the clip the painter may cull
 *  against. */
let painted: { stroke: Stroke; detail: PaintDetail | undefined }[] = [];

let dom: ReturnType<typeof withFakeDocument>;
let hadWindow: unknown;

/** A tool that paints nothing but records that it was asked to. `grows` is what
 *  the trail reads; everything else here is the least a plugin can be. */
function recorder(id: string, over: Record<string, unknown> = {}) {
  registerPlugin({
    id,
    core: true,
    nameKey: "tools.pencil.name",
    descriptionKey: "tools.pencil.description",
    icon: () => null,
    ...over,
    behaviour: {
      start: (p) => ({
        tool: id,
        size: 4,
        shape: { kind: "path", points: [p] },
      }),
      move: (draft) => draft,
      paint: (_ctx, stroke, detail) => {
        painted.push({ stroke, detail });
      },
    },
  });
}

beforeEach(() => {
  resetPlugins();
  // The airbrush's shape: a mark laid down as the hand travels.
  recorder("sprayer", { grows: true });
  // …and one that fits its texture to the mark as a whole, so a longer stroke
  // repaints differently all the way back to its first point.
  recorder("smudger");
  // …and one that grows but takes ink off, which no patch can stand in for.
  recorder("wiper", { grows: true, erases: true });
  painted = [];
  dom = withFakeDocument();
  hadWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
});

afterEach(() => {
  dom.restore();
  (globalThis as { window?: unknown }).window = hadWindow;
});

const page: Drawing = {
  id: "d",
  name: "d",
  width: 400,
  height: 300,
  strokes: [
    {
      id: "committed",
      tool: "sprayer",
      size: 4,
      shape: {
        kind: "path",
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      },
    },
  ],
};

/** Whether the box a painter was handed is the whole window rather than a
 *  patch of it. A full frame culls against the slice of page the window shows;
 *  a patch frame culls against the few pixels the gesture just grew into, and
 *  that is the only difference visible from inside a painter — both frames blit
 *  the committed marks rather than repainting them. */
function wholeWindow(detail: PaintDetail | undefined): boolean {
  const clip = detail?.clip;
  return clip !== undefined && clip.width >= 400 && clip.height >= 300;
}

/** A gesture so far, as the canvas holds it: the points are kept between frames
 *  (the behaviour appends to a copy of the array and leaves the samples alone),
 *  which is exactly what the trail compares. */
function gesture(tool: string, points: Point[]) {
  return { tool, size: 4, shape: { kind: "path" as const, points } };
}

/** One canvas, painted frame after frame — the thing under test is what the
 *  second frame does differently from the first. */
function screen() {
  const canvas = createFakeCanvas(400, 300);
  const cache = { current: null };
  const trail = createTrail();
  const paint = (over: Partial<Frame> = {}) => {
    paintFrame({
      canvas: canvas as unknown as HTMLCanvasElement,
      view: { scale: 1, tx: 0, ty: 0 },
      viewport: { width: 400, height: 300 },
      drawing: page,
      pageColor: "#fff",
      defaultInk: "#000",
      showGrid: false,
      showPixelGrid: false,
      checker: ["#eee", "#ddd"],
      washDetail: 1,
      leadDetail: 1,
      decodedAt: 0,
      preview: null,
      zooming: false,
      draft: null,
      selection: null,
      moving: null,
      loupe: null,
      cache,
      trail,
      ...over,
    });
  };
  return { canvas, ctx: canvas.ctx, paint };
}

describe("a gesture in flight", () => {
  it("paints the whole document on its first frame", () => {
    const { paint } = screen();
    paint({ draft: gesture("sprayer", [{ x: 100, y: 100 }]) });
    expect(painted.map((p) => p.stroke.id)).toEqual(["committed", "draft"]);
  });

  it("paints only the gesture on the frames after it", () => {
    const { paint, ctx } = screen();
    const points = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    paint({ draft: gesture("sprayer", points) });
    painted = [];
    const blits = ctx.blits.length;

    // Two more samples: the committed mark is not repainted, the gesture is,
    // and the picture under the patch comes off the cache.
    paint({ draft: gesture("sprayer", [...points, { x: 120, y: 104 }]) });
    expect(painted).toHaveLength(1);
    expect(painted[0]!.stroke.tool).toBe("sprayer");
    expect(ctx.blits.length).toBe(blits + 1);
  });

  it("hands the painter the patch it grew into, and nothing wider", () => {
    const { paint } = screen();
    const points = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    paint({ draft: gesture("sprayer", points) });
    painted = [];
    paint({ draft: gesture("sprayer", [...points, { x: 130, y: 100 }]) });

    // A couple of samples back from the end of what was painted (see
    // `JOIN_SLACK` — a smoothed line moves the segment before the join too) to
    // the new point, grown by how far a four-pixel nib can reach past its path
    // (`SPREAD` × size + `MARGIN`).
    const clip = painted[0]!.detail?.clip;
    expect(clip).toBeDefined();
    expect(clip!.x).toBeCloseTo(100 - 20, 5);
    expect(clip!.width).toBeCloseTo(30 + 40, 5);
    expect(clip!.y).toBeCloseTo(100 - 20, 5);
    expect(clip!.height).toBeCloseTo(40, 5);
  });

  it("repaints in full when the tool does not grow from the front", () => {
    const { paint } = screen();
    const points = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    paint({ draft: gesture("smudger", points) });
    painted = [];
    paint({ draft: gesture("smudger", [...points, { x: 120, y: 100 }]) });
    expect(painted).toHaveLength(1);
    expect(wholeWindow(painted[0]!.detail)).toBe(true);
  });

  it("repaints in full for a mark that rubs out, whatever it declares", () => {
    const { paint } = screen();
    const points = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    paint({ draft: gesture("wiper", points) });
    painted = [];
    paint({ draft: gesture("wiper", [...points, { x: 120, y: 100 }]) });
    expect(wholeWindow(painted.at(-1)!.detail)).toBe(true);
  });

  it("repaints in full when the view moved under the gesture", () => {
    const { paint } = screen();
    const points = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    paint({ draft: gesture("sprayer", points) });
    painted = [];
    paint({
      draft: gesture("sprayer", [...points, { x: 120, y: 100 }]),
      view: { scale: 2, tx: 0, ty: 0 },
    });
    // A zoom repaints the document as well: the cache is holding the page at
    // the scale it *was*.
    expect(painted.map((p) => p.stroke.id)).toEqual(["committed", "draft"]);
  });

  it("repaints in full when the path was rewritten rather than appended to", () => {
    // The dangerous case: the same tool and the same length, but the samples
    // are different objects — a gesture rebuilt rather than grown, which the
    // patch would paint over the top of instead of replacing.
    const { paint } = screen();
    const points = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    paint({ draft: gesture("sprayer", points) });
    painted = [];
    paint({
      draft: gesture("sprayer", [
        { x: 100, y: 100 },
        { x: 110, y: 100 },
        { x: 120, y: 100 },
      ]),
    });
    expect(painted).toHaveLength(1);
    expect(wholeWindow(painted[0]!.detail)).toBe(true);
  });

  it("repaints in full on the frame a stroke lands", () => {
    const { paint } = screen();
    const points = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    paint({ draft: gesture("sprayer", points) });
    painted = [];
    // The gesture committed: a new document, and no draft at all.
    const landed: Stroke = {
      id: "landed",
      tool: "sprayer",
      size: 4,
      shape: { kind: "path", points },
    };
    paint({
      drawing: { ...page, strokes: [...page.strokes, landed] },
      draft: null,
    });
    expect(painted.map((p) => p.stroke.id)).toContain("landed");
  });

  it("goes on painting patches for as long as the gesture lasts", () => {
    // The property the whole module exists for: a gesture of any length costs
    // the same per frame, rather than its own length per frame.
    const { paint } = screen();
    const points: Point[] = [{ x: 40, y: 100 }];
    paint({ draft: gesture("sprayer", points) });
    painted = [];
    for (let i = 1; i < 60; i++) {
      points.push({ x: 40 + i * 4, y: 100 });
      paint({ draft: gesture("sprayer", [...points]) });
    }
    // One painter call per frame — the gesture — and every one of them culled
    // to the patch that frame's samples reached, however long the mark has got.
    expect(painted).toHaveLength(59);
    expect(painted.some((p) => wholeWindow(p.detail))).toBe(false);
  });
});
