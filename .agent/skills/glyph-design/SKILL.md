---
name: glyph-design
description: "Use when drawing or correcting SVG icon glyphs — whether a designer supplied a sheet of them to match, or you are being asked to invent one. Sets up a render/measure/compare loop so glyphs are judged by numbers and overlays instead of by eye, and records the drawing rules that keep a set coherent at toolbar size."
---

# Glyph design

Drawing an icon by eye in a text editor does not work. The SVG looks fine in
your head, ships at 18 pixels, and turns out to be a third heavier than
everything beside it. This skill is the loop that catches that: render the
glyphs, **measure** them, look at the worst one, fix, repeat.

Use it when:

- a designer hands over a sheet of glyphs to match, or
- someone asks for a new tool glyph with no reference at all, or
- an existing glyph "looks wrong" and nobody can say why.

## The one rule

**Never judge a glyph from the source, and never from a single big render.**
Every claim about a glyph — too heavy, too small, off-centre, wrong shape — is
a number you can produce in about ten seconds. Produce it.

The corollary, and it has cost real ship-time: **the table cannot see joinery.**
It measures how much ink there is and what shape the box is; it has no column
for _where two shapes meet_, so a head glued crookedly onto its line, a cross
line that misses the barrel, a join that overshoots, all measure perfectly
in-set. Any glyph whose parts touch gets an `ascii` read as well as a row —
"measures in-set" is not the same claim as "is drawn correctly".

## Setup

Everything lives in `scripts/` here and needs nothing installed: `png.mjs`
decodes PNGs with node's `zlib`, and Chromium renders the SVG. Copy
`glyphs.config.example.json` next to your work, point it at the icon source,
and list the glyphs.

```sh
S=.agent/skills/glyph-design/scripts
node $S/glyphs.mjs render  --config glyphs.config.json   # draw them
node $S/glyphs.mjs measure --config glyphs.config.json   # the table
node $S/glyphs.mjs contact --config glyphs.config.json   # design | 96px | 18px
node $S/glyphs.mjs overlay --config glyphs.config.json --only Bucket
node $S/glyphs.mjs ascii   --config glyphs.config.json --only Bucket
```

Chromium is usually at `/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`.

## Working from a design sheet

1. **Find the glyph centres.** `calibrate --sheet a` lays a labelled grid over
   the sheet; read the centres off it into the config. They only need to be
   within a few pixels — the tools re-centre each cut on the ink it actually
   contains, because a coordinate typed off a screenshot is always slightly
   out and at overlay zoom that reads as a drawing error that is not there.

2. **Calibrate the scale on a shape you cannot get wrong.** Set each sheet's
   `scale` so a plain circle or rectangle in the design lands the same size as
   yours. Do this before judging anything else; every "too big / too small"
   reading is worthless until it is right.

3. **Study before drawing.** `ascii --only X` prints both drawings as text at
   matched resolution. This is the highest-value step and the easiest to skip.
   A blurry 60px screenshot hides whether a barrel is open or closed; the text
   picture does not.

4. **Then the loop:** `measure` → fix the worst row → `measure` again. Use
   `overlay` whenever a glyph measures right but still looks wrong: it puts
   your drawing in magenta straight over the design and shows placement and
   proportion in one glance.

### Reading the table

| column    | what it means                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strokeR` | stroke width over the artwork's diagonal, ×1000. Scale-free, so a 66px sheet glyph and a 96px render compare directly. **This is the "too thick" number.** |
| `fill`    | ink area over bounding-box area. How dense the drawing is; catches a glyph with too many strokes even when each one is the right weight.                   |
| `aspect`  | bounding-box width / height. Catches a glyph that is too tall or too squat.                                                                                |
| `IoU`     | overlap once both are normalised to the same box. Thin line art scores low even when right — read the trend across rounds, not the absolute.               |

## What went wrong last time (read this)

These are the mistakes that cost the most rounds. They will all recur.

- **Stroke weight is not a matter of taste.** A set drawn at 1.75 measured 66%
  heavier than the sheet it was copied from. Measure it, do not pick it.
- **A pen is one silhouette with cross lines in it, never a stack of boxes.**
  Barrel, collar and nib drawn as three closed rectangles look identical in
  the editor and carry ~60% more ink on screen, because every join becomes two
  edges instead of one. The same mistake in four fingers made a hand
  half again too dense. When `fill` is high but `strokeR` looks sane, this is
  why.
- **Satellite shapes stretch the bounding box and hide the real size.** A
  bucket's drop flung too far out made the pail measure correct when it was
  not. Compare the _largest part_ (`ascii` prints it) as well as the whole.
- **An interior narrower than about twice the stroke closes up** into a solid
  at small sizes. Widen the barrel rather than thinning the line.
- **Crops catch their neighbours.** Cell borders and caption text land in the
  cut and quietly ruin every number. The tools drop any blob touching the
  crop edge; if a measurement looks absurd, `ascii` the mask first — the bug
  is usually there and not in the drawing.
- **Compare like with like.** Render your glyphs at the same artwork size as
  the design's before measuring, and threshold relative to each crop's own
  brightest ink. Otherwise a crisp SVG measures thicker than a soft screenshot
  purely as an artefact.

## Working without a design sheet

Being asked for "a glyph for the smudge tool" is the same loop with the set
itself as the reference. Leave `sheets` out of the config; `measure` then
reports each glyph against the **set's own median** weight and flags the
outliers. A new glyph is finished when it is not an outlier.

Iterate the same way regardless:

1. Draw a first pass and `contact` it — including at the real size, which is
   the size that decides whether it works.
2. `measure`, and pull anything more than ~18% off the set's median back in.
3. When the glyph has to be told apart from a **sibling**, decide that with
   `ascii --only X` on each of them rather than off the contact sheet: the 18px
   column is a handful of pixels wide once the sheet is scaled to be looked at,
   and the text picture is the same comparison at a size you can actually read.
4. Show the contact sheet and say what you changed and why. Two or three
   rounds is normal; one is suspicious.

## Drawing rules that hold up at small sizes

- **Draw the implement, not the mark it leaves.** A tool glyph is a picture of
  the thing you hold. Where several tools share a silhouette — every pen is a
  stick at 45° — the working end and one earned detail tell them apart.
- **Let the tool's behaviour set the proportions.** If one tool paints twice
  as wide as another, its glyph's nib is the wider one. That is a free,
  truthful difference; spend it before inventing a decorative one.
- **Run corner to corner.** A glyph that keeps to the middle of the box looks
  shrunken beside ones that do not. Pick two glyphs as the set's yardstick and
  measure the rest against them.
- **Three shapes is about the ceiling** before a glyph reads as texture — with
  the exception of things that are texture, like a spray.
- **Below about two units, outlined detail fills in.** Draw it solid instead,
  or leave it out.
- **Check every glyph at its shipping size**, not just large. `contact`
  renders both.

## Finishing

- Keep the drawing rules next to the glyphs — a comment at the top of the icon
  file — so the next person changing one knows what the set agreed to.
- Send the contact sheet with the work. "Matches the sheet" is not reviewable;
  a side-by-side is.
- Report the numbers you ended on, including the ones still off, rather than
  claiming a match.
