# Cutting a window in the page

A drawing you can only add to is a drawing you redraw. The **selection** tools
are the other half — but not by picking marks out. A selection here is an
**area**: a window cut in the page that the next thing you do happens inside.

That is the whole idea, and everything below follows from it. Paint in the
window and the mark is cut to it. Rub out in it and only what is inside comes
off. Drag it with the hand and what is painted under it travels. Drag it with
the marquee and the window slides and leaves the ink where it is. All of it
happens on the **layer you are drawing on** and on no other.

## Choosing

Pick the marquee (**V**) and drag a box across the page. A dashed outline
settles around what you dragged, with a grip on each corner. A press that never
moved means "no window", and so does Escape. ⌘/Ctrl+A takes the whole sheet.

### The magnifier

While you are dragging an edge out — or adjusting one afterwards — a round glass
floats beside your finger and shows that part of the page at **300%**, with a
crosshair on the exact point and the outline drawn in it.

It is there because this is the one gesture where being a pixel out matters: a
window cut a hair wide of an edge leaves a hair of the old ink behind when you
move what is inside it. The glass paints the page again at its own scale rather
than blowing up what is on screen, so what you are aiming at is where it really
is, at any zoom.

### Four ways to choose

A box is not always the shape of what you want, so the selection button holds
four gestures. Press it a second time — the way the shapes button works — and
pick one:

- **Box** — the classic marquee. Two corners.
- **Oval** — the same drag, read as the oval inside it.
- **Lasso** — draw around what you want, freehand. The loop closes itself.
- **Trace** — press an area and the window follows the **contours of what is
  drawn there**: the shape under your finger rather than a shape you drew over
  it. It reads the page the paint bucket reads, so it stops where the bucket
  would stop. A press on the bare page selects nothing, because the page colour
  runs up against everything you have drawn.

Whichever you use, what settles is that outline — a lasso stays a lasso — and a
traced area's holes stay holes: they are outside the window exactly as they are
outside the paint.

## Adjusting

The four corner grips stretch the window, shape and all: a lasso pulled by a
corner is still that lasso, carried along proportionally. Dragging **inside** it
with the marquee still in your hand slides the whole window somewhere else and
leaves what is painted under it alone.

Neither costs an undo step. Nothing about a window is in the drawing.

## Painting inside it

With a window up, every mark you make is cut to it — the pencil, the brush, the
bucket, a caption you type. The mark itself is whole: the drawing records the
outline it was cut to beside it, so nothing is rasterised, nothing is resampled,
and the mark still paints the shape it was made in tomorrow. A gesture made
entirely outside the window lands nothing at all.

## Moving what is inside it

Moving is the **hand**'s job. With a window up, switch to the hand (**D**) and
drag from inside it: what is _painted_ there comes with you, and the window comes
with that — the dashed outline and the four corner grips travel with the ink as
you drag, so you can see where it will land before you let go. Drag from
anywhere else and the hand still pans, which is what it is for.

A mark the window swallows whole simply travels. A mark the outline **crosses**
is cut in two — the half inside goes, the half outside stays — and both halves
are still the mark they were cut from, so one undo puts the single mark back
whole. The move is shown live and touches nothing until you let go, so the whole
drag is one edit and one undo step.

## Erasing what is inside it

Three ways, because a phone and a laptop do not agree on any of them:

- **Delete** or **Backspace**;
- **a tap inside the window with the rubber** — the touch way, where there is no
  Delete key to press. Drag the rubber instead and it rubs out normally, held to
  the window like any other mark;
- **Delete** from the menu a right-click (or a long press) opens.

What comes off is what is inside the window on the layer you are drawing on.
Nothing is punched through the layers below it, and the window stays up
afterwards: clearing a patch and painting something else into it is one job.

## Copy, cut, paste

⌘/Ctrl+C and ⌘/Ctrl+X take what the window holds, each mark cut to it — so a copy
of half a line is half a line. It goes onto the **real** clipboard, as text
behind a marker this app recognises, which is what makes it work between two
tabs, between two sketchbooks, and across a reload.

⌘/Ctrl+V puts things _in_, and what you get depends on what you copied:

- **marks** — they land a nudge from where they were copied with a window around
  them, so "paste, then drag it where you wanted it" is one gesture;
- **a picture** — it arrives in the same placement frame a dropped image opens;
- **words** — they open the caption box rather than landing on the page, set in
  the text tool's own size.

Pasting from the menu instead of the keyboard lands whatever it finds under the
point you opened the menu at — which is the only way to say _where_ on a phone.

## What a selection is not

It is not part of the drawing. Where the window is, is never saved, synced or
undoable — it is screen state, dropped when you open another drawing.

It is also not a set of marks. Nothing is "selected" in the sense of being
picked up: an undo does not put a selection back, because there was never one in
the document to lose. What the drawing keeps is what you _did_ through the
window, and every one of those is an ordinary edit with an ordinary undo step.
