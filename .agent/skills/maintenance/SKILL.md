---
name: maintenance
description: "Use when you want to bring every drift-prone artifact in the paint repo back into sync. Dispatches to all individual update-* skills in the correct order, aggregates their results, and leaves a single combined PR ready to review."
---

# Maintenance

This is the umbrella skill for paint, mandated by §21.6 of `OSS_SPEC.md`. It does no rewriting itself — it decides which sync skills are stale, runs each one, and reports a combined summary. Use it when you do not know which specific artifact is out of date, or when several have likely drifted at once (for example, after a large merge).

## When to run

- After a big merge from the default branch when you are not sure which surfaces moved.
- On a cadence (weekly / before a release) as a "drift sweep".
- When CI flags a staleness check but it is unclear which skill to invoke.

Do **not** use this skill for a targeted fix — if you know exactly which artifact is stale, call the corresponding `update-*` skill directly.

## Registry

The registry is the single source of truth for which sync skills exist in this repo. Every `update-*` directory under `.agent/skills/` must appear here exactly once. Add a row whenever you create a new sync skill.

| Skill           | Fixes                                      | Spec sections | Run order |
| --------------- | ------------------------------------------ | ------------- | --------- |
| `update-docs`   | `docs/*.md` vs. the source of truth        | §11.1         | 1         |
| `update-readme` | `README.md` vs. the current public surface | §3            | 2         |

Run order matters: `update-docs` runs first because `README.md` links into `docs/`, so the README pass should read docs that are already current. A future `update-website` would run last — but note that in this project **the app is the website** (§11.2 / §11.5), so "the website" means the `<head>` copy in `index.html` and `public/llms.txt`, which `update-docs` covers.

## Tracking mechanism

Each skill directory carries a `.last-updated` file holding the git commit hash of its last successful run. This skill reads them all; it never writes them — each `update-*` skill writes its own after it finishes.

## Discovery process

For each skill in the registry, decide whether it needs to run:

1. Read the skill's baseline:

   ```sh
   BASELINE=$(cat .agent/skills/<skill>/.last-updated)
   ```

   An empty or missing file means "never run" — schedule it.

2. Diff the watched paths for that skill against the baseline:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

   If any file in that skill's mapping table appears in the diff, schedule the skill.

3. Build the list of skills to run, preserving the run order from the registry.

## Mapping table

Which changed paths imply which skill. This is the union of the individual skills' tables, kept here so the sweep can be decided in one pass.

| Changed source path                                 | Skill to run                   |
| --------------------------------------------------- | ------------------------------ |
| `src/app/plugins/**`                                | `update-docs`, `update-readme` |
| `src/app/useSyncEngine.ts`, `src/app/cloudSetup.ts` | `update-docs`                  |
| `src/app/useAppSettings.ts`, `src/app/canvas.ts`    | `update-docs`                  |
| `src/app/settings/**`, `src/app/SettingsModal.tsx`  | `update-docs`                  |
| `package.json` scripts, `Makefile`                  | `update-readme`                |
| `vite.config.ts`, `pwa-plugin.ts`, `index.html`     | `update-docs`                  |

## Execution

For each scheduled skill, in order:

1. Invoke the skill and follow its own playbook end to end.
2. Record what it changed (files touched, one-line summary).
3. Do **not** commit between skills — let the changes accumulate so the sweep lands as one reviewable diff.

## Verification

- [ ] `make fmt-check`, `make lint`, and `make test` all pass after the sweep.
- [ ] `make check-seo` passes if any `<head>` copy or crawler file changed.
- [ ] Every skill that ran has written its new `.last-updated` baseline.
- [ ] The combined diff contains no unrelated edits — a maintenance sweep must be reviewable as documentation-only unless a skill explicitly says otherwise.
- [ ] Report which skills ran, which were skipped, and why.

## Skill self-improvement

If a sweep finds an artifact drifting that no registered skill owns, the fix is a new `update-*` skill plus a row here — not an ad-hoc edit. If a skill fired on a path that turned out to be irrelevant, tighten its row in the mapping table above so the next sweep is quieter.

The registry, run order, and mapping table are operating data — edit them in place as above. Narrative gotchas that are not registry rows go to lesson fragments instead: load the **`skill-reflection`** skill, which owns recording, scoping, pruning, merging and promoting them (`node scripts/skill-lessons.mjs maintenance --list`).
