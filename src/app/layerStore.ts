// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The unpacked `.pct` container on a remote backend.
//
// A drawing's layers land under `drawings/<slug>-<tag>/` — a `manifest.json`
// index and a `layers/` tree of transparent PNGs, the same two things the
// downloadable `.pct` zips up (see `pct.ts`). Unpacked rather than zipped,
// because a zip is the wrong shape for a backend: changing one layer of one
// drawing would rewrite the whole archive, and re-uploading megabytes to move a
// pencil line is exactly what this layout exists to avoid.
//
// **Nothing here is on the debounced save path.** The vector document is
// kilobytes and pushes itself on every settled edit as it always has; the
// layers are megabytes and go up only when the user presses the disk button
// (see `useSyncEngine.ts`). That split is the whole point — you never lose a
// stroke, and you never pay for a raster you didn't ask for.
//
// What makes even an explicit save cheap is that **a layer's file name contains
// its content hash** (`pct.ts`'s `layerPath`). So the bytes at a path never
// change, and the plan below is a set difference: the paths the drawings *want*
// against the paths the backend *has*. An untouched layer is already there
// under the name it would be written as, so it is neither rendered nor
// uploaded — a save after an afternoon on one layer of one drawing costs
// exactly that one layer. It is the rule the sibling `notes` app's attachment
// store follows, arrived at from the same direction.
//
// Two ordering rules, mirroring `imageStore.ts`'s:
//
//   1. **Pixels before the index.** Layer PNGs are written first and the
//      manifest last, so a manifest never names a file that isn't there. A save
//      that dies halfway leaves unreferenced files — harmless, and pruned next
//      time — rather than an index pointing at nothing.
//   2. **Prune after the index commits, and only from a complete picture.**
//      Orphans are removed only once every manifest has been written, and the
//      whole prune is skipped if any write failed: "no drawing wants this file"
//      is only a sound judgement when every drawing was actually filed.
//
// The planning half is pure, so a node test can drive a rename, a deletion and
// an untouched re-save without a canvas or a network.

import { MEDIA_CONCURRENCY, mapLimit } from "./cloudRetry.ts";
import type { ByteFileStore } from "./imageFileStore.ts";
import { logStore } from "./log.ts";
import {
  DRAWING_ROOT,
  MANIFEST_ENTRY,
  buildManifest,
  drawingFolder,
  planLayers,
  serializeManifest,
} from "./pct.ts";
import type { InkContext } from "./render.ts";
import type { Drawing } from "./types.ts";

const log = logStore.createLogger("layers");

/** Scope a byte store to the `drawings/` tree, so `list` only ever reports
 *  container files — not the document, not the `images/` tree, not a sibling
 *  app's files. */
export function scopeToDrawings(files: ByteFileStore): ByteFileStore {
  return {
    async list() {
      const paths = await files.list();
      return paths.filter((p) => p.startsWith(`${DRAWING_ROOT}/`));
    },
    read: (path) => files.read(path),
    write: (path, bytes, mime) => files.write(path, bytes, mime),
    remove: (path) => files.remove(path),
  };
}

/** One layer PNG that has to be rendered and uploaded. */
export type LayerWrite = {
  path: string;
  drawing: Drawing;
  layerId: string;
};

/** One drawing's index, ready to write. */
export type ManifestWrite = { path: string; text: string };

/** What a save would do. Pure output of {@link planLayerSave} — the whole
 *  decision, before a single byte moves. */
export type LayerSavePlan = {
  /** Layer PNGs the backend doesn't already hold, in stack order. */
  writes: LayerWrite[];
  /** Every live drawing's `manifest.json`. Always rewritten: it is a few
   *  hundred bytes, and it is what records a rename or a reordered stack even
   *  when no layer's pixels moved. */
  manifests: ManifestWrite[];
  /** Files under `drawings/` that no live drawing claims — a superseded layer,
   *  or the whole folder of a drawing since renamed or deleted. */
  prune: string[];
};

