---
title: A per-stroke input that changes the mark's WIDTH belongs in the head's footprint, and owes the reservoir and the fallback a matching correction
date: 2026-08-19
scope: src/app/plugins/bristleHead.ts, src/app/plugins/bristleSim.ts
concepts: [dials, head-shape, reservoir, fallback, bounds, tuning]
---

The brush's pressure dial spreads the bundle out of its ferrule. The tempting
place for it is the walk — multiply the band half-width per touch — and that is
wrong twice over: the walk's other reaches (`movingTail`, the live walk's
`reachBy`/`capReach`, the press-vs-drag threshold `printReach`, the end caps'
`spanOf` window) all measure against `pen.half`, so a widening applied past it
leaves every one of them sized for a head that is no longer there, and the
`grows` settle frontier starts settling touches the next frame still moves.

Fold it into `pen.half` in the head constructor instead — one multiplication —
and every reach, cap and threshold follows for free. The one thing that cannot
follow is the **box the field is opened in**, which is computed before there is
a head: export the scale (`splayOf`) and funnel every copy of the pad through
one helper (`reachOf` in `bristleSim.ts` — there were four).

Two couplings a width axis always owes:

- **Film per unit of paper must not change.** `film *= sqrt(pen.half / w)` is
  what keeps a partly-down head laying a thicker film; measure it against the
  head **as widened** or the dial silently pales the mark, when the reference
  says pressing releases _more_ paint. The extra paint is spent through
  `capacity`, divided by the widening — a wider band empties the same dip
  sooner.
- **The vector fallback derives its charge from the width it is handed**
  (`capacityOf(size)`), so handing it the widened size makes a pressed stroke
  run _further_ before drying — the opposite of the field. Hand it
  `load / splay` to keep the two ending the mark in the same place across a
  zoom threshold.

Prove the rest with a film checksum per head configuration at the dial's rest:
six configurations came back bit-identical, which is the only cheap evidence
that a new axis changed nothing for everyone who never opened the panel.
