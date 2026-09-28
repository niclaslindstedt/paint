// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import { appDisplayName } from "./brand.ts";
import { appPwa } from "./pwa-plugin.ts";

// The production origin. The privacy alias points its Open Graph URL here
// regardless of which deploy slot built it, so a shared link names the `/`
// release.
const SITE_URL = "https://paint.niclaslindstedt.se";

// The <head> copy for the standalone privacy page the SPA mounts by pathname
// (see `src/main.tsx`). The homepage's head lives statically in `index.html`;
// this carries its own title, description, and social-card copy,
// spliced into a copy of the built shell by the alias plugin below.
const PRIVACY_ROUTE = {
  path: "/privacy/",
  title: "Privacy — Paint",
  description:
    "Paint privacy: local-first by default — no account, no cookies, no " +
    "analytics, no tracking. Optional Dropbox sync only when " +
    "you connect it.",
  ogType: "article",
} as const;

// HTML-escape a string destined for an attribute value or text node.
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Rewrite the per-route <head> signals in a copy of the built `index.html`.
// The homepage shell is the single source of the tag *shape* (asset links,
// icons, the robots noindex); this only swaps the title / description / OG /
// Twitter copy so the alias reads as its own page. Throws loudly if an expected
// tag is missing rather than silently shipping a page that inherits the
// homepage's title — a signal that `index.html`'s head was restructured and
// this splice needs to follow.
function splicePrivacyHead(html: string, website: boolean): string {
  const url = `${SITE_URL}${PRIVACY_ROUTE.path}`;
  const title = escapeHtml(PRIVACY_ROUTE.title);
  const desc = escapeHtml(PRIVACY_ROUTE.description);

  const sub = (re: RegExp, replacement: string, label: string): void => {
    if (!re.test(html)) {
      throw new Error(
        `privacy-alias: could not splice ${label} for ${PRIVACY_ROUTE.path} — ` +
          `did index.html's <head> change shape?`,
      );
    }
    html = html.replace(re, replacement);
  };

  sub(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`, "title");
  sub(
    /(<meta\s+name="description"\s+content=")[\s\S]*?("\s*\/>)/,
    `$1${desc}$2`,
    "description",
  );
  sub(
    /(<meta property="og:type" content=")[^"]*("\s*\/>)/,
    `$1${PRIVACY_ROUTE.ogType}$2`,
    "og:type",
  );
  sub(
    /(<meta property="og:title" content=")[\s\S]*?("\s*\/>)/,
    `$1${title}$2`,
    "og:title",
  );
  sub(
    /(<meta\s+property="og:description"\s+content=")[\s\S]*?("\s*\/>)/,
    `$1${desc}$2`,
    "og:description",
  );
  // An app build has no og:url to splice: `websiteOnly` took it out.
  if (website) {
    sub(
      /(<meta property="og:url" content=")[^"]*("\s*\/>)/,
      `$1${url}$2`,
      "og:url",
    );
  }
  sub(
    /(<meta\s+name="twitter:title"\s+content=")[\s\S]*?("\s*\/>)/,
    `$1${title}$2`,
    "twitter:title",
  );
  sub(
    /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?("\s*\/>)/,
    `$1${desc}$2`,
    "twitter:description",
  );
  return html;
}

// Mirror the built `index.html` to `privacy/index.html` so GitHub Pages serves
// the SPA from the clean URL `/privacy/` (and `/preview/privacy/`, …).
// `src/main.tsx` reads `location.pathname` and mounts the policy page there;
// the copied HTML loads the same origin-absolute hashed asset URLs, so no
// rewrite is needed — only the <head> copy is re-spliced. Runs late
// (`enforce: "post"`) so the PWA plugin's manifest / icon tags are already
// baked into the shell we copy, and after `appPwa` so the alias page stays out
// of its precache (the service worker's shell fallback already covers it).
function emitPrivacyAlias(website: boolean): Plugin {
  return {
    name: "emit-privacy-alias",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index && index.type === "asset") {
        this.emitFile({
          type: "asset",
          fileName: "privacy/index.html",
          source: splicePrivacyHead(String(index.source), website),
        });
      }
    },
  };
}

// The base path is injected by the deploy workflow via VITE_BASE, one per
// release channel on the custom domain (paint.niclaslindstedt.se): the released
// app at `/`, the rolling main build at `/preview/`, and per-branch builds at
// `/branch/`. Defaults to `/` for local dev and preview builds.
const base = process.env.VITE_BASE ?? "/";

// Sibling release channels that live *under* this build's base and must be
// disowned by its service worker (see pwa-plugin.ts `ignorePaths`). Only the
// root release sets this — comma-separated absolute paths, e.g.
// `/preview/,/branch/`.
const ignorePaths = (process.env.VITE_PWA_IGNORE_PATHS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// A build for the DESKTOP SHELL (tauri/), set by `tauri/scripts/bundle-web.mjs`.
//
// It changes exactly one thing, and it is about the medium rather than the
// audience: the service worker is left out (`serviceWorker: false` below —
// everything else `appPwa` writes into the `<head>` still applies). A desktop
// build has no deployment to discover an update from — a new version arrives
// as a new binary — so a worker here would precache a copy of files already on
// local disk and then serve the page from ITS copy, which is how a shell whose
// binary shipped a new site goes on showing the old one. `__SHELL_BUILD__`
// carries the same fact into the app, where it switches off the update prompt
// that has nothing left to prompt about (see `src/App.tsx`) — and, with
// `__NATIVE_BUILD__` below, leaves out the Donate row, which only the website
// carries.
const shellBuild = process.env.VITE_SHELL_BUILD === "on";

// A build for the PHONE WRAPPER (native/), set by `native/scripts/bundle-web.mjs`.
//
// It changes exactly one thing, and it is about the channel rather than the
// medium: the sidebar's Donate row is left out (`src/app/donate.ts`). With
// `__SHELL_BUILD__` it marks every build that is not the website — a payment
// link outside Apple's is an App Store rejection (guideline 3.1.1), and the
// listings promise nothing is sold. Both are compile-time constants, so the
// row and its URL are folded out of those bundles rather than hidden.
const nativeBuild = process.env.VITE_NATIVE_BUILD === "on";

// Together the two flags also keep every link back to the source out of the
// apps (owner decision D17): the About dropdown's Source row, the privacy
// page's issue tracker and security advisories, and — through `websiteOnly`
// below — the web edition's address.
const appBuild = shellBuild || nativeBuild;

// What the app calls itself. An app build takes its store listing's name from
// `APP_DISPLAY_NAME` — the variable that also names the phone app under its
// icon (`native/identifiers.js`), and that `native/scripts/bundle-web.mjs`
// passes through — so the privacy page and the page title say the name the
// store shows. The website stays `APP_NAME` whatever the environment holds.
const appName = appDisplayName(appBuild, process.env.APP_DISPLAY_NAME);

// What only the website carries, left out of an app build (D17): the Open
// Graph and Twitter tags in `index.html` that point at the web edition's
// address, the two public files that exist for them and for Pages — the share
// card (`og.png`) and the custom-domain file (`CNAME`) — and, in the markdown
// the What's new dialog renders (the CHANGELOG and `docs/features/`), any link
// to the GitHub repository, which is left as its plain text. The bundle
// scripts refuse a webroot that still names the site's owner.
function websiteOnly(): Plugin {
  let outDir = "";
  return {
    name: "website-only",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transform(code, id) {
      if (!/\.md(\?|$)/.test(id)) return null;
      const unlinked = code.replace(
        /\[([^\]]*)\]\(https?:\/\/github\.com\/niclaslindstedt\b[^)]*\)/g,
        "$1",
      );
      return { code: unlinked, map: null };
    },
    transformIndexHtml(html) {
      return html.replace(
        /[ \t]*<meta\b[^>]*\bcontent="https?:\/\/[^"]*"[^>]*>\n?/g,
        "",
      );
    },
    closeBundle() {
      for (const file of ["CNAME", "og.png"]) {
        rmSync(resolve(outDir, file), { force: true });
      }
    },
  };
}

// Build identity for the Developer tab's "Build" grid. The commit hash is the
// deploying SHA in CI, falling back to the local working tree's HEAD so a
// `make build` still stamps a real hash; "unknown" only if git isn't reachable.
const commit =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
      }).trim();
    } catch {
      return "unknown";
    }
  })();
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? "dev";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The app's released version, the base of the About dropdown's build label.
const appVersion = (
  JSON.parse(readFileSync(here("./package.json"), "utf8")) as {
    version: string;
  }
).version;

// The build identifier shown in the side menu's About dropdown. Shape:
// `<version>[.<run>][-<slot>][+<commit>]` — `<run>` is the CI run number,
// `<slot>` is `pre` for the `/preview/` deploy and `br` for `/branch/`
// (omitted for the production `/` build), and `<commit>` is the short commit
// hash as semver build metadata. A local build collapses to just `<version>`.
const buildSlot =
  base === "/preview/" ? "pre" : base === "/branch/" ? "br" : "";
const buildLabel =
  appVersion +
  (process.env.GITHUB_RUN_NUMBER ? `.${process.env.GITHUB_RUN_NUMBER}` : "") +
  (buildSlot ? `-${buildSlot}` : "") +
  (process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : "");

// The label the PWA update toast shows for the incoming build. It also lands in
// the generated `sw.js`, so the worker's bytes change every deploy and the
// browser reliably discovers the update; a CI build's label carries the run
// number and commit, so it is unique per deploy. A local build's label
// collapses to just `<version>`, so append a timestamp there to keep the
// per-build uniqueness the worker relies on.
const version = process.env.GITHUB_SHA
  ? buildLabel
  : `${buildLabel}+${new Date().toISOString()}`;

export default defineConfig({
  base,
  // No size budgets, by owner decision: this only keeps Vite's warning quiet.
  build: { chunkSizeWarningLimit: 100_000 },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __SHELL_BUILD__: JSON.stringify(shellBuild),
    __NATIVE_BUILD__: JSON.stringify(nativeBuild),
    __APP_NAME__: JSON.stringify(appName),
  },
  // `appPwa` only applies on build, so dev keeps registering no worker (the app
  // passes `enabled: !import.meta.env.DEV` to `usePwaUpdate`).
  //
  // The runtime is Preact, not React: `@preact/preset-vite` compiles JSX
  // against `preact/jsx-runtime` and aliases `react` / `react-dom` (and the
  // `/jsx-runtime` + `/client` subpaths) onto `preact/compat`, so both this
  // app's `import … from "react"` lines and the pre-built framework chunks —
  // which import `react`, `react-dom`, and `react/jsx-runtime` as externals —
  // resolve to Preact. See `docs/architecture.md`.
  plugins: [
    preact(),
    tailwindcss(),
    appPwa({
      base,
      version,
      ignorePaths,
      serviceWorker: !shellBuild,
      name: appName,
    }),
    ...(appBuild ? [websiteOnly()] : []),
    emitPrivacyAlias(!appBuild),
  ],
});
