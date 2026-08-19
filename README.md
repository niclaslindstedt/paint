# Paint

> A local-first sketchpad PWA for drawing the diagram you'd otherwise draw on a
> whiteboard — with tools you switch on when you need them.

[![ci](https://github.com/niclaslindstedt/paint/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/ci.yml)
[![seo](https://github.com/niclaslindstedt/paint/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/seo.yml)
[![pages](https://github.com/niclaslindstedt/paint/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/paint/actions/workflows/pages.yml)
[![license](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue.svg)](LICENSE)

## What

Paint is a small installable web app for sketching a concept: boxes, arrows, a
circled bit, a scribble. It opens on a page, a paint program's toolbox — pen,
marker, highlighter, eraser, airbrush, paint bucket and gradient, text,
the shapes, a selection marquee and the colour dropper — and nothing else in the way. Drawings are vector strokes kept in your browser; nothing leaves the device
unless you connect storage yourself.

It is a sibling of the [`notes`](https://github.com/niclaslindstedt/notes) and
[`contacts`](https://github.com/niclaslindstedt/contacts) apps and is built on
the same [`oss-framework`](https://github.com/niclaslindstedt/oss-framework).

## Why

- **For explaining things.** The tool you reach for mid-conversation to show a
  colleague what you mean — quick to open, quick to export, quick to throw away.
  Drop a screenshot on the page and annotate it; download the result as a PNG, a
  JPG or a vector SVG, or copy it straight to the clipboard. Keep the whole
  thing as a `.pct` — every layer, and the marks that made them — and open it
  again exactly as you left it.
- **Tools are plugins.** Every tool, the pen included, is registered through
  one interface. It opens on the toolbox you already know — pen, marker,
  highlighter, eraser, airbrush, bucket and gradient, text, the shapes, a
  selection marquee and the dropper — and the media that simulate their medium
  (a graphite pencil, a watercolour brush that spreads and granulates, a bristle
  paintbrush that goes from a round to a one-stroke flat on a dial, a crayon, a
  board chalk that sparkles and dusts past its own edge, a calligraphy nib)
  wait in
  Settings → Tools — the **…** at the end of the toolbar opens it — so the
  toolbar stays as simple as you want it and grows when
  you need it. Rearrange the row there too, and it rearranges here. Each tool
  remembers its own width, so a fat brush never costs you a fine pen.
- **Sizes a shop actually sells.** A document pixel is one dot of an iPhone's
  screen, so a width is a distance you can measure on the glass — set the marker
  to 5 mm, hold the drawing at 1:1, and the band under your thumb is five
  millimetres. The pencil comes in 0.3 / 0.5 / 0.7 /
  0.9 / 2.0 mm of lead, the paintbrush in a #2 round through a one-inch flat,
  type in points. Each tool's slider spends its middle four tenths on the range that
  tool is genuinely made in — the band is drawn on the track and the readout
  says **as made** when you are inside it — with a tenth below for finer than
  anybody makes and the top half running off to a nib as wide as the page. Each
  tool opens on the size it is reached for most of the time.
- **Every tool arrives knowing how it is held.** A watercolour brush is not a
  slider labelled Water — it is a wash, a wet-in-wet flood, a glaze and a dry
  brush, and each of those is a width and three dials at once. So the tools ship
  with those: a row of **presets** at the top of the tool's panel, each chip
  showing the mark it actually makes. The pencil comes as Sketch, Construction,
  Shading and Detail (a grade and a width together _are_ a pencil); the
  paintbrush as a round, a one-stroke flat, a filbert and a dry brush; the
  calligraphy pen as the three hands anyone is taught; the bucket as a flat
  fill, a soft edge and a pale wash. Every row opens with the tool exactly as it comes, so one press
  puts back whatever you have done to it. Tools with only one setting worth
  handing anybody — the shapes, type — skip the row and simply open on it.
- **Save the tool, not the setting.** Once you have found the 4B at 0.7 mm
  under a light hand, press the **star** beside the tool's name, call it "my
  sketching pencil" and give it a mark to know it by, and it is one press away
  from then on. A saved tool carries its width and every dial, and it belongs to
  the tool it was saved from.
- **Two ways to rub something out, one button.** The **eraser** is a hole: it
  takes off whatever it covers, at whatever strength you set it to. Press it
  again for the **rubber**, which is a real one — it lifts pencil and chalk a
  little at a time, leaves the paper's grain showing through what is left,
  never quite takes all of it, and leaves ink, paint, crayon and marker exactly
  where they are. So you can sketch in pencil, ink over the sketch, and rub the
  sketch out.
- **Eleven shapes, one button.** Rectangle, ellipse, line, arrow, rounded
  rectangle, triangle, diamond, pentagon, hexagon, star and double arrow share a
  single toolbar button and a single switch: press it again for the family, and
  for the toggle that fills them in.
- **Cut a window in the page.** The selection tool is a box, an oval or a lasso
  — or the contours of what is already painted — and what settles is an **area**
  rather than a list of marks: paint in it and the mark is cut to it, drag it
  with the hand and what is painted under it travels, drag it with the marquee
  and the window slides and leaves the ink behind. Corner grips adjust it
  afterwards, and a 300% magnifier floats beside the edge you are placing so you
  can put it between two pixels rather than near them. Delete (or a tap with the
  rubber) clears what is inside; Ctrl/⌘+C, X and V copy, cut and paste it — and a
  paste also brings in marks from another tab, a screenshot from anywhere, or
  words, which open the caption box so you can set the typeface and size before
  they land.
- **Watercolour that behaves like watercolour.** What you paint with is
  _water_, and the pigment only goes where the water took it: the wash spreads
  past the hair that laid it, both its edges follow the paper rather than your
  gesture, the rim dries darkest the way a real one does, the pigment granulates
  into the sheet's dips, and nothing covers — every layer shows what is under
  it, so glazing a second pass over the first really does deepen it. How much
  water is on the brush, how much colour is in the water, and how heavily the
  paper takes it are three dials. Behind them is a **pigment simulation** that
  puts water on the paper a step at a time and lets the mark be whatever dries —
  blooms, backruns, a frayed wet edge and a rim that gathers where the wash
  actually stopped. A detail slider in the brush's own panel trades fineness back
  for speed, and any browser that cannot run the field at all still paints the
  wash.
- **A pencil that knows what paper it is on.** The pencil presses a lead into
  _this page's own sheet_: a hard lead rides the peaks and leaves the valleys bare —
  a broken sparkle on rough stock, very nearly solid on hot-pressed — shading a
  patch twice fills in what the first pass could not reach, a patch of paper
  holds only so much graphite before it stops taking any, and on cotton duck the
  lead catches the crowns of the weave and skips the troughs. The grain dial you
  set when you made the page moves all of it, and so does the **pressure** dial:
  a light hand rides the crowns and leaves a broken guide line, a heavy one gets
  into the tooth and lays a solid dark, and neither makes the line any wider.
  Slider-tuned like the wash, and it falls back the same way.
- **Brushes that are their medium.** The paintbrush _simulates its paint_ the
  way the pencil and the calligraphy pen simulate theirs: a head of hair
  presses a finite dip of paint onto the page's own grain, covers in an opaque
  slab scratched through with the hairs' partings, thins to streaks as the dip
  is spent, breaks up into a dry-brush scumble on the paper's tooth, and
  trails a fading film for as far again — sooner on a sheet that drinks, with
  edges that wick on paper that does. One **flatness** dial runs it from the
  round that lays the same width every way to the one-stroke flat that swells
  and thins round a curve on its own, with the filbert in between; hardness
  spans the pressure series from loaded slab to scumble. The airbrush is a spray cone that builds up where
  you linger. The pencil is graphite caught on the paper's tooth, grey whatever
  the ink is set to, with a lead that runs from a hard pale H to a soft dark B.
  The marker and the highlighter are two shapes of felt tip — a round bullet and
  a flat wedge that draws a band one way and a hairline the other. Not one pen
  at five different widths.
- **Canvas presets.** A page you set up once and named — a sketchbook, a phone
  wallpaper, a comic panel — standing on the New image shelf beside the sizes the
  app ships with, and drawn to the same scale. A preset can carry **its own
  toolbar**: a page made on your sketchbook opens with a pencil, an eraser and
  nothing else, in the order you put them in, every time you open it, while the
  photo in the next drawing still has the whole toolbox. It can suggest a canvas
  type too, which lands in the picker and stays yours to change. Settings →
  **Canvas** makes them, and hides the shipped sizes you never reach for.

- **Paper, canvas, or a plain sheet.** The page has a material as well as a
  colour, and **New image** asks for all three at once — size, page colour, and
  canvas type: a solid digital sheet, one of four papers (cartridge,
  cold-pressed, rough, hot-pressed) or primed cotton duck, in the order they get
  used rather than by how coarse they are, each stock drawn on the colour you
  picked so you compare them as the page they will be, with a grain slider that
  repaints the whole shelf as you drag it and opens where that sheet is reached
  for — rough with its tooth up, hot-pressed with barely any. The colour opens on
  **no colour** — a chequer, and a PNG or SVG of that image downloads with
  nothing behind it — and whichever you pick is named under the row. Sizes stand
  the way your screen does, so a phone offers four upright pages, and one **Flip**
  turns the whole shelf over. Like the size they stay put afterwards, since a mark is painted
  _into_ the sheet it was made on. That grain is painted
  _under_ the marks, so it shows through a wash and not through an opaque line —
  and on a sheet that drinks, the wet tools start behaving like it. A wash mixes
  with the colour it lands on instead of covering it, so red over blue is purple
  and blue over red is a different picture; an ink line a wash crosses feathers
  out into the water; a marker on rough goes furry and a pencil on any of it
  stays a pencil. Mixing is scoped to a layer, so putting a mark on another one
  keeps it out of the water.
- **Type on the page.** The text tool drops a caret wherever you tap and you
  type into the drawing itself, in the size, colour and typeface it will land
  in — four faces, bold and italic. Drag the box to put the caption somewhere
  else before you keep it.
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
- **Effects that actually land.** Blur or scatter grain from the right-hand
  panel's **Effects** section — noise on the layer you have selected, blur on
  that layer or across the whole stack. An effect is applied **once** and is
  then part of the picture: marks you make afterwards are unaffected, blurring
  twice blurs the blur, and drawing or rubbing out on what you softened is as
  fast as anywhere else. The page behind shows the setting as you dial it, and
  nothing lands until you press Apply; undo puts your marks back. See
  [`docs/features/effects.md`](docs/features/effects.md).
- **A colour section with the adjustments you expect.** Brightness and contrast,
  levels, a draggable tone curve with per-channel lines, hue and saturation,
  colour balance aimed at the shadows, midtones or highlights, and desaturate —
  all from the panel's **Colour** section, all previewed on the page as you set
  them, and all landing exactly the way an effect does. See
  [`docs/features/color.md`](docs/features/color.md).
- **Vector, not pixels.** Undo is exact, the document is small enough for a
  phone, and a synced copy is readable JSON rather than a blob.
- **A real file format.** `.pct` is a zip holding one transparent PNG per layer
  plus a readable manifest — so any other tool can pull your layers out — and
  the vector marks alongside, so reopening it in this app is lossless rather
  than a flatten. The same layers are written to your cloud backend as browsable
  files when you press the disk button. See
  [`docs/features/file-format.md`](docs/features/file-format.md).
- **Local-first.** No account, no server, works offline. Sync to a folder,
  Dropbox, or Google Drive only if you ask for it — optionally encrypted. A
  picture you drop on the page is filed beside the document as a real image
  file, so what syncs stays small and stays browsable.
- **A sheet of paper, whatever the room.** A page nobody has given a colour to
  is white and you draw on it in black, in a light app and a dark one alike —
  along with the pen you are handed and the width it arrives at, all four are
  Settings → **General → Defaults**, and either colour can be set back to
  following the theme. Change one and every drawing that never chose for itself
  re-sheets or re-inks; the ones that did keep what they were given.
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

Draw on the page. `P` the pen, `E` the eraser, `G` the pencil, `W` watercolour,
`S` airbrush,
`F` the paint bucket, `Y` the gradient, `R` / `O` / `L` / `A` the rectangle, ellipse, line and
arrow, `V` the selection marquee, `T` text, `I` the colour dropper, `D` the hand
(drag the page around) — left to right in the order a hand uses them;
`Ctrl/Cmd + Z` undoes a mark. The hamburger top left opens the drawings — so
does a swipe in from that edge, on anything with a touch screen — the panel on the right
resizes, flips and mirrors the page, and the **…** at the end of the toolbar
opens Settings → Tools, which switches the rest of the media on and puts the
toolbar in another order.

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
  drawing (which asks for the page size first), new folder, the archive, and the
  cloud sync glyph, in one row; the
  footer below it (foldable behind a chevron) holds Donate, About — What's new,
  the source, the privacy policy — and Settings. Checking for updates by hand is
  on Settings → Developer; the service worker finds a new build without being
  asked.
- **Toolbar** — two bands: the enabled tools fill the left, wrapping over two
  rows (three on a narrow phone), and everything that is not a tool sits in a
  fixed block against the right edge, divided off by a rule — colour and the
  tool's own button on its top row, undo and redo on its bottom one, in the same
  corner whatever you are holding. The ink button is the colour you draw with,
  and opens the palette, your own mixed colours, and a free colour mixer; the
  second button is
  the **nib**, and it shows a **press with the tool in your hand** — the mark
  that width actually leaves, painted by the painter that paints the page (bar
  the two rubbers, whose mark is a hole, so their width shows as a plain
  circle). It
  opens the widths, a slider for new ones, and — under an **Advanced** heading,
  open rather than folded away — the knobs belonging to the tool in your hand:
  how charged the head is, how much paint it was dipped with, how far it is
  squeezed toward a flat and which way the blade is turned for the paintbrush,
  water, pigment and granulation for
  the watercolour brush, flow for the airbrush, pressure for the crayon and the
  chalk, the
  lead's grade for the pencil — 8H through 9B, as a row of chips rather than a
  slider, because there is nothing between a 2B and a 3B — the chisel of a felt
  tip for the marker and the highlighter, the angle of the nib for the
  calligraphy pen and how much ink its nib was dipped with, strength for the
  eraser, pressure for the
  rubber, a feathered edge for the paint bucket and the gradient, how much page
  one press of the dropper reads, and opacity for the pen, the felt tips, the
  shapes and type. The simulated media — pencil, paintbrush, watercolour brush,
  crayon, chalk, broad nib — have no opacity: each is made lighter the way that
  medium is, by the hand, the pigment or the dip. Above the
  widths are two rows of whole tools, one press each: **Presets**, the ways the
  tool's own medium is used, shipped with it and each showing the mark it makes,
  and **Saved**, the ones you named yourself.
  They are kept per tool, so a soft brush stays soft without softening anything
  else. A tool with no width to set shows a **cog** in that slot instead — the
  paint bucket fills the area it traced whatever a nib might say, so it opens
  its own settings directly — and one that marks nothing at all shows no button
  there. A tool that mixes **its own inks** puts them at the head of that panel,
  under a press of the mark they make, and the ink button is crossed out while it
  is in hand: the gradient is poured from its own two colours (or three) and never
  from the toolbar's. Most tools have a single-key shortcut, and a button with a
  family behind it — the shapes, the fills, the two rubbers — opens the rest of
  it when you press it a second time; that panel is only as wide as the family
  behind it, so two tools open two buttons wide. **Undo and redo** are the
  bottom of the right-hand block — the one pair here that acts on the drawing
  rather than on the next mark.
- **Fills** — one button, two ways to fill an area: the **paint bucket**, flat
  in the ink you have picked, and the **gradient**, which floods the same area
  and pours a ramp of its own colours through it — press where the first colour
  starts, drag the way it should run, let go where the last one lands. Press the
  button again to choose which.
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
  over; the **Effects** section under it blurs or grains what is already there,
  and **Colour** under that holds the levels, curves, hue and balance.
  Every heading folds its section away, so you can collapse the ones you are not
  using. A press on the page closes the panel again, as does the header button
  that opened it — there is no close cross on it.
- **Canvas** — one finger (or a pen, or the mouse) draws, two pinch and pan,
  and with a fine pointer the cursor **is the nib**: a circle the size of the
  mark you are about to leave, on the page you are about to leave it on, growing
  and shrinking with the zoom. Tools that mark nothing by a nib keep the
  crosshair.
- **Header** — the drawing's name (edit in place), the favourite star, the disk
  button (when a backend is connected), the download menu (PNG, JPG, SVG, the
  layered `.pct`, or copy to the clipboard), and — at the far right — the button
  that shows and hides the side panel — folding the docked column away on a wide
  screen, sliding the panel over the page on a narrow one. Undo and redo are at
  the end of the toolbar.

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
