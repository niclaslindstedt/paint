// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { ReactNode } from "react";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  GripIcon,
} from "@niclaslindstedt/oss-framework/components";
import type { DragHandleProps } from "@niclaslindstedt/oss-framework/sidebar";

import { useT } from "../i18n/index.ts";

// The two pieces of chrome every section of the right-hand panel is built from:
// the heading that folds it away and moves it, and the small square glyph
// button its actions are.
//
// They live here rather than in `SidePanel.tsx` because the sections are files
// of their own now — the panel is a list the user arranges, so each section had
// to become a thing that could be rendered in any position rather than a block
// written out in one.

/** One section's heading: the grip that moves it, the title (which is also the
 *  fold switch), and whatever buttons belong to the section.
 *
 *  **The buttons go with the section.** A folded "Layers" showing a + would add
 *  a layer to a list you cannot see, and a folded "Image" showing a bin would
 *  offer to throw away a drawing whose actions are hidden — so the children come
 *  out with the body. The chevron and the grip are what stay, because they are
 *  the two switches the heading *is*: what it shows, and where it sits.
 *
 *  The title is a real button spanning the width the others don't take, so most
 *  of the heading is the fold target rather than a glyph at one end of it. */
export function SectionHeading({
  title,
  open,
  onToggle,
  drag,
  dragging = false,
  className = "",
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** The pointer handlers that lift this section — absent for a panel with only
   *  one section showing, where there is nowhere to move it to. */
  drag?: DragHandleProps;
  /** Whether this section is the one currently in flight. */
  dragging?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    // **The whole heading is the drag source**, not just the grip.
    //
    // It was the grip alone, on the theory that one target should mean one
    // thing — and on a mouse that reads fine. On a finger it was unusable: the
    // grip is sixteen pixels wide, a touch drag begins with a long press held
    // *still*, and a press that misses by two millimetres lands on the fold
    // button instead. A control you cannot hit is not a control, so the press
    // that lifts a section is now anywhere along its heading.
    //
    // The two meanings still don't collide, because they are told apart by the
    // gesture rather than by the pixel: a tap folds, a long press (or a mouse
    // drag past the threshold) lifts, and the hook swallows the click that
    // would otherwise arrive at the end of a real drag. The grip stays as the
    // sign that says so.
    //
    // `data-drawer-swipe-ignore` for the same reason the sidebar's rows carry
    // it: this row owns its own press, and the drawer's swipe-to-close must
    // stand down over it.
    <div
      {...drag}
      data-drawer-swipe-ignore
      className={`flex items-center gap-1 px-2 py-1.5 ${
        drag ? "cursor-grab" : ""
      } ${dragging ? "cursor-grabbing" : ""} ${className}`}
    >
      {/* The grip is a *pointer* affordance and says so — hidden from assistive
          tech rather than announced as a button nothing on a keyboard can
          press. Reordering has a keyboard path already, and it is a better one:
          the arrows on Settings → Panel, which name the section they move and
          say which way. Advertising a control here that only a hand can work
          would be pointing at the worse of the two. */}
      {drag && (
        <span
          aria-hidden="true"
          title={t("settings.panel.drag", { name: title })}
          className={`-ml-1 inline-flex h-6 w-4 shrink-0 items-center justify-center text-muted ${
            dragging ? "text-accent" : ""
          }`}
        >
          <GripIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={
          open
            ? t("panel.collapse", { name: title })
            : t("panel.expand", { name: title })
        }
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded pr-1 text-left text-muted hover:text-fg-bright"
      >
        {open ? (
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-bold tracking-wide uppercase">
          {title}
        </span>
      </button>
      {/* The section's own actions. Their presses are kept out of the drag
          gesture above: a long press on the bin is a press on the bin, not a
          clumsy grab at the heading it sits on. */}
      {open && children ? (
        <span
          className="flex shrink-0 items-center"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </span>
      ) : null}
    </div>
  );
}

/** One of the panel's square glyph buttons. */
export function PanelButton({
  label,
  onClick,
  disabled,
  pressed,
  tone = "muted",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "muted" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-surface-2 hover:text-fg-bright disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent ${
        tone === "danger" ? "text-muted hover:text-danger" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}
