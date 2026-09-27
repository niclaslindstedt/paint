---
title: The load dial is the STARTING RESERVE; scaling capacity by it too makes run-out quadratic
date: 2026-08-17
scope: src/app/plugins/bristleSim.ts
concepts: [reservoir, dials, tuning]
---

The reservoir pattern has two numbers: `capacity` (how far one FULL dip runs,
a property of the implement and the sheet) and the walk's starting `reserve`
(the load dial). The bristle session multiplied capacity by the load AND
started the reserve at the load — run-out went as load², so a 0.32 dip that
should have covered ~285 px died at ~80, and the exercise sheet's "running
dry" row was a stub. The quill has it right: `travel` is fixed, `reserve`
starts at the dial. Spend per touch divides by capacity only.

Related: anything measured "off the charge" (the residue trail's length)
scales off `capacity × load`, not off capacity — a light dip trails briefly.
