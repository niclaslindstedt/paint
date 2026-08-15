// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The `.pct` container — a paint drawing as a layered image file.
//
// A drawing is vectors (`types.ts`), and that is what makes undo exact and the
// synced document a few kilobytes. But a drawing with a stack of layers is also
// a *picture*, and nothing outside this app can read a stroke list. So the
// container carries both halves:
//
//     mimetype          "image/vnd.paint.pct", stored uncompressed and first,
//                       so `file` and friends can sniff the archive's type
//                       without inflating anything (the trick ODF and EPUB use)
//     manifest.json     the index: canvas size, and the layer stack bottom-up
//                       with each layer's name, state, and the PNG it rendered
//                       to. Everything a foreign reader needs.
//     vectors.json      the app's own document, versioned and migrated by the
//                       ordinary chain (`migrations.ts`). What makes reopening
//                       your own file *lossless* rather than a flatten.
//     layers/NN-hash.png   one transparent PNG per layer, bottom first
//     preview.png       the merged image, so a file browser has a thumbnail
//
// A foreign tool reads `manifest.json` + `layers/`; this app reads
// `vectors.json` and gets its strokes back. That split is the whole design, and
// it is the one OpenRaster, Krita and Procreate all landed on — the index and
// the pixels are the interchange, the native payload rides alongside.
//
// **The same manifest and the same layer PNGs are what a remote backend holds**,
// only unpacked: `drawings/<slug>-<tag>/manifest.json` plus that folder's
// `layers/` tree (see `layerStore.ts`). A zip is a bad shape for a backend —
// changing one layer rewrites the whole archive — and an unpacked tree is a bad
// shape for a download. Building both from the functions here is what stops the
// two drifting.
//
// Everything in this module is pure and DOM-free: the manifest is arithmetic
// over the document, and the *pixels* are somebody else's problem (`pctFile.ts`
// renders them, `layerStore.ts` files them). That is what lets a node test drive
// a whole container without a canvas.

import { drawingSlug } from "./export.ts";
import { drawingLayers, groupByLayer, layerFilters } from "./layers.ts";
import { parseDoc, serializeDoc } from "./migrations.ts";
import type { InkContext } from "./render.ts";
import type { Drawing, Filter, Ground, Layer, Stroke } from "./types.ts";

/** The file extension, and the name of the format. */
export const PCT_EXTENSION = "pct";

/** The container's media type. `vnd.` because it is ours and unregistered; it
 *  is written into the archive's first entry and used as the download's Blob
 *  type. */
export const PCT_MIME = "image/vnd.paint.pct";

/** The container layout's version — bumped when the *shape* of the manifest
 *  changes, independently of the document version inside `vectors.json`.
 *
 *  A reader refuses a container from the future rather than guessing at it (see
 *  {@link readManifest}); a container from the past is read as far as its
 *  fields go, because every field added since has been optional. */
export const PCT_VERSION = 1;

export const MIMETYPE_ENTRY = "mimetype";
export const MANIFEST_ENTRY = "manifest.json";
export const VECTORS_ENTRY = "vectors.json";
export const PREVIEW_ENTRY = "preview.png";
export const LAYER_DIR = "layers";

/** The folder a drawing's unpacked container lives in on a remote backend,
 *  under the app folder root. */
export const DRAWING_ROOT = "drawings";

// --- The manifest ------------------------------------------------------------

/** One layer, as the index describes it.
 *
 *  This is the forward-compatible half of the format: a layer that grows a
 *  description, an opacity, or a blend mode grows a field here, and an older
 *  reader ignores what it doesn't know. Every field but `id`, `src` and `hash`
 *  is therefore optional by construction. */
export type PctLayer = {
  id: string;
  /** The layer's name. May be empty — the base and background sheets carry no
   *  name of their own and are labelled by the UI (see `layers.ts`). */
  name: string;
  hidden?: boolean;
  locked?: boolean;
  /** The layer's PNG, relative to the container root (or to the drawing's
   *  folder on a backend): `layers/00-1f3a….png`. */
  src: string;
  /** A fingerprint of everything that went into those pixels (see
   *  {@link layerHash}). Two saves of an untouched layer produce the same hash,
   *  which is what lets a re-save skip re-rendering and re-uploading it. */
  hash: string;
  /** How many marks are on the layer. Not load-bearing — it is here so a human
   *  reading the manifest can tell an empty sheet from a busy one. */
  marks: number;
};

