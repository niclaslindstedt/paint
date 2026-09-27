---
title: The relay's held ink must strip `live` — it paints LANDED marks, and live routes past the stores
date: 2026-08-17
scope: src/app/relay.ts
concepts: [dried-mark-store, erase-mask, live]
---

While a rubbing out is under the hand, `frame.ts` passes `live: true` in the
render options, and those options ride into `relayFixed` → `heldInkFor`,
which paints the COMMITTED marks the rub is cut from. Left alone, that flag
routes every landed wash/quill/lead mark through the painters' live paths —
past the dried-mark stores, and for the field engines into gesture-shaped
code that expects a growing points array. Strip it (`live: undefined`) at the
held-ink render. General rule: `PaintDetail.live` describes ONE stroke — the
draft — never a batch of options; any pass that repaints committed marks
under gesture-scoped options must drop it explicitly.
