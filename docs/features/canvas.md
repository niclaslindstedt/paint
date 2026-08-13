# The canvas

The page you draw on is a fixed pixel size — 3200 × 2000 by default, which is
**bigger than the screen you are looking at it through**. A page that fits the
window is a page you run out of: the first diagram that needs one more box has
nowhere to put it. So the canvas opens as a window onto the middle of the sheet
at 1:1, with room in every direction, and you move around it.

Because the size is fixed rather than reflowed, a sketch made on a laptop looks
the same on a phone — you just see less of it at once.

## Zooming and panning

| Gesture                               | What it does                       |
| ------------------------------------- | ---------------------------------- |
| One finger, pen, or mouse             | Draws                              |
| Two fingers                           | Pinch to zoom, drag to pan         |
| Wheel / trackpad scroll               | Pans                               |
| Ctrl (⌘) + wheel, or a trackpad pinch | Zooms about the cursor             |
| Double-tap / double-click             | Fits the whole page, again for 1:1 |

The **zoom readout** in the bottom-right corner of the canvas does the same as
the double-tap: it shows the current zoom, and tapping it fits the page (or
returns to 1:1 if it is already fitted).

Putting a second finger down mid-stroke abandons that stroke rather than
committing it — you meant to zoom, and half a line you didn't want is worse than
none.

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
- The eraser paints with the page colour. In a vector document there are no
  pixels to clear, and painting over means an eraser stroke is undoable like any
  other mark.

## The header

- The drawing's name is edited in place — type over the title.
- The star adds the drawing to Favorites (see [drawings](drawings.md)).
- Undo / redo, export the page as a PNG, and clear the page.

The sync glyph is not here: there is one cloud affordance for the whole app, and
it lives in the sidebar's button island (see [cloud sync](cloud-sync.md)).

## Keyboard

- `Ctrl/Cmd + Z` undo, `Ctrl/Cmd + Shift + Z` (or `Ctrl + Y`) redo.
- Each tool has a single-key shortcut, shown in its tooltip: `P` pencil,
  `E` eraser, `L` line, `R` rectangle, `O` ellipse, and one per optional tool.

## The grid

Settings → Canvas can put a light grid behind the page to line boxes and arrows
up. It is a drawing aid only: it is painted by the page element, never by the
document, so it can never reach an exported PNG.
