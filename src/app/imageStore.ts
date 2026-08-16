// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Externalise dropped bitmaps to real image files on a remote backend — the
// sibling `contacts` app's photo layout, rescoped to a drawing's image strokes.
//
// A paint document is otherwise pure geometry: a few kilobytes of JSON that can
// be pushed on every settled edit without a thought. One dropped photo changes
// that — a 2000-pixel JPEG inlined as a data URL is megabytes of base64, and the
// debounced save pushes the whole document every time. So this layer sits on the
// remote push/pull only: `withExternalImages` wraps a `StorageAdapter` so that,
// on save, every image stroke's bitmap is decoded to bytes, written to a
// deterministic file (`images/<drawing-slug>-<tag>-<n>.<ext>`, see
// {@link imagePathFor}) and stripped from the synced JSON — leaving the document
// small again and the pictures browsable, genuine `.png` / `.jpg` files — and,
// on load, re-hydrated back onto their strokes from those files.
//
// The always-present on-device working copy (`usePaintStore`, in IndexedDB) keeps every
// bitmap inline, so drawing, undo, export, and the on-device backend are
// untouched. Only what travels through an adapter is split in two.
//
// The `data:` URL ⇄ bytes conversion is the framework's (`files`); the byte
// transports are `imageFileStore.ts` (Dropbox / Google Drive) and
// `folderFileStore.ts` (the picked directory).
//
// Two safety rules make it robust against an untested network:
//   1. **Externalise-or-embed** — a bitmap is only stripped from the outgoing
//      document *after* its file write succeeds. A failed write leaves the image
//      inline, so a picture is never lost, only un-filed.
//   2. **Prune after commit, and only from a complete picture** — orphaned image
//      files are removed only once the document save has committed, so a save
//      that throws (a conflict, say) never deletes a file the surviving remote
//      copy still references. And "orphan" means "no stroke wants this file",
//      which is only a sound judgement when the outgoing document was fully
//      understood: if any image failed to file out, or the document wouldn't
//      parse, the whole prune is skipped for that save rather than deleting a
//      file a working document still points at. That is the rule that keeps a
//      throttled upload from costing a picture.
//
// Unlike the contacts port there is no reconcile pass, and it isn't an omission:
// there, a stray photo file could be re-attached to the card its name points at,
// because a card can hold a photo it doesn't yet know about. Here the file names
// a *stroke*, and a stroke is geometry — where the picture sits on the page,
// how big it is, what order it paints in. A file whose stroke is gone names
// nothing that can be reconstructed, so an unreferenced image file is left alone
// (and pruned) rather than guessed back onto the page.
//
// Encrypted documents skip this layer entirely — they keep bitmaps inside the
// AES-GCM envelope rather than leak plaintext image files onto the drive — so
// the wrapper is composed only on the plaintext path in `useSyncEngine`.
//
// One consequence of sitting *outside* the offline cache (`withLocalCache`, which
// caches the pushed — stripped — bytes): pulling the backend copy down while
// offline can come back without its pictures, since the files themselves can't be
// fetched. Nothing is lost — this device's working copy still holds them inline —
// and the next online load fills them back in.

import {
  bytesToDataUrl,
  dataUrlToBytes,
} from "@niclaslindstedt/oss-framework/files";
import type {
  DropboxAuth,
  StorageAdapter,
} from "@niclaslindstedt/oss-framework/storage";

import { MEDIA_CONCURRENCY, mapLimit } from "./cloudRetry.ts";
import { drawingSlug } from "./export.ts";
import { folderFileStore } from "./folderFileStore.ts";
import {
  dropboxByteFileStore,
  gdriveByteFileStore,
  type ByteFileStore,
} from "./imageFileStore.ts";
import { logStore } from "./log.ts";

const log = logStore.createLogger("images");

/** The byte-level contract the externaliser needs — every stored image's path,
 *  plus read/write/remove of one bitmap's raw bytes. */
export type ImageStore = ByteFileStore;

/** The folder every externalised bitmap is filed under, at the backend's app
 *  folder / picked directory root. */
export const IMAGE_ROOT = "images";

/** Scope a byte file store to the `images/` tree, so `list` only ever reports
 *  image files (not the document itself, and not a sibling app's files). */