/** The container's index. */
export type PctManifest = {
  /** Always `"pct"` — the cheapest possible "is this ours?" check. */
  format: "pct";
  version: number;
  drawing: {
    id: string;
    name: string;
    /** The short stable disambiguator the backend folder is named with (see
     *  `imageStore.ts`'s `drawingTag`). */
    tag: string;
  };
  canvas: {
    width: number;
    height: number;
    /** The pinned page colour, when the drawing has one. Absent means the page
     *  follows the app's canvas theme — see `Drawing.background`. */
    background?: string;
    /** What the sheet is made of, when it is anything but the plain solid page
     *  — see `Drawing.ground`. It is in the manifest because it is part of the
     *  page rather than of any one layer: a reader that re-renders the vectors
     *  needs it to get the same picture the layer PNGs hold. */
    ground?: Ground;
  };
  /** The stack, **bottom first**, matching `Drawing.layers`. */
  layers: PctLayer[];
  /** The merged image, when the container carries one. Absent in the unpacked
   *  backend tree, which deliberately doesn't spend a full-page upload on a
   *  thumbnail (only changed *layers* are worth the bytes). */
  preview?: string;
  /** The native payload's entry name. Absent means the container has no
   *  vectors — a `.pct` written by something that isn't this app. */
  vectors?: string;
};

// --- Hashing -----------------------------------------------------------------

/** Everything besides the marks themselves that changes what a layer's PNG
 *  looks like.
 *
 *  The page size is obvious. The ink is not: a stroke records a colour only
 *  when the user picked one, and everything else resolves against the theme at
 *  paint time (`render.ts`), so flipping the app from a dark page to a light one
 *  genuinely re-inks the pixels without touching a single stroke. Leave that out
 *  of the fingerprint and a theme flip would quietly serve stale layers.
 *
 *  The layer's own filters are here for exactly that reason. They change the
 *  pixels without changing a mark (see `Layer.filters`), so a layer whose blur
 *  was widened hashes the same as the one before it unless the filters are in
 *  the material — and a re-save would skip it and leave the old softening on
 *  the backend for good. */
export type LayerRenderKey = InkContext & {
  width: number;
  height: number;
  /** Whether this layer carries the sheet — the background layer paints the
   *  page colour as part of itself (see `layers.ts`). */
  paintsPage: boolean;
  /** The layer's own filters, in the order they are applied. */
  filters?: readonly Filter[];
  /** The sheet the marks were laid on. Here for the filters' reason exactly:
   *  changing the paper repaints every mark on it — the grain under them and
   *  the way the wet ones mix (see `ground.ts`) — without touching a single
   *  stroke, so a fingerprint blind to it would keep serving the old pixels. */
  ground?: Ground;
};

