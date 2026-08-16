# Agent guidance for paint

This file is the canonical source of truth for AI coding agents working in this
repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`, and
`.github/copilot-instructions.md` are symlinks to this file.

## OSS Spec conformance

This repository adheres to [`OSS_SPEC.md`](OSS_SPEC.md), a prescriptive
specification for open source project layout, documentation, automation, and
governance. A copy of the spec lives at the repository root so contributors and
AI agents can consult it without leaving the repo.

Run `oss-spec validate .` (or the standalone
[`validate.sh`](https://github.com/niclaslindstedt/oss-spec/blob/main/scripts/validate.sh))
to verify conformance. When in doubt about a layout, naming, or workflow
decision, consult the relevant section of `OSS_SPEC.md`.

## Build and test commands

```sh
make install       # npm install (needs GitHub Packages auth — see below)
make build         # production build (vite build)
make test          # full test suite (vitest)
make lint          # eslint + tsc --noEmit
make fmt           # prettier --write
make fmt-check     # verify formatting (CI)
make icons         # regenerate the PWA icons + og image from the app mark
make check-seo     # build, then assert the §11.3 SEO/PWA shape of dist/
```

The `@niclaslindstedt/oss-framework` dependency comes from the **GitHub
Packages** npm registry (see `.npmrc`). GitHub Packages requires auth even for
public packages, so local installs need a `read:packages` token in `~/.npmrc`
(`//npm.pkg.github.com/:_authToken=<token>`); CI authenticates with the
workflow's `GITHUB_TOKEN` and `packages: read`.

## Commit and PR conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.
- Branch names: `<type>/<short-slug>` (e.g. `feat/text-tool`).

## Architecture summary

