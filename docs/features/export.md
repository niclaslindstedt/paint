# Export

Two ways out, both entirely offline.

## PNG

The header's download button (and Settings → Storage) rasterises the open page
at its document size — 1600 × 1000 by default — and downloads it as
`<drawing-name>.png`.

The PNG is rendered through the _same_ renderer that paints the screen, so what
lands in the file is what you saw. The on-screen grid is not part of that render
(the page element draws it), so it never appears in the export.

## JSON

Settings → Storage → Export downloads the whole document — every drawing in the
current namespace — as `paint.json`. These are the same bytes a sync backend
carries, so an export is a portable backup and, being plain JSON, is readable
and diffable outside the app.
