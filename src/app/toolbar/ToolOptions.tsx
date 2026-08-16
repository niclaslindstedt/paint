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
import {
  TileCache,
  blit,
  enqueuePaint,
  rendererKey,
  tileCanvas,
  tileRatio,
} from "../tiles.ts";

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

/** Previews already painted.
 *
 *  These are the dearest pictures in the panel by a distance: a wash engine's
 *  swatch is two brush strokes over a whole sheet of cold-pressed paper, and
 *  the pigment engine paints its by running the simulation. Two of them in an
 *  effect flush is most of what a panel used to cost to open, so they are
 *  painted once, one per frame, and warmed before the panel opens (see
 *  `warmOptionPreviews` and `tiles.ts`). */
const painted = new TileCache(24);

/** Everything one preview's pixels are a function of: which answer it is a
 *  picture of, the ink and the page it is painted in, and — because a swatch
 *  is painted through the app's own renderer — the engines in force. The
 *  pigment swatch is deliberately painted at whatever detail the slider beside
 *  it is set to, and that is in `rendererKey` too. */
function previewKey(
  id: string,
  color: string,
  background: string,
  height: number,
): string {
  return [id, color, background, height, tileRatio(), rendererKey()].join("|");
}

/** How tall an answer's picture comes out, for a sample of these proportions. */
function previewHeight(sample: { width: number; height: number }): number {
  return Math.round((PREVIEW_WIDTH * sample.height) / sample.width);
}

/** One answer's picture, painted onto a tile of its own. */
function paintPreview(
  answer: ToolOptionAnswer,
  sample: { width: number; height: number },
  color: string,
  background: string,
): HTMLCanvasElement | null {
  const made = tileCanvas(PREVIEW_WIDTH, previewHeight(sample), tileRatio());
  if (!made) return null;
  const scale = made.canvas.width / sample.width;
  made.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  answer.preview?.(made.ctx, { color, background });
  return made.canvas;
}

/** Paint the pictures a panel's Rendering section is about to show, before it
 *  is opened — the other half of what makes the size panel open drawn (see
 *  `warmPressTiles`), and much the larger half: the pigment engine's swatch is
 *  a third of a second on its own, where a press is a millisecond or two.
 *  Given the same options and answers the panel would render, so a warmed panel
 *  is a pair of blits. Returns the way to take whatever is left of the pass
 *  back out of the queue. */
export function warmOptionPreviews(
  options: readonly ToolOption[],
  values: Readonly<Record<string, ToolOptionValue>>,
  color: string,
  background: string,
): () => void {
  if (typeof document === "undefined" || typeof window === "undefined")
    return () => {};
  const queued: Array<() => void> = [];
  for (const option of shownOptions(options, values)) {
    if (option.kind !== "choice" || !option.sample) continue;
    const sample = option.sample;
    for (const answer of option.answers) {
      if (!answer.preview) continue;
      const key = previewKey(
        `${option.id}:${answer.value}`,
        color,
        background,
        previewHeight(sample),
      );
      if (painted.has(key)) continue;
      queued.push(
        enqueuePaint(() => {
          // Looked up again inside the job: the panel may have opened while
          // this stood in the queue and painted the picture it was queued for.
          if (painted.has(key)) return;
          const tile = paintPreview(answer, sample, color, background);
          if (tile) painted.remember(key, tile);
        }),
      );
    }
  }
  return () => queued.forEach((cancel) => cancel());
}

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
                id={`${option.id}:${answer.value}`}
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
 *  everything about the *marks* is the plugin's (see `ToolOptionPreview`).
 *
 *  Painted through the tile queue rather than in the effect itself: a swatch
 *  costs a whole sheet's worth of rendering, and the panel it is in has to open
 *  before it is painted rather than after. */
function Preview({
  id,
  answer,
  sample,
  color,
  background,
}: {
  /** What this picture is of, as the cache knows it: the option and the answer
   *  inside it, which is what makes two swatches of the same wash two
   *  pictures. */
  id: string;
  answer: ToolOptionAnswer;
  sample: { width: number; height: number };
  color: string;
  background: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = previewHeight(sample);
  const key = previewKey(id, color, background, height);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Painted before: a blit, on the spot.
    const kept = painted.get(key);
    if (kept) {
      blit(canvas, kept);
      return;
    }
    return enqueuePaint(() => {
      const tile =
        painted.get(key) ?? paintPreview(answer, sample, color, background);
      if (!tile) return;
      painted.remember(key, tile);
      blit(canvas, tile);
    });
    // `key` is what the rest of these amount to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <canvas
      ref={ref}
      // The page's own colour behind it, so a picture still in the queue reads
      // as a blank sheet rather than as a hole in the row.
      style={{ width: PREVIEW_WIDTH, height, backgroundColor: background }}
      className="block rounded-sm"
    />
  );
}
