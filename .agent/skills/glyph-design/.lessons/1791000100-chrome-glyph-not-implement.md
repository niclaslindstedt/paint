---
title: A chrome glyph in the tool band is judged on `strokeR` and `fill` only — `aspect` is meaningless for it, and the knob is dot size AND spacing
date: 2026-08-19
scope: src/app/icons.tsx
concepts: [glyph, ink-density, aspect, measurement, small-sizes]
---

`MoreToolsIcon` — the ellipsis that ends the toolbar's tool band — is a glyph in
the set that is deliberately not an implement. Two of the four columns still
apply and one does not:

- `strokeR` and `fill` **do** apply, and hard: the glyph sits in the same row as
  the tool glyphs, so it has to carry the same ink. First pass (three dots,
  `r=1.6`) measured `strokeR` 103 against the set's median 75 — flagged at +38%,
  with `fill` 44 against a set spread of 14–32.
- `aspect` does **not**. A horizontal ellipsis measures 8.5 where the set's
  median is 1.00, and no amount of drawing fixes that. Don't chase it; the
  extreme aspect is exactly what stops the button reading as a twelfth tool.

The knob is **two** numbers, not one, and both move `strokeR`: the dot radius,
and how far apart the dots sit. Shrinking `r` 1.6 → 1.2 and pushing the outer
dots out to `cx` 3.6 / 20.4 landed `strokeR` 75.8 (median 75) and `fill` 31
(level with the Paintbrush) in one round — the wider spacing lengthens the
bounding box's diagonal and enlarges its area, so it cuts both columns at once.

The general form: when a glyph's silhouette is a row or a line rather than a
box, spacing is as much of the weight budget as stroke width is, and `aspect`
stops being a signal. Say so in the report rather than presenting a flagged
row as a match.
