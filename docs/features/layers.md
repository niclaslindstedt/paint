# Layers

A drawing can be more than one sheet of glass stacked on top of another. Put the
photo on the bottom, the tracing over it, the labels over that — then hide the
photo when you want to see the tracing alone, or slide a layer under something
you drew earlier without redrawing it.

Every drawing starts with **two** layers: **Background** at the bottom, which is
the page itself, and **Layer 1** above it, which is where your marks land. The
background is **locked**, so nothing you draw can end up underneath everything
else by accident — and because it _is_ the page, hiding it takes the page colour
with it and leaves the drawing on transparency.

## Getting to the panel

**On a wide screen the panel starts out simply there**, docked down the
right-hand side beside the canvas: a panel you have to summon is one you forget
you have, and there is width to spare. Above the stack it carries the **Image**
actions — resize, flip, mirror — which act on the whole drawing (see
[the canvas](canvas.md)), and the **Effects** section under them, which blurs or
grains what is already on the page (see [effects](effects.md)); **Colour** is
under the stack. That is where they start out — the grip on each heading drags a
section into whatever order suits you, and Settings → Panel switches off the ones
you never use (see [the panel](panel.md)).

**The last button in the header** — at the far right end of the row, wearing the
panel it opens — is the switch, on every screen width. On a wide screen it folds
the docked column away when you want the page to have the full width, and brings
it back; on a narrower one, where the panel was never docked, it slides the panel
out over the page. **Swipe in from the right edge** does the same as pressing it
there — the edge gesture that opens the sidebar, on the other side — and a press
on the page closes a floating panel again.

A floating panel **goes away again when you press anywhere on the page**. It is
something you visit between strokes, so it takes no width from the page and never
stays in the way. The toolbar and the header stay live while it is open — picking
a colour for the layer you just selected does not cost you the panel. Escape
closes it too, and so does the header button that opened it — **the panel has no
close cross of its own**, because that button is the one switch for it and is
where your hand goes back to.

If you have dragged the sidebar over to the **right** edge, that edge is already
spoken for: the swipe opens the sidebar and the header button is the way into
layers.

## What you can do

The panel lists the stack **top first**, the way the marks sit on the page. Each
row shows a **preview of that layer's marks** on the page — where the boxes are,
where the labels are, which one holds the photo. That is what tells two layers
apart at a glance, and it is painted through the same renderer the page is, so a
preview can never disagree with the drawing.

- **New layer** — the `+` in the panel header. It lands directly above the one
  you have selected, and it becomes the selected one.
- **Draw on a layer** — tap its row. New marks land on the selected layer, and
  they land _in_ the stack: draw on a lower layer and the strokes appear under
  everything above it.
- **Show / hide** — the eye. A hidden layer dims in the list but keeps its
  preview, so you can still see what you have put away. It is off the page, out of every
  download, and invisible to the paint bucket and the colour dropper, which read
  what is painted rather than what was drawn. It is not deleted — the marks are
  still in the document and come back with the eye. Hiding the **Background**
  hides the page colour too, which is the quickest way to see your drawing on
  nothing.
- **Lock / unlock** — the padlock, beside the eye. A locked layer takes no
  marks: you cannot draw on it, select it, move it in the stack or delete it,
  and the marks already on it are left exactly as they are — a marquee will not
  pick them up either (see [selections](selection.md)). The Background is locked
  out of the box; unlock it if you want to paint the sheet itself.
- **Reorder** — the up and down arrows on the selected row. Raising a layer
  lifts everything drawn on it over the layers it passes. The **Background**
  does not move and nothing goes under it: it is the page, and every mark in the
  drawing is on top of it by definition. Its row offers no arrows, and the arrow
  that would push another layer below it is dimmed.
- **Delete** — the bin on the selected row. It takes the marks on that layer
  with it, so a layer with anything on it asks first. The last layer is never
  deleted, and neither is a locked one: a drawing always has somewhere to draw.
  To empty a drawing outright, use **Start over** — the bin at the end of the
  **Image** heading, which throws away every mark, every layer and the page
  colour in one step. (Undo brings any of it back in one step, as with every
  other edit.)

## What layers are not, yet

Deliberately simple for now: no per-layer opacity, no blend modes, no renaming,
no merging, and no moving marks from one layer to another after they are drawn.
The stack, what is on it, and what order it is in — that is the whole feature.
The Background carries the page colour but is not where you _choose_ it — that
is the New image dialog, when the page is made. Its **eye** is the exception, and
it is not a small one: switching the Background off is exactly what "no page
colour" means, so an image made transparent arrives here with that eye already
off, and turning it back on gives the page its sheet.

## How it is stored

A layer holds no marks. The drawing stays what it always was — one ordered list
of strokes — and each stroke names the layer it sits on, exactly as it names the
tool that drew it. The stack is a short list of names beside it.

That keeps undo exact (one mark is still one step), keeps the document small
enough for a phone, and means a drawing made before layers existed needs no
conversion: it opens as the Background plus Layer 1 with everything already on
Layer 1, and if you never add, hide or lock anything it is saved as the same
bytes it always was.
