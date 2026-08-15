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
                           │    │     ├── SidePanel   (page actions + the stack)
                           │    │     └── Toolbar     (enabled tools + ink)
                           │    ├── ArchiveScreen     (lazy)
                           │    └── SettingsModal     (lazy)
                           └─ src/app/PrivacyPage.tsx (lazy, mounted at /privacy)

stores:   usePaintStore · useAppSettings · useNamespaces · useSyncEngine
domain:   types · layers · render · plugins/* · migrations · canvas · export
          transform (mirror / turn / resize) · handoff (between namespaces)
          sidebarDnd (which drops are legal)
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
the namespace switcher, the row action menus, the swipe strips (`SwipeableRow`),
the drag gesture (`useDragDrop`), the "About" dropdown's `FloatingPanel`, the
inline edit rows, and the check-for-updates row. The menu rides the framework's
own `px-5` row gutter so the app-owned rows and the framework-owned ones read as
one continuous list.

The **cloud glyph is a menu cell, not screen chrome.** `App` renders the
framework's `SyncStatus` once and passes it down as the island's last cell, so
there is a single sync affordance for the whole app rather than one per screen
header.

### One set of actions, three gestures

A row's moves — file it, shelve it, bin it — are reachable through whichever
gesture the pointer in your hand actually has, and each gesture means exactly
one thing:

| Gesture                   | On touch                  | On a mouse / pen              |
| ------------------------- | ------------------------- | ----------------------------- |
| Swipe right / left        | Archive / bare **Delete** | off (`SwipeableRow` gates it) |
| Press and hold, then drag | pick the row up           | press-drag does the same      |
| Right-click               | —                         | the full action menu          |

That is why `RowActionMenu` is passed `touchLongPress={false}`: a hold is how a
finger _lifts_ a row, so it can't also be how it opens a menu. The framework
gates swipe off for a desktop pointer on its own, which leaves right-click as
the pointer's way in and the swipe strip as the finger's — the pairing the
sibling `contacts` app settled on.

Neither half is a shortcut to a lesser set: both reach the same store actions,
and the destructive ones are asymmetric on purpose. A swipe right archives on
the flick (reversible); a swipe left only _latches_ a red Delete, which then
raises the same confirmation the menu's Delete does.

### Drag targets are the app's, the gesture is not

`useDragDrop` is generic over both ends of a drag — it recognises the gesture,
follows the pointer, and hit-tests the registered zones, and knows nothing about
drawings or folders. The app supplies the two domain answers:

- **`sidebarDnd.ts`** — what a drag carries (`DragItem`), where it can land
  (`DropTarget`), and which of those pairings are legal (`canDrop`). Pure, so
  the rules are testable without a pointer. `canDrop` also decides which zones
  _light up_, which is why it refuses the no-ops: a folder row offering itself
  to a drawing already filed in it is a lie, however harmless the drop.
- **`SideMenuContent`'s `onDrop`** — what each landing means, in store calls.

Four kinds of target, each drawing its own cue: a folder row (an accent ring),
the scrolling list (a dashed frame — "lift it out of the folder"), a namespace
row in the switcher (the framework draws that one), and the island's Archive
cell. Overlapping zones resolve smallest-first, so a folder row inside the list
claims a drop the list would otherwise take.

### Moving between sketchbooks touches two documents

Dropping a row onto another namespace's switcher row is the one edit that isn't
an edit to _a_ document: the destination lives under a different storage key and
is not in React state. [`handoff.ts`](../src/app/handoff.ts) is that pairing,
pure — take both documents, return both documents — with three rules the store
would otherwise have to remember at each call site: arriving copies are minted
fresh ids (so an undo on this side can't leave two sketchbooks claiming one
drawing), a source handed its last live page keeps a blank one, and the canvas
follows off a page that has left. A folder travels with the drawings filed in
it, re-filed under the folder's new id, so a group arrives as a group.

The store writes the destination first and then **reads it back** looking for
the ids the hand-off minted. `DocBackend.save` is a best-effort sink that
reports a failure rather than throwing, so "it didn't throw" is not evidence the
bytes landed — and without the read-back a full disk would swallow the drawing
on the way over _and_ remove it here.

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
that lives in localStorage stays a sane size. On the way out to a remote backend
those bytes are filed off into a real image file beside the document (see
[Sync](#sync) below), which is what keeps the pushed JSON small.

### Layers are a view of that list, not a tree

A drawing has a **stack** — an ordered list of layers, bottom first — and each
stroke names the layer it sits on, the same way it names the tool that drew it.
The strokes stay in **one flat array**. `layers.ts` is the whole feature: which
layer a mark belongs to, the paint order that falls out of it, and the counts the
panel shows.

The flat array is what makes it cheap. Undo is still `pop()` on one list; the
migration is _nothing_ (a document with no `layers` reads as the **default
stack**, so anything written before the feature opens untouched); and a drawing
nobody has restacked still writes the bytes it always did, because a stroke
records a layer only once the drawing has a stack of its own. A tree of
per-layer stroke arrays would have bought a nicer type and cost all three.

That default stack is two layers, not one: a locked **background** at the
bottom and the **base** above it. Both ids are fixed, both are implicit, and
that is what lets the change be free — an existing document's marks name no
layer, so they read as the base, and the background is simply an empty locked
sheet under them.

The background is the one layer that is more than a group of marks: **the page
colour is painted as part of it**. `renderDrawing` fills the sheet only while
that layer is in play, so hiding it and exporting transparently are the same
mechanism rather than two — and `visibleStrokes(drawing, { withoutBackground })`
is what a transparent export asks for, taking the marks drawn on the sheet out
with the colour. Because the fill is not a stroke, `cache.ts` compares
`backgroundHidden` alongside the stroke list: it is the one document edit the
identity comparison cannot see.

`Layer.locked` is a guard rather than a mode. A locked layer takes no marks,
cannot be selected, moved or deleted, and paints exactly as it did — so
`activeLayer` skips locked layers when it resolves where a mark lands, and
`drawableLayer` is how the store asks whether there is anywhere to put one at
all.

Two rules keep it honest, and both live in `visibleStrokes`:

- a stroke naming no layer belongs to the **base**, which keeps a fixed id — so
  the marks drawn before the stack existed follow the base layer when it is
  reordered rather than sliding to whatever fell to the bottom;
- a stroke naming a layer that isn't there belongs to the base too. Losing a
  layer must never mean losing a mark to invisibility.

The panel's per-row preview (`LayerThumbnail`) paints that layer's group through
the same `paintStrokes` everything else uses, so a new tool shows up in it the
day it is registered. It takes one liberty, and it is what makes it a picture
rather than a smudge: a mark thinner than a pixel at preview scale is painted
_at_ a pixel. Only `size` is touched, only on the strokes that would vanish, and
only on copies — the document never sees it.

`visibleStrokes` is the single answer to "what is on this page": the renderer
folds over it, so the screen, the PNG / JPG / SVG downloads, the crop-to-marks
bounds and the bucket's snapshot all agree about what a hidden layer means. For a
drawing with one showing layer it hands back the document's own array by
reference, which keeps the frame cache's identity comparison allocation-free on
the common path.

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

### A repaint is a fold; a frame is not

`renderDrawing` remains a fold over the whole document, and that is what keeps
the model the single source of truth — undo, a synced document arriving and a
theme flip all go through one path. But the canvas repaints on every pointer
sample, and almost nothing it repaints has changed, so a _frame_ is allowed to
be much less than a full render:

- `cache.ts` keeps the committed marks as pixels and blits them while a gesture
  is in flight. A landed stroke is painted onto that bitmap rather than
  triggering a rebuild, and a **drag scrolls it** — the marks are blitted at
  their new offset and only the strip of page that has just come into view is
  painted. When a rebuild is unavoidable it paints the _screen_ and copies the
  result back, because rendering into an off-screen context is no faster and
  the copy leaves the cache holding exactly what the next frame wants. It
  compares the _painted_ strokes, so hiding or reordering a layer repaints, and
  a mark landing under something already on the pixels repaints rather than
  compositing itself on top of it.
- `geometry.ts` gives each stroke a box, and the renderer skips the marks that
  cannot reach the window it is painting.
- `PaintDetail` tells each painter how big its mark is coming out on the device
  it is bound for, and the textured painters drop the dabs, hairs and specks
  that would land inside a single device pixel. The medium's own numbers stay
  written as the medium — only the screen takes away — so a mark looks the same
  as you zoom into it and the PNG export (always 1:1) is unchanged.

The cache holds no state the document doesn't: every path into it goes through
`renderDrawing`, and where there is no DOM to build it in the canvas paints the
document directly, exactly as it did before the cache existed.

The one place a frame is not the frame a plain render would produce is mid-drag,
and it is a deliberate trade: a canvas rasteriser is not translation-invariant,
so marks carried along by a scroll keep the antialiasing fringes they were first
drawn with. The difference is bounded, does not compound, and heals once the
drag has moved a window's width.

## The canvas is a window

A page is whatever size it was created at — the new-drawing dialog asks, and
defaults to the screen's own resolution. The rules behind that question (the
four presets, what "this screen" resolves to, and the one scale all four are
_drawn_ at so they can be compared as rectangles) live in `canvasSize.ts`, pure
and node-testable; `NewDrawingModal.tsx` is only the dialog around them, and the
size reaches the document as the `init` patch `addDrawing` already took.

`transform.ts` is the other half of that story: mirroring, quarter turns,
scaling, and resizing the sheet alone. All four are one map from a point on the
page to another, applied to every stroke's geometry — pure and node-testable,
because a vector document has nothing to resample. Two shapes need more than
their corners mapped and both are handled there: a caption's _box_ is mapped
while the words stay upright, and a bitmap's pixels are redrawn through an
injected callback (`turnBitmap` in `images.ts`) so the module itself stays
DOM-free. The store turns any of them into one undo step (`transformActive`),
and the screen re-fits the view afterwards, because a page that changed shape is
one the window is no longer pointed at.

That dialog also asks what the drawing is made of — an empty page, an image file,
or an image on the clipboard (`clipboard.ts`, where every failure to read one is
"there isn't one") — and a drawing made from a picture opens with the picture on
it as one ordinary image stroke. It lives in `App.tsx` rather than in the side
menu that opens it: pressing New closes the drawer, and on a phone the framework
`Sidebar` _unmounts_ its contents when it closes.

A page can therefore be larger than the window it is shown in, so the `<canvas>`
element is a **window** onto it rather than the page itself. `viewport.ts` owns that window as a pure
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
case it pans and a double-tap fits the page — or, with something selected and
the press inside it, moves the marks instead of the window. That is a flag on the descriptor,
not a tool id — see the plugin seam below. Taps are detected from the pointer
stream (`gestures.ts`, pure and node-testable) rather than from `dblclick`: the
browser's event is synthesised inconsistently on touch and arrives only after
both presses have already been handled, which under a drawing tool means two
marks are on the page before it fires. Restricting the gesture to a tool that
draws nothing is what makes it dependable.

Two things want an inward edge swipe: the sidebar (the framework's own hook,
which opens the drawer itself) and the layers panel (the app's, fired back
through a callback). The canvas arbitrates by **holding** a touch that lands in a
watched strip rather than drawing it — the sidebar's edge is asked first, since
it is listening whatever the canvas decides — and replays the press from where it
landed the moment it proves to be neither. `CanvasScreen` never arms the panel on
an edge the sidebar already owns, so a phone with a right-hand drawer reaches
layers through the header button instead.

Zoom is the canvas's alone. The viewport meta disables it app-wide, `main.tsx`
swallows WebKit's `gesture*` events (which an iOS Safari tab honours over the
meta), and `body` carries `touch-action: manipulation` to kill double-tap zoom —
so the only thing in the app that scales anything is the canvas.

## The plugin seam

`src/app/plugins/` is the extension point, and the rule the rest of the app
lives by: **nothing outside it may branch on a tool id.**

- `types.ts` — the `PaintPlugin` descriptor and the `ToolBehaviour` contract
  (`start` / `move` / `end` / `paint`), plus the `PaintDetail` a painter is
  handed to tell it how finely it is being rasterised, and the `ToolDial` a tool
  declares to put a slider — or a row of chips, for a dial with `choices` like
  the pencil's lead grades — of its own in the size panel.
- `gauge.ts` — the sizes a tool is really made in, and the slider that walks
  them: the range a shop stocks, the five widths worth a button, and the
  three-band geometric mapping that spends the middle four tenths of the travel
  on the real rack (see `builtin/gauges.ts` for the rack itself). The physical
  scale it is all written against is `src/app/units.ts` — a document pixel is
  one dot of an iPhone's screen (460 to the inch), which makes a millimetre
  18.11 pixels and a width something you can hold a ruler against on the device
  you are drawing on.
- `dials.ts` — what happens to those sliders' numbers: resolved for the panel,
  and pared back to just the ones moved off their default for the canvas and the
  stroke.
- `controls.ts` — which button the toolbar puts beside the ink for the tool in
  hand: its width, a cog holding just its dials (a `sizeless` tool — the
  bucket), or nothing at all (a tool with neither). One place, read entirely off
  descriptor flags.
- `registry.ts` — registration order (which is the toolbar's _default_ order),
  the core / default-on / optional split, resolution, and the two things a
  toolbar is actually built from: **entries** (a lone tool, or a whole family
  behind one button — see `ToolGroup`) and `orderEntries`, the pure permutation
  that puts them in the order Settings → Tools has them in. That order is
  recorded as a list of ids and applied _in place_, so an entry it has never
  heard of keeps its registration index — a tool added by a later release lands
  where its maker put it rather than at the end of an arrangement written before
  it existed.
- `builtin/` — the shipped tools, built from two family factories (freehand and
  shape) plus their ink configuration, and the three that begin no stroke of
  their own: the hand, the dropper, and the bucket (which files the area the
  probe traced for it).
- `brushes.ts` — the characterful painters: spray cones, soft nibs, chisel felt
  tips, feathered fills.
- `builtin/text.ts` — the one tool whose mark is typed rather than drawn. Its
  press opens a caret (`entersText`, read by the canvas) and `TextEntry.tsx`
  collects the words into a text stroke; the module also owns the typefaces, the
  font shorthand every surface sets type with, and the measurement the export
  crop and the repaint's culling both ask for.
- `bristle.ts` — the paintbrush, which needs a module of its own because it is
  the only painter modelling a physical _object_: a head that holds a load and
  spends it, that is wider than the wiggles you ask it to follow, that cannot
  turn inside its own width, and that leaves an opaque mark with the hairs'
  partings scratched through it.
- `aquarelle.ts` — watercolour, which is the one medium here where what is
  being painted with is _water_: the wash runs past the hair that laid it, its
  two edges wander independently, the rim dries darkest as the pool evaporates,
  the pigment granulates into the sheet, and every pass is thin because nothing
  in the medium covers.
- `crayon.ts` — the wax, which needs one for the opposite reason: it is the only
  painter modelling the _page_. A fixed lattice of paper tooth decides where wax
  sticks, anchored in document coordinates, so it is the same sheet under every
  mark and the texture is a property of the paper rather than of the stick.
- `graphite.ts` — the pencil, which is the crayon's near neighbour and
  deliberately not the same painter: graphite chips off where it lands instead
  of smearing, finds a finer tooth than a blunt wax face does, and is a _colour_
  rather than an ink — the tool mixes its own grey against the page rather than
  taking the one the toolbar is holding.
- `grain.ts` — the hashes all four scatter with, the even walk along a path
  they lay texture down on, and the floor below which a detail is too small to
  draw.

All of them are pure functions of the stroke, with every scatter hashed off
position rather than drawn at random, so a repaint and the PNG export grain
identically.

A tool that needs the app to treat it differently says so on its descriptor —
`erases` for the eraser, `navigates` for the hand, `picksColor` for the
dropper, `selects` for the selection family — so the canvas and the
toolbar read a property instead of learning a name.

`selects` carries one extra obligation past the flag: the behaviour answers
`selection(draft)` with the **closed contours** its gesture chose, in document
coordinates. That is the only currency the screen deals in, which is what lets a
box marquee, an oval, a freehand lasso and an outline traced off the page itself
all be selections without the canvas, the store or the renderer learning a shape
(see `selection.ts`'s `strokesInRegion`).

`group` is the flag that changes how a tool is _offered_ rather than how it
behaves. The eleven shapes each stay their own plugin — their own painter, their
own remembered width, their own persisted id, so nothing already drawn is
orphaned — and share one toolbar button and one switch; the four selection tools
are grouped the same way, under the id the lone marquee used to hold, so a
settings blob written before the family existed still names their button. The button wears the
member you last held; pressing it again opens the family and the fill toggle.
Grouping touched no stroke and needed no migration, which is the test any
"merge these tools" change has to pass: a stroke's `tool` is persisted.

`gauge` is the same pattern pointed at the width. A tool declares the range it
is really manufactured in and the five sizes worth a button, and the panel
renders a slider whose middle band _is_ that range — so a pencil offers
0.3–2 mm of lead and a decorator's brush offers 25–150 mm, without the picker
knowing which is which. What a tool has saved under a name (`src/app/presets.ts`)
rides the same seam: a preset is a width plus every dial, addressed by tool id,
and applying one is a single write to the settings blob.

`dials` is that pattern carrying a whole surface. Width is the control most
tools share; past it they stop agreeing, so a tool lists what _it_ has to tune
(the paintbrush's hair gauge, the watercolour brush's water, the bucket's
feather) and the panel renders the list under an **Advanced** heading without
learning a single dial's name. The numbers are fractions of the tool's own normal, kept per tool in
the settings blob, and **only the ones moved off their default** are handed to a
behaviour or written onto a mark — so a painter can keep its rest value as an
ordinary default argument, and a page drawn without touching one serialises
byte-for-byte the way it did before dials existed.

`sizeless` and `sizePreview` are the same seam pointed at the _button_ rather
than at the panel. The bucket has no nib and the eraser's mark is a hole, and
both used to be handled by the toolbar knowing which tool it was holding — a
dimmed size button for one, a fabricated blot of ink under the other's press for
the other. Now each says what it is on its descriptor and `controls.ts` answers
in one place, so the tool that lands next year gets the right button without
this file changing.

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

## Selections

A selection is **not document state**. Which marks are picked is not saved, not
synced and not undoable; `CanvasScreen` holds a list of stroke ids and
`selection.ts` answers every question about them from the document on each
render — the box they cover, whether a press landed on it, what one looks like
moved. So an undo puts the marks back and the outline follows, deleting them
empties it, and there is no third copy of anything to go stale.

`selection.ts` switches on the shape kind, the same contract `bounds.ts` and the
renderer's fallback painter use, so the tool works on marks made by tools it has
never heard of. Everything in it is pure and node-tested.

The moving half is the one place the canvas paints something the document does
not yet say. A drag on a selection under the hand is shown live — the marks in
flight are painted at the offset the finger has reached and left out of the page
underneath (`RenderOptions.omit`, a set the canvas keeps for the length of the
drag so the mark cache can compare it by identity) — and lands as **one** edit
when the finger lifts. One drag, one undo step, and no per-frame writes to the
store.

Copied marks travel on the _system_ clipboard, as text behind a marker
(`strokeClipboard.ts`), which is what makes copy-here-paste-there work across
tabs and reloads. Reading it back validates every field, because anything at all
can be put behind that marker. `clipboard.ts` classifies a paste — marks, a
picture, or words — and each lands in the surface that already exists for it: the
store, the image placement frame, or the caption box.

See [`docs/features/plugins.md`](features/plugins.md) and
[`docs/features/selection.md`](features/selection.md) for the user-facing half.

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
pulled back down explicitly. The drawings' _rendered layers_ are a second,
hand-driven save on top of that — see [Two saves, on two clocks](#two-saves-on-two-clocks).

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

### Bitmaps are filed out, geometry is not

A paint document is one JSON file per namespace — except for the bytes of a
dropped picture, which would push megabytes of base64 on every debounced save.
So `withExternalImages` ([`imageStore.ts`](../src/app/imageStore.ts)) wraps the
adapter for every plaintext remote backend and splits the two apart: on save each
image stroke's bitmap is written to `images/<drawing-slug>-<tag>-<n>.<ext>` as
real image bytes and replaced in the pushed JSON by that path; on load the files
are read back onto their strokes. The working copy on this device always keeps
the bytes inline, so drawing, undo and export never see the seam.

The byte transports are `imageFileStore.ts` (Dropbox and Google Drive content
APIs, since the framework's `FileStore` is text-only and would mangle a JPEG)
and `folderFileStore.ts` (the File System Access API), behind one `ByteFileStore`
contract so all three backends are driven identically. Both ride `cloudRetry.ts`,
which keeps a handful of files in flight at a time and honours a provider's
`Retry-After` — a throttled read must not look like a missing picture.

Two rules make it safe on a bad network: a bitmap is stripped from the outgoing
document only _after_ its file write succeeds, and an orphaned file is deleted
only after the document save commits _and_ only when every image in that save was
accounted for. An encrypted copy skips the layer entirely and keeps its bitmaps
inside the envelope.

### Two saves, on two clocks

The document push above is automatic and stays that way: strokes are cheap, and
work you can lose is work you will lose. The **rendered layers** are the other
half — a `.pct` tree of transparent PNGs beside the document — and those move
only when the user presses the header's disk button.

That split is the whole design. A page of layers is megabytes of PNG; pushing it
on every settled edit would be slow, expensive, and mostly wasted. So
`useSyncEngine` exposes a second verb, `saveLayers`, gated by `canSaveLayers`
([`cloudSetup.ts`](../src/app/cloudSetup.ts)) rather than by `shouldAutoSave`.
The two gates differ in exactly two places, and both are deliberate: a layer
save does **not** require a dirty document (the backend may hold no layers for a
document nobody has touched), and it is **refused outright** when the copy is
encrypted, because plaintext layer PNGs beside an AES-GCM envelope would hand
over the picture the envelope exists to hide.

Even an explicit save is usually nearly free, because **a layer's file name
carries a hash of its content** — the marks on it plus everything else that
decides its pixels, the page size and the resolved ink included, so a canvas
theme flip counts as a change. The bytes at a path therefore never change, which
turns the save into a set difference: the paths the drawings want against the
paths the backend has ([`layerStore.ts`](../src/app/layerStore.ts)). An
untouched layer is already filed under the name it would be written as, so it is
neither rendered nor uploaded. It is the rule the sibling `notes` app's
attachment store follows, arrived at from the same direction.

Two ordering rules mirror the image externaliser's. Pixels are written before the
manifest, so an index never names a file that isn't there. And orphans are pruned
only after every manifest commits _and_ only when nothing failed — "no drawing
wants this file" is a sound judgement only when every drawing was actually filed.

### The container is one format, written two ways

[`pct.ts`](../src/app/pct.ts) owns the `.pct` layout and is pure: the manifest
shape, the file naming, the hashing, and the parse back. The pixels are
[`pctFile.ts`](../src/app/pctFile.ts)'s, which renders a layer by handing the
drawing to the ordinary renderer with every _other_ layer's eye switched off —
so a layer's PNG is the pixels that layer contributes to the page by
construction, with no second painting path to drift.

The download zips those pieces up; the backend writes the same pieces unpacked.
A zip is the wrong shape for a backend (one changed layer rewrites the archive)
and an unpacked tree is the wrong shape for a download, but building both from
the same functions is what stops the two drifting.

The container carries the vectors as well as the pixels — `vectors.json`, an
ordinary one-page document, so it rides the existing migration chain rather than
needing one of its own. That is what makes reopening a `.pct` lossless instead of
a flatten; a container without one (another tool's) still opens, as one image
stroke per layer. The backend tree writes neither `vectors.json` nor a preview:
the strokes already travel in the document beside it, and a full-page thumbnail
on every save is precisely the upload this layout exists to avoid.

The zip itself is [`zip.ts`](../src/app/zip.ts) — a reader and writer over the
platform's `CompressionStream("deflate-raw")`, about two hundred lines and no
dependency. A library would have bought the same two functions for a couple of
hundred kilobytes on the entry path. Nothing in this section is on the boot path
at all: the container, the codec and the layer renderer are all reached through
`import()` from the actions that need them.

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
