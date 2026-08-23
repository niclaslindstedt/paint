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

### Seven ways to choose

A box is not always the shape of what you want, so the selection button holds
seven gestures. Press it a second time — the way the shapes button works — and
pick one:

- **Box** — the classic marquee. Two corners.
- **Oval** — the same drag, read as the oval inside it.
- **Lasso** — draw around what you want, freehand. The loop closes itself.
- **Trace** — press an area and the window follows the **contours of what is
  drawn there**: the shape under your finger rather than a shape you drew over
  it. It reads the page the paint bucket reads, so it stops where the bucket
  would stop. A press on the bare page selects nothing, because the page colour
  runs up against everything you have drawn.
- **Colour select** — press a colour and **everywhere else it appears** is
  chosen too. Where Trace stops at the first edge it meets, this one crosses the
  whole page, so the twenty leaves of the same green come in together. It has
  one setting of its own under the cog:

  - **Colour tolerance** — how far a shade may drift from the one you pressed
    and still count. Tight picks out one exact colour, which is what a flat
    drawing wants; wide takes in a whole sky, which is what a photograph needs.

  Unlike Trace, a press on the **bare page is allowed and useful**: it chooses
  the background with every mark left out of it as a hole — the selection to
  have before a Delete, or before painting the page out from behind a sketch.

- **Gap select** — press a part of the page the selection **doesn't** reach and
  it fills with selection, out to the edges of what is already chosen. It is the
  paint bucket's press aimed at the window instead of at the picture, and it is
  the answer to the shape you have only gone _round_: trace a ring, draw round a
  subject, and the middle is still a hole — one press here says "and the
  inside". With nothing selected yet, one press chooses the whole page, an
  unmarked sheet being one big gap. A press somewhere already chosen leaves the
  selection exactly as it was. Set to **Subtract** (see below) it runs the other
  way: press a chosen area and the whole of it is taken back out, which is how
  you drop one leaf of the twenty a colour select brought in.

- **Draw select** — paint the selection the way a pencil paints a line.
  Everything the nib covers is selected, a tap leaves a dab, and — unlike its
  siblings — **every stroke adds** to what is already chosen, so an awkward
  shape (the subject of a photograph, say) is built up stroke by stroke rather
  than caught in one gesture. Set to **Subtract** (see below) the same stroke
  paints selection _away_, which is how a corner that came in with the rest is
  rubbed back out. It is the one selection tool with a real nib, so it alone has
  a width, and one setting of its own under the size button:

  - **Feather** — how softly a Delete through the window fades out; see below.

  Its width does one more thing, in one place: **Delete background** searches
  exactly the stripe the pencil painted for the subject's real edge, so the
  pencil you pick is how close the cut is held to your line (see
  [`delete-background.md`](delete-background.md)).

Whichever you use, what settles is that outline — a lasso stays a lasso — and a
traced area's holes stay holes: they are outside the window exactly as they are
outside the paint.

## Building one up: Add and Subtract

A gesture normally **replaces** the window: what you just chose is the whole
selection, and whatever was chosen before it is gone. That is one of three
things a second gesture can mean, and it is the least useful of them. The
subject of a photograph is a lasso loop, _plus_ the ear the loop missed,
_minus_ the sky that came in with the shoulder.

So the family has a mode, and it is one mode for all seven tools:

- **Replace** — start again. Where the app opens.
- **Add** — keep what is selected and add what you choose to it.
- **Subtract** — keep what is selected and cut what you choose out of it.

Two ways to ask for it, because a laptop and a phone do not agree:

- **On a keyboard**, hold **Shift** to add or **Alt** to subtract, for the
  length of one gesture — the same keys Photoshop uses. The mode is decided at
  the press, so letting the key go mid-drag lands the gesture you started, and
  the pointer carries a small **+** or **−** while a key is down so you can
  check before you commit to the drag.
