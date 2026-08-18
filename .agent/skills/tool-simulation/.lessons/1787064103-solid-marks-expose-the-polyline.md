---
title: A solid mark exposes the stored polyline's corners — stiffen the walk, and hold the settle frontier back by that window
date: 2026-08-18
scope: src/app/plugins/bristleSim.ts, src/app/plugins/bristle.ts
concepts: [grows, settle-frontier, artifacts, incremental]
---

The canvas stores a gesture as a polyline, so a quick sweep turns a corner at
every stored sample. A walk that presses a straight cross-section at each
touch fans those corners open: consecutive bars splay apart on the outside of
the turn and leave a wedge of bare paper, one per pointer sample. While the
mark's own texture was full of holes this was invisible; the moment the
texture closed up it was the most obvious defect on the sheet.

The cure is the physics: a bar of hair cannot turn inside its own width, so
smooth the traced path by about a third of the head before laying anything
(`stiffen` in `bristle.ts`, now shared by the vector painter and the field
walk — one definition, or the live mark and the landed one disagree).

**The catch is `grows`.** `stiffen` is a centred moving average, so a touch's
_place_ is not final until the path a head-width past it exists — and its
window closes at the path's end, which moves. So the settle frontier is
`min(speedHorizon, total − max(liftWindow, stiffenRadius) − spacing)`, not
just the lift window. Get this wrong and the incremental walk quietly stops
matching the one-shot walk; the repo test that compares them cell-for-cell
(`tests/bristleSim_test.ts`, "lays the film one whole walk would") is what
catches it.
