// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's settings as one file at the backend's root — `settings.json`,
// beside the document and the `images/` tree.
//
// The reason it is a *file on the backend* rather than another localStorage key
// is that a kit is worth carrying. Finding the 4B at 0.7 mm with the opacity
// eased off is real work, and so is the toolbar you arranged and the eleven
// colours you mixed; doing all of it again on the laptop is the same work
// twice. Connect the same folder (or the same Dropbox) on the other machine and
// the tools are already the ones you set up.
//
// **It is deliberately not part of the document.** A drawing is a list of
// strokes, and which tools are switched on is not one of them: a settings
// change would otherwise be an undoable edit and would push the whole document
// on every slider drag. Two files, two lifetimes.
//
// **And it is deliberately plaintext**, even when the drawings are encrypted.
// Nothing here is a secret — it is which tools are on and how wide they draw —
// and keeping it readable means a fresh device can render the app the way you
// set it up *before* anyone types a passphrase. The document is the thing worth
// sealing; the size of your pencil is not.
//
// Which settings travel is a real distinction rather than "all of them": see
// {@link DEVICE_ONLY_KEYS} below.

import { logStore } from "./log.ts";
import type { ByteFileStore } from "./imageFileStore.ts";
import { parseSettings, type AppSettings } from "./useAppSettings.ts";

const log = logStore.createLogger("settings");

/** The file, at the app-folder root a backend owns — the picked directory,
 *  Dropbox's `Apps/<app>/`, Drive's `Paint/`. */
export const SETTINGS_FILE = "settings.json";

const JSON_MIME = "application/json";

/**
 * The settings that stay on this device and are never written to the file.
 *
 * Both are answers about *this browser*, not about how the user works. Developer
 * mode and log capture are diagnostics you switch on to investigate something
 * here, and having them follow you onto a phone you were not debugging is a
 * surprise rather than a convenience.
 *
 * The backend choice, the OAuth tokens and the encryption flag are not in this
 * list because they were never part of `AppSettings` — they live in their own
 * localStorage keys in `useSyncEngine`, and they have to: a file that told the
 * app which backend to read it from would be a loop.
 */
export const DEVICE_ONLY_KEYS = ["devMode", "captureLogs"] as const;

export type DeviceOnlyKey = (typeof DEVICE_ONLY_KEYS)[number];

/** The travelling half of the settings — everything but {@link DEVICE_ONLY_KEYS}. */
export type SyncedSettings = Omit<AppSettings, DeviceOnlyKey>;

export type SettingsStore = {
  /** The stored settings JSON, or null when the backend holds none yet. */
  load(): Promise<string | null>;
  /** Replace the stored settings JSON. */
  save(text: string): Promise<void>;
};

/** Strip the device-only settings, leaving what belongs in the file. */
export function syncedSettings(settings: AppSettings): SyncedSettings {
  const out = { ...settings } as Partial<AppSettings>;
  for (const key of DEVICE_ONLY_KEYS) delete out[key];
  return out as SyncedSettings;
}

/** Fold a backend's settings onto this device's, keeping the device-only ones.
 *
 *  The incoming text goes through `parseSettings` — the same validation an
 *  upgrade gets — so a file hand-edited to nonsense, or written by a newer
 *  build, degrades to defaults per field instead of breaking the app. Then the
 *  two device-only settings are put back from what is in hand, because the file
 *  has nothing to say about them. */
export function mergeSyncedSettings(
  local: AppSettings,
  incoming: string,
): AppSettings {
  const parsed = parseSettings(incoming);
  const merged = { ...parsed } as AppSettings;
  for (const key of DEVICE_ONLY_KEYS) merged[key] = local[key];
  return merged;
}

/** Serialize the travelling half, pretty-printed.
 *
 *  Indented on purpose: this file lands in a folder the user picked and can
 *  open, and a diff of it in a synced git repo should be readable. It is a few
 *  kilobytes — the space costs nothing. */
export function serializeSettings(settings: AppSettings): string {
  return `${JSON.stringify(syncedSettings(settings), null, 2)}\n`;
}

/**
 * Build a settings store over a backend's root-scoped byte store — the same
 * transport the image externaliser uses (`imageFileStore.ts` for the cloud,
 * `folderFileStore.ts` for the picked directory), so there is one way bytes
 * reach a backend rather than one per concern.
 *
 * Reads and writes are best-effort at the edges: a missing file reads as null,
 * and a failed write is logged rather than thrown. Settings are a convenience,
 * and a backend having a bad minute must never take the app down with it.
 */
export function fileSettingsStore(files: ByteFileStore): SettingsStore {
  return {
    async load() {
      const bytes = await files.read(SETTINGS_FILE);
      if (!bytes) return null;
      try {
        return new TextDecoder().decode(bytes);
      } catch {
        log.warn("settings: the stored file isn't readable text");
        return null;
      }
    },
    async save(text) {
      await files.write(
        SETTINGS_FILE,
        new TextEncoder().encode(text),
        JSON_MIME,
      );
    },
  };
}
