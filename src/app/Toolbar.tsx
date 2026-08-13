// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import { enabledPlugins } from "./plugins/registry.ts";
import type { PaintPlugin } from "./plugins/types.ts";
import { PALETTE, SIZES } from "./useAppSettings.ts";

// The toolbar: the enabled tools, the ink, and — behind the shape tools — the
// fill picker.
//
// It renders whatever `enabledPlugins` hands back — the core five plus whatever
// the user switched on in Settings → Tools — so a new tool needs no change
// here. Keyboard shortcuts are wired from the plugin descriptors for the same
// reason.
//
// Fill is **not** a row of its own. A labelled checkbox for it cost a toolbar
// row on a phone and was there whether or not it applied, so it lives on the
// shape button instead: press the button you are already holding a second time
// and a two-cell panel opens upward over the canvas, showing the shape hollow
// and the shape solid. The glyphs *are* the labels — there is nothing to read,
// and nothing on screen until you ask for it. Which tools offer it is still the
// descriptor's `supportsFill`, so nothing here knows what a rectangle is.

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
  // The tool whose fill picker is open, and the button it hangs off. Kept as an
  // id rather than a boolean so switching tools with the panel open can never
  // leave it anchored to a button that no longer means anything.
  const [fillPickerFor, setFillPickerFor] = useState<string | null>(null);
  const fillAnchor = useRef<HTMLButtonElement | null>(null);

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
      // The fill picker belongs to the button it opened from; a tool picked
      // from the keyboard closes it rather than leaving it hanging there.
      setFillPickerFor(null);
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
          // A shape tool's button does two jobs: pick the tool, and — once it
          // is the one you are holding — open its fill picker. That is the
          // "press it twice" gesture, and it costs the toolbar nothing.
          const opensFill = Boolean(plugin.supportsFill) && isActive;
          return (
            <button
              key={plugin.id}
              type="button"
              ref={opensFill ? fillAnchor : undefined}
              onClick={() => {
                setFillPickerFor(opensFill ? plugin.id : null);
                if (!isActive) onToolChange(plugin.id);
              }}
              aria-pressed={isActive}
              aria-haspopup={opensFill ? "menu" : undefined}
              aria-expanded={
                opensFill ? fillPickerFor === plugin.id : undefined
              }
              title={
                plugin.shortcut
                  ? `${name} (${plugin.shortcut.toUpperCase()})`
                  : name
              }
              aria-label={name}
              className={`relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border ${
                isActive
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-transparent text-fg hover:border-line hover:bg-surface-2"
              }`}
            >
              <Icon
                className="h-[18px] w-[18px]"
                filled={Boolean(plugin.supportsFill) && filled}
              />
              {/* The folded corner: the one hint that a second press on this
                  button opens something. Borrowed from the long-press marks on
                  a phone keyboard, and just as quiet — a tool with nothing
                  behind it wears none. */}
              {plugin.supportsFill && (
                <span
                  aria-hidden="true"
                  className="absolute right-[3px] bottom-[3px] h-[5px] w-[5px] bg-current opacity-45 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* The fill picker itself: hollow shape, solid shape, no words. It opens
          upward because the toolbar is the last row on the screen — the panel
          measures the room below it, finds none, and flips over the canvas. */}
      {active?.supportsFill && (
        <FillPicker
          open={fillPickerFor === active.id}
          onClose={() => setFillPickerFor(null)}
          anchor={fillAnchor}
          plugin={active}
          filled={filled}
          onPick={(next) => {
            onFilledChange(next);
            setFillPickerFor(null);
          }}
        />
      )}

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
    </div>
  );
}

/** The fill picker: the active shape drawn hollow and drawn solid, side by
 *  side, anchored over its toolbar button.
 *
 *  Two glyphs and no text, because the glyphs say it better than "Fill shapes"
 *  did and in a fifth of the width — and because the panel is *this* tool's,
 *  so it can show this tool's own mark rather than a generic checkbox. The
 *  framework's `FloatingPanel` brings the flip-when-there's-no-room placement,
 *  the click-outside dismissal, and Escape. */
function FillPicker({
  open,
  onClose,
  anchor,
  plugin,
  filled,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  plugin: PaintPlugin;
  filled: boolean;
  onPick: (filled: boolean) => void;
}) {
  const t = useT();
  const Icon = plugin.icon;
  const options = [
    { value: false, label: t("canvas.fillOutline") },
    { value: true, label: t("canvas.fillFilled") },
  ];

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      triggerRef={anchor}
      placement={{
        width: { kind: "max", maxPx: 96 },
        anchor: "left",
        // Enough to clear the toolbar's own top border, so the panel reads as
        // floating over the page rather than growing out of the row.
        gap: 14,
        coordinateSpace: "viewport",
      }}
      className="p-1"
    >
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={t("canvas.fill")}
      >
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onPick(option.value)}
            aria-pressed={option.value === filled}
            aria-label={option.label}
            title={option.label}
            className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded border ${
              option.value === filled
                ? "border-accent bg-accent/15 text-accent"
                : "border-transparent text-fg hover:border-line hover:bg-surface"
            }`}
          >
            <Icon className="h-5 w-5" filled={option.value} />
          </button>
        ))}
      </div>
    </FloatingPanel>
  );
}
