// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Button, Modal } from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import { SELECT_MODES, type SelectMode } from "./selectMode.ts";

// **What the next selection gesture is for** — the three answers, as a dialog.
//
// It is opened by *holding* the selection button down, which is the one gesture
// a phone has left: a press picks the tool, a second press opens the family
// behind it (see `Toolbar.tsx`), and a hold is the third thing that button can
// mean. On a desktop the keys say it instead — Shift adds, Alt takes away — so
// this dialog is the touch half of a pair, and the strip it leaves behind is
// what a finger has instead of a key it can feel itself holding (see
// `SelectionModeBar.tsx`).
//
// Three rows rather than a segmented control, because each of them needs a
// sentence. "Add" beside "Subtract" is two words that sound like they belong to
// the marks rather than to the *window*, and the whole mode is worthless if it
// is picked by guessing: the picture it changes is the one you have already
// spent a minute building.
//
// **Dismissing it is not cancelling it.** Picking a mode closes the dialog and
// leaves the mode in force; so does the ✕, which leaves whatever was picked
// last. That is the delete-background dialog's bargain (see `EffectBar.tsx`) and
// it is the right one here for the same reason: the page is the thing you now
// have to use the mode *on*, and a dialog you cannot get out of the way of is a
// dialog that has to be cancelled to be used.
//
// The little diagrams are diagrams rather than icon-set glyphs, and they live
// here rather than in `icons.tsx` because that is what they are: two windows and
// the area you would be left with, drawn once at dialog size and never at
// toolbar size beside twenty other marks. They borrow the marquee's dashes so
// the square you are looking at is recognisably the outline on the page.

type Props = {
  mode: SelectMode;
  onPick: (mode: SelectMode) => void;
  onClose: () => void;
};

/** The dashes the selection tools' own glyphs are drawn with, so a window in a
 *  diagram reads as a window on the page. */
const DASH = "3.2 2.6";

/** A mode, drawn: the window you have (up and to the left) and the area the
 *  next gesture chooses (down and to the right), with **what you would be left
 *  with** shaded in. Every row is the same two squares in the same two places —
 *  only the shading moves, which is exactly the difference between the modes.
 *
 *  The two windows are the rectangles x4–19,y4–16 and x13–28,y8–20; the L below
 *  is the first with the second taken out of it. Written out as one path rather
 *  than clipped, because three fixed shapes that never move want no machinery. */
function ModeDiagram({ mode }: { mode: SelectMode }) {
  return (
    <svg
      viewBox="0 0 32 24"
      className="h-7 w-9 shrink-0 text-accent"
      aria-hidden="true"
      fill="none"
    >
      {/* What survives. One group at one opacity, so the two rectangles of an
          add read as a single area rather than as a darker patch where they
          overlap. */}
      <g opacity="0.3" fill="currentColor">
        {mode === "replace" && <rect x="13" y="8" width="15" height="12" />}
        {mode === "add" && (
          <>
            <rect x="4" y="4" width="15" height="12" />
            <rect x="13" y="8" width="15" height="12" />
          </>
        )}
        {mode === "subtract" && <path d="M4 4h15v4h-6v8H4Z" />}
      </g>
      {/* …and the two windows themselves, always both and always in the same
          place: the one that is up, and the one this gesture would cut. The
          one being replaced is drawn faint, because that is what replacing it
          does to it. */}
      <rect
        x="4"
        y="4"
        width="15"
        height="12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray={DASH}
        opacity={mode === "replace" ? 0.4 : 1}
      />
      <rect
        x="13"
        y="8"
        width="15"
        height="12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray={DASH}
      />
    </svg>
  );
}

export function SelectionModeModal({ mode, onPick, onClose }: Props) {
  const t = useT();
  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="select-mode-title"
      centered
      size="max-w-sm"
      closeLabel={t("selectMode.dismiss")}
      footer={
        // One button, and it is not Cancel: there is nothing to cancel, because
        // picking a mode has already done it. It says what it does — the
        // options go, the mode stays, and the strip over the canvas is the way
        // back — which is the word the folded-away effect options use for the
        // same move (see `EffectBar.tsx`).
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button
            variant="secondary"
            onClick={onClose}
            title={t("selectMode.dismiss")}
          >
            {t("selectMode.dismissShort")}
          </Button>
        </footer>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-1">
          <h2
            id="select-mode-title"
            className="text-base font-bold text-fg-bright"
          >
            {t("selectMode.title")}
          </h2>
          <p className="text-xs text-muted">{t("selectMode.hint")}</p>
        </div>

        <div className="flex flex-col gap-1.5" role="radiogroup">
          {SELECT_MODES.map((option) => {
            const on = option === mode;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(option)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                  on
                    ? "border-accent bg-accent/10"
                    : "border-line hover:border-accent/60 hover:bg-surface-2"
                }`}
              >
                <ModeDiagram mode={option} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-bold text-fg-bright">
                    {t(`selectMode.${option}`)}
                  </span>
                  <span className="text-xs text-muted">
                    {t(`selectMode.${option}Hint`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* The keyboard's half of the same question, said once. It is not an
            instruction for the device that is reading this dialog — a phone has
            no Alt — but a hand that has one is a hand that never has to open
            this dialog again. */}
        <p className="text-[11px] text-muted">{t("selectMode.keys")}</p>
      </div>
    </Modal>
  );
}
