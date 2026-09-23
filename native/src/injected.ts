// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCRIPT THE WRAPPER INJECTS INTO THE PAGE TO KEEP THE NATIVE CHROME IN
// STEP WITH IT.
//
// The web app is shipped unchanged — nothing in `src/` knows it is running
// inside a native shell, and that is the whole point of a thin wrapper. So
// everything native needs from the page is read from the *outside*, by this
// script, over `window.ReactNativeWebView.postMessage`. For this wrapper that
// is one thing only: the resolved theme colours, so the status bar and the
// safe-area bands match whichever preset the reader picked rather than
// guessing.
//
// Nothing about a drawing is read here, and nothing is stored. The only other
// script the wrapper injects is the iCloud provider (`icloudBridge.ts`), which
// carries the document the app itself asks it to carry and nothing else.
//
// It also unregisters the service worker (see `SW_TEARDOWN`).
//
// This file exports STRINGS, not behaviour: `react-native-webview` takes the
// script as source text. Keep it dependency-free ES5-ish — it runs in the
// page, not in Metro's bundle, so nothing here is transpiled or polyfilled.

/** The message channel. Namespaced so a stray `postMessage` from the page (or
 *  from a future framework feature) is never mistaken for a report. */
export const REPORT_TYPE = "paint-native/report";

/** How long a burst of theme changes is allowed to settle before a report goes
 *  out. The theme engine repaints several custom properties in one frame, so
 *  reporting on each would set the same colour three times. */
const REPORT_DEBOUNCE_MS = 300;

/**
 * Take the service worker out of the picture, once, at startup.
 *
 * The wrapper serves the app off local disk, so the worker's offline cache
 * buys nothing here — and it actively hurts: the origin is a fixed
 * `http://localhost:<port>`, so a worker registered by version N of the app
 * keeps answering from its precache after a store update has already unpacked
 * version N+1 into the webroot. The visible symptom is an App Store update
 * that changes nothing until the app is deleted and reinstalled.
 *
 * Everything is guarded: an older WebView with no `caches` or no
 * `serviceWorker` simply skips it.
 */
const SW_TEARDOWN = `
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.unregister(); });
      }).catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) { caches.delete(key); });
      }).catch(function () {});
    }
  } catch (e) {}
`;

/**
 * The script injected BEFORE the page loads.
 *
 * Only the service-worker teardown goes here, and it has to: a worker that has
 * already claimed the page is answering fetches by the time the document
 * fires `load`, so unregistering it after the fact leaves this launch on the
 * stale bundle. Reporting waits for the page, since there is no theme to read
 * until the app has mounted.
 */
export const BEFORE_LOAD_SCRIPT = `(function () {${SW_TEARDOWN}})(); true;`;

/**
 * The script injected once the page has loaded.
 *
 * Reports immediately, then whenever the document element's attributes change
 * (which is how the theme engine repaints), and whenever the page becomes
 * visible again — the reader may have flipped the system appearance while the
 * app was in the background.
 */
export const AFTER_LOAD_SCRIPT = `(function () {
  if (window.__paintNativeReporter) return;
  window.__paintNativeReporter = true;

  function colours() {
    try {
      var style = getComputedStyle(document.documentElement);
      var read = function (name) { return (style.getPropertyValue(name) || "").trim(); };
      return {
        background: read("--page-bg"),
        foreground: read("--fg"),
        muted: read("--muted"),
        accent: read("--accent")
      };
    } catch (e) { return {}; }
  }

  function report() {
    try {
      if (!window.ReactNativeWebView) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: ${JSON.stringify(REPORT_TYPE)},
        theme: colours()
      }));
    } catch (e) {}
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; report(); }, ${REPORT_DEBOUNCE_MS});
  }

  try {
    // The theme engine works by setting attributes and custom properties on
    // <html>; observing that element is how we hear about a preset change
    // without the page having to tell us.
    var observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true });
  } catch (e) {}

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) schedule();
  });

  // The theme engine paints on the frame after mount, so the very first read
  // can land on an unstyled document — report once now and once shortly after.
  report();
  setTimeout(report, 400);
})(); true;`;

/** Narrow an arbitrary parsed `postMessage` body to a report. */
export function isReport(value: unknown): value is {
  type: string;
  theme: Record<string, string>;
} {
  const message = value as { type?: unknown; theme?: unknown } | null;
  return (
    typeof message === "object" &&
    message !== null &&
    message.type === REPORT_TYPE &&
    typeof message.theme === "object" &&
    message.theme !== null
  );
}
