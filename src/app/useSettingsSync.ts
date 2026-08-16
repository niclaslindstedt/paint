// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Keeps this device's settings and the backend's `settings.json` in step.
//
// Two directions, and they are not symmetrical:
//
//   - **On connect** (and on a backend switch) the backend wins *if it has a
//     file*. Someone connecting a folder they already use from another machine
//     wants that machine's kit, which is the whole reason the file exists. When
//     the backend has none, this device seeds it.
//   - **On every later edit** the device wins, written straight through.
//
// The asymmetry is what makes "connect the same folder on the laptop" do the
// obvious thing without ever asking a question. It costs one case: connecting a
// long-used backend from a device whose settings you preferred replaces them.
// That is the same trade the document itself makes on adopt, it is undoable by
// changing the settings again (which writes straight back), and the alternative
// — a modal asking which set of tool presets to keep — is worse.
//
// On the on-device backend there is no store and this hook does nothing; the
// localStorage copy `useAppSettings` keeps is the only one, exactly as before.
// That copy is written on every backend too, so first paint is never waiting on
// a folder read to know which theme to draw.

import { useEffect, useRef, useState } from "react";

import { logStore } from "./log.ts";
import {
  mergeSyncedSettings,
  serializeSettings,
  type SettingsStore,
} from "./settingsStore.ts";
import type { AppSettings } from "./useAppSettings.ts";

const log = logStore.createLogger("settings");

export type SettingsSyncDeps = {
  /** The active backend's settings file, or null on the on-device backend. */
  store: SettingsStore | null;
  /** The settings in hand. */
  settings: AppSettings;
  /** Replace them wholesale — `useAppSettings`'s `setSettings`. */
  setSettings: (next: AppSettings) => void;
};

export function useSettingsSync({
  store,
  settings,
  setSettings,
}: SettingsSyncDeps): void {
  // The last text this device and the backend agreed on. It is what stops the
  // adopt below from bouncing: adopting the file changes `settings`, which
  // wakes the write-through effect, which would push the very bytes it just
  // read. Seeded by both directions, compared by the writer.
  const agreed = useRef<string | null>(null);
  // Which backend the reconcile below has finished with. The write-through
  // effect refuses to run until this matches, and that gate is load-bearing:
  // both effects fire on the same mount, the reconcile can only *start* its
  // read there, and an ungated writer would push this device's settings over
  // the file a moment before learning what was in it. Sequencing them is the
  // difference between "adopt the backend" and "silently overwrite it".
  //
  // State rather than a ref so that finishing the reconcile re-runs the writer:
  // seeding a fresh backend changes no settings, so there would otherwise be no
  // later render to release the gate.
  const [reconciled, setReconciled] = useState<SettingsStore | null>(null);
  // Read fresh inside the reconcile so that effect doesn't re-run on every
  // settings change — it must fire when the *backend* changes, and only then.
  const latest = useRef(settings);
  latest.current = settings;
  const apply = useRef(setSettings);
  apply.current = setSettings;

  // Adopt-or-seed, whenever the backend changes.
  useEffect(() => {
    agreed.current = null;
    setReconciled(null);
    if (!store) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await store.load();
        if (cancelled) return;
        if (raw === null) {
          const seed = serializeSettings(latest.current);
          agreed.current = seed;
          await store.save(seed);
          log.info("settings: seeded the backend from this device");
        } else {
          agreed.current = raw;
          apply.current(mergeSyncedSettings(latest.current, raw));
          log.info("settings: adopted the backend's copy");
        }
      } catch (err) {
        // Unreachable, unreadable, or refused — this device's settings stand.
        log.warn(
          `settings: couldn't reconcile with the backend — ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        // Opened even when the reconcile failed, so the next edit gets its
        // write attempted rather than being blocked forever by one bad minute.
        if (!cancelled) setReconciled(store);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Write local edits through. Cheap enough to do unconditionally — settings
  // change when a person moves a slider, not when a stroke lands — so there is
  // no debounce here, only the equality check that keeps an adopt from echoing.
  useEffect(() => {
    if (!store || reconciled !== store) return;
    const text = serializeSettings(settings);
    if (text === agreed.current) return;
    agreed.current = text;
    void store.save(text).catch((err: unknown) => {
      // Leave `agreed` as the text we tried: re-pushing on the next edit is
      // right, and a backend that is down will fail that one too.
      log.warn(
        `settings: couldn't write to the backend — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }, [store, settings, reconciled]);
}