/** FNV-1a over a string, seeded, as an unsigned 32-bit number. */
function fnv1a(text: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // The FNV prime, 16777619, by shift-and-add — `h * 16777619` overflows the
    // double's integer range and loses the low bits.
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/** A fingerprint of the pixels a layer would render to: its marks, in order,
 *  plus the page and ink they resolve against.
 *
 *  Sixty-four bits, as two seeded FNV-1a passes — enough that a collision (a
 *  changed layer mistaken for an unchanged one, so a stale PNG left on the
 *  backend) is not a thing that happens, and cheap enough to run over every
 *  layer of every drawing on every save. */
export function layerHash(
  strokes: readonly Stroke[],
  key: LayerRenderKey,
): string {
  const material = JSON.stringify([
    strokes,
    key.width,
    key.height,
    key.pageColor,
    key.defaultInk,
    key.paintsPage,
    // Empty and absent are the same layer and must hash the same. `planLayers`
    // reads the filters off every layer, so most of them arrive as `[]` — and
    // an `[]` that hashed differently from an `undefined` would change the
    // fingerprint of every layer of every drawing already on a backend the
    // moment this shipped, and re-upload the lot.
    key.filters && key.filters.length > 0 ? key.filters : null,
    // Absent and "the solid sheet" are the same page and must hash the same,
    // for the reason above: every drawing already on a backend is on the solid
    // sheet, and a fingerprint that changed for them would re-upload the lot.
    key.ground ?? null,
  ]);
  const lo = fnv1a(material, 0x811c9dc5);
  const hi = fnv1a(material, 0x01000193);
  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

/** The path a layer's PNG is filed at, inside the container or the drawing's
 *  backend folder: `layers/07-1f3a….png`.
 *
 *  The stack position leads so a directory listing sorts bottom-to-top, and the
 *  hash follows so the *bytes at a path never change*. That is what makes a
 *  re-save cheap: an untouched layer keeps its name, so there is nothing to
 *  upload, and a changed layer lands at a new name with the old one pruned
 *  after the manifest commits. It is the rule the sibling `notes` app's
 *  attachment store follows, for the same reason. */
export function layerPath(index: number, hash: string): string {
  return `${LAYER_DIR}/${String(index).padStart(2, "0")}-${hash}.png`;
}

/** A drawing's folder on a remote backend: `drawings/<slug>-<tag>`.
 *
 *  Built from the same slug the PNG export downloads under and the same tag the
 *  image store files bitmaps with, so the three trees read alike. It moves when
 *  the drawing is renamed — the tag is what keeps two drawings sharing a name
 *  apart, and `layerStore.ts` prunes the folder the rename left behind. */
export function drawingFolder(drawing: { id: string; name?: string }): string {
  return `${DRAWING_ROOT}/${drawingSlug(drawing.name ?? "")}-${drawingTagOf(drawing.id)}`;
}

/** The tag half of a drawing folder. Re-derived here rather than imported from
 *  `imageStore.ts` so this module stays free of the byte transports; the two
 *  must agree, and `tests/pct_test.ts` asserts that they do. */
function drawingTagOf(drawingId: string): string {
  let h = 5381;
  for (let i = 0; i < drawingId.length; i += 1) {
    h = (h * 33) ^ drawingId.charCodeAt(i);
  }
  return (h >>> 0).toString(36).padStart(4, "0").slice(-4);
}

// --- Building ----------------------------------------------------------------

/** What one layer of a drawing amounts to: the index entry, and the marks whose
 *  pixels it describes. The renderer takes the marks; the manifest takes the
 *  entry. Handed back together so neither caller has to re-derive the split. */
export type PlannedLayer = { entry: PctLayer; strokes: Stroke[] };

/** Plan a drawing's container: one entry per layer of the stack, bottom first,
 *  each already named and fingerprinted.
 *
 *  Pure, and the *only* place the layout is decided — the download zips these
 *  paths, the backend writes these paths, and the pruner keeps exactly these
 *  paths. */
export function planLayers(drawing: Drawing, ink: InkContext): PlannedLayer[] {
  const stack = drawingLayers(drawing);
  const byLayer = groupByLayer(drawing);
  return stack.map((layer: Layer, index: number) => {
    const strokes = byLayer.get(layer.id) ?? [];
    const hash = layerHash(strokes, {
      ...ink,
      width: drawing.width,
      height: drawing.height,
      paintsPage: paintsPage(drawing, layer),
      filters: layerFilters(layer),
      ground: drawing.ground,
    });
    return {
      strokes,
      entry: {
        id: layer.id,
        name: layer.name,
        ...(layer.hidden ? { hidden: true } : {}),
        ...(layer.locked ? { locked: true } : {}),
        src: layerPath(index, hash),
        hash,
        marks: strokes.length,
      },
    };
  });
}

/** Whether this layer paints the sheet under the drawing. Only the background
 *  layer does, and only while it is showing (see `layers.ts`). */
function paintsPage(drawing: Drawing, layer: Layer): boolean {
  return layer.id === backgroundId(drawing) && layer.hidden !== true;
}

/** The id of the drawing's sheet. Read off the stack rather than assumed, so a
 *  document written by a build with a different base survives. */
function backgroundId(drawing: Drawing): string {
  return drawingLayers(drawing)[0]?.id ?? "";
}

/** Assemble the index for a planned drawing. `preview` names the merged image
 *  when the container carries one; the unpacked backend tree passes none. */
export function buildManifest(
  drawing: Drawing,
  planned: readonly PlannedLayer[],
  options: { preview?: boolean; vectors?: boolean } = {},
): PctManifest {
  return {
    format: "pct",
    version: PCT_VERSION,
    drawing: {
      id: drawing.id,
      name: drawing.name,
      tag: drawingTagOf(drawing.id),
    },
    canvas: {
      width: drawing.width,
      height: drawing.height,
      ...(drawing.background ? { background: drawing.background } : {}),
      ...(drawing.ground ? { ground: drawing.ground } : {}),
    },
    layers: planned.map((p) => p.entry),
    ...(options.preview ? { preview: PREVIEW_ENTRY } : {}),
    ...(options.vectors === false ? {} : { vectors: VECTORS_ENTRY }),
  };
}

/** The native payload: the drawing as an ordinary one-page document, so it
 *  rides the *existing* migration chain on the way back in rather than needing
 *  a second one of its own. */
export function buildVectors(drawing: Drawing): string {
  return serializeDoc({
    folders: [],
    drawings: [drawing],
    activeDrawingId: drawing.id,
  });
}

/** Pretty-printed, because a manifest is meant to be opened and read. It is a
 *  few hundred bytes either way, and it deflates to nothing. */
export function serializeManifest(manifest: PctManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// --- Reading -----------------------------------------------------------------

/** Parse and vet an index. `null` when the bytes aren't a manifest at all;
 *  throws when they are one this build is too old to read — the two cases the
 *  caller wants to tell apart ("not a paint file" vs "a newer paint file"). */
export function readManifest(text: string): PctManifest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const manifest = raw as Partial<PctManifest>;
  if (manifest.format !== "pct") return null;
  if (typeof manifest.version !== "number") return null;
  if (manifest.version > PCT_VERSION) {
    throw new Error(
      `this drawing was written by a newer version of the app (container v${manifest.version}, this build reads v${PCT_VERSION})`,
    );
  }
  if (!Array.isArray(manifest.layers)) return null;
  if (!manifest.canvas || typeof manifest.canvas.width !== "number") {
    return null;
  }
  return manifest as PctManifest;
}

/** The drawing inside a container's native payload, or `null` when the bytes
 *  don't parse as one. Runs the ordinary migration chain, so a `.pct` written
 *  by an older build opens in this one. */
export function readVectors(text: string): Drawing | null {
  try {
    return parseDoc(text).drawings[0] ?? null;
  } catch {
    return null;
  }
}

/** Every layer PNG path the manifest claims — what the backend pruner keeps and
 *  everything else in the drawing's folder is an orphan. */
export function manifestLayerPaths(manifest: PctManifest): Set<string> {
  return new Set(manifest.layers.map((l) => l.src));
}

/** A drawing read out of a container, ready to be filed into *this* sketchbook.
 *
 *  Everything the page is made of survives — its size, its pinned colour, its
 *  stack, its marks — and the identities do not: the drawing's own id is
 *  dropped (the store mints one) and every stroke is re-minted through
 *  `mintStrokeId`. That is the same rule a hand-off between sketchbooks follows
 *  (`handoff.ts`), for the same reason: opening a file twice must give two
 *  drawings, not one drawing whose marks share ids with another's and undo each
 *  other's edits.
 *
 *  Shaped as the store's `addDrawing` init, so the caller does no assembling. */
export function adoptDrawing(
  drawing: Drawing,
  mintStrokeId: () => string,
): Partial<Omit<Drawing, "id">> {
  return {
    width: drawing.width,
    height: drawing.height,
    ...(drawing.background ? { background: drawing.background } : {}),
    ...(drawing.ground ? { ground: drawing.ground } : {}),
    ...(drawing.layers ? { layers: drawing.layers } : {}),
    ...(drawing.activeLayerId ? { activeLayerId: drawing.activeLayerId } : {}),
    strokes: drawing.strokes.map((stroke) => ({
      ...stroke,
      id: mintStrokeId(),
    })),
  };
}
