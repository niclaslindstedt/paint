// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect } from "react";

import {
  Button,
  Modal,
  ToggleRow,
} from "@niclaslindstedt/oss-framework/components";

import { holdBackdrop } from "./backdrop.ts";
import {
  controlReadout,
  controlValue,
  switchValue,
  withControl,
  withSwitch,
  type FilterDescriptor,
} from "./filters.ts";
import { useT } from "./i18n/index.ts";
import type { Filter } from "./types.ts";

// One filter's options.
//
// It is a dialog rather than a panel of sliders in the sidebar for one reason:
// a filter is a *setting on the page*, and the page is what the sidebar is
// standing next to. Sliders in a 224-pixel column would have been three rows of
// controls per filter permanently between the page actions and the layer stack,
// on a panel whose whole job is to be glanceable.
//
// So the section's row is the switch and the readout, and this is where the
// numbers live. It is deliberately the shape the resize dialog has — the same
// modal, the same footer, the same one primary button — because they are the
// same kind of thing: a page-wide change with a question to ask first.
//
// **The page behind shows the answer, and still nothing lands until Apply.**
// A radius in page pixels is not a number anyone can picture, so the draft is
// painted on the drawing itself while the sliders move (see `filterPreview.ts`)
// — and the draft is the screen's state rather than the document's, so a slider
// dragged from end to end and thought better of costs no undo step, no push to
// the cloud, and no edit at all. It is a *view* of the page on every pointer
// sample, which the frame cache serves as one composite over the picture it is
// already holding.
//
// Which is also why this dialog, alone among them, takes the scrim away while
// it is open (`holdBackdrop`): the page it is previewing is the page behind it,
// and a preview seen through a black — or blurred — veil is not one.
//
// The controls are read off the descriptor and nothing here knows which filter
// it is showing — a new filter is a descriptor in `filters.ts` and its catalog
// strings, and this dialog renders it without being told.

type Props = {
  descriptor: FilterDescriptor;
  /** The filter as it is on the drawing, or `null` when it is switched off.
   *  Only what the footer needs — whether there is anything to turn off. What
   *  the sliders sit on is `draft`, which the screen seeds from this. */
  filter: Filter | null;
  /** The filter being set up: what the controls show, and what the page behind
   *  is being painted through. Held by the screen because the preview is
   *  painted there — see `CanvasScreen`. */
  draft: Filter;
  onDraft: (next: Filter) => void;
  onCancel: () => void;
  onApply: (filter: Filter) => void;
  /** Take the filter off the page. Offered only when it is on. */
  onRemove: () => void;
  /** Whether these options belong to the whole page or to one layer of it. The
   *  controls are the same either way — only the note under them changes, and
   *  it has to: "the whole page" and "this layer alone" are the difference
   *  between the two, and the sliders cannot say which one you opened. */
  scope: "page" | "layer";
};

export function FilterModal({
  descriptor,
  filter,
  draft,
  onDraft,
  onCancel,
  onApply,
  onRemove,
  scope,
}: Props) {
  const t = useT();
  // The scrim, for as long as these options are open — and put back exactly as
  // it was on the way out, whatever the Appearance tab has it set to.
  useEffect(() => holdBackdrop(), []);

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="filter-title"
      centered
      size="max-w-md"
      closeLabel={t("common.cancel")}
      footer={
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          {/* Switching it off is offered here rather than as a second row in
              the panel: this is where you are when you decide a filter isn't
              working, and it is one press from the sliders that told you. */}
          {filter && (
            <Button variant="danger" onClick={onRemove}>
              {t("filters.remove")}
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => onApply(draft)}>
            {t("filters.apply")}
          </Button>
        </footer>
      }
    >
      {/* The marker the stylesheet reads to move the card off the middle of
          the page it is previewing — see `styles.css`. */}
      <div data-previewing className="flex flex-col gap-4 px-5 py-5">
        <h2 id="filter-title" className="text-base font-bold text-fg-bright">
          {t(descriptor.nameKey)}
        </h2>
        <p className="text-xs text-muted">{t(descriptor.hintKey)}</p>

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

        <p className="border-t border-line pt-3 text-[11px] text-muted">
          {scope === "layer" ? t("filters.layerHint") : t("filters.hint")}
        </p>
        {/* …and what the page behind is doing, which is the one thing the
            sliders cannot say for themselves: it is already showing the
            change, and it is not keeping it yet. */}
        <p className="text-[11px] text-muted">{t("filters.previewHint")}</p>
      </div>
    </Modal>
  );
}
