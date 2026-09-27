---
title: The settle frontier is held back by EVERY window that can still move a settled touch — and the live fallback must grow too
date: 2026-08-17
scope: src/app/plugins/bristleSim.ts, src/app/plugins/bristle.ts
concepts:
  [grows, settle-frontier, provisional-tail, fallback, incremental, artifacts]
---

Under the grows contract a touch may settle permanently only once NOTHING can
still change it, and two different windows have each been forgotten once:

- **End effects** wider than a couple of samples (the brush's lift-fray, a
  third of a head) ride a lift window: hold the frontier at
  `min(speedHorizon, total − liftWindow)`, keep every touch inside the window
  provisional (undo log), and make every end-driven factor EXACTLY inert at
  the window's edge — gates compare against `lifts ≤ window`, tapers hit 1.0
  at `fromEnd = window` — so a touch that settles with `fromEnd = Infinity`
  equals the final walk's answer, and `verify-incremental` reads 0.000000.
- **Path smoothing**: the stored polyline turns a corner at every sample and a
  solid mark fans those corners open into bare wedges, so the walk smooths the
  path by about a third of the head first (`stiffen` in `bristle.ts`, shared
  by the vector painter and the field walk). A centred moving average means a
  touch's PLACE is not final until the path a head-width past it exists, so
  the frontier is `min(speedHorizon, total − max(liftWindow, stiffenRadius) −
spacing)`. The cell-for-cell comparison test is what catches it drifting.

Budget the declared `reach` for the window: provisional deposits land up to
`liftWindow + half-width` behind the newest points.

Separate trap on the same contract: a grows tool's LIVE fall-through may not
be the old whole-mark-fitted painter (ends measured from the total, grain
coarsened to the length) — the trail repaints patches, and a non-growing
painter goes stale mid-gesture. Fall back to a plain weighted line while
live; keep the rich painter for LANDED marks only.
