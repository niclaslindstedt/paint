// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect } from "react";

import {
  Button,
  ChevronDownIcon,
  GripIcon,
  Modal,
  SegmentedControl,
  ToggleRow,
} from "@niclaslindstedt/oss-framework/components";
import { useMediaQuery } from "@niclaslindstedt/oss-framework/hooks";

import {
  autoLevels,
  curvesAreStraight,
  straightCurves,
  type CurveChannel,
} from "./adjust.ts";
import { holdBackdrop } from "./backdrop.ts";
import { CurveEditor, straightLine } from "./CurveEditor.tsx";
import {
  choiceValue,
  controlRange,
  controlReadout,
  controlValue,
  curveSet,
  offersScope,
  switchValue,
  unclaimedControls,
  withChoice,
  withControl,
  withCurveSet,
  withSwitch,
  type Effect,
  type EffectDescriptor,
  type EffectScope,
} from "./effects.ts";
import { EffectPeek } from "./EffectPeek.tsx";
import { EffectSlider } from "./EffectSlider.tsx";
import type { Histogram } from "./histogram.ts";
import { useT, type TKey } from "./i18n/index.ts";
import { LevelsBar } from "./LevelsBar.tsx";
import type { RenderOptions } from "./render.ts";
import type { Drawing, Point } from "./types.ts";
import { useDialogDrag } from "./useDialogDrag.ts";

// One effect's options — and the one press that lands it.
//
// It is a dialog rather than a panel of sliders in the sidebar for two reasons.
// The first is room: sliders in a 224-pixel column would be three rows of
// controls per effect, permanently between the page actions and the layer
// stack, on a panel whose whole job is to be glanceable. The second is that an
// effect is **destructive**, and something destructive deserves a surface with a
// primary button on it rather than a control you can nudge by accident.
//
// So the section's row is the name, and this is where the numbers, the scope and
// the warning live. It is deliberately the shape the resize dialog has — same
// modal, same footer, same one primary button — because they are the same kind
// of thing: a change to the drawing with a question to ask first.
//
// **The page behind shows the answer, and still nothing lands until Apply.**
// A radius in page pixels is not a number anyone can picture, so the effect is
// painted on the drawing itself while the sliders move — through the *same*
// composite the bake will rasterise (see `render.ts`), on the same layers, so
// what you approve is what you get. The preview is the screen's state rather
// than the document's, so a slider dragged from end to end and thought better of
// costs no undo step, no push to the cloud, and no edit at all.
//
// Which is also why this dialog, alone among them, takes the scrim away while it
// is open (`holdBackdrop`): the page it is previewing is the page behind it, and
// a preview seen through a black — or blurred — veil is not one.
//
// ## Where the card sits, and what that costs
//
// A dialog whose subject is the page behind it has a problem no other dialog
// has: it is *in front of the answer*. Two widths, two answers, and the dialog
// picks between them here rather than leaving the stylesheet to re-derive it
// (`data-previewing`, see `styles.css`):
//
//   - **A screen with room beside it.** The card drops to the foot of the window
//     and can be dragged anywhere from there by its title row (`useDialogDrag`).
//     There is no resting place that is right for every drawing — the
//     interesting part of a landscape sketch is often exactly where a
//     bottom-anchored card lands — so the last word is the hand's.
//   - **A phone.** The card is the screen; there is no aside to step to. So it
//     goes edge to edge and carries its own window onto the page instead: a
//     preview you can pan and zoom, painted from the very same draft (see
//     `EffectPeek`). A preview of a page nobody can see is not a preview.
//
// ## Folding it away
//
// Both of those still assume the card is the thing you are looking at, and one
// effect breaks that assumption outright: **Delete background is aimed with a
// tool**, and a tool needs the page. So the footer carries a Put away button —
// the footer because it is the one row of this card that does not scroll — and
// pressing it puts the card away without closing it: the draft is intact, the
// page goes on previewing it, and what is left is a strip at the foot of the
// canvas (see `EffectBar`). Trace the subject with the options still open, watch
// the cut follow the outline, and bring them back to apply.
//
// It is not only for the aimed one. Any of these can be in front of the part of
// the drawing you are judging it by, and on a phone all of them are.
//
// The controls are read off the descriptor and nothing here knows which effect
// it is showing — a new effect is a descriptor in `effects.ts` and its catalog
// strings, and this dialog renders it without being told. Five kinds of control
// exist and that is the whole list: a slider, a switch, a pick-one, a tone
// curve, and a levels bar — the last two being the ones whose value is a shape
// rather than a number, and both declared by the descriptor exactly as the
// sliders are.

