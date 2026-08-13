# The canvas

The page you draw on is a fixed pixel size (1600 × 1000 by default) that the
view scales to fit whatever screen you are on — so a sketch made on a laptop
looks the same on a phone, rather than reflowing.

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
- The sync glyph opens the sync command centre (see [cloud sync](cloud-sync.md)).
- Undo / redo, export the page as a PNG, and clear the page.

## Keyboard

- `Ctrl/Cmd + Z` undo, `Ctrl/Cmd + Shift + Z` (or `Ctrl + Y`) redo.
- Each tool has a single-key shortcut, shown in its tooltip: `P` pencil,
  `E` eraser, `L` line, `R` rectangle, `O` ellipse, and one per optional tool.

## The grid

Settings → Canvas can put a light grid behind the page to line boxes and arrows
up. It is a drawing aid only: it is painted by the page element, never by the
document, so it can never reach an exported PNG.
