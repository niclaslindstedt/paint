---
title: The two ends of a stroke are different marks, and a per-hair on/off gate models neither
date: 2026-08-18
scope: src/app/plugins/bristleSim.ts
concepts: [ends, reference-research, grows, gating]
---

Reference photographs of one real brush stroke overturned the model twice in
one session, and neither correction was guessable from the code:

- **A touch-down is not a stamp.** A head swept onto paper takes it with part
  of the bundle and opens to the ferrule over the first stretch. Stamping the
  full footprint puts a disc the diameter of the brush at the head of a mark
  it is wider than. A head _placed_ on the spot has already landed, though —
  so gate the entry on the hand's speed at the touch-down (`ENTRY_SWEEP`),
  which makes a tap and a flick one continuous behaviour instead of two cases
  with a seam between them.
- **A lift is not a touch-down backwards.** Every hair is bent back along the
  stroke by then, so the pressure comes off over a window (~0.45 of a head)
  and the mark frays into a fan of trailing tips rather than closing.

What does NOT model either end is the obvious thing — switching each hair off
until the drag has run its own landing distance. Every hair in a head arriving
within a tenth of a head-width is a _line_, so it prints a bright seam across
the mark a few pixels in; it cuts a notch of bare paper between the blot and
the body; and on a stroke shorter than the window it is the whole mark, so a
press that moved two pixels renders as nothing at all. Put the raggedness on
the _rim of the print_ (a per-hair reach, thinning over the last of it)
instead, and leave the body ungated.

Direction of travel is legible in a photograph of a stroke: the end laid first
is the deepest colour, because the dip is spent from there on. Check that
before modelling the ends, or you will build them backwards.
