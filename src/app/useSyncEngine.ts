// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AuthError,
  ConflictError,
  RateLimitError,
  backoffDelayMs,
  clearDirectoryHandle,
  completeDropboxAuth,
  createDropboxAdapter,
  createFolderAdapter,
  createGdriveAdapter,
  ensurePermission,
  hasPendingDropboxAuth,
  isFolderBackendAvailable,
  isRetryableSaveError,
  loadDirectoryHandle,
  localCacheKey,
  saveDirectoryHandle,
  startDropboxAuth,
  startGdriveAuth,
  withLocalCache,
  type StorageAdapter,
} from "@niclaslindstedt/oss-framework/storage";
import { withEncryption } from "@niclaslindstedt/oss-framework/encryption";
import type {
  BackendKind,
  ConnectionProbeResult,
  SaveStatus,
  SyncLocation,
} from "@niclaslindstedt/oss-framework/sync";

import {
  evaluateCloudSetup,
  needsSetupPrompt,
  shouldAutoSave,
  summarizeDoc,
  type CloudDocSummary,
} from "./cloudSetup.ts";
import { logStore } from "./log.ts";
import { serializeDoc } from "./migrations.ts";
import { docKey, type PaintStore } from "./usePaintStore.ts";

// The app's sync engine — the state machine the framework's `SyncStatus` glyph
// and `SyncDetailsModal` command centre paint over. The local document
// (localStorage, written by `usePaintStore`) is always the working copy; when a
// remote backend is connected the engine pushes the serialized document there
// (debounced on the store's edit counter) and can pull the backend's copy back
// down. Dropbox and Google Drive ride the framework's storage adapters; the
// optional at-rest encryption wraps the byte boundary with `withEncryption`, so
// what lands in the cloud is an AES-GCM envelope.
//
// The paint document is a JSON list of vector strokes — no binary side-cars —
// so unlike the sibling apps there is nothing to externalise: one file per
// namespace is the whole sync surface.

const syncLog = logStore.createLogger("sync");

export type SyncBackendId = "local" | "folder" | "dropbox" | "gdrive";

/** True in browsers that expose the File System Access API directory picker
 *  (Chromium-based). The local-folder backend is hidden where this is false. */
export const FOLDER_BACKEND_AVAILABLE = isFolderBackendAvailable();

const BACKEND_KEY = "paint:sync:backend";
const DROPBOX_TOKENS_KEY = "paint:sync:dropbox";
const GDRIVE_TOKEN_KEY = "paint:sync:gdrive";
const ENCRYPTED_KEY = "paint:sync:encrypted";

// Long enough that a burst of quick strokes settles into one push, short enough
// that stepping away from the canvas leaves the cloud copy current.
const SAVE_DEBOUNCE_MS = 1500;

// OAuth app identities, injected at build time. Without them the matching
// backend is hidden in Settings → Storage rather than offered as a dead option.
export const DROPBOX_APP_KEY: string =
  (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) ?? "";
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

// Dropbox fixes the app-folder name from the app's own configuration (an "App
// folder"-scoped app lives under `Apps/<name>/`), so it isn't always "Paint".
// Inject the real name at build time so the "Open in Dropbox" link and the
// displayed file location point at the folder that actually exists.
export const DROPBOX_APP_FOLDER: string =
  (import.meta.env.VITE_DROPBOX_APP_FOLDER as string | undefined)?.trim() ||
  "Paint";

// Google Drive's folder, unlike Dropbox's, is created by us — this is the
// folder we make in the user's My Drive.
export const GDRIVE_APP_FOLDER: string =
  (import.meta.env.VITE_GDRIVE_APP_FOLDER as string | undefined)?.trim() ||
  "Paint";

/** The mutable in-memory box the session passphrase lives in. Structurally
 *  satisfies the framework's read-only `PasswordRef`, while the app's unlock
 *  and setup flows can write to it. */
export type MutablePasswordRef = { current: string | null };

export const PROVIDER_NAMES: Record<Exclude<SyncBackendId, "local">, string> = {
  folder: "Local folder",
  dropbox: "Dropbox",
  gdrive: "Google Drive",
};

type DropboxTokens = { accessToken: string; refreshToken: string | null };

/** The connect-time replace-or-adopt prompt's inputs: which provider was just
 *  connected, and a précis of what each side holds so the user can tell them
 *  apart. The raw remote bytes ride along so "use the cloud copy" can adopt
 *  them without a second round-trip. */
