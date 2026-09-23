// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the wrapper points its WebView, and the colours it paints while it has
// nothing better.
//
// By default the app is SELF-CONTAINED: it serves the copy of the web build
// packed inside it (`assets/webroot.zip`) over a loopback HTTP server, so the
// app works with no network and changes only when a new build ships
// to the store. That is also what makes it an app rather than a viewer for a
// website — App Store guideline 4.2 (minimum functionality) rejects the
// latter.
//
// `EXPO_PUBLIC_PAINT_URL` overrides that at build time, pointing the
// WebView at a deployed slot instead (the `/preview/` one, say, or a dev
// server on the LAN). Debugging only: a store build must not set it.

/** A remote URL to load instead of the bundled build, or undefined to serve
 *  the bundle locally. */
export const REMOTE_URL: string | undefined = process.env.EXPO_PUBLIC_PAINT_URL;

/** The fallback chrome, shown before the page has reported its theme (launch,
 *  over-scroll, the failure screen). The app's dark surface, matching
 *  `src/app/look.ts`'s own default — the WebView takes over the moment it
 *  paints. */
export const FALLBACK_BACKGROUND = "#0b0d10";
export const FALLBACK_FOREGROUND = "#e6edf3";