This is a **frontend-only, local-first PWA** — there is no server. It is an
adoption of the [`oss-framework`](https://github.com/niclaslindstedt/oss-framework)
reference app (see its `demo/ADOPTION.md` seam manifest), rescoped from
checklists to drawing, and a sibling of the `notes` and `contacts` apps.

The framework owns the UI kit and the generic mechanics: the `Sidebar` shell,
modals, theme engine, namespaces, storage adapters (localStorage / folder /
Dropbox / Google Drive), the AES-GCM encryption wrapper, the i18n runtime,
logging, and the PWA update state machine.

### The renderer is Preact

`preact` is the only renderer dependency — **never add `react` or `react-dom`
back.** `@preact/preset-vite` compiles JSX against `preact/jsx-runtime` and
aliases `react` / `react-dom` (and their `/jsx-runtime` + `/client` subpaths)
onto `preact/compat`; `tsconfig.json` `paths` and `package.json` `overrides`
mirror that for `tsc` and npm, so the framework — which is built against React —
resolves to Preact too. App code keeps importing hooks and types from `"react"`,
which is the supported compat path; only `src/main.tsx` uses Preact's own
`render`.

### The domain: a vector drawing

The app owns the domain and the stores ("store stays in the app"):

- `src/app/types.ts` — the `Stroke` / `Drawing` / `AppData` model. A drawing is
  an ordered list of **vector strokes**, never a bitmap: that is what makes undo
  exact, the document small enough for localStorage, and a synced copy readable
  JSON. Rasterising happens only on screen and in the PNG export.
- `src/app/usePaintStore.ts` — the per-namespace document store
  (localStorage-persisted JSON, undo/redo, every edit action).
- `src/app/useSyncEngine.ts` — the sync engine over the framework's storage
  adapters (debounced push, conflict/auth/throttle handling, optional
  `withEncryption` of the remote copy).
- `src/app/plugins/` — **the tool plugin seam** (see below).
- `src/app/render.ts` — paints a drawing onto a 2D context by dispatching each
  stroke to the plugin that drew it. The screen, the in-flight gesture, and the
  PNG export all go through it, so there is one painting path.
- `src/app/cache.ts` / `src/app/trail.ts` — what a _frame_ is allowed to skip:
  the committed marks kept as pixels, and the gesture in flight repainted only
  where it has just grown. Both are pure optimisations over `render.ts` and
  both fall back to painting the document when they cannot be sure.
- `src/app/press.ts` — what a press with a tool leaves behind, built by driving
  the plugin contract (`start` / `move` / `end`) rather than by knowing any tool.
  It is what the size button and the size panel preview, painted through
  `render.ts` like anything else.
- `src/app/PaintCanvas.tsx`, `CanvasScreen.tsx`, `Toolbar.tsx`,
  `SideMenuContent.tsx`, `SettingsModal.tsx` + `settings/` — the screens.
- `src/output.ts` — the §19.4 central output module (semantic log helpers over
  the in-app log store).
- `pwa-plugin.ts` — emits the service worker + version/precache manifests the
  framework's `usePwaUpdate` consumes.

Dependency direction: screens → stores → framework. Nothing imports from the
framework's internals — only its published subpaths.

### Tools are plugins — keep it that way

Every tool, the pencil included, is registered through `registerPlugin` and
resolved through the registry. **No screen, store, or renderer may branch on a
tool id.** If you find yourself writing `if (tool === "eraser")` outside
`plugins/`, the behaviour belongs on the plugin descriptor instead (that is what
`usesBackground` and `supportsFill` are).

Adding a tool is three steps and touches nothing else: write a `ToolBehaviour`,
register it in `plugins/builtin/index.ts`, add its two catalog strings. `core:
true` puts it in the toolbar always; anything else is opt-in from Settings →
Tools. See [`docs/features/plugins.md`](docs/features/plugins.md).

Externally-loaded plugins are **not** implemented yet; when they land they must
register through this same interface rather than a parallel one.

### Reach for the framework first

Before building any UI primitive, gesture, or generic mechanic, **check whether
`@niclaslindstedt/oss-framework` already ships it.** Its published surface is
broad: components (`Button`, `ToggleRow`, `SegmentedControl`, `SelectPicker`,
`Section`, `Modal`, `ConfirmDialog`, `FloatingPanel`, the icon set, …), hooks,
plus the storage, encryption, glyphs, namespaces, i18n, and PWA subpaths.
Inspect `node_modules/@niclaslindstedt/oss-framework/dist/**` (the `.d.ts` files
list every export) and prefer an existing primitive over a hand-rolled one.

### Keep boot small

There is no server and no prerender, so everything on the entry path is
downloaded before the user sees anything. Before adding a static import to
`App.tsx`, ask whether the first paint needs it — the settings dialog, the
changelog payload, and the cloud-setup prompt are all behind `import()` already.

## Where new code goes

| Change type | Goes in                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| New tool    | `src/app/plugins/builtin/` + one `registerPlugin` call + two catalog strings |
| New feature | `src/app/...`                                                                |
| Tests       | `tests/...`                                                                  |
| Docs update | `docs/...`                                                                   |
| Examples    | `examples/...`                                                               |
| LLM prompt  | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`)        |

## Test conventions

- **All tests live in separate files** in `tests/` — never inline in source
  files.
- Test files are named with a `_test` suffix (e.g. `plugins_test.ts`), per §20.2
  of `OSS_SPEC.md`; vitest picks up `tests/**/*_test.ts`.
- Tests cover the pure domain modules (the plugin registry and tool behaviours,
  stroke geometry, migrations, the sync gate, export naming) and run in a node
  environment — no DOM. A tool behaviour is pure by construction (`start` /
  `move` / `end` take a draft and return one), so a whole gesture can be driven
  in a test without a canvas.
- Run them with `make test`.

## Source file size

- Non-test source files must stay under **1000 physical lines** (§20.5 of
  `OSS_SPEC.md`). Prefer splitting by concern over relaxing the cap.
- A file may opt out with `oss-spec:allow-large-file: <reason>` in its first 20
  lines; the reason must be real.

## Documentation sync points

| When you change…                     | Update…                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| the stroke / drawing model           | `docs/architecture.md`, `tests/migrations_test.ts`, a migration step in `src/app/migrations.ts`           |
| the tool set or the plugin interface | `docs/features/plugins.md`, `docs/architecture.md`, `tests/plugins_test.ts`, `README.md`                  |
| sync backends / encryption           | `docs/features/cloud-sync.md`, `docs/configuration.md`                                                    |
| the settings surface                 | `docs/getting-started.md`                                                                                 |
| user-visible features                | a `.changes/unreleased/` changeset fragment + `docs/features/*.md` (the in-app "What's new" renders both) |

## Changelog and feature docs

Every user-visible change needs a **changeset fragment** at
`.changes/unreleased/<unix-ts>-<slug>.md`:

```
---
type: Added         # Added | Changed | Fixed | Removed | Security | Deprecated
title: Short title  # optional — a noun phrase bolded at the head of the bullet
doc: plugins        # optional — the slug of a docs/features/<slug>.md feature doc
---

One sentence users will read in the changelog.
```

CI's `changeset` check fails a PR that ships user-visible behaviour without one,
and the Release workflow collates the fragments into the dated `CHANGELOG.md`
sections (those released sections are **generated — never hand-edit them**).
Fragment parsing lives in `scripts/release/fragments.mjs`.

**Keep the bullet to one sentence.** A feature doc is the read-more half of a
changelog bullet — a `# Title` and a few plain second-person paragraphs about
**one** feature. Reach for one sparingly (big features only), create or update
`docs/features/<slug>.md` in the same PR as the fragment that links it, and put
the fuller reference under `docs/` proper rather than in `docs/features/`.

## Parity / cross-cutting rules

- `src/app/i18n/en.ts` is the catalog's type source; `sv.ts` must satisfy it —
  adding a string means adding it to **both**.
- The service-worker contract (cache id, `sw.js`, `version.json`,
  `precache-manifest.json`) is shared between `src/app/pwa.ts` and
  `pwa-plugin.ts`; change them together.
- `public/icons/*`, `public/og.png`, and `public/favicon.ico` are generated —
  edit `scripts/generate-icons.mjs` (and the hand-written `public/icons/icon.svg`
  to match) and rerun `make icons`.
- A stroke's `tool` field is a plugin id and is **persisted**. Renaming a plugin
  id orphans every stroke drawn with it — don't, or ship a migration step.

## Website staleness

The app **is** the website (§11.2 / §11.5): `pages.yml` builds it with the Pages
base path and deploys `dist/` to the three release channels (`/`, `/preview/`,
`/branch/`). There is no separate marketing site to drift, but the `<head>` copy
in `index.html` (title, description, Open Graph, JSON-LD) and `public/llms.txt`
describe the product and **do** drift — refresh them whenever the feature set
changes, and re-run `make check-seo` after.

## Maintenance skills

Per §21 of `OSS_SPEC.md`, this repo ships agent skills for keeping drift-prone
artifacts in sync with their sources of truth. Skills live under
`.agent/skills/<name>/` and are also accessible via the `.claude/skills`
symlink.

| Skill           | When to run                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `maintenance`   | When several artifacts have likely drifted at once — umbrella skill that runs every `update-*` in order. |
| `update-docs`   | After any change to user-visible behaviour, the tool set, configuration keys, or the sync backends.      |
| `update-readme` | After any change that alters user-visible behaviour, commands, or install instructions.                  |

Each sync skill has a `SKILL.md` (the playbook) and a `.last-updated` file (the
baseline commit hash). The `maintenance` skill owns a **Registry** table listing
every `update-*` skill — add a row whenever you create a new sync skill.

## Craft skills

Not every skill keeps something in sync. `.agent/skills/` also holds playbooks
for work that is easy to do badly, and those carry no `.last-updated` and no
registry row.

| Skill              | When to run                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `glyph-design`     | Whenever you draw or correct a tool glyph in `src/app/icons.tsx` — with a design sheet to match or without one.       |
| `skill-reflection` | At BOTH ends of any session that loads a skill — read its lessons first, reflect them back into it before committing. |

**Do not edit a glyph by eye.** One that reads fine in the editor ships at 18
pixels beside twenty others, and "a bit heavy" is a number you can have in
seconds. The skill's scripts render the set, measure stroke weight and ink
density against the design — or against the set's own median when there is no
design — and overlay the two. They need nothing installed.

### A session that loads a skill owes it a reflection

Skills only get better if sessions make them better, so **`skill-reflection`
runs twice in any session that loads another skill**, and it is the only skill
allowed to rewrite another's `SKILL.md`:

- **At the START**, right after loading a skill — read its accumulated lessons,
  narrowed to what the task touches:
  `node scripts/skill-lessons.mjs <skill> --list`, then `--scope=<path>` /
  `--concepts=<tags>`.
- **At the END, before the commit** — record what the pass learned as a fragment
  under `.agent/skills/<skill>/.lessons/` (never by appending to a `SKILL.md`,
  which conflicts across parallel sessions), fix anything the skill said that
  turned out WRONG, delete what went stale, merge what now says the same thing
  twice, and promote anything true in 100% of that skill's runs into the
  `SKILL.md` itself.

The skill owns the rest: the fragment format (`title`, `date`, and the optional
`scope`/`concepts` that make the filters work), the **size bars** the tool
flags — a fragment over 350 words, a skill over 15 fragments or 4000 words of
them, a `SKILL.md` over 5000 — the consolidation sweep they call for, and the
standing question of whether a rule sitting in **this** file belongs in a skill
instead.

## Communication

Bugs and feature requests go to
[GitHub Issues](https://github.com/niclaslindstedt/paint/issues); open-ended
questions go to
[Discussions](https://github.com/niclaslindstedt/paint/discussions). Security
reports follow [`SECURITY.md`](SECURITY.md) — never a public issue.
