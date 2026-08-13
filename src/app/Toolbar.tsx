// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect } from "react";

import { CheckSquareIcon } from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import { enabledPlugins } from "./plugins/registry.ts";
import { PALETTE, SIZES } from "./useAppSettings.ts";

// The toolbar: the enabled tools, the ink, and the shape-fill toggle.
//
// It renders whatever `enabledPlugins` hands back — the core five plus whatever
// the user switched on in Settings → Tools — so a new tool needs no change
// here. Keyboard shortcuts are wired from the plugin descriptors for the same
// reason.

type Props = {
  tool: string;
  onToolChange: (id: string) => void;
  enabled: readonly string[];
  color: string;
  onColorChange: (color: string) => void;
  size: number;
  onSizeChange: (size: number) => void;
  filled: boolean;
  onFilledChange: (filled: boolean) => void;
};

export function Toolbar({
  tool,
  onToolChange,
  enabled,
  color,
  onColorChange,
  size,
  onSizeChange,
  filled,
  onFilledChange,
}: Props) {
  const t = useT();
  const tools = enabledPlugins(enabled);
  const active = tools.find((p) => p.id === tool);

  // Single-key tool shortcuts, read straight off the plugin descriptors. Held
  // back while a text field or a dialog owns the keyboard so typing a drawing's
  // name doesn't swap the pencil for the eraser.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (target?.closest("[role='dialog']")) return;
      const match = tools.find((p) => p.shortcut === e.key.toLowerCase());
      if (!match) return;
      e.preventDefault();
      onToolChange(match.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tools, onToolChange]);

  return (
    // The toolbar is the last thing above the screen edge, and the app paints
    // under the home indicator (`viewport-fit=cover`), so it carries the bottom
    // safe-area inset plus 10px — enough that the swatch row stays a
    // comfortable thumb reach above the indicator instead of sitting on it.
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface px-3 pt-2 [padding-bottom:calc(env(safe-area-inset-bottom)+10px)]"
      role="toolbar"
      aria-label={t("canvas.toolbar")}
    >
      <div className="flex items-center gap-1" role="group">
        {tools.map((plugin) => {
          const Icon = plugin.icon;
          const isActive = plugin.id === tool;
          const name = t(plugin.nameKey);
          return (
            <button
              key={plugin.id}
              type="button"
              onClick={() => onToolChange(plugin.id)}
              aria-pressed={isActive}
              title={
                plugin.shortcut
                  ? `${name} (${plugin.shortcut.toUpperCase()})`
                  : name
              }
              aria-label={name}
              className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border ${
                isActive
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-transparent text-fg hover:border-line hover:bg-surface-2"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </div>

      {/* The ink. Dimmed for a tool that paints with the page colour (the
          eraser) — the swatch would be a lie there — and for one that paints
          nothing at all (the hand). */}
      <div
        className={`flex items-center gap-1 ${
          active?.usesBackground || active?.navigates
            ? "pointer-events-none opacity-40"
            : ""
        }`}
        role="group"
        aria-label={t("canvas.color")}
      >
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onColorChange(swatch)}
            aria-pressed={swatch === color}
            aria-label={swatch}
            title={swatch}
            className={`h-6 w-6 cursor-pointer rounded-full border-2 ${
              swatch === color ? "border-accent" : "border-line"
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>

      {/* The nib. Dimmed alongside the swatches for a tool that leaves no mark
          to have a width. */}
      <div
        className={`flex items-center gap-1 ${
          active?.navigates ? "pointer-events-none opacity-40" : ""
        }`}
        role="group"
        aria-label={t("canvas.size")}
      >
        {SIZES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSizeChange(option)}
            aria-pressed={option === size}
            aria-label={`${option}`}
            title={`${option}`}
            className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border ${
              option === size
                ? "border-accent bg-accent/15"
                : "border-transparent hover:border-line hover:bg-surface-2"
            }`}
          >
            <span
              className="rounded-full bg-fg"
              // The dot previews the actual nib: the same number of document
              // pixels the stroke will be, capped so 16 still fits the button.
              style={{
                width: `${Math.min(option, 16)}px`,
                height: `${Math.min(option, 16)}px`,
              }}
            />
          </button>
        ))}
      </div>

      {/* Only the shape tools honour fill, so the toggle appears with them. */}
      {active?.supportsFill && (
        <button
          type="button"
          onClick={() => onFilledChange(!filled)}
          aria-pressed={filled}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1.5 text-xs ${
            filled
              ? "border-accent bg-accent/15 text-accent"
              : "border-line text-fg hover:bg-surface-2"
          }`}
        >
          <CheckSquareIcon className="h-3.5 w-3.5" />
          {t("canvas.fill")}
        </button>
      )}
    </div>
  );
}
