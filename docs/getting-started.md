# Getting started

Paint opens on a blank page with five tools. There is nothing to sign into and
nothing to configure — start drawing.

## The canvas

Press and drag to draw. The page is a fixed size that scales to fit your screen,
so a sketch looks the same on a laptop and a phone.

- **Pencil** (`P`) draws freehand.
- **Eraser** (`E`) paints over marks with the page colour.
- **Line** (`L`), **Rectangle** (`R`), **Ellipse** (`O`) drag from one point to
  another. A press that never moves is discarded.
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

## Drawings and sketchbooks

The sidebar lists the drawings in the current sketchbook. **New drawing** adds a
page; right-click (or long-press) a row to duplicate or delete it. The switcher
at the top of the sidebar swaps between **namespaces** — whole separate sets of
drawings, each with its own undo history and its own synced file.

## Making it look how you like

Settings → **Appearance** carries the framework's theme engine: presets, a
custom palette, the font family and size, corner radius, density, borders, and
how far dialogs dim the page behind them. Settings → **General** picks the app
language (English or Swedish) and how the sidebar opens on a phone.

## Keeping and sharing

- The header's download button exports the open page as a **PNG**.
- Settings → **Storage** exports the whole document as **JSON**, and connects a
  local folder, Dropbox, or Google Drive so your drawings follow you between
  devices — optionally encrypted end-to-end. [More](features/cloud-sync.md).

## Installing it

Use your browser's install affordance — "Install app" in Chromium, or Share →
"Add to Home Screen" on iOS. The installed app works offline and prompts you
when a new version is ready. [More](features/pwa.md).
