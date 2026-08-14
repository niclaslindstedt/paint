# Picking marks up again

A drawing you can only add to is a drawing you redraw. The **selection** tool is
the other half: drag a box, and the marks it crosses are yours to move, copy,
cut or throw away.

## Choosing

Pick the marquee (**V**) and drag a box across the page. Everything it _touches_
is caught — you do not have to draw right around a long diagonal — and a dashed
outline settles around what you got. A press that never moved means "select
nothing", and so does Escape. ⌘/Ctrl+A takes the whole page while the marquee is
in your hand.

Marks on a hidden layer are never caught. You cannot select what you cannot see,
and deleting something invisible is the worst kind of surprise.

## Moving

Moving is the **hand**'s job. With something selected, switch to the hand
(**D**) and drag from inside the outline: the marks come with you rather than
the page. Drag from anywhere else and the hand still pans, which is what it is
for.

The move is shown live and touches nothing until you let go — so the whole drag
is one edit and one undo step, not one per frame. Marks dragged past the right
or bottom edge take the sheet with them, the way a dropped picture does.

## Copy, cut, delete

Three ways in, because a phone and a laptop do not agree on any one of them:

- **the keyboard** — ⌘/Ctrl+C, ⌘/Ctrl+X, and Delete or Backspace;
- **right-click** on the selection, on a desktop;
- **a long press** on it, on touch.

The last two open the same small menu: Copy, Cut, Paste, Delete.

A copy goes onto the **real** clipboard, as text behind a marker this app
recognises. That is what makes it work between two tabs, between two
sketchbooks, and across a reload — the trade being that pasting a copied
selection into a text editor shows you its JSON. Fair price.

## Pasting

⌘/Ctrl+V puts things _in_, and what you get depends on what you copied:

- **marks** — from this app, this page or another one, this tab or another one.
  They land a nudge from where they were copied and stay selected, so "paste,
  then drag it where you wanted it" is one gesture;
- **a picture** — from a screenshot, a web page, anywhere. It arrives in the
  same placement frame a dropped image opens, so you can size and position it
  before it becomes a mark;
- **words** — they open the caption box rather than landing on the page, set in
  the text tool's own size. The typeface, bold and italic are yours to change
  while it is open, and it becomes a mark when you keep it.

Pasting from the menu instead of the keyboard lands whatever it finds under the
point you opened the menu at — which is the only way to say _where_ on a phone.

## What a selection is not

It is not part of the drawing. Nothing about which marks are picked is saved,
synced or undoable; the selection is a set of stroke ids the screen holds while
you work, and the outline is worked out from the document every time it is
drawn. So an undo puts the marks back and the outline follows, deleting them
empties it, and opening another drawing drops it — there is no third copy of
anything to go stale.
