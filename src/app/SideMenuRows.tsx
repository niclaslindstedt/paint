// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { Ref, ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  FolderIcon,
  FolderOpenIcon,
  InlineEditRow,
  PlusIcon,
} from "@niclaslindstedt/oss-framework/components";
import type { DragHandleProps } from "@niclaslindstedt/oss-framework/sidebar";

import { CanvasIcon } from "./icons.tsx";

// The side menu's presentational leaf rows — the dumb building blocks
// `SideMenuContent` composes: section headings, folder / drawing rows, the
// inline name editors, the button-island cells, the footer rows, and the
// footer's collapse rail. Kept out of `SideMenuContent.tsx` so that file stays
// about the menu's state and actions rather than its pixels (and both stay well
// under the §20.5 size cap). Everything here is a pure function of its props.

/** A small-caps section heading (NAMESPACES / FAVORITES / DRAWINGS), optionally
 *  with a trailing action button. */
export function SectionHeader({
  label,
  border,
  action,
}: {
  label: string;
  border?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-5 pt-3 pb-1 ${
        border ? "border-t border-line" : ""
      }`}
    >
      <span className="text-xs font-bold tracking-wide text-muted uppercase">
        {label}
      </span>
      {action}
    </div>
  );
}

/** One drawing in the menu. `indented` steps it in under a folder header; the
 *  open page tints accent and carries a left edge bar so it reads as "you are
 *  here" without a second glyph. */
export function DrawingRow({
  name,
  active,
  indented,
  onClick,
  trailing,
}: {
  name: string;
  active: boolean;
  indented?: boolean;
  onClick: () => void;
  /** An optional trailing glyph — the favorite star. */
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full cursor-pointer items-center gap-3 py-[var(--density-row-py)] pr-5 text-left text-sm ${
        indented ? "pl-9" : "pl-5"
      } ${
        active
          ? "bg-accent/20 font-bold text-fg-bright shadow-[inset_3px_0_0_var(--color-accent)]"
          : "text-fg hover:bg-surface-2 hover:text-fg-bright"
      }`}
    >
      <CanvasIcon
        className={`h-5 w-5 shrink-0 ${active ? "text-accent" : "text-muted"}`}
      />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {trailing}
    </button>
  );
}

/** A folder header: the fold toggle plus a "+" that drops a new drawing
 *  straight into the group. */
