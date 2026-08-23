# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Released sections below are **generated at release time from the changeset
fragments** in `.changes/unreleased/` — add a fragment per user-visible change
(see `AGENTS.md` → "Changelog and feature docs"), and the Release workflow
collates them into a dated section here. Each bullet is a bold title and a
single sentence; a big feature carries a **Learn more** link to its feature
doc. Do not hand-edit the released sections.

## [Unreleased]

## [0.1.1] - 2026-08-23

### Added

- **Layers** — Drawings now have layers: swipe in from the right edge of the canvas (or tap the
  layers button in the header) for a panel where you can add, pick, show, hide,
  reorder and delete them. [Learn more](feature:layers)
- **Light page, dark page** — The canvas now follows the app theme — a dark app draws on a dark page in light ink — and a page given a colour of its own when it is made ignores the theme from then on. [Learn more](feature:canvas-theme)
- **A rubber, not just an eraser** — Press the eraser a second time for the **rubber**, which behaves like a real one: it lifts pencil and crayon a little at a time, leaves the paper's grain showing through, never quite takes all of it, and leaves ink, paint and marker exactly where they are — so you can sketch in pencil, ink over the sketch, and rub the sketch out. [Learn more](feature:plugins)
- **A button island in the sidebar** — New image, new folder, the archive and the cloud sync glyph now share one row of buttons pinned above the sidebar footer, under your thumb however long the drawing list grows. [Learn more](feature:drawings)
- **Favorites** — Star a drawing from the canvas header and it mirrors into a Favorites section at the top of the sidebar, one tap away wherever it is filed. [Learn more](feature:drawings)
- **Folders and an archive** — Group drawings into folders, and shelve the ones you're done with in the archive instead of deleting them — archiving a folder takes its drawings with it, and restoring brings them back together. [Learn more](feature:drawings)
- **A foldable sidebar footer** — The footer now carries Donate, an About dropdown with What's new, the source repository and the privacy policy, and folds away behind a chevron rail when you want the room for your drawings. [Learn more](feature:drawings)
- A privacy policy, linked from the sidebar's About dropdown and served at /privacy.
- **A page bigger than the screen** — A page larger than the window opens as a window onto it — pinch to zoom, two fingers to pan, and double-tap (or the zoom readout in the corner) to fit the whole page. [Learn more](feature:canvas)
- **A hand to drag the page** — Pick the hand (`D`) and a one-finger drag moves the page around instead of drawing on it — no second finger needed — and a double-tap with it fits the whole page, again for 1:1. [Learn more](feature:canvas)
- **Brushes, an airbrush, a bucket and a dropper** — The toolbar now opens with a bristle paintbrush, an airbrush that builds up where you linger, a paint bucket that fills an empty space up to the marks around it, and a dropper that draws with the colour you tap — plus a crayon, a calligraphy nib and a neon pen waiting in Settings → Tools. [Learn more](feature:plugins)
- **Download as PNG, JPG or SVG** — The header's download button now opens a menu — one row per file type, plus copy-to-clipboard — so a sketch can leave as a PNG, a JPG, a vector SVG, or straight into whatever you were about to paste it in. [Learn more](feature:export)
- **Download settings** — Settings → Download picks which file types the menu offers, whether a download covers the whole page or crops to the marks, and whether it keeps the page colour or leaves the background transparent. [Learn more](feature:export)
- **Drop an image onto the page** — Drag an image file onto the canvas and it floats there until you place it — drag to move, pull a corner to scale, Enter or a click outside to keep it — growing the page if the picture is bigger than the sheet. [Learn more](feature:images)
- **Drop an image onto the sidebar** — An image dropped on the drawings list starts a new drawing from it, cut to the picture's size and named after the file. [Learn more](feature:images)
- **Pick the canvas size** — New images now ask how big the page should be — this screen's own resolution
  by default, presets for Full HD, 4K, a large sheet, square and A4 at 300 dpi, or
  a size you type yourself. [Learn more](feature:canvas)
- **Swipe, drag, and right-click in the sidebar** — Swipe a sidebar row right to archive it or left to bare a Delete button, hold and drag one onto a folder, another sketchbook, or the archive — and on a desktop, right-click it for the same actions. [Learn more](feature:drawings)
- **Move drawings between sketchbooks** — Drag a drawing — or a whole folder, drawings and all — onto another sketchbook's row in the namespace switcher to hand it over. [Learn more](feature:drawings)
- **The tool you picked, named** — Picking a tool now names it over the middle of the page for a moment, so a marker and a crayon tell each other apart without a trial stroke — switch it off under Settings → General. [Learn more](feature:canvas)
- **Every tool tunes itself** — The size button now opens the tool in your hand as well as the width: an Advanced fold with the two knobs that tool actually has — hair gauge for the paintbrush, flow for the airbrush, pressure for the crayon, a feathered edge for the paint bucket, opacity for the rest — kept per tool, so a soft brush stays soft without softening anything else. [Learn more](feature:plugins)
- **Type on the page** — A text tool drops a caret wherever you tap and you type straight into the drawing, in the size, colour and typeface it will land in — four faces, bold and italic, and Enter breaks the line. [Learn more](feature:plugins)
- **Start a drawing from a picture** — New image now asks what the page is made of — an empty page, an image from disk, or the picture on your clipboard — and gets the sidebar out of the way while it asks.
- **A page size you type** — The new-image shelf has a fifth cell for a size of your own — it opens on 2048 × 2048 and is drawn beside the named sizes at the same scale, so a typed page is compared rather than imagined. [Learn more](feature:canvas)
- **Rearrange the toolbar** — Settings → Tools now lists the whole toolbar in the order the buttons sit in, with arrows beside each row that move it — and the toolbar follows. [Learn more](feature:plugins)
- **Select, move, copy** — A new selection tool drags a box around marks you have already drawn: move them with the hand, and copy, cut or delete them from the keyboard, a right-click, or a long press. [Learn more](feature:selection)
- **Resize, flip and mirror** — The right-hand panel can turn the whole page around: resize the drawing or just the sheet (a bigger one for room, a smaller one to crop, with a nine-way anchor and a picture of what falls off), flip it a quarter turn either way, or mirror it — one undo step each. [Learn more](feature:canvas)
- **Paste into the page** — Ctrl/⌘+V now pastes into the drawing — marks copied from this app, a picture from anywhere, or words, which open the caption box so you can set the typeface and size before they land. [Learn more](feature:selection)
- **A second watercolour** — Settings → Tools now offers a choice of two watercolours: the stroke model the app has always painted, and a **pigment simulation** where there is water on the paper and colour in the water and the mark is whatever is left when it dries — blooms, a frayed wet edge, granulation that rolls into the paper's valleys, and a rim that gathers where the wash actually stopped. [Learn more](feature:surface)
- **A worn brush, and paper that bleeds** — The paintbrush's Advanced fold gains **Splay**, which wears the head open from a crisp new flat to one with a fringe on it, and **Bleed**, which lets a wet edge wick into the paper — the brush's one soft edge, off unless you ask for it. [Learn more](feature:plugins)
- **Pencil pressure** — The pencil has a **pressure** dial for how hard you are leaning on the lead —
  and drawing quickly no longer pales a line away, so a fast sketching hand lays
  down the mark it drew. [Learn more](feature:plugins)
