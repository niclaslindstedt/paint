// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  ChevronUpIcon,
  CloseIcon,
  SlidersIcon,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";

// An effect's options, folded away — what is left of the dialog while the page
// has the hand.
//
// It exists because one of these dialogs asks for something only the canvas can
// give. **Delete background is aimed with a tool**: the cut is a tracing, the
// tracing is painted on the page, and on a phone the dialog is the page. Closing
// the dialog to trace and opening it again worked, in the sense that a two-step
// dance you have to be told about works — the setting you were in the middle of
// went back to its preset every time, and nothing showed you the cut until you
// had finished guessing.
//
// So the dialog folds down to this instead. The draft is untouched, the page
// goes on previewing it as the outline grows (see `useEffecting`), and this
// strip is the way back — plus the one thing you might want without going back,
// which is to drop the whole idea.
//
// It is deliberately *not* a `Modal`: a card that took the pointer, held focus,
// or laid a scrim over the page would be the very thing being folded away. It
// is a small card at the foot of the canvas that nothing but its own two
// buttons can be pressed through.

type Props = {
  /** The effect being set up, in words — the same name its dialog wears. */
  name: string;
  /** What to do while it is folded away, where there is something to say: the
   *  aimed effect's "paint over the subject". `null` for the ones that are
   *  simply out of the way. */
  note: string | null;
  onRestore: () => void;
  onCancel: () => void;
};

export function EffectBar({ name, note, onRestore, onCancel }: Props) {
  const t = useT();
  return (
    // The right edge is left clear of the zoom readout, which lives in that
    // corner of the canvas and is a way back to the whole page — worth more
    // than the width it costs here.
    <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-10 flex justify-start pr-14">
      <div className="pointer-events-auto flex max-w-full min-w-0 items-center gap-1 rounded-xl border border-accent/60 bg-surface/95 py-1 pr-1 pl-2.5 shadow-lg">
        <button
          type="button"
          onClick={onRestore}
          aria-label={t("effects.restore", { name })}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-2"
        >
          <SlidersIcon className="h-4 w-4 shrink-0 text-accent" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-bold text-fg-bright">
              {name}
            </span>
            {note && (
              <span className="truncate text-[11px] text-muted">{note}</span>
            )}
          </span>
          <ChevronUpIcon className="h-4 w-4 shrink-0 text-muted" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("common.cancel")}
          title={t("common.cancel")}
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg-bright"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
