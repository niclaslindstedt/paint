// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the phone wrapper's web build is, as data `bundle-web.mjs` acts on and
// `tests/native_bundle_test.ts` pins. Kept apart from the script because the
// script builds and zips when it is imported, and a rule worth testing should
// not need a build to test it.

import { parseEnv } from "node:util";

/** The build flags the phone app's copy of the site is made with.
 *
 *  `VITE_NATIVE_BUILD` is the channel: a store build, so no Donate row and no
 *  link back to the source. `VITE_SHELL_BUILD` is the medium: the site ships
 *  inside a binary, so there is no deploy for a service worker to discover and
 *  no update for the in-app prompt to announce — a new version arrives as a new
 *  build from the store. It is the flag the desktop shell builds with, and the
 *  phone app is the same shape of thing: a worker in the WebView would precache
 *  files already on the device and poll a `version.json` that never changes. */
export const WEB_BUILD_FLAGS = {
  VITE_NATIVE_BUILD: "on",
  VITE_SHELL_BUILD: "on",
} as const;

/** The store listing's name the site is built under — the name the app shows
 *  in its own pages, which has to be the one under its icon and on its store
 *  page. That is `APP_DISPLAY_NAME`, the variable `identifiers.js` names the
 *  binary from: CI passes the repository secret, and a local build reads it
 *  from `native/.env` (its text, `dotenv`) the way `expo` does for the config.
 *  Unset in both, it is `undefined` and the site keeps the project's own name —
 *  as `identifiers.js` keeps it under the icon, so the two never disagree. */
export function listingName(
  env: Readonly<Record<string, string | undefined>>,
  dotenv?: string,
): string | undefined {
  const fromEnv = env.APP_DISPLAY_NAME?.trim();
  if (fromEnv) return fromEnv;
  if (!dotenv) return undefined;
  return parseEnv(dotenv).APP_DISPLAY_NAME?.trim() || undefined;
}

/** The environment the web build runs under: this process's, with the flags
 *  above on top so a stray value in the shell cannot switch them off, and the
 *  listing name when there is one (`listingName`). */
export function webBuildEnv(
  env: Readonly<Record<string, string | undefined>>,
  dotenv?: string,
): Record<string, string | undefined> {
  const name = listingName(env, dotenv);
  return {
    ...env,
    ...WEB_BUILD_FLAGS,
    ...(name ? { APP_DISPLAY_NAME: name } : {}),
  };
}

/** The files that exist only to drive a website's update cycle: the worker,
 *  the version it polls and the precache list its progress bar counts. The
 *  shell build emits none of them (`appPwa`'s `serviceWorker: false`). */
const UPDATE_FILES = new Set([
  "sw.js",
  "sw.mjs",
  "version.json",
  "precache-manifest.json",
]);

/** Which of a webroot's paths (forward-slash, relative to its root) belong to
 *  the update cycle — empty for a build made through `bundle-web.mjs`. Only the
 *  root is looked at: that is where the worker has to be to control the page. */
export function updateMachinery(paths: Iterable<string>): string[] {
  return [...paths].filter((path) => UPDATE_FILES.has(path)).sort();
}
