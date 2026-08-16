// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { render } from "preact";

// The default UI family (JetBrains Mono) is imported statically so it ships in
// the main bundle and precaches for offline first paint. The other families
// load on demand when selected (the theme engine calls `loadFontFamily`).
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-ext-700.css";

import "./styles.css";
import { App } from "./App.tsx";
import { hydrateActiveDoc } from "./app/docDb.ts";
import { LanguageRoot } from "./app/i18n/index.ts";
import { registerBuiltinPlugins } from "./app/plugins/builtin/index.ts";

// Populate the tool registry before the first render, so the toolbar and the
// renderer both see every shipped tool. This is the one call an
// externally-loaded plugin bundle would join later — registration is a
// side-effecting function, not a hard-coded list in the UI.
registerBuiltinPlugins();

// In dev no worker registers (`usePwaUpdate` runs disabled), but a worker
// installed by a previous `vite preview` on this origin would keep serving
// stale bytes — unregister any so the dev server always wins. The production
// registration is owned by the framework's `usePwaUpdate` (workbox-window) in
// `App.tsx`, against the worker `pwa-plugin.ts` emits.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((reg) => void reg.unregister()));
}

// Zoom belongs to the canvas. WebKit fires its own `gesture*` events for a
// pinch and zooms the whole page on them, ignoring the viewport meta's
// `user-scalable=no` in an ordinary iOS Safari tab — so a pinch meant for the
// drawing would scale the app chrome instead. Swallowing them app-wide leaves
// `PaintCanvas` (which pinches from pointer events, not these) as the only
// thing that zooms. Non-passive, or `preventDefault` is ignored.
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), {
    passive: false,
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

// Trivial path-based switch. The build emits `dist/privacy/index.html` (see the
// `emitPrivacyAlias` plugin in `vite.config.ts`) so GitHub Pages serves this
// same SPA at `/privacy/`, and this check decides which page to mount. Deploy
// slots nest it one segment deeper (`/preview/privacy/`), which the suffix
// check matches too. The policy page is lazily imported so it never rides in
// the app's own bundle — and vice versa.
const isPrivacy = window.location.pathname
  .replace(/\/$/, "")
  .endsWith("/privacy");

// Preact's own `render` mounts straight into the container — there is no root
// object to create, and no `StrictMode` (Preact has no double-invoking dev
// mode, so `preact/compat` only aliases it to a plain `Fragment`).
function loadPage() {
  if (isPrivacy) {
    return import("./app/PrivacyPage.tsx").then((m) => m.PrivacyPage);
  }
  return Promise.resolve(App);
}

// The drawings live in IndexedDB (see `app/docDb.ts`), which is asynchronous,
// while the store that reads them is not. Bridging that is one await here: pull
// the namespace the app opens on into the store's cache *before* the first
// render, so the canvas paints the real document rather than a blank page that
// fills in a frame later. Only the active namespace is read — the others are
// fetched if and when they are switched to, and a sketchbook full of photos is
// not something to load for a session that never opens it.
//
// It resolves even when there is no database to read (a Firefox private window,
// a locked-down profile): `hydrateActiveDoc` falls back and never rejects, so a
// browser that refuses storage still gets an app.
//
// Statically imported rather than behind an `import()`: `App` is in the entry
// chunk, and it reaches `docDb` through the store either way, so deferring this
// one would only add a round trip to first paint. The policy page skips the
// read instead — it has no drawings to show.
function bootDocument(): Promise<unknown> {
  return isPrivacy ? Promise.resolve(null) : hydrateActiveDoc();
}

void Promise.all([loadPage(), bootDocument()]).then(([Page]) => {
  render(
    <LanguageRoot>
      <Page />
    </LanguageRoot>,
    root,
  );
});
