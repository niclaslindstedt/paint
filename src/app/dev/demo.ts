// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The presentation demo: `VITE_SEED=demo` (`make demo`) boots the app onto one
// person's sketchbooks — `buildDemo` in `./demoData.ts` — held entirely in
// memory. It is the live demo and what the App Store screenshots are taken of.
//
// **How it stays off the device.** This install keeps its drawings in
// IndexedDB and everything else — the sketchbook registry, which one is open,
// the backend choice, the settings — in `localStorage`. So the demo swaps the
// one and never opens the other: before any other module of the app is
// evaluated (`demo-boot.ts` is `main.tsx`'s first import), `bootDemo` puts an
// in-memory `Storage` in `window.localStorage`'s place, pre-filled with the
// demo, and `docDb.ts` runs as it does in a browser with no database — off
// that same store, where the demo's documents sit under the keys the
// localStorage era used. Every screen then runs the app's real code over the
// demo — the store, the layers, every painter — and every edit lands in memory
// and is gone on reload. The device's drawings are never read: the only thing
// carried over is this install's own look and kit (see `carriesOver`).
//
// The iCloud host reads as absent while the demo runs (`icloudHost.ts`), and
// connecting a storage backend is refused (`useSyncEngine.ts`), since the
// first sync would copy the demo into the reader's real folder or cloud.
//
// Dev tooling, not a shipped feature: `DEMO` folds to `false` in any build
// without `VITE_SEED=demo`, so neither this module nor the data reaches the
// production bundle.

import { buildDemo, DEMO_SETTINGS_KEYS } from "./demoData.ts";

/** A `Storage` that lives and dies with the page. */
export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }
}

/** The settings blob's key (`STORAGE_KEY` in `useAppSettings.ts`). */
export const SETTINGS_KEY = "paint:settings";

/**
 * The keys a demo copies from the device: how this install looks and holds
 * its tools — the settings blob (less what is the person's own, below), the
 * language, the folded menu footer, where the menu button was dragged to and
 * which panel sections are folded. Never a document, a sketchbook, a cursor,
 * a backend, a token or the encryption state.
 */
export function carriesOver(key: string): boolean {
  return (
    key === SETTINGS_KEY ||
    key === "paint:language" ||
    key === "paint:footer-collapsed" ||
    key === "paint:menu-position" ||
    key === "paint:panel:folded"
  );
}

/**
 * Build the in-memory store the demo runs on: this device's look (see
 * `carriesOver`), then the demo over it. The settings fields that are the
 * person's own work rather than their look — their canvas presets, saved
 * tools and mixed colours — are replaced by the demo's.
 */
export function demoStorage(device: Storage | null): MemoryStorage {
  const memory = new MemoryStorage();
  if (device) {
    for (let i = 0; i < device.length; i++) {
      const key = device.key(i);
      if (key === null || !carriesOver(key)) continue;
      const value = device.getItem(key);
      if (value !== null) memory.setItem(key, value);
    }
  }
  const demo = buildDemo();
  for (const [key, value] of Object.entries(demo.storage)) {
    memory.setItem(key, value);
  }
  let settings: Record<string, unknown> = {};
  try {
    const raw = memory.getItem(SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      settings = parsed as Record<string, unknown>;
    }
  } catch {
    // A corrupt blob is replaced by the defaults plus the demo's own.
  }
  for (const field of DEMO_SETTINGS_KEYS) delete settings[field];
  memory.setItem(
    SETTINGS_KEY,
    JSON.stringify({ ...settings, ...demo.settings }),
  );
  return memory;
}

/**
 * Swap `window.localStorage` for the demo's in-memory store. Called before
 * the app's first module is evaluated, so no read ever reaches the device's
 * drawings. Returns false (and changes nothing) where the property can't be
 * replaced.
 */
export function bootDemo(): boolean {
  let device: Storage | null = null;
  try {
    device = window.localStorage;
  } catch {
    // Storage blocked: the demo still runs, in the default look.
  }
  const memory = demoStorage(device);
  try {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => memory,
    });
  } catch {
    return false;
  }
  return window.localStorage === memory;
}
