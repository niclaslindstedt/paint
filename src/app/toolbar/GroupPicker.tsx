// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { PaintPlugin } from "../plugins/types.ts";

// The family behind one button: press the shapes button a second time and the
// rest of them open over the canvas.
//
// It is the same gesture the eraser's clear action and the old fill toggle use —
// **the button you are already holding does a second job** — and it is what lets
// eleven shapes cost one slot on a phone's toolbar instead of eleven. The grid
// shows every member drawn in its own glyph, at the size the toolbar draws them,
// so choosing one is recognising a shape rather than reading a list.
//
// Fill rides in the same panel rather than in one of its own. It only ever
// applied to shapes, and a shape and the choice of whether it is hollow or solid
// are one decision made in one place: the row under the grid shows the shape you
// have picked drawn both ways. A member that doesn't honour fill (the line, the
// arrows) simply doesn't get the row.
//
// Nothing here knows what a rectangle is. The members, their glyphs and their
// `supportsFill` all come off the descriptors the group hands over.

/** How many shapes sit on a row. Four across is about as wide as a picker can
 *  be on a phone before it stops fitting over the button that opened it. */
const COLUMNS = 4;

export function GroupPicker({
  open,
  onClose,
  anchor,
  name,
  members,
  active,
  onPick,
  filled,
  onFilledChange,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** The group's own name — the panel's accessible label. */
  name: string;
  members: readonly PaintPlugin[];
  /** The member the button currently stands for. */
  active: PaintPlugin | undefined;
  onPick: (id: string) => void;
  filled: boolean;
  onFilledChange: (filled: boolean) => void;
}) {
  const t = useT();
  const fills = [
    { value: false, label: t("canvas.fillOutline") },
    { value: true, label: t("canvas.fillFilled") },
  ];
  const ActiveIcon = active?.icon;

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      triggerRef={anchor}
      placement={{
        width: { kind: "max", maxPx: COLUMNS * 44 + 10 },
        anchor: "left",
        // Enough to clear the toolbar's own top border, so the panel reads as
        // floating over the page rather than growing out of the row.
        gap: 14,
        coordinateSpace: "viewport",
      }}
      className="p-1"
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
        role="group"
        aria-label={name}
      >
        {members.map((member) => {
          const Icon = member.icon;
          const isActive = member.id === active?.id;
          const label = t(member.nameKey);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => onPick(member.id)}
              aria-pressed={isActive}
              aria-label={label}
              title={
                member.shortcut
                  ? `${label} (${member.shortcut.toUpperCase()})`
                  : label
              }
              className={`inline-flex h-10 w-full cursor-pointer items-center justify-center rounded border ${
                isActive
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-transparent text-fg hover:border-line hover:bg-surface"
              }`}
            >
              {/* Drawn the way it will be drawn: a solid glyph when the fill
                  toggle is on, so the grid previews the mark rather than the
                  tool. A member that ignores fill draws the same either way. */}
              <Icon
                className="h-5 w-5"
                filled={Boolean(member.supportsFill) && filled}
              />
            </button>
          );
        })}
      </div>

      {/* The fill row, for the member that honours it — the active shape drawn
          hollow and drawn solid, which says it better than the words did. */}
      {active?.supportsFill && ActiveIcon && (
        <>
          <span aria-hidden="true" className="my-1 block h-px bg-line" />
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={t("canvas.fill")}
          >
            {fills.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => onFilledChange(option.value)}
                aria-pressed={option.value === filled}
                aria-label={option.label}
                title={option.label}
                className={`inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded border ${
                  option.value === filled
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-transparent text-fg hover:border-line hover:bg-surface"
                }`}
              >
                <ActiveIcon className="h-5 w-5" filled={option.value} />
              </button>
            ))}
          </div>
        </>
      )}
    </FloatingPanel>
  );
}
