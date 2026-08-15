---
title: A glyph whose ink is a ramp is tuned by its peak opacity, and 50% is what lands a full-box gradient inside this set
date: 2026-08-15
scope: src/app/icons.tsx
concepts: [glyph, ink-density, measurement, gradients]
---

The gradient tool's glyph is a filled ramp inside the shape family's rounded
rectangle — the one glyph in the set whose ink is graded rather than laid down
or left out. A graded fill can be any weight at all, so the peak opacity is the
knob and it has to be measured rather than picked:

| peak | `fill` | `strokeR` |
| ---- | ------ | --------- |
| 0.9  | 59     | 138       |
| 0.6  | 38     | 81        |
| 0.5  | 30     | 61        |

The set runs `fill` 14–32 (the hand is the densest at 32) with a `strokeR`
median of 59, so **0.5 is the setting that lands inside it** — and the rule of
thumb behind the table is that a linear ramp's mean ink is about half its peak
over the area it covers.

Check the 18 px column afterwards regardless: what survives there is the solid
end of the ramp, and that end is also what tells the glyph from the plain
rectangle it shares a silhouette with (see the family lesson beside this one).
