// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import {
  Button,
  LABELED_FIELD_CLASS,
  Modal,
  SegmentedControl,
} from "@niclaslindstedt/oss-framework/components";

import {
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  parseSide,
  type CanvasSize,
} from "./canvasSize.ts";
import { useT } from "./i18n/index.ts";
import {
  keepProportions,
  RESIZE_ANCHORS,
  type ResizeAnchor,
  type Sampling,
} from "./transform.ts";
import type { Drawing } from "./types.ts";

// Resizing a drawing, which is two different questions wearing one word.
//
// **Everything** scales the drawing: the page and every mark on it grow or
// shrink together, and the picture is the picture it was, larger. **Canvas
// only** changes the sheet and leaves the marks exactly where they are — which
// is how you give yourself room to the right of a sketch, and, with a smaller
// sheet, how you crop one. They are one dialog because they are one intent
// ("this page is the wrong size"), and a segmented control because picking the
// wrong one of the two is the mistake worth designing against.
//
// So the difference is *drawn*. Each mode shows the new page against the old
// one at a shared scale — nested for a crop, side by side for a scale — and the
// nine-way anchor moves the old page inside the new one so you can see which
// edge is about to go. A number in a field cannot say "this crops the bottom
// off"; a picture of it can.
//
// The sampling choice belongs to scaling and to bitmaps: it decides whether a
// picture painted larger is smoothed or keeps its pixels square. It rides onto
// the image strokes rather than resampling them, so it holds at any zoom (see
// `transform.ts`), and it is hidden on a page with no pictures on it — a control
// that can do nothing is worse than no control.

type Mode = "scale" | "canvas";

type Props = {
  drawing: Drawing;
  onCancel: () => void;
  /** Scale the drawing — page and marks together. */
  onScale: (to: CanvasSize, sampling: Sampling) => void;
  /** Change the sheet only, lining the old page up by `anchor`. */
  onCanvas: (to: CanvasSize, anchor: ResizeAnchor) => void;
};

/** The box the before/after picture is drawn inside, in CSS pixels. */
const PREVIEW = { width: 220, height: 132 };

