# The native wrapper

A **thin** Expo / React Native shell around the paint web app, so it can ship
to the App Store and Google Play — and so it can do the one thing a PWA cannot:
keep the sketchbook in the reader's own **iCloud Drive**. The desktop build is
a separate shell, `../tauri/`; this one is the phone and tablet app.

Thin is the design, not an aspiration. The wrapper:

- packs the built web app into `assets/webroot.zip`, unpacks it on first
  launch and serves it from a **loopback HTTP server** (`src/local-server.ts`);
- points a `WebView` at that origin, and gets out of the way — on iOS the
  WebView runs edge to edge and the page pads itself with
  `env(safe-area-inset-*)`, as the installed PWA does; on Android the status
  bar and safe-area bands follow the page's own theme; off-origin links go to
  the system browser, and Android's back button drives the WebView's history;
- answers the page when it asks to read or write a file in the app's iCloud
  container (`src/icloudBridge.ts` → `src/icloud.ts` →
  `modules/icloud-store`);
- opens a cloud provider's sign-in in an **authentication session** when the
  page asks for one (`src/authSessionBridge.ts` → `src/authSession.ts` →
  `expo-web-browser`) — see [Signing in to Dropbox](#signing-in-to-dropbox).

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

| Path                       | What it is                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `App.tsx`                  | The whole app: a WebView, a spinner, and a failure screen.                                                                         |
| `src/local-server.ts`      | Unpacks `assets/webroot.zip` and serves it on a **fixed** loopback port.                                                           |
| `src/injected.ts`          | One of the three injected scripts: reports the page's theme, kills the service worker.                                             |
| `src/icloudBridge.ts`      | **Pure.** The injected iCloud provider, and the request/response plumbing. Tested from the root suite.                             |
| `src/icloudWire.ts`        | **Import-free.** The shapes that cross the bridge — see the note in the file.                                                      |
| `src/icloud.ts`            | Runs one request against the native module. Degrades to "unavailable" when it is absent.                                           |
| `src/authSessionBridge.ts` | **Pure.** The injected sign-in provider (`window.__ossAuthSession`) and its request/response plumbing. Tested from the root suite. |
| `src/authSession.ts`       | Opens one sign-in in an authentication session (`expo-web-browser`) and hands back where it ended.                                 |
| `src/scriptText.ts`        | **Import-free.** Splicing text safely into an injected script; shared by both bridges.                                             |
| `modules/icloud-store/`    | A local Expo module: list / read / write / remove inside the app's iCloud container. **Apple only.**                               |
| `plugins/with-icloud.js`   | Declares the container as a document scope, so it shows up in the Files app.                                                       |
| `scripts/bundle-web.mjs`   | Builds the web app and packs `dist/` into `assets/webroot.zip`.                                                                    |

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

## Signing in to Dropbox

The page's own Dropbox sign-in is a redirect: consent at dropbox.com, then
back to the page's origin with a code, which the page trades for tokens using
the PKCE verifier it kept in `sessionStorage`. That cannot finish in here. The
providers refuse consent inside an embedded WebView, so `App.tsx` sends an
off-origin page to Safari — and Dropbox would then redirect **Safari** to
`http://localhost:8271…`, an origin it has not registered, in a browser that
does not hold the verifier.

So the wrapper offers the page an **authentication session**
(`ASWebAuthenticationSession` on iOS, a Custom Tab on Android): a browser sheet
over the app that closes as soon as the provider redirects to the app's own
scheme, and hands that URL back.

```
Settings → Storage → Dropbox → Connect
   │  src/app/useSyncEngine.ts — getAuthSessionHost() is present, so
   │  connectDropboxAuthSession(appKey, host)   (oss-framework)
   ▼
window.__ossAuthSession.open(authorizeUrl)   — installed by src/authSessionBridge.ts
   │  postMessage (request)  /  injectJavaScript (answer)
   ▼
App.tsx → src/authSession.ts → WebBrowser.openAuthSessionAsync(url, "<bundle id>://oauth")
   │  the reader consents in the sheet; Dropbox redirects to
   │  <bundle id>://oauth?code=…&state=dropbox and the sheet closes
   ▼
the page checks the state, trades the code (same verifier, same redirect URI)
```

As with iCloud, the page asks for a **capability**, not for this wrapper: the
host lives at `window.__ossAuthSession`, a name the framework owns
(`AUTH_SESSION_HOST_PROPERTY`), so the website — which has no host — keeps its
redirect flow and the desktop app keeps its loopback one. The wrapper never
sees a token: it opens an `https:` URL (nothing else is accepted) and returns
the callback URL, unread; a closed sheet comes back as `null`, which the page
logs as "cancelled" rather than as an error.

**The redirect URI is `<scheme>://oauth`, and the scheme is the bundle id**
(`app.config.js`'s `scheme` is `BUNDLE_ID` from `identifiers.js` — reverse-DNS,
as RFC 8252 §7.1 asks of a private-use scheme). So the store build returns on
**`se.agilator.paint://oauth`**, and a plain checkout on
`dev.local.paint://oauth`. Dropbox requires the exact URI to be registered:
the Dropbox app behind `VITE_DROPBOX_APP_KEY` must list
`se.agilator.paint://oauth` under **Settings → OAuth 2 → Redirect URIs** in the
[App Console](https://www.dropbox.com/developers/apps), next to the website's
and the desktop app's (add `dev.local.paint://oauth` too to sign in from a
development build). Without it Dropbox shows "Invalid redirect_uri" in the
sheet.

Other off-origin links are unchanged: they still leave for the system browser.

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
