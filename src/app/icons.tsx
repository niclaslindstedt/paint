// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// App-owned glyphs — the tool marks the framework's icon set doesn't carry.
// Same shape as the framework icons (24×24 line art on `currentColor`,
// `className` for sizing) so they sit beside `PencilIcon` & co. without
// looking imported.

type IconProps = {
  className?: string;
  /** Paint the glyph solid rather than as an outline. Only the shape marks
   *  honour it — it is how the fill picker shows the two ways a shape can be
   *  drawn without a word of text (see `Toolbar.tsx`). */
  filled?: boolean;
};

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

/** Clearing the page — the sheet itself, wiped back to blank.
 *  Deliberately not a second eraser: it sits beside `EraserIcon` in the eraser's
 *  panel, and two rubber blocks a few pixels apart would say nothing. The frame
 *  is what makes it "all of it" rather than "some of it", and what is left
 *  inside it is a clean sheet rather than a mark. */
export function ClearPageIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M12 8.2l1.3 2.5 2.5 1.3-2.5 1.3-1.3 2.5-1.3-2.5-2.5-1.3 2.5-1.3z" />
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

/** A rectangle, outlined or solid. */
export function SquareIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="1.5"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** An ellipse, outlined or solid. */
export function CircleIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <ellipse
        cx="12"
        cy="12"
        rx="8.5"
        ry="7"
        fill={filled ? "currentColor" : "none"}
      />
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

/** A bristle brush, loaded and held at an angle. */
export function BrushIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3l-6.2 5.4-2.2-2.2Z" />
      <path d="M11 10.5 13.5 13l-1.2 1.9a4 4 0 0 1-2.2 1.7l-3.4 1 1-3.4a4 4 0 0 1 1.7-2.2Z" />
      <path d="M6.5 17.5c-.6 1.4-1.7 2.3-3.5 2.6.8-1.5 1-2.6.8-3.6Z" />
    </svg>
  );
}

/** The airbrush — a can with its spray fanning out. */
export function SprayIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="7" y="9" width="8" height="12" rx="2" />
      <path d="M9 9V6a2 2 0 0 1 2-2h1" />
      <path d="M18 5h.01M21 4h.01M18 9h.01M21 8.5h.01M20.5 12h.01M18 13h.01" />
    </svg>
  );
}

/** The paint bucket — tipped, with a drop leaving it. */
export function BucketIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="m4.5 11.5 6.2-6.2a1 1 0 0 1 1.4 0l4.9 4.9a1 1 0 0 1 0 1.4l-5 5a1.6 1.6 0 0 1-2.3 0l-5.2-5.1Z" />
      <path d="m8.5 7.5-2-2" />
      <path d="M19 15c1 1.4 1.6 2.4 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.6.6-1.6 1.6-3Z" />
    </svg>
  );
}

/** The colour dropper — a pipette over a drop of colour. */
export function DropperIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="m14.5 5.5 4 4" />
      <path d="M17 3a2.8 2.8 0 0 1 4 4l-2.3 2.3-4-4Z" />
      <path d="m13.5 6.5 4 4-7.6 7.6a2 2 0 0 1-1 .55l-3.2.7.7-3.2a2 2 0 0 1 .55-1Z" />
    </svg>
  );
}

/** A crayon — the blunt, waxy stick. */
export function CrayonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9 3h6l1 4v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7Z" />
      <path d="M8 7h8" />
      <path d="M11 11v4M14 11v4" />
    </svg>
  );
}

/** A calligraphy nib — the flat-edged pen. */
export function NibIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 20 8 9l8-5 4 4-5 8-11 4Z" />
      <path d="m4 20 7.5-7.5" />
      <path d="M13 10.5a1.6 1.6 0 1 1-2.2 2.2 1.6 1.6 0 0 1 2.2-2.2Z" />
    </svg>
  );
}

/** The neon pen — a line wearing its own glow. */
export function GlowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

/** The colour picker's custom-mixing cell — a swatch with a plus. */
export function CustomColorIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** The hand — drag the page around rather than draw on it. */
export function HandIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M7 13V7a1.75 1.75 0 0 1 3.5 0v4" />
      <path d="M10.5 11V5.25a1.75 1.75 0 0 1 3.5 0V11" />
      <path d="M14 11V6.5a1.75 1.75 0 0 1 3.5 0V11" />
      <path d="M17.5 10.25a1.75 1.75 0 0 1 3.5 0V14.5a6.5 6.5 0 0 1-6.5 6.5h-1.6a6 6 0 0 1-4.24-1.76l-3.6-3.6a1.75 1.75 0 0 1 2.47-2.47L7 15.5" />
    </svg>
  );
}

/** A file of one particular type — a badge wearing the format's name. The
 *  download menu shows one per offered type, which is what makes the menu
 *  readable at a glance: the row for a PNG *looks* like a PNG.
 *
 *  The label is the glyph rather than a detail inside one: three letters in a
 *  box carry at 20 pixels, where the same letters printed on a document sheet
 *  with a dog-ear are a grey smudge. */
export function FileFormatIcon({
  className,
  label,
}: IconProps & { label: string }) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" strokeWidth="1.5" />
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        style={{ font: "700 9px ui-sans-serif, system-ui, sans-serif" }}
      >
        {label}
      </text>
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
