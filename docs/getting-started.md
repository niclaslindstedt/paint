# Getting started

Paint opens on a blank page with a toolbar under it. There is nothing to sign
into and nothing to configure — start drawing.

## The canvas

Press and drag to draw. The page is a fixed size, larger than the screen you see
it through, so a sketch looks the same on a laptop and a phone — you just see
less of it at once.

- **Pencil** (`P`) draws freehand.
- **Eraser** (`E`) paints over marks with the page colour.
- **Line** (`L`), **Rectangle** (`R`), **Ellipse** (`O`) drag from one point to
  another. A press that never moves is discarded.
- **Hand** (`D`) drags the page around instead of drawing on it — and
  double-tapping with it fits the whole page, again for 1:1.
- `Ctrl/Cmd + Z` undoes the last mark, `Ctrl/Cmd + Shift + Z` redoes it. Every
  mark is one step.

The toolbar under the page also carries the ink colour, the stroke width, and —
for the shape tools — a **Fill shapes** toggle.

## More tools

Settings → **Tools** lists the optional tools: an arrow, a marker, a
highlighter. Switch one on and it joins the toolbar immediately. Switching it
off later only hides it; marks you already drew stay put.
[More about the plugin model](features/plugins.md).

## Light page, dark page

Settings → **Canvas** picks whether you draw on a light or a dark sheet, or
follow the app theme (the default). Marks that never chose a colour follow the
page, so flipping the theme re-inks the whole sketch instead of hiding it.
[More](features/canvas-theme.md).

The same tab has the on-screen grid, and can pin a specific page colour to the
drawing you have open.

## Drawings, folders, and sketchbooks

The sidebar lists the drawings in the current sketchbook, most recently edited
first. Right-click (or long-press) a row for its actions: star it, file it into
a folder, duplicate it, archive it, or delete it.

The block of buttons at the foot of the sidebar is where the rest lives — **new
drawing**, **new folder**, the **archive**, **undo**, **redo**, and the **cloud
sync** glyph, which shows the sync state and opens the sync details.

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

- The header's download button exports the open page as a **PNG**.
- Settings → **Storage** exports the whole document as **JSON**, and connects a
  local folder, Dropbox, or Google Drive so your drawings follow you between
  devices — optionally encrypted end-to-end. [More](features/cloud-sync.md).

## Installing it

Use your browser's install affordance — "Install app" in Chromium, or Share →
"Add to Home Screen" on iOS. The installed app works offline and prompts you
when a new version is ready. [More](features/pwa.md).
