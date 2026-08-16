---
title: An arrowhead's vertex is the arc's own endpoint, and its wings mirror across the tangent there — so put the head where that tangent is square
date: 2026-08-16
scope: src/app/icons.tsx
concepts: [glyph, arrows, aspect, measurement]
---

Both quarter-turn glyphs shipped for a year with the arrowhead's vertex 0.4
units off the arc's endpoint and its two wings at different angles to the
tangent. It reads as a wedge stuck onto the circle rather than as the end of a
stroke, and a user spotted it in one glance on a phone. (`measure` never did —
`strokeR` 76.2, `fill` 40, `aspect` 1.03, dead centre of the set. That is the
joinery blind spot now written into SKILL.md's one rule.)

The construction that fixes it, and the geometry worth reusing: the head's
vertex must be **exactly** the arc's endpoint, and the two wings mirror images
across the tangent there. That is only comfortable to draw where the tangent is
horizontal or vertical, which decides _where on the ring the head goes_ — both
heads moved to the **top**, because at the east point (tangent vertical) the
wings pushed the bounding box out to x=21.5 and the glyph would have measured
wide.

Cost of the move, for calibration: `aspect` 1.03 → 0.91, still inside the set
(MirrorH is 0.93), and `fill` 40 → 37. Wings of ~3.2 units at ~32° off the
reversed tangent read as an arrowhead at 18 px; at 2.4 units they read as a blob
beside a 1.75 stroke.
