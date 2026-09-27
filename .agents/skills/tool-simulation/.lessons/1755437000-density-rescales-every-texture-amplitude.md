---
title: Reusing the ink skeleton at another density re-scales EVERY texture amplitude
date: 2026-08-17
scope: src/app/plugins
concepts: [beer-lambert, density, texture, tuning, splatting]
---

The bristle session reused the quill's field skeleton with one number moved:
optical density 0.55 (ink) → 2.1 (body paint), so one pass reads opaque. Every
texture amplitude tuned under the old density broke under the new one, the
same way twice:

- The per-cell deposit-count noise (±~40%, the sampling-lattice cost SKILL.md
  already names) dries into fine mottle at 0.55 — and into hard tile seams at
  2.1, because the alpha curve is steep exactly where the noise sits. Fix was
  structural, not a retune: bilinearly splat each WET deposit over the four
  cells the sample straddles (a levelling film is smooth physics anyway), and
  keep single-cell deposits only when starving, where the grit IS the look.
  Body-film sd fell from 0.43 to 0.18 on mean 0.85.
- The sheet-settle range (×0.3–1.7 for ink) printed cold-press stock as a
  brick wall. Body paint wants ×0.55–1.45 — the weave should show through a
  slab, never tile it.

The general rule: density decides how much film-variance the eye sees, so a
"same physics, thicker medium" port must re-derive every noise amplitude and
clamp against a render, not inherit them. Probe first — `sd/mean` of film in
a solid passage is the number that says seams before you can see them.