- **Nib angle on the felt tips** — The marker and the highlighter can now be turned as well as squashed — a **nib
  angle** dial beside their chisel, so a highlighter at 0° strikes a margin down
  the page instead of underlining across it. [Learn more](feature:plugins)
- **A Colour section in the panel** — Brightness and contrast, levels, a draggable tone curve with per-channel lines, hue and saturation, colour balance and desaturate now sit in the right-hand panel, previewed on the page as you set them and applied like any other effect. [Learn more](feature:color)
- **Chalk** — A new chalk tool simulates a soft board stick on the page's own sheet: it covers in one pass yet keeps its dark pinholes, streaks along a broad drag, dusts past its own edge, and bolds under a second pass or a heavier hand. [Learn more](feature:plugins)
- **Crop** — **Crop…** in the panel's Image section puts a rectangle over the drawing — drag
  it by any edge or corner, lock it to a shape from the little card at the foot of
  the page, and Enter cuts the sheet down to it.
- **Add to a selection, or take from it** — Every selection tool can now build on the window you already have instead of
  starting a new one — hold Shift to add or Alt to subtract, or hold the selection
  button and pick a mode where there is no keyboard. [Learn more](feature:selection)
- **Desktop app** — Paint now ships as a desktop download for Windows, macOS and Linux — the same
  app as the website, with the whole thing bundled inside it so it works with no
  network at all. [Learn more](feature:desktop-app)
- **Drag a corner to resize** — The resize dialog draws the new page over the old one and lets you pull it by its corners like a crop tool, with a latch beside the fields that keeps the proportions. [Learn more](feature:canvas)
- **Four ways to select** — The selection button now holds a box, an oval, a freehand lasso and a trace that
  follows the contours of whatever is drawn under your finger — press it again to
  pick one, the way the shapes button works. [Learn more](feature:selection)
- **A paint file with layers** — Drawings save and open as `.pct` — one file holding every layer as a
  transparent PNG plus the marks themselves, so it reopens exactly as you left it
  and any other tool can still read the layers. [Learn more](feature:file-format)
- **A pencil to sketch with** — There is now a graphite pencil in the toolbar: it draws grey on the paper's
  tooth whatever colour the ink is set to, with a lead you can run from a hard
  pale H to a soft dark B. [Learn more](feature:plugins)
- **A disk button for the layers** — The header's disk button (or ⌘/Ctrl+S) files your layers out to your cloud
  backend as browsable PNGs when you decide they are worth uploading — your
  marks keep saving themselves, as they always did. [Learn more](feature:file-format)
- **An eraser you can turn down** — The eraser has a strength dial, so one pass can fade a mark back instead of
  taking it off the page. [Learn more](feature:plugins)
- **A nib angle for the calligraphy pen** — The calligraphy pen's nib can be turned to any angle, so the strokes that swell
  are the ones your hand actually makes. [Learn more](feature:plugins)
- **Save a tool under a name** — Set a tool up the way you like it, press the **star** beside its name and call
  it "my sketching pencil" — with a mark to know it by, its width and every one of
  its dials come back in one press from then on. [Learn more](feature:plugins)
- **Watercolour** — A wet wash that spreads past the brush that laid it, dries darkest at the rim,
  granulates into the paper and never covers what is under it — with water,
  pigment and granulation to change between strokes. [Learn more](feature:plugins)
- **A flat brush** — The one-stroke brush, in Settings → Tools: full width pulled square across
  itself and a hairline pulled along its edge, so a single stroke swells and thins
  as it goes round a curve. [Learn more](feature:plugins)
- **Gradient** — Press the paint bucket a second time for the gradient beside it: it floods the same area and pours a ramp of its own two colours — or three — running whichever way you dragged. [Learn more](feature:plugins)
- **Paper and canvas** — Pick what the page is made of when you make it — a solid sheet, four papers or primed canvas — and the wet tools start behaving like it: on paper a wash mixes with the colour it lands on instead of covering it, drags an ink line it crosses out into the water, and settles into the sheet's own grain. [Learn more](feature:surface)
- **Every tool ships knowing how it is held** — Each tool's panel now opens with a row of **presets** — the pencil as Sketch,
  Construction, Shading and Detail, the watercolour brush as a wash, wet-in-wet, a
  glaze or a dry brush — and one press sets its width and every dial at once. [Learn more](feature:plugins)
