// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { Ref, ReactNode } from "react";

/** A square icon button in the canvas header row — the same affordance
 *  repeated across the header, so it is one component rather than a copy of the
 *  class list per button. Lives on its own because the download menu's trigger
 *  is one of them and has to look identical to the rest of the row.
 *
 *  It wears the family's header button: a 36px box with a border, tinted accent
 *  while it is on. That is the shape the sibling apps' headers use and the one
 *  this app's own toolbar already uses for a picked tool, so the header no
 *  longer floats a row of bare glyphs over chrome that boxes everything else.
 *  A button that reports state — the star, the layers panel, an open menu —
 *  carries the tint, which is why the glyphs inside no longer colour
 *  themselves. */
export function HeaderIconButton({
  label,
  onClick,
  disabled,
  pressed,
  expanded,
  buttonRef,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Set on the toggles (the star), so the button reports its state. */
  pressed?: boolean;
  /** Set on the button that opens a menu, which reports that instead. */
  expanded?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      aria-expanded={expanded}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors disabled:cursor-default disabled:opacity-30 ${
        pressed || expanded
          ? "border-accent bg-accent/15 text-accent"
          : "border-line text-muted hover:bg-surface-2 hover:text-fg disabled:hover:bg-transparent"
      }`}
    >
      {children}
    </button>
  );
}
