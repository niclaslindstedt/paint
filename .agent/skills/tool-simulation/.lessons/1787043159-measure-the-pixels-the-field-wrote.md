---
title: Measure a field engine end-to-end by capturing `putImageData` — in the probe AND in the tests
date: 2026-08-18
scope: src/app/plugins/, tests/support/fakeCanvas.ts
concepts: [probe, testing, fake-canvas, beer-lambert, tuning]
---

A field engine strokes nothing: it works a load out cell by cell and writes one
patch. So neither the repo's fake canvas tallies (`strokes`, `painted`) nor the
field arrays alone say what the user will _see_ — the field misses the
`DENSITY`/`SHOW` curve, and Beer–Lambert compresses hard at the dark end.

Both halves of the loop should read the written pixels instead:

- **Probe (node, no vitest):** shim `globalThis.document = { createElement: ()
=> ({ getContext: () => fake }) }` where `fake.createImageData` returns a
  plain buffer and `putImageData` keeps it, then call the _public_ painter
  (`paintSimulatedLead`) and average alpha. That exercises budgets, cell
  sizing, the store and the fallback — everything a hand-rolled walk over the
  field skips. Pass `live = true` to bypass the dried-mark store.
- **Tests:** `FakeContext.images` now records every `putImageData` (a copy).
  That turns "did it paint" into "how dark, and how much of it is paper" —
  mean alpha and coverage are what tool claims are actually about, and both
  are stable enough to assert on.

Report **mean alpha over the patch** and **coverage** (cells over ~0.04)
separately. They move independently and the difference is the medium: an
opacity change moves only the mean, pressing harder into the sheet moves both.
