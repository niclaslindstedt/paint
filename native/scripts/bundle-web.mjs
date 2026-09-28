// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the web app and packs its `dist/` into one asset —
// `native/assets/webroot.zip` — that the wrapper bundles, unpacks on first
// launch and serves over a loopback HTTP server (src/local-server.ts). That is
// what makes the app self-contained: the sketchbook runs entirely
// on-device, and changes only when a new build ships to the store.
//
// The web build is `npm run build` at the repo root — base `/`, which is
// exactly what a localhost origin wants — with two flags (`WEB_BUILD_FLAGS` in
// `web-build.mts`). `VITE_NATIVE_BUILD=on` is about the channel: it compiles
// out the sidebar's Donate row, which only the website may carry (App Store
// guideline 3.1.1; see `src/app/donate.ts`), and every link back to the
// source, which only the website carries either (owner decision D17): the
// About dropdown's Source row, the privacy page's issue tracker, the web
// edition's address. `VITE_SHELL_BUILD=on` is about the medium, and is the
// desktop shell's flag: the site ships inside the binary, so it has no service
// worker and no in-app update prompt — a new version arrives from the store.
// The build is also handed the store listing's name (`APP_DISPLAY_NAME`, from
// the environment or `native/.env`), so the app's own pages say the name the
// phone shows under the icon (`listingName` in `web-build.mts`).
// Nothing else in `src/` changes for the app.
// If the wrapper ever needs the web app to behave differently in some other
// way, that is a sign it has stopped being thin.
//
// The flags are build-time, so `--skip-build` re-zips whatever the last build
// left in `dist/` — and a website build there carries those links and the
// worker. The zip is refused when one is found in it (`assertNoDonateLink`,
// `assertNoSourceLink`, `assertNoUpdateCycle`).
//
// Usage:
//   node scripts/bundle-web.mjs                 # build the site, then zip it
//   node scripts/bundle-web.mjs --skip-build    # re-zip an existing dist/
//   node scripts/bundle-web.mjs --profile production
//
// `--profile` is accepted (and echoed) so the release scripts and the CI
// workflow can pass the EAS profile through uniformly. It does not change the
// build today — the web app has no profile-dependent output — but the seam is
// where a "strip the developer menu from store builds" knob would land, and
// having the plumbing already correct is cheaper than retrofitting it.
//
// The zip is a build artifact (gitignored). Generate it before `eas build`;
// the root `.easignore` is what keeps it in the EAS upload despite that.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

import { updateMachinery, webBuildEnv } from "./web-build.mts";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const DIST_DIR = join(REPO_DIR, "dist");
const OUT_ZIP = join(APP_DIR, "assets", "webroot.zip");
const DOTENV = join(APP_DIR, ".env");
const WINDOWS = process.platform === "win32";
const NPM = WINDOWS ? "npm.cmd" : "npm";

const skipBuild = process.argv.includes("--skip-build");
const profileArg = process.argv.indexOf("--profile");
const profile =
  (profileArg >= 0 ? process.argv[profileArg + 1] : undefined) ??
  process.env.EAS_BUILD_PROFILE ??
  "preview";

if (!skipBuild) {
  const env = webBuildEnv(
    process.env,
    existsSync(DOTENV) ? readFileSync(DOTENV, "utf8") : undefined,
  );
  console.log(
    `• building the web app (npm run build) — profile ${profile}, ` +
      `named ${env.APP_DISPLAY_NAME ?? "Paint (no APP_DISPLAY_NAME)"}…`,
  );
  execFileSync(NPM, ["run", "build"], {
    cwd: REPO_DIR,
    stdio: "inherit",
    // npm on Windows is a batch shim, which Node cannot execute directly.
    shell: WINDOWS,
    env,
  });
}

/** Collect `dist/` into the flat `{ "index.html": bytes }` shape fflate wants,
 *  with forward-slash paths relative to the dist root. */
function collect(dir, files = {}) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      collect(abs, files);
    } else {
      files[relative(DIST_DIR, abs).split("\\").join("/")] = new Uint8Array(
        readFileSync(abs),
      );
    }
  }
  return files;
}

