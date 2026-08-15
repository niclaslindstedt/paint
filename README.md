# Paint

> A local-first sketchpad PWA for drawing the diagram you'd otherwise draw on a
> whiteboard — with tools you switch on when you need them.

[![ci](https://github.com/niclaslindstedt/paint/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/ci.yml)
[![seo](https://github.com/niclaslindstedt/paint/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/seo.yml)
[![pages](https://github.com/niclaslindstedt/paint/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/pages.yml)
[![license](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue.svg)](LICENSE)

## What

Paint is a small installable web app for sketching a concept: boxes, arrows, a
circled bit, a scribble. It opens on a page, a paint program's toolbox — pencil,
airbrush, eraser, paint bucket, colour dropper, text, the shapes and a selection
marquee — and nothing else in the way. Drawings are vector strokes kept in your browser; nothing leaves the device
unless you connect storage yourself.

It is a sibling of the [`notes`](https://github.com/niclaslindstedt/notes) and
[`contacts`](https://github.com/niclaslindstedt/contacts) apps and is built on
the same [`oss-framework`](https://github.com/niclaslindstedt/oss-framework).

## Why

- **For explaining things.** The tool you reach for mid-conversation to show a
  colleague what you mean — quick to open, quick to export, quick to throw away.
  Drop a screenshot on the page and annotate it; download the result as a PNG, a
  JPG or a vector SVG, or copy it straight to the clipboard.
- **Tools are plugins.** Every tool, the pencil included, is registered through
  one interface. It opens on the toolbox you already know — pencil, airbrush,
  eraser, bucket, dropper, text, the shapes and a selection marquee — and the
  media it adds to that (a bristle brush, a marker, a crayon, a calligraphy nib,
  a highlighter) wait in Settings → Tools, so the toolbar stays as simple as you
  want it and grows when you need it. Rearrange the row there too, and it
  rearranges here. Each tool remembers its own width, so a fat brush never costs
  you a fine pencil.
- **Eleven shapes, one button.** Rectangle, ellipse, line, arrow, rounded
  rectangle, triangle, diamond, pentagon, hexagon, star and double arrow share a
  single toolbar button and a single switch: press it again for the family, and
  for the toggle that fills them in.
- **Pick marks up again.** Draw a box, an oval or a lasso with the selection
  tool — or trace the contours of what is already painted — and what you caught
  is yours: move it with the hand, copy, cut or delete it from the keyboard, a
  right-click or a long press. Ctrl/⌘+V pastes back — marks from
  another tab, a screenshot from anywhere, or words, which open the caption box
  so you can set the typeface and size before they land.
- **Brushes that are their medium.** The paintbrush is a head of hair: it lays
  down opaque paint with the hairs' partings scratched through it, frays at the
  sides, and runs dry towards the end of a long drag. Turn it down and you get
  the whole pressure series off a reference sheet — a loaded flat that covers
  edge to edge, a medium mark streaked through, a dry brush that is mostly
  paper — and it can be worn open until its side is a fringe, or set on paper
  that wicks its edges soft. The airbrush is a spray cone that builds up where
  you linger. Not a pencil at a different width.
- **Type on the page.** The text tool drops a caret wherever you tap and you
  type into the drawing itself, in the size, colour and typeface it will land
  in — four faces, bold and italic.
- **A page the size you meant.** New asks what the drawing is made of — an empty
  page, an image from disk, or whatever is on the clipboard — and, for an empty
  one, how big it is. The four sizes are _drawn_ at one shared scale (this
  screen, Full HD, 4K, A4), so you pick by comparing rectangles rather than by
  reading numbers. The page is fixed after that, so the sketch looks the same
  everywhere it opens.
- **Layers, from the first stroke.** Every drawing opens as a locked
  **Background** — the page colour itself — with **Layer 1** over it, so nothing
  you draw lands under everything else by accident. Swipe in from the right edge
  for the stack: put the photo underneath, the tracing over it, the labels on
  top, hide or lock any of them. Hiding the background takes the page colour
  with it, and a transparent export leaves that layer out. A drawing nobody
  restacks is stored exactly as it was before layers existed.
- **Vector, not pixels.** Undo is exact, the document is small enough for a
  phone, and a synced copy is readable JSON rather than a blob.
- **Local-first.** No account, no server, works offline. Sync to a folder,
  Dropbox, or Google Drive only if you ask for it — optionally encrypted. A
  picture you drop on the page is filed beside the document as a real image
  file, so what syncs stays small and stays browsable.
- **A page that matches the room.** The app opens in your device's light or dark
  setting, and the canvas follows it: dark app, dark page, light ink — flipping
  it re-inks the sketch rather than hiding it.
- **Findable when there are many.** Star the ones you keep coming back to, group
  the rest into folders, and archive what you're done with instead of deleting
  it.
- **Tidy it with the gesture you have.** Swipe a sidebar row to archive or
  delete it, or hold it and drag it onto a folder, another sketchbook, or the
  archive — every target lights up as you lift the row. On a desktop it's a
  right-click menu and a mouse drag instead.

## Prerequisites

- [Node.js](https://nodejs.org/) 24+ (see `.nvmrc`)
- npm 10+
- A GitHub personal access token with the `read:packages` scope — the
  `@niclaslindstedt/oss-framework` dependency is published to GitHub Packages,
  which requires auth even for public packages.

## Install

```bash
git clone https://github.com/niclaslindstedt/paint.git
cd paint
```

Point the scope at GitHub Packages by adding the token to your **user** `.npmrc`
(the committed project `.npmrc` sets the registry but carries no token):

```
//npm.pkg.github.com/:_authToken=<your token>
```

Then:

```bash
make install
```

## Quick start

```bash
make install
npm run dev          # http://localhost:5173
```

Draw on the page. `I` the colour dropper, `P` pencil, `S` airbrush, `E` eraser,
`F` the paint bucket, `T` text, `R` / `O` / `L` / `A` the rectangle, ellipse,
line and arrow, `V` the selection marquee, `D` the hand (drag the page around) —
left to right in the order Photoshop's column runs top to bottom; `Ctrl/Cmd + Z`
undoes a mark. The hamburger top left opens the drawings, the panel on the right
resizes, flips and mirrors the page, and Settings → Tools switches the rest of
the media on and puts the toolbar in another order.

To build and preview the production bundle (service worker and all):

```bash
make build
npm run preview
```

## Usage

| Command          | What it does                                      |
| ---------------- | ------------------------------------------------- |
| `npm run dev`    | Dev server with hot reload                        |
| `make build`     | Production build into `dist/`                     |
| `make test`      | Test suite (vitest)                               |
| `make lint`      | ESLint + `tsc --noEmit`                           |
| `make fmt`       | Format with Prettier                              |
| `make fmt-check` | Verify formatting (what CI runs)                  |
| `make icons`     | Regenerate the PWA icons, favicon, and OG image   |
| `make check-seo` | Build, then assert the SEO / PWA shape of `dist/` |
| `make bump`      | Print the semver bump the next release will take  |

### In the app

- **Sidebar** — namespaces (separate sketchbooks), your starred drawings, and
  the drawing list grouped into folders. Rows swipe (right archives, left bares
  Delete), drag (onto a folder, the top level, another sketchbook, or the
  archive) and, on a desktop, right-click for the full menu. The button island
  at its foot holds new
  drawing (which asks for the page size first), new folder, the archive, undo,
  redo, and the cloud sync glyph; the
  footer below it (foldable behind a chevron) holds Donate, About — What's new,
  the source, the privacy policy — check for updates, and Settings.
- **Toolbar** — the enabled tools, then one button for colour and one for the
  nib. The ink button is the colour you draw with, and opens the palette, your
  own mixed colours, and a free colour mixer; the nib button shows a **press with the tool in your
  hand** — the mark that width actually leaves, painted by the painter that
  paints the page — and opens the
  widths, a slider for new ones, and — behind an **Advanced** fold — the knobs
  belonging to the tool in your hand: how charged the head is, its hair gauge,
  how far it has splayed and how far the paper bleeds for the paintbrush, flow
  for the airbrush, pressure for the crayon, a feathered edge for the paint
  bucket, opacity for most of the rest. They are kept per tool, so a soft brush
  stays soft without softening anything else. Most tools have a single-key
  shortcut, and the shapes button opens the other ten — and the hollow / solid
  toggle — when you press it a second time.
- **Selection** — one button, four ways to pick marks out: a box (`V`), an
  oval, a freehand lasso, and a **trace** that follows the contours of whatever
  is drawn under your finger rather than a shape you drew over it. Press the
  button again to choose which. Move what you caught by switching to the hand
  and dragging from inside the outline; copy, cut and delete with
  `Ctrl/Cmd + C`, `X` and `Delete`, or from the menu a right-click (or a long
  press) opens on them. `Ctrl/Cmd + V` pastes marks, a picture or words back
  into the page.
- **Layers panel** — swipe in from the right edge of the page (or tap the panel
  button at the far right of the header) for the drawing's stack, topmost first,
  each row showing a preview of what is on it: add a layer, pick the one you
  draw on, show and hide, lock, reorder, delete. Every drawing starts with a
  locked **Background** — the page itself — and **Layer 1** over it. The
  Background stays at the bottom of the stack: it is the page, so it does not
  move and nothing slides under it. The **Image** heading above the
  stack resizes, flips and mirrors the page, and its bin starts the drawing
  over. A press on the page closes it again.
- **Header** — the drawing's name (edit in place), the favourite star, the
  download menu (PNG, JPG, SVG, or copy to the clipboard), and — at the far
  right — the button that opens the side panel. Undo and redo are in the
  sidebar's button island.

## Configuration

Everything works with no configuration. Build-time environment variables switch
the optional cloud backends on — `VITE_DROPBOX_APP_KEY`,
`VITE_GOOGLE_CLIENT_ID`, and the folder-name overrides. See
[`docs/configuration.md`](docs/configuration.md).

## Examples

[`examples/`](examples) holds a sample document you can import through
Settings → Storage, and the JSON shape a drawing takes on disk.

## Troubleshooting

Common problems — a tool missing from the toolbar, a cloud backend that won't
connect, an update that won't apply — are in
[`docs/troubleshooting.md`](docs/troubleshooting.md).

## Documentation

- [Getting started](docs/getting-started.md) — the app surface, tour by tour.
- [Configuration](docs/configuration.md) — build-time environment variables.
- [Architecture](docs/architecture.md) — how the pieces fit, and why vector.
- [Troubleshooting](docs/troubleshooting.md)
- [Feature docs](docs/features) — the read-more halves of the changelog
  bullets, also rendered inside the app's "What's new" dialog.

## Contributing

Issues and pull requests are welcome — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow, the commit conventions,
and what CI expects. AI agents should start at [`AGENTS.md`](AGENTS.md).

Bugs and feature requests go to
[Issues](https://github.com/niclaslindstedt/paint/issues); open-ended questions
to [Discussions](https://github.com/niclaslindstedt/paint/discussions).
Security reports follow [`SECURITY.md`](SECURITY.md).

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for noncommercial use.
