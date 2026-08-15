// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pixels half of the `.pct` container: rendering a drawing's layers, zipping
// them into a file, and reading one back.
//
// `pct.ts` decides the layout and is pure; everything here needs a canvas, so it
// is split off — that is what keeps the format itself testable in node, and it
// is the same seam `export.ts` sits on (one renderer, no second painting path).
//
// **A layer is rendered by soloing it.** Rather than a second, layer-aware
// painter that could drift from the screen's, the drawing is handed to the
// ordinary renderer with every *other* layer's eye switched off. The pixels a
// layer contributes to the page are then, by construction, the pixels the page
// shows — there is nothing to keep in agreement.

import { bytesToDataUrl } from "@niclaslindstedt/oss-framework/files";

import { drawingToBlob } from "./export.ts";
import { preloadDrawingImages } from "./images.ts";
import { drawingLayers } from "./layers.ts";
import {
  MANIFEST_ENTRY,
  MIMETYPE_ENTRY,
  PCT_MIME,
  PREVIEW_ENTRY,
  VECTORS_ENTRY,
  buildManifest,
  buildVectors,
  planLayers,
  readManifest,
  readVectors,
  serializeManifest,
  type PctManifest,
  type PlannedLayer,
} from "./pct.ts";
import { imageStroke } from "./plugins/builtin/image.ts";
import { renderDrawing, type InkContext } from "./render.ts";
import type { Drawing, Layer, Stroke } from "./types.ts";
import { unzipToMap, zip, type ZipEntry } from "./zip.ts";

const utf8 = new TextEncoder();
const decoder = new TextDecoder();

/** The drawing as the renderer should see it to paint one layer alone: the
 *  target showing, everything else hidden.
 *
 *  The target is unhidden even when the real layer is switched off — the PNG
 *  holds what is *on* a layer, not what is currently showing, exactly as the
 *  layers panel's row preview does. Whether it composites is the manifest's
 *  `hidden` flag to say. */
function solo(drawing: Drawing, layerId: string): Drawing {
  return {
    ...drawing,
    layers: drawingLayers(drawing).map((layer: Layer) => ({
      ...layer,
      hidden: layer.id !== layerId,
    })),
  };
}

/** Whether this layer carries the sheet — only the bottom of the stack does,
 *  and only while it is showing. Mirrors `pct.ts`'s fingerprint input, which is
 *  why a theme flip re-renders the background layer and not the rest. */
function paintsPage(drawing: Drawing, layerId: string): boolean {
  const stack = drawingLayers(drawing);
  const sheet = stack[0];
  return sheet?.id === layerId && sheet.hidden !== true;
}

/** Rasterise one layer at the document's own pixel size, on transparency.
 *
 *  Rejects when the browser won't give a 2D context or refuses the encode,
 *  rather than filing an empty PNG the manifest then claims is the layer. */
