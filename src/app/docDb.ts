// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where a namespace's document actually lives on this device.
//
// It used to be `localStorage`, and for a while that was the right answer: the
// document is a list of vector strokes, a page of them is a few kilobytes, and
// a synchronous `getItem` is the simplest possible boot. Then drawings grew
// pictures. A dropped photo is inlined as a `data:` URL (see `images.ts`), a
// base64 payload is a third bigger than the bytes it carries, and the whole
// origin gets about **5 MB** of localStorage — for every namespace, every
// quarantined copy, and every cloud cache put together. Two photos and a
// sketchbook is over.
//
// So the working copy lives in IndexedDB, whose quota is a share of free disk
// (hundreds of megabytes to gigabytes) rather than a fixed 5 MB, and which
// stores a string as a string instead of as UTF-16 counted against a cap. It is
// also the one large-storage API that Safari and Firefox both implement, so the
// headroom is not Chromium-only — unlike the picked folder, which is.
//
// **The seam above this stayed synchronous.** `usePaintStore` reads and writes a
// document during render, and undo is a `pop()` — making all of that async to
// reach a database would be a rewrite of the store for no user-visible gain. So
// this module is a *synchronous in-memory cache with an IndexedDB tail*:
//
//   - {@link peekDoc} answers from the cache, immediately, or `undefined` when
//     that slug has never been read.
//   - {@link hydrateDoc} fills the cache from the database. `main.tsx` awaits it
//     for the namespace the app opens on, so first paint has the real document
//     and never flashes a starter.
//   - {@link putDoc} updates the cache synchronously and schedules the database
//     write, coalescing a burst of strokes into one.
//
// Every operation is best-effort in the same way the framework's directory-
// handle store is: a browser with IndexedDB blocked (Firefox private windows,
// locked-down enterprise settings) resolves to the empty result rather than
// throwing, and the app runs from the in-memory cache for that session.

import { DEFAULT_NAMESPACE_SLUG } from "@niclaslindstedt/oss-framework/namespaces";

import { logStore } from "./log.ts";

const log = logStore.createLogger("docdb");

const DB_NAME = "paint:documents";
const DB_VERSION = 1;
const STORE = "documents";

const DOC_KEY_PREFIX = "paint:doc";

/** The record key a namespace's document is stored under — and, because it
 *  reads as a location, the string Settings → Storage shows for the on-device
 *  backend. The default namespace keeps the un-suffixed key; every other
 *  namespace gets a per-slug suffix.
 *
 *  It is deliberately the *same* string the localStorage era used, so the
 *  migration below is a move rather than a re-key, and a support answer written
 *  against the old build still names the right thing. */
export function docKey(slug: string): string {
  return slug === DEFAULT_NAMESPACE_SLUG
    ? DOC_KEY_PREFIX
    : `${DOC_KEY_PREFIX}:${slug}`;
}

/** Where a document this build can't read is set aside. Quarantine stays in
 *  IndexedDB beside the live record — it is the same size problem. */
export function quarantineKey(slug: string): string {
  return `${docKey(slug)}:unreadable`;
}

/** The localStorage key holding the slug of the sketchbook the app opens on.
 *
 *  `useNamespaces` is what writes it; this module only reads it, at boot, to
 *  know which document to pull in before the first render. The constant lives
 *  down here rather than up there because the dependency already runs this way
 *  (the registry imports `deleteDoc`), and one shared name beats two that can
 *  drift apart. */
export const ACTIVE_NAMESPACE_KEY = "paint:namespace:active";

// --- the synchronous cache ---------------------------------------------------

// Serialized document text by record key. A key present here has been read (or
// written) this session; a key absent has not.
const cache = new Map<string, string>();
// Record keys known to hold nothing — hydrated, but empty. Kept apart from
// `cache` so "this namespace is blank" and "this namespace hasn't been read"
// stay distinguishable, which is what stops a starter document being persisted
// over a real one that simply hadn't loaded yet.
const empty = new Set<string>();

/** The cached text for a namespace: the document, `null` when the namespace is
 *  known to be empty, or `undefined` when it has never been read. The store
 *  treats `undefined` as "hydrating" rather than as "blank". */
export function peekDoc(slug: string): string | null | undefined {
  const key = docKey(slug);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  return empty.has(key) ? null : undefined;
}