function scopeToImages(files: ByteFileStore): ImageStore {
  return {
    async list() {
      const paths = await files.list();
      return paths.filter((p) => p.startsWith(`${IMAGE_ROOT}/`));
    },
    read: (path) => files.read(path),
    write: (path, bytes, mime) => files.write(path, bytes, mime),
    remove: (path) => files.remove(path),
  };
}

/** The Dropbox image store, rooted at the app folder so paths read as
 *  `images/<drawing-slug>-<tag>-<n>.png`. */
export function dropboxImageStore(
  auth: DropboxAuth,
  appKey: string | undefined,
): ImageStore {
  return scopeToImages(dropboxByteFileStore(auth, appKey));
}

/** The Google Drive image store, in the app folder's `images/` tree. */
export function gdriveImageStore(
  token: string,
  appFolderName: string,
): ImageStore {
  return scopeToImages(gdriveByteFileStore(token, appFolderName));
}

/** The local-folder image store, filing real image files to `images/…` inside
 *  the picked directory. `onPermissionLost` fires when a revoked OS grant is
 *  hit. */
export function folderImageStore(
  root: FileSystemDirectoryHandle,
  onPermissionLost?: () => void,
): ImageStore {
  return scopeToImages(folderFileStore(root, onPermissionLost));
}

// --- deterministic file paths ------------------------------------------------

/** The file extension each image type is filed under, and — read the other way
 *  — the type a filed image is handed back as. Anything unrecognised is filed
 *  as `.bin`: a file that can't be previewed is still a file that round-trips. */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/** The extension a bitmap of this MIME type is filed under. */
export function extensionFor(mime: string): string {
  return EXTENSIONS[mime.toLowerCase()] ?? "bin";
}

/** The MIME type a filed image is re-inlined as, read back off its extension.
 *  A canvas re-encode produces PNG unless the import was a photo, so that is
 *  what an unrecognised extension is assumed to be. */
export function mimeForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  for (const [mime, candidate] of Object.entries(EXTENSIONS)) {
    if (candidate === ext) return mime;
  }
  return "image/png";
}

/** A short, stable, human-friendly tag for a drawing, derived from its id — the
 *  disambiguator that keeps two drawings sharing a name (hence the same slug)
 *  from colliding in the flat `images/` folder. Four base36 characters of a
 *  djb2 hash of the id: it depends only on the id, so it survives renames and
 *  reorders, and it stays short and readable in a file listing. */
export function drawingTag(drawingId: string): string {
  let h = 5381;
  for (let i = 0; i < drawingId.length; i += 1) {
    h = (h * 33) ^ drawingId.charCodeAt(i);
  }
  return (h >>> 0).toString(36).padStart(4, "0").slice(-4);
}

/** The `images/<drawing-slug>-<tag>-<n>` stem a drawing's n-th bitmap is filed
 *  under, extension aside — built from the drawing's name (the same slug the
 *  PNG export uses), a stable {@link drawingTag}, and the image's 1-based
 *  position among that drawing's image strokes. Deterministic, so re-saving
 *  overwrites rather than accumulating; unique across name collisions; and
 *  predictable enough to find the picture you're looking for by hand. */
export function imageStemFor(
  drawing: { id: string; name?: string },
  index: number,
): string {
  return `${IMAGE_ROOT}/${drawingSlug(drawing.name ?? "")}-${drawingTag(drawing.id)}-${index}`;
}

/** The full path a drawing's n-th bitmap is filed at, e.g.
 *  `images/sequence-diagram-4k2a-1.png`. */
export function imagePathFor(
  drawing: { id: string; name?: string },
  index: number,
  mime: string,
): string {
  return `${imageStemFor(drawing, index)}.${extensionFor(mime)}`;
}

// --- the document shape this layer touches (a loose view of `AppData`) --------

type ImageShapeView = {
  kind?: string;
  src?: string | null;
  srcPath?: string | null;
};
type StrokeView = { shape?: ImageShapeView };
type DrawingView = { id: string; name?: string; strokes?: StrokeView[] };
type PaintDocView = { drawings?: DrawingView[] };

/** Every image stroke in a document, paired with the drawing it belongs to and
 *  its 1-based position among that drawing's images — the one place the walk
 *  order (and therefore the file numbering) is defined. */
