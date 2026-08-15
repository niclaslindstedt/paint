# The canvas

The page you draw on is a fixed pixel size, and you choose it when the drawing
is made: **New drawing** asks how big the page should be before it opens one.

| Size            | What it is                                                        |
| --------------- | ----------------------------------------------------------------- |
| **This screen** | Your display's own resolution — the default, and usually right    |
| **Full HD**     | 1920 × 1080                                                       |
| **4K**          | 3840 × 2160                                                       |
| **A4**          | 2480 × 3508 — A4 at 300 dpi, the resolution a photo printer wants |
| **Custom**      | Type a width and a height, 64–8192 px on each side                |

They are **drawn rather than listed**: five rectangles at one shared scale, so
"how much bigger is 4K than Full HD" and "is A4 taller than my screen" are
questions you answer by looking. The custom cell is drawn too — type a size and
its rectangle takes its place on the shelf beside the named ones. It opens on
2048 × 2048, the big square nobody offers by name.

"This screen" is the resolution the display actually has, pixel ratio included,
so a page made on a retina laptop exports at its native size rather than at half
of it. A size that is already on the list — Full HD on a 1080p monitor — is
offered once, as _This screen_.

A page **larger than the window** is not a problem: the canvas opens as a window
onto the sheet at 1:1 and you move around it, so there is always room to the
right of what you have drawn. That is the whole point of the large sheet — a
page that exactly fits the window is a page you run out of, and the first
diagram that needs one more box has nowhere to put it.

Because the size is fixed rather than reflowed, a sketch made on a laptop looks
the same on a phone — you just see less of it at once. The page also grows on
its own in one case: a picture dropped past its edge takes the sheet with it
(see [images](images.md)).

## Changing the page afterwards

The page is fixed, but it is not permanent. The right-hand panel's **Image**
section is what you can do to the whole drawing rather than to one mark — and
every one of them is a single undo step.

**Resize** asks which of two things you mean, because the word covers both. In
both, the new page is drawn over the old one and **you can pull it by its
corners**, the way a crop tool works: the corner opposite the one in your hand
stays put, and the width and height below follow the drag. The **Keep
proportions** latch beside them holds the page's shape while you pull. (The
handles take arrow keys too, if a pointer is not what you have.)

- **Everything** scales the drawing. The page and every mark on it grow or
  shrink together — the same picture, at a different size — and the nib widths
  go with them. A page with pictures on it also offers **Smooth** or **Nearest**: how a
  bitmap is filtered when it is painted larger than it is. Nearest keeps the
  pixels square, which is what pixel art and screenshots want, and it holds at
  any zoom rather than being baked into the file.
- **Canvas only** changes the sheet and leaves the marks exactly where they are.
  A bigger sheet gives you room; a smaller one **crops**. The nine-way anchor
  says where the current page sits inside the new one, and the picture above it
  shows the overhang — which is the edge about to go. Pulling a corner sets the
  anchor for you: grab the bottom-right and the top-left is pinned.

Nothing is deleted by a crop: marks that fall outside the sheet stay in the
document, unpainted and unexported, and growing the page again brings them back.

**Flip** turns the page a quarter turn, left or right. The sheet's sides swap
with it — a landscape drawing turned is a portrait one — and the view fits the
new page so you can see what happened.

**Mirror** reflects it: **horizontal** swaps left and right, **vertical** swaps
top and bottom. Both are their own undo, so doing one twice is where you started.

Captions stay upright through all of it — type turned upside down is type you
cannot read — and their boxes move with the page. Pictures are redrawn, because
a bitmap has pixels of its own that mapping its frame would leave facing the
wrong way.

## What the page is made of

The page also has a **material**, and it is picked with the page size in the New
drawing dialog: a solid digital sheet, one of four papers, or primed cotton duck.
It is not a texture laid over the drawing — the sheet's grain is painted under
the marks, and on a sheet that drinks, a wet tool mixes with what it is painted
over instead of covering it. Watercolour is the tool to try it with. Like the
size, it is fixed once the page exists; Settings → Canvas still says which sheet
a drawing is on and turns its grain up or down. See
[the surface you draw on](surface.md).

## Zooming and panning

| Gesture                               | What it does                         |
| ------------------------------------- | ------------------------------------ |
| One finger, pen, or mouse             | Draws                                |
| Two fingers                           | Pinch to zoom, drag to pan           |
| Wheel / trackpad scroll               | Pans                                 |
| Ctrl (⌘) + wheel, or a trackpad pinch | Zooms about the cursor               |
| The **hand** tool (`D`)               | One-finger drag pans                 |
| Double-tap with the hand              | Fits the whole page, again for 1:1   |
| Swipe in from the screen edge         | Opens the sidebar, and marks nothing |

The **hand** is the way around the page when two fingers aren't handy — a mouse
has no pinch, and a phone in one hand has no second finger. Pick it from the
toolbar and a plain drag moves the sheet; nothing you do with it can leave a
mark, which is also what lets it have the double-tap. Under a drawing tool a
double-tap is two marks, so it does exactly that and nothing else.

