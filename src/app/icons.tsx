// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// App-owned glyphs — the tool marks the framework's icon set doesn't carry.
// Same shape as the framework icons (24×24 line art on `currentColor`,
// `className` for sizing) so they sit beside `PencilIcon` & co. without
// looking imported.
//
// They are drawn for 18 pixels, because that is the size the toolbar renders
// them at (`Toolbar.tsx`), and that size has rules of its own. An outlined
// detail narrower than about two units — a drop, a speck, a breather hole —
// closes up into a grey smudge, so anything that small is drawn *filled*
// instead. Three shapes is about the ceiling before a glyph reads as texture —
// which is why the airbrush is allowed a dozen of them and nothing else is:
// texture is the one thing a spray is supposed to look like.
//
// **A tool is drawn as the implement, not as the mark it leaves.** Every pen in
// the box is therefore the same stick held at the same 45°, and what tells them
// apart is the business end and the one detail each has earned: the crayon its
// wrapper bands, the nib its slit, the highlighter its chisel wedge, the marker
// the opaque bar it lays down. The pencil and the eraser are the two the whole
// set is measured against, and both run corner to corner — a glyph that keeps
// to the middle of the square looks shrunken next to them.
//
// The shape marks are the exception and the reason for the `filled` prop: they
// are not implements, they *are* the mark, so they are drawn as the outline the
// tool draws and asked for a solid version of it too.

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

/** The eraser tool — a rubber block on its edge, lying corner to corner with
 *  the seam between its two halves crossing near the working end. The block
 *  alone is the whole mark: the page line it used to sit on was a third shape
 *  competing with the two that say "eraser". */
export function EraserIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <g transform="rotate(-45 12 12)">
        <rect x="3.4" y="7.5" width="17.2" height="9" rx="2.2" />
        <path d="M9.6 7.5v9" />
      </g>
    </svg>
  );
}

/** A straight line, with its two ends marked. A bare diagonal says nothing in
 *  particular; the endpoints are what make it a segment someone drew. They are
 *  drawn as rings, which is what they are at the size the settings list shows;
 *  at 18 pixels the hole closes and they read as the dots they used to be. */
export function LineIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6.9 17.1 17.1 6.9" />
      <circle cx="5.2" cy="18.8" r="2" />
      <circle cx="18.8" cy="5.2" r="2" />
    </svg>
  );
}

/** An arrow — the annotated-diagram workhorse. The head is the two-stroke
 *  chevron the rest of the line art is drawn with rather than a solid wedge, so
 *  the arrow weighs the same as the line it ends. */
export function ArrowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M5.6 18.4 18.4 5.6" />
      <path d="M9.8 5.6h8.6v8.6" />
    </svg>
  );
}

/** A rectangle, outlined or solid — a box wider than it is tall, with the
 *  corners just taken off. */
export function SquareIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect
        x="3.4"
        y="6.2"
        width="17.2"
        height="11.6"
        rx="2.4"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** An ellipse, outlined or solid — a full circle, so it is taller than the
 *  rectangle and the two shape tools do not sit on the toolbar as the same grey
 *  lozenge. */
export function CircleIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" fill={filled ? "currentColor" : "none"} />
    </svg>
  );
}

/** A rectangle with rounded corners — the same box as `SquareIcon` with its
 *  corners properly taken off, which is the only difference the tool draws and
 *  so the only difference the glyph may show. The radius has to carry that
 *  difference on its own, so it is drawn near the stadium the tool can reach
 *  rather than at the modest curve the plain rectangle now has. */
export function RoundSquareIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect
        x="3.4"
        y="6.2"
        width="17.2"
        height="11.6"
        rx="5.4"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** A triangle, point up. */
export function TriangleIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M12 3.6 21.4 20.4H2.6Z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** A diamond — a square on its corner, the flowchart decision. */
export function DiamondIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M12 2.6 21.4 12 12 21.4 2.6 12Z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** A pentagon, point up. */
export function PentagonIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M12 2.8 21.4 9.6 17.8 20.6H6.2L2.6 9.6Z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** A hexagon on its flats — the way everyone draws one, and the way the tool
 *  draws it (see `hexagonBehaviour`). */
export function HexagonIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M7.2 3.6h9.6L21.6 12l-4.8 8.4H7.2L2.4 12Z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** A five-pointed star, at the pentagram ratio the tool draws (see
 *  `starCorners`) so the glyph and the mark are the same star. */
export function StarShapeIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M12 2.6 15 9.4l7.4.7-5.6 4.9 1.7 7.2L12 18.4l-6.5 3.8 1.7-7.2L1.6 10l7.4-.7Z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** A double-headed arrow — the "these are the same distance apart" mark. Two
 *  of `ArrowIcon`'s chevrons, so the pair reads as one tool drawn twice. */
