---
title: A solid mark that separates a family member is measured by `strokeR`, not `fill` — size it to about a fifth of the silhouette
date: 2026-08-15
scope: src/app/icons.tsx
concepts: [glyph, small-sizes, tool-families, measurement, satellite-marks]
---

Drawing the rubber (the third block-and-page silhouette, beside the eraser),
the separating mark was the working end of the block filled in. Filling the
whole end — a third of the block, out to the eraser's seam line at `x=9.8` —
measured `strokeR` **105.6 against the set's median 75**, flagged at +40%.
`fill` was only 35, well inside the spread, so the column that catches this is
`strokeR`: a solid area reads to the measurer as one very fat stroke.

Shortening the fill to `x=7.8` — about a fifth of the silhouette — brought it to
88.6 (+17%, unflagged, and level with the Paintbrush at 87.5) with `fill` at 30.
One round.

So when the family lesson says "the third member differs in weight", the size of
that solid is the whole decision, and it is much smaller than it looks in the
editor. Start at roughly a fifth of the silhouette's long axis and measure.

The other half worth keeping: make the solid _replace_ an existing mark rather
than join it — the fill ends exactly where the eraser's seam line was, so the
new glyph carries the same three shapes its sibling does and the shape count
never creeps.
