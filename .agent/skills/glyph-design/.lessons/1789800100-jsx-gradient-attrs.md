---
title: A glyph using an SVG gradient must write `stop-color` / `stop-opacity` dashed — the harness renders the JSX source verbatim, so camelCase silently draws nothing
date: 2026-08-15
scope: src/app/icons.tsx
concepts: [glyph, measurement, tooling, gradients]
---

`glyphs.mjs render` pulls the JSX out of `icons.tsx` and drops it straight into
an HTML page. A browser reading that HTML does not translate React's camelCase
attribute names, so `<stop stopColor="currentColor" stopOpacity="0.5"/>` renders
as an unstyled stop — the fill comes out empty and the glyph measures as if the
gradient were not there at all (the first pass reported `fill 29`, identical to
the plain rectangle it was drawn from, which looked like a _design_ result and
was not).

Write them dashed: `stop-color` / `stop-opacity`. Preact sets unknown attributes
directly, so the dashed spelling is also what the app itself wants — this is not
a concession to the harness.

The general form of the trap: **anything in a glyph that depends on JSX-to-DOM
attribute translation will not survive the render step.** If a measurement comes
back exactly equal to the glyph you started from, check the emitted HTML in
`<out>/mine.html` before believing the number.