export function DoubleArrowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M5.6 18.4 18.4 5.6" />
      <path d="M11.2 5.6h7.2v7.2" />
      <path d="M12.8 18.4H5.6v-7.2" />
    </svg>
  );
}

/** The shapes family, for the Settings row the whole group shares — a square,
 *  a circle and a triangle overlapping, the universal "shapes" mark. The
 *  toolbar button never wears this: it wears the shape you are holding. */
export function ShapesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="5.2" />
      <rect x="10.6" y="10.6" width="10.8" height="10.8" rx="1.2" />
    </svg>
  );
}

/** The selection tool — the dashed marquee it drags, which is the one mark this
 *  tool leaves and the one thing that tells it from the rectangle. */
export function SelectIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M3.4 3.4h17.2v17.2H3.4Z"
        strokeDasharray="3.4 2.8"
        strokeLinecap="butt"
      />
    </svg>
  );
}

/** The oval marquee — the same dashed outline, round. Drawn at the same dash
 *  length as the box so the two read as one family at 18 pixels. */
export function SelectOvalIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.6"
        strokeDasharray="3.4 2.8"
        strokeLinecap="butt"
      />
    </svg>
  );
}

/** The lasso — a loop with the tail you dragged it round by, which is the one
 *  thing that tells it from a circle at this size. Dashed, like the rest of the
 *  family: what it leaves is a marquee, not a mark. */
export function LassoIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M12 3.6c4.9 0 8.4 2.9 8.4 6.5S16.9 16.6 12 16.6 3.6 13.7 3.6 10.1 7.1 3.6 12 3.6Z"
        strokeDasharray="3.4 2.8"
        strokeLinecap="butt"
      />
      <path d="M7.4 15.4c-.6 1.8-.2 3.4 1.2 4.8" />
    </svg>
  );
}

/** The tracing selection — a pointer inside an outline that isn't a shape
 *  anybody drew. The dashes say marquee, like the rest of the family; the
 *  irregular loop is the difference, because this is the one selection whose
 *  edge comes off what is *painted* rather than off a drag. The pointer is what
 *  keeps it from reading as the lasso: you press, you don't draw. */
export function TraceSelectIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path
        d="M11.4 3.4c4.4 0 6.6 2 6.6 4.4s-1.4 3-1.4 4.6 2 2.6 2 4.2-2.4 3.6-6.6 3.6-8.6-3.2-8.6-8.2S7 3.4 11.4 3.4Z"
        strokeDasharray="3.2 2.6"
        strokeLinecap="butt"
      />
      <path
        d="m8.6 8.2 5.6 4.2-2.4.4 1.4 2.6-1.6.8-1.3-2.6-1.7 1.8Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Cut — the scissors, for the selection menu's middle action. */
export function ScissorsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="6.2" cy="18" r="2.8" />
      <circle cx="17.8" cy="18" r="2.8" />
      <path d="M8.2 15.8 18.6 3.4" />
      <path d="M15.8 15.8 5.4 3.4" />
    </svg>
  );
}

/** Paste — the clipboard with its clip. */
export function PasteIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9 4.4H6.6a1.8 1.8 0 0 0-1.8 1.8v13.4a1.8 1.8 0 0 0 1.8 1.8h10.8a1.8 1.8 0 0 0 1.8-1.8V6.2a1.8 1.8 0 0 0-1.8-1.8H15" />
      <rect x="9" y="2.4" width="6" height="4" rx="1.2" />
    </svg>
  );
}

/** A marker pen — a fat barrel on a chisel nib, over the opaque bar it lays
 *  down. The bar is the whole point: barrel and nib alone are a pen, and the
 *  toolbar already has one. */
export function MarkerIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <g transform="rotate(45 12 12)">
        <path d="M9.2 2.2h5.6v9.2H9.2z" />
        <path d="M9.2 11.4h5.6l-1.5 4.6h-2.6z" />
      </g>
      <path d="M4.6 20.4h10.6" strokeWidth="2.6" />
    </svg>
  );
}

/** A highlighter — the chisel wedge and the barrel above it, leaning the way
 *  every other pen in the toolbar leans. The wedge is the tool: it is the one
 *  nib in the set wide enough to see the shape of, and it is what tells the
 *  highlighter from the marker beside it. */
export function HighlighterIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="m9.2 11-6 6v3.4h9l3-3" />
      <path d="m21.6 12.2-4.5 4.5a1.9 1.9 0 0 1-2.7 0l-5.1-5.1a1.9 1.9 0 0 1 0-2.7l4.5-4.5" />
    </svg>
  );
}

