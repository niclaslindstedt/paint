# Getting started

Paint opens on a blank page with a toolbar under it. There is nothing to sign
into and nothing to configure — start drawing.

## The canvas

Press and drag to draw. The page is a fixed size — the one you picked when the
drawing was made, this screen's own resolution unless you chose otherwise — so a
sketch looks the same on a laptop and a phone. On a page bigger than the window
you just see less of it at once. [More](features/canvas.md).

The toolbar runs left to right in the order Photoshop's runs top to bottom, so
the reach is the one you already have:

- **Colour dropper** (`I`), at the far left, makes the colour you tap the ink.
- **Pencil** (`P`) draws freehand.
- **Paintbrush** (`B`) is a bristle brush: the mark swells and tapers, thins
  where your hand moved fast, and frays at the edges.
- **Eraser** (`E`) paints over marks with the page colour.
- **Paint bucket** (`F`) fills the empty space you tap, up to the marks around
  it.
- **Text** (`T`) drops a caret where you tap and you type into the drawing
  itself. A small bar over the caret offers four typefaces, bold and italic;
  Enter breaks the line, Escape throws it away, and a press anywhere else on the
  page keeps it.
- **Rectangle** (`R`), **Ellipse** (`O`) and **Line** (`L`) are dragged from one
  corner (or end) to the other.
- **Hand** (`D`), at the far right, drags the page around instead of drawing on
  it — and double-tapping with it fits the whole page, again for 1:1.
- `Ctrl/Cmd + Z` undoes the last mark, `Ctrl/Cmd + Shift + Z` redoes it. Every
  mark is one step.

Swipe in from the **right edge** of the page for the drawing's layers: add one,
pick which one you are drawing on, hide it, move it up or down the stack, or
delete it. The layers button in the header opens the same panel, and a press on
the page closes it. A drawing starts as a single layer, so this stays out of the
way until you want it.

## Colour and size

The two buttons at the end of the toolbar hold everything about the ink.

The **ink button** is split: the colour you are drawing with above the diagonal,
the page colour that rubs it out below. Press it for the palette and for **Mix a
colour…**, which opens a hue strip and a brightness field — drag either and the
ink changes as you go, then **Keep** adds it to your own swatches for good.

The **nib button** shows the width as a dot the size it will draw. Press it for
the widths, a slider that adds your own, and — under **Advanced** — whatever the
tool in your hand has of its own to tune.

The width belongs to the tool: a pencil width, a paintbrush width, a type size,
each remembered separately. Every tool also opens at a width chosen for it, so
nothing needs setting up before it draws the way it should.

## More tools

Settings → **Tools** is a rack of every tool the app has, each with its glyph
and an on/off switch: an airbrush, a marker, a highlighter, a crayon, a
calligraphy pen, and the arrow. Switch one on and it joins the toolbar
immediately, in its own place in the row rather than at the end. Switching it
off later only hides it; marks you already drew stay put.

The shapes that can be filled — rectangle and ellipse — wear a folded corner:
press one again while you are already holding it and a small panel opens over
the page offering the shape hollow or solid.
[More about the plugin model](features/plugins.md).

## Light page, dark page

Settings → **Canvas** picks whether you draw on a light or a dark sheet, or
follow the app theme (the default). Marks that never chose a colour follow the
page, so flipping the theme re-inks the whole sketch instead of hiding it.
[More](features/canvas-theme.md).

The same tab has the on-screen grid, the **tool-name** label that names each
tool over the middle of the page as you pick it, and can pin a specific page
colour to the drawing you have open.

## Drawings, folders, and sketchbooks

The sidebar lists the drawings in the current sketchbook, most recently edited
first. On a phone, swipe a row **right** to archive it or **left** to bare a
Delete button, and press-and-hold to pick it up and drag it onto a folder, out
to the top level, onto another sketchbook, or onto Archive. On a desktop,
right-click a row for the same actions — star it, move it to a folder, duplicate
it, archive it, delete it — or drag it with the mouse.

The block of buttons at the foot of the sidebar is where the rest lives — **new
drawing**, **new folder**, the **archive**, **undo**, **redo**, and the **cloud
sync** glyph, which shows the sync state and opens the sync details.

**New drawing** gets the sidebar out of the way and asks what the drawing is
made of: **New** for an empty page, **Load** for an image from disk (or dropped
onto the dialog), and **Clipboard** when there is a picture on it — a drawing
made from a picture is cut to the picture's size. An empty one asks how big it
is, and the four sizes are drawn rather than listed: this screen, Full HD, 4K
and A4, all at one shared scale, so you can see how much bigger 4K is before you
pick it. The page is fixed once the drawing exists.

Star a drawing with the star in the canvas header and it appears under
**Favorites** at the top of the sidebar, wherever it happens to be filed.
Archiving shelves a drawing instead of deleting it; the archive screen restores
it (or deletes it for good), and archiving a folder takes its drawings with it.
[More](features/drawings.md).

The switcher at the very top swaps between **namespaces** — whole separate sets
of drawings, each with its own undo history and its own synced file.

## The sidebar footer

Below the buttons, a thin chevron folds the footer away when you want the room
for your drawings — it remembers the choice. Unfolded it holds **Donate**,
**About** (what's new, the source repository with this build's identifier, and
the privacy policy), **check for updates**, and **Settings**.

## Making it look how you like

Paint opens in the **System** theme, following whether your device is set to
light or dark. Settings → **Appearance** carries the framework's theme engine if
you'd rather pick: presets, a custom palette, the font family and size, corner
radius, density, borders, and how far dialogs dim the page behind them. Settings
→ **General** picks the app language (English or Swedish) and how the sidebar
opens on a phone.

## Keeping and sharing

- The header's download button opens a menu: the open page as a **PNG**, a
  **JPG** or an **SVG**, or copied straight to the clipboard. Settings →
  **Download** picks which types the menu offers, whether a file covers the whole
  page or just the part you drew on, and whether the background is kept or left
  transparent. [More](features/export.md).
- Drag an image file onto the canvas to add it to the drawing — or onto the
  drawings list to start a new drawing from it. [More](features/images.md).
- Settings → **Storage** exports the whole document as **JSON**, and connects a
  local folder, Dropbox, or Google Drive so your drawings follow you between
  devices — optionally encrypted end-to-end. [More](features/cloud-sync.md).

## Installing it

Use your browser's install affordance — "Install app" in Chromium, or Share →
"Add to Home Screen" on iOS. The installed app works offline and prompts you
when a new version is ready. [More](features/pwa.md).