function imageStrokes(
  doc: PaintDocView,
): { drawing: DrawingView; shape: ImageShapeView; index: number }[] {
  const out: { drawing: DrawingView; shape: ImageShapeView; index: number }[] =
    [];
  for (const drawing of doc.drawings ?? []) {
    let index = 0;
    for (const stroke of drawing.strokes ?? []) {
      const shape = stroke.shape;
      if (!shape || shape.kind !== "image") continue;
      index += 1;
      out.push({ drawing, shape, index });
    }
  }
  return out;
}

function parseDocView(text: string): PaintDocView | null {
  try {
    const doc = JSON.parse(text) as PaintDocView;
    return Array.isArray(doc.drawings) ? doc : null;
  } catch {
    return null;
  }
}

/** A cheap 32-bit fingerprint (djb2) of a bitmap's data URL, so an unchanged
 *  image isn't re-uploaded on every debounced save — only genuinely new bytes
 *  rewrite the file. */
function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = (h * 33) ^ s.charCodeAt(i);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Whether a *stored* document still carries bitmap bytes inline — an image
 *  stroke whose `src` is a decodable data URL. Run against the raw backend copy
 *  (before rehydration), it is the "this copy predates the file layout and wants
 *  externalising" signal the one-time sweep keys off: a fully-filed copy has
 *  only paths, so it reads false. */
export function hasInlineImages(text: string): boolean {
  const doc = parseDocView(text);
  if (!doc) return false;
  return imageStrokes(doc).some(
    ({ shape }) => dataUrlToBytes(shape.src) !== null,
  );
}

/** Whether a *stored* document references an image file under an outdated path
 *  — one filed before its drawing was renamed, or before a stroke ahead of it
 *  was deleted (which shifts every later image's number). A true result is the
 *  "re-file these into the current layout" signal the sweep keys off: the next
 *  save writes each bitmap to its current path and prunes the stale file. The
 *  extension is ignored, since it follows the bytes rather than the naming. */
export function needsRefile(text: string): boolean {
  const doc = parseDocView(text);
  if (!doc) return false;
  return imageStrokes(doc).some(({ drawing, shape, index }) => {
    if (!shape.srcPath) return false;
    return !shape.srcPath.startsWith(`${imageStemFor(drawing, index)}.`);
  });
}

/** Wrap a `StorageAdapter` so dropped bitmaps are externalised to real image
 *  files on save and re-hydrated on load. Delegates every other adapter member
 *  (id, label, capabilities, probe, …) to `inner`.
 *
 *  `onImagesNeedResave` fires when a *loaded* backend copy needs filing out into
 *  the deterministic layout — because it still holds inline bytes (see
 *  {@link hasInlineImages}) or points at outdated paths (see
 *  {@link needsRefile}). The sync engine uses it to kick a one-time save, so a
 *  copy converges on the file layout without waiting for the next edit. */
