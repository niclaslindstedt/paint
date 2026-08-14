# Layers

A drawing can be more than one sheet of glass stacked on top of another. Put the
photo on the bottom, the tracing over it, the labels over that — then hide the
photo when you want to see the tracing alone, or slide a layer under something
you drew earlier without redrawing it.

Every drawing starts as one layer, called **Background**, holding everything you
have already drawn. Nothing changes until you add a second one.

## Getting to the panel

**On a wide screen the panel is simply there**, docked down the right-hand side
beside the canvas: a panel you have to summon is one you forget you have, and
there is width to spare. Above the stack it carries the **Image** actions —
resize, flip, mirror — which act on the whole drawing (see
[the canvas](canvas.md)).

**On a narrower screen it is a button in the top right**, and the panel comes out
over the page when you press it. **Swipe in from the right edge** does the same —
the edge gesture that opens the sidebar, on the other side.

A floating panel **goes away again when you press anywhere on the page**. It is
something you visit between strokes, so it takes no width from the page and never
stays in the way. The toolbar and the header stay live while it is open — picking
a colour for the layer you just selected does not cost you the panel. Escape
closes it too. (A docked panel has no close button: it is part of the screen
rather than something you opened.)

If you have set the sidebar to open from the **right** edge (Settings → General),
that edge is already spoken for: the swipe opens the sidebar and the header
button is the way into layers.

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
  still in the document and come back with the eye.
- **Reorder** — the up and down arrows on the selected row. Raising a layer
  lifts everything drawn on it over the layers it passes.
- **Delete** — the bin. It takes the marks on that layer with it, so a layer
  with anything on it asks first. The last layer is never deleted: a drawing
  always has somewhere to draw, and wiping one clean is what the eraser's own
  sweep of the page is for. (Undo brings a deleted layer and its marks back in
  one step, as with every other edit.)

## What layers are not, yet

Deliberately simple for now: no per-layer opacity, no blend modes, no renaming,
no merging, and no moving marks from one layer to another after they are drawn.
The stack, what is on it, and what order it is in — that is the whole feature.

## How it is stored

A layer holds no marks. The drawing stays what it always was — one ordered list
of strokes — and each stroke names the layer it sits on, exactly as it names the
tool that drew it. The stack is a short list of names beside it.

That keeps undo exact (one mark is still one step), keeps the document small
enough for a phone, and means a drawing made before layers existed needs no
conversion: it opens as a single Background layer, and if you never add a second
one it is saved as the same bytes it always was.
