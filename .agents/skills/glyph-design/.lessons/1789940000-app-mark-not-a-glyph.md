---
title: The app mark is not part of the toolbar set — its loop is "render the real outputs and upscale the 16 px one", not `measure`
date: 2026-08-16
scope: scripts/generate-icons.mjs, public/icons/icon.svg
concepts: [glyph, small-sizes, tooling, measurement, app-mark]
---

`glyphs.mjs` measures line art against the set's own median, and both halves of
that are wrong for `public/icons/icon.svg`: the mark is a **solid silhouette**
(so `strokeR` describes only the round-join outline) and it is a **set of one**
(so there is no median to be an outlier from). Don't force the config onto it.

The equivalent loop is cheap and works: run `node scripts/generate-icons.mjs`,
then look at what actually shipped —

- `pwa-512.png` for whether the shape reads at all,
- the 16 px entry unpacked out of `public/favicon.ico` and nearest-neighbour
  upscaled, for whether it survives a tab strip.

The 512 is the one that catches shape errors, and it caught the real one here: a
nib that measured and looked fine at 192 px read as a **crayon** at 512 because
the taper was too shallow. Lengthening the nib and narrowing its base fixed it,
and nothing below 512 had shown the problem.

Two numbers that transfer to any future edit of this mark:

- **The round-joined outline eats `ROUND / 2` off every edge.** Seams between
  pieces are gaps in the raw geometry _minus 6_, so a 4-unit seam is written as 10. Two pieces 6 apart touch.
- **Recentre after any geometry change.** The mark is rotated 45° about the tile
  centre, and the two ends are not symmetric, so `NUDGE_X` / `NUDGE_Y` are a
  computed value, not a constant: take the rotated bounding box (corners padded
  by `ROUND / 2`) and nudge by `50 - centre`. The span should land in the low
  90s of 100 — that is what "corner to corner" measures as here.
