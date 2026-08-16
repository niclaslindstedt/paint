# Light page, dark page

A page that has chosen no colour of its own **follows the app theme**: the dark
app opens a dark sheet and draws on it in light ink, and switching the app to a
light theme flips both back to a white page and dark ink. A white rectangle
glaring out of a black shell was the old behaviour; it isn't any more.

There is no app-wide "always draw dark" switch. A page that wants a colour of
its own is given one when it is made — see below — because that answer belongs
to the drawing rather than to the app.

## Ink follows the page

Until you pick a colour from the toolbar, the ink is "whatever reads on this
page" — near-black on a light sheet, white on a dark one — so flipping the theme
never leaves your next stroke invisible. Once you pick a swatch, that colour is
yours and stays put.

This applies to marks you have **already drawn**, too. A mark that never chose a
colour doesn't store one: it takes the page's ink whenever it is painted. So
flipping a whole sketch from dark to light re-inks it rather than leaving it
invisible against the new page — and the marks you deliberately drew in red stay
red. Nothing in the drawing is rewritten; the theme is a way of viewing it.

Eraser strokes never had a colour to flip: they take ink off rather than paint
the page over it, so a page flip finds nothing in them to re-ink.

## Pinning one drawing's colour

**New image → Page colour** is where a page gets one — a warm cream, a
blackboard — and it travels with the image and syncs with it, ignoring the app
theme from then on.

It is asked there because it is part of what the page **is**, alongside its size
and its sheet, and because the stock swatches beside it are painted on it: pick
a black page and you are comparing the six surfaces as that black page rather
than as a stranger's white one. Like the size, it is fixed once the page exists.

## …or no colour at all

The **first swatch is a chequer, and it is the default**: no page. The marks land
on nothing, and the canvas draws the chequer under them — dark greys in a dark
app, light greys in a light one — so you can see that there is nothing there.

That is worth having as the default because an image is as often something to
drop onto a page somebody else owns as it is a sketch on a sheet of its own. A
PNG or an SVG of one downloads with nothing behind it without your having to
find a setting for it. (JPG has no transparency, so it is given the colour the
sheet would have had — see [getting work out](export.md).)

"No page" is the same thing as switching the **Background layer** off in the
layers panel, not a second idea beside it — so a page you started transparent can
be given a sheet later by switching that eye back on, and one you started with a
colour can have it taken away the same way. [More](layers.md).

An exported PNG always carries the page it was drawn on, dark sheet included.
