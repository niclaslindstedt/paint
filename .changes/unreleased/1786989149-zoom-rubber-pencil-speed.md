---
type: Changed
title: Zooming, rubbing and pencil pages at frame rate
---

Pinch and wheel zooming, working the rubber, and panning pages full of pencil
marks are an order of magnitude faster: a zoom in flight carries the last frame
instead of re-simulating every mark, landed pencil marks dry once and are
blitted after, and the rubber lays each press once instead of re-walking the
whole gesture on every pointer sample.
