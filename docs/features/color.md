# Colour

The right-hand panel's **Colour** section is the tonal work: how light the
picture is, how far apart its tones sit, which of them count as black and white,
and what colour it all leans. Six adjustments, and between them they cover what
you would open an Image menu for.

They are [effects](effects.md) in every way that matters. You set one up, the
drawing shows it while you do — on the page behind the dialog where there is room
for one, in the dialog's own preview window on a phone — and nothing lands until
you press **Apply** —
at which point the layers it was aimed at become a picture of themselves with
the adjustment in them. Undo puts your marks back; a reload will not. The same
scope rules apply: **This layer** or **All layers**, and hidden or locked layers
are never touched.

The page colour is not a mark, so nothing here changes it. Adjust a drawing on a
cream sheet and the sheet stays cream — what moves is the ink on it.

## Brightness & contrast

The two you reach for first.

- **Brightness** lifts the picture toward white or drops it toward black. It is
  a lift rather than a flat offset, so brightening does not flatten your
  highlights to paper white before the shadows have moved at all.
- **Contrast** pushes the tones apart around the middle, or pulls them together.
  Negative is a flatter, mistier picture; positive is a punchier one.

## Levels

The same three handles every histogram has ever had — drawn, as they always have
been, **over the histogram itself**.

The shape behind them is your own picture: how many pixels of the layers this
would land on sit at each tone, darkest on the left, lightest on the right. That
is the whole reason the control looks like this. A scan of a pencil sketch has
nothing above tone 200 and nothing below 40, and "black point: 40" only means
something once you can see that the picture starts there.

- **Black point** — the tone that becomes black. Everything below it is black.
- **White point** — the tone that becomes white. Everything above it is white.
- **Midtones** — where the middle sits between the two. Drag it toward the
  shadows to lift the midtones and toward the highlights to drop them; it sits
  dead centre when nothing is being done to them.

Drag any of the three, or press anywhere on the bar to bring the nearest one to
you. The **shaded ends** are what is about to be thrown away — everything outside
the two handles comes out flat black or flat white — which is the one thing a
levels control can get badly wrong, so it is the thing drawn loudest.

**Auto** puts the two ends exactly on the ends of your data, which is the whole
of "read a washed-out scan back to a full range" in one press. **Reset** puts all
three back to doing nothing.

Each handle takes keyboard focus in the ordinary tab order, reads its value out,
and moves under the arrow keys (hold Shift for bigger steps, Home and End for the
extremes).

If the tones could not be counted — nothing on the layer, or a browser that
refused to hand the pixels back — the bar comes up empty and the handles work
exactly as they otherwise would.

## Curves

Everything levels does, by hand, plus everything it cannot.

The square is input left to right and output bottom to top, so the dashed
diagonal is "nothing changed" and every bend reads against it. Drag the line to
bend it, press it to add a handle, and drag a handle off the square to take it
away. The square takes keyboard focus too: the arrow keys move whichever handle
is selected (hold Shift for bigger steps), Tab walks between them, and Delete
removes one.

The line through the handles never turns back on itself, so lifting one part of
the range cannot dip the tones on either side of it — which is what makes a
curve safe to drag rather than something to nudge and check.

**Channel** picks which line you are on. **RGB** is the composite one and moves
the whole picture; **Red**, **Green** and **Blue** move one channel each, which
is how you take a cast out of the shadows without touching the highlights. The
channel curves run first and the composite runs over the top of them, so bending
RGB lifts the graded picture rather than replacing the grade.

**Straighten** puts every line back to the diagonal.

## Hue & saturation

- **Hue** turns every colour around the wheel, in degrees. Past the end it wraps,
  so a full turn is where you began.
- **Saturation** from grey at one end to fully saturated at the other.
- **Lightness** toward black or toward white.

Grey ink has no hue to turn and black has no colour to saturate, so this is a
tool for a picture with colour in it — a watercolour wash, a photograph you
dropped in — rather than for a pencil sketch.

## Colour balance

A cast aimed at one end of the tonal range and nowhere else.

Pick the **Tones** — shadows, midtones or highlights — and push the three
sliders: **Cyan – Red**, **Magenta – Green**, **Yellow – Blue**. The three ranges
overlap, so a shift aimed at the shadows fades out through the midtones rather
than stopping at a boundary and leaving a band across the picture.

**Keep the light** shifts the colours without changing how bright each pixel is,
which is the difference between warming a picture and lightening it. Off, a warm
cast also brightens; on, only the colour moves.

## Desaturate

Drains the colour out and leaves the light behind. All the way is a black-and-
white picture; part of the way knocks the colour back without losing it.

What each colour comes out as is its own brightness rather than the average of
its channels, so a saturated blue lands near black and a yellow lands near white
— which is where your eye already puts them.

## What to expect on a line drawing

Most of these are made for pictures with a range of tone in them. A drawing that
is black lines on white paper has very little for a brightness or a colour
balance to move, and nothing at all for a hue to turn. Bring in a photograph,
paint a watercolour wash, or fill an area, and the whole section starts to
matter.
