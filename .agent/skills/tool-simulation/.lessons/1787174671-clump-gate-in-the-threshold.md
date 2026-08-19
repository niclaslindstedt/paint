---
title: A clumped medium's texture noise belongs in the CONTACT THRESHOLD, and may smear along the drag
date: 2026-08-19
scope: src/app/plugins/waxField.ts, src/app/plugins/waxSim.ts
concepts: [texture, clump, threshold, smear, tuning, grain]
---

Wax reads as islands of solid colour with CLEAN PAPER between them. Multiplying
the deposit by clump noise cannot paint that — every cell still catches a
little, and the mark renders as airbrush fuzz at any amplitude. The fix was
structural: push smooth area-noise through a hard shoulder (`smoothstep(0.26,
0.62, …)`) into a per-cell slip/bite factor that scales the DIG (the contact
threshold), so slipping cells stay genuinely bare under an ordinary hand — and
a leaned-on hand overwhelms the slip, which is exactly what burnishing is. Keep
a small deposit-side factor too (`SLIP_LAY ≈ 0.2`), but the threshold does the
look.

Second half: the clumps of a real crayon are streaks pointing where the hand
went. Direction-dependent texture is allowed in a page-anchored engine — sample
the fine octave in the drag's own frame (stretched ~2× along, squeezed ~0.7×
across), with the direction a mutable pair on the field that the walk sets
before each touch. Determinism holds because a cell keeps the direction it was
first worked out under and the walk order is fixed; crossing MARKS are separate
fields, each smearing its own way, and they still agree about the paper because
`sheet` stays page-anchored. The windowed walk preserves first-touch identity
because a touch is only skipped when its face cannot reach the window at all.
