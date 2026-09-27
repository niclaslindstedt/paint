---
title: Print the sheet's dip percentiles before tuning threshold constants — and let the texture's pitch set the cell
date: 2026-08-19
scope: src/app/plugins/
concepts: [tuning, threshold, probe, pressure, cell-pitch, budgets]
---

A sheet-threshold medium catches a cell iff `dip < press·dig·(gates)`. Guessing
dig/bite amplitudes against renders is slow and misleading; ten lines sampling
`sheetDip` over a patch and printing p05/p25/p50/p75/p95 per ground (solid
0.10/0.23/0.36, cold 0.22/0.37/0.52, rough 0.27/0.44/0.60) turns every
threshold constant into arithmetic: place the light hand's reach at ~p20, the
ordinary bite at ~p75+, the leaned-on hand past p95.

Two traps the table exposed immediately. A pressure-sharpening exponent
(`force**1.35`, by analogy with the speed-curve lesson) took the dial's own
MINIMUM below p05 — a preset that ships at that minimum drew nothing. Check the
dial's ends against the percentiles, not just the default. And the exponent
belongs per-touch in the walk, never per-cell in the field's inner loop.

Separate but same session: the pencil resolves its field at device pitch
because its speckle is per-pixel, but a medium whose visible texture is ~10 px
clumps can floor the cell at `half / FINEST_FACE` (wax: 52) — the broadest
faces cost half as much and the clumps come out identical. The floor joins the
store's cell key automatically since the cell is already in the Ask.
