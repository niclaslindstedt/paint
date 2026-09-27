---
title: The contact threshold is the texture's gate — clumping goes INSIDE it, and anything sparse-but-visible must route AROUND it
date: 2026-08-19
scope: src/app/plugins/waxField.ts, src/app/plugins/waxSim.ts, src/app/plugins/chalkField.ts, src/app/plugins/chalkSim.ts
concepts: [texture, clump, threshold, dust, halo, smear, tuning, grain]
---

Two sides of one rule about a sheet-threshold medium, learned once each way in
the same week.

**Texture that should leave bare paper goes in the threshold, not the
deposit.** The wax's islands-with-clean-paper look could not be painted by
multiplying the deposit by clump noise — every cell still catches a little and
the mark renders as airbrush fuzz at any amplitude. Push smooth area-noise
through a hard shoulder (`smoothstep(0.26, 0.62, …)`) into a per-cell slip/bite
factor that scales the DIG, so slipping cells stay genuinely bare under an
ordinary hand and a leaned-on hand overwhelms the slip — which is what
burnishing is. Keep only a small deposit-side factor (`SLIP_LAY ≈ 0.2`). The
clump may smear with the drag: sample its fine octave in a frame stretched
along the direction of travel, held as a mutable pair on the field the walk
sets per touch (first-touch-wins keeps repaints identical; `sheet` stays
page-anchored so crossings still agree about the paper).

**Texture that must stay visible where the face barely reaches cannot come
through the threshold at all.** The chalk's halo laid as a second low-force
scrub read cover 0.000: the threshold makes it sparse, but contact × force
collapse together, so it was sparse AND invisible where the references show
sparse and bright. A crumb that fell off the stick never went through the
face's contact — give it its own page-hashed sprinkle (`sprinkle` in
`chalkField.ts`): a low `chance` per lattice cell decides WHETHER (the
sparseness), a separate `amount` decides how much (the visibility). The two
tune independently, which is the whole point.
