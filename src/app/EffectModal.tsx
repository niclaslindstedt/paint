// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect } from "react";

import {
  Button,
  Modal,
  SegmentedControl,
  ToggleRow,
} from "@niclaslindstedt/oss-framework/components";

import {
  curvesAreStraight,
  straightCurves,
  type CurveChannel,
} from "./adjust.ts";
import { holdBackdrop } from "./backdrop.ts";
import { CurveEditor, straightLine } from "./CurveEditor.tsx";
import {
  choiceValue,
  controlReadout,
  controlValue,
  curveSet,
  offersScope,
  switchValue,
  withChoice,
  withControl,
  withCurveSet,
  withSwitch,
  type Effect,
  type EffectDescriptor,
  type EffectScope,
} from "./effects.ts";
import { useT } from "./i18n/index.ts";

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
// The controls are read off the descriptor and nothing here knows which effect
// it is showing — a new effect is a descriptor in `effects.ts` and its catalog
// strings, and this dialog renders it without being told. Four kinds of control
// exist and that is the whole list: a slider, a switch, a pick-one, and — for
// the one effect whose value is a line rather than a number — a tone curve.

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
  onCancel: () => void;
  onApply: (effect: Effect) => void;
};

export function EffectModal({
  descriptor,
  draft,
  onDraft,
  scope,
  onScope,
  target,
  empty,
  onCancel,
  onApply,
}: Props) {
  const t = useT();
  // The scrim, for as long as these options are open — and put back exactly as
  // it was on the way out, whatever the Appearance tab has it set to.
  useEffect(() => holdBackdrop(), []);

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
      {/* The marker the stylesheet reads to move the card off the middle of
          the page it is previewing — see `styles.css`. */}
      <div data-previewing className="flex flex-col gap-4 px-5 py-5">
        <h2 id="effect-title" className="text-base font-bold text-fg-bright">
          {t(descriptor.nameKey)}
        </h2>
        <p className="text-xs text-muted">{t(descriptor.hintKey)}</p>

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

        {/* The one control that is not a number. */}
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

        {descriptor.controls.map((control) => {
          const value = controlValue(draft, control.id);
          return (
            <label key={control.id} className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t(control.nameKey, {
                  value: String(controlReadout(control, value)),
                })}
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={value}
                onChange={(e) =>
                  onDraft(
                    withControl(
                      draft,
                      control.id,
                      Number((e.target as HTMLInputElement).value),
                    ),
                  )
                }
                className="w-full cursor-pointer"
              />
            </label>
          );
        })}

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
            ? t("effects.empty", { target })
            : t("effects.warning", { target })}
        </p>
        <p className="text-[11px] text-muted">{t("effects.previewHint")}</p>
      </div>
    </Modal>
  );
}