export function FolderRow({
  name,
  count,
  expanded,
  addLabel,
  onToggle,
  onAdd,
}: {
  name: string;
  count: number;
  expanded: boolean;
  addLabel: string;
  onToggle: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-[var(--density-row-py)] pr-1 pl-5 text-left text-sm text-fg hover:text-fg-bright"
      >
        <span className={expanded ? "text-accent" : "text-muted"}>
          {expanded ? (
            <FolderOpenIcon className="h-5 w-5" />
          ) : (
            <FolderIcon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted tabular-nums">
            {count}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        title={addLabel}
        className="mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/** The inline folder-name editor — used both for creating a folder (empty) and
 *  renaming one (seeded). The framework's `InlineEditRow` owns focus-on-mount
 *  and the Enter-commits / Escape-cancels semantics. */
export function FolderEditRow({
  initial = "",
  placeholder,
  onCommit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <InlineEditRow
      initial={initial}
      placeholder={placeholder}
      onCommit={onCommit}
      onCancel={onCancel}
      className="gap-3 pr-2 pl-5"
      icon={<FolderIcon className="h-5 w-5" />}
      iconClassName="text-muted"
    />
  );
}

/** One cell of the button island. Icon-only (the label rides on `aria-label` /
 *  `title`), splitting its row's width evenly; the parent owns the border, the
 *  rounding, and the dividers between cells. The active view tints accent, a
 *  count rides as a corner badge, and a disabled cell (undo at the end of the
 *  timeline) dims and goes inert.
 *
 *  A cell can also be a drop target — the Archive one is. `dropRef` registers
 *  it with the drag hook; `active` outlines it while a drag it would accept is
 *  in flight (so every legal landing spot is visible the moment a row is picked
 *  up), and `over` fills it while the pointer is actually on it. */
export function BarButton({
  children,
  label,
  badge,
  disabled,
  current,
  onClick,
  dropRef,
  over,
  active,
}: {
  children: ReactNode;
  label: string;
  badge?: string;
  disabled?: boolean;
  current?: boolean;
  onClick: () => void;
  dropRef?: (el: HTMLElement | null) => void;
  over?: boolean;
  active?: boolean;
}) {
  // A live drag's feedback wins over the resting "this is the open view" tint:
  // mid-gesture the question is where the row will land, not where you are.
  const state = over
    ? "bg-accent/30 text-fg-bright"
    : active
      ? "text-accent ring-2 ring-accent/50 ring-inset"
      : current
        ? "bg-accent/20 text-fg-bright"
        : "";
  return (
    <button
      ref={dropRef}
      type="button"
      aria-label={label}
      aria-pressed={current}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center py-[calc(var(--density-row-py)+0.25rem)] transition-colors ${
        disabled
          ? "cursor-not-allowed text-muted opacity-40"
          : "cursor-pointer text-fg hover:bg-surface-2 hover:text-fg-bright"
      } ${state}`}
    >
      <span className={over || current ? "text-accent" : "text-muted"}>
        {children}
      </span>
      {badge !== undefined && (
        <span className="absolute top-0.5 right-0.5 rounded-full bg-surface-3 px-1 py-0.5 text-[10px] leading-none text-muted tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

/** A row that can be picked up and dragged somewhere else. The whole row is the
 *  drag source — there is no grip column to spend width on — and the framework
 *  hook splits the gesture by pointer: a mouse presses and drags, a finger
 *  presses and *holds* to lift the row, so a sideways flick stays the row's own
 *  swipe and a vertical drag stays a scroll.
 *
 *  `data-drawer-swipe-ignore` opts the row out of the drawer's swipe-to-close,
 *  so neither the drag nor the swipe strip inside it doubles as a dismiss. */
export function DraggableRow({
  handle,
  children,
}: {
  handle: DragHandleProps;
  children: ReactNode;
}) {
  return (
    <div {...handle} data-drawer-swipe-ignore className="relative">
      {children}
    </div>
  );
}

/** The cursor-following label of whatever is mid-drag — portalled to the body
 *  so it floats above the drawer and everything else. Dumb: the caller resolves
 *  the name and glyph from what it picked up. */
export function DragPreview({
  label,
  icon,
  pointer,
}: {
  label: string;
  icon: ReactNode;
  pointer: { x: number; y: number } | null;
}) {
  if (!pointer) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] flex max-w-[14rem] items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg-bright shadow-lg"
      style={{ left: pointer.x + 14, top: pointer.y + 14 }}
    >
      <span className="text-muted">{icon}</span>
      <span className="truncate">{label}</span>
    </div>,
    document.body,
  );
}

/** The "let go here" cue drawn over a region that accepts a drop — the dashed
 *  accent frame the scrolling list wears while a row dragged out of a folder
 *  hovers it. Click-through, so it can never swallow the drop it advertises. */
export function DropCue({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-2 z-10 flex items-start justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 pt-3">
      <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-fg-bright shadow-sm">
        {label}
      </span>
    </div>
  );
}

/** A footer row that runs an in-app action. */
export function FooterRow({
  children,
  icon,
  onClick,
  buttonRef,
  expanded,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  /** Set on the About row, which anchors its dropdown to this element. */
  buttonRef?: Ref<HTMLButtonElement>;
  expanded?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      {...(expanded === undefined
        ? {}
        : { "aria-haspopup": "menu" as const, "aria-expanded": expanded })}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="text-muted">{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

/** The link sibling of `FooterRow` — an anchor rather than a button, with an
 *  optional subtitle (the Source row's build label) and, for an external
 *  target, a new tab and the trailing glyph that says so. */
export function FooterLink({
  children,
  icon,
  href,
  sublabel,
  external,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  href: string;
  sublabel?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="text-muted">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{children}</span>
        {sublabel && (
          <span className="truncate text-xs text-muted tabular-nums">
            {sublabel}
          </span>
        )}
      </span>
      {external && <ExternalLinkIcon className="h-4 w-4 shrink-0 text-muted" />}
    </a>
  );
}

/** The thin chevron rail above the footer: one line tall, full width. Clicking
 *  it folds the footer away — handing the freed height to the drawing list —
 *  and again to bring it back. Down folds it away, up restores it. */
export function FooterCollapseRail({
  collapsed,
  label,
  onClick,
}: {
  collapsed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="flex w-full shrink-0 cursor-pointer items-center justify-center border-t border-line py-[calc(var(--density-row-py)+0.25rem)] text-muted hover:bg-surface-2 hover:text-fg-bright"
    >
      {collapsed ? (
        <ChevronUpIcon className="h-4 w-4" />
      ) : (
        <ChevronDownIcon className="h-4 w-4" />
      )}
    </button>
  );
}
