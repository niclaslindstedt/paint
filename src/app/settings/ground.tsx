// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Section } from "@niclaslindstedt/oss-framework/components";

import { GroundSwatch } from "../GroundPicker.tsx";
import { GROUNDS, groundById } from "../ground.ts";
import { useT } from "../i18n/index.ts";
import type { PaintStore } from "../usePaintStore.ts";

// The sheet the open drawing is on — shown here, chosen elsewhere.
//
// **The stock is not editable from Settings.** It is picked once, in the dialog
// that makes the drawing (see `NewDrawingModal`), because a wet mark is painted
// *into* the sheet it was made on: it mixes with what it is over and drags the
// marks it crosses out into its water. Moving a finished painting onto rough
// paper would therefore repaint every mark on it as something the hand that drew
// them never saw, which is an edit to the work rather than a setting. Size and
// surface are the two answers a page is built from; both are asked once.
//
// What *is* editable here is **Grain** — how far the sheet's tooth shows through
// the marks. That is a matter of looking rather than of paint: it changes what
// you see and never how much the sheet drinks (see `groundProfile`), so it stays
// an ordinary page edit, applied live and undone like any other.

/** The Surface section of Settings → Canvas. */
export function SurfaceSection({
  store,
  pageColor,
  dark,
}: {
  store: PaintStore;
  /** The page colour the drawing actually paints on, so the swatch is this page
   *  on its own stock rather than a stranger's. */
  pageColor: string;
  dark: boolean;
}) {
  const t = useT();
  const ground = store.activeDrawing?.ground;
  const chosen = groundById(ground?.stock) ?? GROUNDS[0]!;
  const texture = ground?.texture ?? 1;
  const solid = chosen.family === "solid";

  return (
    <Section title={t("settings.canvas.surfaceTitle")}>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-bright">
          {t("settings.canvas.surfaceLabel")}
        </span>

        {/* The sheet this page was made on, stated rather than offered: the
            swatch, its name, and the line about what it is for. */}
        <div className="flex items-center gap-3">
          <GroundSwatch
            stock={solid ? undefined : chosen.id}
            texture={texture}
            pageColor={pageColor}
            dark={dark}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-fg-bright">{t(chosen.nameKey)}</span>
            <span className="text-xs text-muted">{t(chosen.hintKey)}</span>
          </div>
        </div>

        <p className="text-xs text-muted">
          {t("settings.canvas.surfaceFixed")}
        </p>

        {/* How far the grain shows, offered only where there is a grain to
            show: on the solid sheet it would be a slider that moves nothing. */}
        {!solid && (
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
                  // The stock the *drawing* names, not the one it resolved to:
                  // turning the grain down must never quietly rewrite a page
                  // made on a sort this build has since retired.
                  stock: ground?.stock ?? chosen.id,
                  // Back at the stock's own weight is not a setting: forget it,
                  // so a page nobody has turned up serialises as the sheet
                  // alone. The same rule the tool dials follow.
                  ...(next === 1 ? {} : { texture: next }),
                });
              }}
              className="w-full cursor-pointer"
            />
            <span className="text-xs text-muted">
              {t("settings.canvas.surfaceTextureHint")}
            </span>
          </label>
        )}
      </div>
    </Section>
  );
}
