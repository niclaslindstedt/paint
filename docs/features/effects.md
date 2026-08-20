# Effects

An effect changes what is **on** the page. Blur a sketch to push it behind
something else; scatter grain over a photograph to take the flatness off it. You
set it up, you apply it, and it is then part of the picture — like reaching for
a real can of spray, not like putting a coloured gel over a lamp.

The panel splits them in two. **Effects** is this page — blur and noise, the
passes that change what a mark looks like. **Colour** is the tonal work — levels,
curves, hue, colour balance — and it is the same machinery throughout, so
everything below applies to it too. See [`color.md`](color.md).

That is the whole idea, and everything else follows from it:

- **It happens once.** A line you draw afterwards is sharp. Nothing keeps
  re-softening as you work, so drawing and rubbing out on a layer you have
  blurred is as fast as on any other.
- **It stacks with itself.** Blur the same layer twice and you have blurred the
  blur — which is exactly what a second pass over the same photograph does.
- **It replaces the marks it lands on.** The layer becomes a picture of itself
  with the effect in it. **Undo puts your marks back**, so it is safe to try;
  reloading the page will not.

Effects used to be _filters_ — a setting on the drawing that changed nothing and
was re-applied every time the page was painted. That kept the document purely
vector, and it cost what it sounds like: every stroke on a blurred layer forced
the whole layer to be softened again, on every frame, so rubbing out on a
blurred watercolour crawled. This is the honest version, and the fast one.

## Applying one

Open the right-hand panel — it is docked beside the canvas on a wide screen, and
behind the panel button in the header (or a swipe in from the right edge) on a
narrow one — and find the **Effects** section under the Image actions, or
**Colour** under the layer stack. Both sections move: the grip on a heading
drags it into another order, and Settings → Panel switches a section — or a
single effect by name — off altogether (see [the panel](panel.md)).

Press a row to open its options. **The effect is shown as you set it** — never as
a number you have to guess at. A radius of 20 page pixels means nothing until you
see it, and what you are shown is the same painting the effect will actually
make, on the same layers, so what you approve is what you get.

Where you see it depends on how much room there is.

**On a screen with room beside the dialog**, it is the page itself. The card
steps down to the foot of the window and stops dimming the page behind it, so the
drawing is the preview. And because no single resting place is right for every
drawing — the part you care about is often exactly where a bottom-anchored card
lands — **you can drag the card by its title** and put it wherever it is out of
the way. It stays there for as long as it is open; **Put back** appears beside
the title once you have moved it. The arrow keys move it too, if you would rather
not reach for the mouse.

**On a phone**, the dialog is the whole screen — three sliders, a scope picker
and a warning do not fit beside a picture on 390 points of width — so it carries
its own **preview window** at the top instead. It shows the same page with the
same effect on it, it stays put while you scroll down to the controls, and it is
a real window rather than a thumbnail: **drag it to move around the page, pinch
or scroll to zoom in**. It opens on whatever you were looking at when you reached
for the effect, or on your marks if that would have been blank page.

Two buttons sit in its corner. **Fit** puts the whole page back in view. **Hold
Before** and the effect comes out of the picture for as long as you hold it,
which is the comparison every adjustment wants and the one thing a live preview
cannot show on its own.

Nothing lands until you press **Apply**. A slider dragged from end to end and
thought better of costs you nothing — no undo step, no history entry, nothing to
sync — and **Cancel** puts the page straight back.

Applying is one edit like any other: one step of undo, one entry in the
drawing's history, one push to your cloud copy.

## Where it lands

**Noise** always applies to the layer you have selected. Grain belongs to the
sheet a mark was made on; the same speck field laid over every layer of a stack
would be the same dust twice over.

**Blur** offers a choice:

- **This layer** — only the selected layer is softened. Everything above and
  below it stays exactly as it was, which is how you blur a photograph and keep
  the notes you wrote on top of it crisp.
- **All layers** — every layer that is showing and unlocked is softened, each
  one on its own. Your stack survives: you get a blurred version of each layer,
  not one flattened picture, so you can still reorder and hide them afterwards.

Two things are never touched by **All layers**: **hidden** layers (an effect you
cannot see land is one you cannot judge) and **locked** ones — which includes the
background sheet on a fresh drawing. Unlock a layer and it is in.

The dialog names what it is about to rewrite before you press the button, and if
the layer you picked has nothing on it, it says so and **Apply** is dead.

## Blur

One setting — **Radius**, in page pixels, from a hairline softening to a
thorough fog. It is a distance on the page rather than on your screen, so it
means the same thing at any zoom.

The softened layer is cropped to the marks that went into it plus enough room for
the blur to fade out, so a small sketch on a big page stays a small picture.

## Noise

Fine specks scattered over what is already there, half of them lighter than what
they land on and half darker, the way grain sits on film.

- **Strength** — how far the specks go. Low is a texture you notice only on a
  flat area of colour; high is a page you read through the dust.
- **Speck size** — how big one speck is, in page pixels. One pixel is film
  grain; a few is closer to a rough paper.
- **Coloured specks** — off by default, which leaves grey grain. On, the specks
  carry colour of their own.

Grain lands on the marks and nowhere else, so a layer with a lot of empty space
on it does not come back as a rectangle of dust.

## After it is applied

The layer is a picture, and it behaves like any other picture on the page:

- **Drawing on it** puts a sharp mark on top. Nothing softens it.
- **Rubbing out** takes pixels off it and shows what is underneath — the layers
  below, or the page. That is how you open a soft hole in a photograph, and it
  is now as quick as rubbing out anywhere else.
- **Moving, scaling and turning the page** carry it along exactly as they carry
  a photograph you dropped in.
- **Exports** need do nothing special: the effect is in the marks, so every
  format — PNG, JPG, SVG, the clipboard — carries it without any extra
  machinery.

## What an effect does not touch

- **Anything you did not aim it at.** Layers outside the scope are untouched,
  down to the byte.
- **Picking colours.** The paint bucket and the dropper read the page as it
  actually is, including a baked effect — which is the right answer now that the
  softening really is on the page.
- **The page colour.** The sheet is not a mark, so nothing here changes it.