- **Dropper sample size** — The colour dropper has a cog of its own now, setting how much page one tap reads — a single pixel, or the average of a disc up to eight millimetres across, which is what makes it usable on a sprayed or grainy passage. [Learn more](feature:plugins)
- **The pointer is the nib** — With a mouse or a stylus the cursor is drawn as the mark you are about to make: a circle the width of the tool, at the page's own scale, growing and shrinking as you zoom. [Learn more](feature:canvas)
- **Fold the side panel away** — The header's panel button is now there on a wide screen too, so the docked right-hand column can be folded away when you want the page to have the full width. [Learn more](feature:layers)
- **Sizes stand the way your screen does** — Every canvas size in **New image** now faces the way the screen is being held — hold a phone upright and all of them are upright, A4 included — and a **Flip** cell at the end of the shelf turns the whole row over at once.
- **Effects** — The right-hand panel has an Effects section: blur or grain what you have already drawn, on the selected layer or — for blur — across the whole stack, applied once so that marks you make afterwards stay sharp and rubbing out on a softened layer is as quick as anywhere else. [Learn more](feature:effects)
- **Fold a panel section away** — Pressing a heading in the right-hand panel collapses that section — Image, Effects or Layers — and takes its buttons with it, so you can put the layer stack away while you work on something else.
- **Settings travel with your storage** — A connected folder, Dropbox or Google Drive now keeps a `settings.json` beside your drawings, so the tools you switched on, the widths and presets you tuned and the colours you mixed are already set up when you connect the same storage on another machine. [Learn more](feature:cloud-sync)
- **Canvas presets** — Set a page up once and name it — a sketchbook, a phone wallpaper — and it stands on the New image shelf beside the shipped sizes, bringing its own toolbar and its own canvas type with it. [Learn more](feature:canvas)
- **Hide the sizes you never use** — Settings → Canvas takes any of the four shipped page sizes off the New image shelf, so what is left is the sizes you actually reach for. [Learn more](feature:canvas)
- **Wash detail** — A detail slider beside them trades the pigment simulation's fineness back for
  speed, so a page full of washes still paints on a slower device. [Learn more](feature:surface)
- **Graphite pencil** — The pencil can draw by pressing a lead into the page's own paper, so the sheet
  you picked decides where the graphite catches and where it skips. [Learn more](feature:surface)
- **Pencil detail** — A detail slider beside it trades that simulation's fineness back for speed, so a
  page full of sketch strokes still draws on a slower device. [Learn more](feature:surface)
- **A canvas preset sets its tools up** — Press a tool's mark in a canvas preset's tool list and you can say which of a family that page's button opens on and how the tool itself is set, so a sketchbook page can open with a kneaded rubber at 20 mm rather than just "an eraser". [Learn more](feature:canvas)
- **Ink dial** — An Ink dial on the calligraphy pen sets how full a dip the nib gets per
  stroke — a low one writes the pale, broken strokes of a pen running dry, and
  past full it blobs where it lands. [Learn more](feature:surface)
- **More tools** — A **…** button at the end of the toolbar opens Settings straight on its Tools
  section, so the tools that are not switched on are one tap from the row instead
  of buried in the menu. [Learn more](feature:plugins)
- **Brush pressure** — The paintbrush has a **pressure** dial: draw with the point of a round for a
  fine, tidy line, or lean on it and the head spreads past its ferrule into a
  wide, wandering, ragged band that runs the dip out sooner — the stroke a round
  brush is bought for. [Learn more](feature:plugins)
- **Switch off the panel bits you never use** — Settings → Panel hides a whole section of the right-hand panel, or a single thing inside one — a page action, an effect, one of the controls on a layer row — so what is left is what you actually reach for. [Learn more](feature:panel)
- **A preview window on a phone** — An effect's options fill the screen on a phone and carry their own window onto the page — pan it, zoom it, hold Before to see the picture without the effect — so what you are dialling in is visible even when the dialog is over the drawing. [Learn more](feature:effects)
- **Move an effect's options out of the way** — Drag an effect dialog by its title to park it anywhere on a wide screen, so the card stops sitting over the part of the drawing you are watching. [Learn more](feature:effects)
- **Merge layers** — **Merge layers…** under the stack puts several layers on one — you tick which, and say where they land. [Learn more](feature:layers)
- **Pixel grid** — Zoom in until a pixel is a few pixels wide on screen and the page rules itself
  into single pixels — the squares a downloaded image resolves to — arriving at
  the same apparent size on a phone as on a desktop, with the zoom ceiling raised
  to leave room to work in among them. [Learn more](feature:canvas)
- **Picture diagnostics** — The Developer tab now reports, for every picture on the page, the size of the
  bitmap actually stored against the size it is drawn at — so a picture that is
  magnified before it is drawn says so instead of looking like a rendering bug. [Learn more](feature:images)
- **Selection pencil** — Paint a selection the way a pencil paints a line — every stroke adds to it, its
  Erase mode (or a held Ctrl/⌘) paints it away, and its feather dial makes a
  Delete fade out softly at the edges. [Learn more](feature:selection)
- **Invert selection** — With something selected, the side panel opens with a blue **Contextual** block
  whose Invert selection flips the window to everything on the page it wasn't. [Learn more](feature:selection)
- **Delete background** — Press **Delete background** in the panel's Image section, paint over the
  subject with the pencil it hands you, and the cut finds the subject's exact
  edge near your outline — with the searched band shown on the page while you
  trace, and search width, feather, colour tolerance and smoothness to taste. [Learn more](feature:delete-background)
- **Render the whole picture** — Settings → Performance is new, and its one switch keeps the whole drawing painted rather than only the part on screen, so zooming out reveals your work as you go instead of filling it in when your fingers lift.
- **Put an effect's options away** — Every effect dialog now has **Put away** beside Cancel: it folds the options
  down to a strip at the foot of the canvas and leaves the page to your hand, so
  you can trace a **Delete background** subject — or zoom in on what you are
  judging — with the settings still open and the page still previewing them. [Learn more](feature:effects)
- **Colour select** — A new selection tool picks a colour out everywhere it appears on the page — with
  a tolerance for how far a shade may drift, and a press on the bare paper
  choosing the background with your marks left out of it. [Learn more](feature:selection)
- **Gap select** — Another fills in the part of the page a selection has gone round but not
  covered — the forgotten middle of a traced ring, or, with nothing selected yet,
  the whole page in one press. [Learn more](feature:selection)