- **Anywhere**, **hold the selection button down** in the toolbar and pick one.
  That mode then stays until you put it back — the tool's button wears the same
  **+** or **−**, and a strip at the foot of the canvas says which mode you are
  in, takes you back to the chooser, and puts it back to Replace with its ✕. The
  chooser itself can be put away without cancelling anything: the mode is the
  point of it, and the page is what you now have to use it on.

Anything can be combined with anything, because every one of these tools answers
in the same currency: draw a box, add a traced shape to it, take a lasso loop out
of that. Mixed selections keep their shape — the result is the outline of what
you built, holes and all — and each gesture is one step you can take back.

Two smaller things follow from it. With a mode in force, dragging **inside** the
window no longer slides it (that is what Replace is for): the area you want to
take out of a selection is nearly always inside the one you have. And a gesture
that chooses nothing — a stray tap — leaves an added-to selection alone instead
of clearing it, so a slip does not cost the minute you spent building it.

## Adjusting

The four corner grips stretch the window, shape and all: a lasso pulled by a
corner is still that lasso, carried along proportionally. Dragging **inside** it
with the marquee still in your hand slides the whole window somewhere else and
leaves what is painted under it alone.

Each is one step you can take back, and a whole drag is one step rather than one
per twitch of your finger — see below.

## Inverting

With a window up, the right-hand panel grows a **Contextual** block at its
head — blue, and pulsing gently — and **Invert selection** is in it: one press
and the window becomes everything on the page it wasn't, and nothing it was.
Press it twice and you are back where you started. (What you traced can also be
cut out of its background — that is **Delete background**, in the panel's Image
section; see [`delete-background.md`](delete-background.md).)

The block is contextual, and that is the whole of it: with nothing selected
there is nothing either row could act on, so there is no block — not a heading
over an empty box, and not two dead buttons.

## Taking it back

**⌘/Ctrl+Z undoes a selection like it undoes a mark.** Cutting a window,
sliding it, stretching it by a corner, adding one more stroke of Draw select,
inverting it, and putting it away with Escape are each one step back, and
⌘/Ctrl+Shift+Z (or Ctrl+Y) puts each of them forward again. They queue up with
your marks on the one timeline, in the order you did them, so the key always
takes back the last thing you did — whichever of the two it was.

That matters most for **Draw select**, which is built up stroke by stroke: one
stroke that went where you didn't mean it to now costs one press to take back
rather than the whole selection to redraw.

The edits that move both move both together. Undo a paste and the pasted marks
go with the window that was around them; undo a hand drag and the ink comes home
with the outline still on it; undo a crop and the page comes back with the
window it had. Painting inside a window is the other way round, on purpose:
undo takes the mark and leaves the window up, ready for the next try.

Nothing about a window is ever saved. It is not in the file, it is not pushed to
a connected folder or Dropbox, and it is not there when you open the drawing
tomorrow — undo reaches back through this session, not through the document.

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

### A feathered delete

A window the Draw select tool cut with its **feather** dial up deletes softly:
what goes fades out through the edges and corners instead of stopping dead, by
the distance the dial is set to. A fade has no outline a vector cut could
follow, so this delete lands the other way the app takes pixels off — as one
soft-edged **erasing mark**, the same kind the eraser leaves. That means it
behaves as the eraser does: it lifts ink down to the sheet, whatever layer the
ink was on. One undo step takes it back either way, and a window with the
feather at zero deletes exactly as the marquees always have.

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

It is not part of the drawing. Where the window is, is never saved and never
synced — it is this session's, and a selection is one of the few things you can
undo that leaves no trace in the file.

It is also not a set of marks. Nothing is "selected" in the sense of being
picked up: what you take back with ⌘/Ctrl+Z is the _window_, an area of the
page, and never a bundle of strokes lifted out of it. What the drawing keeps is
what you _did_ through the window, and every one of those is an ordinary edit
with an ordinary undo step of its own.

A window belongs to the page it was cut in and is shown over no other. Open
another drawing and there is no window; come back and it is where you left it.
