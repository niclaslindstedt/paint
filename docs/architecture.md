# Architecture

Paint is a **frontend-only, local-first PWA**. There is no server, no API, and
no build-time data: the whole app is static files, and every byte of user data
lives in the browser (or in a storage backend the user connected themselves).

It is an adoption of the [`oss-framework`](https://github.com/niclaslindstedt/oss-framework)
reference app, rescoped from checklists to drawing, and a sibling of the `notes`
and `contacts` apps.

## The layers

```
index.html → src/main.tsx ─┬─ src/App.tsx
                           │    ├── SideMenuContent   (navigation)
                           │    │     └── SideMenuRows (its presentational leaves)
                           │    ├── CanvasScreen      (header, page, toolbar)
                           │    │     ├── PaintCanvas (the gesture in flight)
                           │    │     └── Toolbar     (enabled tools + ink)
                           │    ├── ArchiveScreen     (lazy)
                           │    └── SettingsModal     (lazy)
                           └─ src/app/PrivacyPage.tsx (lazy, mounted at /privacy)

stores:   usePaintStore · useAppSettings · useNamespaces · useSyncEngine
domain:   types · render · plugins/* · migrations · canvas · export
platform: @niclaslindstedt/oss-framework (UI kit, storage, theme, i18n, PWA)
```

Dependency direction is one-way: screens → stores → framework. Nothing imports
framework internals, only its published subpaths.

`main.tsx` is a two-way switch, not a router: the build mirrors `index.html` to
`dist/privacy/index.html` (the `emitPrivacyAlias` plugin in `vite.config.ts`),
so GitHub Pages serves the same bundle at `/privacy/`, and a `location.pathname`
check decides which page to mount. Each half is lazily imported, so neither
rides in the other's chunk.

## The side menu

`SideMenuContent` owns the menu's state and actions; `SideMenuRows` holds its
presentational leaves (section headers, drawing / folder rows, the inline name
editors, the island cells, the footer rows, the collapse rail). The split keeps
the stateful file about behaviour rather than pixels, and both well under the
§20.5 size cap.

Everything generic underneath is the framework's: the drawer shell (`Sidebar`),
the namespace switcher, the row action menus, the "About" dropdown's
`FloatingPanel`, the inline edit rows, and the check-for-updates row. The menu
rides the framework's own `px-5` row gutter so the app-owned rows and the
framework-owned ones read as one continuous list.

The **cloud glyph is a menu cell, not screen chrome.** `App` renders the
framework's `SyncStatus` once and passes it down as the island's last cell, so
there is a single sync affordance for the whole app rather than one per screen
header.

## Safe areas

The app paints edge to edge (`viewport-fit=cover`) so an installed iOS PWA fills
the screen, which means every piece of chrome at an edge has to clear the notch
or the home indicator itself. Three do:

- the canvas header and the archive header pad by `env(safe-area-inset-top)`,
- the toolbar and the menu footer pad by `env(safe-area-inset-bottom) + 10px`,
- the menu panel grows past its content box by the bottom inset to reclaim the
  padding the framework panel reserves, handing it to the scrolling list.

## Why the document is vector

A drawing is an ordered list of **strokes**, each a shape plus its ink. It is
never a bitmap, and that single decision pays for most of the app:

- **Undo is exact and cheap.** One mark is one entry; undo is `pop()`, not a
  per-stroke image snapshot.
- **The document fits in localStorage.** A sketch is a few kilobytes of JSON
  where a 3200×2000 PNG is a megabyte or more.
- **Sync is diffable and readable.** The bytes pushed to Dropbox are the same
  JSON you can export, open in an editor, and reason about.
- **The page can be re-themed.** Because ink is data rather than baked pixels, a
  mark that never chose a colour can resolve one at paint time — which is what
  makes the light/dark canvas flip re-ink a whole sketch (see
  [`canvas.ts`](../src/app/canvas.ts)).

One shape kind breaks the "never a bitmap" rule on purpose: an `image` stroke —
a picture dropped onto the page — carries its bytes inline as a `data:` URL,
because an imported photo has no vector form and the alternative to inlining it
is not having it. It is still one stroke: it undoes, syncs and exports like any
other mark, and imports are downscaled on the way in (`images.ts`) so a document
that lives in localStorage stays a sane size.

Rasterising happens through the same renderer everywhere: onto the screen
canvas, and onto an off-screen canvas for the PNG and JPG downloads. There is no
second painting path to drift. The screen applies the view transform before
calling it and a download applies its crop instead, which is the only difference
between them — and the reason the grid is a `RenderOptions` flag a download
leaves unset rather than something painted separately.

The SVG download is the same trick rather than an exception. `svg.ts` is a
**recording context**: an object carrying the slice of the 2D canvas API the
painters use, which emits elements instead of pixels. `renderDrawing` paints into
it exactly as it paints into a canvas, so a new tool gets vector output for free
and there is still one painter per stroke. What an export covers — the sheet, or
a crop around the marks — is `bounds.ts`, geometry keyed off the shape kind.

## The canvas is a window

The page is larger than any screen, so the `<canvas>` element is a **window**
onto it rather than the page itself. `viewport.ts` owns that window as a pure
affine transform (uniform scale + translation) and all the arithmetic over it —
zoom-about-an-anchor, clamped panning, and a whole pinch computed from where the
gesture began rather than accumulated frame by frame, which is what makes it
exact and reversible. Being DOM-free, a complete pinch can be driven in a node
test.

`PaintCanvas` owns only what the maths can't: the pointers, the repaint, and the
gesture split (one pointer draws, two pinch, a second finger mid-stroke abandons
the stroke). The view is screen state and deliberately never reaches the store —
where you scrolled to is not part of the document.

One pointer draws **unless the active plugin declares `navigates`**, in which
case it pans and a double-tap fits the page. That is a flag on the descriptor,
not a tool id — see the plugin seam below. Taps are detected from the pointer
stream (`gestures.ts`, pure and node-testable) rather than from `dblclick`: the
browser's event is synthesised inconsistently on touch and arrives only after
both presses have already been handled, which under a drawing tool means two
marks are on the page before it fires. Restricting the gesture to a tool that
draws nothing is what makes it dependable.

Zoom is the canvas's alone. The viewport meta disables it app-wide, `main.tsx`
swallows WebKit's `gesture*` events (which an iOS Safari tab honours over the
meta), and `body` carries `touch-action: manipulation` to kill double-tap zoom —
so the only thing in the app that scales anything is the canvas.

