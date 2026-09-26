// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the sidebar's Donate row points — or null in a build that must not
// have one.
//
// Only the website carries it. The phone app (`__NATIVE_BUILD__`) and the
// desktop app (`__SHELL_BUILD__`) ship without: a payment link outside Apple's
// is an App Store rejection (guideline 3.1.1), and the listings promise nothing
// is sold. Both flags are compile-time constants Vite substitutes, so in those
// builds this is a literal `null`, and the minifier drops the other branch and
// the row that tests it — the URL, fallback included, never reaches the
// bundle. Hiding the row at runtime would still ship the link.
//
// On the website the target is set at build time (`VITE_DONATE_URL`) so the
// sponsorship destination can change without a code edit, and falls back to
// the project's GitHub Sponsors page. See `docs/configuration.md`.
export const DONATE_URL: string | null =
  __NATIVE_BUILD__ || __SHELL_BUILD__
    ? null
    : (import.meta.env.VITE_DONATE_URL as string | undefined)?.trim() ||
      "https://github.com/sponsors/niclaslindstedt";
