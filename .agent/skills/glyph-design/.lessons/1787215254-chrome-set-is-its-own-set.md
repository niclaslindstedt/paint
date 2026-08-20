---
title: paint's icons.tsx holds TWO sets — the tool band at 1.3 and the chrome glyphs at 1.75 — and a new glyph is measured against its own
date: 2026-08-20
scope: src/app/icons.tsx
concepts: [glyph, measurement, ink-density, tooling]
---

`icons.tsx` exports two families with different weights: the toolbar's
implements spread `toolBase` (`strokeWidth` 1.3, measured against a design
sheet) and everything else — `ResizeIcon`, `FlipIcon`, `EyeIcon`, `LockIcon`,
`CanvasIcon`, `SaveIcon`, `SidePanelIcon`, the turn and mirror pairs — spreads
`base` (1.75). They are two sets, not one set with outliers.

So the harness config for a chrome glyph lists **chrome glyphs**. Measured
against them, `MergeIcon` came out `strokeR` 74.9 against a median of 72 and
sat inside the spread; measured against the tool band it would have looked ~25%
heavy and been thinned into something that no longer matched the row it
actually ships in. The chrome set's own numbers, for the next pass:

| column    | chrome set                 |
| --------- | -------------------------- |
| `strokeR` | median ~72, spread 68–92   |
| `fill`    | median ~39, spread 32–49   |
| `aspect`  | ~1.00, but the eye is 1.38 |

Two of those are worth knowing before drawing. `fill` runs higher here than in
the tool band because these glyphs are closed boxes rather than sticks — three
rounded rectangles land at 49, level with the floppy, and that is the ceiling
rather than a fault. And `MirrorH` measures `strokeR` 92 (+28%) and is flagged
on every run: it is a shipped glyph with a solid half, so ignore that row
rather than treating the flag as new.

There is no glyphs.config.json in the repo — write a throwaway one at the root,
point `glyphs` at the set you are joining, and delete it (and `.glyphwork/`)
before committing. Neither is gitignored.