function remember(key: string, text: string | null): void {
  if (text === null) {
    cache.delete(key);
    empty.add(key);
  } else {
    cache.set(key, text);
    empty.delete(key);
  }
}

/** Drop everything this module has cached. Tests only — the app has one cache
 *  for its lifetime. */
export function resetDocCache(): void {
  cache.clear();
  empty.clear();
}

// --- IndexedDB ---------------------------------------------------------------

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  // Memoised: every read and write goes through one connection, and a browser
  // that refused once will refuse again — there is nothing to retry.
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function readRecord(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve) => {
    let req: IDBRequest<unknown>;
    try {
      req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    } catch {
      resolve(null);
      return;
    }
    req.onsuccess = () =>
      resolve(typeof req.result === "string" ? req.result : null);
    req.onerror = () => resolve(null);
  });
}

// Resolves false when the write didn't land — a full disk, a blocked database,
// a quota refusal. The caller reports it; the cache keeps the value either way,
// so the session continues on the in-memory copy.
function writeRecord(
  db: IDBDatabase,
  key: string,
  text: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let req: IDBRequest<IDBValidKey>;
    try {
      req = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put(text, key);
    } catch {
      resolve(false);
      return;
    }
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  });
}

function deleteRecord(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    let req: IDBRequest<undefined>;
    try {
      req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
    } catch {
      resolve();
      return;
    }
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

// --- the localStorage migration ----------------------------------------------

function legacyRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function legacyDrop(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to free, or no storage to free it in — either way the IndexedDB
    // copy written above is now the live one.
  }
}

/**
 * Move a namespace's document out of localStorage, once. Returns the adopted
 * text, or null when there was nothing to move.
 *
 * The old key is removed **only after** the IndexedDB write is confirmed, so a
 * migration interrupted by a crash or a refused write leaves the document
 * exactly where the previous build will still find it. Freeing the old key is
 * the point rather than tidiness: those 5 MB are shared with the cloud caches
 * and the namespace registry, and a sketchbook sitting in them is what runs the
 * origin out of room.
 */
async function migrateFromLocalStorage(
  db: IDBDatabase,
  key: string,
): Promise<string | null> {
  const legacy = legacyRead(key);
  if (legacy === null) return null;
  const stored = await writeRecord(db, key, legacy);
  if (!stored) {
    // Couldn't take a copy — leave the original alone and run this session off
    // it. The next boot tries again.
    log.warn(`migrate: couldn't copy ${key} into IndexedDB — left in place`);
    return legacy;
  }
  legacyDrop(key);
  // The quarantined copy, if any, travels with it.
  const quarantine = `${key}:unreadable`;
  const heldBack = legacyRead(quarantine);
  if (heldBack !== null && (await writeRecord(db, quarantine, heldBack))) {
    legacyDrop(quarantine);
  }
  log.info(`migrate: moved ${key} from localStorage into IndexedDB`);
  return legacy;
}

// --- the public reads and writes ---------------------------------------------

/**
 * Fill the cache for a namespace from the database, migrating a localStorage
 * document on the way if this is the first boot after the upgrade. Resolves to
 * the document text, or null when the namespace is empty.
 *
 * Repeated calls for an already-cached slug resolve from the cache without
 * touching the database.
 */
export async function hydrateDoc(slug: string): Promise<string | null> {
  const key = docKey(slug);
  const cached = peekDoc(slug);
  if (cached !== undefined) return cached;
  const db = await openDb();
  if (!db) {
    // No database on this browser. Fall back to whatever localStorage still
    // holds, so a Firefox private window degrades to the old behaviour rather
    // than to a blank page.
    const legacy = legacyRead(key);
    remember(key, legacy);
    return legacy;
  }
  let text = await readRecord(db, key);
  if (text === null) text = await migrateFromLocalStorage(db, key);
  remember(key, text);
  return text;
}

/**
 * Pull the namespace the app opens on into the cache, before the first render.
 * Called once from `main.tsx`; resolves either way, so a browser that refuses
 * IndexedDB still gets an app (running from the in-memory cache, and from
 * whatever localStorage a not-yet-migrated install still holds).
 */
