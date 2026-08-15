// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import { useT } from "../i18n/index.ts";
import { sameColor } from "../color.ts";
import type { PaintPlugin, ToolSwatch } from "../plugins/types.ts";
import { PALETTE } from "../useAppSettings.ts";

// The inks a tool carries of its own, as a section of its settings panel.
//
// `ToolDials` for colours, and laid out the way a panel with one thumb in front
// of it has to be: **the tool's swatches on one row, and one palette under
// them**. A grid per swatch would be three palettes stacked in a panel that
// opens over the page you are working on; a row of round buttons is the tool's
// whole ink at a glance, and pressing one says which of them the palette below
// is about.
//
// The row is the tool's, not the toolbar's — which is the point of the whole
// mechanism. A gradient is poured from two colours (or three), and neither of
// them could ever be the one on the ink button, so the ink button is dimmed and
// these are where its colours live (see `plugins/swatches.ts`).
//
// Nothing here knows what a gradient is. The swatches, their names and whether
// one of them may be switched off all come off the descriptor the plugin
// declared, and a tool that declares four gets four.

type Props = {
  /** The tool whose inks these are. */
  plugin: PaintPlugin | undefined;
  /** What it declares — in the order it declared them, which is the order they
   *  are shown in. */
  swatches: readonly ToolSwatch[];
  /** Where they currently sit, resolved — every one of them, so a button has a
   *  colour whether or not the user has touched it. An empty string is a swatch
   *  that is switched off. */
  values: Readonly<Record<string, string>>;
  /** Re-colour one, or forget it with `null` — what the panel sends for a
   *  swatch put back to the colour the tool ships with. */
  onChange: (id: string, color: string | null) => void;
  /** The colours the user has mixed for themselves, offered beside the built-in
   *  palette exactly as the ink picker offers them. */
  customColors: readonly string[];
};

export function ToolSwatches({
  plugin,
  swatches,
  values,
  onChange,
  customColors,
}: Props) {
  const t = useT();
  // Which swatch the palette below is about. The first one to begin with —
  // "from" is where anyone mixing a ramp starts — and it is remembered only for
  // as long as the panel is open, because it is a place in a conversation
  // rather than a setting.
  const [editing, setEditing] = useState(swatches[0]?.id ?? "");
  useEffect(() => {
    if (!swatches.some((s) => s.id === editing)) {
      setEditing(swatches[0]?.id ?? "");
    }
  }, [swatches, editing]);
  const active = swatches.find((s) => s.id === editing) ?? swatches[0];
  if (!active) return null;
  const chosen = values[active.id] ?? "";

  /** Set the swatch being edited — back to `null` when the colour picked is the
   *  one the tool ships with, so the blob only ever holds what differs. */
  const pick = (color: string) => {
    onChange(active.id, color === (active.default ?? "") ? null : color);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5" role="group">
        {swatches.map((swatch) => {
          const color = values[swatch.id] ?? "";
          const label = t(swatch.nameKey);
          return (
            <button
              key={swatch.id}
              type="button"
              onClick={() => setEditing(swatch.id)}
              aria-pressed={swatch.id === active.id}
              aria-label={label}
              title={label}
              className={`flex flex-1 cursor-pointer flex-col items-center gap-1 rounded border px-1 py-1.5 ${
                swatch.id === active.id
                  ? "border-accent bg-accent/10"
                  : "border-transparent hover:border-line"
              }`}
            >
              {/* A swatch that is off is drawn as an empty ring rather than as
                  a colour, because "no colour" is what it is — the same thing
                  the panel's None button sets it back to. */}
              <span
                aria-hidden="true"
                className={`h-6 w-6 rounded-full border ${
                  color ? "border-line" : "border-dashed border-muted"
                }`}
                style={color ? { backgroundColor: color } : undefined}
              />
              <span className="text-[11px] leading-none text-muted">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* The palette, for whichever swatch is being set. The same colours the
          ink picker offers — the built-in row plus whatever has been mixed —
          because a colour is a colour wherever it is being put. */}
      <div
        className="grid grid-cols-7 gap-1.5"
        role="group"
        aria-label={`${plugin ? `${t(plugin.nameKey)} — ` : ""}${t(active.nameKey)}`}
      >
        {[...PALETTE, ...customColors].map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => pick(color)}
            aria-pressed={Boolean(chosen) && sameColor(color, chosen)}
            aria-label={color}
            title={color}
            className={`h-6 w-6 cursor-pointer rounded-full border-2 ${
              chosen && sameColor(color, chosen)
                ? "border-accent"
                : "border-line"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* …and the way back off, for a swatch that has one. Only the swatches
          that can actually be absent get it: a gradient with no first colour is
          not a gradient, but one with no middle is the usual case. */}
      {active.optional && (
        <button
          type="button"
          onClick={() => onChange(active.id, active.default ? null : "")}
          aria-pressed={chosen === ""}
          className={`cursor-pointer rounded border px-2 py-1 text-xs ${
            chosen === ""
              ? "border-accent bg-accent/15 text-accent"
              : "border-line text-muted hover:bg-surface-2 hover:text-fg-bright"
          }`}
        >
          {t("swatches.none", { name: t(active.nameKey) })}
        </button>
      )}
    </div>
  );
}