/** The width at which the card has room to step aside rather than being the
 *  whole screen. The same breakpoint the app docks its sidebar at one size up —
 *  and the *only* place it is decided, because the marker below carries the
 *  answer into the stylesheet. */
const ROOMY = "(min-width: 768px)";

type Props = {
  descriptor: EffectDescriptor;
  /** The effect being set up: what the controls show, and what the page behind
   *  is being painted through. Held by the screen because the preview is
   *  painted there — see `CanvasScreen`. */
  draft: Effect;
  onDraft: (next: Effect) => void;
  /** Where it would land, and how to change that. A single-scope effect (noise)
   *  shows no picker: one option is not a decision. */
  scope: EffectScope;
  onScope: (next: EffectScope) => void;
  /** What the scope currently names, in words — the selected layer, or how many
   *  layers "all layers" came to. The warning and the empty note both read it,
   *  because "this will flatten Layer 2" is the sentence worth putting in front
   *  of a destructive button. */
  target: string;
  /** Nothing to apply it to: the scope named no layer with a mark on it. The
   *  primary button is dead rather than hidden, so the dialog still explains
   *  itself instead of silently doing nothing. */
  empty: boolean;
  /** What the empty line says when the reason is not the usual one — an
   *  aimed effect opened with nothing traced says *that*, not "the layer is
   *  blank". The default is the ordinary nothing-on-the-layer line. */
  emptyKey?: TKey;
  /** The page this is aimed at, for the controls that have to *show* it: the
   *  window on a phone, and the histogram under a levels bar. `null` where
   *  there is nothing to show — the dialog then renders every control it has,
   *  minus its pictures. */
  page: {
    drawing: Drawing;
    /** How the page is painted, the draft effect included, so the window in
     *  here and the canvas behind it are painted from one value. */
    options: RenderOptions;
    /** What the canvas was looking at when this opened — where the window
     *  opens, so the first thing it shows is the thing you were looking at. */
    look: { at: Point; scale: number } | null;
    /** The tones of the layers it would land on, counted once per opening
     *  (see `histogram.ts`). `null` for an effect with no levels bar, or a page
     *  whose pixels could not be read. */
    tones: Histogram | null;
  } | null;
  onCancel: () => void;
  onApply: (effect: Effect) => void;
  /** Fold the card away to a strip and leave the page to the hand. The draft
   *  stays exactly as it is and the page keeps previewing it — see the note on
   *  minimizing at the top of this file. */
  onMinimize: () => void;
};

