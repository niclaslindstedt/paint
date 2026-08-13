# Dropping in an image

Drag an image file onto the canvas and it lands on the page — a screenshot to
annotate, a photo to trace over, a logo to sketch around.

## Placing it

A dropped picture does not go straight into the drawing. It floats over the page
first, wearing a frame with a handle at each corner:

- **drag it** to move it,
- **pull a corner** to scale it (it keeps its proportions — a squashed photo is
  never what anyone meant),
- **Keep** — the button in the bar at the top, a click anywhere else on the
  page, or Enter — files it onto the drawing,
- **Discard**, or Escape, throws it away.

The two buttons matter on a phone: a picture bigger than the screen leaves no
"anywhere else" to tap and no Enter key to press.

Until you keep it, nothing has changed: there is nothing in the drawing and
nothing in the undo history. Once you do, it is one mark like any other — one
step of undo, and it syncs and exports with everything else.

## The page grows to fit

If the picture is bigger than the sheet, the sheet grows: drop a 4000-pixel-wide
photo onto the default 3200 × 2000 page and the page becomes the photo, which is
what "open this image and draw on it" ought to mean. The same happens if you
drag or scale a picture past the right or bottom edge before settling it — the
page follows the picture.

The page only ever grows down and to the right. Growing it upwards or to the
left would shift every mark already on it.

## Dropping onto the sidebar

Drop an image onto the drawings list instead of onto the canvas and it starts a
**new drawing** rather than landing on the open one. The page is cut to the
picture's size, and the file name — without its extension — becomes the
drawing's name, so `whiteboard-2024-05.jpg` opens as _whiteboard-2024-05_.

## What is stored

The bitmap is kept inside the drawing as a `data:` URL, so a drawing is still one
self-contained document: it syncs as one file, exports as one file, and works
offline with nothing to fetch.

That does mean pictures take up room in a document that lives in your browser's
storage, so the _stored_ bitmap is scaled down on the way in — the longest edge
is capped at 2000 pixels, and photos are re-encoded as JPEG. An image already
inside the cap is stored exactly as it was.

The picture is still **placed at the size it was dropped at**: a 4000-pixel photo
covers 4000 pixels of page (and grows the page to fit), it simply holds fewer
stored pixels than that behind it. Zoom a long way into a very large import and
you will see the difference; at any normal zoom you will not.
