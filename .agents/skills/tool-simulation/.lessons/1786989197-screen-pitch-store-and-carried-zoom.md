---
title: A screen-pitch field still gets a dried-mark store — key the cell; the zoom gesture itself is the frame cache's job
date: 2026-08-17
scope: src/app/plugins/leadSim.ts, src/app/cache.ts
concepts: [dried-mark-store, zoom, cell-pitch, budgets]
---

SKILL.md says work fields in document space because that makes marks
cacheable at every zoom. The lead deliberately breaks that rule (its grain
resolves at device pitch, `cell = PIXEL / scale / detail`), and for years that
read as "so it can't have a store". Wrong: put the resolved `cell` in the
store's ask (`leadStore.ts`) and the store works at any FIXED view — pans,
undos, relay re-renders all hit. What you give up is only zoom persistence:
a settle at a new scale re-dries each mark once. Store the WHOLE mark, not
the window-clipped patch, or pan strips miss; but refuse marks whose
unclipped box would trip the span cap, because storing those would coarsen a
mark the windowed path still works out fine.

The other half: never make the simulation carry the zoom GESTURE at all.
`cache.ts` now serves a frame that differs only by the view, while the canvas
declares the view under the fingers (`CacheSpec.zooming`), as ONE resampled
blit of the last real repaint — the settle frame repaints sharp. Measured
before: ~11.6 ms of field CPU per 600 px pencil mark per zoom frame, >1 s per
frame on a 100-stroke sketch; after: one drawImage. So a new medium only has
to be fast at (a) settled repaints — that's the store — and (b) live drawing —
that's the incremental walk. Frame-rate zoom is the frame cache's job, and
tuning a simulation for it is wasted work.