export async function hydrateActiveDoc(): Promise<void> {
  let slug = DEFAULT_NAMESPACE_SLUG;
  try {
    slug = localStorage.getItem(ACTIVE_NAMESPACE_KEY) || DEFAULT_NAMESPACE_SLUG;
  } catch {
    // No localStorage to read the pointer from — open the default sketchbook.
  }
  try {
    await hydrateDoc(slug);
  } catch (err) {
    log.warn(
      `boot: couldn't read the stored drawings — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// Per-key write coalescing. `pending` is the newest text waiting to go out;
// `inFlight` is the chain that will write it. A burst of edits replaces the
// pending value rather than queueing a write each, so an afternoon of strokes
// costs one database write per settle, not one per stroke.
const pending = new Map<string, string>();
const inFlight = new Map<string, Promise<void>>();

function schedule(key: string, onError: (message: string) => void): void {
  if (inFlight.has(key)) return;
  const run = (async () => {
    const db = await openDb();
    // Drain: a write that arrived while the last one was in flight goes out on
    // this same chain rather than starting another.
    for (;;) {
      const text = pending.get(key);
      if (text === undefined) break;
      pending.delete(key);
      if (!db) {
        onError(
          "Couldn't save the drawing to this device's storage. Your work stays in memory and in any connected cloud copy.",
        );
        continue;
      }
      if (!(await writeRecord(db, key, text))) {
        onError(
          "Couldn't save the drawing to this device's storage (it may be full). Your work stays in memory and in any connected cloud copy.",
        );
      }
    }
    inFlight.delete(key);
    // A write that landed between the loop ending and the map being cleared
    // would otherwise sit there until the next edit.
    if (pending.has(key)) schedule(key, onError);
  })();
  inFlight.set(key, run);
}

/**
 * Persist a namespace's document. The cache is updated synchronously — so the
 * very next `peekDoc` sees it, database or not — and the durable write is
 * scheduled. `onError` reports a write that didn't land; it is called at most
 * once per failed write, not once per stroke.
 */
export function putDoc(
  slug: string,
  text: string,
  onError: (message: string) => void,
): void {
  const key = docKey(slug);
  remember(key, text);
  pending.set(key, text);
  schedule(key, onError);
}

/**
 * Write a namespace's document and wait for the database to confirm it,
 * resolving to whether it landed. The hand-off path uses this instead of
 * {@link putDoc}: it is about to remove a drawing from *this* namespace on the
 * strength of the other one having taken it, and a fire-and-forget write is no
 * evidence at all. Updates the cache like any other write.
 */
export async function putDocDurable(
  slug: string,
  text: string,
): Promise<boolean> {
  const key = docKey(slug);
  remember(key, text);
  const db = await openDb();
  if (!db) return false;
  return writeRecord(db, key, text);
}

/**
 * Read a namespace's document straight from the database, bypassing the cache,
 * and refresh the cache with what comes back.
 *
 * The bypass is the point in both places this is used. The hand-off verifies a
 * write it just made, and a cache that was updated by that very write would
 * agree with itself no matter what the database did. "Reload from this device"
 * is answering a question about another tab's edits, which by definition are
 * not in this tab's cache.
 */
export async function readDocFresh(slug: string): Promise<string | null> {
  const key = docKey(slug);
  const db = await openDb();
  if (!db) {
    const legacy = legacyRead(key);
    remember(key, legacy);
    return legacy;
  }
  const text = await readRecord(db, key);
  remember(key, text);
  return text;
}

/** Set aside a document this build couldn't read, so it stays recoverable. */
export function quarantineDoc(slug: string, text: string): void {
  const key = quarantineKey(slug);
  pending.set(key, text);
  schedule(key, () => {
    // Best-effort by definition: the live record is untouched either way, which
    // is the guarantee that actually matters here.
  });
}

/** Delete a namespace's document — the namespace-removal path. Clears the
 *  cache, the pending write, and both the IndexedDB record and any localStorage
 *  key an interrupted migration left behind. */
export async function deleteDoc(slug: string): Promise<void> {
  const key = docKey(slug);
  pending.delete(key);
  cache.delete(key);
  empty.add(key);
  legacyDrop(key);
  legacyDrop(quarantineKey(slug));
  const db = await openDb();
  if (!db) return;
  await deleteRecord(db, key);
  await deleteRecord(db, quarantineKey(slug));
}

/** Wait for every scheduled write to reach the database. Used by the tests, and
 *  by nothing in the app — the app's writes are fire-and-forget on purpose. */
export async function flushDocWrites(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight.values()]);
}
