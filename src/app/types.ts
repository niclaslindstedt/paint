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
 *  - `region`   an area, as closed outlines — what the paint bucket leaves
 *               behind. Painted with the even-odd rule, so a loop inside
 *               another loop is a hole rather than a second coat (see
 *               `flood.ts`).
 *  - `text`     a caption anchored at a point.
 *  - `image`    a bitmap dropped onto the page, held inline as a data URL and
 *               placed between two corners like a `box`. The one place a
 *               drawing carries pixels rather than geometry — an imported photo
 *               has no vector form, so the alternative to inlining it is not
 *               having it at all. It is still *one stroke*: it undoes, syncs,
 *               and exports like every other mark.
 *
 *               On a remote backend the bytes are filed out to a real image
 *               file beside the document and `src` is replaced by `srcPath`
 *               (see `imageStore.ts`) — which is why `src` is optional: a
 *               freshly-loaded stroke whose file couldn't be read has the
 *               reference but not yet the pixels, and paints nothing rather
 *               than tearing the page down. The working copy on this device
 *               always keeps the bytes inline. */
export type Shape =
  | { kind: "path"; points: Point[] }
  | { kind: "segment"; from: Point; to: Point }
  | { kind: "box"; from: Point; to: Point }
  | { kind: "region"; contours: Point[][] }
  | { kind: "text"; at: Point; text: string }
  | {
      kind: "image";
      from: Point;
      to: Point;
      /** The bitmap as a data URL. Absent only between a remote load and the
       *  file read that re-inlines it — see `srcPath`. */
      src?: string;
      /** Where the bitmap's bytes are filed on the active remote backend,
       *  relative to its app folder (`images/<slug>-<tag>-<n>.png`). Written by
       *  the externaliser, and carried in the document so the next device knows
       *  which file to read back. */
      srcPath?: string;
    };

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
  /** How crisp the mark's edge is, 0 (a soft airbrushed fade) to 1 (a hard
   *  edge). Absent means hard — only the tools that advertise
   *  `supportsHardness` ever record it, so a pencil line stays a pencil line
   *  however the toolbar's hardness dial is set. */
  hardness?: number;
  /** Fill the shape with `color` instead of outlining it (shape tools only). */
  filled?: boolean;
  /** Ink opacity, 0–1. Absent means fully opaque; the highlighter uses it. */
  opacity?: number;
  shape: Shape;
};

/** A group of drawings in the side menu. Flat by design — a sketchbook is a
 *  shallow thing, and one level of grouping ("Diagrams", "Scratch") is what a
 *  drawer this size can show without turning into a tree view.
 *
 *  Archiving a folder archives the drawings filed in it; the folder itself is
 *  held, not deleted, so restoring it brings the whole group back. */
export type Folder = {
  id: string;
  name: string;
  archived?: boolean;
  createdAt?: string;
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
  /** The folder this drawing is filed in, or `null`/absent for one that sits at
   *  the top level of the menu. An id that names no present folder reads as
   *  ungrouped, so a drawing is never stranded by a pruned folder. */
  folderId?: string | null;
  /** Starred — mirrored into the menu's Favorites section so it stays one tap
   *  away wherever it is filed. */
  favorite?: boolean;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** The whole in-memory document for one namespace. Version-free by design —
 *  the version lives only on the bytes at rest (see `migrations.ts`). */
export type AppData = {
  folders: Folder[];
  drawings: Drawing[];
  activeDrawingId: string;
};

/** The default page size for a new drawing — 16:10, and deliberately larger
 *  than any screen it will be opened on.
 *
 *  A page that fits the viewport is a page you run out of: the drawing opens
 *  fitted, and the first diagram that needs one more box has nowhere to put it.
 *  At this size the canvas opens at 1:1 as a *window* onto a much bigger sheet —
 *  pinch to zoom, two fingers to pan (see `viewport.ts`) — so there is always
 *  room to the right of what you have drawn. It stays small enough that a
 *  full-page PNG export is a sane file, which an unbounded canvas would not be. */
export const DEFAULT_CANVAS = { width: 3200, height: 2000 } as const;

/** A drawing's display name, falling back to a placeholder for an unnamed one
 *  so list rows and the tab title never render empty. */
export function drawingName(d: Drawing | undefined, fallback: string): string {
  const name = d?.name.trim();
  return name ? name : fallback;
}

// --- Selectors ---------------------------------------------------------------
//
// The reads the side menu and the archive screen share. Pure functions of the
// document, kept here beside the shapes they walk so the two screens can never
// disagree about what "live", "favorite", or "in this folder" means.

/** The folders shown in the menu — everything not archived, oldest first (the
 *  order they were created in, which is the order they were added to the
 *  array). */
export function liveFolders(data: AppData): Folder[] {
  return data.folders.filter((f) => !f.archived);
}

/** When a drawing last changed — its `updatedAt` if it has been edited since it
 *  was made, otherwise the moment it was created. A drawing carrying neither
 *  (one written by a build older than those stamps) sorts oldest. */
export function lastTouched(d: Drawing): number {
  const stamp = d.updatedAt ?? d.createdAt;
  if (!stamp) return 0;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Most recently edited first — the order every list of drawings is shown in.
 *  A sketchpad is a working surface, so what you touched last is what you are
 *  most likely to want next; ties fall back to the name so the order is stable
 *  rather than arbitrary. */
export function byRecency(a: Drawing, b: Drawing): number {
  return lastTouched(b) - lastTouched(a) || a.name.localeCompare(b.name);
}

/** The drawings shown in the menu — everything not archived, most recently
 *  edited first. */
export function liveDrawings(data: AppData): Drawing[] {
  return data.drawings.filter((d) => !d.archived).sort(byRecency);
}

/** The live drawings filed in `folderId` (pass `null` for the ungrouped ones at
 *  the top level). A drawing pointing at a folder that no longer exists counts
 *  as ungrouped, so nothing disappears from the menu when a folder is pruned. */
export function drawingsInFolder(
  data: AppData,
  folderId: string | null,
): Drawing[] {
  const known = new Set(liveFolders(data).map((f) => f.id));
  return liveDrawings(data).filter((d) => {
    const filed =
      d.folderId != null && known.has(d.folderId) ? d.folderId : null;
    return filed === folderId;
  });
}

/** The starred, non-archived drawings — the menu's Favorites section, flat:
 *  a favorite is a shortcut, so it reads in one list regardless of where it is
 *  filed. */
export function favoriteDrawings(data: AppData): Drawing[] {
  return liveDrawings(data).filter((d) => d.favorite);
}

/** How many items the Archive holds — archived drawings plus archived folders.
 *  The badge on the menu's Archive button. */
export function archivedCount(data: AppData): number {
  return (
    data.drawings.filter((d) => d.archived).length +
    data.folders.filter((f) => f.archived).length
  );
}
