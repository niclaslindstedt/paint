// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useRef, useState } from "react";

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
import { LockIcon, UnlockIcon } from "./icons.tsx";
import {
  anchorOffset,
  cornerAnchor,
  dragCorner,
  keepProportions,
  RESIZE_ANCHORS,
  RESIZE_CORNERS,
  type ResizeAnchor,
  type ResizeCorner,
  type Sampling,
} from "./transform.ts";
import type { Drawing, Point } from "./types.ts";

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
// So the difference is *drawn*, and the drawing is the control. Both modes nest
// the new page against the old one at a shared scale, and the new page has a
// handle on each corner: **pull one and the opposite corner stays put**, which
// is the crop gesture, and the numbers below follow the drag rather than the
// other way round. A number in a field cannot say "this crops the bottom off";
// pulling the bottom edge up over the drawing can.
//
// In canvas mode the corner you grab *is* the anchor — pulling the bottom-right
// pins the top-left — so the nine-way grid and the drag can never disagree
// about which edge is about to go. In scale mode the page has no anchor to set:
// the whole drawing follows the sheet, so it simply grows about its middle.
//
// Two details are worth knowing about the picture:
//
//   - The scale is **frozen while a corner is being dragged**. Recomputing it
//     as the page grows would move the handle out from under the pointer —
//     the picture would zoom out to keep up and the corner would run away.
//     It relaxes back to a fitted scale the moment the pointer lifts.
//   - It is fitted to *both* pages at once, so the two rectangles mean
//     something next to each other rather than each filling the box.
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

/** How much of that box the two pages are fitted into, so the corner handles —
 *  which stick out past the edge of the new page — have somewhere to be. */
const PREVIEW_INSET = 12;

/** How far one arrow key nudges a corner, in document pixels, and how far one
 *  held with shift does. The handles are buttons as well as grips: a resize you
 *  can only reach with a pointer is a resize half the people using it can't. */
