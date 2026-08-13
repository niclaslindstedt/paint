// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import { ClearPageIcon } from "../icons.tsx";
import type { PaintPlugin } from "../plugins/types.ts";

/** The erasing tool's panel: rub out by hand, or wipe the page — the two
 *  scales of the same intent, side by side over the button you already pressed.
 *
 *  Built like the fill picker on purpose: two glyphs, no words, and the same
 *  press-it-twice gesture, so a hand that has learned one has learned both.
 *  The left cell is the tool and is always the pressed one while this panel is
 *  open (the panel only opens on the *active* tool's button); the right cell is
 *  an action, not a tool — it doesn't change what you are holding, it opens the
 *  confirm dialog and, if you say yes, files one undoable edit. A page with
 *  nothing on it dims it rather than offering a wipe that would do nothing. */
export function ClearPicker({
  open,
  onClose,
  anchor,
  plugin,
  hasMarks,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  plugin: PaintPlugin;
  /** Whether the page has anything to clear. */
  hasMarks: boolean;
  onClear: () => void;
}) {
  const t = useT();
  const Icon = plugin.icon;
  const toolLabel = t(plugin.nameKey);
  const clearLabel = t("canvas.clear");

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      triggerRef={anchor}
      placement={{
        width: { kind: "max", maxPx: 96 },
        // Anchored from the right: this tool sits at the far end of the
        // toolbar, so a left-anchored panel would hang off the screen.
        anchor: "right",
        gap: 14,
        coordinateSpace: "viewport",
      }}
      className="p-1"
    >
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={t("canvas.erase")}
      >
        <button
          type="button"
          onClick={onClose}
          aria-pressed={true}
          aria-label={toolLabel}
          title={toolLabel}
          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded border border-accent bg-accent/15 text-accent"
        >
          <Icon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasMarks}
          aria-label={clearLabel}
          title={clearLabel}
          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded border border-transparent text-fg hover:border-line hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent"
        >
          <ClearPageIcon className="h-5 w-5" />
        </button>
      </div>
    </FloatingPanel>
  );
}
