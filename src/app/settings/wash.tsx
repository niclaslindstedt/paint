// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef } from "react";

import { Section } from "@niclaslindstedt/oss-framework/components";

import { defaultInk } from "../canvas.ts";
import { useT } from "../i18n/index.ts";
import { WASH_ENGINES, type WashEngine } from "../plugins/wash.ts";
import { renderDrawing } from "../render.ts";
import { mm } from "../units.ts";
import type { Drawing } from "../types.ts";

// Picking which watercolour this build paints with.
//
// It sits in Settings → Tools rather than in Canvas because it is a property of
// the *tool*, not of the page: the sheet travels with the drawing and is
// document state, where this is a rendering choice about one brush and applies
// to every drawing you open (see `plugins/wash.ts`).
//
// **The two engines are shown, not described.** The difference between a stroke
// model and a pigment simulation is a picture — a rim that was stroked round a
// path against one that dried there — and a paragraph claiming "more realistic"
// is worth nothing beside two swatches of the same stroke. So each option is
// the same wash, on the same paper, painted by the engine it names, through the
// app's own renderer: what you press is what you get. It is the same call the
// surface picker makes about paper stocks.
//
// It applies live, like the tool switchboard above it — a setting whose whole
// content is "which of these two do you like" cannot be judged behind a Save
// button.

/** How big a swatch is on screen, in CSS pixels. */
const SWATCH = { width: 116, height: 74 };

/** …and the page it is a picture of, in document pixels. Big enough that a real
 *  brush width and a real paper grain are both themselves at the scale the
 *  swatch is drawn at. */
const SAMPLE = { width: 460, height: 292 };

/** The marks on every swatch.
 *
 *  Two washes that cross, and deliberately: one stroke shows the wet edge and
 *  the dried rim, and where the second crosses the first is where the two
 *  engines differ most — glazing on one, a wet mark meeting a drying one on the
 *  other. Painted on cold-pressed paper, the sheet most watercolour is painted
 *  on, so both have a tooth to granulate into. */
function sampleMarks(wash: string) {
  return [
    {
      id: "a",
      tool: "watercolor",
      color: wash,
      size: mm(7),
      shape: {
        kind: "path" as const,
        points: [
          { x: 50, y: 96 },
          { x: 170, y: 128 },
          { x: 300, y: 104 },
          { x: 410, y: 146 },
        ],
      },
    },
    {
      id: "b",
      tool: "watercolor",
      color: wash,
      size: mm(5.5),
      shape: {
        kind: "path" as const,
        points: [
          { x: 262, y: 40 },
          { x: 232, y: 140 },
          { x: 246, y: 246 },
        ],
      },
    },
  ];
}

/** One engine, painted as the marks it makes. */
function WashSwatch({
  engine,
  pageColor,
  dark,
}: {
  engine: WashEngine;
  pageColor: string;
  dark: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(SWATCH.width * dpr);
    canvas.height = Math.round(SWATCH.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ink = defaultInk(dark);
    const drawing: Drawing = {
      id: "wash-swatch",
      name: "",
      width: SAMPLE.width,
      height: SAMPLE.height,
      strokes: sampleMarks(dark ? "#7dd3fc" : "#2563eb"),
      ground: { stock: "cold" },
    };
    const scale = canvas.width / SAMPLE.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Through the app's own renderer, with this engine named rather than the
    // one in force — the one place in the app that paints an engine it was
    // told to instead of the one the setting says (see `RenderOptions`).
    renderDrawing(ctx, drawing, null, {
      pageColor,
      defaultInk: ink,
      washEngine: engine,
    });
  }, [engine, pageColor, dark]);

  return (
    <canvas
      ref={ref}
      style={{ width: SWATCH.width, height: SWATCH.height }}
      className="block rounded-sm"
    />
  );
}

/** The Watercolour section of Settings → Tools. */
export function WashEngineSection({
  engine,
  onChange,
  pageColor,
  dark,
}: {
  engine: WashEngine;
  onChange: (next: WashEngine) => void;
  pageColor: string;
  dark: boolean;
}) {
  const t = useT();

  return (
    <Section title={t("settings.tools.washTitle")}>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">{t("settings.tools.washHint")}</p>
        <div className="flex flex-wrap gap-2">
          {WASH_ENGINES.map((option) => {
            const picked = option.id === engine;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.id)}
                aria-pressed={picked}
                className={`flex cursor-pointer flex-col items-start gap-1 rounded border p-1.5 text-left ${
                  picked
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-muted hover:bg-surface-2"
                }`}
              >
                <WashSwatch
                  engine={option.id}
                  pageColor={pageColor}
                  dark={dark}
                />
                <span className="px-0.5 text-xs font-medium">
                  {t(option.nameKey)}
                </span>
                <span
                  className="px-0.5 text-[11px] leading-tight text-muted"
                  style={{ maxWidth: SWATCH.width }}
                >
                  {t(option.hintKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
