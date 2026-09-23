# The native wrapper

A **thin** Expo / React Native shell around the paint web app, so it can ship
to the App Store and Google Play — and so it can do the one thing a PWA cannot:
keep the sketchbook in the reader's own **iCloud Drive**. The desktop build is
a separate shell, `../tauri/`; this one is the phone and tablet app.

Thin is the design, not an aspiration. The wrapper:

- packs the built web app into `assets/webroot.zip`, unpacks it on first
  launch and serves it from a **loopback HTTP server** (`src/local-server.ts`);
- points a `WebView` at that origin, and gets out of the way — the status bar
  and safe-area bands follow the page's own theme, off-origin links go to the
  system browser, and Android's back button drives the WebView's history;
- answers the page when it asks to read or write a file in the app's iCloud
  container (`src/icloudBridge.ts` → `src/icloud.ts` →
  `modules/icloud-store`).

That is the entire list, and it is deliberately not empty: **App Store
guideline 4.2 rejects a build that is only a viewer for a website**, so the
wrapper has to do something the browser cannot. iCloud is that thing. Adding a
second is allowed; adding one that makes `src/` aware of this wrapper is not.

**Nothing in the repo's `src/` knows this exists.** The web app looks for an
iCloud **capability** on `window` and this installs one, so a browser (which
has none) simply does not list the backend — down to its entry in the Storage
picker. The app never asks what it is running inside.

The wrapper also decides nothing about the drawings. It moves opaque files
between the page and a folder. What the document is called, how images and
rendered layers are filed beside it, what a conflict means and when a save is due are all the web
app's, in `src/app/useSyncEngine.ts` against the framework's storage adapters —
exactly as they are for a picked local folder.

## Layout

| Path                     | What it is                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `App.tsx`                | The whole app: a WebView, a spinner, and a failure screen.                                             |
| `src/local-server.ts`    | Unpacks `assets/webroot.zip` and serves it on a **fixed** loopback port.                               |
| `src/injected.ts`        | One of the two injected scripts: reports the page's theme, kills the service worker.                   |
| `src/icloudBridge.ts`    | **Pure.** The injected iCloud provider, and the request/response plumbing. Tested from the root suite. |
| `src/icloudWire.ts`      | **Import-free.** The shapes that cross the bridge — see the note in the file.                          |
| `src/icloud.ts`          | Runs one request against the native module. Degrades to "unavailable" when it is absent.               |
| `modules/icloud-store/`  | A local Expo module: list / read / write / remove inside the app's iCloud container. **Apple only.**   |
| `plugins/with-icloud.js` | Declares the container as a document scope, so it shows up in the Files app.                           |
| `scripts/bundle-web.mjs` | Builds the web app and packs `dist/` into `assets/webroot.zip`.                                        |

`ios/` and `android/` are **prebuild output**: regenerated from `app.config.js`
and `plugins/` by `expo prebuild --clean`, gitignored, and the source of truth
for nothing. Never edit them.

## Working on it

```sh
make native-install      # or: npm --prefix native install
make native-bundle       # build the web app into assets/webroot.zip
make native-typecheck
make native-prebuild     # inspect what the config plugin generates
```

Then run it on a device or simulator (needs Xcode / Android Studio):

```sh
cd native
npm run ios        # bundles the web app first, then expo run:ios
npm run android
```

`npm run bundle` must have run at least once before any native build — the
wrapper serves that zip, and without it the app launches to a blank screen.

To point a build at a deployed slot instead of the bundled copy (debugging
only — a store build must never do this):

```sh
EXPO_PUBLIC_PAINT_URL=https://paint.niclaslindstedt.se/preview/ npm run ios
```

## The iCloud backend

The web app already syncs to a picked local folder. iCloud Drive is that
backend with a different transport underneath: a folder the device syncs, rather
than one the browser was handed a grant to.

```
Settings → Storage → iCloud Drive
   │  src/app/useSyncEngine.ts  — builds a file-store adapter over the host
   ▼
window.__paintICloud        — installed by src/icloudBridge.ts
   │  postMessage (request)  /  injectJavaScript (answer)
   ▼
App.tsx → src/icloud.ts → modules/icloud-store
   │
   ▼
iCloud.se.agilator.paint/Documents/
   paint-<namespace>.json, images/…, drawings/…, settings.json
```

Everything is filed under the container's `Documents` folder, which
`plugins/with-icloud.js` publishes as a document scope — so the whole tree shows
up under **Paint** in the Files app. A file the reader can see is a file they
can back up, and that is worth more than the privacy of an opaque folder for
data they already own.

**The container id is pinned in two places that must agree**:
`identifiers.js` (read by `app.config.js` for the entitlements and by
`plugins/with-icloud.js` for the Files-app declaration) and
`modules/icloud-store/index.ts` (and its Swift twin). Changing it after release
strands every synced copy in the old container.

### What crosses, and what doesn't

The bridge carries paths and file contents, and nothing else. The document
crosses as text; images and rendered layers cross as base64, which is the
only lossless way through a `postMessage` string. Nothing is cached on the
native side and nothing is logged — the payload is somebody's drawings, and
the only places it belongs are the container and the page that asked for it.

### Android

There is no iCloud on Android, and the module says so rather than pretending:
`modules/icloud-store` declares only the `apple` platform, so
`requireOptionalNativeModule` returns `null` there and the backend is reported
unavailable — which means the web app never lists it. The Android build is the
same offline-capable sketchbook with the same Dropbox and on-device backends
the website has.

## Things that will bite you

- **The port in `src/local-server.ts` is fixed on purpose.** A web origin is
  scheme + host + port, and IndexedDB and `localStorage` are keyed by origin —
  so a random port would hand the WebView empty storage on every launch, and
  every drawing would appear to vanish. Each wrapper in the fleet has its own
  ladder (see the file) so two apps on one phone never share one.
- **`localhost`, not `127.0.0.1`.** App Transport Security blocks the literal
  address from `WKWebView` even with exception domains declared. The failure
  mode is a silent blank page on iOS.
- **The service worker is unregistered** (`src/injected.ts`). The origin is
  stable across app updates, so a worker registered by an older build would
  keep answering from its precache after a store update had already unpacked
  the new one.
- **`url(forUbiquityContainerIdentifier:)` blocks.** It hits the disk and the
  iCloud account, so it never runs on the main thread — every entry point in
  the Swift module is an `AsyncFunction`, and the resolved URL is cached.

## Releasing

See [`RELEASING.md`](RELEASING.md).
