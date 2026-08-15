# Filters

A filter changes how the whole page is **seen** rather than what is on it. Blur
a sketch to send it behind something else; scatter grain over it to take the
flatness off a diagram. Neither one redraws a mark: the drawing underneath is
exactly the drawing you made, and switching the filter off gives it straight
back.

That is the point of doing it this way. Your drawing is a list of vector
strokes, and it stays one — a filter is a couple of numbers alongside them.
Nothing is flattened into a picture, so undo still steps back over your marks
one at a time, the file stays small, and a filtered page opens filtered on
another device rather than arriving as a blurry photograph of itself.

## Switching one on

Open the right-hand panel — it is docked beside the canvas on a wide screen, and
behind the panel button in the header (or a swipe in from the right edge) on a
narrow one — and find the **Filters** section under the Image actions. Each
filter is a row, with what it is currently set to on the right, or **Off**.

Press a row to open its options. Nothing lands on the drawing until you press
**Apply**, so you can move the sliders about and change your mind for free.
**Turn off** takes the filter back off the page.

Applying a filter is one edit, like any other: one step of undo, one entry in
the drawing's history, one push to your cloud copy.

## Blur

One setting — **Radius**, in page pixels, from a hairline softening to a
thorough fog. It is a distance on the page rather than on your screen, so
zooming in shows you more of the blur rather than less of it, and a page that
gets scaled up takes its blur with it.

## Noise

Fine specks scattered over the page, half of them lighter than what they land on
and half darker, the way grain sits on film.

- **Strength** — how far the specks go. Low is a texture you notice only on a
  flat area of colour; high is a page you read through the dust.
- **Speck size** — how big one speck is, in page pixels. One pixel is film
  grain; a few is closer to a rough paper.
- **Coloured specks** — off by default, which leaves grey grain. On, the specks
  carry colour of their own.

The grain belongs to the drawing, not to the window: pan around and it stays
where it was.

## In exports

Every export goes through the same painting the screen does, so a filtered page
downloads filtered — PNG, JPG and the clipboard included. An **SVG** carries the
filters as SVG filter primitives instead, which any reader applies for itself;
the blur is the same Gaussian, and the grain is the nearest thing a vector file
can generate, so it is the same effect at the same strength rather than the same
specks.

A **transparent** export has no page for the effect to reach past your marks:
the blur fades out into nothing at their edges, and the grain lands on the marks
alone rather than on a rectangle of dust around them.

## What a filter does not touch

- **The layers.** A filter is applied to the finished page, so it covers the
  stack rather than any one sheet of it. Hiding a layer removes it from what the
  filter sees, like everything else.
- **Picking colours.** The paint bucket and the dropper read the drawing, not
  the filtered view of it, so a blurred page still fills and samples the colours
  you actually painted.
- **The selection outline.** Marching ants are drawn over the top of everything,
  filters included — what you have picked out has to stay legible.
