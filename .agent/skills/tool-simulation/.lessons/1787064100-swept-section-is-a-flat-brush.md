---
title: A swept cross-section IS a flat brush — a round needs a domed section and footprint-shaped ends
date: 2026-08-18
scope: src/app/plugins/bristleSim.ts, src/app/plugins/bristleField.ts
concepts: [head-shape, projection, ends, splatting]
---

Walking a path and pressing a straight cross-section at each touch models one
thing exactly: a chisel blade held perpendicular to travel. Every head shape
fed through it comes out as the same slab — two ruled parallel sides, a
top-hat of deposit between them, and both ends cut off square across the full
width. Users read that as "I picked the round and it paints like a flat", and
they are right: it is the flat, geometrically.

Two things separate the shapes, and the projection that decides the _width_
(`projected`) is neither of them:

- **Across the section**, deposit must follow the chord of the footprint
  (`bearing` in `bristleField.ts`): a cone curves off the paper toward its
  rim, so the band softens to its two sides, where a square-cut ferrule bears
  the same all the way out. Normalise the chord against a plateau (~0.72) so
  the middle stays saturated and only the outer fifth shades — the raw
  `sqrt(1-u²)` is a lens, not a brush.
- **Along the path**, the ends need the footprint, not the last section. The
  same `projected` with its two axes swapped gives the head's reach _along_
  the stroke — a whole half-width for a round, a fourteenth for a blade pulled
  square — so one function shapes both ends of both heads and nothing branches
  on which brush it is.

Also: below that reach the gesture has not left its own print, so it is a
press. Walking a drag anyway makes the two ends' half-prints face different
directions and the union misses a wedge — a bite out of the blot when a
finger shifts two pixels on the glass.
