# Light page, dark page

The page you draw on has its own theme, separate from the app's.

By default it **follows the app theme**: the dark app opens a dark sheet and
draws on it in light ink, and switching the app to a light theme flips both back
to a white page and dark ink. A white rectangle glaring out of a black shell was
the old behaviour; it isn't any more.

Settings → Canvas holds the control:

- **Follow app theme** — the default described above.
- **Light page** / **Dark page** — pin it, whatever the app is wearing. Useful
  when you're drawing something you'll export and paste somewhere with its own
  background.

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

Eraser strokes work the same way: they follow the page for good, so a page flip
can't leave old eraser marks painted in the previous page's colour.

## Pinning one drawing's colour

The canvas theme applies to every drawing that hasn't chosen a colour of its
own. Settings → Canvas → **Page colour** pins a specific colour to the drawing
you have open — a warm cream, a blackboard — which overrides the theme for that
drawing only, and travels with it when it syncs. **Follow theme** hands it back.

An exported PNG always carries the page it was drawn on, dark sheet included.