- **Undo for selections** — Selections are on the undo timeline now — cutting a window, sliding or
  stretching one, painting one more stroke of Draw select, inverting it or
  clearing it are each one ⌘/Ctrl+Z away, and redo puts them back. [Learn more](feature:selection)

### Changed

- **Simulated paintbrush** — The round and flat brushes are one paintbrush now, and it simulates its paint
  the way the pencil and calligraphy pen do: a finite dip spent over the page's
  own grain, a flatness dial that runs the head from a round to a one-stroke
  flat, and dry-brush scumble where the paint gives out. [Learn more](feature:plugins)
- The app now opens in the System theme and follows your device's light or dark setting, instead of booting on a fixed black-and-amber palette.
- The sidebar lists drawings most recently edited first, and drops the mark count from each row.
- **Fill moved onto the shape button** — The "Fill shapes" checkbox is gone from the toolbar: press a shape tool a second time and a picker opens over the page showing that shape hollow and solid, so the choice costs no toolbar room and needs no reading. [Learn more](feature:canvas)
- **A roomier canvas header** — Undo and redo have left the canvas header for the sidebar's button island and the keyboard, giving a drawing's name the width those two glyphs were taking on a phone. [Learn more](feature:canvas)
- **Shape tools are opt-in** — Line, arrow, rectangle and ellipse are off out of the box and switch on in Settings → Tools. [Learn more](feature:plugins)
- **Colour and size live behind one button each** — The swatch row and the four nib buttons are gone: the ink button shows your colour split against the page colour and opens a picker with a free colour mixer, and the nib button shows the width as a dot and opens the sizes, a slider for new ones, and the hardness dial. [Learn more](feature:canvas)
- **A tool rack in Settings** — Settings → Tools now reads as a rack: every tool wears the glyph it has in the toolbar, with an on/off switch on the right — the always-on ones included. [Learn more](feature:plugins)
- **Clear the page from the eraser** — The header's bin is gone — pressing the eraser a second time now offers either the eraser itself or a clean sweep of the whole page. [Learn more](feature:canvas)
- **Dropped pictures sync as real files** — A picture you drop on the page is now filed beside the synced document as a genuine `.png` / `.jpg` under `images/`, instead of riding along inside the JSON — so the document stays small, and the pictures are browsable in Dropbox, Google Drive, or the folder you picked. [Learn more](feature:cloud-sync)
- **Long-press picks a row up** — A long press on a sidebar row now lifts it for dragging instead of opening the action menu; the actions it used to open are reached by swiping the row, or by right-clicking on a desktop. [Learn more](feature:drawings)
- **A crayon that looks like a crayon** — The crayon is now wax caught on the paper's tooth — a speckled, chipped-edged
  mark whose grain belongs to the page, so a broad crayon lays down a wider band
  of the same fine texture instead of a scaled-up wobble. [Learn more](feature:plugins)
- **Toolbar order follows Photoshop** — The toolbar now runs left to right in the order Photoshop's tool column runs top to bottom — dropper, the brushes, eraser, paint bucket, the shapes, and the hand last. [Learn more](feature:plugins)
- **Tool glyphs** — Every tool button has been redrawn for the size it is actually shown at, so the
  brush, marker, highlighter, crayon and the rest are told apart at a glance
  rather than by their tooltips.
- **No stray text selections** — A drag across the app no longer smears a text selection over its labels or pops the copy callout on a phone, while the privacy page, the log and build panels, and anything you type into still select as before. [Learn more](feature:canvas)
- **A paintbrush that paints** — The paintbrush now leaves an opaque mark with the hairs' partings scratched through it — landing blunt, fraying along its sides and running dry towards the end of a long drag — and its hair stays a fixed gauge, so a wider brush gives you more streaks instead of fatter ones. [Learn more](feature:plugins)
- The colour and size buttons now follow the last tool onto its row rather than taking a row of their own.
- **The canvas header** — The header's buttons now wear the same bordered box the toolbar and the sibling apps use, and the drawing's name reads as a heading that only takes the keyboard once you press it. [Learn more](feature:canvas)
- **A new app mark** — The install icon, favicon and social card now carry a solid green pen drawn at the weight the sibling apps' marks wear, instead of the thin swipe that floated in the middle of the tile.
- **The width belongs to the tool** — Every tool now remembers its own width and opens at one chosen for it, so a fat paintbrush no longer costs you a fine pencil — and nothing needs setting up before it draws the way it should. [Learn more](feature:plugins)
- **Opens on a paint program's toolbox** — A first run finds the tools anyone who has opened a paint program already knows — pencil, brush, eraser, bucket, dropper, text and the three shapes — with the media this app adds to them (airbrush, marker, highlighter, crayon, calligraphy pen) one tap away in Settings → Tools. [Learn more](feature:plugins)
- **Canvas sizes you can see** — The four page sizes a new drawing can have — this screen, Full HD, 4K and A4 — are drawn at one shared scale instead of listed in a dropdown, so you pick by comparing rectangles rather than by reading numbers.
- **Eleven shapes, one button** — The shape tools now share a single toolbar button and a single switch: press it again for the family — rectangle, ellipse, line, arrow, rounded rectangle, triangle, diamond, pentagon, hexagon, star and double arrow — with the fill toggle under them. [Learn more](feature:plugins)
- **The airbrush comes in the box** — The default toolbar carries the airbrush where it used to carry the bristle paintbrush — the spray can is the tool every paint program ships — and the paintbrush is one tap away in Settings → Tools. [Learn more](feature:plugins)
- **The right-hand panel stays put** — On a wide screen the layers panel is docked beside the canvas instead of being summoned; on a narrower one it is still the button in the top right, and the drawings menu now opens from a hamburger beside the drawing's name. [Learn more](feature:layers)
- **The nib button shows the mark, not a dot** — The size button and every width in its panel now show a real press with the tool in your hand — an airbrush cone, a highlighter's band, the pen's flat edge, a letter at that type size — painted on your page in your ink, and redrawn as you turn the tool's own dials. [Learn more](feature:plugins)
- **A brush that runs dry the way one does** — One dip of the round and flat brushes now lasts about three times as long, and when the paint gives out the head keeps marking: a thin, pale film comes off the hairs for about as far again, coming apart and fading until there is nothing left. [Learn more](feature:plugins)
- **A brush that answers its dial** — The paintbrush now spans a whole pressure series instead of laying down the same slab at every setting — a loaded head covers edge to edge, a medium one is streaked through, and a dry one is mostly paper — and small brushes stay solid where a wide one at the same setting is streaking. [Learn more](feature:plugins)
- **Zooming, rubbing and pencil pages at frame rate** — Pinch and wheel zooming, working the rubber, and panning pages full of pencil
  marks are an order of magnitude faster: a zoom in flight carries the last frame
  instead of re-simulating every mark, landed pencil marks dry once and are
  blitted after, and the rubber lays each press once instead of re-walking the
  whole gesture on every pointer sample.
