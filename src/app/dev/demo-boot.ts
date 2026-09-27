// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The presentation demo's boot (`VITE_SEED=demo`, see `demo.ts`). Imported
// FIRST by `main.tsx`, for its side effect alone: ES modules evaluate in
// import order, so the in-memory store is in `window.localStorage`'s place
// before any module of the app reads from it — the log store and the language
// do at load. If the store can't be installed this throws, the module graph
// fails, and nothing mounts: the demo never falls through to the device's
// drawings.
//
// In every other build the condition folds to `false`, and the demo modules
// are tree-shaken out of the bundle with it.

import { bootDemo } from "./demo.ts";
import { DEMO } from "./flag.ts";

if (DEMO && !bootDemo()) {
  throw new Error("demo: localStorage could not be replaced");
}
