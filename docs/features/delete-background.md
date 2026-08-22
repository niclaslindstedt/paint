# Delete background

Cut the subject of a picture out of its background: open **Delete background**
from the panel's **Image** section, paint over the subject, and the cut finds
its exact edge near your outline. What you keep is the subject on a transparent
layer; everything else on that layer is gone.

The tracing only has to be roughly right. Everything well inside your outline
is taken to be subject, everything well outside to be background, and the cut
searches the strip in between for the strongest continuous border: the place
where the colours genuinely change from the subject's to the background's, all
the way round.

**The pencil's width is the search width.** Paint the tracing with the
selection pencil and the strip the cut searches is exactly the stripe you
painted — no wider, and no narrower. That is the honest reading of a painted
line: a nib is not a hairline, and there is no way to tell afterwards whether
you ran its middle along the border or laid its edge against it and coloured
inward. Both are the same gesture, so the cut treats every part of the stripe as
equally likely and lets the picture decide between them.

It also means **precision is the pencil, not a slider**. Reach for a finer
pencil and the search narrows with it, which you can see on the page while you
draw rather than having to picture a number. Reach for a broad one and the cut
ranges over everything you covered.

Filling the middle in afterwards — with **Gap fill**, or by colouring it —
changes none of that. The inside of your tracing is settled: you said to keep
it, so nothing in it is looked at for a border however hard an edge sits there.

**Your line counts as evidence.** For an outline you did _not_ paint — a lasso,
a marquee, an area traced off the page — the border is most likely where you
drew it and less likely the further from it the cut has to go, so where two
edges are equally believable the one nearer your hand wins, and where the
picture offers no edge at all the cut simply follows you.

## Making one

1. **Trace the subject** with any selection tool. The selection pencil is made
   for it — run it around the subject's edge so the stripe it paints straddles
   the border, then fill the middle in (Gap fill does it in one press), and use
   its Erase mode to take back what you overshot (see
   [`selection.md`](selection.md)). Colouring the whole subject in works too;
   what matters is that the pencil covers the border, because the stripe it
   leaves is where the cut looks. A lasso around the subject works just as well.
   Two loops are two subjects; a loop traced inside another cuts a hole.
2. **Press Delete background** in the panel's **Image** section. It is always
   there, and pressing it with nothing traced is the ordinary way to start: it
   puts the selection pencil in your hand and tells you to trace. With a
   subject already traced it opens straight onto the cut, and the page behind
   shows it as you set it — the checkerboard showing through is what will be
   gone. Nothing lands until you press Apply.

   You do not have to close it to trace. **Put away**, in the dialog's footer,
   folds the options down to a strip at the foot of the canvas and leaves the
   page to your hand — on a phone, where the dialog is the whole screen, that
   is the only way to draw the tracing with the cut already open. Paint over
   the subject with the options still down and **the cut follows your outline
   as you draw it**: the settings stay where you put them, the page keeps
   showing what will be kept, and the strip brings the dialog back when you are
   ready to apply.

3. **Adjust**, if the first answer isn't the one you wanted:
   - **Search width** — how far either side of your line the cut may look, in
     page pixels. The yellow band on the page is it: nothing outside that band
     can be taken from the subject or given back to it.

     With a painted tracing it opens at the pencil's own width and follows it
     whenever you resize the pencil, so most of the time you never touch it —
     you change pencils instead. Widen it by hand when you have scribbled
     quickly and the true edge lies further out than you painted; a width you
     set that way sticks through every further dab at that pencil. It cannot be
     narrowed inside the stripe you painted: half of your own tracing being off
     limits is not a thing worth offering, and the way to search less is a
     finer pencil.

     For an outline you traced rather than painted, it is a plain distance
     either side of the line, starting at twenty page pixels. Narrow it when
     something sits close behind the subject and keeps attracting the cut — at
     one pixel the cut is your tracing, exactly as drawn.

   - **Feather** — how soft the cut edge is, in page pixels. Zero keeps it
     crisp; a pixel or two sits naturally in a photograph; more melts the
     subject into whatever you put behind it.
   - **Colour tolerance** — how little colour difference still counts as the
     border. Turn it down when a busy background keeps attracting the cut;
     turn it up when the subject nearly matches its background and the cut
     keeps missing the real edge.
   - **Smoothness** — how continuous the border must be. Low follows every
     wrinkle of the true edge and risks following noise; high gives a calmer
     outline and rounds fine detail away.
4. **Apply.** The layer bakes to a picture of the subject with the background
   transparent, exactly the way every effect bakes (see
   [`effects.md`](effects.md)): applied once, one step of undo, and marks you
   make afterwards are untouched.

If the cut misjudges a stretch — it kept a plant that stood in front of the
subject, or shaved a shoe off — the correction is your tracing, not a fight
with sliders: put the options away, adjust the selection with the selection
pencil (add what it missed, erase what it kept), and watch the cut redraw
itself against the outline you now have. The cut can only find
borders _near your line_, so anything sitting wholly in front of the subject
stays until you trace around it.

## Red and yellow

While you are tracing for a cut, the window stops being marching ants and
becomes a picture of what the cut is about to do:

- **red** is the subject — what you have said to keep;
- **yellow** is the band either side of your line, which is everywhere the cut
  will look for the real edge. Nothing outside it moves.

With the selection pencil the yellow lands **exactly under the stripe you just
painted**, because that is the band: what you paint is what is searched. The red
that shows through beyond it — the middle you filled in — is settled, and the
cut will not touch it.

Both are laid on at a fifth of full strength, so the photograph underneath is
still the thing you are looking at. If the yellow band is lying over something
you do not want taken — a chair back just behind a shoulder, a cup by an elbow
— that is the moment to reach for a finer pencil, pull **Search width** down, or
correct the tracing, rather than after the cut has kept it.

The ants come back when the cut lands, or when you pick up a tool that draws.

## What to expect

A subject against a differently-coloured background cuts cleanly, whatever the
lighting. The honest limits: hair and fur come out as a firm edge rather than
individual strands (feather covers most of it), and a subject whose colours
melt into the background in places — dark shoes on dark ground — may need one
correction pass. The cut runs entirely on your device, like everything else
here: no upload, no model download, no server.