export async function renderLayer(
  drawing: Drawing,
  layerId: string,
  ink: InkContext,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(drawing.width));
  canvas.height = Math.max(1, Math.round(drawing.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser gave no 2D canvas context");
  renderDrawing(ctx, solo(drawing, layerId), null, {
    ...ink,
    // The sheet the marks were laid on, so a layer's PNG holds the mixing the
    // canvas showed. Its *grain* only lands on the layer that carries the page
    // (the rest render on transparency), which is where it belongs — the paper
    // is the page, not a film over every sheet of the stack.
    ground: drawing.ground,
    transparentPage: !paintsPage(drawing, layerId),
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("the browser could not encode the layer PNG");
  return blob;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Render every planned layer to PNG bytes, in stack order.
 *
 *  Bitmaps are decoded once up front: a repaint is synchronous, so a photo that
 *  hadn't finished decoding would simply be missing from its layer's file.
 *  Sequential rather than parallel — each render allocates a full-page canvas,
 *  and a tall stack rendered at once is how a phone runs out of memory. */
export async function renderLayers(
  drawing: Drawing,
  planned: readonly PlannedLayer[],
  ink: InkContext,
): Promise<Uint8Array[]> {
  await preloadDrawingImages(drawing);
  const out: Uint8Array[] = [];
  for (const layer of planned) {
    out.push(await blobBytes(await renderLayer(drawing, layer.entry.id, ink)));
  }
  return out;
}

/** Write a drawing out as a `.pct` file.
 *
 *  Entry order is the format's: `mimetype` first and stored, so the archive's
 *  type is readable from its first bytes without inflating anything. */
export async function writePct(
  drawing: Drawing,
  ink: InkContext,
): Promise<Blob> {
  const planned = planLayers(drawing, ink);
  const pixels = await renderLayers(drawing, planned, ink);
  const preview = await blobBytes(
    await drawingToBlob(drawing, "png", {
      ...ink,
      scope: "page",
      transparent: false,
    }),
  );
  const manifest = buildManifest(drawing, planned, { preview: true });

  const entries: ZipEntry[] = [
    { name: MIMETYPE_ENTRY, bytes: utf8.encode(PCT_MIME), compress: false },
    { name: MANIFEST_ENTRY, bytes: utf8.encode(serializeManifest(manifest)) },
    { name: VECTORS_ENTRY, bytes: utf8.encode(buildVectors(drawing)) },
    // PNG is deflate all the way down — running it through again costs CPU to
    // add a few bytes.
    ...planned.map((layer, i) => ({
      name: layer.entry.src,
      bytes: pixels[i]!,
      compress: false,
    })),
    { name: PREVIEW_ENTRY, bytes: preview, compress: false },
  ];
  return new Blob([(await zip(entries)) as BlobPart], { type: PCT_MIME });
}

/** What came out of a container: the drawing, and the index it was described
 *  by. The manifest rides along so a caller can report what it opened. */
export type OpenedPct = {
  drawing: Drawing;
  manifest: PctManifest;
  /** The merged image as a data URL, when the container carried one. The
   *  "is this the file you meant?" thumbnail in the open dialog — a file name
   *  is not confirmation, and re-rendering the drawing to find out would be a
   *  full paint for a picture the container already holds. */
  preview: string | null;
};

/** Read a `.pct` back into a drawing.
 *
 *  Two paths, and the second is the reason the manifest is worth writing at
 *  all: a container carrying `vectors.json` reopens **losslessly**, strokes and
 *  undo-able marks intact; one without it — a container from another tool, or
 *  one whose native payload was stripped — is composed from its layer PNGs
 *  instead, one image stroke per layer. The picture survives either way; only
 *  editability differs.
 *
 *  Throws on bytes that aren't a paint container, or one written by a newer
 *  build than this. */
export async function readPct(file: Blob): Promise<OpenedPct> {
  const files = await unzipToMap(await blobBytes(file));
  const manifestBytes = files.get(MANIFEST_ENTRY);
  if (!manifestBytes) throw new Error("no manifest — not a paint file");
  const manifest = readManifest(decoder.decode(manifestBytes));
  if (!manifest) throw new Error("this file's manifest could not be read");

  const previewBytes = manifest.preview
    ? files.get(manifest.preview)
    : undefined;
  const preview = previewBytes
    ? bytesToDataUrl("image/png", previewBytes)
    : null;

  const vectorsBytes = manifest.vectors
    ? files.get(manifest.vectors)
    : undefined;
  const native = vectorsBytes
    ? readVectors(decoder.decode(vectorsBytes))
    : null;
  if (native) return { drawing: native, manifest, preview };

  return { drawing: flattenedFrom(manifest, files), manifest, preview };
}

/** Compose a drawing from a container's layer PNGs alone — the foreign-file
 *  path. Each layer becomes one image stroke covering the page, on a layer of
 *  its own, so the stack, the names and the eyes all survive even though the
 *  marks do not. */
function flattenedFrom(
  manifest: PctManifest,
  files: ReadonlyMap<string, Uint8Array>,
): Drawing {
  const layers: Layer[] = [];
  const strokes: Stroke[] = [];
  const box = {
    x: 0,
    y: 0,
    width: manifest.canvas.width,
    height: manifest.canvas.height,
  };

  manifest.layers.forEach((entry, index) => {
    layers.push({
      id: entry.id,
      name: entry.name,
      ...(entry.hidden ? { hidden: true } : {}),
      ...(entry.locked ? { locked: true } : {}),
    });
    const bytes = files.get(entry.src);
    if (!bytes) return;
    strokes.push({
      ...imageStroke(bytesToDataUrl("image/png", bytes), box),
      // Deterministic rather than minted: the store re-mints ids as the drawing
      // is added, and a stable one here keeps a re-read of the same file
      // byte-identical.
      id: `stroke-pct-${index}`,
      layer: entry.id,
    });
  });

  return {
    id: manifest.drawing.id,
    name: manifest.drawing.name,
    width: manifest.canvas.width,
    height: manifest.canvas.height,
    ...(manifest.canvas.background
      ? { background: manifest.canvas.background }
      : {}),
    layers,
    strokes,
  };
}