export type PendingCloudSetup = {
  provider: string;
  remoteText: string;
  cloud: CloudDocSummary;
  local: CloudDocSummary;
};

function readBackend(): SyncBackendId {
  const raw = localStorage.getItem(BACKEND_KEY);
  return raw === "dropbox" || raw === "gdrive" || raw === "folder"
    ? raw
    : "local";
}

function readDropboxTokens(): DropboxTokens | null {
  try {
    const raw = localStorage.getItem(DROPBOX_TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DropboxTokens;
    return typeof parsed.accessToken === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeDropboxTokens(tokens: DropboxTokens | null): void {
  if (tokens) {
    localStorage.setItem(DROPBOX_TOKENS_KEY, JSON.stringify(tokens));
  } else {
    localStorage.removeItem(DROPBOX_TOKENS_KEY);
  }
}

/** The document's file name on a remote backend, one per namespace. */
export function cloudFileName(slug: string): string {
  return `paint-${slug}.json`;
}

/** The document's human-readable location on the active backend — shown under
 *  "File location" in the command centre. */
function backendPath(backend: SyncBackendId, slug: string): string {
  const file = cloudFileName(slug);
  if (backend === "dropbox") return `Apps/${DROPBOX_APP_FOLDER}/${file}`;
  if (backend === "gdrive") return `${GDRIVE_APP_FOLDER}/${file}`;
  return file;
}

/** A web URL that opens the active backend's storage in a browser tab, or null
 *  when there's nothing to open (the on-device copy, a local folder). */
function backendWebUrl(backend: SyncBackendId, slug: string): string | null {
  if (backend === "dropbox") {
    return `https://www.dropbox.com/home/Apps/${encodeURIComponent(
      DROPBOX_APP_FOLDER,
    )}`;
  }
  if (backend === "gdrive") {
    // A filename search opens Drive straight onto the document without our
    // having to resolve the folder id.
    return `https://drive.google.com/drive/search?q=${encodeURIComponent(
      cloudFileName(slug),
    )}`;
  }
  return null;
}

export type SyncEngine = {
  backend: SyncBackendId;
  /** Whether the active backend has credentials. Always true for local. */
  connected: boolean;
  encrypted: boolean;
  setEncrypted: (v: boolean) => void;
  /** True when the cloud copy is an envelope and no passphrase is in memory. */
  locked: boolean;
  /** Set when a just-connected backend already holds drawings that differ from
   *  this device's — the app raises the replace-or-adopt prompt. Auto-save is
   *  held while it stands. */
  pendingSetup: PendingCloudSetup | null;
  /** Resolve the connect-time prompt: `"cloud"` adopts the existing remote
   *  copy, `"replace"` keeps this device's copy and overwrites the remote. */
  resolveSetup: (choice: "cloud" | "replace") => void;
  /** Try a passphrase against the encrypted cloud copy. Throws (and drops the
   *  passphrase again) when it doesn't decrypt — the unlock gate surfaces it. */
  unlock: (password: string) => Promise<void>;
  connectDropbox: () => Promise<void>;
  connectGdrive: () => Promise<void>;
  /** Pick a local folder (File System Access API) and switch to it. */
  connectFolder: () => Promise<void>;
  /** Re-confirm a revoked OS grant on the already-picked folder. */
  reconnectFolder: () => Promise<void>;
  folderReconnectNeeded: boolean;
  folderHandleLoaded: boolean;
  disconnect: () => void;
  // The inputs the framework `SyncStatus` / `SyncDetailsModal` render over.
  status: SaveStatus;
  dirty: boolean;
  offline: boolean;
  providerName: string;
  backendKind: BackendKind;
  location: SyncLocation;
  saveNow: () => void;
  reload: () => void;
  reconnect: (() => Promise<void>) | null;
  checkConnection: () => Promise<ConnectionProbeResult>;
};

export function useSyncEngine(
  store: PaintStore,
  slug: string,
  passwordRef: MutablePasswordRef,
): SyncEngine {
  const [backend, setBackendState] = useState<SyncBackendId>(readBackend);
  const [dropboxTokens, setDropboxTokens] = useState<DropboxTokens | null>(
    readDropboxTokens,
  );
  const [gdriveToken, setGdriveToken] = useState<string | null>(() =>
    sessionStorage.getItem(GDRIVE_TOKEN_KEY),
  );
  // The picked local folder (File System Access API). `null` until the boot
  // probe rehydrates the stored grant, the user picks one, or a revoked grant
  // drops it. The handle itself is persisted in IndexedDB by the framework.
  const [folderHandle, setFolderHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  // Gates the folder branch until the boot probe has run, so we don't briefly
  // show "not connected" for a folder whose grant is about to rehydrate.
  const [folderHandleLoaded, setFolderHandleLoaded] = useState<boolean>(
    () => readBackend() !== "folder",
  );
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);
  const [encrypted, setEncryptedState] = useState<boolean>(
    () => localStorage.getItem(ENCRYPTED_KEY) === "1",
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "saved",
  );
  const [fault, setFault] = useState<
    "none" | "offline" | "auth-error" | "conflict" | "throttled" | "error"
  >("none");
  const [locked, setLocked] = useState(false);
  const [pendingSetup, setPendingSetup] = useState<PendingCloudSetup | null>(
    null,
  );
  // Mirror of `pendingSetup` readable synchronously from `doSave` — so
  // resolving to "replace" can clear the hold and push in the same tick without
  // waiting for the state-driven re-render.
  const pendingSetupRef = useRef<PendingCloudSetup | null>(null);
  pendingSetupRef.current = pendingSetup;
  // Marks the next adapter adoption as a fresh user-initiated connect (rather
  // than a reboot / namespace switch / unlock), so only *that* baseline read
  // raises the setup prompt.
  const justConnected = useRef(false);
  // The edit counter that has been pushed to the backend. Anything newer is
  // unsaved — that's `dirty`.
  const [savedVersion, setSavedVersion] = useState(store.version);
  // False until the mount baseline read has learned the backend's current
  // revision. Auto-save is held until it flips true so the first push after
  // opening never carries an unknown base revision — which the adapter would
  // reject as a conflict once a document exists.
  const [baselineReady, setBaselineReady] = useState(false);

  // Keep the live edit counter and document reachable from inside async saves
  // without making the debounce depend on them.
  const versionRef = useRef(store.version);
  versionRef.current = store.version;
  const dataRef = useRef(store.data);
  dataRef.current = store.data;
  // The backend revision the last load/save observed — handed back on the next
  // save so the adapter can detect another device's write (ConflictError).
  const baseRevision = useRef<string | undefined>(undefined);

  // A "remote" backend is anything that pushes the document through a
  // `StorageAdapter` (folder or cloud). "Cloud" is the OAuth subset.
  const isRemote = backend !== "local";
  const isCloud = backend === "dropbox" || backend === "gdrive";
  const isFolder = backend === "folder";
  const connected =
    backend === "local" ||
    (backend === "dropbox" && dropboxTokens !== null) ||
    (backend === "gdrive" && gdriveToken !== null) ||
    (backend === "folder" && folderHandle !== null);

  // Drop the live folder handle and surface the reconnect cue — called by the
  // folder adapter when an in-flight op hits a revoked OS grant. The IndexedDB
  // record is kept so Settings can re-grant in one click.
  const markFolderPermissionLost = useCallback(() => {
    syncLog.warn("folder: permission lost — reconnect required");
    setFolderHandle(null);
    setFolderReconnectNeeded(true);
    setFault("auth-error");
  }, []);

  // The storage adapter for the active backend, wrapped so a cloud copy is
  // readable offline (`withLocalCache`) and — when the user opted in —
  // encrypted at the byte boundary (`withEncryption`).
  const adapter: StorageAdapter | null = useMemo(() => {
    if (backend === "dropbox" && dropboxTokens) {
      const dropboxAuth = {
        accessToken: dropboxTokens.accessToken,
        refreshToken: dropboxTokens.refreshToken,
        onAccessTokenRefreshed: (accessToken: string) => {
          const next = { ...dropboxTokens, accessToken };
          writeDropboxTokens(next);
          setDropboxTokens(next);
        },
      };
      const cloud = createDropboxAdapter(dropboxAuth, {
        appKey: DROPBOX_APP_KEY || undefined,
        fileName: cloudFileName(slug),
        logger: logStore.createLogger("dropbox"),
      });
      const cached = withLocalCache(cloud, {
        storage: localStorage,
        key: localCacheKey("dropbox", slug),
      });
      return encrypted
        ? withEncryption(cached, passwordRef, {
            logger: logStore.createLogger("encrypt"),
          })
        : cached;
    }
    if (backend === "gdrive" && gdriveToken) {
      const cloud = createGdriveAdapter(gdriveToken, {
        appFolderName: GDRIVE_APP_FOLDER,
        fileName: cloudFileName(slug),
        logger: logStore.createLogger("gdrive"),
      });
      const cached = withLocalCache(cloud, {
        storage: localStorage,
        key: localCacheKey("gdrive", slug),
      });
      return encrypted
        ? withEncryption(cached, passwordRef, {
            logger: logStore.createLogger("encrypt"),
          })
        : cached;
    }
    if (backend === "folder" && folderHandle) {
      // Unlike the cloud adapters there's no `withLocalCache` — the folder is
      // already local and never raises network errors.
      const folder = createFolderAdapter(folderHandle, {
        fileName: cloudFileName(slug),
        onPermissionLost: markFolderPermissionLost,
        logger: logStore.createLogger("folder"),
      });
      return encrypted
        ? withEncryption(folder, passwordRef, {
            logger: logStore.createLogger("encrypt"),
          })
        : folder;
    }
    return null;
  }, [
    backend,
    dropboxTokens,
    gdriveToken,
    folderHandle,
    encrypted,
    slug,
    passwordRef,
    markFolderPermissionLost,
  ]);

  // Complete a Dropbox OAuth redirect: trade the `?code=` for tokens, persist
  // them, and adopt the backend. Runs once on boot when a flow is mid-flight.
  useEffect(() => {
    if (!DROPBOX_APP_KEY || !hasPendingDropboxAuth()) return;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    void (async () => {
      try {
        const result = await completeDropboxAuth(DROPBOX_APP_KEY, code);
        const tokens: DropboxTokens = {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken ?? null,
        };
        writeDropboxTokens(tokens);
        justConnected.current = true;
        setDropboxTokens(tokens);
        localStorage.setItem(BACKEND_KEY, "dropbox");
        setBackendState("dropbox");
        syncLog.info("dropbox: connected");
      } catch (err) {
        syncLog.error(
          `dropbox: connect failed — ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        // Drop the ?code= from the address bar either way.
        const url = new URL(window.location.href);
        url.search = "";
        window.history.replaceState(null, "", url.toString());
      }
    })();
  }, []);

  // Folder boot probe: when the saved backend is the local folder, rehydrate
  // the stored directory handle from IndexedDB and ask the OS whether the grant
  // still stands.
  useEffect(() => {
    if (readBackend() !== "folder") return;
    let cancelled = false;
    setFolderHandleLoaded(false);
    void (async () => {
      const stored = await loadDirectoryHandle();
      if (cancelled) return;
      if (!stored) {
        setFolderReconnectNeeded(true);
        setFolderHandleLoaded(true);
        return;
      }
      const status = await ensurePermission(stored, false);
      if (cancelled) return;
      if (status === "granted") setFolderHandle(stored);
      else setFolderReconnectNeeded(true);
      setFolderHandleLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // On adopting an adapter (connect, namespace switch, unlock), read the
  // backend copy once to learn its revision — so the first push can detect a
  // conflict instead of clobbering another device's write. A remote copy that
  // exists is NOT auto-adopted (unless this device is blank); the local
  // document stays the working copy and "Reload from the backend" pulls it.
  useEffect(() => {
    if (!adapter) return;
    let cancelled = false;
    setBaselineReady(false);
    // Consume the fresh-connect marker: only a baseline read triggered by the
    // user just connecting gets to raise the replace-or-adopt prompt.
    const fresh = justConnected.current;
    justConnected.current = false;
    void (async () => {
      try {
        const snap = await adapter.load();
        if (cancelled) return;
        baseRevision.current = snap?.revision;
        setLocked(false);
        const remote =
          fresh && snap ? evaluateCloudSetup(snap.text, dataRef.current) : null;
        if (remote && !needsSetupPrompt(dataRef.current)) {
          // Nothing on this device to lose — adopt the remote copy outright
          // rather than asking a question with only one sensible answer.
          store.adoptRemote(snap!.text);
          setSavedVersion(versionRef.current + 1);
          syncLog.info("setup: adopted the backend copy onto a blank device");
        } else if (remote) {
          setPendingSetup({
            provider:
              PROVIDER_NAMES[backend as Exclude<SyncBackendId, "local">],
            remoteText: snap!.text,
            cloud: summarizeDoc(remote),
            local: summarizeDoc(dataRef.current),
          });
          syncLog.info(
            `setup: backend holds ${remote.drawings.length} drawing(s) — asking replace-or-adopt`,
          );
        }
        syncLog.info(
          snap
            ? `baseline: backend holds ${snap.text.length} B (rev ${snap.revision ?? "n/a"})`
            : "baseline: backend holds no document yet",
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthError) setFault("auth-error");
        else if (encrypted && passwordRef.current === null) setLocked(true);
        else {
          syncLog.warn(
            `baseline: load failed — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } finally {
        // The baseline is settled either way — release the auto-save hold.
        if (!cancelled) setBaselineReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  const dirty = isRemote && connected && store.version !== savedVersion;
  const blocked =
    fault === "offline" || fault === "auth-error" || fault === "conflict";

  // The save path: serialize the live document and push it through the adapter,
  // riding the framework's retry policy for transient failures. The typed
  // errors map onto the command centre's recovery affordances.
  const saving = useRef(false);
  const doSave = useCallback(async () => {
    // A connect-time replace-or-adopt choice is pending — hold the write until
    // the user decides, so a mark can't overwrite the remote copy first.
    if (pendingSetupRef.current) return;
    if (!adapter || saving.current) return;
    if (encrypted && passwordRef.current === null) {
      setLocked(true);
      return;
    }
    saving.current = true;
    setSaveState("saving");
    const version = versionRef.current;
    const text = serializeDoc(dataRef.current);
    try {
      for (let attempt = 0; ;) {
        try {
          const saved = await adapter.save(text, baseRevision.current);
          baseRevision.current = saved.revision;
          setSavedVersion(version);
          setSaveState("saved");
          setFault("none");
          syncLog.info(`save: ok (${text.length} B)`);
          return;
        } catch (err) {
          if (err instanceof ConflictError) {
            // The backend moved under us — surface it; "Reload from the
            // backend" adopts the newer copy.
            baseRevision.current = err.remote.revision;
            setFault("conflict");
            setSaveState("idle");
            syncLog.warn("save: conflict — a newer copy exists on the backend");
            return;
          }
          if (err instanceof AuthError) {
            setFault("auth-error");
            setSaveState("idle");
            syncLog.warn("save: session expired — reconnect required");
            return;
          }
          if (err instanceof RateLimitError) {
            setFault("throttled");
            const delay = err.retryAfterMs ?? backoffDelayMs(attempt);
            syncLog.warn(`save: rate limited — retrying in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
            attempt += 1;
            setFault("none");
            continue;
          }
          if (isRetryableSaveError(err) && attempt < 5) {
            const delay = backoffDelayMs(attempt);
            syncLog.warn(
              `save: transient failure — retry ${attempt + 1} in ${delay}ms`,
            );
            await new Promise((r) => setTimeout(r, delay));
            attempt += 1;
            continue;
          }
          setFault(navigator.onLine === false ? "offline" : "error");
          setSaveState("idle");
          syncLog.error(
            `save: failed — ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
      }
    } finally {
      saving.current = false;
    }
  }, [adapter, encrypted, passwordRef]);

  // Debounced auto-save: a settled edit on a connected backend pushes itself,
  // unless a blocking fault, an open connect prompt, or an unresolved mount
  // baseline stands in the way (see `shouldAutoSave`).
  useEffect(() => {
    if (!adapter) return;
    if (
      !shouldAutoSave({
        isRemote,
        connected,
        dirty,
        blocked,
        locked,
        pendingSetup: pendingSetup !== null,
        baselineReady,
      })
    ) {
      return;
    }
    const timer = window.setTimeout(() => void doSave(), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    isRemote,
    connected,
    adapter,
    dirty,
    blocked,
    locked,
    pendingSetup,
    baselineReady,
    store.version,
    doSave,
  ]);

  // Map the engine's internal pieces onto the framework's `SaveStatus`.
  const status: SaveStatus =
    // A revoked folder grant drops the handle (so `connected` is false), but
    // the glyph must still flag it rather than reading "saved".
    isFolder && folderReconnectNeeded
      ? "auth-error"
      : !isRemote || !connected
        ? "saved"
        : fault === "auth-error"
          ? "auth-error"
          : fault === "conflict"
            ? "conflict"
            : fault === "throttled"
              ? "throttled"
              : fault === "error"
                ? "error"
                : saveState === "saving"
                  ? "saving"
                  : dirty
                    ? "idle"
                    : "saved";

  const setBackend = useCallback(
    (b: SyncBackendId) => {
      localStorage.setItem(BACKEND_KEY, b);
      // Adopt the backend "in sync": the current document is the baseline, so
      // the glyph starts green rather than flagging everything as unsaved.
      setSavedVersion(store.version);
      setSaveState("saved");
      setFault("none");
      setPendingSetup(null);
      setBackendState(b);
    },
    [store.version],
  );

  const connectDropbox = useCallback(async () => {
    if (!DROPBOX_APP_KEY) return;
    syncLog.info("dropbox: starting OAuth…");
    await startDropboxAuth(DROPBOX_APP_KEY); // redirects away
  }, []);

  const connectGdrive = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) return;
    syncLog.info("gdrive: requesting consent…");
    const token = await startGdriveAuth(
      GOOGLE_CLIENT_ID,
      logStore.createLogger("gdrive"),
    );
    sessionStorage.setItem(GDRIVE_TOKEN_KEY, token);
    justConnected.current = true;
    setGdriveToken(token);
    setBackend("gdrive");
    syncLog.info("gdrive: connected");
  }, [setBackend]);

  // Pick a local folder and switch to it. The framework persists the handle to
  // IndexedDB so the grant survives reloads.
  const connectFolder = useCallback(async () => {
    if (!FOLDER_BACKEND_AVAILABLE || !window.showDirectoryPicker) return;
    syncLog.info("folder: opening the directory picker…");
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      // AbortError = the user dismissed the picker; nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
      syncLog.error(
        `folder: picker failed — ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const status = await ensurePermission(handle, true);
    if (status !== "granted") {
      syncLog.warn("folder: read-write permission was not granted");
      return;
    }
    await saveDirectoryHandle(handle);
    justConnected.current = true;
    setFolderReconnectNeeded(false);
    setFolderHandleLoaded(true);
    setFolderHandle(handle);
    setBackend("folder");
    syncLog.info("folder: connected");
  }, [setBackend]);

  // Re-confirm a revoked OS grant on the already-stored handle.
  // `requestPermission` needs a user gesture, which is why this lives behind a
  // click handler. Falls back to a fresh pick when the stored record is gone.
  const reconnectFolder = useCallback(async () => {
    const stored = await loadDirectoryHandle();
    if (!stored) {
      await connectFolder();
      return;
    }
    const status = await ensurePermission(stored, true);
    if (status === "granted") {
      setFolderHandle(stored);
      setFolderReconnectNeeded(false);
      setFolderHandleLoaded(true);
      setFault("none");
      syncLog.info("folder: reconnected");
    } else {
      syncLog.warn("folder: reconnect declined");
    }
  }, [connectFolder]);

  const disconnect = useCallback(() => {
    writeDropboxTokens(null);
    sessionStorage.removeItem(GDRIVE_TOKEN_KEY);
    setDropboxTokens(null);
    setGdriveToken(null);
    void clearDirectoryHandle();
    setFolderHandle(null);
    setFolderReconnectNeeded(false);
    setFolderHandleLoaded(true);
    baseRevision.current = undefined;
    setBackend("local");
    syncLog.info("backend: back to this device only");
  }, [setBackend]);

  const setEncrypted = useCallback((v: boolean) => {
    localStorage.setItem(ENCRYPTED_KEY, v ? "1" : "0");
    setEncryptedState(v);
  }, []);

  const saveNow = useCallback(() => {
    if (!isRemote || !connected || blocked) return;
    void doSave();
  }, [isRemote, connected, blocked, doSave]);

  // Pull the backend copy down and adopt it as the working document — the
  // command centre's "Reload from the backend" (and the conflict resolution).
  const reload = useCallback(() => {
    if (!adapter) {
      store.reload();
      return;
    }
    void (async () => {
      try {
        const snap = await adapter.load();
        if (snap) {
          baseRevision.current = snap.revision;
          store.adoptRemote(snap.text);
          // `adoptRemote` bumps the edit counter exactly once; the adopted copy
          // IS the backend copy, so baseline dirty away.
          setSavedVersion(versionRef.current + 1);
          setFault("none");
          setSaveState("saved");
          syncLog.info(`reload: adopted backend copy (${snap.text.length} B)`);
        } else {
          syncLog.info("reload: backend holds no document yet");
        }
      } catch (err) {
        if (err instanceof AuthError) setFault("auth-error");
        else if (encrypted && passwordRef.current === null) setLocked(true);
        else {
          syncLog.error(
            `reload: failed — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    })();
  }, [adapter, store, encrypted, passwordRef]);

  // Resolve the connect-time replace-or-adopt prompt. "cloud" adopts the
  // existing remote copy as the working document; "replace" keeps this device's
  // copy and pushes it. Either way the baseline revision is already the
  // remote's, so an adopt writes nothing and a replace is accepted.
  const resolveSetup = useCallback(
    (choice: "cloud" | "replace") => {
      const pending = pendingSetupRef.current;
      if (!pending) return;
      // Clear the hold before pushing so `doSave` isn't blocked by it.
      pendingSetupRef.current = null;
      setPendingSetup(null);
      if (choice === "cloud") {
        store.adoptRemote(pending.remoteText);
        setSavedVersion(versionRef.current + 1);
        setFault("none");
        setSaveState("saved");
        syncLog.info("setup: adopted the existing backend copy");
      } else {
        syncLog.info("setup: replacing the backend copy with this device");
        void doSave();
      }
    },
    [store, doSave],
  );

  // Try a passphrase against the encrypted cloud copy — the unlock gate's
  // callback. A wrong passphrase fails at the AES-GCM auth tag; rethrow so the
  // gate surfaces it, and drop the passphrase so the next attempt re-derives.
  const unlock = useCallback(
    async (password: string) => {
      if (!adapter) return;
      passwordRef.current = password;
      try {
        const snap = await adapter.load();
        baseRevision.current = snap?.revision;
        setLocked(false);
        setFault("none");
        syncLog.info("unlock: cloud copy decrypted");
      } catch (err) {
        passwordRef.current = null;
        throw err;
      }
    },
    [adapter, passwordRef],
  );

  // Re-run the backend's consent flow — the command centre's "Reconnect".
  const reconnect = useCallback(async () => {
    if (backend === "dropbox") await connectDropbox();
    else if (backend === "gdrive") await connectGdrive();
    else if (backend === "folder") {
      await reconnectFolder();
      return; // reconnectFolder clears the fault only on a granted re-confirm.
    }
    setFault("none");
  }, [backend, connectDropbox, connectGdrive, reconnectFolder]);

  const checkConnection =
    useCallback(async (): Promise<ConnectionProbeResult> => {
      if (!adapter) return "online";
      syncLog.info("probe: checking backend reachability…");
      try {
        const ok = adapter.probe ? await adapter.probe() : true;
        if (ok) {
          setFault((f) => (f === "offline" || f === "error" ? "none" : f));
          syncLog.info("probe: online");
          return "online";
        }
        syncLog.warn("probe: still offline");
        return "offline";
      } catch (err) {
        if (err instanceof AuthError) {
          setFault("auth-error");
          syncLog.warn("probe: session expired");
          return "auth-error";
        }
        syncLog.warn("probe: still offline");
        return "offline";
      }
    }, [adapter]);

  const providerName = isRemote
    ? PROVIDER_NAMES[backend as Exclude<SyncBackendId, "local">]
    : "This device";

  // The folder's human-readable location: the picked directory's own name plus
  // the document file. Falls back to just the file name before the handle
  // rehydrates.
  const folderLocationPath = folderHandle
    ? `${folderHandle.name}/${cloudFileName(slug)}`
    : cloudFileName(slug);

  return {
    backend,
    connected,
    encrypted,
    setEncrypted,
    locked,
    pendingSetup,
    resolveSetup,
    unlock,
    connectDropbox,
    connectGdrive,
    connectFolder,
    reconnectFolder,
    folderReconnectNeeded,
    folderHandleLoaded,
    disconnect,
    status,
    dirty,
    offline: fault === "offline",
    providerName,
    backendKind: isCloud ? "cloud" : "folder",
    location: {
      path: isCloud
        ? backendPath(backend, slug)
        : isFolder
          ? folderLocationPath
          : docKey(slug),
      url: isCloud && connected ? backendWebUrl(backend, slug) : null,
    },
    saveNow,
    reload,
    reconnect:
      (isCloud && connected) || (isFolder && folderReconnectNeeded)
        ? reconnect
        : null,
    checkConnection,
  };
}
