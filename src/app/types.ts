// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The paint document model. A drawing is a *vector* document: an ordered list
// of strokes, each one a shape plus the ink it was drawn with. Nothing here is
// a bitmap, which is what makes the whole document JSON — small enough for
// localStorage, diffable, undoable step by step, and cheap to push to a cloud
// backend. Rasterising happens only on the way out (PNG export) and on screen.
//
// Every tool in the app produces one of these strokes; a tool plugin picks the
// shape kind it emits and how to paint it (see `plugins/types.ts`).

/** A point in *document* space — canvas pixels, origin top-left. Pointer
 *  coordinates are mapped into this space by the canvas view, so a stroke means
 *  the same thing at any zoom or screen size. */
export type Point = { x: number; y: number };

/** The geometry half of a stroke, tagged by kind so renderers can switch on it.
 *
 *  - `path`     freehand — a polyline sampled from the pointer.
 *  - `segment`  a straight run between two points (lines, arrows).
 *  - `box`      an axis-aligned rectangle between two corners (rects, ellipses).
 *  - `text`     a caption anchored at a point. */
export type Shape =
  | { kind: "path"; points: Point[] }
  | { kind: "segment"; from: Point; to: Point }
  | { kind: "box"; from: Point; to: Point }
  | { kind: "text"; at: Point; text: string };

/** One committed mark on the canvas: which tool made it, the ink, and the
 *  geometry. `tool` is a plugin id — the renderer looks the plugin up to paint
 *  it, so a stroke drawn by a tool that is currently switched off still renders
 *  as long as the plugin is registered (turning a tool off hides it from the
 *  toolbar, it does not erase past work). */
export type Stroke = {
  id: string;
  /** The id of the tool plugin that produced (and paints) this stroke. */
  tool: string;
  /** Stroke colour, a CSS hex string — set only when the user *picked* one.
   *
   *  Absent means "resolve it at paint time" (see `render.ts`): the page colour
   *  for a tool that paints with the background (the eraser), otherwise the
   *  default ink for the current canvas theme. That is what lets a sketch drawn
   *  on a dark page stay legible when the page is flipped to light — the marks
   *  that never chose a colour follow the page, and the ones that did keep
   *  theirs. */
  color?: string;
  /** Stroke width in document pixels. */
  size: number;
  /** Fill the shape with `color` instead of outlining it (shape tools only). */
  filled?: boolean;
  /** Ink opacity, 0–1. Absent means fully opaque; the highlighter uses it. */
  opacity?: number;
  shape: Shape;
};

/** One canvas in the document. The page is a fixed pixel size so a drawing
 *  looks the same on a phone and a laptop — the view scales it to fit rather
 *  than reflowing it. */
export type Drawing = {
  id: string;
  name: string;
  /** Canvas size in document pixels. */
  width: number;
  height: number;
  /** Page colour behind the strokes, a CSS hex string. Absent — the usual case
   *  — means "follow the canvas theme" (see `canvas.ts`), so a drawing made in
   *  the dark app opens light when the app is switched to a light theme.
   *  Setting it pins the page to that colour for good, and the pin travels with
   *  the drawing when it syncs. */
  background?: string;
  strokes: Stroke[];
  /** Optional framework glyph + accent colour, used by the side menu row and
   *  the browser-tab favicon (see the `glyphs` module). */
  glyph?: string;
  color?: string;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** The whole in-memory document for one namespace. Version-free by design —
 *  the version lives only on the bytes at rest (see `migrations.ts`). */
export type AppData = {
  drawings: Drawing[];
  activeDrawingId: string;
};

/** The default page size for a new drawing — 16:10, big enough to sketch a
 *  diagram on and small enough that a phone shows it whole. */
export const DEFAULT_CANVAS = { width: 1600, height: 1000 } as const;

/** A drawing's display name, falling back to a placeholder for an unnamed one
 *  so list rows and the tab title never render empty. */
export function drawingName(d: Drawing | undefined, fallback: string): string {
  const name = d?.name.trim();
  return name ? name : fallback;
}

/** How many marks a drawing holds — the side-menu row's subtitle, and the
 *  count the cloud-setup prompt compares between two copies. */
export function strokeCount(d: Drawing): number {
  return d.strokes.length;
}