export function ResizeModal({ drawing, onCancel, onScale, onCanvas }: Props) {
  const t = useT();
  const from: CanvasSize = { width: drawing.width, height: drawing.height };
  const [mode, setMode] = useState<Mode>("scale");
  const [locked, setLocked] = useState(true);
  const [sampling, setSampling] = useState<Sampling>("smooth");
  const [anchor, setAnchor] = useState<ResizeAnchor>("center");
  // Held as text so a half-typed number is the user's business rather than
  // something to round on every keystroke.
  const [draft, setDraft] = useState({
    width: String(from.width),
    height: String(from.height),
  });

  const width = parseSide(draft.width);
  const height = parseSide(draft.height);
  const to = width !== null && height !== null ? { width, height } : null;
  const hasImages = drawing.strokes.some((s) => s.shape.kind === "image");

  /** Type into one side. With the proportions locked the other side follows,
   *  which is what keeps a resize from quietly stretching the drawing. */
  const type = (side: "width" | "height", value: string) => {
    const next = { ...draft, [side]: value };
    const side_ = parseSide(value);
    if (locked && mode === "scale" && side_ !== null) {
      const kept = keepProportions(from, side, side_);
      next.width = String(kept.width);
      next.height = String(kept.height);
    }
    setDraft(next);
  };

  const apply = () => {
    if (!to) return;
    if (mode === "scale") onScale(to, sampling);
    else onCanvas(to, anchor);
  };

  const percent =
    to && from.width > 0 ? Math.round((to.width / from.width) * 100) : 100;

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="resize-title"
      centered
      size="max-w-md"
      closeLabel={t("common.cancel")}
      footer={
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={apply} disabled={!to}>
            {t("resize.apply")}
          </Button>
        </footer>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <h2 id="resize-title" className="text-base font-bold text-fg-bright">
          {t("resize.title")}
        </h2>

        <SegmentedControl<Mode>
          value={mode}
          ariaLabel={t("resize.modeLabel")}
          onChange={setMode}
          fullWidth
          options={[
            { value: "scale", label: t("resize.modeScale") },
            { value: "canvas", label: t("resize.modeCanvas") },
          ]}
        />

        <p className="text-xs text-muted">
          {mode === "scale" ? t("resize.scaleHint") : t("resize.canvasHint")}
        </p>

        <Preview
          from={from}
          to={to}
          mode={mode}
          anchor={mode === "canvas" ? anchor : "top-left"}
        />

        <div className="flex items-end gap-2">
          <SideField
            label={t("resize.width")}
            value={draft.width}
            onChange={(v) => type("width", v)}
          />
          <span className="pb-2 text-sm text-muted">×</span>
          <SideField
            label={t("resize.height")}
            value={draft.height}
            onChange={(v) => type("height", v)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {mode === "scale" ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => setLocked(e.currentTarget.checked)}
                className="cursor-pointer"
              />
              {t("resize.keepProportions")}
            </label>
          ) : (
            <span className="text-xs text-muted">
              {t("resize.anchorLabel")}
            </span>
          )}
          <span
            className={`text-xs tabular-nums ${to ? "text-muted" : "text-danger"}`}
          >
            {to
              ? mode === "scale"
                ? t("resize.percent", { percent: String(percent) })
                : t("resize.from", {
                    width: String(from.width),
                    height: String(from.height),
                  })
              : t("resize.sizeHint", {
                  min: String(MIN_CANVAS_SIDE),
                  max: String(MAX_CANVAS_SIDE),
                })}
          </span>
        </div>

        {mode === "canvas" && <AnchorGrid value={anchor} onPick={setAnchor} />}

        {mode === "scale" && hasImages && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            <span className="text-xs text-muted">{t("resize.sampling")}</span>
            <SegmentedControl<Sampling>
              value={sampling}
              ariaLabel={t("resize.sampling")}
              onChange={setSampling}
              fullWidth
              options={[
                { value: "smooth", label: t("resize.samplingSmooth") },
                { value: "nearest", label: t("resize.samplingNearest") },
              ]}
            />
            <span className="text-[11px] text-muted">
              {sampling === "smooth"
                ? t("resize.samplingSmoothHint")
                : t("resize.samplingNearestHint")}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The old page against the new one, at one shared scale.
 *
 *  Scaling draws them side by side — the question is "how much bigger". A canvas
 *  resize nests them, with the old page where the anchor puts it, because the
 *  question there is "what falls off the edge". */
function Preview({
  from,
  to,
  mode,
  anchor,
}: {
  from: CanvasSize;
  to: CanvasSize | null;
  mode: Mode;
  anchor: ResizeAnchor;
}) {
  const target = to ?? from;
  // One scale over both pages, so the two rectangles mean something next to each
  // other rather than each filling its own box.
  const scale = Math.min(
    PREVIEW.width / Math.max(from.width, target.width),
    PREVIEW.height / Math.max(from.height, target.height),
  );
  const px = (n: number) => `${Math.max(4, Math.round(n * scale))}px`;

  if (mode === "scale") {
    return (
      <div
        aria-hidden="true"
        className="flex items-end justify-center gap-4 rounded-lg border border-line bg-surface-2 px-3 py-3"
        style={{ minHeight: `${PREVIEW.height + 24}px` }}
      >
        <span
          className="block rounded-[2px] border border-muted bg-surface"
          style={{ width: px(from.width), height: px(from.height) }}
        />
        <span
          className="block rounded-[2px] border border-accent bg-accent/20"
          style={{ width: px(target.width), height: px(target.height) }}
        />
      </div>
    );
  }

  // The new sheet, with the old page sitting inside it where the anchor puts
  // it — the overhang is exactly what a crop is about to take.
  const dx =
    (target.width - from.width) *
    (anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5);
  const dy =
    (target.height - from.height) *
    (anchor.startsWith("top") ? 0 : anchor.startsWith("bottom") ? 1 : 0.5);
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center rounded-lg border border-line bg-surface-2 px-3 py-3"
      style={{ minHeight: `${PREVIEW.height + 24}px` }}
    >
      <span
        className="relative block rounded-[2px] border border-accent bg-accent/10"
        style={{ width: px(target.width), height: px(target.height) }}
      >
        <span
          className="absolute rounded-[1px] border border-dashed border-muted bg-surface/70"
          style={{
            left: `${Math.round(dx * scale)}px`,
            top: `${Math.round(dy * scale)}px`,
            width: px(from.width),
            height: px(from.height),
          }}
        />
      </span>
    </div>
  );
}

/** The nine-way anchor — where the old page sits in the new sheet. */
function AnchorGrid({
  value,
  onPick,
}: {
  value: ResizeAnchor;
  onPick: (anchor: ResizeAnchor) => void;
}) {
  const t = useT();
  return (
    <div
      className="grid w-max grid-cols-3 gap-1"
      role="radiogroup"
      aria-label={t("resize.anchorLabel")}
    >
      {RESIZE_ANCHORS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          aria-label={t(`resize.anchors.${option}`)}
          title={t(`resize.anchors.${option}`)}
          onClick={() => onPick(option)}
          className={`h-7 w-7 cursor-pointer rounded border ${
            option === value
              ? "border-accent bg-accent/25"
              : "border-line hover:bg-surface-2"
          }`}
        />
      ))}
    </div>
  );
}

/** One side of a size. A plain input rather than the framework's `LabeledInput`,
 *  which commits on blur: here the pair is validated on every keystroke so the
 *  Apply button can go dim the moment it stops being a page. */
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