/** Work out what a layer save has to move.
 *
 *  `existing` is every path currently under `drawings/`. Everything else is
 *  arithmetic: the paths the drawings want, minus the ones already there, and
 *  the leftovers to prune. */
export function planLayerSave(
  drawings: readonly Drawing[],
  existing: readonly string[],
  ink: InkContext,
): LayerSavePlan {
  const writes: LayerWrite[] = [];
  const manifests: ManifestWrite[] = [];
  const have = new Set(existing);
  const wanted = new Set<string>();

  for (const drawing of drawings) {
    const folder = drawingFolder(drawing);
    const planned = planLayers(drawing, ink);
    const manifestPath = `${folder}/${MANIFEST_ENTRY}`;
    wanted.add(manifestPath);
    manifests.push({
      path: manifestPath,
      // No preview and no vectors on a backend: the merged image would be a
      // full-page upload on every save for a thumbnail nobody asked for, and
      // the strokes already travel in the document beside this tree.
      text: serializeManifest(
        buildManifest(drawing, planned, { preview: false, vectors: false }),
      ),
    });
    for (const layer of planned) {
      const path = `${folder}/${layer.entry.src}`;
      wanted.add(path);
      // Already on the backend under this exact name — so, by the naming rule,
      // already these exact bytes. Nothing to render, nothing to upload.
      if (have.has(path)) continue;
      writes.push({ path, drawing, layerId: layer.entry.id });
    }
  }

  return {
    writes,
    manifests,
    prune: existing.filter((path) => !wanted.has(path)),
  };
}

/** How a save went. `failed` counts layer PNGs that couldn't be written — any
 *  at all holds the prune back. */
export type LayerSaveResult = {
  written: number;
  pruned: number;
  failed: number;
  bytes: number;
};

/** Carry out a plan against a backend.
 *
 *  `render` is injected rather than imported so this module stays free of the
 *  DOM — the app passes `pctFile.ts`'s renderer, a test passes a stub. */
export async function runLayerSave(
  store: ByteFileStore,
  plan: LayerSavePlan,
  render: (drawing: Drawing, layerId: string) => Promise<Uint8Array>,
): Promise<LayerSaveResult> {
  let written = 0;
  let failed = 0;
  let bytes = 0;

  // Rule 1: pixels first. Bounded concurrency, like the image externaliser —
  // a stack of full-page PNGs uploaded all at once is how a phone's radio and
  // a provider's rate limiter both fall over.
  await mapLimit(plan.writes, MEDIA_CONCURRENCY, async (write) => {
    try {
      const png = await render(write.drawing, write.layerId);
      await store.write(write.path, png, "image/png");
      written += 1;
      bytes += png.length;
    } catch (err) {
      failed += 1;
      log.warn(
        `write failed for ${write.path} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // The index, once its pixels are down.
  const encoder = new TextEncoder();
  for (const manifest of plan.manifests) {
    try {
      await store.write(
        manifest.path,
        encoder.encode(manifest.text),
        "application/json",
      );
    } catch (err) {
      failed += 1;
      log.warn(
        `manifest failed for ${manifest.path} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Rule 2: prune only from a complete picture.
  let pruned = 0;
  if (failed === 0) {
    await mapLimit(plan.prune, MEDIA_CONCURRENCY, async (path) => {
      try {
        await store.remove(path);
        pruned += 1;
      } catch {
        // A file we couldn't delete is a file that gets pruned next time.
      }
    });
  } else if (plan.prune.length > 0) {
    log.warn(
      `holding the prune of ${plan.prune.length} file(s) — ${failed} write(s) failed`,
    );
  }

  log.info(
    `save: ${written} layer(s), ${Math.round(bytes / 1024)} KB, ${pruned} pruned${
      failed ? `, ${failed} failed` : ""
    }`,
  );
  return { written, pruned, failed, bytes };
}
