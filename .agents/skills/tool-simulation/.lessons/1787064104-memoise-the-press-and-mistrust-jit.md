---
title: Memoise the press, and never read a node harness's worst frame as a cost
date: 2026-08-18
scope: src/app/plugins/bristleSim.ts
concepts: [performance, incremental, provisional-tail, measurement]
---

A print (the head's whole footprint, laid as sections across it) is the most
expensive single mark one of these engines lays — for a #6 round it is a
hundred-odd sections of a hundred-odd samples each. The live walk lays the
press provisionally so it can be taken back the moment the gesture becomes a
drag, which means it was being re-laid on **every pointer sample** for as long
as the gesture was still a press: a stutter at the start of every stroke and
for as long as a finger rested on the glass.

A print is a function of the first touch alone — position, its smoothed speed,
and how much of the head landed. Hold those on the walk state (`printed`) and
compare before undoing anything: if nothing has changed, return an empty dirty
patch and leave both the film and the undo log alone. The frame costs nothing
and the mark is already right. The check has to come _before_ the undo pass,
or you have already paid for it.

**Measuring:** the "worst single advance" out of a node harness is JIT warm-up,
not cost. The first two calls into a fresh code path measured 22 ms and 13 ms
where the warm number was 2.1 ms — a 10× lie, and it sent this session hunting
a regression that did not exist. Time the same call a dozen times and read the
tail, and quote steady-state per-frame cost rather than the maximum.