- **Width previews at life size** — The size button and every width in its panel now draw the mark at the size it
  will actually land at — the page at 100% — instead of shrinking it to fit, and
  the button itself is as wide as the colour swatch beside it. [Learn more](feature:plugins)
- **Toolbar** — The toolbar sits five pixels higher, so its bottom row clears the home indicator
  on an installed iOS app.
- **Name** — The app is called **Paint** in the browser tab and on your home screen, rather
  than Paint followed by a sentence about itself.
- **Airbrush sizes** — The airbrush's five size buttons now stop at the 12 mm general-purpose pattern
  instead of running on to 25 and 50 mm — the slider and the **Background** preset
  still reach the wide ones. [Learn more](feature:plugins)
- **The pencil draws in the grey its lead is** — A pencil has one colour and it came in the lead, so the ink button is struck out while the pencil is in your hand and the **grade** picks the grey instead — a hard lead scratches a pale line you can see the paper through, a soft one goes down nearly black. [Learn more](feature:plugins)
- **The toolbar you open on** — A new install now opens with the marker and the highlighter in the toolbar, and
  the pencil and the watercolour brush waiting one tap away in Settings → Tools;
  an install that already has them keeps them. [Learn more](feature:plugins)
- **No opacity on the simulated media** — The pencil, paintbrush, watercolour brush, crayon and broad nib no longer offer
  an opacity slider — each is made lighter the way that medium is, by the hand on
  it, the pigment in the water or the dip it was charged with — and marks you
  already drew are untouched. [Learn more](feature:plugins)
- **Crayon** — The crayon simulates its wax now — crumbs catching in clumps on the page's own sheet, passes that fill the tooth in and burnish toward solid — and a softness dial with presets runs it from china marker to wax crayon to oil pastel. [Learn more](feature:plugins)
- **Delete background searches what you painted** — Delete background now searches exactly the stripe the selection pencil painted — every part of the nib's width counts equally, so a finer pencil is a tighter search and the middle you filled in is never looked at. [Learn more](feature:delete-background)
- **A background layer, and locks** — Every drawing now opens with a locked **Background** layer carrying the page colour and **Layer 1** above it — hide the background for a transparent page, and lock any layer with the padlock to keep marks off it. [Learn more](feature:layers)
- **Start over** — Clearing a drawing has moved off the eraser to the bin beside the right-hand panel's **Image** heading, and now throws away the layers and the page colour along with the marks. [Learn more](feature:layers)
- **The side panel's button** — The button that opens the right-hand panel now sits at the far right of the
  header and wears the panel it opens, rather than a stack of layers in the middle
  of the row. [Learn more](feature:canvas)
- **Tool glyphs** — The tool buttons have been redrawn to a single design: every implement is a
  picture of the tool itself, told apart by its working end rather than by the
  mark it leaves.
- **The eraser takes ink off** — The eraser now removes what it covers instead of painting the page colour over
  it, so the sheet shows through the hole and a transparent export comes out with
  a real hole rather than a page-coloured smear. [Learn more](feature:canvas)
- **Marker glyph** — The marker's button is now the pen itself — a fat barrel and its chisel tip —
  instead of the pen sitting over a bar of the ink it lays down.
- **One colour on the ink button** — The ink button no longer splits the colour you draw with against the page colour
  that used to erase it — the eraser lifts ink now, and the sheet's colour belongs
  to the background layer. [Learn more](feature:canvas)
- **Tool glyphs** — Every tool button has been redrawn to the design sheet, the pencil included —
  the toolbox is now one set drawn to one hand rather than a borrowed icon
  sitting among the app's own.
- **The tool button beside the ink fits the tool** — The paint bucket has a cog holding its wash and feathered edge instead of a
  width it never used, the eraser shows its nib as a plain circle, tools that
  mark nothing show no button there at all, and a tool's Advanced settings are
  now a heading you can see rather than a fold you have to open. [Learn more](feature:plugins)
- **The marker and the highlighter are two pens now** — A felt tip has a shape: the marker opens at a tip you could write with and the
  highlighter is a broad flat wedge that lays a band across the page and a
  hairline down it, both adjustable from round to chisel. [Learn more](feature:plugins)
- **The airbrush sprays the width you asked for** — A size 8 airbrush now covers about what a size 8 pen does — only soft-edged
  instead of hard — and its trigger lays down twice the paint it used to.
- **Widths in millimetres** — Nib widths now read in millimetres of page — from a technical pen's 0.5 to a
  decorator's 200 — and the size panel is headed with the name of the tool you are
  setting. [Learn more](feature:plugins)
- **A toolbar that fits** — The tool buttons carry their glyph rather than a lot of air around one, and the
  row reads in the order a hand uses it — so a phone fits the whole toolbox on one
  line.
- **Every tool comes in the sizes it is really made in** — A page pixel is now one dot of an iPhone's screen, so a width is a distance you
  can measure on the glass, and each tool opens on the size it is reached for most
  of the time: the pencil offers the four leads a mechanical pencil takes, the
  round
  brush a #2 through a one-inch flat, type is set in points, and every tool's
  slider spends its middle four tenths on the range that tool is genuinely made
  in. [Learn more](feature:plugins)