export function EffectModal({
  descriptor,
  draft,
  onDraft,
  scope,
  onScope,
  target,
  empty,
  emptyKey,
  page,
  onCancel,
  onApply,
  onMinimize,
}: Props) {
  const t = useT();
  const roomy = useMediaQuery(ROOMY);
  const drag = useDialogDrag(roomy);
  // The scrim, for as long as these options are open — and put back exactly as
  // it was on the way out, whatever the Appearance tab has it set to.
  useEffect(() => holdBackdrop(), []);

  const levels = descriptor.levels;
  const levelsRange = levels && {
    black: controlRange(descriptor, levels.blackId),
    white: controlRange(descriptor, levels.whiteId),
    gamma: controlRange(descriptor, levels.gammaId),
  };
  /** One levels control's label, with its value already in it — the same string
   *  the slider it stands in for wore. */
  const levelsLabel = (id: string) => {
    const control = controlRange(descriptor, id);
    return control
      ? t(control.nameKey, {
          value: String(controlReadout(control, controlValue(draft, id))),
        })
      : id;
  };

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="effect-title"
      centered
      size="max-w-md"
      closeLabel={t("common.cancel")}
      footer={
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          {/* Out of the way — in the footer rather than up in the title row,
              because the footer is the one part of this card that does not
              scroll. On a phone the options are a column taller than the
              screen and the title row is the first thing to leave it; a way
              out of the dialog you have to scroll back up for is one you look
              for while holding a half-drawn tracing. */}
          <Button
            variant="secondary"
            onClick={onMinimize}
            title={t("effects.minimize")}
          >
            <span className="flex items-center gap-1.5">
              <ChevronDownIcon className="h-4 w-4" />
              {t("effects.minimizeShort")}
            </span>
          </Button>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={empty}
            onClick={() => onApply(draft)}
          >
            {t("effects.apply")}
          </Button>
        </footer>
      }
    >
      {/* The marker the stylesheet reads to place the card off the middle of the
          page it is previewing, and which of the two ways it does that — see
          `styles.css`. It scrolls its own contents, because on a phone this is
          the whole screen and there is a window at the top of it. */}
      <div
        data-previewing={roomy ? "loose" : "full"}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
      >
        {/* The title row, which on a wide screen is also the handle the card is
            moved by. The pointer may take hold of the whole row — a title is a
            big, obvious thing to grab, and it says so with the cursor — while
            the *announced* control is the grip beside it, which is what a
            keyboard puts focus on and moves with the arrows. Two ways in, one
            behaviour, and no application region wrapped around a heading. */}
        <div
          ref={drag.gripRef}
          onPointerDown={drag.onPointerDown}
          className={`flex items-center gap-1 ${roomy ? "cursor-move touch-none" : ""}`}
        >
          {roomy && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("effects.move")}
              title={t("effects.move")}
              onKeyDown={drag.onKeyDown}
              className="-ml-1 inline-flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-muted hover:text-fg-bright focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            >
              <GripIcon className="h-3.5 w-3.5" />
            </span>
          )}
          <h2
            id="effect-title"
            className="min-w-0 flex-1 text-base font-bold text-fg-bright"
          >
            {t(descriptor.nameKey)}
          </h2>
          {roomy && drag.moved && (
            <button
              type="button"
              onClick={drag.recentre}
              className="shrink-0 cursor-pointer text-[11px] text-muted hover:text-fg-bright"
            >
              {t("effects.recentre")}
            </button>
          )}
        </div>
        <p className="text-xs text-muted">{t(descriptor.hintKey)}</p>

        {/* The window onto the page, on the widths where the page is behind the
            whole screen. It sticks to the top of the scroller: the controls
            below it are what you are dragging, and a preview that scrolls away
            while you drag is one you cannot use. */}
        {!roomy && page && (
          <div className="sticky top-0 z-10 -mx-5 -mt-4 bg-surface px-5 pt-4 pb-2">
            <EffectPeek
              drawing={page.drawing}
              options={page.options}
              look={page.look}
              labels={{
                title: t("effects.peek.title"),
                hint: t("effects.peek.hint"),
                fit: t("effects.peek.fit"),
                before: t("effects.peek.before"),
                zoom: (percent: string) => t("canvas.zoomPercent", { percent }),
              }}
            />
          </div>
        )}

        {/* Pick-one options first: which tones a colour balance is aimed at,
            or which of a curve's four lines the hand is on. They come above the
            sliders because they change what the sliders *mean*. */}
        {descriptor.choices?.map((choice) => (
          <div key={choice.id} className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t(choice.nameKey)}</span>
            <SegmentedControl<string>
              value={choiceValue(draft, choice.id)}
              onChange={(next) => onDraft(withChoice(draft, choice.id, next))}
              fullWidth
              ariaLabel={t(choice.nameKey)}
              options={choice.options.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
            />
          </div>
        ))}

        {/* The first control that is not a number. */}
        {descriptor.curve &&
          (() => {
            const spec = descriptor.curve;
            const curves = curveSet(draft, spec.id);
            const channel = (choiceValue(draft, spec.channelId) ||
              "rgb") as CurveChannel;
            return (
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted">{t(spec.labelKey)}</span>
                  <button
                    type="button"
                    disabled={curvesAreStraight(curves)}
                    onClick={() =>
                      onDraft(withCurveSet(draft, spec.id, straightCurves()))
                    }
                    className="cursor-pointer text-[11px] text-muted hover:text-fg-bright disabled:cursor-default disabled:opacity-40"
                  >
                    {t(spec.resetKey)}
                  </button>
                </div>
                <CurveEditor
                  points={curves[channel] ?? straightLine()}
                  channel={channel}
                  label={t(spec.labelKey)}
                  removeHint={t(spec.hintKey)}
                  onChange={(next) =>
                    onDraft(
                      withCurveSet(draft, spec.id, {
                        ...curves,
                        [channel]: next,
                      }),
                    )
                  }
                />
              </div>
            );
          })()}

        {/* …and the second: three numbers drawn over a picture of the tones they
            are aimed at. The sliders they stand in for are not rendered — they
            are the same three fields on the same draft, reached by a control
            that shows what they are for (see `unclaimedControls`). */}
        {levels &&
          levelsRange?.black &&
          levelsRange.white &&
          levelsRange.gamma &&
          (() => {
            const range = {
              black: levelsRange.black!,
              white: levelsRange.white!,
              gamma: levelsRange.gamma!,
            };
            const auto = autoLevels(page?.tones ?? null, range);
            const neutral =
              controlValue(draft, levels.blackId) === range.black.min &&
              controlValue(draft, levels.whiteId) === range.white.max &&
              controlValue(draft, levels.gammaId) === 1;
            return (
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted">
                    {t(levels.labelKey)}
                  </span>
                  <span className="flex gap-3">
                    <button
                      type="button"
                      disabled={!auto}
                      onClick={() =>
                        auto &&
                        onDraft(
                          withControl(
                            withControl(draft, levels.blackId, auto.black),
                            levels.whiteId,
                            auto.white,
                          ),
                        )
                      }
                      className="cursor-pointer text-[11px] text-muted hover:text-fg-bright disabled:cursor-default disabled:opacity-40"
                    >
                      {t(levels.autoKey)}
                    </button>
                    <button
                      type="button"
                      disabled={neutral}
                      onClick={() =>
                        onDraft(
                          withControl(
                            withControl(
                              withControl(
                                draft,
                                levels.blackId,
                                range.black.min,
                              ),
                              levels.whiteId,
                              range.white.max,
                            ),
                            levels.gammaId,
                            1,
                          ),
                        )
                      }
                      className="cursor-pointer text-[11px] text-muted hover:text-fg-bright disabled:cursor-default disabled:opacity-40"
                    >
                      {t(levels.resetKey)}
                    </button>
                  </span>
                </div>
                <LevelsBar
                  histogram={page?.tones ?? null}
                  black={controlValue(draft, levels.blackId)}
                  white={controlValue(draft, levels.whiteId)}
                  gamma={controlValue(draft, levels.gammaId)}
                  range={range}
                  onChange={(next) =>
                    onDraft(
                      withControl(
                        withControl(
                          withControl(draft, levels.blackId, next.black),
                          levels.whiteId,
                          next.white,
                        ),
                        levels.gammaId,
                        next.gamma,
                      ),
                    )
                  }
                  labels={{
                    black: levelsLabel(levels.blackId),
                    white: levelsLabel(levels.whiteId),
                    gamma: levelsLabel(levels.gammaId),
                  }}
                  hint={t(levels.hintKey)}
                  note={
                    page?.tones
                      ? t("effects.levels.range", {
                          low: String(page.tones.low),
                          high: String(page.tones.high),
                        })
                      : null
                  }
                />
              </div>
            );
          })()}

        {unclaimedControls(descriptor).map((control) => (
          <EffectSlider
            key={control.id}
            control={control}
            value={controlValue(draft, control.id)}
            label={(value) =>
              t(control.nameKey, {
                value: String(controlReadout(control, value)),
              })
            }
            settles={descriptor.settles === true}
            onChange={(next) => onDraft(withControl(draft, control.id, next))}
          />
        ))}

        {descriptor.switches.map((option) => (
          <ToggleRow
            key={option.id}
            label={t(option.nameKey)}
            hint={t(option.hintKey)}
            checked={switchValue(draft, option.id)}
            onChange={(on) => onDraft(withSwitch(draft, option.id, on))}
          />
        ))}

        {/* Where it lands. Offered only by the effects that have somewhere else
            to go: grain belongs to the sheet a mark was made on, so it is one
            layer's and there is nothing to pick. */}
        {offersScope(descriptor) && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("effects.scopeLabel")}
            </span>
            <SegmentedControl<EffectScope>
              value={scope}
              onChange={onScope}
              fullWidth
              ariaLabel={t("effects.scopeLabel")}
              options={descriptor.scopes.map((option) => ({
                value: option,
                label:
                  option === "layer"
                    ? t("effects.scopeLayer")
                    : t("effects.scopeDrawing"),
              }))}
            />
            <span className="text-[11px] text-muted">
              {scope === "layer"
                ? t("effects.scopeLayerHint", { layer: target })
                : t("effects.scopeDrawingHint")}
            </span>
          </div>
        )}

        {/* The one thing the sliders cannot say for themselves: this is an
            edit, not a setting, and here is exactly what it is about to
            rewrite. */}
        <p className="border-t border-line pt-3 text-[11px] text-muted">
          {empty
            ? t(emptyKey ?? "effects.empty", { target })
            : t("effects.warning", { target })}
        </p>
        <p className="text-[11px] text-muted">
          {roomy || !page
            ? t("effects.previewHint")
            : t("effects.peek.previewHint")}
          {/* …and, where a repaint costs more than a frame, *when*: the
              readout follows the thumb and the picture waits for the release
              (see `EffectSlider`). Said out loud, because a preview that does
              not move while a slider does reads as a broken one until you know
              it is deliberate. */}
          {descriptor.settles && ` ${t("effects.settleHint")}`}
        </p>
      </div>
    </Modal>
  );
}
