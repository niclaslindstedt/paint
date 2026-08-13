// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { statSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from "vite";

import { cacheIdForBase } from "./src/app/pwa.ts";

// Hand-rolls the app's service worker at build time so the deployed app is an
// installable, self-updating PWA. We deliberately avoid `vite-plugin-pwa` /
// Workbox: the framework's `usePwaUpdate` hook only needs three files and one
// cache-naming convention, which is cheaper to emit by hand than to pull a
// Workbox toolchain in for.
//
// What the hook expects, and what we therefore emit:
//   - `${base}sw.js`                  a "prompt to update" worker (installs,
//                                     parks in `waiting`, never auto-skips)
//   - `${base}version.json`           `{ version }` shown in the toast
//   - `${base}precache-manifest.json` `{ totalBytes, assets }` driving the fill
//   - a Cache Storage entry named `<cacheId>-precache`

type AppPwaOptions = {
  // The bundler base (`/` — served from the custom domain root). Drives the SW
  // scope, the emitted file URLs, and — via `cacheIdForBase` — the precache
  // name.
  base: string;
  // Label shown in the "a new version is ready" toast. Embedding it in the SW
  // also guarantees the worker's bytes differ between deploys even when no
  // asset hash changed.
  version: string;
  // Absolute path prefixes this worker must disown — the deploy paths of the
  // *other* release channels that live under this one. The root release at `/`
  // shares its SW scope with the `/preview/` and `/branch/` channels (a scope
  // is a path prefix, so the root worker would otherwise claim their
  // navigations before their own worker installs, serving the root shell in
  // place of the sibling app).
  ignorePaths?: string[];
};

// Public assets we never want in the precache: source maps are dead weight
// offline, and the SEO files are for crawlers, not the app shell.
const PUBLIC_SKIP = new Set([
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "og.png",
  // CNAME is GitHub Pages config, not an app asset. The Pages workflow strips
  // it from every non-root slot (only the root artifact may carry a CNAME), so
  // a precached `${base}CNAME` 404s the service worker's install fetch on
  // `/preview/` and `/branch/` and skews the precache byte total the
  // update-progress fill reports. Keep it out of the precache entirely.
  "CNAME",
]);

// Per-release-channel PWA display name. The three Pages channels share one
// origin, so a channel-specific name installs the preview/branch builds as
// visibly separate home-screen tiles instead of three identical "Paint" icons
// that are impossible to tell apart once installed.
function channelName(base: string): { name: string; short_name: string } {
  if (base === "/preview/")
    return { name: "Paint (preview)", short_name: "Paint pre" };
  if (base === "/branch/")
    return { name: "Paint (branch)", short_name: "Paint br" };
  return {
    name: "Paint — a local-first sketchpad",
    short_name: "Paint",
  };
}

