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

/** A recording 2D context, plus the tallies the tests assert on. */
export type FakeContext = CanvasRenderingContext2D & {
  calls: Record<string, number>;
  /** Images blitted onto it, in order — the layer's evidence that a frame was
   *  served from the cache. */
  blits: unknown[];
};

const METHODS = [
  "arc",
  "beginPath",
  "clearRect",
  "clip",
  "closePath",
  "ellipse",
  "fill",
  "fillRect",
  "fillText",
  "lineTo",
  "moveTo",
  "quadraticCurveTo",
  "rect",
  "restore",
  "save",
  "stroke",
  "strokeRect",
  "translate",
] as const;

export function createFakeContext(): FakeContext {
  const calls: Record<string, number> = {};
  const blits: unknown[] = [];
  let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const tick = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };

  const ctx: Record<string, unknown> = {
    calls,
    blits,
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
  };
  for (const name of METHODS) ctx[name] = () => tick(name);
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
