// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { CloseIcon } from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import type { Point } from "./types.ts";
import { toScreenPoint, type CanvasView } from "./viewport.ts";

// "And the middle?" — asked once, where you are looking.
//
// Draw a circle with the selection pencil and the disc inside it is not
// selected, because nothing painted it; the same goes for a trace round a ring
// and a lasso doubled back on itself. **Gap select** exists for exactly this and
// fixes it in one press — but only for a hand that knows it is there, and a
// tool you have to already know about is a tool that solves the problem for
// nobody (see `selectGap.ts` for when the app decides to say something).
//
// So the app offers. Which makes *where* the card goes the whole design: it
// floats in the pocket it is talking about, at the roomiest point of it, so
// there is nothing to read and nothing to aim at — the thing being offered is
// underneath the offer. A strip at the foot of the canvas would have been less
// code and would have needed a sentence naming the shape.
//
// It is an offer and not a rule because "round the outside" is a real answer:
// a frame, a halo, a rubbed-out ring. Ignore it and it goes the instant the
// window changes by any other means (see `CanvasScreen.tsx`) — no timer, no
// second asking.

type Props = {
  view: CanvasView;
  /** The point in the pocket the card floats over, in document pixels. */
  at: Point;
  onFill: () => void;
  onDismiss: () => void;
};

export function GapOffer({ view, at, onFill, onDismiss }: Props) {
  const t = useT();
  const spot = toScreenPoint(view, at);
  return (
    // Pointer-transparent but for the card itself: the picture underneath is
    // still the canvas's, and a press beside the card paints as it always did.
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div
        className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-xl border border-accent/60 bg-surface/95 py-1 pr-1 pl-3 shadow-lg"
        style={{ left: `${spot.x}px`, top: `${spot.y}px` }}
      >
        <span className="text-sm whitespace-nowrap">{t("gapOffer.ask")}</span>
        <button
          type="button"
          onClick={onFill}
          className="cursor-pointer rounded-lg bg-accent px-2.5 py-1 text-sm font-medium text-surface hover:opacity-90"
        >
          {t("gapOffer.fill")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("gapOffer.dismiss")}
          className="flex cursor-pointer items-center rounded-lg p-1 hover:bg-surface-2"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