The **zoom readout** in the bottom-right corner of the canvas does the same as
the hand's double-tap, from any tool: it shows the current zoom, and tapping it
fits the page (or returns to 1:1 if it is already fitted).

Putting a second finger down mid-stroke abandons that stroke rather than
committing it — you meant to zoom, and half a line you didn't want is worse than
none.

If you open the sidebar by swiping in from the screen edge (Settings → General),
that swipe crosses the page — and it leaves nothing behind. A touch that lands in
the narrow strip the sidebar watches is **held** rather than drawn: swipe inward
and the drawer opens with the page untouched; do anything else — draw downward,
draw back out, lift your finger where it landed — and the mark appears from the
point you first pressed, so nothing is lost to the wait. A mouse or a pen at the
edge never waits, because the gesture is a touch one.

Zoom belongs to the canvas and nowhere else: pinching anywhere in the app's
chrome does nothing, so a pinch aimed at your drawing can never leave the whole
interface blown up instead.

A drawing is **vector**, not a bitmap: each mark is a stroke object with a
shape, a colour, and a width. That is what makes undo exact (one mark at a
time), the saved document small enough for a phone's storage, and a synced copy
a readable JSON file rather than a blob of pixels.

## Drawing

- Press and drag anywhere on the page. The tool you have selected decides what
  the gesture leaves behind.
- A shape tool (line, rectangle, ellipse, arrow) draws from where you pressed to
  where you let go. A press that never moved is discarded, so a mis-tap doesn't
  leave an invisible mark.
- The shapes that can be **filled** — rectangle and ellipse — wear a folded
  corner on their toolbar button. Press the button again once it is the tool you
  are holding and a small panel opens over the page with the shape drawn hollow
  and drawn solid; pick one. There is no text on it and nothing on screen until
  you ask for it, which is the row of toolbar the old "Fill shapes" checkbox
  used to cost. The choice sticks until you change it, and both shape buttons
  show it.
- The **eraser takes ink off**. Its mark subtracts rather than paints, so what
  it covers is gone and the sheet shows through the hole — including on a
  transparent export, where an erased patch is a real hole rather than a
  page-coloured smear. It lifts ink from the whole picture, whichever layer it
  was drawn on, the way a rubber does to a drawing on paper. The stroke itself
  is still an ordinary mark in the document, so a rubbing out undoes, syncs and
  re-renders exactly like the line it took off.
- **Starting over** is not the eraser's job. Throwing a drawing away is an
  action on the whole document, so it is the bin at the end of the **Image**
  heading in the right-hand panel: every mark, every layer and the page colour
  in one step. It asks first, undo brings the drawing back, and it is dimmed on
  a page that is already blank (see [layers](layers.md)).
- The **paint bucket** fills the empty space you tap, up to the marks around it
  — and files that area as a vector shape, so it stays crisp however far you
  zoom in. Marks stranded inside the area stay unpainted. Tap a gap in your
  outline and it will leak through it, the same way a bucket always has.
- The **gradient**, behind the same button, fills that area with a ramp instead
  of a flat colour: press where the first colour should start, drag the way you
  want it to run, and let go where the last one should land. Its colours are its
  own — from, to, and a middle one if you want three — so the toolbar's ink is
  struck through while it is in your hand — a control that changes nothing is
  not offered.
- The **dropper** takes the colour you tap and makes it the ink — including a
  colour that only exists where two translucent passes overlap. Its cog sets how
  much page one tap reads: the single pixel under the pointer, or the average of
  a disc up to eight millimetres across, which is the setting you want on
  anything sprayed or grainy.
- With a mouse or a stylus, **the pointer is the nib**: a circle the size of the
  mark you are about to leave, at the page's own scale, so it grows as you zoom
  in and shrinks as you pull back. It is the width you set made visible before
  you commit to it. A finger gets none — it is already covering what it is
  aiming at — and neither do the tools that leave no mark by a nib, which keep
  the crosshair.

## Colour and size

The toolbar is two bands. The **tools** fill the left of it, wrapping over two
rows — three on a narrow phone — as you switch more of them on. Everything that
is not a tool sits in a small block against the **right edge**, divided off by a
rule: the ink and the width on its top row, undo and redo on its bottom one.
That block never moves. Whichever tool is in your hand and however many of them
are switched on, those four buttons are in the same corner of the screen, which
is what lets you reach them without looking for them.

Colour and size are the top half of it, one button each.

The **ink button** is the colour you are drawing with. Press it for the palette
and whatever colours you have mixed. **Mix a colour…** opens a hue strip and a
saturation/brightness field — drag either and the ink changes as you go;
**Keep** adds it to your own swatches for good, and a swatch you no longer want
has a small × on it.

There is no second half to it. It used to be split corner to corner with the
page colour below the diagonal, back when painting with the page was how you
rubbed something out. The eraser lifts ink now, and the sheet's colour belongs
to the background layer (Settings → Canvas pins it), so the second half stood
for nothing.

