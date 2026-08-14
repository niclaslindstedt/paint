// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import {
  Button,
  Field,
  LABELED_FIELD_CLASS,
  Modal,
  SelectPicker,
} from "@niclaslindstedt/oss-framework/components";

import {
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  canvasPresets,
  currentScreenCanvasSize,
  parseCanvasSize,
  type CanvasPresetId,
  type CanvasSize,
} from "./canvasSize.ts";
import { useT } from "./i18n/index.ts";

// The one question a new drawing asks: how big is the page?
//
// It is asked here, once, because the page never reflows — a drawing made at
// 1920 × 1080 stays that size on every device it opens on (see `types.ts`), so
// the size is part of creating the thing rather than a setting to find later.
// The answer defaults to this screen's own resolution: the common case is a
// page to fill the display you are looking at, and it is the one size the app
// can work out for you.
//
// The rules live in `canvasSize.ts`; this file is the dialog around them.

/** `custom` is the picker's extra row, not a preset — it swaps the dimensions
 *  readout for two fields. */
type Choice = CanvasPresetId | "custom";

type Props = {
  /** The folder the drawing will be filed into, named for the title — so
   *  "New drawing in Diagrams" says where it is about to land. */
  folderName?: string;
  onCancel: () => void;
  onCreate: (size: CanvasSize) => void;
};

const FORM_ID = "new-drawing-form";

export function NewDrawingModal({ folderName, onCancel, onCreate }: Props) {
  const t = useT();
  // The screen is read once, when the dialog opens: it is the default answer,
  // and it can't change while the dialog is in front of you.
  const [presets] = useState(() => canvasPresets(currentScreenCanvasSize()));
  const [choice, setChoice] = useState<Choice>("screen");
  // The custom fields, seeded from whatever size was showing when Custom was
  // picked — typing a page 200px wider than this screen shouldn't start from an
  // empty box. Held as text so a half-typed number is the user's business
  // rather than something to round on every keystroke.
  const [custom, setCustom] = useState(() => ({
    width: String(presets[0]?.size.width ?? MIN_CANVAS_SIDE),
    height: String(presets[0]?.size.height ?? MIN_CANVAS_SIDE),
  }));

  const preset = presets.find((p) => p.id === choice);
  const size =
    choice === "custom"
      ? parseCanvasSize(custom.width, custom.height)
      : (preset?.size ?? null);

  const dimensions = (s: CanvasSize) =>
    t("newDrawing.dimensions", {
      width: String(s.width),
      height: String(s.height),
    });

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="new-drawing-title"
      centered
      size="max-w-sm"
      closeLabel={t("common.cancel")}
      footer={
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          {/* Submits the form below, so Enter in either field creates the
              drawing rather than doing nothing. */}
          <Button
            variant="primary"
            type="submit"
            form={FORM_ID}
            disabled={!size}
          >
            {t("newDrawing.create")}
          </Button>
        </footer>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-4 px-5 pt-5 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (size) onCreate(size);
        }}
      >
        <h2
          id="new-drawing-title"
          className="text-base font-bold text-fg-bright"
        >
          {folderName
            ? t("newDrawing.titleIn", { name: folderName })
            : t("newDrawing.title")}
        </h2>

        <Field label={t("newDrawing.sizeLabel")}>
          <SelectPicker<Choice>
            value={choice}
            ariaLabel={t("newDrawing.sizeLabel")}
            onChange={(next) => {
              // Carry the size that was showing into the fields, so Custom
              // opens on the page you were already looking at.
              if (next === "custom" && preset) {
                setCustom({
                  width: String(preset.size.width),
                  height: String(preset.size.height),
                });
              }
              setChoice(next);
            }}
            options={[
              ...presets.map((p) => ({
                value: p.id,
                label: t(`newDrawing.presets.${p.id}`),
                hint: dimensions(p.size),
              })),
              { value: "custom" as const, label: t("newDrawing.custom") },
            ]}
          />
        </Field>

        {choice === "custom" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <SideField
                label={t("newDrawing.width")}
                value={custom.width}
                onChange={(width) => setCustom((c) => ({ ...c, width }))}
              />
              <span className="pb-1.5 text-sm text-muted">×</span>
              <SideField
                label={t("newDrawing.height")}
                value={custom.height}
                onChange={(height) => setCustom((c) => ({ ...c, height }))}
              />
            </div>
            <p className={`text-xs ${size ? "text-muted" : "text-danger"}`}>
              {t("newDrawing.sizeHint", {
                min: String(MIN_CANVAS_SIDE),
                max: String(MAX_CANVAS_SIDE),
              })}
            </p>
          </div>
        ) : (
          // The chosen page, spelled out under the picker — the number is the
          // decision, and it shouldn't take opening the dropdown to re-read it.
          <p className="text-xs text-muted tabular-nums">
            {size ? dimensions(size) : ""}
          </p>
        )}
      </form>
    </Modal>
  );
}

// One side of a custom size. A plain input rather than the framework's
// `LabeledInput`, which commits on blur and keeps its own draft — here the two
// sides are validated together on every keystroke so the Create button can go
// dim the moment the pair stops being a page. It wears the framework's field
// class, so it is the same box either way.
function SideField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_CANVAS_SIDE}
        max={MAX_CANVAS_SIDE}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className={`${LABELED_FIELD_CLASS} tabular-nums`}
      />
    </label>
  );
}
