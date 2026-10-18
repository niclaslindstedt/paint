// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which storage backends this build has, and what a stored choice means in it.
//
// The phone app offers neither Dropbox nor a local folder — not a disabled
// option, not a mention. On iPhone and iPad it keeps the drawings on the
// device or in iCloud Drive; on Android, on the device. A WebView has no
// directory picker, so the folder could only ever be missing or dead there.
// The website and the desktop app keep both exactly as before.
//
// `__NATIVE_BUILD__` is a compile-time constant Vite substitutes, and every
// gate tests it where it stands — here, in `useSyncEngine.ts`, in
// `useFolderBackend.ts`, in `useLayerSave.ts` and in the Storage tab — rather
// than reading `DROPBOX_IN_BUILD`. The minifier folds a test written in place
// to a literal the branch then drops on, but keeps a constant imported from
// another module as a variable, which would leave the picker's options, the
// connect flows, the OAuth redirect and the adapters they build in the phone
// bundle as dead code.
//
// Kept apart from `useSyncEngine.ts` so the rule can be tested without the
// engine's hooks around it.

export type SyncBackendId = "local" | "folder" | "dropbox" | "icloud";

/** Whether this build has Dropbox and the local folder at all: everywhere but
 *  the phone app. The answer, for the tests — code tests the define itself. */
export const DROPBOX_IN_BUILD: boolean = !__NATIVE_BUILD__;

// OAuth app identities, injected at build time. Without them the matching
// backend is hidden in Settings → Storage rather than offered as a dead option.
export const DROPBOX_APP_KEY: string = !__NATIVE_BUILD__
  ? ((import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) ?? "")
  : "";

// Dropbox fixes the app-folder name from the app's own configuration (an "App
// folder"-scoped app lives under `Apps/<name>/`), so it isn't always "Paint".
// Inject the real name at build time so the "Open in Dropbox" link and the
// displayed file location point at the folder that actually exists.
export const DROPBOX_APP_FOLDER: string =
  (import.meta.env.VITE_DROPBOX_APP_FOLDER as string | undefined)?.trim() ||
  "Paint";

/** The backend a stored choice (`paint:sync:backend`) names in this build. A
 *  phone app that finds "dropbox" — an install from before it dropped Dropbox —
 *  or "folder" opens on this device instead: the working copy has always lived
 *  there, the copy elsewhere stays where it is, and the stored choice is left
 *  as it is. */
export function storedBackend(raw: string | null): SyncBackendId {
  if (raw === "dropbox") return !__NATIVE_BUILD__ ? raw : "local";
  if (raw === "folder") return !__NATIVE_BUILD__ ? raw : "local";
  return raw === "icloud" ? raw : "local";
}

/** The backends Settings → Storage offers, in the order it lists them. A
 *  backend that cannot be connected here is left out rather than offered as a
 *  dead option: the folder where the browser has no File System Access API
 *  (and always in the phone app), Dropbox without an app key (and always in
 *  the phone app), iCloud Drive where no host provides a container. */
export function offeredBackends(host: {
  folder: boolean;
  icloud: boolean;
}): SyncBackendId[] {
  return [
    "local",
    ...(!__NATIVE_BUILD__ && host.folder ? (["folder"] as const) : []),
    ...(!__NATIVE_BUILD__ && DROPBOX_APP_KEY ? (["dropbox"] as const) : []),
    ...(host.icloud ? (["icloud"] as const) : []),
  ];
}