const KEY_STEP = 10;
const KEY_STEP_COARSE = 100;

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
  // The scale the picture is frozen at while a corner is under the pointer —
  // see the note at the top of the file. `null` when nothing is being dragged.
  const [frozen, setFrozen] = useState<number | null>(null);

  const width = parseSide(draft.width);
  const height = parseSide(draft.height);
  const to = width !== null && height !== null ? { width, height } : null;
  const hasImages = drawing.strokes.some((s) => s.shape.kind === "image");

  const setSize = (size: CanvasSize) =>
    setDraft({ width: String(size.width), height: String(size.height) });

  /** Type into one side. With the proportions locked the other side follows,
   *  which is what keeps a resize from quietly stretching the drawing. */
  const type = (side: "width" | "height", value: string) => {
    const next = { ...draft, [side]: value };
    const side_ = parseSide(value);
    if (locked && side_ !== null) {
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
          // Scaling has no anchor to set — the drawing follows the sheet — so
          // the two pages simply share a middle.
          anchor={mode === "canvas" ? anchor : "center"}
          frozen={frozen}
          onFreeze={setFrozen}
          keepRatio={locked}
          onResize={(size, corner) => {
            if (mode === "canvas") setAnchor(cornerAnchor(corner));
            setSize(size);
          }}
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
          {/* A button rather than a checkbox, and in both modes rather than
              only in one. It is a *latch* — something you flip on the way past,
              the way a chain link is pressed shut between two fields — and a
              crop wants its proportions held every bit as much as a scale
              does. The padlock says which way it is set without a word. */}
          <button
            type="button"
            onClick={() => setLocked((on) => !on)}
            aria-pressed={locked}
            title={t("resize.keepProportions")}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${
              locked
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:bg-surface-2 hover:text-fg-bright"
            }`}
          >
            {locked ? (
              <LockIcon className="h-3.5 w-3.5" />
            ) : (
              <UnlockIcon className="h-3.5 w-3.5" />
            )}
            {t("resize.keepProportions")}
          </button>
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

        {mode === "canvas" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("resize.anchorLabel")}
            </span>
            <AnchorGrid value={anchor} onPick={setAnchor} />
          </div>
        )}

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

/** The old page against the new one, at one shared scale — and the new one is
 *  draggable by its corners.
 *
 *  The old page sits inside the new sheet where the anchor puts it, so the
 *  overhang is exactly what a resize is about to take (or give). Everything is
 *  laid out from one scale and one origin, which is what lets a pointer delta
 *  in CSS pixels become a page size in document pixels with a single divide. */
function Preview({
  from,
  to,
  anchor,
  keepRatio,
  frozen,
  onFreeze,
  onResize,
}: {
  from: CanvasSize;
  to: CanvasSize | null;
  anchor: ResizeAnchor;
  keepRatio: boolean;
  /** The scale to hold the picture at while a corner is being dragged. */
  frozen: number | null;
  onFreeze: (scale: number | null) => void;
  onResize: (size: CanvasSize, corner: ResizeCorner) => void;
}) {
  const t = useT();
  const target = to ?? from;
  // Where the drag began: the size it started from and the pointer that started
  // it. A drag is measured from its origin rather than accumulated frame by
  // frame, so it stays exact and reversible — pull a corner out and back and
  // the page is the size it was.
  const drag = useRef<{
    pointerId: number;
    corner: ResizeCorner;
    origin: Point;
    start: CanvasSize;
    scale: number;
  } | null>(null);

  // The old page sits at `offset` inside the new sheet; either rectangle can
  // hang off the other, so the box that has to fit is the union of the two.
  const offset = anchorOffset(from, target, anchor);
  const box = {
    left: Math.min(0, offset.x),
    top: Math.min(0, offset.y),
    right: Math.max(target.width, offset.x + from.width),
    bottom: Math.max(target.height, offset.y + from.height),
  };
  const fitted = Math.min(
    (PREVIEW.width - PREVIEW_INSET * 2) / Math.max(1, box.right - box.left),
    (PREVIEW.height - PREVIEW_INSET * 2) / Math.max(1, box.bottom - box.top),
  );
  const scale = frozen ?? fitted;
  // Centre the pair in the box, then place both rectangles from that origin.
  const originX =
    (PREVIEW.width - (box.right - box.left) * scale) / 2 - box.left * scale;
  const originY =
    (PREVIEW.height - (box.bottom - box.top) * scale) / 2 - box.top * scale;
  const px = (n: number) => `${Math.round(n)}px`;

  const sheet = {
    left: originX,
    top: originY,
    width: target.width * scale,
    height: target.height * scale,
  };

  /** Where a corner sits on the new sheet, in preview pixels. */
  const cornerAt = (corner: ResizeCorner) => ({
    x: sheet.left + (corner.endsWith("left") ? 0 : sheet.width),
    y: sheet.top + (corner.startsWith("top") ? 0 : sheet.height),
  });

  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) return;
    onResize(
      dragCorner(
        current.start,
        current.corner,
        {
          x: (e.clientX - current.origin.x) / current.scale,
          y: (e.clientY - current.origin.y) / current.scale,
        },
        { keepRatio },
      ),
      current.corner,
    );
  };

  const end = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    onFreeze(null);
  };

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-line bg-surface-2"
      style={{ width: "100%", height: `${PREVIEW.height + 24}px` }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: `${PREVIEW.width}px`, height: `${PREVIEW.height}px` }}
      >
        {/* The page as it is now: dashed, so it reads as the outline being left
            behind rather than as a second sheet. */}
        <span
          aria-hidden="true"
          className="absolute rounded-[1px] border border-dashed border-muted bg-surface/70"
          style={{
            left: px(originX + offset.x * scale),
            top: px(originY + offset.y * scale),
            width: px(from.width * scale),
            height: px(from.height * scale),
          }}
        />
        {/* …and the page it is about to become. */}
        <span
          aria-hidden="true"
          className="absolute rounded-[2px] border border-accent bg-accent/15"
          style={{
            left: px(sheet.left),
            top: px(sheet.top),
            width: px(sheet.width),
            height: px(sheet.height),
          }}
        />
        {RESIZE_CORNERS.map((corner) => {
          const at = cornerAt(corner);
          return (
            <button
              key={corner}
              type="button"
              aria-label={t(`resize.handles.${corner}`)}
              title={t("resize.dragHint")}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  pointerId: e.pointerId,
                  corner,
                  origin: { x: e.clientX, y: e.clientY },
                  start: target,
                  scale,
                };
                // Hold the picture still for the length of the drag.
                onFreeze(scale);
              }}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => {
                const step = e.shiftKey ? KEY_STEP_COARSE : KEY_STEP;
                const nudge: Record<string, Point> = {
                  ArrowLeft: { x: -step, y: 0 },
                  ArrowRight: { x: step, y: 0 },
                  ArrowUp: { x: 0, y: -step },
                  ArrowDown: { x: 0, y: step },
                };
                const delta = nudge[e.key];
                if (!delta) return;
                e.preventDefault();
                onResize(
                  dragCorner(target, corner, delta, { keepRatio }),
                  corner,
                );
              }}
              className="absolute h-4 w-4 cursor-pointer touch-none rounded-full border-2 border-accent bg-surface hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              style={{
                left: px(at.x - 8),
                top: px(at.y - 8),
                cursor:
                  corner === "top-left" || corner === "bottom-right"
                    ? "nwse-resize"
                    : "nesw-resize",
              }}
            />
          );
        })}
      </div>
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