/** A bristle brush held at an angle: the splayed head at the near end, the
 *  ferrule pinching it, and the handle running out to the far corner. The mass
 *  sits in the head — a brush drawn with an even body reads as a knife — and
 *  the line across the bristles is what keeps the head from reading as a
 *  thumbprint at 18 pixels. */
export function BrushIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M18.4 2.6 14 7l-1.6-1.6a2 2 0 0 0-2.8 0L8 7l9 9 1.6-1.6a2 2 0 0 0 0-2.8L17 10l4.4-4.4a2.1 2.1 0 1 0-3-3Z" />
      <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7" />
      <path d="M14.5 17.5 4.5 15" />
    </svg>
  );
}

/** The airbrush — a can down in the corner with its spray filling the rest of
 *  the square. The spray is a grid of filled specks rather than a scatter:
 *  round caps that small rasterise into a haze either way, and a regular grid
 *  is the one arrangement that still reads as spray once it does. */
export function SprayIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="5.2" y="6.6" width="4" height="4" rx="0.8" />
      <path d="M5.2 10.6 3.2 12.6v7.6c0 .6.4 1 1 1h6c.6 0 1-.4 1-1v-7.6l-2-2" />
      <g fill="currentColor" stroke="none">
        <circle cx="14.6" cy="2.8" r="0.95" />
        <circle cx="17.8" cy="2.8" r="0.95" />
        <circle cx="21" cy="2.8" r="0.95" />
        <circle cx="14.6" cy="6" r="0.95" />
        <circle cx="17.8" cy="6" r="0.95" />
        <circle cx="21" cy="6" r="0.95" />
        <circle cx="14.6" cy="9.2" r="0.95" />
        <circle cx="17.8" cy="9.2" r="0.95" />
        <circle cx="21" cy="9.2" r="0.95" />
        <circle cx="17.8" cy="12.4" r="0.95" />
        <circle cx="21" cy="12.4" r="0.95" />
      </g>
    </svg>
  );
}

/** The paint bucket — tipped, with a drop coming off its low corner. The drop
 *  is filled; outlined, it was the first thing to disappear on the toolbar. */
export function BucketIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="m3.8 11.6 6.5-6.5a1.1 1.1 0 0 1 1.6 0l5.2 5.2a1.1 1.1 0 0 1 0 1.6l-5.3 5.3a1.7 1.7 0 0 1-2.4 0Z" />
      <path d="m8 7.4-2.4-2.4" />
      <path
        d="M19.7 15.9c1.1 1.6 1.6 2.6 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-.6.5-1.6 1.6-3.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The colour dropper — a pipette with a loaded bulb. The solid bulb is the
 *  one mark a pencil never has, and without it the two glyphs are the same
 *  diagonal stick. */
export function DropperIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M16.6 2.8a3 3 0 0 1 4.6 3.8l-2.4 2.4-4-4Z" fill="currentColor" />
      <path d="m13.4 6.2 4.4 4.4-8 8-3.9.9a1 1 0 0 1-1.2-1.2l.9-3.9Z" />
    </svg>
  );
}

/** A crayon — the blunt waxy stick in its paper wrapper, leaning with the rest
 *  of the drawing tools. Three bands of wrapper are what tell it from the
 *  pencil it shares a silhouette with: the pencil is bare, the crayon is
 *  banded, and that difference survives being 18 pixels tall. */
export function CrayonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <g transform="rotate(45 12 12)">
        <path d="M8.8 3.2h6.4v10.6L12 20.8l-3.2-7z" />
        <path d="M8.8 6.6h6.4M8.8 10h6.4M8.8 13.4h6.4" />
      </g>
    </svg>
  );
}

/** A calligraphy nib — the dip pen, held the way the rest of them are: a
 *  narrow holder, the nib's shoulders flaring out of it, and the slit running
 *  back from the point. The breather hole it used to carry was a 1.6-unit
 *  circle, i.e. a smudge on the toolbar and detail nobody needed. */
export function NibIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <g transform="rotate(45 12 12)">
        <path d="M10.4 2.6h3.2l1.8 9L12 21l-3.4-9.4z" />
        <path d="M8.6 11.6h6.8" />
        <path d="M12 21v-6.4" />
      </g>
    </svg>
  );
}

/** The text tool — the printer's T, serifed top and foot. A capital letter is
 *  the one glyph that says "words" without being a word, and the T is the one
 *  that says it without also being the shape of a triangle tool. */
export function TextIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4.6 7V4.6h14.8V7" />
      <path d="M12 4.6v14.8" />
      <path d="M8.4 19.4h7.2" />
    </svg>
  );
}

/** Bold — the B of a type shelf, drawn heavy so the weight is the glyph. */
export function BoldIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true" strokeWidth="2.4">
      <path d="M7.4 4.6h5.4a3.7 3.7 0 0 1 0 7.4H7.4Z" />
      <path d="M7.4 12h6.2a3.8 3.8 0 0 1 0 7.6H7.4Z" />
    </svg>
  );
}

