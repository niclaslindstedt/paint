// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What a tool is handed, and where on the page a pointer landed.
//
// A `ToolBehaviour` is pure — `start` / `move` / `end` take a draft and a
// context and return a draft (see `plugins/types.ts`) — which is what lets a
// whole gesture be driven in a node test. That purity has a price the component
// pays here: everything the tool is *not* told by the pointer has to be
// gathered for it, and every coordinate has to be in document space before it
// arrives, because document space is all a tool ever sees at any zoom.
//
// Three of the four things gathered here are cheap and one is not, which is why
// this is a seam of its own rather than an object literal in a handler:
//
//   - **the ink** — the colour, width and dials the toolbar is set to. A value.
//   - **the modifier** — whether Ctrl (or ⌘) is down *right now*, read off the
//     events as they arrive rather than off anything React rendered.
//   - **the window** — read through a ref, so the context a long gesture began
//     with still answers with the selection as it stands when the gesture
//     finally asks. The page's own size comes off the same ref, for the same
//     reason.
//   - **the page as pixels** — the snapshot the bucket and the dropper read
//     (`probe.ts`). Taken lazily and kept for the gesture: the document cannot
//     change while a pointer is down, so one snapshot answers every question a
//     drag asks, and a press that never reaches a tool that reads the page
//     never takes one at all. Reading it eagerly would rasterise the document
//     once per pencil sample.

import { useCallback, useRef } from "react";

import type { CanvasProbe, ToolContext } from "./plugins/types.ts";
import { createProbe } from "./probe.ts";
import type { Selection } from "./selection.ts";
import type { Drawing, Point } from "./types.ts";
import { toDocumentPoint, type CanvasView } from "./viewport.ts";

export function useToolContext({
  canvasRef,
  viewRef,
  pageRef,
  selectionRef,
  modifierHeld,
  ink,
  pageColor,
  defaultInk,
}: {
  canvasRef: { current: HTMLCanvasElement | null };
  viewRef: { current: CanvasView | null };
  /** The document as it stands, through a ref for the reason the window is. */
  pageRef: { current: Drawing };
  /** The window currently cut in the page, likewise. */
  selectionRef: { current: Selection | null };
  /** Whether Ctrl (or ⌘) is down right now — owned by whoever handles the
   *  pointer events, because a modifier is a property of the press rather than
   *  of anything React renders. */
  modifierHeld: { current: boolean };
  ink: Omit<ToolContext, "background" | "probe">;
  pageColor: string;
  defaultInk: string;
}) {
  const probe = useRef<CanvasProbe | null>(null);
  const openProbe = useCallback((): CanvasProbe => {
    probe.current ??= createProbe(pageRef.current, { pageColor, defaultInk });
    return probe.current;
  }, [pageRef, pageColor, defaultInk]);

  /** Throw the kept snapshot away — the press that owned it has ended, and the
   *  document is free to change again. */
  const dropProbe = useCallback(() => {
    probe.current = null;
  }, []);

  const context = useCallback(
    (): ToolContext => ({
      ...ink,
      background: pageColor,
      modifier: modifierHeld.current,
      // Both lazily, for the reasons at the top of this file.
      get probe() {
        return openProbe();
      },
      get selection() {
        return selectionRef.current?.region ?? null;
      },
      // The sheet itself, for the one gesture whose answer is bounded by it
      // rather than by anything drawn on it (see `ToolContext.page`). Off the
      // same ref the probe is built from, so a long gesture reads the page it
      // is actually on.
      get page() {
        const sheet = pageRef.current;
        return { width: sheet.width, height: sheet.height };
      },
    }),
    [ink, pageColor, openProbe, selectionRef, modifierHeld, pageRef],
  );

  /** A pointer event's position on the element, in CSS pixels. */
  const elementPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [canvasRef],
  );

  /** An element point in document space, which is all the tools ever see. */
  const toDoc = useCallback(
    (at: Point): Point => {
      const current = viewRef.current;
      if (!current) return { x: 0, y: 0 };
      return toDocumentPoint(current, at);
    },
    [viewRef],
  );

  /** …and the same, straight from a pointer event. */
  const documentPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => toDoc(elementPoint(e)),
    [elementPoint, toDoc],
  );

  return {
    context,
    openProbe,
    dropProbe,
    elementPoint,
    toDoc,
    documentPoint,
  };
}
