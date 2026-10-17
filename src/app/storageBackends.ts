// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Which storage backends this build has, and what a stored choice means in it.
//
// The phone app offers no Dropbox at all — not a disabled option, not a
// mention. On iPhone and iPad it keeps the drawings on the device or in iCloud
// Drive; on Android, on the device. The website and the desktop app keep
// Dropbox exactly as before. `__NATIVE_BUILD__` is a compile-time constant
// Vite substitutes, so in the phone bundle the key below is a literal empty
// string and every path that tests it — the picker's option, the connect
// flow, the OAuth redirect — is folded out rather than hidden.
//
// Kept apart from `useSyncEngine.ts` so the rule can be tested without the
// engine's hooks around it.

export type SyncBackendId = "local" | "folder" | "dropbox" | "icloud";

/** Whether this build has Dropbox at all: everywhere but the phone app. */
export const DROPBOX_IN_BUILD: boolean = !__NATIVE_BUILD__;

// OAuth app identities, injected at build time. Without them the matching
// backend is hidden in Settings → Storage rather than offered as a dead option.
export const DROPBOX_APP_KEY: string = DROPBOX_IN_BUILD
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
 *  opens on this device instead: the working copy has always lived there, and
 *  the copy in Dropbox stays where it is. */
export function storedBackend(raw: string | null): SyncBackendId {
  if (raw === "dropbox") return DROPBOX_IN_BUILD ? raw : "local";
  return raw === "folder" || raw === "icloud" ? raw : "local";
}

/** The backends Settings → Storage offers, in the order it lists them. A
 *  backend that cannot be connected here is left out rather than offered as a
 *  dead option: the folder where the browser has no File System Access API,
 *  Dropbox without an app key (and always in the phone app), iCloud Drive
 *  where no host provides a container. */
export function offeredBackends(host: {
  folder: boolean;
  icloud: boolean;
}): SyncBackendId[] {
  return [
    "local",
    ...(host.folder ? (["folder"] as const) : []),
    ...(DROPBOX_APP_KEY ? (["dropbox"] as const) : []),
    ...(host.icloud ? (["icloud"] as const) : []),
  ];
}
