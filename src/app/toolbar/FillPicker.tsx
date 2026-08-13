// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { PaintPlugin } from "../plugins/types.ts";

/** The fill picker: the active shape drawn hollow and drawn solid, side by
 *  side, anchored over its toolbar button.
 *
 *  Two glyphs and no text, because the glyphs say it better than "Fill shapes"
 *  did and in a fifth of the width — and because the panel is *this* tool's,
 *  so it can show this tool's own mark rather than a generic checkbox. The
 *  framework's `FloatingPanel` brings the flip-when-there's-no-room placement,
 *  the click-outside dismissal, and Escape. */
export function FillPicker({
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