export function withExternalImages(
  inner: StorageAdapter,
  images: ImageStore,
  onImagesNeedResave?: () => void,
): StorageAdapter {
  // Paths this session has already written, keyed to the source fingerprint, so
  // a debounced re-save of an untouched drawing doesn't re-upload its pictures.
  const written = new Map<string, string>();

  // Save side: write each bitmap to its file and strip it from the outgoing
  // JSON. Returns the stripped text, the set of paths the document still wants,
  // and whether that set is a *complete* account of the document — only a
  // complete one may drive the post-commit prune (see rule 2 in the module note).
  async function externalise(
    text: string,
  ): Promise<{ text: string; desired: Set<string>; complete: boolean }> {
    const desired = new Set<string>();
    const doc = parseDocView(text);
    // Nothing was understood, so nothing may be judged an orphan.
    if (!doc) return { text, desired, complete: false };
    let complete = true;
    let changed = false;

    for (const { drawing, shape, index } of imageStrokes(doc)) {
      const inline = shape.src;
      const decoded = dataUrlToBytes(inline);
      if (!decoded) {
        // Not a decodable data URL — either already filed (keep its file) or
        // something we don't understand (leave it exactly as it is).
        if (shape.srcPath) desired.add(shape.srcPath);
        continue;
      }
      const path = imagePathFor(drawing, index, decoded.mime);
      const fp = fingerprint(inline!);
      try {
        if (written.get(path) !== fp) {
          await images.write(path, decoded.bytes, decoded.mime);
          written.set(path, fp);
          log.info(`externalised ${path} (${decoded.bytes.length} B)`);
        }
        shape.srcPath = path;
        delete shape.src; // stripped on success only
        changed = true;
        desired.add(path);
      } catch (err) {
        // Externalise-or-embed: keep the bitmap inline so it still syncs. The
        // path is still *wanted* — a copy may already be filed there from an
        // earlier save — so claim it and stand the prune down, or a throttled
        // upload would delete the picture it failed to replace.
        desired.add(path);
        complete = false;
        log.warn(
          `could not externalise ${path} — keeping it inline (${errMsg(err)})`,
        );
      }
    }
    return { text: changed ? JSON.stringify(doc) : text, desired, complete };
  }

  // Remove image files no surviving stroke references. Best-effort, only after
  // the document save commits, and only when `externalise` returned a complete
  // account of the document.
  async function prune(desired: Set<string>, complete: boolean): Promise<void> {
    if (!complete) {
      log.warn(
        "skipping the orphan prune — some images could not be filed out, " +
          "so a file this save didn't account for is not an orphan",
      );
      return;
    }
    let existing: string[];
    try {
      existing = await images.list();
    } catch (err) {
      log.warn(`could not list images to prune (${errMsg(err)})`);
      return;
    }
    const orphans = existing.filter((p) => !desired.has(p));
    if (orphans.length === 0) return;
    log.info(`pruning ${orphans.length} orphaned image file(s)`);
    await mapLimit(orphans, MEDIA_CONCURRENCY, (p) =>
      images
        .remove(p)
        .then(() => {
          written.delete(p);
        })
        .catch((err: unknown) => {
          log.warn(`could not remove ${p} (${errMsg(err)})`);
        }),
    );
  }

  // Load side: fetch each filed bitmap back onto its stroke, a few at a time. A
  // read that fails leaves the stroke's path in place and its bytes absent —
  // that stroke paints nothing until the next load rather than tearing the
  // document down (see the painter in `plugins/builtin/image.ts`).
  async function rehydrate(text: string): Promise<string> {
    const doc = parseDocView(text);
    if (!doc) return text;
    // Flatten to one job per filed image so the whole load — not each drawing —
    // is what gets rate-limited.
    const jobs = imageStrokes(doc)
      .filter(({ shape }) => shape.srcPath && !shape.src)
      .map(({ shape }) => ({ shape, path: shape.srcPath! }));
    if (jobs.length === 0) return text;

    let changed = false;
    let missing = 0;
    await mapLimit(jobs, MEDIA_CONCURRENCY, async ({ shape, path }) => {
      try {
        const bytes = await images.read(path);
        if (bytes) {
          const url = bytesToDataUrl(mimeForPath(path), bytes);
          shape.src = url;
          written.set(path, fingerprint(url));
          changed = true;
        } else {
          // The file is genuinely gone from the backend — not a read failure,
          // so the reference is simply stale.
          log.warn(`no file at ${path} — the reference is stale`);
        }
      } catch (err) {
        missing += 1;
        log.warn(`could not read ${path} (${errMsg(err)})`);
      }
    });
    if (missing > 0) {
      log.warn(
        `${missing} of ${jobs.length} image file(s) could not be read — ` +
          "the loaded copy is incomplete",
      );
    }
    return changed ? JSON.stringify(doc) : text;
  }

  return {
    ...inner,
    async load() {
      const snap = await inner.load();
      if (!snap) return snap;
      // Both checks read the raw stored text, before rehydration re-inlines the
      // filed bitmaps — so only a copy that genuinely needs a sweep trips them.
      const sweep = hasInlineImages(snap.text) || needsRefile(snap.text);
      const text = await rehydrate(snap.text);
      if (sweep) onImagesNeedResave?.();
      return { ...snap, text };
    },
    async save(text, baseRevision) {
      const { text: stripped, desired, complete } = await externalise(text);
      const snap = await inner.save(stripped, baseRevision);
      await prune(desired, complete);
      return snap;
    },
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
