---
title: Hash a medium's traits off the MARK as well as the strand, or every stroke is one brush
date: 2026-08-19
scope: src/app/plugins/
concepts: [randomness, seeding, grows, dried-mark-store, probe, ends]
---

Every engine here hashes its per-strand traits off the strand's index alone
(`hashedRandom(b * 11.7, 5)`, `walk.reset(b * 17 + 3)`). That is ONE brush, for
every stroke anyone ever draws: the same fringe at the touch-down, the same
rails down the body, the same fan at the lift, forever. It is invisible in a
single render and obvious the moment you lay the same gesture six times — worth
a row on any sheet for a medium made of many parts.

The fix is a per-mark seed threaded into the head/pen constructor and mixed
into every hash (`markSeed` in `bristleHead.ts`). Three constraints decide its
shape:

- **Off the FIRST POINT and nothing else.** A seed that reads the length or a
  later sample re-seeds the mark as the gesture grows, so the live mark and the
  landed one are different pictures and the lift jumps.
- **Hashed, not drawn.** The dried-mark store, the PNG export and the live walk
  each work the mark out separately; `Math.random()` would give three marks.
- **Pass it in, don't derive it inside.** The live walk opens its state before
  any point exists (`openDrag`), so the seed is an argument computed by the
  caller that does have the points.

Measuring it: probes that read ONE column (`brush-probe.ts`) cannot tell a
reseed from a real film loss — a column moved 0.97 → 0.83 while the mean over
the whole band was unchanged. Measure an area, over several seeds, before
believing a regression; the seeded engine should scatter (0.74–0.82 here) where
the old one printed one number to three decimals every time.
