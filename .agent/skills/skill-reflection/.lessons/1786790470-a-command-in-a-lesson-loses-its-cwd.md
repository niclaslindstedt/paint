---
title: A command copied into a lesson body loses the shell setup the SKILL.md block gave it
date: 2026-08-15
scope: .agent/skills
concepts: [lesson-writing, commands, cwd]
---

A `SKILL.md` can set up a command block once at the top of a section and let
every line after it lean on that setup — `glyph-design` opens its block with
`S=.agent/skills/glyph-design/scripts` and then writes `node $S/glyphs.mjs
render …` five times.

A fragment is read ALONE, out of any section, so a line lifted from such a block
arrives with `$S` unset and no working directory implied. Every command in a
lesson has to be runnable as written from the repo root — spell the path out
(`node .agent/skills/glyph-design/scripts/glyphs.mjs render`), or say where it
is run from. When recording a lesson, re-read its commands as a stranger would:
no surrounding context, no variables, no cwd.
