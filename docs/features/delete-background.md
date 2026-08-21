# Delete background

Cut the subject of a picture out of its background: trace roughly over it with
a selection tool, open **Delete background** from the panel's **Image**
section, and the cut finds the subject's exact edge near your outline. What you
keep is the subject on a transparent layer; everything else on that layer is
gone.

The tracing only has to be roughly right. Everything well inside your outline
is taken to be subject, everything well outside to be background, and the cut
searches the strip in between — about twenty page pixels either side of your
line — for the strongest continuous border: the place where the colours
genuinely change from the subject's to the background's, all the way round.
Where the picture offers no edge to find, the cut follows your hand.

## Making one

1. **Trace the subject** with any selection tool. The selection pencil is made
   for it — paint over the subject the way you would colour it in, and use its
   Erase mode to take back what you overshot (see
   [`selection.md`](selection.md)). A lasso around the subject works just as
   well. Two loops are two subjects; a loop traced inside another cuts a hole.
2. **Open the panel's Image section** and press **Delete background**. The page
   behind shows the cut as you set it — the checkerboard showing through is
   what will be gone. Nothing lands until you press Apply.
3. **Adjust**, if the first answer isn't the one you wanted:
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
with sliders: adjust the selection with the selection pencil (add what it
missed, erase what it kept) and run the effect again. The cut can only find
borders _near your line_, so anything sitting wholly in front of the subject
stays until you trace around it.

## What to expect

A subject against a differently-coloured background cuts cleanly, whatever the
lighting. The honest limits: hair and fur come out as a firm edge rather than
individual strands (feather covers most of it), and a subject whose colours
melt into the background in places — dark shoes on dark ground — may need one
correction pass. The cut runs entirely on your device, like everything else
here: no upload, no model download, no server.
