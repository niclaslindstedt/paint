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

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

// Preact's own `render` mounts straight into the container — there is no root
// object to create, and no `StrictMode` (Preact has no double-invoking dev
// mode, so `preact/compat` only aliases it to a plain `Fragment`).
render(
  <LanguageRoot>
    <App />
  </LanguageRoot>,
  root,
);
