// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTH-SESSION BRIDGE: how the page signs in to a cloud provider from
// inside the app.
//
// The page is served in a WebView from a loopback origin, and its OAuth
// redirect flow cannot finish there. The providers refuse to show consent in
// an embedded WebView, so `App.tsx` sends every off-origin page to the system
// browser — and the provider then redirects THAT browser to
// `http://localhost:8261…`: an origin it does not have registered, in a
// browser that does not hold the PKCE verifier the page stashed in its own
// `sessionStorage`. Signing in to Dropbox could never complete.
//
// The platform's own answer is an AUTHENTICATION SESSION
// (`ASWebAuthenticationSession` on iOS, a Custom Tab on Android): a browser
// sheet over the app that closes the moment the provider redirects to a URI
// the app claims, and hands that URI back. This wrapper offers one to the
// page as a CAPABILITY — `window.__ossAuthSession`, the seam the framework's
// storage module looks for (`getAuthSessionHost` in
// `@niclaslindstedt/oss-framework/storage`). A browser has no such host and
// keeps its redirect flow; the desktop shell has none and keeps its loopback
// one. The page never asks what it is running inside.
//
// The wrapper decides nothing about the sign-in. It opens a URL and hands back
// where the sheet ended: the PKCE challenge, the `state` check and the token
// exchange all stay in the page, which is also the only place the tokens ever
// exist.
//
// Same shape as `icloudBridge.ts`: this file exports STRINGS for the page
// (dependency-free, ES5-ish — nothing in them is transpiled) plus the pure
// narrowing and settling helpers, and it is exercised from the root test
// suite, so it imports nothing that reaches `expo`.

import { escapeForScript } from "./scriptText";

/** The message the page posts to ask for a session. Namespaced like the theme
 *  report and the iCloud requests so the three are never confused. */
export const AUTH_SESSION_REQUEST_TYPE = "paint-native/auth-session-request";

/** Where the provider installs itself. The FRAMEWORK's name, not this app's
 *  (`AUTH_SESSION_HOST_PROPERTY`): the page-side flow lives in
 *  oss-framework, so a rename here is not an error — it is a Dropbox button
 *  that goes back to opening Safari. `tests/native_auth_session_test.ts` pins
 *  the two together. */
const HOST_PROPERTY = "__ossAuthSession";

/** The event the provider announces itself with (`AUTH_SESSION_HOST_EVENT`). */
const HOST_EVENT = "oss:auth-session-host";

/** The resolver the settling script calls. App-private, never read by the
 *  framework. */
const RESOLVE_PROPERTY = "__ossAuthSessionResolve";

/** The path under the app's URL scheme that the provider redirects to. */
const REDIRECT_PATH = "oauth";

/**
 * The redirect URI the wrapper catches: `<scheme>://oauth`, where `<scheme>`
 * is `app.config.js`'s `scheme` (the bundle id, `se.agilator.paint` in the
 * store build). This exact string is what
 * the Dropbox app's App Console must list under Redirect URIs.
 */
export function redirectUriFor(scheme: string): string {
  return `${scheme}://${REDIRECT_PATH}`;
}

/** What one request asks for: open `url`, report where the sheet ended. */
export type AuthSessionRequest = {
  type: string;
  /** Correlates the answer with the promise waiting for it. */
  id: string;
  /** The provider's authorization URL. */
  url: string;
};

/** The answer. `value` is the URL the provider redirected to, or null when
 *  the reader closed the sheet. A failure crosses as data, because the
 *  channel carries strings; the page-side script turns it back into a thrown
 *  `Error`. */
export type AuthSessionResult =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * The script that installs the provider, for the redirect URI this build
 * claims.
 *
 * Injected after the page has loaded, and guarded against a second injection
 * (a reload re-runs it). Nothing times out: a sheet the reader leaves open
 * leaves the sign-in pending, which is what it is.
 */
export function authSessionScript(redirectUri: string): string {
  return `(function () {
  if (window.${HOST_PROPERTY}) return;

  var pending = {};
  var next = 0;

  window.${RESOLVE_PROPERTY} = function (id, result) {
    var entry = pending[id];
    if (!entry) return;
    delete pending[id];
    if (result && result.ok) entry.resolve(result.value === undefined ? null : result.value);
    else entry.reject(new Error((result && result.error) || "Sign-in failed."));
  };

  window.${HOST_PROPERTY} = {
    version: 1,
    redirectUri: ${escapeForScript(redirectUri)},
    open: function (url) {
      return new Promise(function (resolve, reject) {
        var id = "a" + (next += 1);
        pending[id] = { resolve: resolve, reject: reject };
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: ${JSON.stringify(AUTH_SESSION_REQUEST_TYPE)},
            id: id,
            url: String(url)
          }));
        } catch (e) {
          delete pending[id];
          reject(new Error("The sign-in bridge is unavailable."));
        }
      });
    }
  };

  try {
    window.dispatchEvent(new Event(${JSON.stringify(HOST_EVENT)}));
  } catch (e) {}
})(); true;`;
}

/**
 * Narrow an arbitrary parsed `postMessage` body to a session request.
 *
 * Only an `https:` URL is accepted. The sheet is a real browser the reader
 * trusts with a password, and the one thing it is for is a provider's consent
 * page — not a `javascript:` URL, not a `file:` one, and not a page on the
 * app's own loopback origin dressed up as one.
 */
export function isAuthSessionRequest(
  value: unknown,
): value is AuthSessionRequest {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<AuthSessionRequest>;
  if (message.type !== AUTH_SESSION_REQUEST_TYPE) return false;
  if (typeof message.id !== "string" || message.id === "") return false;
  if (typeof message.url !== "string") return false;
  return /^https:\/\/[^/?#\s]+/i.test(message.url);
}

/** The line of JavaScript that settles one pending request. The answer is
 *  embedded as a JSON string and parsed in the page — the callback URL is
 *  provider-controlled text, and text is what breaks out of a literal. */
export function authSessionResolveScript(
  id: string,
  result: AuthSessionResult,
): string {
  const payload = escapeForScript(JSON.stringify({ id, result }));
  return `(function () {
    try {
      var answer = JSON.parse(${payload});
      if (window.${RESOLVE_PROPERTY}) {
        window.${RESOLVE_PROPERTY}(answer.id, answer.result);
      }
    } catch (e) {}
  })(); true;`;
}
