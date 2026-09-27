---
title: An engine's module-held canvas outlives a test's fake document — read pixels off the blit's own source
date: 2026-08-19
scope: tests/chalkSim_test.ts, tests/leadSim_test.ts
concepts: [testing, fake-canvas, dried-mark-store]
---

The field engines hold ONE reusable canvas at module level for windowed
repaints (`boardFor`/`sheetFor`). Tests create a fresh fake document per test,
but the held surface was created under the FIRST test's document — so from the
second test on, `dom.created.flatMap((c) => c.ctx.images)` finds nothing, even
though the paint call succeeded. The lead's tests never hit this because they
exercise only the store path, which allocates a surface per mark.

Read the mark's pixels off the blit's own source instead: the screen context
records every `drawImage` source in `calls`/`blits`, and
`screen.blits.at(-1).getContext().images.at(-1)` is the patch the engine
actually wrote, whichever document created the canvas it lives on.