- **One switch for the side panel** — The right-hand panel's close cross is gone — the header's panel button opens and closes it, and Escape or a press on the page still dismisses the floating one. [Learn more](feature:layers)
- **Pick the pencil's lead by name** — The pencil's grade is a row of chips from 8H to 9B rather than a slider to hunt
  along, because there is nothing between a 2B and a 3B. [Learn more](feature:plugins)
- On an installed iOS PWA the canvas screen gives its margins back to the page: the
  header now sits as close under the Dynamic Island as the canvas sits under the
  header, and the toolbar ends 10px above the bottom of the screen.
- **The ink button says no** — With a tool the colour means nothing to — the eraser, the hand, the marquee, the gradient — the ink button is now struck through in red and genuinely dead, where it used to be dimmed and open its picker anyway. [Learn more](feature:plugins)
- **Tools left, everything else right** — The toolbar is now two bands — the tools wrap over the left, and colour, the tool's own button, undo and redo sit in a fixed block against the right edge — so the controls you reach for most stay in the same corner however many tools you switch on. [Learn more](feature:canvas)
- **The eraser moved along the row** — The eraser now sits at the end of the media, one button left of the paint bucket, so the tools you draw with are an uninterrupted run and the two tools that work on an area are next to each other. [Learn more](feature:plugins)
- **New image** — New drawing is now **New image** — as often as not what starts there is a photo off the disk or a screenshot off the clipboard — it fills the screen on a phone with its title and its Create button pinned while the questions scroll, and it asks the page's **colour** and its **canvas type** beside its size, painting the six stocks on the colour you just picked and giving them a **Grain** slider that repaints the whole shelf as you drag it. [Learn more](feature:canvas-theme)
- **A page can be made of nothing** — The page colour now opens on a chequer that means no page at all — the marks land on transparency, the canvas draws the chequer under them in the app's own greys, and a PNG or an SVG of that image downloads with nothing behind it without your finding a setting for it (JPG has no transparency, so it keeps the colour the sheet would have had). [Learn more](feature:canvas-theme)
- **Grain moves to New image** — The sheet's **Grain** dial now sits under the canvas-type shelf where the sheet itself is picked, and the whole shelf repaints as you drag it, so you watch the tooth come up instead of taking a number on trust. [Learn more](feature:surface)
- **The page colour says what it is** — **New image** now names the page colour you have picked in the "Page colour" heading itself — _Page colour · Cream_ — in place of the paragraph that used to explain the row.
- **Grain opens where the sheet is bought for** — The **Grain** dial now starts at a setting that suits the stock you picked — rough with its tooth up, hot-pressed with barely any — and the canvas types are shelved in the order they actually get used rather than by how coarse they are. [Learn more](feature:surface)
- **One sketchbook to start with** — A fresh install now opens with a single sketchbook called **Default** instead of two — make the next one from the switcher's manager when you actually want it. [Learn more](feature:drawings)
- **The update row moves to Settings** — The sidebar footer's **Check for updates** row is gone — a new build installs itself and asks — and forcing the check by hand now lives on Settings → Developer, beside the build stamp. [Learn more](feature:pwa)
- **Room for far bigger sketchbooks** — Your drawings now live in IndexedDB rather than the browser's 5 MB localStorage, so a sketchbook full of dropped photos no longer runs out of room — existing drawings move across by themselves the first time you open the app.
- **The first page is your screen** — The blank page a first run opens on now matches your screen's size and orientation, the same "This screen" default the New image dialog offers.
- **Drawings open covering the window** — A drawing now opens with the page filling the window edge to edge — cropping the longer side equally at both ends instead of dropping you zoomed into the middle of the sheet — and the zoom readout now counts device pixels, so a screen-sized page covering the screen reads 100%. [Learn more](feature:canvas)
- **Wash engine** — The two watercolour engines are picked in the brush's own panel now — two
  swatches of the same stroke under the widths — instead of on a page in Settings. [Learn more](feature:surface)
- **Calligraphy ink** — The calligraphy pen writes with simulated ink: the stroke shades with your
  hand's speed, beads where the nib touches down and pools where it lifts,
  dries darker where it crosses itself, and runs dry — paling, railing and
  breaking up on the paper's tooth — as the stroke spends its dip. [Learn more](feature:surface)
- **One watercolour, one pencil** — The watercolour brush and the pencil now always paint with the pigment and
  graphite simulations, and the picker that used to offer a faster, flatter engine
  beside each is gone. [Learn more](feature:surface)
- **Wider presets** — The pencil's and the watercolour brush's presets each moved a step up their own
  rack, because a lead needs tooth under it and a wash needs page to dry on before
  either simulation has anything to work with. [Learn more](feature:surface)
- **Brushes run dry** — The round and flat brushes now spend their dip and stop — a marked dry stretch
  opens the stroke into scratches before the paint gives out entirely, the round
  holds twice the paint a flat's squeezed ferrule does, and a new Load dial sets
  how much one dip charges. [Learn more](feature:plugins)
- **Rubber** — The rubber now lifts pencil alone — a wax crayon mark smears under a real one
  rather than coming away, so it stays put with the ink and the paint. [Learn more](feature:plugins)
- **What the app opens on** — A page nobody has given a colour to is now a white sheet drawn on in black ink
  with the pen, whether the app is light or dark — and Settings → General →
  Defaults holds all four answers, including the tool you are handed when you
  delete the last drawing. [Learn more](feature:canvas-theme)
- **Type sizes shown at their real size** — The text tool's size button and its size row now draw the sample letter at the
  size it will actually land at — clipped by the button when it is bigger than the
  button — instead of shrinking every size to the same letter. [Learn more](feature:plugins)
