# Paint

> A local-first sketchpad PWA for drawing the diagram you'd otherwise draw on a
> whiteboard — with tools you switch on when you need them.

[![ci](https://github.com/niclaslindstedt/paint/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/ci.yml)
[![seo](https://github.com/niclaslindstedt/paint/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/seo.yml)
[![pages](https://github.com/niclaslindstedt/paint/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/pages.yml)
[![license](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue.svg)](LICENSE)

## What

Paint is a small installable web app for sketching a concept: boxes, arrows, a
circled bit, a scribble. It opens on a page, a handful of tools — pencil,
paintbrush, airbrush, paint bucket, colour dropper, eraser — and nothing else in
the way. Drawings are vector strokes kept in your browser; nothing leaves the device
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
  one interface. A few are always on, a few more come switched on, and the rest
  — shapes, a crayon, a calligraphy nib, a neon pen — wait in Settings → Tools,
  so the toolbar stays as simple as you want it and grows when you need it.
- **Brushes that are their medium.** The paintbrush is a head of separate hairs
  that thins when you move fast and runs dry at the edges; the airbrush is a
  spray cone that builds up where you linger. Not a pencil at a different width.
- **A page the size you meant.** A new drawing asks how big its canvas is —
  this screen's own resolution by default, Full HD, 4K, square, A4 at 300 dpi, a
  sheet larger than any screen, or a size you type. The page is fixed after
  that, so the sketch looks the same everywhere it opens.
- **Layers when you want them.** Swipe in from the right edge for the stack: put
  the photo underneath, the tracing over it, the labels on top, and hide any of
  them. A drawing that never asks for a second layer is stored exactly as it was
  before layers existed.
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

Draw on the page. `P` pencil, `B` paintbrush, `S` airbrush, `F` the paint
bucket, `I` the colour dropper, `E` eraser, `D` the hand (drag the page around);
`Ctrl/Cmd + Z` undoes a mark. Open the sidebar for more drawings, and Settings →
Tools to switch the shapes and the rest on.

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
  nib. The ink button is split between the colour you draw with and the page
  colour that erases it, and opens the palette, your own mixed colours, and a
  free colour mixer; the nib button shows the width as a dot and opens the
  widths, a slider for new ones, and the hardness dial. Each tool has a
  single-key shortcut; a shape that can be filled opens a hollow / solid picker
  over the page when you press its button a second time, and the eraser opens
  the same kind of picker offering itself or a clean sweep of the whole page.
- **Layers panel** — swipe in from the right edge of the page (or tap the layers
  button in the header) for the drawing's stack, topmost first, each row showing
  a preview of what is on it: add a layer, pick the one you draw on, show and
  hide, reorder, delete. A press on the page closes it again.
- **Header** — the drawing's name (edit in place), the favourite star, the
  layers panel, and the download menu (PNG, JPG, SVG, or copy to the clipboard).
  Undo and redo are in the sidebar's button island.

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
