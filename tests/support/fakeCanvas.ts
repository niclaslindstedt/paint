// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A 2D canvas that records instead of painting.
//
// The tests in this repo run in node, against pure domain modules — and the
// renderer *is* pure in the sense that matters (a painter is a function of a
// stroke), but the two pieces that make a busy page fast are decisions about
// *when not to paint*: the layer cache and the viewport cull. Neither shows up
// in pixels, so neither can be tested by comparing any. What they show up in is
// the calls that never happen, which is what this counts.
//
// It is deliberately the thinnest thing that satisfies the renderer: every
// context method is a no-op that ticks a counter, and `getTransform` reports
// what `setTransform` was last given so the detail the painters resolve is real
// rather than assumed.

/** One `stroke()`, with the pen it was drawn with and the runs it drew.
 *
 *  Enough to measure a *texture* rather than just count calls: the painters
 *  that build a mark out of many small marks (the crayon's grain, the brush's
 *  hairs) put their whole character into the size and spread of those runs, and
 *  a tally of `lineTo` says nothing about either. */
export type FakeStroke = {
  lineWidth: number;
  alpha: number;
  /** Every `moveTo`/`lineTo` pair, as `[x1, y1, x2, y2]`. */
  runs: [number, number, number, number][];
};

/** One call that put (or took) something on the pixels, and how it was
 *  composited.
 *
 *  Compositing is the whole of how a mark rubs something out and how the sheet
 *  ends up under it (see `render.ts`), and like the cache's blits it is a
 *  decision that leaves no trace in a stroke or a colour. This is where it can
 *  be read. */
export type PaintedCall = {
  call: string;
  composite: GlobalCompositeOperation;
  fillStyle: string;
};

/** A recording 2D context, plus the tallies the tests assert on. */
export type FakeContext = CanvasRenderingContext2D & {
  calls: Record<string, number>;
  /** Images blitted onto it, in order — the layer's evidence that a frame was
   *  served from the cache. */
  blits: unknown[];
  /** Each `stroke()` since the context was made, in order. */
  strokes: FakeStroke[];
  /** Every call that painted, in order, with the compositing it painted with. */
  painted: PaintedCall[];
};

const METHODS = [
  "arc",
  "beginPath",
  "clip",
  "closePath",
  "ellipse",
  "quadraticCurveTo",
  "rect",
  "strokeRect",
  "translate",
] as const;

/** The calls that put something on the pixels — recorded with the state they
 *  were made in rather than merely counted. */
const PAINTS = ["clearRect", "fill", "fillRect", "fillText"] as const;

/** The context state `save`/`restore` carry. The real thing carries a good deal
 *  more; this is what the renderer sets. */
const SAVED = [
  "globalAlpha",
  "globalCompositeOperation",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "fillStyle",
  "strokeStyle",
  "font",
] as const;

export function createFakeContext(): FakeContext {
  const calls: Record<string, number> = {};
  const blits: unknown[] = [];
  const strokes: FakeStroke[] = [];
  const painted: PaintedCall[] = [];
  let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const tick = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const record = (name: string) => {
    tick(name);
    painted.push({
      call: name,
      composite: ctx.globalCompositeOperation as GlobalCompositeOperation,
      fillStyle: String(ctx.fillStyle),
    });
  };
  // The pen's position, and the runs drawn since the last `stroke()`.
  let atX = 0;
  let atY = 0;
  let pending: [number, number, number, number][] = [];

  const saved: Record<string, unknown>[] = [];

  const ctx: Record<string, unknown> = {
    calls,
    blits,
    strokes,
    painted,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    fillStyle: "#000",
    strokeStyle: "#000",
    font: "",
    setTransform(
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
    ) {
      tick("setTransform");
      transform = { a, b, c, d, e, f };
    },
    getTransform: () => ({ ...transform }),
    drawImage(image: unknown) {
      tick("drawImage");
      blits.push(image);
    },
    createRadialGradient() {
      tick("createRadialGradient");
      return { addColorStop() {} };
    },
    createLinearGradient() {
      tick("createLinearGradient");
      return { addColorStop() {} };
    },
    moveTo(x: number, y: number) {
      tick("moveTo");
      atX = x;
      atY = y;
    },
    lineTo(x: number, y: number) {
      tick("lineTo");
      pending.push([atX, atY, x, y]);
      atX = x;
      atY = y;
    },
    stroke() {
      record("stroke");
      strokes.push({
        lineWidth: ctx.lineWidth as number,
        alpha: ctx.globalAlpha as number,
        runs: pending,
      });
      pending = [];
    },
    // Real save/restore, not a counter: the renderer leans on them to keep one
    // stroke's compositing off the next one, and a fake that let the eraser's
    // mode leak would pass a test the browser fails.
    save() {
      tick("save");
      const state: Record<string, unknown> = {};
      for (const key of SAVED) state[key] = ctx[key];
      saved.push(state);
    },
    restore() {
      tick("restore");
      const state = saved.pop();
      if (!state) return;
      for (const key of SAVED) ctx[key] = state[key];
    },
  };
  for (const name of METHODS) ctx[name] = () => tick(name);
  for (const name of PAINTS) ctx[name] = () => record(name);
  return ctx as unknown as FakeContext;
}

/** A canvas element that hands out one recording context. */
export function createFakeCanvas(width = 800, height = 600) {
  const ctx = createFakeContext();
  return {
    width,
    height,
    getContext: () => ctx,
    ctx,
  };
}

/** Install a `document` that mints fake canvases, and return a handle that
 *  removes it again. Everything under test asks for a canvas exactly the way
 *  the browser code does, so nothing has to be injected. */
export function withFakeDocument(): {
  created: ReturnType<typeof createFakeCanvas>[];
  restore: () => void;
} {
  const created: ReturnType<typeof createFakeCanvas>[] = [];
  const previous = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement(tag: string) {
      if (tag !== "canvas") throw new Error(`unexpected element: ${tag}`);
      const canvas = createFakeCanvas();
      created.push(canvas);
      return canvas;
    },
  };
  return {
    created,
    restore() {
      (globalThis as { document?: unknown }).document = previous;
    },
  };
}
