# Architecture

Paint is a **frontend-only, local-first PWA**. There is no server, no API, and
no build-time data: the whole app is static files, and every byte of user data
lives in the browser (or in a storage backend the user connected themselves).

It is an adoption of the [`oss-framework`](https://github.com/niclaslindstedt/oss-framework)
reference app, rescoped from checklists to drawing, and a sibling of the `notes`
and `contacts` apps.

## The layers

```
index.html → src/main.tsx → src/App.tsx
                              ├── SideMenuContent      (drawings, namespaces)
                              ├── CanvasScreen         (header, page, toolbar)
                              │     ├── PaintCanvas    (the gesture in flight)
                              │     └── Toolbar        (enabled tools + ink)
                              └── SettingsModal        (lazy)

stores:   usePaintStore · useAppSettings · useNamespaces · useSyncEngine
domain:   types · render · plugins/* · migrations · canvas · export
platform: @niclaslindstedt/oss-framework (UI kit, storage, theme, i18n, PWA)
```

Dependency direction is one-way: screens → stores → framework. Nothing imports
framework internals, only its published subpaths.

## Why the document is vector

A drawing is an ordered list of **strokes**, each a shape plus its ink. It is
never a bitmap, and that single decision pays for most of the app:

- **Undo is exact and cheap.** One mark is one entry; undo is `pop()`, not a
  per-stroke image snapshot.
- **The document fits in localStorage.** A sketch is a few kilobytes of JSON
  where a 1600×1000 PNG is a few hundred.
- **Sync is diffable and readable.** The bytes pushed to Dropbox are the same
  JSON you can export, open in an editor, and reason about.
- **The page can be re-themed.** Because ink is data rather than baked pixels, a
  mark that never chose a colour can resolve one at paint time — which is what
  makes the light/dark canvas flip re-ink a whole sketch (see
  [`canvas.ts`](../src/app/canvas.ts)).

Rasterising happens twice, both times through the same renderer: onto the screen
canvas, and onto an off-screen canvas for the PNG export. There is no second
painting path to drift.

## The plugin seam

`src/app/plugins/` is the extension point, and the rule the rest of the app
lives by: **nothing outside it may branch on a tool id.**

- `types.ts` — the `PaintPlugin` descriptor and the `ToolBehaviour` contract
  (`start` / `move` / `end` / `paint`).
- `registry.ts` — registration order, the core/optional split, and resolution.
- `builtin/` — the shipped tools, built from two family factories (freehand and
  shape) plus their ink configuration.

`render.ts` dispatches each stroke to the plugin named in `stroke.tool`, falling
back to a generic painter when the plugin is unknown — a document from a newer
build still renders. Enabling and disabling a tool changes the _toolbar_, never
the document.

See [`docs/features/plugins.md`](features/plugins.md) for the user-facing half.

## Rendering runtime

The renderer is **Preact**, not React. `@preact/preset-vite` compiles JSX
against `preact/jsx-runtime` and aliases `react` / `react-dom` (and their
`/jsx-runtime` + `/client` subpaths) onto `preact/compat`; `tsconfig.json`
`paths` and `package.json` `overrides` mirror that for `tsc` and for npm, so the
framework — built against React — resolves to Preact too. App code keeps
importing hooks and types from `"react"`, which is the supported compat path;
only `src/main.tsx` uses Preact's own `render`.

Two differences bite in new code: use `e.currentTarget` rather than `e.target`
in event handlers, and spell string-valued SVG attributes like `focusable` as
`"false"` rather than a JSX boolean.

## State, and where it lives

| State                 | Owner             | Persisted as                         |
| --------------------- | ----------------- | ------------------------------------ |
| Drawings              | `usePaintStore`   | `paint:doc[:<ns>]` (JSON, versioned) |
| Undo / redo history   | `usePaintStore`   | in memory only                       |
| App settings          | `useAppSettings`  | `paint:settings`                     |
| Namespaces            | `useNamespaces`   | `paint:namespaces` + `:active`       |
| Theme appearance      | `App` + framework | the framework's own key              |
| Sync backend / tokens | `useSyncEngine`   | `paint:sync:*`                       |
| Language              | framework i18n    | `paint:language`                     |

The document carries a **version** only on the bytes at rest; the in-memory
model is version-free, and `migrations.ts` runs stored bytes forward on read.
The same bytes travel to a sync backend, so a document written by an older build
upgrades wherever it comes back from.

## Sync

`useSyncEngine` is the state machine the framework's `SyncStatus` glyph and
`SyncDetailsModal` paint over. The local copy is always the working copy; a
connected backend gets a debounced push of the serialized document, and can be
pulled back down explicitly.

The engine's shape is deliberately conservative:

- A **baseline read** on adopting a backend learns its revision before the first
  push, so a save can't clobber another device's newer copy with an unknown
  base.
- A **conflict** is surfaced, never resolved by overwriting.
- A **first connect** onto a backend that already holds different drawings
  raises the replace-or-adopt prompt rather than picking a side — unless this
  device holds nothing, where adopting is the only sensible answer.
- **Encryption** wraps the byte boundary (`withEncryption`), so what lands in
  the cloud is an AES-GCM envelope and the passphrase never leaves memory.

Unlike the sibling apps there are no binary side-cars: a paint document is one
JSON file per namespace, which is the entire sync surface.

## The PWA

`pwa-plugin.ts` emits, at build time, the four things the framework's
`usePwaUpdate` expects: a prompt-to-update service worker, `version.json`,
`precache-manifest.json`, and a per-channel web manifest. The worker precaches
the shell, parks in `waiting` rather than swapping under an in-progress drawing,
and serves the shell network-first with an offline fallback.

The cache id is derived from the deploy base in `src/app/pwa.ts`, which both the
browser and the build plugin import — the one value both sides must agree on.

## Keep boot small

There is no server and no prerender, so everything on the entry path is
downloaded before the first paint. The settings dialog, the cloud-setup prompt,
the changelog payload, and the Swedish catalog are all behind `import()`; check
before adding a static import to `App.tsx`.