## The plugin seam

`src/app/plugins/` is the extension point, and the rule the rest of the app
lives by: **nothing outside it may branch on a tool id.**

- `types.ts` — the `PaintPlugin` descriptor and the `ToolBehaviour` contract
  (`start` / `move` / `end` / `paint`).
- `registry.ts` — registration order (which is toolbar order), the
  core / default-on / optional split, and resolution.
- `builtin/` — the shipped tools, built from two family factories (freehand and
  shape) plus their ink configuration, and the three that begin no stroke of
  their own: the hand, the dropper, and the bucket (which files the area the
  probe traced for it).
- `brushes.ts` — the characterful painters: bristles, spray cones, grain. Pure
  functions of the stroke, with every scatter hashed off position rather than
  drawn at random, so a repaint and the PNG export grain identically.

A tool that needs the app to treat it differently says so on its descriptor —
`usesBackground` for the eraser, `navigates` for the hand, `picksColor` for the
dropper, `supportsHardness` for the soft brushes — so the canvas and the toolbar
read a property instead of learning a name.

`hidden` is the same idea taken to its end: the dropped image's painter is a
plugin with no button anywhere and no gesture at all. An image arrives as a file,
but the mark it becomes still names a plugin, so the renderer can paint it
without any screen learning that "image" means something. `toolPlugins()` is the
list everything user-facing reads; `allPlugins()` keeps the hidden one so a
stroke never loses its painter.

Two tools need to know what is _painted_ rather than what was drawn. They ask
through `ToolContext.probe`, a narrow read of the page (`probe.ts`) that
rasterises the drawing off-screen through the same renderer, once per press. The
bucket floods that snapshot and traces the outline of what it flooded
(`flood.ts` — pure, and tested on hand-built images with no canvas), then files
the outline as an ordinary `region` stroke: the pixels never reach the document,
so a fill zooms, undoes and syncs like any other mark.

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
