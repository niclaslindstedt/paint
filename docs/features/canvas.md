# The canvas

The page you draw on is a fixed pixel size, and you choose it when the drawing
is made: **New drawing** asks how big the page should be before it opens one.

| Size              | What it is                                                     |
| ----------------- | -------------------------------------------------------------- |
| **This screen**   | Your display's own resolution — the default, and usually right |
| **Full HD**       | 1920 × 1080                                                    |
| **4K**            | 3840 × 2160                                                    |
| **Large sheet**   | 3200 × 2000 — bigger than any screen, for a diagram that grows |
| **Square**        | 2048 × 2048                                                    |
| **A4 at 300 dpi** | 2480 × 3508, portrait — a page to print                        |
| **Custom size…**  | Type a width and a height, 64–8192 px on each side             |

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
- The eraser paints with the page colour. In a vector document there are no
  pixels to clear, and painting over means an eraser stroke is undoable like any
  other mark.
- The **paint bucket** fills the empty space you tap, up to the marks around it
  — and files that area as a vector shape, so it stays crisp however far you
  zoom in. Marks stranded inside the area stay unpainted. Tap a gap in your
  outline and it will leak through it, the same way a bucket always has.
- The **dropper** takes the colour you tap and makes it the ink — including a
  colour that only exists where two translucent passes overlap.

## Colour and size

Both live behind a single button, at the right-hand end of the toolbar.

The **ink button** is split corner to corner: the colour you are drawing with
above the diagonal, the page colour that rubs it out below. Press it for the
palette, whatever colours you have mixed, and the page colour as a swatch of its
own. **Mix a colour…** opens a hue strip and a saturation/brightness field —
drag either and the ink changes as you go; **Keep** adds it to your own swatches
for good, and a swatch you no longer want has a small × on it.

The **nib button** shows the width as a dot the size it will actually draw.
Press it for the three widths it ships with, plus any you have added: the slider
sets a width live, and **Keep** puts it in the row, sorted fine to broad.
**Hardness** is under it — soft feathers a brush's edge, hard keeps it crisp. It
is dimmed under a tool that draws a hard edge either way, which is most of
them.

## The header

- The drawing's name is edited in place — type over the title.
- The star adds the drawing to Favorites (see [drawings](drawings.md)).
- The download button opens a menu — PNG, JPG, SVG, or copy to the clipboard
  (see [export](export.md)) — and the bin clears the page.

Undo and redo are not here either. They live in the sidebar's button island and
on the keyboard, and the header is the one row a phone has to fit a drawing's
name into — the width those two glyphs took is worth more spent on the title.

The sync glyph is not here: there is one cloud affordance for the whole app, and
it lives in the sidebar's button island (see [cloud sync](cloud-sync.md)).

## Keyboard

- `Ctrl/Cmd + Z` undo, `Ctrl/Cmd + Shift + Z` (or `Ctrl + Y`) redo.
- Each tool has a single-key shortcut, shown in its tooltip: `P` pencil,
  `B` paintbrush, `S` airbrush, `F` the bucket, `I` the dropper, `E` eraser,
  `D` the hand (drag), `L` line, `R` rectangle, `O` ellipse, and one
  per optional tool.

## Dropping in an image

Drag an image file onto the canvas and it floats over the page until you place
it: drag to move, pull a corner to scale, then Keep it — the button in the bar
above it, a click away from it, or Enter. The page grows if the picture is bigger
than the sheet, and Discard (or Escape) throws it away. [More](images.md).

## The grid

Settings → Canvas can put a light grid behind the page to line boxes and arrows
up. It is a drawing aid only: it is painted by the page element, never by the
document, so it can never reach a downloaded file.
