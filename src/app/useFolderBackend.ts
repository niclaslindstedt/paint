// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The local-folder backend's permission dance.
//
// Unlike the two cloud backends, whose credentials are a token we hold, the
// folder backend's credential is an *OS grant* on a directory handle — and the
// OS can take it back. So this backend alone has a lifecycle: rehydrate the
// stored handle on boot and ask whether the grant still stands, notice a
// revoked grant mid-operation, and re-confirm it inside a user gesture (which
// `requestPermission` insists on). None of that is about syncing a document,
// which is why it lives here rather than in `useSyncEngine`.
//
// The handle itself is persisted to IndexedDB by the framework; what is held
// here is only the live one plus the two flags the UI reads.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ensurePermission,
  isFolderBackendAvailable,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "@niclaslindstedt/oss-framework/storage";

import { logStore } from "./log.ts";

const log = logStore.createLogger("sync");

/** True in browsers that expose the File System Access API directory picker
 *  (Chromium-based). The local-folder backend is hidden where this is false. */
export const FOLDER_BACKEND_AVAILABLE = isFolderBackendAvailable();

export type FolderBackend = {
  /** The picked directory, or null before the boot probe rehydrates one, after
   *  a revoked grant drops it, or when no folder has ever been picked. */
  handle: FileSystemDirectoryHandle | null;
  /** Gates the folder branch until the boot probe has run, so the UI doesn't
   *  briefly show "not connected" for a folder whose grant is about to
   *  rehydrate. */
  loaded: boolean;
  /** The OS grant is gone and needs re-confirming in a user gesture. */
  reconnectNeeded: boolean;
  /** Called by the adapter when an in-flight operation hits a revoked grant. */
  markPermissionLost: () => void;
  /** Open the directory picker and adopt what comes back. Resolves to true
   *  when a folder was picked and granted — the caller then switches the
   *  active backend to it. */
  connect: () => Promise<boolean>;
  /** Re-confirm a revoked grant on the already-stored handle. Resolves to true
   *  when the grant is back. Falls back to a fresh pick when the stored record
   *  has gone. */
  reconnect: () => Promise<boolean>;
  /** Forget the live handle — the disconnect path. */
  clear: () => void;
};

/**
 * `active` is whether the folder is the backend in use, read once on mount to
 * decide whether the boot probe runs at all. `onPermissionLost` lets the engine
 * raise its own auth fault without this module knowing what a fault is.
 */
export function useFolderBackend(
  active: boolean,
  onPermissionLost: () => void,
): FolderBackend {
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [loaded, setLoaded] = useState<boolean>(() => !active);
  const [reconnectNeeded, setReconnectNeeded] = useState(false);

  const markPermissionLost = useCallback(() => {
    log.warn("folder: permission lost — reconnect required");
    setHandle(null);
    setReconnectNeeded(true);
    onPermissionLost();
  }, [onPermissionLost]);

  // Boot probe: rehydrate the stored handle and ask the OS whether the grant
  // still stands. Read from the mount-time `active` rather than a live prop —
  // this runs once, for the backend the app opened on.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const stored = await loadDirectoryHandle();
      if (cancelled) return;
      if (!stored) {
        setReconnectNeeded(true);
        setLoaded(true);
        return;
      }
      const status = await ensurePermission(stored, false);
      if (cancelled) return;
      if (status === "granted") setHandle(stored);
      else setReconnectNeeded(true);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only by design — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    if (!FOLDER_BACKEND_AVAILABLE || !window.showDirectoryPicker) return false;
    log.info("folder: opening the directory picker…");
    let picked: FileSystemDirectoryHandle;
    try {
      picked = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      // AbortError = the user dismissed the picker; nothing to do.
      if (err instanceof DOMException && err.name === "AbortError")
        return false;
      log.error(
        `folder: picker failed — ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
    if ((await ensurePermission(picked, true)) !== "granted") {
      log.warn("folder: read-write permission was not granted");
      return false;
    }
    await saveDirectoryHandle(picked);
    setReconnectNeeded(false);
    setLoaded(true);
    setHandle(picked);
    log.info("folder: connected");
    return true;
  }, []);

  const reconnect = useCallback(async () => {
    const stored = await loadDirectoryHandle();
    if (!stored) return connect();
    if ((await ensurePermission(stored, true)) === "granted") {
      setHandle(stored);
      setReconnectNeeded(false);
      setLoaded(true);
      log.info("folder: reconnected");
      return true;
    }
    log.warn("folder: reconnect declined");
    return false;
  }, [connect]);

  const clear = useCallback(() => {
    setHandle(null);
    setReconnectNeeded(false);
    setLoaded(true);
  }, []);

  // Memoized: the engine's `disconnect` and `connectFolder` close over this, and
  // a fresh object every render would make those callbacks unstable all the way
  // down to the buttons that hold them.
  return useMemo(
    () => ({
      handle,
      loaded,
      reconnectNeeded,
      markPermissionLost,
      connect,
      reconnect,
      clear,
    }),
    [
      handle,
      loaded,
      reconnectNeeded,
      markPermissionLost,
      connect,
      reconnect,
      clear,
    ],
  );
}
