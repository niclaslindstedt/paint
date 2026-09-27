---
title: An arrowhead on a curve is built from the CHORD and drawn SOLID — squaring it to the tangent still reads as rotated, and an open chevron that small merges into a lump
date: 2026-08-16
scope: src/app/icons.tsx
concepts: [glyph, arrows, small-sizes, measurement]
---

Both quarter-turn glyphs shipped for a year with the arrowhead's vertex off the
arc and its wings at different angles to it. `measure` never flagged it —
`strokeR` 76.2, `fill` 40, `aspect` 1.03, dead centre of the set — and a user
spotted it in one glance on a phone. Two rounds to fix, and the first was wrong:

**Round one: vertex on the arc's endpoint, wings mirrored across the tangent.**
Measured fine (74.2 / 37 / 0.91) and still read as rotated, because a tangent is
straight and the stroke is not. Over a head's length the arc falls ~0.5 units
away from the tangent, so the head sits high. The head must be symmetric about
the **chord** running back along the arc — a rotation of `L / 2r`, about 11° for
a 3.2-unit head on a radius-8 ring. Small, and the whole difference between "on
the line" and "nearly".

**Round two: fill it.** An open chevron with 1.75-wide legs 3 units long merges
into a lump against the ring it ends; widening the legs to 4.4 drives one of them
through the ring and into the sheet. A solid dart — `L` 4.4, half-angle 24°,
`fill="currentColor"` with `strokeWidth 0.8` for the set's softened corners —
reads at 18 px and measures 78.1 / 40 / 0.95.

Put the head where the tangent is horizontal or vertical (here the top of the
ring): at the east point the wings pushed the bounding box out to x=21.5.
