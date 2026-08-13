# Configuration

Paint runs with no configuration at all. Everything below is optional, and every
value is read at **build time** through Vite's `import.meta.env`, so a
configuration change means a rebuild (or a new deploy).

None of these are secrets: the OAuth flows are PKCE public-client flows with no
client secret, which is why they can live in repository variables and be baked
into a public bundle.

## Cloud sync

| Variable                  | Effect                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `VITE_DROPBOX_APP_KEY`    | Dropbox app key (PKCE public client). **Unset ⇒ Dropbox is hidden** from Settings → Storage. |
| `VITE_DROPBOX_APP_FOLDER` | The app-folder name the document is filed under (`Apps/<name>/`). Defaults to `Paint`.       |
| `VITE_GOOGLE_CLIENT_ID`   | Google OAuth client id (GIS token client). **Unset ⇒ Google Drive is hidden.**               |
| `VITE_GDRIVE_APP_FOLDER`  | The My Drive folder the document is filed under. Defaults to `Paint`.                        |

An unconfigured backend is hidden rather than shown broken, so a build with
neither key simply offers "This device" and, on Chromium, "Local folder" (which
needs no configuration — it uses the File System Access API).

### Setting them up

**Dropbox.** Create an app at
[dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) with
"App folder" access and the `files.content.read` / `files.content.write` scopes.
Add your deploy origin (and `http://localhost:5173` for local work) as a
redirect URI. The app key goes in `VITE_DROPBOX_APP_KEY`; the folder name you
gave the app goes in `VITE_DROPBOX_APP_FOLDER`.

**Google Drive.** Create an OAuth client id (Web application) in the
[Google Cloud console](https://console.cloud.google.com/apis/credentials), with
your origins listed as authorized JavaScript origins. The app requests the
narrow `drive.file` scope, so it can only see files it created itself.

## Deploy-time

| Variable                | Effect                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `VITE_BASE`             | The base path the bundle is served from — `/`, `/preview/`, `/branch/`. Defaults to `/`.      |
| `VITE_PWA_IGNORE_PATHS` | Comma-separated paths this build's service worker must disown (the sibling release channels). |

Both are set by `.github/workflows/pages.yml`; you only touch them if you are
deploying the app somewhere else.

## Local development

Put the variables in a `.env.local` file at the repository root (it is
gitignored):

```
VITE_DROPBOX_APP_KEY=abc123
VITE_GOOGLE_CLIENT_ID=123-abc.apps.googleusercontent.com
```

## Where the data lives

Nothing here configures storage location — that is a runtime choice in
Settings → Storage. On this device the app writes:

| Key                       | What                                                    |
| ------------------------- | ------------------------------------------------------- |
| `paint:doc[:<namespace>]` | The drawings, as JSON                                   |
| `paint:settings`          | The app settings blob                                   |
| `paint:namespaces`        | The namespace registry, and `:active` for the pointer   |
| `paint:sync:*`            | The chosen backend, its tokens, and the encryption flag |
| `paint:logs`              | The in-app log buffer                                   |
| `paint:language`          | The chosen language                                     |

Clearing the site's storage removes all of it — export first (Settings →
Storage) if the drawings matter.
