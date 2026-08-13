// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// App-owned glyphs — the tool marks the framework's icon set doesn't carry.
// Same shape as the framework icons (24×24 line art on `currentColor`,
// `className` for sizing) so they sit beside `PencilIcon` & co. without
// looking imported.

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** The eraser tool — a rubber block on its edge. */
export function EraserIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8.5 20H20" />
      <path d="m4.7 15.5 4.8 4.5 9.3-9.3a2 2 0 0 0 0-2.8l-2.7-2.7a2 2 0 0 0-2.8 0L4 12.7a2 2 0 0 0 0 2.8Z" />
      <path d="m10.5 9.5 4.7 4.7" />
    </svg>
  );
}

/** A straight line. */
export function LineIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M5 19 19 5" />
    </svg>
  );
}

/** An arrow — the annotated-diagram workhorse. */
export function ArrowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M5 19 19 5" />
      <path d="M11 5h8v8" />
    </svg>
  );
}

/** A rectangle. */
export function SquareIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
    </svg>
  );
}

/** An ellipse. */
export function CircleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <ellipse cx="12" cy="12" rx="8.5" ry="7" />
    </svg>
  );
}

/** A marker pen — the fat freehand tool. */
export function MarkerIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M15 3.5 20.5 9l-9 9H6v-5.5Z" />
      <path d="M4 21h16" />
    </svg>
  );
}

/** A highlighter — a marker laying down a translucent band. */
export function HighlighterIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M13 3.5 20.5 11l-7 7H8l-2.5-2.5Z" />
      <path d="M4 21h7" />
    </svg>
  );
}

/** The tools settings tab / plugin list. */
export function ToolboxIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </svg>
  );
}

/** The canvas / page — used for a drawing row and the page settings. */
export function CanvasIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m6 16 4-4 3 3 2-2 3 3" />
    </svg>
  );
}
