# Delete background

Cut the subject of a picture out of its background: open **Delete background**
from the panel's **Image** section, paint over the subject, and the cut finds
its exact edge near your outline. What you keep is the subject on a transparent
layer; everything else on that layer is gone.

The tracing only has to be roughly right. Everything well inside your outline
is taken to be subject, everything well outside to be background, and the cut
searches the strip in between — twenty page pixels either side of your line, or
whatever you set **Search width** to — for the strongest continuous border: the
place where the colours genuinely change from the subject's to the
background's, all the way round.

**Your line counts as evidence.** The border is most likely where you drew it
and less likely the further from it the cut has to go, so where two edges are
equally believable the one nearer your hand wins, and where the picture offers
no edge at all the cut simply follows you.

## Making one

1. **Trace the subject** with any selection tool. The selection pencil is made
   for it — paint over the subject the way you would colour it in, and use its
   Erase mode to take back what you overshot (see
   [`selection.md`](selection.md)). A lasso around the subject works just as
   well. Two loops are two subjects; a loop traced inside another cuts a hole.
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
     page pixels. This is the dial that matters most, and the yellow band on
     the page is it: nothing outside that band can be taken from the subject or
     given back to it. Narrow it when something sits close behind the subject
     and keeps attracting the cut — at one pixel the cut is your tracing,
     exactly as drawn. Widen it when you have scribbled quickly and the true
     edge is further away than the cut can reach.
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

Both are laid on at a fifth of full strength, so the photograph underneath is
still the thing you are looking at. If the yellow band is lying over something
you do not want taken — a chair back just behind a shoulder, a cup by an elbow
— that is the moment to pull **Search width** down or to correct the tracing,
rather than after the cut has kept it.

The ants come back when the cut lands, or when you pick up a tool that draws.

## What to expect

A subject against a differently-coloured background cuts cleanly, whatever the
lighting. The honest limits: hair and fur come out as a firm edge rather than
individual strands (feather covers most of it), and a subject whose colours
melt into the background in places — dark shoes on dark ground — may need one
correction pass. The cut runs entirely on your device, like everything else
here: no upload, no model download, no server.