/** Italic — the leaning I, top and bottom rules included so the slant reads as
 *  a typographic mark rather than as a stray stroke. */
export function ItalicIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M15.4 4.6H9.8" />
      <path d="M14.2 19.4H8.6" />
      <path d="M13.4 4.6 10.6 19.4" />
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

/** The hand — drag the page around rather than draw on it. The full open palm,
 *  four fingers and a thumb: it is the one glyph in the toolbar that is a
 *  picture of a body part rather than of an implement, so it is the one that
 *  can afford the detail — a hand short of a finger reads as a mistake in a way
 *  a brush short of a bristle does not. */
export function HandIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M18 11V6a2 2 0 0 0-4 0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="m7 15-1.8-1.8a2 2 0 0 0-2.8 2.8l3.6 3.6A6.5 6.5 0 0 0 11.6 21.6H13.4A8 8 0 0 0 21.4 13.6V7a2 2 0 0 0-4 0v5" />
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

/** The right-hand panel — the screen, with a column ruled off down its right
 *  edge and two rows of something in it. It is drawn as the *place* rather than
 *  as what is currently in it: the panel holds the page actions as well as the
 *  layer stack, and a stack of sheets said only half of that. The button sits
 *  at the right end of the header, on the side the panel comes in from. */
export function SidePanelIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="2.8" y="4.4" width="18.4" height="15.2" rx="2" />
      <path d="M13.8 4.4v15.2" />
      <path d="M16.2 9.6h2.8M16.2 14.4h2.8" />
    </svg>
  );
}

// --- The page actions -------------------------------------------------------
// The four things you can do to a whole drawing rather than to a mark. Each is
// drawn as *what happens to the page*, not as an abstract symbol: a sheet with
// an arrow curling over it turns, a sheet split by an axis with one half
// shaded mirrors across that axis. At 18 pixels the shaded half is what makes a
// mirror read as a mirror rather than as a divided rectangle.

/** Turn the page a quarter to the left — the sheet, and the arrow going round
 *  it anticlockwise. */
export function TurnLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 12.5a8 8 0 1 1 2.6 5.9" />
      <path d="M3.4 8.2 4 12.9l4.7-.6" />
      <rect x="9.5" y="9.5" width="6" height="6" rx="1" />
    </svg>
  );
}

/** …and to the right. */
export function TurnRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M20 12.5a8 8 0 1 0-2.6 5.9" />
      <path d="M20.6 8.2 20 12.9l-4.7-.6" />
      <rect x="8.5" y="9.5" width="6" height="6" rx="1" />
    </svg>
  );
}

/** Mirror left to right: an upright axis with the page reflected across it, the
 *  far half shaded so the two read as a reflection rather than as two boxes. */
export function MirrorHorizontalIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 3v18" strokeDasharray="2.6 2.4" />
      <path d="M9.6 6.4 4 12l5.6 5.6Z" />
      <path d="M14.4 6.4 20 12l-5.6 5.6Z" fill="currentColor" opacity=".55" />
    </svg>
  );
}

/** Mirror top to bottom — the same mark on its side. */
export function MirrorVerticalIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 12h18" strokeDasharray="2.6 2.4" />
      <path d="M6.4 9.6 12 4l5.6 5.6Z" />
      <path d="M6.4 14.4 12 20l5.6-5.6Z" fill="currentColor" opacity=".55" />
    </svg>
  );
}

/** Resize the page — a sheet with its corner being pulled out. */
export function ResizeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 9.5V4.5h5" />
      <path d="M4 4.5 9.6 10" />
      <rect x="9.5" y="9.5" width="10.5" height="10" rx="1" />
    </svg>
  );
}

/** A showing layer — the open eye. */
export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** A hidden layer — the eye struck through. */
export function EyeOffIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 5.5 20 18.5" />
      <path d="M9.5 6c.8-.3 1.6-.5 2.5-.5 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.4 4" />
      <path d="M6.3 8.2A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8" />
      <path d="M10.2 10.3a3 3 0 0 0 3.9 4.2" />
    </svg>
  );
}

/** A locked layer — a closed padlock. The shackle sits *on* the body rather
 *  than floating over it, because at 16 pixels a gap of less than two units
 *  between the two closes up and the glyph reads as a blob with a hat. */
export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

/** An unlocked layer — the same padlock with the shackle swung clear. It is the
 *  *open* one that has to read as the quiet state, so the shackle leans off to
 *  the right instead of standing up: the two glyphs then differ in silhouette
 *  rather than in one hidden line. */
export function UnlockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 7.6-1.7" />
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
