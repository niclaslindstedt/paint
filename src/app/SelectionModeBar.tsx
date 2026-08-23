// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  ChevronUpIcon,
  CloseIcon,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import type { SelectMode } from "./selectMode.ts";

// The selection mode, in force and out of the way — what is left of the chooser
// once you have picked from it (see `SelectionModeModal.tsx`).
//
// It is the same bargain the folded-away effect options make (`EffectBar.tsx`),
// and it exists for a sharper version of the same reason. Add and Subtract are
// **sticky**: they change what every gesture means until they are put back, and
// on a phone there is nothing else to say so — no cursor to hang a **+** off, no
// key being held that a hand can feel. A mode nobody can see is a mode that eats
// the selection you spent a minute building and never says why.
//
// So the dialog folds down to this: the mode in words at the foot of the canvas,
// a way back to the chooser, and a ✕ that puts the mode back to Replace. Small,
// pointer-transparent except for its own two buttons, and never a `Modal` — a
// card that took the pointer would be the thing being folded away.
//
// It stands aside for the folded effect options rather than stacking with them:
// aiming a cut is one job and the mode is another, and two cards in the same
// corner is a corner nobody can read (see `CanvasScreen.tsx`).
//
// A **held** key gets the same strip with a different sentence. "You are holding
// Alt" is not "this app is in Subtract mode" — one ends when you let go — so the
// held reading has no ✕ to press and says the key rather than the setting.

type Props = {
  /** The mode in force. Never `"replace"`: that is the app's normal, and a
   *  strip that said so would be a strip that is always there. */
  mode: Exclude<SelectMode, "replace">;
  /** Whether it is a key being held rather than a mode that was set. */
  held: boolean;
  onOpen: () => void;
  onClear: () => void;
};

export function SelectionModeBar({ mode, held, onOpen, onClear }: Props) {
  const t = useT();
  const name = t(`selectMode.${mode}`);
  return (
    // The same corner and the same clearance as the effect strip: away from the
    // zoom readout, which is the one other thing that floats over the page.
    <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-10 flex justify-start pr-14">
      <div className="pointer-events-auto flex max-w-full min-w-0 items-center gap-1 rounded-xl border border-accent/60 bg-surface/95 py-1 pr-1 pl-2.5 shadow-lg">
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("selectMode.change")}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-2"
        >
          {/* The mark the pointer wears, at the size a caption wants — so the
              strip and the cursor are recognisably saying the same thing (see
              `PointerRing.tsx`). */}
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] leading-none font-bold text-accent"
          >
            {mode === "add" ? "+" : "−"}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-bold text-fg-bright">
              {name}
            </span>
            <span className="truncate text-[11px] text-muted">
              {held ? t("selectMode.holding") : t("selectMode.sticky")}
            </span>
          </span>
          {!held && <ChevronUpIcon className="h-4 w-4 shrink-0 text-muted" />}
        </button>
        {!held && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("selectMode.clear")}
            title={t("selectMode.clear")}
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg-bright"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