- **The selection is a window now** — The selection tool cuts an **area** in the page rather than picking marks out —
  paint inside it and the mark is cut to it, drag it with the hand and what is
  painted under it travels, adjust it by its corner grips under a 300% magnifier,
  and clear what is inside with Delete or a tap of the rubber. [Learn more](feature:selection)
- **Paintbrush ends** — Every paintbrush stroke now comes off its own brush — the touch-down no longer stamps the same little cap at the head of every mark — and how fast you lift decides whether the stroke ends blunt and full or strings out into a pale fan. [Learn more](feature:plugins)
- **Arrange the right-hand panel** — Colour now sits under the layer stack rather than over it, and every section of the panel can be dragged by the grip on its heading into whatever order suits the way you work. [Learn more](feature:panel)
- **Levels over your own histogram** — The three levels handles now sit on a picture of your drawing's own tones, so you can see where the marks start and stop, what the ends are about to throw away, and put both of them on the data in one press of Auto. [Learn more](feature:color)
- **Image and Start over always stay** — The **Image** section of the right-hand panel and **Start over** inside it can no longer be switched off — resizing a page and emptying a drawing have no other route. [Learn more](feature:panel)
- **Switching layers off merges your drawings** — Switching the **Layers** section off now asks first, then puts every drawing on a single unlocked background layer you can paint on — so a sketchbook without the panel has no stack left it cannot reach. [Learn more](feature:panel)
- **Effect rows** — An effect row in the right-hand panel now ends in a sliders glyph rather than
  the word "Apply…", which was both untrue — the press opens the effect's options
  — and wide enough to squeeze the longer names into an ellipsis.

### Fixed

- **New image dialog** — The dialog no longer freezes for a moment as it opens — the canvas-type
  swatches are painted ahead of time and remembered, and the Clipboard tab waits
  until it has something to offer instead of appearing and then vanishing.
- On an installed iOS PWA the canvas header no longer hides under the Dynamic Island.
- Pinching now only ever zooms your drawing — it can no longer blow up the app's own interface instead.
- **Double-tap no longer paints** — Double-tapping to fit the page used to leave two marks behind it; the gesture now belongs to the hand tool, which cannot draw, and is detected from the touch itself rather than from the browser's late double-click. [Learn more](feature:canvas)
- **The sidebar swipe no longer draws** — Swiping in from the screen edge to open the sidebar used to drag a line across the page on its way; a touch that starts in that strip is now held until it proves it isn't the swipe, and replayed from where it landed when it is yours after all. [Learn more](feature:canvas)
- **Busy pages stay smooth** — Drawing on and dragging a page with hundreds of brush and airbrush strokes now runs at frame rate instead of a few frames a second.
- **Calligraphy strokes that double back** — A calligraphy stroke that crosses back over itself — the up-and-down of a stylistic `l` — no longer punches a hole through the part it overlaps.
- The side menu's footer sits at the bottom of the drawer again instead of floating above a band of empty space.
- **Brushes** — The round and flat brushes now lay down a mark the width of the head you picked
  rather than half again as much, run a load out over a good long drag instead of
  a page and a half of one, and cost the part of a stroke that is on screen — so
  panning and zooming a page of brushwork keeps up. [Learn more](feature:plugins)
- **Start over keeps the page** — Starting a drawing over from the image panel no longer swaps its page colour or transparency for the app theme's sheet — only the marks and layers go.
- **Long strokes** — Drawing with the airbrush — or any wide, soft tool — no longer slows down as the
  stroke gets longer: a frame now repaints only where your hand has just been
  instead of the whole mark from its first point.
- **The round paintbrush** — The round no longer paints a flat's stroke: the head bears across the mark like
  the cone it is instead of a squared-off blade, a stroke opens with a few hairs
  rather than a stamped disc the width of the brush, a lift frays out into
  trailing hairs, and the partings between the hairs wander through one body of
  paint instead of ruling it into ribbons. [Learn more](feature:plugins)
- **Effect sliders** — Blur, Noise and Delete background no longer lag behind the slider — the number
  follows your thumb and the heavy preview redraws once, when you let go. [Learn more](feature:effects)
- **The background stays at the bottom** — The Background layer can no longer be moved up or down, and no other layer can
  be slid underneath it — it is the page, so everything is drawn on top of it. [Learn more](feature:layers)
- **Menu footer spacing** — The bottom of the side menu now breathes the same as its sibling apps: the
  footer sits in even padding instead of hugging its border, and folding it away
  no longer strands the chevron rail above a band of empty space.
- **Pasting a picture on iPhone and iPad** — New image no longer reaches for the clipboard on its own where the browser won't allow it quietly — Safari and installed iOS apps now get a **Paste from clipboard** button that waits for you instead of a Clipboard tab that disappeared while you were reading it.
- **Move a caption before you keep it** — The text box can be dragged to reposition it, and it no longer runs off the
  screen — with its buttons — when you start typing near the edge of the page.
- **Colour dropper** — A colour picked with the dropper now shows at full strength in the toolbar
  straight away, instead of being dimmed until you picked up another tool — which
  made every sample look darker than the colour it came from.
- **Blur on Safari** — The blur did nothing at all in Safari on iPhone, iPad and Mac — the page stayed sharp at every radius — and now softens there exactly as it does everywhere else, on screen and in exports. [Learn more](feature:effects)
- A paint bucket fill that was dragged into place — rather than tapped — lost track of the tool that made it, which quietly dropped its feathered edge.
- The panel behind a tool button is now only as wide as the family it holds, so the fills and the erasers open two buttons wide instead of in a four-wide box with half of it empty. [Learn more](feature:plugins)
- The header's buttons no longer sit flush against the top edge on desktop — they breathe the same amount above as below.
- **Settings that apply live** — Pressing Save in Settings no longer reverts the choices that apply as you make
  them — the watercolour engine, the toolbar's order, and which tools are switched
  on.
