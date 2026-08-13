// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { Ref, ReactNode } from "react";

/** A square icon button in the canvas header row — the same affordance
 *  repeated across the header, so it is one component rather than a copy of the
 *  class list per button. Lives on its own because the download menu's trigger
 *  is one of them and has to look identical to the rest of the row. */
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
      className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded hover:bg-surface-2 hover:text-fg disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent ${
        expanded ? "bg-surface-2 text-fg" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}
