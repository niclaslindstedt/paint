# Cloud sync

Paint is local-first: the working copy always lives in this browser's
localStorage, and everything works with no account and no network. Sync is
opt-in, and it is a _copy_ of that document being pushed somewhere you chose.

## Backends

Settings → Storage picks where the document is kept:

| Backend          | What it is                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| **This device**  | localStorage only. The default; nothing leaves the browser.             |
| **Local folder** | A folder you pick on this computer (Chromium's File System Access API). |
| **Dropbox**      | A `paint-<namespace>.json` file in the app's Dropbox app folder.        |
| **Google Drive** | The same file in a `Paint` folder in your My Drive.                     |

A cloud backend only appears in the picker when the build carries its OAuth
client id (see [configuration](../configuration.md)) — an unconfigured backend
is hidden rather than offered as a dead option.

## How saving works

- Edits settle for about a second and a half, then push. A burst of quick
  strokes becomes one save.
- The first push after opening waits for a baseline read of the backend, so it
  can never overwrite another device's newer copy with an unknown base revision.
- If another device saved in between, the save reports a conflict rather than
  clobbering it: **Reload from the backend** adopts that copy.
- Offline, an auth expiry, or rate limiting each show in the sync glyph and in
  the command centre behind it, with the matching recovery action.

## Dropped pictures become real files

A drawing is vector geometry, so the document is small — until you drop a photo
onto the page, which is stored inline as base64 and would otherwise be pushed in
full on every save.

So on a remote backend the pictures are filed out beside the document, as genuine
`.png` / `.jpg` files under `images/`, named after the page they sit on:
`images/sequence-diagram-4k2a-1.png`. The document keeps only the reference, and
reading it back on another device pulls the files in. Two consequences worth
knowing:

- A picked folder or an app folder is a **browsable tree** — you can open the
  pictures from a drawing without the app.
- Filing is **safe by default**: a picture is only removed from the pushed
  document once its file has been written, and a leftover file is only deleted
  once the save that stopped referencing it has committed. A throttled or failed
  upload costs you nothing but a retry.

An **encrypted** copy skips this entirely — its pictures stay inside the
encrypted envelope rather than landing on the drive in the clear.

## First connect

When you connect a backend that already holds drawings which differ from this
device's, the app doesn't pick a side silently — it asks, showing what each copy
holds ("Dropbox: 4 drawings, 512 marks" vs "This device: 1 drawing, 12 marks").
Saving is held until you choose. A device holding nothing but a blank page skips
the question: there is nothing to lose, so the remote copy is adopted.

## Encryption

With a backend connected, Settings → Storage can encrypt the synced file
end-to-end with a passphrase you choose. The passphrase is held in memory for
the session and stored nowhere — losing it means the cloud copy is unreadable,
by us as much as by anyone else. The local working copy stays plaintext.
