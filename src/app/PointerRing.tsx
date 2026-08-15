// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import { usesSize } from "./plugins/controls.ts";
import type { PaintPlugin } from "./plugins/types.ts";

// The brush outline: on a desktop, the pointer *is* the nib.
//
// A crosshair says where the next mark starts and nothing about how big it will
// be, so setting a width meant drawing a test stroke and undoing it. Every
// drawing app answers this the same way and has for thirty years: the cursor
// becomes a circle the size of the tool, and the mark is sized against the page
// it is going onto before it is made.
//
// Four decisions, and the first is why this is a DOM element rather than
// something painted into the canvas:
//
//   - **It must not cost a frame.** A mouse reports as fast as a stylus, and
//     repainting the page to move a ring would be a full blit per sample for
//     something that is not part of the drawing. The ring is one
//     absolutely-positioned div moved by `transform` — the compositor's job,
//     not the main thread's — and the canvas goes on repainting only when the
//     *drawing* changes. Nothing about it travels through React state either,
//     for the same reason the in-flight stroke doesn't.
//   - **It is a fine-pointer affordance.** A finger already covers the page it
//     is aiming at, and a ring under it would be a ring you cannot see. So it
//     is offered to a mouse and to a **pen** — a stylus is aimed exactly the way
//     a mouse is, and the hand holding one wants the same answer — and never to
//     a bare touch.
//   - **It is the width, honestly.** The circle is the tool's width in document
//     pixels put through the view transform, so zooming in grows it: what it
//     draws is how much *page* the nib covers, which is the only reading that
//     stays true at every zoom.
//   - **Only for a tool that has a width.** Read off the descriptor
//     (`usesSize`), so the bucket, the gradient, the dropper, the hand and the
//     marquee keep their crosshair without being named here.
//
// Two rings rather than one, in opposite colours, so it reads on a white sheet
// and on a black one without either being right — the same trick a marquee's
// marching ants use. The dot in the middle is the crosshair's one job kept: at a
// wide setting the ring's edge is nowhere near where the mark will land, and a
// hairline cursor with no centre is one you aim by guessing.

/** The smallest ring worth drawing, in CSS pixels. Below this the outline is
 *  smaller than the pointer itself and says less than the crosshair it would
 *  replace, so the crosshair stays. */
const MIN_RING = 7;

/** What the canvas needs from the ring: whether it is showing (which is also
 *  what hides the crosshair), the two calls its pointer handlers make, and the
 *  element itself to render. */
export type PointerRing = {
  shown: boolean;
  /** Put the ring under this pointer — or take it away, for a touch. */
  move: (e: { pointerType: string; clientX: number; clientY: number }) => void;
  hide: () => void;
  node: ReactNode;
};

/** What the surface's cursor should be — the gesture it is currently offering,
 *  named in the one vocabulary a browser has for it.
 *
 *  An open hand under a navigating tool, a closed one while the page is actually
 *  being moved, a caret under a typing tool, and — under a tool wearing the nib
 *  outline — **nothing**: the ring is the cursor, a crosshair inside it would be
 *  two aiming marks for one pointer, and it carries a centre dot for the
 *  precision the crosshair was there to give. Everything else gets crosshairs.
 *
 *  It lives here because the ring is the interesting half of the answer, and
 *  because every branch of it is read off the descriptor rather than off a tool
 *  id. */
export function cursorFor({
  plugin,
  placing,
  holding,
  ring,
}: {
  plugin: PaintPlugin | undefined;
  /** Something is floating over the page waiting to be settled. */
  placing: boolean;
  /** The page (or a selection on it) is being dragged right now. */
  holding: boolean;
  /** The nib outline is showing. */
  ring: boolean;
}): string {
  if (placing) return "default";
  if (holding) return "grabbing";
  if (plugin?.navigates) return "grab";
  if (plugin?.entersText) return "text";
  return ring ? "none" : "crosshair";
}

export function usePointerRing({
  hostRef,
  plugin,
  size,
  scale,
  disabled = false,
}: {
  /** The element the ring floats over, and the one the pointer is measured
   *  against. Its offset parent must be the box the ring is positioned in. */
  hostRef: RefObject<HTMLElement | null>;
  /** The tool in hand — it decides whether there is a width to draw at all. */
  plugin: PaintPlugin | undefined;
  /** That width, in document pixels. */
  size: number;
  /** Device-independent pixels per document pixel: the view's zoom. */
  scale: number;
  /** Suppressed while the canvas is doing something a nib has no part in —
   *  settling a dropped picture. */
  disabled?: boolean;
}): PointerRing {
  const ref = useRef<HTMLDivElement | null>(null);
  const diameter = size * scale;
  const shown = !disabled && usesSize(plugin) && diameter >= MIN_RING;

  const hide = useCallback(() => {
    const ring = ref.current;
    if (ring) ring.style.display = "none";
  }, []);

  const move = useCallback(
    (e: { pointerType: string; clientX: number; clientY: number }) => {
      const ring = ref.current;
      if (!ring) return;
      if (!shown || e.pointerType === "touch") {
        ring.style.display = "none";
        return;
      }
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      ring.style.display = "block";
      ring.style.transform = `translate(${e.clientX - rect.left}px, ${
        e.clientY - rect.top
      }px)`;
    },
    [shown, hostRef],
  );

  // A ring that has stopped belonging — the tool changed under it, the zoom
  // shrank it past the floor, a picture landed to be placed — goes away at once
  // rather than waiting for the pointer to move and take it away.
  useEffect(() => {
    if (!shown) hide();
  }, [shown, hide]);

  return {
    shown,
    move,
    hide,
    node: (
      <div
        ref={ref}
        aria-hidden="true"
        // Hidden until a pointer moves over the canvas and proves it is a fine
        // one. The negative margins are what centre it on the pointer without
        // spending the transform, which is carrying the position.
        style={{
          display: "none",
          width: `${diameter}px`,
          height: `${diameter}px`,
          marginLeft: `${-diameter / 2}px`,
          marginTop: `${-diameter / 2}px`,
        }}
        className="pointer-events-none absolute top-0 left-0 rounded-full border border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(0,0,0,0.55)]"
      >
        <span className="absolute top-1/2 left-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2 bg-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.55)]" />
      </div>
    ),
  };
}
