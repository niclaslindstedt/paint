# Export

Ways out of the app, all of them entirely offline.

## The download menu

The header's download button opens a short menu: a row per image type — **PNG**,
**JPG**, **SVG** — and **Copy to clipboard**.

Which type you want depends on where the drawing is going: a PNG into a chat, an
SVG into a slide that will be resized afterwards, a JPG when an upload form
refuses everything else. So the menu asks rather than guessing, and every row
downloads `<drawing-name>.<type>` straight away.

**Copy to clipboard** puts the drawing on the system clipboard as a PNG — the
exit with no file to find afterwards. It is always on the menu, whichever file
types you have switched off, because PNG is the one image type every clipboard
on every platform takes.

All four are rendered through the _same_ renderer that paints the screen, so what
lands in the file is what you saw. The on-screen grid is the one exception — the
export simply doesn't ask for it, so it never appears.

## Settings → Download

Three choices, and they apply to every download and to the clipboard alike.

**File types.** Switch off the ones you never reach for and they leave the menu.

**Area.** _The whole page_ exports the entire sheet — whatever size the drawing
was made at — however far you happen to be zoomed in: the file is the drawing, not the view of
it. _Just the marks_ crops to what you have actually drawn, with a small margin,
which is what you want on a big page with one small diagram on it. A page with
nothing on it falls back to the whole sheet.

**Background.** Transparent leaves the whole **Background layer** out — the page
colour and anything you drew on the sheet itself — so the marks land on
transparency and the drawing takes on whatever it is pasted over. Two caveats,
both physics rather than policy: JPG has no transparency and always keeps the
page colour, and the eraser _paints_ with the page colour, so anywhere you
erased stays opaque.

## About the SVG

The SVG holds the marks as vectors, so the drawing stays sharp at any size —
and, unlike the raster formats, it stays editable in a vector program.

Everything is inside the one file, including any image you dropped onto the
page: the bitmap rides along as a `data:` URL rather than as a link to something
that lives elsewhere.

## JSON

Settings → Storage → Export downloads the whole document — every drawing in the
current namespace — as `paint.json`. These are the same bytes a sync backend
carries, so an export is a portable backup and, being plain JSON, is readable
and diffable outside the app.
