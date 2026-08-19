---
title: Loose dust past the face cannot come through the contact threshold — sparse-but-VISIBLE needs a hashed sprinkle
date: 2026-08-19
scope: src/app/plugins/chalkField.ts, src/app/plugins/chalkSim.ts
concepts: [dust, halo, threshold, texture, tuning]
---

The chalk's halo — stray specks just past the stroke's edge — was first laid as
a second low-force scrub, on the theory that a tiny press reaches only the
tooth's crowns. The threshold does make it sparse, but the same smallness makes
every deposit faint (contact × force both collapse), so the probe read cover
0.000: sparse AND invisible, when the reference photographs show sparse and
BRIGHT. A crumb that fell off the stick never went through the face's contact
at all, so it answers to no pressure threshold.

The mechanism that works is a page-hashed sprinkle (`sprinkle` in
`chalkField.ts`): a low `chance` per crumb-lattice cell decides WHETHER a speck
lands (that is the sparseness), a separate `amount` decides how much (that is
the visibility), biased to the sheet's crowns and faded hard (squared) across
the annulus so the halo hugs the edge. Hash the chooser off the page, never the
mark, so repaints, the store's copy and crossing strokes scatter the same
specks. Tune `chance` against a coverage window and `amount` against what a
single speck's alpha reads as — they are independent, which is the whole point.
