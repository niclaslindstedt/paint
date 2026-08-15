---
title: A flagged scope is usually a MIS-SCOPED lesson, not a stale one — resolve the path before you delete
date: 2026-08-15
scope: scripts/skill-lessons.mjs
concepts: [scope, staleness, verification]
---

`--check` warns when a lesson's `scope` names a path that no longer exists, and
the obvious reading is "this lesson has rotted". In the sibling `game` repo's
first backfill, every such warning was the opposite: the lesson was fine and the
SCOPE was wrong — a path the author remembered rather than looked up.

That failure is easy to repeat here, where near-miss paths abound:
`src/app/plugins/` vs `src/app/plugins/builtin/`, `src/app/icons.tsx` vs a
`src/icons/` that has never existed, `docs/features/plugins.md` vs `docs/`.

So the order is: resolve the real path FIRST (`ls`, or grep the skill's own
`SKILL.md` for the command), and only conclude staleness when the thing the
lesson is about is genuinely gone. Deleting on the warning alone throws away
good lessons. When writing or re-scoping in bulk, run `--check` immediately
after — it is the only thing that catches a plausible-looking path that was
never real.
