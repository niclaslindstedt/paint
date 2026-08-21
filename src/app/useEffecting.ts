// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { effectTargets } from "./bake.ts";
import {
  defaultScope,
  effectDescriptor,
  withSubject,
  type Effect,
  type EffectKind,
  type EffectScope,
} from "./effects.ts";
import { layerTones, type Histogram } from "./histogram.ts";
import { activeLayer } from "./layers.ts";
import type { EffectPreview, RenderOptions } from "./render.ts";
import type { Drawing, Point } from "./types.ts";
import { toDocumentPoint, type CanvasView } from "./viewport.ts";

// Everything an effect's options need while they are open.
//
// The screen owns the dialog the way it owns the resize one, but an effect
// being set up is not one piece of state — it is a draft, a scope, the layers
// that scope names, the preview the canvas paints from it, a count of the tones
// it would land on, and the render options a phone's preview window is painted
// through. Six values that only exist together, all of them derived from two,
// and every one of them with a rule about **what it may not depend on**. Left in
// `CanvasScreen` they were six memos in the middle of a component that is
// already about a dozen other things.
//
// The rules are the reason this is worth its own file, because each is a real
// cost if it is broken:
//
//   - `targets` depends on the **scope**, never on the draft. It feeds the
//     histogram, which rasterises the page; a list that changed identity per
//     frame would rasterise per frame.
//   - `preview` depends on the draft and is compared **by identity** by the mark
//     cache (see `cache.ts`), so it must be one object per (draft, targets) and
//     not one per render.
//   - `tones` is counted once per opening, for the effects that draw one.
//   - `look` is taken **once**, when the dialog opens: it is where you were, not
//     where you are.
//
// Nothing here touches the document. A draft is screen state like the view or a
// half-typed caption, and the store hears nothing until the dialog's Apply.

/** An effect's options, open. */
export type Effecting = {
  kind: EffectKind;
  draft: Effect;
  scope: EffectScope;
  /** What the canvas was looking at when this opened — where the dialog's own
   *  window onto the page opens, on the widths where the dialog *is* the screen
   *  (see `EffectPeek`). */
  look: { at: Point; scale: number } | null;
};

/** What the dialog is handed to show the page with. */
export type EffectPage = {
  drawing: Drawing;
  options: RenderOptions;
  look: { at: Point; scale: number } | null;
  tones: Histogram | null;
};

export type EffectingControl = {
  effecting: Effecting | null;
  /** Open one effect's options.
   *
   *  The draft is seeded from the descriptor's preset — a visible setting, so
   *  the page shows something from the first frame the dialog is up — and the
   *  scope from the narrower of the ones it offers. Neither is remembered
   *  between openings: an effect leaves nothing on the document to read back,
   *  which is exactly what makes it an effect (see `effects.ts`). */
  open: (kind: EffectKind) => void;
  close: () => void;
  setDraft: (next: Effect) => void;
  setScope: (next: EffectScope) => void;
  /** Which layers the open dialog would land on. */
  targets: string[];
  /** What the canvas paints the draft through, or `null` with nothing open. */
  preview: EffectPreview | null;
  /** The page the dialog shows, or `null` with no drawing to show. */
  page: EffectPage | null;
};

export function useEffecting({
  drawing,
  pageColor,
  ink,
  checker,
  view,
  window: viewportRef,
  subject,
}: {
  drawing: Drawing | null;
  pageColor: string;
  /** The ink an unpicked mark resolves to on that page. */
  ink: string;
  checker: readonly [string, string];
  /** Where the canvas is looking. Read through a ref rather than a dependency,
   *  so `open` keeps its identity across every pan. */
  view: CanvasView | null;
  /** The element the canvas fills, for the size of that window. */
  window: { current: HTMLElement | null };
  /** The traced subject an aimed effect opens with — the selection's contours,
   *  read at the moment of opening (a getter over a ref for the same reason
   *  `view` is: `open` must keep its identity across every gesture). The draft
   *  keeps its stamp from then on: it is what you had traced when you asked. */
  subject?: () => readonly (readonly Point[])[] | null;
}): EffectingControl {
  const [effecting, setEffecting] = useState<Effecting | null>(null);
  const viewRef = useRef<CanvasView | null>(null);
  viewRef.current = view;

  const open = useCallback(
    (kind: EffectKind) => {
      const descriptor = effectDescriptor(kind);
      if (!descriptor) return;
      const seen = viewRef.current;
      const box = viewportRef.current?.getBoundingClientRect();
      setEffecting({
        kind,
        draft: withSubject(descriptor.preset, subject?.() ?? []),
        scope: defaultScope(descriptor),
        look:
          seen && box
            ? {
                at: toDocumentPoint(seen, {
                  x: box.width / 2,
                  y: box.height / 2,
                }),
                scale: seen.scale,
              }
            : null,
      });
    },
    [viewportRef, subject],
  );

  const close = useCallback(() => setEffecting(null), []);
  const setDraft = useCallback(
    (draft: Effect) =>
      setEffecting((current) => (current ? { ...current, draft } : null)),
    [],
  );
  const setScope = useCallback(
    (scope: EffectScope) =>
      setEffecting((current) => (current ? { ...current, scope } : null)),
    [],
  );

  // The options are about the page they were opened over, so they close with
  // it: an effect aimed at one drawing means nothing on the next.
  const openPage = drawing?.id;
  useEffect(() => setEffecting(null), [openPage]);

  const scope = effecting?.scope ?? null;
  const targets = useMemo(
    () =>
      drawing && scope
        ? effectTargets(drawing, scope, activeLayer(drawing).id)
        : [],
    [drawing, scope],
  );
  const preview = useMemo(
    () =>
      effecting && targets.length > 0
        ? { effect: effecting.draft, layerIds: new Set(targets) }
        : null,
    [effecting, targets],
  );
  const kind = effecting?.kind ?? null;
  const tones = useMemo(() => {
    const descriptor = kind ? effectDescriptor(kind) : undefined;
    if (!drawing || !descriptor?.levels || targets.length === 0) return null;
    return layerTones(drawing, targets, { pageColor, defaultInk: ink });
  }, [kind, drawing, targets, pageColor, ink]);
  // How the page is painted, for the window the dialog carries when it is the
  // whole screen: the colours the canvas is painted with plus the same draft, so
  // the two windows cannot show different pictures. No grid — a drawing aid
  // ruled across a preview is noise, not help.
  const options = useMemo(
    () => ({
      pageColor,
      defaultInk: ink,
      checker,
      preview: preview ?? undefined,
    }),
    [pageColor, ink, checker, preview],
  );
  const page = useMemo(
    () =>
      drawing
        ? { drawing, options, look: effecting?.look ?? null, tones }
        : null,
    [drawing, options, effecting?.look, tones],
  );

  return {
    effecting,
    open,
    close,
    setDraft,
    setScope,
    targets,
    preview,
    page,
  };
}
