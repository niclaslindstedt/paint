---
title: On a ring or outline glyph `fill` and `strokeR` are ONE knob — a light-looking ring is fixed with a shape inside it, never a thicker line
date: 2026-08-22
scope: src/app/icons.tsx
concepts: [glyph, ink-density, measurement, small-sizes]
---

Drawing the gauge for Settings → Performance (a dial: open ring, needle, hub).
For any ring of radius `r` stroked at `w`, the ink is a perimeter and the box is
an area, so both columns collapse to the same ratio — measured here as
`fill ≈ 1.6·(w/r)` and `strokeR ≈ 370·(w/r)`. Thickening to fix a low `fill`
raises `strokeR` by the same proportion, and growing the glyph lowers both. Four
rounds confirmed it: `78.5/30` → solid dart needle `91.7/36` → thinner dart
`88.3/34` → same drawing grown from r=8 to r=9 `79.1/31`.

Two things follow. **Judge a ring's `fill` against the set's other OUTLINE
glyphs, not the set median** — in the chrome set the median (~40) is held up by
closed boxes (Save 49, Merge 49) while the outline members sit at 32–37, and 31
is that class's floor rather than a fault. **And the only real lever on `fill` is
a second shape inside the same box**, which is exactly what this set's two other
rings already do: Eye has its pupil, the turn pair a solid square.

The needle also re-proved the solid-mark trap from the other end: a solid dart
3.5 units wide at its base measured `strokeR` 91.7 (+22%, flagged) because
`measure` reads a solid as stroke width. 2.3 units — about 1.3× the set's own
1.75 stroke — measured in-set. For a mark that runs _along_ a line rather than
sitting beside one, its width wants to be a little over the stroke it replaces,
not the fifth-of-the-silhouette a satellite mark gets.

One scoping note: a Settings tab-rail icon is a **chrome** glyph (it ships
beside `ToolboxIcon` and `SidePanelIcon`), not a tool-band one.