The **nib button** shows a press with the tool in your hand: not a dot the size
of the nib, but the mark that width actually leaves — painted by the same
painter that paints the page, on the page colour, in the ink you have picked.
Press it for the three widths it ships with, plus any you have added: each is
that same press at that width, so the row reads fine-to-broad as marks rather
than as numbers. The slider sets a width live, and **Keep** puts it in the row,
sorted fine to broad. Below them, under an **Advanced** heading, are the knobs
belonging to the tool itself — they are simply there, not folded away — and the
presses above them redraw as you drag one: turning hardness down softens the dab
while your thumb is still on the slider.

The **eraser** is the one drawing tool whose width shows as a plain circle. Its
mark is a hole, and a hole on the bare page a preview is shows nothing at all;
the nib is round and the number is the nib, so the circle says it at a glance.

Not every tool has a nib button. The **paint bucket** has no width to set — it
fills the area it traced whatever a nib might say — so it gets a **cog** in that
slot instead, opening the settings it does have: how much of the page shows
through the wash, and how far its edge fades out. A dot on the cog means the
bucket is set away from how it ships. A tool that marks nothing at all — the
hand, the selection tools — gets no button there at all, and the slot stays
empty rather than closing up: undo and redo keep their places under it.

## Undo and redo

They are the bottom row of that block, under the ink and the nib: the pair that
acts on the drawing rather than on the next mark. They used to live only in the
sidebar's button island, which meant opening a drawer over the page to take back
the stroke you had just made. `Ctrl/Cmd + Z` and `Ctrl/Cmd + Shift + Z` (or
`Ctrl + Y`) still do the same thing, and both buttons dim at the ends of the
history rather than disappearing — as does the width slot above them, which
stays empty for a tool that has no settings rather than letting the pair slide
up a row.

## The header

- The drawing's name is the page's heading, edited in place: press it and type
  over it. The press selects the whole name, `Enter` keeps what you typed, and
  `Esc` puts the old name back. Nothing takes the keyboard until you ask for
  it — opening a drawing leaves the title alone.
- The star adds the drawing to Favorites (see [drawings](drawings.md)).
- The download button opens a menu — PNG, JPG, SVG, or copy to the clipboard
  (see [export](export.md)).
- The last button, at the far right end of the row, opens the side panel — the
  page actions and the layer stack (see [layers](layers.md)). It wears the panel
  it opens, and it is at that end of the header because that is the edge the
  panel comes in from: an inward swipe from the right edge of the page brings
  out the same thing.

The buttons up here wear the same box the toolbar's do — a bordered square that
tints accent while it is on — so a starred drawing and an open side panel are
readable at a glance, and the header, the toolbar and the sibling `notes` and
`contacts` apps all read as one set of chrome.

There is no bin up here any more. Wiping the page is erasing at its largest
scale, so it moved to where erasing lives — the eraser's own button, one press
away from the hand already reaching for it — and the width it took now goes to
the drawing's name.

Undo and redo are not here either. They end the toolbar, beside the ink, and
answer to the keyboard as well; the header is the one row a phone has to fit a
drawing's name into, so the width those two glyphs took is worth more spent on
the title.

The sync glyph is not here: there is one cloud affordance for the whole app, and
it lives in the sidebar's button island (see [cloud sync](cloud-sync.md)).

## Keyboard

- `Ctrl/Cmd + Z` undo, `Ctrl/Cmd + Shift + Z` (or `Ctrl + Y`) redo.
- Each tool has a single-key shortcut, shown in its tooltip: `P` pen,
  `G` pencil, `B` paintbrush, `S` airbrush, `F` the bucket, `I` the dropper,
  `E` eraser, `D` the hand (drag), `L` line, `R` rectangle, `O` ellipse, and one
  per optional tool.

## Layers

Swipe in from the right edge of the page — or tap the layers button in the
header — for the drawing's stack: add a layer, pick the one new marks land on,
show and hide, reorder, delete. A press on the page closes the panel again.
[More](layers.md).

## Dropping in an image

Drag an image file onto the canvas and it floats over the page until you place
it: drag to move, pull a corner to scale, then Keep it — the button in the bar
above it, a click away from it, or Enter. The page grows if the picture is bigger
than the sheet, and Discard (or Escape) throws it away. [More](images.md).

## The grid

Settings → Canvas can put a light grid behind the page to line boxes and arrows
up. It is a drawing aid only: it is painted by the page element, never by the
document, so it can never reach a downloaded file.

## The tool you picked, named

Switch tools — from the toolbar or with the tool's shortcut key — and its name
fades in over the middle of the page for a moment, then goes. The toolbar's
glyphs are small and several tools draw a similar mark (a marker and a crayon
are one nib apart until you have used both), and on a phone the button you just
tapped is under your thumb, so the highlight that says what you are holding is
the one pixel you cannot see.

It is a label and nothing else: it never takes a press, so a stroke that starts
under it draws straight through. Settings → **Canvas** switches it off if you
would rather have the page to yourself.

## Text selection

The app selects no text. Every long drag in it means something — a stroke on the
page, a row picked up in the sidebar — and the browser's default answer to a
drag is to smear a blue highlight across whatever it crossed, or to pop the
copy/lookup callout on a phone. The places where text is worth copying keep it:
anything you type into, the privacy page, and the log and build panels in
Settings.
