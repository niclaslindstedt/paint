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
// instead. Three shapes is about the ceiling before a glyph reads as texture.
// And where a tool's silhouette is shared with half the toolbar — every pen is
// a stick held at 45° — the mark it leaves is what tells it apart: the marker
// carries its opaque bar, the highlighter its translucent band.

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

/** The eraser tool — a rubber block on its edge, sitting on the page it is
 *  rubbing. The line under it is what stops the block reading as a loose
 *  capsule, and the block runs corner to corner so its two halves stay apart at
 *  18 pixels. */
export function EraserIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M7.8 20.4H20.6" />
      <path d="m3.6 15.4 5 4.8 10-10a2.1 2.1 0 0 0 0-3l-2.8-2.8a2.1 2.1 0 0 0-3 0l-9.2 9.2a2.1 2.1 0 0 0 0 3Z" />
      <path d="m9.8 8.8 5.8 5.8" />
    </svg>
  );
}

/** Clearing the page — a blank sheet, sparkling clean.
 *  Deliberately not a second eraser: it sits beside `EraserIcon` in the eraser's
 *  panel, and two rubber blocks a few pixels apart would say nothing. The frame
 *  is what makes it "all of it" rather than "some of it"; the sheet inside it is
 *  empty, and the sparkle sits *on the corner* rather than in the middle, where
 *  it would read as a mark someone left behind. It is filled because a hollow
 *  four-pointed star closes up into a blob at toolbar size. */
export function ClearPageIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="2.6" y="5.6" width="15.2" height="14.4" rx="2" />
      <path
        d="M19 1.6 19.95 4.45 22.8 5.4 19.95 6.35 19 9.2 18.05 6.35 15.2 5.4 18.05 4.45Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** A straight line, with its two ends marked. A bare diagonal says nothing in
 *  particular; the endpoints are what make it a segment someone drew. */
export function LineIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6.6 17.4 17.4 6.6" />
      <circle cx="5.4" cy="18.6" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="5.4" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** An arrow — the annotated-diagram workhorse. The head is solid: an outlined
 *  one thins to nothing at 18 pixels, which is the size that matters. */
export function ArrowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4.4 19.6 15.6 8.4" />
      <path d="M20.4 3.6 13.4 5.4l4.8 4.8z" fill="currentColor" />
    </svg>
  );
}

/** A rectangle, outlined or solid. Square corners, because that is what the
 *  tool draws. */
export function SquareIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="0.5"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** An ellipse, outlined or solid — fuller than the rectangle is tall, so the
 *  two shape tools do not sit on the toolbar as the same grey lozenge. */
export function CircleIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <ellipse
        cx="12"
        cy="12"
        rx="8.7"
        ry="7.6"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

/** A rectangle with rounded corners — the same box as `SquareIcon` with its
 *  corners taken off, which is the only difference the tool draws and so the
 *  only difference the glyph may show. */
export function RoundSquareIcon({ className, filled }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="3.6"
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

/** A double-headed arrow — the "these are the same distance apart" mark. */
export function DoubleArrowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8.4 15.6 15.6 8.4" />
      <path d="M20.4 3.6 13.6 5.2l5.2 5.2z" fill="currentColor" />
      <path d="M3.6 20.4 10.4 18.8 5.2 13.6z" fill="currentColor" />
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

/** A highlighter — a broad chisel over the translucent band it leaves. The
 *  band is wider and paler than the marker's bar, which is the difference
 *  between the two tools said in the only way that survives 18 pixels. */
export function HighlighterIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M13.4 2.6 21 10.2l-7.2 7.2H8.2L5.2 14.4Z" />
      <path
        d="M3.4 20.4h11"
        strokeWidth="3.4"
        strokeLinecap="butt"
        opacity=".5"
      />
    </svg>
  );
}

/** A bristle brush held at an angle: thin handle, ferrule, splayed bristles.
 *  The mass sits in the head — a brush drawn with an even body reads as a
 *  knife, and one drawn without the ferrule reads as a spoon. It runs the full
 *  diagonal so it carries the same weight as the eraser two buttons along. */
