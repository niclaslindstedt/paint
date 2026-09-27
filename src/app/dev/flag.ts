// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The presentation demo's switch, on its own so the storage seams can ask it
// without importing the demo (see `demo.ts`).
//
// True only in a build made with `VITE_SEED=demo` (`make demo`, and the store
// screenshots). Vite inlines the comparison, so in every other build it folds
// to `false` and each `if (DEMO)` branch — and the demo modules behind them —
// is dropped from the bundle.

export const DEMO = import.meta.env.VITE_SEED === "demo";
