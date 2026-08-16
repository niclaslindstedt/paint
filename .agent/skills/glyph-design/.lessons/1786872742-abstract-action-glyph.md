---
title: A glyph for an abstract action shows the two states, not an arrow between them — an arrow has to leave the subject's bounding box to be seen
date: 2026-08-16
scope: src/app/icons.tsx
concepts: [glyph, ink-density, aspect, small-sizes]
---

Drawing "stand every canvas size the other way up" — an action, not an
implement, so the set's "draw the thing you hold" rule says nothing. Nine
candidates over four rounds; the ones with an arrow in them all failed the same
way. A pair of pages with an arc between them measured `aspect` 1.19 and `fill`
44 against a set median of ~1.00 / 37, because an arc drawn _between_ two shapes
has to clear both of their bounding boxes to be visible at all, and it then owns
the glyph's own box. Two overlapping pages with a corner arrow read as
"duplicate". A shaded second page measured `strokeR` 170 (+136%) — the solid-area
trap the set already knows about, at full-glyph scale.

What worked was the two states side by side and nothing else: a tall page and a
wide one, 68.3 / 37 / 1.00. The verb is carried by the button's own label, which
an icon in a labelled cell can always lean on.

Two numbers worth keeping. The orientations have to be pushed **hard** apart —
6.5 × 17 against 8 × 5.5 — because a rectangle only slightly wider than it is
high reads as a square at 18 px, and then the glyph is two boxes rather than one
page twice. And the gap between them wants ~2.5 units: at 18 px anything less
closes and the pair merges into one mark.
