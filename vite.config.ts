// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import { appPwa } from "./pwa-plugin.ts";

// The canonical production origin. The privacy alias points its canonical /
// Open Graph URLs here regardless of which deploy slot built it, since the `/`
// release is the one search engines should index.
const SITE_URL = "https://paint.niclaslindstedt.se";

// The <head> copy for the standalone privacy page the SPA mounts by pathname
// (see `src/main.tsx`). The homepage's SEO lives statically in `index.html`;
// this carries its own title, description, canonical, and social-card copy,
// spliced into a copy of the built shell by the alias plugin below.
const PRIVACY_ROUTE = {
  path: "/privacy/",
  title: "Privacy — Paint",
  description:
    "Paint privacy: local-first by default — no account, no cookies, no " +
    "analytics, no tracking. Optional Dropbox / Google Drive sync only when " +
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
// icons, JSON-LD); this only swaps the title / description / canonical / OG /
// Twitter copy so the alias reads as its own page. Throws loudly if an expected
// tag is missing rather than silently shipping a page that inherits the
// homepage's title — a signal that `index.html`'s head was restructured and
// this splice needs to follow.
function splicePrivacySeo(html: string): string {
  const canonical = `${SITE_URL}${PRIVACY_ROUTE.path}`;
  const title = escapeHtml(PRIVACY_ROUTE.title);
  const desc = escapeHtml(PRIVACY_ROUTE.description);

  const sub = (re: RegExp, replacement: string, label: string): void => {
    if (!re.test(html)) {
      throw new Error(
        `seo-alias: could not splice ${label} for ${PRIVACY_ROUTE.path} — ` +
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
    /(<link rel="canonical" href=")[^"]*("\s*\/>)/,
    `$1${canonical}$2`,
    "canonical",
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
  sub(
    /(<meta property="og:url" content=")[^"]*("\s*\/>)/,
    `$1${canonical}$2`,
    "og:url",
  );
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
function emitPrivacyAlias(): Plugin {
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
          source: splicePrivacySeo(String(index.source)),
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
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
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
    appPwa({ base, version, ignorePaths }),
    emitPrivacyAlias(),
  ],
});
