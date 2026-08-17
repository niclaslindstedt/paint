---
title: End effects wider than a couple of samples ride a LIFT WINDOW; live fallbacks must grow too
date: 2026-08-17
scope: src/app/plugins/bristleSim.ts
concepts: [grows, provisional-tail, fallback, settle-frontier]
---

The quill's lift pool sits on ONE touch, so its settle frontier is just the
speed window. A brush's lift-fray spans ~a third of a head back from the end —
far more than two raw samples — and it still fits the grows contract: hold the
frontier at `min(speedHorizon, total − liftWindow)`, keep every touch inside
the window provisional (undo log), and make every end-driven factor EXACTLY
inert at the window's edge (gates compare against per-hair `lifts ≤ window`;
tapers hit 1.0 at `fromEnd = window`), so a touch that settles with
`fromEnd = Infinity` equals the final walk's answer. `verify-incremental`
then reads 0.000000, not float noise. Budget the declared `reach` for it:
provisional deposits land up to `liftWindow + half-width` behind the newest
points.

Separate trap on the same contract: when a tool declares `grows`, its LIVE
fall-through may not be the old whole-mark-fitted painter (lead-in/run-out
measured from the ends, grain coarsened to the total) — the trail repaints
patches, and a non-growing painter goes stale mid-gesture. Fall back to a
plain weighted line while live and let the lift paint it properly; keep the
rich vector painter for LANDED marks only, where the full repaint runs.
