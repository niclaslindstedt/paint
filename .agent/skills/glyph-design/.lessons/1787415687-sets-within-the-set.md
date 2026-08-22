---
title: paint's icons.tsx holds three weight bands — the tool band at 1.3, the chrome glyphs at 1.75, and the dashed marquees inside the tool band — and a glyph is measured against its own
date: 2026-08-20
scope: src/app/icons.tsx
concepts: [glyph, measurement, ink-density, tooling, tool-families]
---

`icons.tsx` exports two families with different weights: the toolbar's
implements spread `toolBase` (`strokeWidth` 1.3) and everything else —
`ResizeIcon`, `FlipIcon`, `EyeIcon`, `LockIcon`, `SaveIcon`, the turn and
mirror pairs — spreads `base` (1.75). And **inside** the tool band the seven
selection marquees are a third band: a dashed outline is half air, so they
measure a quarter to a third under the implements they sit beside and are
meant to.

So the harness config lists the set the new glyph is joining, and nothing else:

| column    | tool band | chrome           | marquees          |
| --------- | --------- | ---------------- | ----------------- |
| `strokeR` | ~75       | ~72 (68–92)      | ~49, solids to 56 |
| `fill`    | ~27       | ~39 (32–49)      | ~14, solids to 22 |
| `aspect`  | ~1.00     | ~1.00 (eye 1.38) | ~0.98             |

Measured against the wrong one, `MergeIcon` would have read 25% heavy and been
thinned out of the row it ships in; the marquees are flagged as light on every
run against the tool band and none of it means anything.

Two known non-faults: chrome `fill` runs high because those glyphs are closed
boxes rather than sticks, and `MirrorH` measures `strokeR` 92 (+28%) because it
has a solid half.

Inside the marquee band a solid costs proportionally more than anywhere else,
because the outline it is added to is dashes. Filling the middle of the box
marquee 6.8 units square measured 62.1 (+26% on the family); 5.4 square landed
at 52.5 with the same reading at 18 px.