- **The sidebar swipe is back** — An inward swipe from the edge the sidebar lives on opens it again on any touch screen — it went away with the setting that used to switch it on, which is one thing too many to have removed. [Learn more](feature:canvas)
- **The turn arrows, and a glyph for Flip** — The quarter-turn arrows in the page panel had their arrowheads sitting a fraction off the ring they end, and **Flip** in New image borrowed one of them — it now has a glyph of its own: a page on its end beside a page on its side.
- **Pigment on a dark page** — The watercolour brush's pigment simulation paints on a dark page: a light wash
  used to dry into a mark too faint to see, and its swatch in the panel showed
  bare paper. [Learn more](feature:surface)
- **A sharper pigment wash** — The pigment watercolour is now worked out at the page's own resolution rather than the screen's, so a wash is no longer scaled up at its edges and looks the same at every zoom. [Learn more](feature:surface)
- **Zooming a page of paint** — Zooming, panning and undoing on a drawing with a lot of pigment watercolour on it no longer works every wash out again from scratch.
- Marks now stop at the edge of the page instead of being drawn on the desk around it, so what you see on screen is what a saved file has in it.
- The tool panel behind the size button no longer fills a phone's screen — it stops at two thirds of the window and scrolls the rest.
- **Watercolour stays fast** — A page carrying many simulated washes no longer freezes on every stroke, zoom
  and dialog: the dried-wash store now holds a whole painting's marks instead of
  a couple of dozen, and a page that outgrows it slows by one wash at a time
  rather than re-simulating everything.
- **Paper that stays put** — The sheet's grain is now anchored to the page rather than to the screen, so zooming magnifies the paper along with the drawing instead of sliding it diagonally underneath. [Learn more](feature:surface)
- **No more pixelated washes** — A long watercolour stroke no longer dries with a pixelated trail through its
  middle: on the coarser grid a big wash is simulated at, the granulation now
  stands down instead of rolling pigment into pools the size of a single cell.
- **Watercolour lands instantly** — A wash landing on a paper surface now costs one stroke instead of repainting
  the whole page: the canvas keeps the wet layer's own pixels and paints the new
  mark straight onto them, so heavy watercolour pages stop hitching at the end of
  every stroke.
- **Tool panel** — The panel the size button opens no longer stalls for a moment with the
  watercolour brush in hand — its presets, its widths and its wash pictures are
  painted ahead of time and remembered, so it opens already drawn.
- **Rubbing at speed** — Rubbing at a page full of ink and washes no longer crawls at a few frames a
  second — the rubber now spends its work only where there is pencil under it.
- **The paintbrush keeps its angle** — A flattened paintbrush now holds the nib angle you set it to for the whole stroke — the two ends are cut at the angle you are holding the blade at instead of square across the way you dragged, and the angled bar a press leaves no longer flips the moment your hand moves. [Learn more](feature:plugins)
- **Room to drag a caption** — The text tool's bar is narrower — the typefaces are a menu rather than four
  buttons — and it folds onto a second row instead of sliding off to the left, so
  its grip stays over the caption and you can drag one back from the right-hand
  edge of the page.
- **Selection grips** — Dragging a selection with the hand now carries its corner grips along with the outline, instead of leaving them behind at the window's old corners. [Learn more](feature:selection)
- **Drag a panel section with a finger** — A section of the right-hand panel is now dragged by its whole heading rather than by the sixteen-pixel grip, so holding one on a touch screen actually picks it up. [Learn more](feature:panel)
- **Pictures at high zoom** — A picture now shows the squares it is made of at the zoom the pixel grid rules
  them, instead of a smooth blur the grid had nothing to line up with. [Learn more](feature:canvas)
- **Imported pictures** — A phone screenshot now imports at full resolution — the size cap was below every
  phone's screen height, so screenshots were quietly resampled — and a picture
  that is still too big is placed at the size it is stored at, so one pixel of it
  is one pixel of the page. [Learn more](feature:images)
- **Resize corners** — Pulling a corner in the Resize dialog no longer jumps the page by thousands of
  pixels: with Keep proportions on, the corner follows your drag instead of being
  scaled by whichever side happened to move further, and the picture it is drawn
  in now takes the shape of the page, so a tall page is no longer resized through
  a letterbox. [Learn more](feature:canvas)

### Removed

- **The empty-page hint** — A fresh sheet no longer carries a paragraph of instructions between the page and the toolbar — it just opens ready to draw on.
- **The neon pen** — The neon pen has been retired; marks already drawn with it still render.
- **The Canvas settings tab** — Everything that decided what a page _is_ — its colour, its sheet and its grain — moved into New image, where the size already was; the grid and the tool-name label moved to Settings → General; and the app-wide light/dark page switch and the sidebar's edge-swipe option are gone, leaving the page to follow the app theme and the header's hamburger to open the sidebar.
- **The paragraph under Effects** — The note under the Effects rows in the side panel is gone — the dialog one press away says the same thing where it matters, with the layer named and a preview of what it will do.
- **The note under the layer stack** — The paragraph of explanation under the layers list is gone; the room goes to the **Merge layers…** row instead. [Learn more](feature:layers)

## [0.1.0] - 2026-08-13

### Added

- **A canvas to draw on** — Sketch with a pencil, eraser, line, rectangle, and ellipse on a page that scales to fit any screen, with every mark undoable one at a time. [Learn more](feature:canvas)
- **Tools are plugins** — Every tool in the app is a plugin behind one interface; the optional ones (arrow, marker, highlighter) switch on in Settings → Tools and join the toolbar immediately. [Learn more](feature:plugins)
- **Several drawings, several sketchbooks** — Keep a list of drawings in the sidebar, and separate whole sets of them into namespaces. [Learn more](feature:drawings)
- **Cloud sync** — Optionally keep the document in step across devices through a local folder, Dropbox, or Google Drive, with end-to-end encryption of the synced file. [Learn more](feature:cloud-sync)
- **Export** — Download the open page as a PNG, or the whole document as JSON. [Learn more](feature:export)
- **Installable and offline** — A precaching service worker and a web app manifest make it an installable PWA that opens with no network. [Learn more](feature:pwa)
- **Themes and languages** — The framework's appearance engine (themes, fonts, density, corners) plus English and Swedish.
