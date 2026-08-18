---
title: A body medium bridges its own comb — bare lanes between hairs read as separate ribbons
date: 2026-08-18
scope: src/app/plugins/bristleSim.ts
concepts: [comb, texture, bridge, tuning]
---

A lane-indexed comb whose "hair is off" value is 0 does not paint a textured
mark; it paints N parallel ribbons with paper between them. The user's words
for it were "it needs to be more stitched together than that". Three things
fix it, in descending order of effect:

1. **Bridge the gaps while the head is charged.** Paint is a liquid with a
   body: where a hair lifts off a loaded head the film either side runs
   together over the gap. A lifted lane gets `BRIDGE × hardness × (1 − dry)`
   of a hair's film rather than nothing, so the mark is one slab _scratched
   through_ — and the dry-brush end of the range keeps its open comb, which is
   where a mark is supposed to come apart into strands. 0.3 of a full hair
   reads as a clear pale streak that is still joined; 0.55 washes the texture
   out altogether.
2. **Level the comb a lane either side** ([0.25, 0.5, 0.25] in place, one
   pass). A film does not dry with vertical walls, and a razor-edged slot is
   the single most synthetic thing in a combed mark.
3. **Keep the dry runs short of the mark.** Per-hair skip runs of two to three
   head-widths mean every hair either draws or does not for the whole stroke —
   ribbons that never cross. Half to one and a half head-widths lets a parting
   open, run and close while the mark is still going.

Add a slow whole-bundle twist (a drift on arc distance, ±0.13 of the
half-width) so the lanes wander rather than ruling the mark end to end, and a
slow width pinch (`SWELL`) that only ever takes width _away_ — a swell that
adds makes the tool measure wider than the number on the size button.
