---
name: update-docs
description: "Use when files under docs/ may be stale. Discovers commits since the last docs update, maps changed source files to affected conceptual documentation, and brings docs/*.md back into sync."
---

# Updating the Docs

**Governing spec sections:** §11.1 (`docs/` directory — the required conceptual docs tree), §21.5 (this skill is mandated because `docs/` is a drift-prone artifact in every project).

The `docs/` directory contains conceptual documentation for paint. Unlike the README (overview) or man pages (command reference), `docs/` explains _why_ and _how_ in depth. It goes stale whenever a user-visible behavior, configuration key, or supported surface changes without a matching edit.

## Tracking mechanism

`.agent/skills/update-docs/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the repository's initial commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-docs/.last-updated)
   ```

2. List commits since the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD
   ```

3. List changed files:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

4. Categorize using the mapping table below.

## Mapping table

| Changed files / scope                                      | Doc(s) to update                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/app/plugins/**` (the tool set or the plugin contract) | `docs/features/plugins.md`, `docs/architecture.md`, `docs/getting-started.md` |
| `src/app/canvas.ts` (the canvas theme / ink resolution)    | `docs/features/canvas-theme.md`, `docs/getting-started.md`                    |
| `src/app/useSyncEngine.ts`, `src/app/cloudSetup.ts`        | `docs/features/cloud-sync.md`, `docs/architecture.md`                         |
| `src/app/settings/**`, `src/app/SettingsModal.tsx`         | `docs/getting-started.md`                                                     |
| `src/app/types.ts`, `src/app/migrations.ts`                | `docs/architecture.md`                                                        |
| `src/app/export.ts`                                        | `docs/features/export.md`                                                     |
| `pwa-plugin.ts`, `src/app/pwa.ts`                          | `docs/features/pwa.md`, `docs/architecture.md`                                |
| Build-time env vars (`VITE_*`)                             | `docs/configuration.md`                                                       |
| Error messages surfaced to users                           | `docs/troubleshooting.md`                                                     |
| The product's feature set                                  | `index.html` `<head>` copy + `public/llms.txt` (the app is the website)       |

Extend this table every time you find a new source file that feeds the docs.

## Update checklist

- [ ] Read baseline from `.last-updated` and run `git log` / `git diff --name-only`
- [ ] Read every affected `docs/*.md` file
- [ ] Walk the mapping table and update each doc in place
- [ ] Verify cross-links between docs still resolve
- [ ] Verify every shell example is still syntactically valid
- [ ] Run `make test` and the project's conformance check
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-docs/.last-updated

## Verification

1. Re-read every edited doc section against the current source of truth.
2. Click every internal cross-link and confirm the target still exists.
3. Confirm `.last-updated` was rewritten.

## Skill self-improvement

1. **Grow the mapping table** with any new source → doc relationship you discovered.
2. **Record recurring patterns** you had to invent.
3. **Commit the skill edit** alongside the docs change so the knowledge compounds.
