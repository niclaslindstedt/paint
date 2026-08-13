// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  createLogStore,
  type LogStore,
} from "@niclaslindstedt/oss-framework/logging";

// A single in-app log buffer, built on the framework's logging module. The Logs
// settings tab renders it live through the framework's `LogViewer`; the sync
// engine, the encryption wrapper, and the storage adapters all write their
// diagnostics into it.
export const logStore = createLogStore({ logsKey: "paint:logs" });
logStore.setEnabled(true);
logStore.setCaptureEnabled(true);

export const log = logStore.createLogger("app");

/**
 * A read-only *view* over a store that hands its buffer back newest-first.
 *
 * The framework's `LogViewer` renders entries in whatever order the store
 * returns them, and a store's buffer is append-ordered (oldest first). Wrapping
 * the store flips that for one viewer without touching the shared buffer, so
 * the same lines can still be read oldest-first elsewhere. Every other method
 * delegates straight through.
 */
export function newestFirst(store: LogStore): LogStore {
  return {
    createLogger: (scope) => store.createLogger(scope),
    getLogs: () => store.getLogs().reverse(),
    clearLogs: () => store.clearLogs(),
    subscribeToLogs: (cb) => store.subscribeToLogs(cb),
    setCaptureEnabled: (enabled) => store.setCaptureEnabled(enabled),
    isCaptureEnabled: () => store.isCaptureEnabled(),
    setEnabled: (enabled) => store.setEnabled(enabled),
    isEnabled: () => store.isEnabled(),
  };
}

// The sync command centre's log panel reads the same buffer as the Logs
// settings tab, but newest-first — when a sync just failed, the line that
// explains it is the one you want at the top. Module-scoped so the identity
// stays stable across renders (the framework's `useLogs` keys its subscription
// on the store object).
export const descendingLogStore = newestFirst(logStore);
