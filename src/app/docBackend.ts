// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The document storage seam, and the two constructors that answer "what does a
// document look like when there isn't one yet".
//
// Split out of `usePaintStore` because they are different concerns on different
// clocks: this file is about *bytes* — reading them, writing them, and deciding
// what a failed read means — while the store is about edits and undo. The store
// holds a `DocBackend` and never learns what is behind it.
//
// The read side is split in two because the store is synchronous and the
// storage (IndexedDB, see `docDb.ts`) is not. `peek` answers from what is
// already in hand; `hydrate` fetches what isn't.

import {
  hydrateDoc,
  peekDoc,
  putDoc,
  putDocDurable,
  quarantineDoc,
  readDocFresh,
} from "./docDb.ts";
import { currentScreenCanvasSize } from "./canvasSize.ts";
import { parseDoc, serializeDoc } from "./migrations.ts";
import type { AppData, Drawing } from "./types.ts";
import * as output from "../output.ts";

export { docKey } from "./docDb.ts";

/** Mint a unique id for a drawing or a stroke. A random suffix makes the id
 *  unique across sessions (and namespaces), so it can never collide with one
 *  already on disk; the prefix keeps ids legible while debugging. */
export function freshId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** A blank page. Sized and oriented like the screen it is made on — the same
 *  "This screen" default the new-image dialog opens with (`canvasSize.ts`), so
 *  the page a first run lands on is shaped like the device in hand rather than
 *  like some other machine's sheet. Falls back to the default sheet where
 *  there is no window to ask. It pins no background, so it follows the canvas
 *  theme until someone chooses a colour for it (see `canvas.ts`). */
export function blankDrawing(
  name: string,
  folderId: string | null = null,
): Drawing {
  const size = currentScreenCanvasSize();
  return {
    id: freshId("drawing"),
    name,
    width: size.width,
    height: size.height,
    strokes: [],
    ...(folderId ? { folderId } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** The document a first-run app opens on: one empty page, ready to draw. */
export function starterDoc(): AppData {
  const first = blankDrawing("");
  return { folders: [], drawings: [first], activeDrawingId: first.id };
}

/** The document storage seam. The store never reaches a database directly — it
 *  reads and writes a namespace's document through a `DocBackend`, so a
 *  different backend can take over storage without the store changing.
 *
 *  A `peek` that returns null means "not read yet" — never "empty" — so a
 *  starter document can never be mistaken for a real one. */
export type DocBackend = {
  readonly id: "local" | "memory";
  /** The namespace's document if it is already in hand, else null. */
  peek(slug: string): AppData | null;
  /** Fetch the namespace's document, resolving to a starter when it is empty. */
  hydrate(slug: string): Promise<AppData>;
  /** Persist a namespace's document. A best-effort sink — it must not throw. */
  save(slug: string, doc: AppData): void;
  /** Persist a namespace this store does *not* hold and confirm it landed, by
   *  reading the storage back. The hand-off's evidence that the other sketchbook
   *  really took the drawing before this one lets go of it. */
  deliver(slug: string, doc: AppData): Promise<AppData | null>;
  /** Re-read the namespace from storage, ignoring anything cached — the "pick
   *  up another tab's edits" path. */
  refetch(slug: string): Promise<AppData>;
};

/** Turn stored bytes into a document, non-destructively.
 *
 *  A document that exists but this build can't read — most often one a NEWER
 *  build already upgraded, then read by a stale (service-worker-cached) build
 *  after an app update — is left in storage untouched rather than silently
 *  replaced with a blank starter, so it comes back on its own once the update
 *  finishes. The starter returned here must NOT be persisted over it; that is
 *  what the store's persist guard is for. */
function readDoc(slug: string, raw: string | null): AppData {
  if (!raw) return starterDoc();
  try {
    return parseDoc(raw);
  } catch (err) {
    output.error(
      `Couldn't read the drawings saved on this device — ${
        err instanceof Error ? err.message : String(err)
      }. The stored copy is left untouched and should reappear once the app finishes updating.`,
    );
    quarantineDoc(slug, raw);
    return starterDoc();
  }
}

/** The real backend: one JSON document per namespace in IndexedDB, run through
 *  the migration pipeline on the way in and out. See `docDb.ts` for why the
 *  database is behind a synchronous cache. */
export const localDocBackend: DocBackend = {
  id: "local",
  peek(slug) {
    const raw = peekDoc(slug);
    return raw === undefined ? null : readDoc(slug, raw);
  },
  async hydrate(slug) {
    return readDoc(slug, await hydrateDoc(slug));
  },
  save(slug, doc) {
    putDoc(slug, serializeDoc(doc), output.error);
  },
  async deliver(slug, doc) {
    if (!(await putDocDurable(slug, serializeDoc(doc)))) return null;
    // Read the database back rather than trusting the write: what the caller
    // needs to know is whether the bytes are *there*, and only a round-trip
    // answers that.
    const written = await readDocFresh(slug);
    if (written === null) return null;
    try {
      return parseDoc(written);
    } catch {
      return null;
    }
  },
  async refetch(slug) {
    return readDoc(slug, await readDocFresh(slug));
  },
};
