---
title: Cap every texture gate short of certainty — the SHEET and the residue fade end the mark
date: 2026-08-17
scope: src/app/plugins
concepts: [dryness, comb, run-out, gating]
---

A per-hair (or per-cell) on/off threshold driven by dryness must be capped
well short of "everything off". The bristle comb first added `dryness × 1.15`
to its lift threshold, so the whole head left the paper around reserve ≈ 0.25
— long before the reservoir was spent — and the two most characterful phases
(scumble on the tooth, the fading residue trail) never rendered at all,
because no hair survived to lay them.

The division of labour that works, and matches the physics: the comb/texture
gate only _thins_ the mark (cap its dry term ≈ 0.6); the field's
starving-reach function (`taking`/`catching`) is what breaks the mark up into
the sheet's grain; and the residue fade is the only thing that actually ends
it. Same shape as the quill: `inkFlow` floors at 0.15 and the paper does the
killing. If a phase you built is invisible on the exercise sheet, check which
gate upstream is reaching certainty first.

Also from this session: a dryness curve like `1 - smoothstep(0.02, 0.4, r)`
starts starving the mark at HALF load; the visible give-out belongs in the
last fifth of the reserve (`smoothstep(0, ~0.2, r)`), because a real head
plateaus and then gives out.
