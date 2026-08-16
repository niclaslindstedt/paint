# Cloud sync

Paint is local-first: the working copy always lives in this browser's IndexedDB,
and everything works with no account and no network. Sync is opt-in, and it is a
_copy_ of that document being pushed somewhere you chose.

## Backends

Settings → Storage picks where the document is kept:

| Backend          | What it is                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| **This device**  | This browser's IndexedDB. The default; nothing leaves the browser.      |
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

That is your _marks_ — they save themselves, and always have. Your **rendered
layers** are the one thing you save by hand: press the disk button in the header
(or ⌘/Ctrl+S) and each layer is written to your backend as a browsable
transparent PNG under `drawings/<name>-<tag>/`. They are megabytes where the
marks are kilobytes, which is why they wait for you to ask. A layer you haven't
touched costs nothing on the next press. See
[the paint file](file-format.md).

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

## Your settings travel too

Beside the document and the `images/` tree, a connected backend keeps one more
file: `settings.json`. It holds the kit rather than the drawings — which tools
are switched on, the order you put them in, every width and dial and saved
preset, the colours you mixed, and how the app looks.

That is there because a kit is worth carrying. Finding the 4B at 0.7 mm with the
opacity eased off is real work, and doing it again on the laptop is the same
work twice. Connect the same folder — or the same Dropbox — on the other machine
and the tools are already set up the way you left them.

Two rules decide which copy wins, and they are not symmetrical:

- **Connecting** a backend that already has a `settings.json` adopts it. That is
  the point: the machine you are sitting at should end up like the one you set
  up. A backend with no settings file yet is seeded from this device instead.
- **Changing** a setting afterwards writes straight through, so the backend
  always reflects the last change you made anywhere.

Two settings deliberately stay put: **developer mode** and **log capture**.
Those are things you switch on to investigate something on _this_ browser, and
having them follow you onto a phone you weren't debugging is a surprise rather
than a convenience. Which backend you use, and your cloud sign-ins, aren't in
the file either — a file that told the app where to read itself from would be a
loop.

`settings.json` stays plaintext even when the drawings are encrypted. None of it
is secret, and keeping it readable is what lets a fresh device render the app
the way you set it up before you have typed the passphrase.

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
