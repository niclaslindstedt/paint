---
title: A skill that RESTATES a count or a roster rots; point at the module that answers it live
date: 2026-08-15
scope: .agent/skills
concepts: [staleness, skill-writing, verification, counts]
---

An audit of the sibling `game` repo's skills found that nearly every wrong
claim was a NUMBER or a LIST somebody had transcribed out of the tree. None had
drifted when written; all were wrong within a release or two, and nothing fails
when they go wrong.

This repo has the same traps: the tool roster lives in
`src/app/plugins/builtin/index.ts` (the `registerPlugin` calls), the string
catalog in `src/app/i18n/en.ts`, the sync backends in `src/app/useSyncEngine.ts`,
and the sync-skill roster in the `maintenance` skill's Registry table. A skill
that says "the five tools" or "the four storage adapters" is making a claim of
completeness it cannot keep.

So when a skill needs a count or a roster, name the ONE place that answers it
and quote the live figure as an illustration, not as the claim. A reader who has
the pointer can re-derive; a reader with only the number cannot tell it has gone
stale.
