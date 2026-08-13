# Contributing

Thanks for taking a look. Issues and pull requests are both welcome.

## Prerequisites

- [Node.js](https://nodejs.org/) 24+ (see `.nvmrc`) and npm 10+
- A GitHub personal access token with the `read:packages` scope, since
  `@niclaslindstedt/oss-framework` is published to GitHub Packages

## Getting set up

```bash
git clone https://github.com/niclaslindstedt/paint.git
cd paint
# add `//npm.pkg.github.com/:_authToken=<token>` to your ~/.npmrc first
make install
npm run dev
```

## The canonical commands

CI runs exactly these, so run them before you push:

```bash
make fmt-check   # prettier --check
make lint        # eslint + tsc --noEmit
make test        # vitest
make build       # vite build
```

## Workflow

1. Fork the repository (or branch, if you have push access).
2. Branch off `main` as `<type>/<short-slug>` — e.g. `feat/text-tool`,
   `fix/eraser-size`.
3. Make the change, with tests and docs (see below).
4. Open a pull request against `main`.

### Commits

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tools): add a text tool
fix(sync): keep the baseline read from racing the first push
docs: explain the canvas theme
```

Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.

PRs are **squash-merged**, so the **pull request title** becomes the single
commit on `main` and must follow the same format.

### Testing expectations

- Tests live in `tests/`, never inline in source files, and are named with a
  `_test` suffix (`plugins_test.ts`) per §20.2 of `OSS_SPEC.md`.
- New domain logic — a tool behaviour, a migration step, a pure helper — comes
  with tests. Tool behaviours are pure by construction, so a whole gesture can
  be driven without a browser.
- UI-only changes don't need a test, but do need to have been run in a browser.

### Documentation expectations

- Any user-visible change needs a **changeset fragment** in
  `.changes/unreleased/` — CI fails the PR without one (or the `no-changelog`
  label for a pure refactor). The format is documented in
  [`AGENTS.md`](AGENTS.md#changelog-and-feature-docs).
- A headline feature also gets a `docs/features/<slug>.md` doc, which the in-app
  "What's new" dialog renders behind a **Learn more** link.
- Behaviour, commands, or install steps changing means `README.md` and the
  relevant `docs/` page change in the same PR.
- `CHANGELOG.md`'s released sections are **generated** by the release workflow —
  never hand-edit them.

## Review

A maintainer reviews every PR. Expect a first response within a few days. CI
must be green and the changeset check satisfied before merge; review focuses on
whether the change fits the architecture in [`AGENTS.md`](AGENTS.md) — in
particular that a new tool goes through the plugin registry rather than
special-casing itself into the canvas.

## Governance

This is a personal open-source project maintained by
[@niclaslindstedt](https://github.com/niclaslindstedt), who is the only person
who can merge to `main` and cut releases. Decisions are made in the open in
issues and pull requests; where there's disagreement the maintainer decides, and
explains why in the thread. Contributors who land several substantial changes may
be invited to become maintainers. Should the project be abandoned, the license
permits anyone to fork it and continue — a note will be added to this README if
it is no longer maintained.

## Where to talk

- **Bugs and feature requests** — [Issues](https://github.com/niclaslindstedt/paint/issues)
- **Questions and ideas** — [Discussions](https://github.com/niclaslindstedt/paint/discussions)
- **Security problems** — privately, per [`SECURITY.md`](SECURITY.md)

By participating you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).
