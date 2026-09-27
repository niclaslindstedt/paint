---
title: A lane-based medium's live walk holds OPAQUE unions per weight, alpha'd only at the blit
date: 2026-08-17
scope: src/app/plugins/rubber.ts
concepts: [grows, provisional-tail, incremental, erase-mask, lanes]
---

The rubber's live walk (`paintLiveRubbing`) is the quill's settle-frontier
pattern for a medium built of stroked LANES instead of field cells, and the
trap is canvas stroke semantics: ONE `stroke()` call paints the union of its
lanes once, but lanes split across separate calls ACCUMULATE alpha where they
overlap — and consecutive presses overlap heavily. So an incremental mask that
strokes each press's lanes at their final alpha as they settle comes out
darker than the one-shot walk everywhere.

The fix: hold one surface per weight level, stroke lanes into it OPAQUE
(idempotent under source-over, so laying across many frames still unions), and
apply each level's alpha only when blitting the three surfaces through the
caller's compositing. Sequential alpha'd blits compose exactly like the
one-shot's sequential per-level strokes, under `destination-out` (the hole)
and `source-over` (the relay's mask) alike.

Two supporting facts: the erase coat and the relay mask are the SAME picture,
so one held walk serves both asks per frame; and the settle formula
`min(p.at, span - p.at) / ramp` is already end-independent once
`span - p.at > ramp`, so the frontier rule is just "hold back `ramp` of arc
plus the speed-smoothing window" — no formula fork between settled and tail.

Verify as a lane-endpoint multiset: drive the live path prefix by prefix,
collect level-surface runs plus the last frame's tail runs, and require
exact equality with one full drag's runs (see `tests/rubber_test.ts`). Wrong
frontiers, double-lays and wrong weights all move endpoints (weight feeds the
flake-drag length), so the multiset catches them all.
