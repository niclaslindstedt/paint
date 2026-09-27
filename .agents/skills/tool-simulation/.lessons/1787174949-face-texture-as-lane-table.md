---
title: Across-face structure is a per-touch LANE TABLE indexed in the cell loop, and a stamp's lanes must be softened
date: 2026-08-19
scope: src/app/plugins/chalkField.ts, src/app/plugins/chalkSim.ts
concepts: [streaks, lanes, texture, performance, ends]
---

A worn stick's streaks run along the mark, so they are structure ACROSS the
face — but a noise call per cell inside `scrub`'s inner loop is the one cost
that loop cannot carry. The shape that works: the sim computes a small
`Float32Array` of per-lane gains once per touch (`faceGrain` — streak noise
drifting with arc distance, plus the hand's lean as a parabola across the
face), and the field's cell loop only projects the cell onto the face's normal
and indexes the table. Twenty noise calls per touch instead of two per cell.

Two traps found tuning it: (1) a TAP's lanes never drift — the stick is not
travelling — so at drag contrast they print as ruled woodgrain across the whole
patch; blend the stamp's gains most of the way toward 1. (2) The lane pattern
must mix in the mark's seed (hashed off the first point), or every stroke is
one stick — the one-brush-per-stroke lesson, met here in lane form.
