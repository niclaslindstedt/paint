// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef } from "react";

import {
  Section,
  SegmentedControl,
} from "@niclaslindstedt/oss-framework/components";

import { defaultInk } from "../canvas.ts";
import {
  GROUNDS,
  groundById,
  groundsInFamily,
  type GroundDescriptor,
  type GroundFamily,
} from "../ground.ts";
import { useT } from "../i18n/index.ts";
import { renderDrawing } from "../render.ts";
import { mm } from "../units.ts";
import type { PaintStore } from "../usePaintStore.ts";
import type { Drawing, Ground } from "../types.ts";

// Picking the sheet the drawing is on.
//
// It sits in Settings → Canvas beside the page colour because it is the same
// kind of thing: document state, pinned to this drawing, applied the moment you
// press it rather than on Save (see `CanvasTab`). Colour and surface are two
// separate questions — a cream sheet and a rough sheet are unrelated choices,
// and every combination of them is a real page — so they are two rows.
//
// **The stocks are shown rather than listed**, which is the same call the
// new-drawing dialog makes about page sizes: a swatch of the sheet with a wash
// laid across an ink line on it answers "what is rough for?" in a way no
// sentence does, because the answer is a picture. Each swatch is painted by the
// renderer, through the same painters the page uses, so it is the sheet rather
// than an illustration of one.

/** How big a swatch is on screen, in CSS pixels. */
const SWATCH = { width: 76, height: 54 };

/** …and the page it is a picture of, in document pixels. Large enough that a
 *  real brush width and a real paper grain both have room to be themselves at
 *  the scale the swatch is drawn at. */
const SAMPLE = { width: 420, height: 300 };

/** The marks on every swatch: a line of ink, and a wash laid across it.
 *
 *  Deliberately those two and in that order, because between them they show
 *  everything the sheet does — the grain under the wash, how far the water ran
 *  past the brush, whether the pigment mottled, and whether the ink line under
 *  it bled out into the water or sat there untouched. On the solid sheet the
 *  wash simply covers the line; on rough paper the line dissolves into it. */
function sampleMarks(ink: string, wash: string) {
  return [
    {
      id: "ink",
      tool: "pencil",
      color: ink,
      size: mm(0.5),
      shape: {
        kind: "path" as const,
        points: [
          { x: 120, y: 40 },
          { x: 150, y: 150 },
          { x: 140, y: 260 },
        ],
      },
    },
    {
      id: "wash",
      tool: "watercolor",
      color: wash,
      size: mm(5),
      shape: {
        kind: "path" as const,
        points: [
          { x: 40, y: 110 },
          { x: 160, y: 150 },
          { x: 290, y: 130 },
          { x: 380, y: 175 },
        ],
      },
    },
  ];
}

/** One stock, painted as the page it is. */
function GroundSwatch({
  stock,
  texture,
  pageColor,
  dark,
}: {
  /** The stock to paint, or `undefined` for the plain solid sheet. */
  stock: string | undefined;
  texture: number;
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
    const ground: Ground | undefined = stock
      ? { stock, ...(texture === 1 ? {} : { texture }) }
      : undefined;
    const drawing: Drawing = {
      id: "swatch",
      name: "",
      width: SAMPLE.width,
      height: SAMPLE.height,
      strokes: sampleMarks(ink, dark ? "#7dd3fc" : "#2563eb"),
      ...(ground ? { ground } : {}),
    };
    const scale = canvas.width / SAMPLE.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // The whole page, through the app's own renderer: same painters, same
    // grain, same mixing. A swatch that drew its own idea of paper would be
    // free to be wrong about it.
    renderDrawing(ctx, drawing, null, { pageColor, defaultInk: ink });
  }, [stock, texture, pageColor, dark]);

  return (
    <canvas
      ref={ref}
      style={{ width: SWATCH.width, height: SWATCH.height }}
      className="block rounded-sm"
    />
  );
}

/** Which shelf a drawing's current stock sits on — what the family control
 *  opens showing. A page with no ground, and one naming a stock this build
 *  doesn't ship, are both on the solid shelf. */
export function familyOf(ground: Ground | undefined): GroundFamily {
  return groundById(ground?.stock)?.family ?? "solid";
}

/** The Surface section of Settings → Canvas. */
export function SurfaceSection({
  store,
  pageColor,
  dark,
}: {
  store: PaintStore;
  /** The page colour the drawing actually paints on, so the swatches are this
   *  page on that stock rather than a stranger's. */
  pageColor: string;
  dark: boolean;
}) {
  const t = useT();
  const ground = store.activeDrawing?.ground;
  const family = familyOf(ground);
  const stocks = groundsInFamily(family);
  const chosen = groundById(ground?.stock) ?? GROUNDS[0]!;
  const texture = ground?.texture ?? 1;

  const families = [
    { value: "solid" as const, label: t("settings.canvas.surfaceSolid") },
    { value: "paper" as const, label: t("settings.canvas.surfacePaper") },
    { value: "canvas" as const, label: t("settings.canvas.surfaceCanvas") },
  ];

  /** Move to a stock, keeping the grain weight the drawing already had — you
   *  picked "half the grain" about this page, not about that sheet. The solid
   *  sheet is stored as *no ground at all*, so a page put back on it is
   *  byte-for-byte the document it was before anyone opened this section. */
  const choose = (stock: GroundDescriptor) => {
    if (stock.family === "solid") {
      store.setGround(undefined);
      return;
    }
    store.setGround({
      stock: stock.id,
      ...(texture === 1 ? {} : { texture }),
    });
  };

  return (
    <Section title={t("settings.canvas.surfaceTitle")}>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-bright">
          {t("settings.canvas.surfaceLabel")}
        </span>
        <SegmentedControl<GroundFamily>
          value={family}
          options={families}
          onChange={(next) => {
            const first = groundsInFamily(next)[0];
            if (first) choose(first);
          }}
          ariaLabel={t("settings.canvas.surfaceLabel")}
        />

        <div className="flex flex-wrap gap-2">
          {stocks.map((stock) => {
            const picked = stock.id === chosen.id;
            return (
              <button
                key={stock.id}
                type="button"
                onClick={() => choose(stock)}
                aria-pressed={picked}
                title={t(stock.hintKey)}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded border p-1 ${
                  picked
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-muted hover:bg-surface-2"
                }`}
              >
                <GroundSwatch
                  stock={stock.family === "solid" ? undefined : stock.id}
                  texture={texture}
                  pageColor={pageColor}
                  dark={dark}
                />
                <span className="text-[11px] leading-none">
                  {t(stock.nameKey)}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted">{t(chosen.hintKey)}</p>

        {/* How far the grain shows, offered only where there is a grain to
            show: on the solid sheet it would be a slider that moves nothing. */}
        {chosen.family !== "solid" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("settings.canvas.surfaceTexture", {
                value: String(Math.round(texture * 100)),
              })}
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={texture}
              onChange={(e) => {
                const next = Number((e.target as HTMLInputElement).value);
                store.setGround({
                  stock: chosen.id,
                  // Back at the stock's own weight is not a setting: forget it,
                  // so a page nobody has turned up serialises as the sheet
                  // alone. The same rule the tool dials follow.
                  ...(next === 1 ? {} : { texture: next }),
                });
              }}
              className="w-full cursor-pointer"
            />
          </label>
        )}

        <p className="text-xs text-muted">{t("settings.canvas.surfaceHint")}</p>
      </div>
    </Section>
  );
}
