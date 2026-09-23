// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SEAM: where the app asks its host whether it can offer iCloud Drive.
//
// A browser cannot write a file into somebody's iCloud Drive — there is no
// such API — so on the website this seam is simply never filled and the
// backend is absent, down to its entry in the Storage picker. The app-store
// build's WebView host fills it in (`native/src/icloudBridge.ts`), and so
// could any other host that one day wanted to.
//
// That phrasing is the important part, and it is a deliberate softening of a
// rule in `AGENTS.md`: "nothing in `src/` may learn that the wrapper exists".
// Nothing here does. This module never asks whether it is running natively, on
// which platform, or in which build — it asks whether an iCLOUD PROVIDER is
// present, which is a question about capability and not about identity. A
// second host offering the same methods would light the same backend up with
// no change here, and the wrapper stays free to disappear without leaving a
// native-shaped hole in the app.
//
// What the app keeps either way is the DOMAIN. A host moves opaque files; the
// document's name, the deterministic `images/` and `drawings/` layout, what a
// conflict means and when a save is due are all decided in `useSyncEngine.ts`
// against the framework's storage adapters — exactly as they are for a picked
// local folder. A host that knew what a drawing was would be a second
// implementation of the app's storage.

import { useEffect, useState } from "react";

/** Whether the container can be used right now.
 *
 *  `unavailable` is not a refusal — it is the website, and every build with no
 *  iCloud behind it, and it is what hides the backend. `signed-out` is a
 *  device with no iCloud account (or iCloud Drive switched off), which the
 *  reader can fix, so it is worth telling the two apart. */
export type ICloudStatus = "ready" | "signed-out" | "unavailable";

/** One file in the container: a path relative to its document root, plus an
 *  opaque token that changes when the bytes change. Mirrors the framework's
 *  `FileEntry`, which is what this feeds. */
export type ICloudEntry = { path: string; rev?: string };

/** What a host has to provide to light the backend up.
 *
 *  Seven methods, all async, and deliberately no events: iCloud tells the
 *  device when a file changed, but the app already re-reads the document on
 *  open and on "Reload from the backend", and a host pushing changes would be
 *  holding a subscription to the reader's sketchbook for as long as the app
 *  is open.
 *
 *  Text and bytes are separate pairs because the document is JSON and an image
 *  is not: base64-ing the document too would cost a third of its size for
 *  nothing. */
export type ICloudHost = {
  /** Bumped only for a breaking change to the methods below; a host announcing
   *  a version this build does not know is ignored entirely rather than called
   *  with the wrong shape. */
  readonly version: 1;
  /** Whether the container is usable. Safe to call on boot: it must never
   *  raise a prompt or block on the network. */
  status(): Promise<ICloudStatus>;
  /** Every file in the container, with its current revision. */
  list(): Promise<readonly ICloudEntry[]>;
  /** One file's contents as text, or null when it does not exist. */
  read(path: string): Promise<string | null>;
  /** Write (create or overwrite) one file from text. */
  write(path: string, text: string): Promise<void>;
  /** One file's contents as base64, or null when it does not exist. */
  readBytes(path: string): Promise<string | null>;
  /** Write (create or overwrite) one file from base64. */
  writeBytes(path: string, base64: string): Promise<void>;
  /** Delete one file. A missing file is treated as already gone. */
  remove(path: string): Promise<void>;
};

/** The event a host fires once it has installed itself. The injected script
 *  can run after the app has mounted, so the app cannot simply read `window`
 *  once and conclude the backend is absent. */
export const ICLOUD_HOST_EVENT = "paint:icloud-host";

/** Where a host installs itself. */
const HOST_PROPERTY = "__paintICloud";

type HostWindow = Window & { [HOST_PROPERTY]?: unknown };

/** The method names a host must carry. Spelled once so the validation below
 *  cannot drift from the type above. */
const METHODS = [
  "status",
  "list",
  "read",
  "write",
  "readBytes",
  "writeBytes",
  "remove",
] as const;

/** The installed host, or null. Validates the shape rather than trusting it:
 *  the value arrives from code outside this bundle. */
export function getICloudHost(): ICloudHost | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as HostWindow)[HOST_PROPERTY];
  if (typeof candidate !== "object" || candidate === null) return null;
  const host = candidate as Partial<ICloudHost> & Record<string, unknown>;
  if (host.version !== 1) return null;
  for (const method of METHODS) {
    if (typeof host[method] !== "function") return null;
  }
  return host as ICloudHost;
}

/** The host, as state — null until one is installed, and re-read when one
 *  announces itself. */
export function useICloudHost(): ICloudHost | null {
  const [host, setHost] = useState<ICloudHost | null>(() => getICloudHost());
  useEffect(() => {
    // Re-read on announcement rather than trusting what the event carries:
    // `getICloudHost` is the one validation, and an event is not a reason to
    // skip it.
    const onAnnounce = () => setHost(getICloudHost());
    window.addEventListener(ICLOUD_HOST_EVENT, onAnnounce);
    // …and once more now, in case the host installed itself between this
    // component's first render and this effect.
    onAnnounce();
    return () => window.removeEventListener(ICLOUD_HOST_EVENT, onAnnounce);
  }, []);
  return host;
}

/** Narrow a status answer. An unrecognised string is treated as `signed-out`,
 *  which is the state that explains itself and offers to try again — the two
 *  it must never be mistaken for are `ready` (which would have the app push a
 *  document at a container it cannot reach) and `unavailable` (which would
 *  hide a backend the reader has already connected). */
export function parseICloudStatus(value: unknown): ICloudStatus {
  return value === "ready" || value === "unavailable" || value === "signed-out"
    ? value
    : "signed-out";
}

/** Narrow a host's `list()` result. Anything malformed is dropped one entry at
 *  a time rather than failing the whole read — a single bad row must not cost
 *  the reader every image the sweep would otherwise have found. */
export function parseICloudEntries(value: unknown): ICloudEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ICloudEntry[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as { path?: unknown; rev?: unknown };
    if (typeof entry.path !== "string" || entry.path === "") continue;
    entries.push({
      path: entry.path,
      ...(typeof entry.rev === "string" ? { rev: entry.rev } : {}),
    });
  }
  return entries;
}
