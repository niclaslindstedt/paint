// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared PWA wiring. The framework owns the update *state machine*
// (`usePwaUpdate`) and the prompt UI; the app owns the service-worker *build*.
// The one value both sides must agree on is the precache cache id — the SW
// build names its cache `<cacheId>-precache` and the hook reads progress from a
// cache matching that prefix. So this helper is imported by BOTH `App.tsx`
// (browser) and `pwa-plugin.ts` (the SW-emitting build plugin); keep it free of
// any browser- or Node-only imports.

/** Per-deploy-base precache cache id, derived from the bundler `base`. */
export function cacheIdForBase(base: string): string {
  const slug = base.replace(/^\/+|\/+$/g, "").replace(/\W+/g, "-");
  return slug ? `paint-${slug}` : "paint";
}
