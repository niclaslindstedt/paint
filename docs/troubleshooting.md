# Troubleshooting

## A tool is missing from the toolbar

The optional tools (arrow, marker, highlighter) are off out of the box — switch
them on under Settings → **Tools**. If a tool you switched on still isn't there,
check that Settings saved (the toolbar updates the moment you toggle it) and
reload.

## My drawing looks blank after switching themes

It shouldn't: marks that never chose a colour follow the page. If a _specific_
mark disappeared, it was drawn with an explicitly picked colour that matches the
new page — pick a different ink and redraw, or flip the canvas theme back under
Settings → Canvas.

## A cloud backend isn't offered

Dropbox and Google Drive only appear when the build carries their OAuth client
id (see [configuration](configuration.md)); a build without them offers only
"This device" and, on Chromium, "Local folder". "Local folder" itself is hidden
in browsers without the File System Access API — Firefox and Safari today.

## Sync says "session expired"

OAuth tokens don't live forever, and the Google Drive token is per-session by
design. Open the sync command centre (the glyph in the header) and use
**Reconnect**. Your drawings are safe on the device meanwhile.

## Sync says there's a newer copy on the backend

Another device saved after this one. Nothing is lost: **Reload from the backend**
adopts that copy, and your own version is still in this browser's storage until
you do. If you want this device's copy to win instead, export it as JSON first,
reload, then re-import.

## I forgot the encryption passphrase

There is no recovery — that is the point of end-to-end encryption. Turn
encryption off in Settings → Storage and push this device's copy over the
unreadable one, or delete the file from the drive and start again.

## The app won't update

The service worker installs a new build in the background and prompts you before
applying it. If the prompt never comes, use **Check for updates** in the
sidebar. Failing that, close every tab of the app and reopen it — a worker only
swaps when nothing is holding the old one open.

## Nothing loads after an update

Most likely a half-installed service worker. Hard-reload (`Ctrl/Cmd + Shift +
R`), or unregister the worker in your browser's devtools → Application →
Service workers, and reload. Your drawings are in localStorage and survive
either.

## Storage is full

The browser refused a write. Export the document (Settings → Storage → Export as
JSON), delete drawings you don't need, and reload. Connecting a cloud backend
also helps, since the copy there isn't bound by the browser's quota.

Dropped images are the usual reason to hit this: a picture is stored inside the
drawing, and browser storage is a few megabytes in total. Imports are scaled down
on the way in, but a handful of large ones still add up — keep the ones you are
working on and archive or delete the rest.

## A dropped image won't go in

Only image files are accepted, and only one per drop. A file the browser can't
decode, or one larger than 32 MB, is refused with a line in the log (Settings →
Developer → Capture logs, then Settings → Logs).

If the picture went in but the page looks empty where it should be, give it a
moment: a large image decodes asynchronously and the canvas repaints when it
lands.

## Reporting something else

Open an [issue](https://github.com/niclaslindstedt/paint/issues) with what you
did, what happened, and your browser. Turning on Settings → General → Developer
mode adds a **Logs** tab whose contents are worth pasting in.
