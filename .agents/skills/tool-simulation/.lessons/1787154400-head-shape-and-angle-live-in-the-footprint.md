---
title: A swept cross-section is a flat held square — a head's shape AND its angle both live in the footprint, not in the width
date: 2026-08-18
scope: src/app/plugins/bristleSim.ts, src/app/plugins/bristleField.ts, src/app/plugins/bristlePrint.ts
concepts: [head-shape, projection, ends, splatting, angle]
---

Walking a path and pressing a straight cross-section at each touch models
exactly one head: a chisel blade held square across travel. Every other shape
comes out the same slab — ruled sides, both ends cut off square. The
projection that decides the _width_ (`projected`) is not what separates them.
Three things are, and all three come off the footprint:

- **Across the section**, deposit follows the chord of the footprint
  (`bearing` in `bristleField.ts`): a cone curves off the paper toward its
  rim, so the band softens to its sides where a square-cut ferrule bears the
  same all the way out. Normalise the chord against a plateau (~0.72) — raw
  `sqrt(1-u²)` is a lens, not a brush.
- **Along the path**, the ends need the footprint's _reach_ rather than the
  last section: `projected` with its two axes swapped — a whole half-width
  for a round, a fourteenth for a blade pulled square.
- **Off the path** — the one an angle dial lives or dies on. A blade held
  obliquely leads with a corner, so the swept band is a **parallelogram**,
  not a capsule: the slices within a reach of either end stand off to one
  side (`lean`/`spanOf` in `bristleHead.ts`). Without it the angle survives
  only as a width, and the bug report is exactly "it is angled when I press
  and perpendicular the moment I drag".

That reach is also the press/drag threshold, and it is **not one number on a
head**: measured against the narrow way a blade can stand, a press became a
drag after two pixels of travel and the tap's angled bar flipped. Below it,
walking a drag anyway makes the two half-prints face different ways and the
union misses a wedge.

Bound the blast radius with a film checksum per head — round, square-on,
edge-on, oblique — before and after: a geometry fix that is right leaves
every configuration whose print does not lean bit-identical.