// Build the web app manifest for a given deploy base. Emitted per build rather
// than shipped as a static `public/` file because the install *identity* must
// differ per channel: `id`, `start_url`, and `scope` are resolved relative to
// the *origin* (not the manifest URL) by some engines — notably iOS Safari's
// "Add to Home Screen" — so a relative `"./"` collapses every channel onto the
// root app (installing from `/preview/` silently installs the `/` app). Pinning
// them to the absolute `base` gives each channel an unambiguous identity. Icon
// `src`s are base-qualified for the same reason.
export function buildManifest(base: string): string {
  const { name, short_name } = channelName(base);
  const manifest = {
    name,
    short_name,
    description:
      "A local-first paint PWA for sketching simple concepts: a canvas, pluggable tools you switch on in settings, themes, and optional cloud sync.",
    id: base,
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "any",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    icons: [
      {
        src: `${base}icons/pwa-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}icons/pwa-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}icons/pwa-512-maskable.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

export function buildServiceWorker(
  cacheId: string,
  base: string,
  version: string,
  precache: string[],
  ignorePaths: string[] = [],
): string {
  const cacheName = `${cacheId}-precache`;
  return `// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GENERATED — do not edit. Emitted by pwa-plugin.ts for the Paint PWA.
// A minimal "prompt to update" precaching worker: it installs the build's
// assets, parks in \`waiting\` (never auto-skipWaiting — a silent swap would
// discard an in-progress drawing), and applies on a SKIP_WAITING message from
// the framework's update toast. Build: ${version}
const CACHE = ${JSON.stringify(cacheName)};
const BASE = ${JSON.stringify(base)};
const INDEX = ${JSON.stringify(`${base}index.html`)};
// Sibling release channels nested under BASE that this worker must NOT claim —
// their pages are a different deploy and own their own worker. See ignorePaths.
const IGNORE = ${JSON.stringify(ignorePaths)};
const PRECACHE = ${JSON.stringify(precache)};
const PRECACHE_PATHS = new Set(
  PRECACHE.map((u) => new URL(u, self.location.href).pathname),
);

self.addEventListener("install", (event) => {
  // Populate the precache one entry at a time so the window-side progress
  // poller (usePwaUpdate) watches the fill advance as bytes land. No
  // skipWaiting: park in \`waiting\` until the user accepts the prompt.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of PRECACHE) {
        try {
          await cache.add(new Request(url, { cache: "reload" }));
        } catch {
          // A single asset failing to cache must not abort the whole install.
        }
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Drop precache entries from older builds that are no longer wanted.
      for (const req of await cache.keys()) {
        if (!PRECACHE_PATHS.has(new URL(req.url).pathname)) {
          await cache.delete(req);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// The app-shell navigation handler. Network-first: fetch the freshly-deployed
// shell — bypassing the HTTP cache with \`reload\`, since this worker controls a
// plain browser tab too, so a cache-first shell reads as "the site is stale and
// only private mode is fresh" — refresh the offline copy from it, and fall back
// to the precached shell only when the network is unreachable.
async function navigateFallback(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(new Request(INDEX, { cache: "reload" }));
    if (fresh && fresh.ok) {
      cache.put(INDEX, fresh.clone());
      return fresh;
    }
  } catch {
    // Offline — serve the precached shell below.
  }
  return (await cache.match(INDEX)) || fetch(req).catch(() => cache.match(INDEX));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App-shell navigations: only our own routes get the shell fallback. A
  // navigation into a sibling channel (preview/branch) is disowned so its own
  // worker — not this one — serves it.
  if (req.mode === "navigate") {
    if (!url.pathname.startsWith(BASE)) return;
    if (IGNORE.some((p) => url.pathname.startsWith(p))) return;
    event.respondWith(navigateFallback(req));
    return;
  }

  // Precached assets: cache-first (they are content-hashed, so safe to pin).
  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) || fetch(req);
      })(),
    );
  }
});
`;
}

export function appPwa({
  base,
  version,
  ignorePaths = [],
}: AppPwaOptions): Plugin {
  const cacheId = cacheIdForBase(base);
  let config: ResolvedConfig;

  return {
    name: "app-pwa",
    apply: "build",
    // Run after Vite's own build plugins so the generated `index.html` is
    // already in the bundle when we collect assets for the precache.
    enforce: "post",

    configResolved(resolved) {
      config = resolved;
    },

    // Wire the manifest, theme color, and apple-touch metadata into the shell.
    // Done here (not in index.html) so the hrefs stay base-correct from one
    // source of truth regardless of the configured `base`.
    transformIndexHtml(): HtmlTagDescriptor[] {
      return [
        {
          tag: "link",
          attrs: { rel: "manifest", href: `${base}manifest.webmanifest` },
          injectTo: "head",
        },
        // The raster fallback first: engines that don't honour the SVG favicon
        // (Safari, crawlers) and the implicit /favicon.ico probe pick this up,
        // while modern browsers prefer the typed SVG below.
        {
          tag: "link",
          attrs: { rel: "icon", href: `${base}favicon.ico`, sizes: "32x32" },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/svg+xml",
            href: `${base}icons/icon.svg`,
          },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: `${base}icons/apple-touch-icon-180.png`,
          },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#0b0d10" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: {
            name: "apple-mobile-web-app-status-bar-style",
            content: "black-translucent",
          },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-title", content: "Paint" },
          injectTo: "head",
        },
      ];
    },

    // After the bundle is built, collect every emitted asset plus the public
    // assets and emit the worker + the two manifests the hook reads.
    generateBundle(_options, bundle) {
      const assets: Record<string, number> = {};

      const add = (urlPath: string, bytes: number) => {
        assets[urlPath] = bytes;
      };

      // Hashed build output (JS, CSS, the HTML shell, any emitted assets).
      for (const [fileName, output] of Object.entries(bundle)) {
        const bytes =
          output.type === "chunk"
            ? Buffer.byteLength(output.code)
            : typeof output.source === "string"
              ? Buffer.byteLength(output.source)
              : output.source.byteLength;
        add(`${base}${fileName}`, bytes);
      }

      // Public assets (icons) — copied verbatim by Vite, so they are not in
      // `bundle`; read their sizes off disk. Skip source maps and the
      // crawler-only files.
      const publicDir = config.publicDir;
      if (publicDir) {
        for (const file of listFiles(publicDir)) {
          const rel = relative(publicDir, file).split(sep).join(posix.sep);
          if (PUBLIC_SKIP.has(rel) || rel.endsWith(".map")) continue;
          add(`${base}${rel}`, statSync(file).size);
        }
      }

      // The web manifest is generated here (not shipped from `public/`) so its
      // identity fields are base-correct per channel; add it to the precache so
      // the installed shell resolves its icons and identity offline.
      const manifestSource = buildManifest(base);
      add(`${base}manifest.webmanifest`, Buffer.byteLength(manifestSource));

      const precache = Object.keys(assets);
      const totalBytes = Object.values(assets).reduce((a, b) => a + b, 0);

      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: manifestSource,
      });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: buildServiceWorker(
          cacheId,
          base,
          version,
          precache,
          ignorePaths,
        ),
      });
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version }, null, 2)}\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "precache-manifest.json",
        source: `${JSON.stringify({ totalBytes, assets }, null, 2)}\n`,
      });
    },
  };
}
