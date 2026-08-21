---
title: The tool band leans SW–NE with the tip at lower-left — a HORIZONTAL silhouette needs rotate(-45), because rotate(45) lands it on the other diagonal
date: 2026-08-21
scope: src/app/icons.tsx
concepts: [glyph, tool-families, measurement]
---

The pens are drawn vertical and wrapped in `rotate(45 12 12)`, which puts the
barrel on the SW–NE diagonal with the tip at the lower-left corner. A new glyph
drawn as a **horizontal** shape (the selection pencil's capsule) and wrapped in
the same `rotate(45)` comes out on the OTHER diagonal — NW–SE — because SVG's y
runs down, so +45° carries the +x axis toward the bottom-right. On the contact
sheet it reads as one glyph leaning against the whole set, and no table column
flags it: `aspect` stays 1.00 on a symmetric shape whichever diagonal it is on.

The fix is the eraser's, which is the other horizontal silhouette in the band:
wrap a horizontal shape in `rotate(-45 12 12)`, and put the working end (tip,
solid wedge) at the LEFT end of the unrotated shape so it maps to the set's
lower-left tip corner. Check the direction on the rendered contact sheet, not in
your head — this session drew it wrong first and only the picture said so.
