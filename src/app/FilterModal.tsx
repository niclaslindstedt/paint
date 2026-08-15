// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import {
  Button,
  Modal,
  ToggleRow,
} from "@niclaslindstedt/oss-framework/components";

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
// **Nothing lands until Apply.** The draft is this component's own state, so a
// slider dragged and thought better of costs nothing — no undo step, no push to
// the cloud, no repaint of the document. That is also why there is no live
// preview: previewing would mean writing the drawing on every pointer sample,
// and a filter is one undo step, not a hundred.
//
// The controls are read off the descriptor and nothing here knows which filter
// it is showing — a new filter is a descriptor in `filters.ts` and its catalog
// strings, and this dialog renders it without being told.

type Props = {
  descriptor: FilterDescriptor;
  /** The filter as it is on the drawing, or `null` when it is switched off —
   *  in which case the dialog opens on the preset and Apply switches it on. */
  filter: Filter | null;
  onCancel: () => void;
  onApply: (filter: Filter) => void;
  /** Take the filter off the page. Offered only when it is on. */
  onRemove: () => void;
};

export function FilterModal({
  descriptor,
  filter,
  onCancel,
  onApply,
  onRemove,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState<Filter>(filter ?? descriptor.preset);

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
      <div className="flex flex-col gap-4 px-5 py-5">
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
                  setDraft((current) =>
                    withControl(
                      current,
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
            onChange={(on) =>
              setDraft((current) => withSwitch(current, option.id, on))
            }
          />
        ))}

        <p className="border-t border-line pt-3 text-[11px] text-muted">
          {t("filters.hint")}
        </p>
      </div>
    </Modal>
  );
}
