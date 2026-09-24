# Releasing the native app

Builds run on **EAS Build** (Expo's infrastructure), not on GitHub's runners
and not on a laptop. Everything below is a one-time setup followed by a
one-click dispatch.

## One-time setup

### 1. The Expo project

```sh
cd native
npx eas-cli login
npx eas-cli init          # prints the project id
```

`eas init` normally writes the id into `app.json` — this app uses a **dynamic**
config (`app.config.js`), which it cannot write to, so the id is passed in
instead:

- **CI**: set it as the repository **secret** `EAS_PROJECT_ID`
  (Settings → Secrets and variables → Actions → Secrets).
- **Locally**: `native/.env` (`cp .env.example .env`).

The identity the stores know the app by is not in the tree either. Set both as
repository **secrets** and as EAS environment variables on the project (EAS
evaluates `app.config.js` again on its builder), under the same names in every
app:

| Variable           | Becomes                                                    |
| ------------------ | ---------------------------------------------------------- |
| `APP_DISPLAY_NAME` | `expo.name` — the listing name and the name under the icon |
| `APP_BUNDLE_ID`    | `ios.bundleIdentifier` and `android.package`               |

Unset, a checkout builds as the project's own name under a development id; the
`production` profile refuses to build without them (`identifiers.js`).

### 2. The CI token

Create a **robot** access token at
`https://expo.dev/accounts/<account>/settings/access-tokens` — a robot cannot
sign in to the dashboard and owns no projects, so its blast radius is bounded —
and set it as the repository **secret** `EXPO_TOKEN`.

### 3. Store credentials

EAS holds these on the project, not in this repo:

```sh
npx eas-cli credentials          # iOS signing + Android keystore
```

For submission, fill in the placeholders in `eas.json` →
`submit.production`:

| Field                       | Where it comes from                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple ID (not committed)    | Asked for by `eas submit` when it signs in; never written into `eas.json`.                                                                                                                                                                                 |
| `ascAppId`                  | App Store Connect → the app → App Information → **Apple ID** (digits). Add it under `submit.production.ios` once the app record exists; until then the key is absent, not a placeholder — `eas submit` rejects placeholder values before it does anything. |
| `appleTeamId`               | developer.apple.com → Membership details → **Team ID** (10 characters). Added beside `ascAppId`.                                                                                                                                                           |
| `play-service-account.json` | Play Console → Setup → API access → a service account key. Gitignored; upload it to EAS with `eas credentials` rather than committing it.                                                                                                                  |

### 4. iCloud capabilities

The app declares one iCloud container, `iCloud.se.agilator.paint`.
Before the first store build, in the Apple Developer portal:

1. **Identifiers → iCloud Containers** — create that container id.
2. **Identifiers → App IDs → the app's `APP_BUNDLE_ID`** — enable
   **iCloud** with **iCloud Documents**, and tick that container.

An entitlement the App ID does not carry fails code signing, and a container
the App ID does not carry fails at runtime with the app reporting "not signed
in to iCloud" on a device that plainly is. Both are configuration, not code.

### 5. Dropbox

The phone app signs in to Dropbox through an in-app authentication session
that returns on **`<bundle id>://oauth`** — `se.agilator.paint://oauth` for
the store build (see
[README → Signing in to Dropbox](README.md#signing-in-to-dropbox)). In the
[Dropbox App Console](https://www.dropbox.com/developers/apps), open the app
whose key is the `VITE_DROPBOX_APP_KEY` secret and add
`se.agilator.paint://oauth` under **Settings → OAuth 2 → Redirect URIs**,
exactly as written. The native workflow passes that secret (and
`VITE_DROPBOX_APP_FOLDER`) to the web bundle; without it the app offers no
Dropbox at all.

## Cutting a build

Dispatch **Actions → native → Run workflow** and pick:

| Input      | Meaning                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `platform` | `all`, `ios` or `android`.                                                                                                             |
| `profile`  | `development` (dev client), `preview` (internal, APK + simulator), `testflight` (store-signed, still ours), `production` (what ships). |
| `submit`   | Also submit to the stores. Refused on anything but `production`.                                                                       |

The job builds the web app, packs it into `native/assets/webroot.zip`, and
queues the build on EAS with `--no-wait` — it exits immediately, so watch the
build itself at <https://expo.dev>.

The **marketing version** comes from the repo root's `package.json`, so the app
and the website never disagree about which release they are. Store **build
numbers** are auto-incremented by EAS (`appVersionSource: remote`); nothing is
bumped by hand.

## Doing it from a laptop instead

```sh
cd native
npm ci
npm run build:preview        # internal build
npm run build:testflight     # store-signed, to TestFlight
npm run build:production     # what ships
npm run submit
```

Each of those bundles the web app first — the wrapper serves that copy, and a
build without it launches to a blank screen.

## Checklist before a store build

- [ ] `make lint && make test && make build` is green at the repo root.
- [ ] `make native-typecheck` is green.
- [ ] `EXPO_PUBLIC_PAINT_URL` is **unset** — a build that streams the
      website is the exact shape App Store guideline 4.2 rejects.
- [ ] The version in the root `package.json` is the one you mean to ship.
- [ ] On a real device signed in to iCloud: Settings → Storage offers **iCloud
      Drive**, connecting files `paint-default.json` into the **Paint**
      folder in the Files app, and a drawing made on one device shows up on
      another — with any placed image beside it under `images/`.
- [ ] Settings → Storage → Dropbox → Connect opens Dropbox in a sheet over
      the app (not in Safari), and approving closes the sheet and connects.
      Closing the sheet instead leaves nothing connected.
- [ ] On a device signed OUT of iCloud: the backend explains itself rather than
      failing on the first save.
