// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Whether this build carries What's new — the version history and the feature
// docs its Learn more links open: the website and the desktop app do, the
// phone app does not.
//
// The phone app (`__NATIVE_BUILD__`) leaves its version history to the App
// Store's own What's New (the owner's decision), so its About dropdown has no
// What's new row, and neither the dialog nor the CHANGELOG nor any feature doc
// is in its bundle — a feature doc is only reachable through What's new. The
// flag is a compile-time constant Vite substitutes, so in that build this is a
// literal `false`. The lazy import of the dialog in `App.tsx` tests the raw
// define rather than this constant, because the bundler settles which chunks
// exist before it folds an imported one; `vite.config.ts` fails a phone build
// that still reaches a `.md`.
export const CHANGELOG_BUILT: boolean = !__NATIVE_BUILD__;
