// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef } from "react";

import { useT } from "../i18n/index.ts";
import {
  optionAnswer,
  shownOptions,
  type ToolOptionValue,
} from "../plugins/options.ts";
import type {
  ToolOption,
  ToolOptionAnswer,
  ToolOptionChoice,
} from "../plugins/types.ts";

// A tool's **app-wide** settings, as a titled section of its panel.
//
// It sits under the dials in the size panel and in the cog panel alike, and it
// is a section of its own rather than three more rows of Advanced because it is
// a different kind of setting and the difference matters to whoever is pressing
// it: a dial changes the next mark, and one of these changes how every mark of
// its kind is *painted* — on this drawing and on every other, including the ones
// already made (see `plugins/options.ts`).
//
// Nothing here knows an option by name. The plugin declares them, `options.ts`
// says where each rests and which are worth showing, and this renders the list.
//
// **A choice is shown, not described.** An option that ships previews paints one
// per answer, in the ink the toolbar is holding on the page you are drawing on,
// so the row is two pictures of the same stroke rather than two adjectives. The
// hint under it belongs to the answer that is *picked* — the tightest honest
// thing a 250-pixel panel can say — where a wall of hints, one per answer, is
// the settings page this section was moved out of.

/** How wide a preview is drawn, in CSS pixels. Two of them and a gap is the
 *  width of the panel, which is what decides it: a choice between two pictures
 *  has to be one row, or it is not a comparison. */
const PREVIEW_WIDTH = 100;

type Props = {
  /** The section's heading. */
  title: string;
  /** What the tool in hand declares, in the order it declared them. */
  options: readonly ToolOption[];
  /** Where they currently sit — every one, resolved, so a control has a value
   *  whether or not the user has touched it. */
  values: Readonly<Record<string, ToolOptionValue>>;
  onChange: (id: string, value: ToolOptionValue) => void;
  /** The ink and the page a preview paints in — the same pair the width row's
   *  presses use, so a swatch is the mark this answer would actually make. */
  color: string;
  background: string;
};

export function ToolOptions({
  title,
  options,
  values,
  onChange,
  color,
  background,
}: Props) {
  const t = useT();
  const shown = shownOptions(options, values);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </span>

      {shown.map((option) =>
        option.kind === "choice" ? (
          <Choice
            key={option.id}
            option={option}
            value={String(values[option.id] ?? option.default)}
            onChange={(next) => onChange(option.id, next)}
            color={color}
            background={background}
          />
        ) : (
          <label key={option.id} className="flex flex-col gap-1">
            {/* A range reads out as a percentage, the way a dial does: every
                option that is a number today is a share of something. */}
            <span className="text-xs text-muted">
              {t(option.nameKey, {
                value: String(
                  Math.round(Number(values[option.id] ?? option.default) * 100),
                ),
              })}
            </span>
            <input
              type="range"
              min={option.min}
              max={option.max}
              step={option.step}
              value={Number(values[option.id] ?? option.default)}
              onChange={(e) =>
                onChange(
                  option.id,
                  Number((e.target as HTMLInputElement).value),
                )
              }
              className="w-full cursor-pointer"
            />
            <span className="text-[11px] text-muted">{t(option.hintKey)}</span>
          </label>
        ),
      )}
    </div>
  );
}

/** One choice: its name, a button per answer, and what the picked one does. */
function Choice({
  option,
  value,
  onChange,
  color,
  background,
}: {
  option: ToolOptionChoice;
  value: string;
  onChange: (next: string) => void;
  color: string;
  background: string;
}) {
  const t = useT();
  const picked = optionAnswer(option, value);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{t(option.nameKey)}</span>
      <div className="flex flex-wrap gap-1.5">
        {option.answers.map((answer) => (
          <button
            key={answer.value}
            type="button"
            onClick={() => onChange(answer.value)}
            aria-pressed={answer.value === value}
            className={`flex cursor-pointer flex-col items-start gap-1 rounded border p-1 text-left ${
              answer.value === value
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:bg-surface-2"
            }`}
          >
            {option.sample && answer.preview && (
              <Preview
                answer={answer}
                sample={option.sample}
                color={color}
                background={background}
              />
            )}
            <span className="px-0.5 text-[11px] font-medium">
              {t(answer.nameKey)}
            </span>
          </button>
        ))}
      </div>
      {picked && (
        <span className="text-[11px] leading-tight text-muted">
          {t(picked.hintKey)}
        </span>
      )}
    </div>
  );
}

/** An answer's picture, painted by the tool that offers it.
 *
 *  Everything about the canvas is this component's — the device pixel ratio, the
 *  size on screen, the transform that maps the sample page onto it — and
 *  everything about the *marks* is the plugin's (see `ToolOptionPreview`). */
function Preview({
  answer,
  sample,
  color,
  background,
}: {
  answer: ToolOptionAnswer;
  sample: { width: number; height: number };
  color: string;
  background: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((PREVIEW_WIDTH * sample.height) / sample.width);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(PREVIEW_WIDTH * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = canvas.width / sample.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    answer.preview?.(ctx, { color, background });
  }, [answer, sample.width, height, color, background]);

  return (
    <canvas
      ref={ref}
      style={{ width: PREVIEW_WIDTH, height }}
      className="block rounded-sm"
    />
  );
}
