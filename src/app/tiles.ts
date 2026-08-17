// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Little pictures painted by the app's own renderer, and when they are allowed
// to cost what they cost.
//
// A shelf of paper stocks, a press with the brush in your hand, a wash painted
// by each of the two watercolours: every one of them is a real render, because
// a swatch that drew its own idea of the thing would be free to be wrong about
// it. That is the right call and it is not a cheap one — a panel that opened
// eleven of them in one effect flush held the thread for a third of a second on
// a desktop, and a good deal longer than that on a phone.
//
// Three rules follow, and all three are about *when* rather than about what:
//
//   - **Painted once.** The same key is the same picture — nothing here is a
//     function of anything but its key — so the pixels are kept for the life of
//     the tab and shown again with a blit. Capped, because a dragged slider
//     mints a panel's worth of keys per step.
//   - **One per frame.** A queue taken a job at a time, so the panel that just
//     opened paints first and stays interactive while its pictures fill in,
//     rather than sitting frozen behind them. Shared by every surface that
//     paints tiles: two queues each taking a frame is one queue taking two.
//   - **Warm before it is asked for.** A tile painted at idle is a tile that is
//     already there when the panel opens (see `atIdle`), which is what makes
//     opening it a row of blits. The first tile ever painted is dearer than
//     every one after it — the painters compile and the grain tiles are built
//     on that first run — so warming is worth doing even where the pixels
//     themselves are cheap.
//
// Anything painted from here has to fold `rendererKey()` into its key: the
// renderer reads the detail settings in force as globals, so two tiles painted
// either side of a change are two different pictures under the same props.

import { leadDetail } from "./plugins/lead.ts";
import { washDetail } from "./plugins/wash.ts";

/** Device pixels per CSS pixel, capped: past three a tile costs more to paint
 *  than it can show. */
export function tileRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 3);
}

/** Everything about the *renderer* that changes a tile's pixels without
 *  changing any of its props — how finely the wash and the graphite simulations
 *  are set to resolve (see `plugins/wash.ts`, `plugins/lead.ts`). */
export function rendererKey(): string {
  return [washDetail(), leadDetail()].join("|");
}

/** Tiles already painted, oldest evicted first. */
export class TileCache {
  private readonly painted = new Map<string, HTMLCanvasElement>();

  constructor(private readonly max: number) {}

  get(key: string): HTMLCanvasElement | undefined {
    return this.painted.get(key);
  }

  has(key: string): boolean {
    return this.painted.has(key);
  }

  remember(key: string, tile: HTMLCanvasElement): void {
    if (this.painted.size >= this.max) {
      const oldest = this.painted.keys().next().value;
      if (oldest !== undefined) this.painted.delete(oldest);
    }
    this.painted.set(key, tile);
  }
}

/** A blank tile of the given size in CSS pixels, at the device's ratio, or
 *  `null` where a 2D context is not to be had. */
export function tileCanvas(
  width: number,
  height: number,
  dpr: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

/** Show a painted tile on a canvas that is on screen. */
export function blit(canvas: HTMLCanvasElement, tile: HTMLCanvasElement): void {
  canvas.width = tile.width;
  canvas.height = tile.height;
  canvas.getContext("2d")?.drawImage(tile, 0, 0);
}

/** Tiles waiting to be painted, taken one per animation frame.
 *
 *  One per frame rather than all at once, because the queue's whole reason to
 *  exist is that a tile is worth a real slice of a frame: painting a panel's
 *  worth in one go blocks the thread until the last one is done, and the panel
 *  that just opened sits frozen behind it. Spread out, the panel paints first
 *  and stays interactive while its pictures fill in — and a tile whose answer is
 *  no longer wanted (the panel has closed, the slider has moved on) is pulled
 *  back off the queue by its effect's cleanup instead of being painted and
 *  thrown away. */
const queue: Array<() => void> = [];
let pumping = false;

function pump(): void {
  const job = queue.shift();
  if (!job) {
    pumping = false;
    return;
  }
  job();
  requestAnimationFrame(pump);
}

/** Put a paint job in line. Returns the way to take it back out. */
export function enqueuePaint(job: () => void): () => void {
  queue.push(job);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return () => {
    const at = queue.indexOf(job);
    if (at >= 0) queue.splice(at, 1);
  };
}

/** Run a job when the browser has nothing better to do. Returns the way to call
 *  it off, so an effect that warms something can stop warming it.
 *
 *  Safari has no idle callback; a beat after whatever asked for this has settled
 *  is close enough to "idle" for a job that only queues work. */
export function atIdle(job: () => void, delay = 400): () => void {
  if (typeof window === "undefined") return () => {};
  const idle = (
    window as Window & {
      requestIdleCallback?: (fn: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    }
  ).requestIdleCallback;
  if (idle) {
    const handle = idle(job);
    return () =>
      (
        window as Window & { cancelIdleCallback?: (handle: number) => void }
      ).cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(job, delay);
  return () => window.clearTimeout(handle);
}
