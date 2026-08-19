---
title: The two ends of a stroke are different marks, and each one's shape is the hand's speed AT it
date: 2026-08-18
scope: src/app/plugins/bristleSim.ts
concepts: [ends, reference-research, grows, gating, speed, tuning]
---

Reference photographs of one real brush stroke overturned the model twice, and
neither correction was guessable from the code:

- **A touch-down is not a stamp.** A head swept onto paper takes it with part
  of the bundle and opens to the ferrule over the first stretch. A head
  _placed_ has already landed — so gate the entry on the hand's speed at the
  touch-down (`ENTRY_SWEEP`), making a tap and a flick one behaviour.
- **A lift is not a touch-down backwards.** Every hair is bent back by then, so
  the pressure comes off over a window and the mark frays into trailing tips.

What models NEITHER end is switching each hair off until the drag has run its
landing distance: every hair arriving within a tenth of a head-width is a
_line_, so it prints a seam and notches bare paper between blot and body. Put
the raggedness on the **rim of the print** instead, body ungated.

Each end also has a **speed of its own**, and that is what stops every stroke
ending alike: a hand that stopped leaves a short, blunt, full end; one still
travelling strings the tips out long, narrow and pale (`liftFlick`). Two traps
in wiring it up:

- The fan's length is **coupled to the pressure taper** — `capAt` scales its
  reach by `down`, which the same flick pushes toward 0.3 — so a speed term
  needs its own `stretch` on the reach or the two cancel. Check the product
  across the WHOLE range, not at its ends: it peaked mid-range, not at 1.
- A blob at the head of a mark is usually the entry ramp's SHAPE, not its
  print: `sqrt` opens fast then crawls, which reads as a disc with a stroke
  coming out of it. Nearer-linear, plus a lateral lean decaying over the entry,
  and it widens into the mark instead.

Direction of travel is legible in a photograph — the end laid first is deepest.
Check it before modelling the ends, or you will build them backwards.