let files;
try {
  files = collect(DIST_DIR);
} catch (error) {
  console.error(
    `\n✗ could not read ${DIST_DIR} — build the web app first ` +
      `(drop --skip-build, or run 'npm run build' at the repo root).\n`,
  );
  throw error;
}

const count = Object.keys(files).length;
if (count === 0 || !files["index.html"]) {
  throw new Error(
    `dist/ has no index.html (${count} files) — the web build looks empty.`,
  );
}

/** Refuse a webroot that carries a Donate link: the phone app must not have
 *  one (App Store guideline 3.1.1), and a `dist/` left by a website build —
 *  which `--skip-build` would re-zip — does. Looks for the GitHub Sponsors
 *  fallback and for whatever `VITE_DONATE_URL` this shell has set. */
function assertNoDonateLink(files) {
  const needles = [
    "github.com/sponsors",
    process.env.VITE_DONATE_URL?.trim(),
  ].filter(Boolean);
  const decoder = new TextDecoder();
  for (const [path, bytes] of Object.entries(files)) {
    if (!/\.(html|js|mjs|css|json|webmanifest|txt|xml)$/.test(path)) continue;
    const text = decoder.decode(bytes);
    const hit = needles.find((needle) => text.includes(needle));
    if (hit) {
      throw new Error(
        `dist/${path} carries a Donate link (${hit}) — the phone app must ` +
          `not. Rebuild through this script (drop --skip-build) so ` +
          `VITE_NATIVE_BUILD=on compiles it out.`,
      );
    }
  }
}

assertNoDonateLink(files);

/** Refuse a webroot that links back to the source (owner decision D17): no
 *  GitHub repository, issues, releases or sponsor link, and not the author's
 *  handle anywhere — web-edition address, package name or meta tag included.
 *  The website keeps those; the app has none. Every file but a binary asset is
 *  read, extensionless ones too, so nothing slips past on its suffix. */
const BINARY = /\.(png|ico|jpe?g|webp|gif|woff2?|ttf|otf)$/i;
function assertNoSourceLink(files) {
  const decoder = new TextDecoder();
  for (const [path, bytes] of Object.entries(files)) {
    if (BINARY.test(path)) continue;
    if (decoder.decode(bytes).toLowerCase().includes("niclaslindstedt")) {
      throw new Error(
        `dist/${path} carries a link back to the source ("niclaslindstedt") — ` +
          `the phone app must not. Rebuild through this script (drop ` +
          `--skip-build) so VITE_NATIVE_BUILD=on compiles it out.`,
      );
    }
  }
}

assertNoSourceLink(files);

/** Refuse a webroot that carries the website's update cycle — the service
 *  worker, the `version.json` it polls, its precache list. In the app a worker
 *  would serve the page from its own cache of files already on the device, so
 *  an app updated from the store could go on showing the old site, and the
 *  update prompt would announce a version nobody can install from inside it.
 *  `VITE_SHELL_BUILD=on` is what leaves them out; this is the check that the
 *  build honoured it. */
function assertNoUpdateCycle(files) {
  const found = updateMachinery(Object.keys(files));
  if (found.length) {
    throw new Error(
      `dist/ carries the website's update cycle (${found.join(", ")}) — the ` +
        `phone app must not. Rebuild through this script (drop --skip-build) ` +
        `so VITE_SHELL_BUILD=on leaves it out.`,
    );
  }
}

assertNoUpdateCycle(files);

// Deterministic zip: every entry pinned to the ZIP epoch (1980-01-01), so the
// artifact is reproducible instead of drifting with the clock.
const zipped = zipSync(files, { mtime: new Date("1980-01-01T00:00:00Z") });
mkdirSync(dirname(OUT_ZIP), { recursive: true });
writeFileSync(OUT_ZIP, zipped);

console.log(
  `✓ wrote ${OUT_ZIP} — ${count} files, ${(zipped.length / 1024).toFixed(0)} KB`,
);