export function BrushIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <g transform="rotate(45 12 12)">
        <path d="M12 1.4v8.2" />
        <path d="M8.85 9.6h6.3v2.8h-6.3z" />
        <path d="M9.4 12.4h5.2l.45 4.6a2.85 2.85 0 0 1-2.85 3.15h-.45a2.85 2.85 0 0 1-2.85-3.15Z" />
      </g>
    </svg>
  );
}

/** The airbrush — a can with its spray fanning out. The spray is four filled
 *  dots rather than a scatter of specks: round caps that small rasterise into
 *  a grey haze, and four is the fewest that still reads as spray. */
export function SprayIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3.6" y="8.8" width="8.8" height="12.4" rx="2.4" />
      <path d="M6.2 8.8V5.8a2.1 2.1 0 0 1 2.1-2.1h1.9" />
      <circle cx="15.8" cy="4.6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="20" cy="3.6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="16.6" cy="9.4" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="20.4" cy="8.4" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The paint bucket — tipped, with a drop leaving it. The drop is filled;
 *  outlined, it was the first thing to disappear on the toolbar. */
export function BucketIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="m3.8 11.6 6.5-6.5a1.1 1.1 0 0 1 1.6 0l5.2 5.2a1.1 1.1 0 0 1 0 1.6l-5.3 5.3a1.7 1.7 0 0 1-2.4 0Z" />
      <path d="m8 7.4-2.4-2.4" />
      <path
        d="M19.6 14.4c1.1 1.6 1.7 2.7 1.7 3.3a1.7 1.7 0 0 1-3.4 0c0-.6.6-1.7 1.7-3.3Z"
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

/** A crayon — the blunt waxy stick in its paper wrapper. It stands upright
 *  where every other drawing tool leans, which is what tells it from them at a
 *  glance; the wrapper is two edges rather than a set of stripes, which closed
 *  up into a smudge. */
export function CrayonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8.4 3.4h7.2v9.8L12 20.6l-3.6-7.4z" />
      <path d="M8.4 7.2h7.2M8.4 11.4h7.2" />
    </svg>
  );
}

/** A calligraphy nib — the flat-edged pen, slit and shoulder. The breather
 *  hole it used to carry was a 1.6-unit circle, i.e. a smudge on the toolbar
 *  and detail nobody needed. */
export function NibIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.6 20.4 7.8 8.8l8-4.8 4.4 4.4-4.8 8-11.8 4Z" />
      <path d="m3.6 20.4 8.2-8.2" />
      <path d="m9.6 6.6 7.8 7.8" />
    </svg>
  );
}

/** The text tool — the printer's A with its serif foot, the mark every paint
 *  program has used for typing since the first one. A capital letter is the one
 *  glyph that says "words" without being a word. */
export function TextIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4.4 19.6 11.4 4.4h1.2l7 15.2" />
      <path d="M7.4 14.4h9.2" />
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

/** The hand — drag the page around rather than draw on it. Three fingers, not
 *  four: at 18 pixels a fourth one costs a gap, and the gaps are the only thing
 *  keeping the hand from rasterising into a mitten. */
export function HandIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6.9 14.6V7.6a2 2 0 0 1 4 0V11" />
      <path d="M10.9 11V6a2 2 0 0 1 4 0v5" />
      <path d="M14.9 11.2V8.4a2 2 0 0 1 4 0v5.8a6.8 6.8 0 0 1-6.8 6.8h-.9a6.1 6.1 0 0 1-4.31-1.79l-3-3a1.9 1.9 0 0 1 2.68-2.68l1.32 1.32" />
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

/** The layer stack — three sheets seen edge on. Opens the layers panel. */
export function LayersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="m12 3 9 5-9 5-9-5Z" />
      <path d="m3.5 12.5 8.5 4.7 8.5-4.7" />
      <path d="m3.5 16.5 8.5 4.7 8.5-4.7" />
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

/** The canvas / page — used for a drawing row and the page settings. */
export function CanvasIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m6 16 4-4 3 3 2-2 3 3" />
    </svg>
  );
}
