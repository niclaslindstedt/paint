---
title: On this set's 45°-rotated glyphs, a satellite mark off the diagonal skews `aspect`, not just the size — put the distinguishing mark inside the silhouette
date: 2026-08-15
scope: src/app/icons.tsx
concepts: [glyph, aspect, satellite-marks, measurement]
---

Drawing the watercolour brush, the mark that says _water_ was first a bead
hanging off the tip. Off the brush's own 45° axis it measured `aspect` 1.21
against the set's median of ~1.00 — the glyph reads as leaning, not as bigger —
while the same bead placed _along_ the diagonal measured 0.98. The bucket gets
away with its drop because the drop sits on the pail's diagonal; a mark set
beside a rotated glyph does not.

Placing the mark **inside** the silhouette solved it outright: a filled dot in
the brush's belly kept `aspect` at 0.98 and cost only `fill` (29 → 34, still
inside the set's spread — the round brush is 31, the hand 32).

So when a glyph needs one extra mark to tell it from a sibling, the order to try
is: inside the silhouette first, on the glyph's own axis second, off-axis never.
And read `aspect` on every round — it is the column that catches this, and
`strokeR` will look perfectly healthy while it happens.
