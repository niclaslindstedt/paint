---
title: A speed term is a DEVICE term — keep it small unless the medium deposits over time
date: 2026-08-18
scope: src/app/plugins/
concepts: [tuning, speed, hand-speed, deposit, abrasion]
---

`Trace.speed` is the gap between **stored pointer samples**, not a hand speed:
the same wrist reports twice the speed on a 60 Hz phone as on a 120 Hz tablet,
and `MIN_SAMPLE_DISTANCE` floors it. So the size of a speed term decides how
much the mark depends on the hardware that drew it.

Which size is right is a physics question with two answers:

- **Flow media (ink, wet paint)** meter out over _time_ — a fast pen line is
  genuinely thinner. A strong term is honest there.
- **Abrasive media (graphite, wax, charcoal)** come off by work done over
  _distance_. The walk already lays by distance (`trace` steps the path,
  `share` divides one pass between its dabs), so speed has almost nothing left
  to say. The pencil carried `hurry = max(0.5, 1/(1 + v/42))` for years and it
  made a briskly-drawn line a ghost: on rough stock, mean alpha 0.080 at one
  sample per 1.5 px against 0.008 at 20 px, and coverage 36% → 7%. It is now
  `0.86 + 0.14/(1 + v/30)` (`HURRY_KEEP`/`HURRY_SPEED` in `leadSim.ts`, matched
  in the `graphite.ts` fallback).

The reason it went unnoticed is worth keeping: a lead field's response to
`force` is a **threshold** (`proud = level - face`), so cutting force in half
does not halve the mark — it takes the mark below the sheet's crowns and costs
most of the coverage. Any multiplier into force is 3–10× at the pixels. Never
judge one by the width of its own range; probe both ends.
