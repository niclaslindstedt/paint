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
                           │    │     ├── SidePanel   (the sections, in the user's order)
                           │    │     │     └── panel/*  (one file per section)
                           │    │     └── Toolbar     (enabled tools + ink)
                           │    ├── ArchiveScreen     (lazy)
                           │    └── SettingsModal     (lazy)
                           └─ src/app/PrivacyPage.tsx (lazy, mounted at /privacy)

stores:   usePaintStore · useAppSettings · useNamespaces · useSyncEngine
domain:   types · layers · merge · render · plugins/* · migrations · canvas
          export
          defaults / kit (what a fresh start is made of, and putting it in hand)
          canvasSize / canvasPresets (what page a drawing is made on)
          transform (mirror / turn / resize / crop) · crop (aiming one)
          handoff (between namespaces)
          effects / adjust / bake / histogram (a change made to the picture)
          panelSections (what the right-hand panel is made of)
          order (what you do to a stored arrangement of ids)
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
the ids the hand-off minted. Writes are a best-effort sink that report a failure
rather than throwing, so "it didn't throw" is not evidence the bytes landed —
and without the read-back a full disk would swallow the drawing on the way over
_and_ remove it here.

This is the one path that waits on storage rather than going through the
synchronous cache (`DocBackend.deliver`): it writes, waits for the database to
confirm, and re-reads _past_ the cache. A cached read would only be the write
agreeing with itself.

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
- **The document stays small.** A sketch is a few kilobytes of JSON where a
  3200×2000 PNG is a megabyte or more, and it is re-serialized on every edit.
- **Sync is diffable and readable.** The bytes pushed to Dropbox are the same
  JSON you can export, open in an editor, and reason about.
- **The page can be re-themed.** Because ink is data rather than baked pixels, a
  mark that never chose a colour can resolve one at paint time — which is what
  lets the default ink, or a light/dark canvas flip, re-ink a whole sketch (see
  [`canvas.ts`](../src/app/canvas.ts) and
  [`defaults.ts`](../src/app/defaults.ts)).

One shape kind breaks the "never a bitmap" rule on purpose: an `image` stroke —
a picture dropped onto the page — carries its bytes inline as a `data:` URL,
because an imported photo has no vector form and the alternative to inlining it
is not having it. It is still one stroke: it undoes, syncs and exports like any
other mark, and imports are downscaled on the way in (`images.ts`) so a document
re-serialized on every edit stays a sane size. On the way out to a remote backend
those bytes are filed off into a real image file beside the document (see
[Sync](#sync) below), which is what keeps the pushed JSON small.

### Layers are a view of that list, not a tree

A drawing has a **stack** — an ordered list of layers, bottom first — and each
stroke names the layer it sits on, the same way it names the tool that drew it.
The strokes stay in **one flat array**. `layers.ts` is the whole feature: which
layer a mark belongs to, the paint order that falls out of it, and the counts the
panel shows. `merge.ts` is its counterpart — everything in `layers.ts` answers
"which layer is this mark on?", and everything in `merge.ts` answers "what does
the document look like once these layers are one layer?": the merge dialog's
rules, and the flatten the panel-off state asks for. Both are pure, so a whole
merge is driven in a node test without a canvas.

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
with the colour.

That is also **what "no page colour" is**, and deliberately so: a new image is
made with `transparentLayers()` (the default stack with the sheet's eye off)
rather than with a sentinel in `Drawing.background` meaning "not a colour". One
state, so the renderer asks one question, an export leaves one thing out, and
the way back to a sheet is the eye the layers panel already offers. It also
costs no migration — a drawing written before any of this carries no `layers` at
all, still reads as `defaultLayers()`, and still has its sheet.

Where a page has no sheet, the screen paints a **chequer** under the marks
(`RenderOptions.checker`). It is a view and never a mark: like the grid, only the
canvas passes it and every export leaves it unset, so the nothing stays nothing
in the file. It is painted in document coordinates so it sits still under a pan,
and its squares go down _before_ the flat sheet behind them — `underlay` composites
`destination-over`, so the order that reads backwards is the one that works.

One place the drawing and the file have to disagree: **JPG has no alpha**, so a
page made of nothing would encode as solid black. `flattensPage` catches exactly
that pair and lays `resolvePageColor`'s answer under the finished picture — after
the renderer, never before it, because a repaint clears the canvas it is handed. Because the fill is not a stroke, `cache.ts` compares
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

### Effects are an edit, not a view

A drawing can be blurred or grained, and both are the one thing painted that is
not a mark. They are **effects**: applied once, to the pixels, and then gone.
Applying one rasterises the target layer's marks onto an off-screen surface at
document size, composites the effect over them, and replaces those marks with a
single `image` stroke of the result (`bake.ts`). The document goes on being a
stroke list; one of its strokes is now a picture, exactly as a dropped photograph
is.

They used to be **filters** — a kind and a couple of numbers held on the drawing
and composited over the finished picture on every frame, forever. That kept the
document purely vector, which is the property the rest of the app is built on,
and it is why the design was chosen. What sank it was the cost on the layer
scope: a filtered layer has to be composited as a unit, so every stroke landing
on one forced the whole layer to be re-softened, and `cache.ts` had to give up
both its append and its scroll fast paths for as long as the filter existed.
Rubbing out on a blurred watercolour was unusable. An effect pays that cost once,
at the moment you ask for it.

The trade is stated rather than hidden: the marks that went into a bake are gone
from the document (undo brings them back, a reload does not), and the layer is a
PNG on the wire. Two things keep that affordable — the bake is **cropped** to the
ink it covers grown by the effect's reach and clipped to the page, and it has a
**resolution ceiling** (`MAX_BAKE_PIXELS`) past which it rasterises smaller and
paints back at full size. Grain is the case that sets the ceiling: noise is
incompressible by construction, and the whole document is rewritten on every
edit.

The split follows the usual line. `effects.ts` is pure: what the effects are,
what each offers to set, and where each may be applied — noise is a layer's
alone, blur offers the layer or the whole stack. `effectPaint.ts` is the pixels.
Neither of those two touches pixels one at a time — the blur is one filtered
`drawImage` and the grain is a deterministic speck tile laid as a pattern
anchored to the page — which is what makes them cheap enough to preview live. The
grain goes down in **two coats** of different speck sizes, because a single tile
gives itself away: the eye reads the same clump arriving at a fixed spacing as a
weave rather than as noise, and it measures as an autocorrelation spike at the
tile's pitch. Two coats whose periods do not share a factor push that agreement
further than a page is wide. The tile is built at one speck per pixel and scaled
when it is painted, so the field costs the same megabyte at every zoom.

`bakeEffect` answers `null` when it cannot bake — no marks on the target, no DOM,
a canvas that refused its pixels — and the caller then lands no edit at all. That
is deliberate: the one failure worth engineering against is emptying a layer
whose replacement never arrived.

**Scope is decided by `effectTargets`**, and it skips two kinds of layer at both
scopes: **locked** ones (a lock means the sheet takes no edits, and rasterising
every mark on it is a bigger edit than the pencil line the lock refuses) and
**hidden** ones (an effect you cannot see land is one you cannot judge). "All
layers" bakes each named layer _separately_, so the stack survives an effect
applied across it.

That cheapness is what pays for the **preview**. A radius in page pixels is not a
number anyone can picture, so the dialog paints its draft onto the page behind it
while the sliders move — and it is the _same composite the bake will rasterise_,
on the same layers, so what you approve is what you get. It reaches the renderer
as `RenderOptions.preview`, never as document state: the target layers are lifted
onto surfaces of their own and `paintEffect` runs over each, which is the path
`bake.ts` takes off-screen. Nothing reaches the document until Apply, so the
draft is screen state like the view or a half-typed caption, and a slider dragged
end to end costs no undo step. The dialog holds the modal scrim back for as long
as it is open (`backdrop.ts`), for the obvious reason: a preview seen through a
dimmed — or blurred — veil is not one.

A preview is the **only** thing that costs the mark cache anything. While one is
open, `cache.ts` gives up its append and its scroll fast paths (a layer being
composited as a unit cannot take a stroke painted on top of the pixels already
held) and compares the preview by identity as part of its staleness check —
moving a slider repaints without adding, removing or reordering a mark, which is
the one other document edit (the sheet's eye being the first) that comparing
strokes cannot see. Close the dialog and every fast path is back, which is the
whole difference from the filters this replaced.

The blur has **two painters**, and the reason is worth knowing before touching
it. `ctx.filter` is the obvious way to blur a canvas and it is unavailable in
Safari — not missing, which would be catchable, but _inert_: the property takes
a value, reads it back, and changes nothing that gets drawn. A painter that sets
it and blits therefore degrades to no blur at all on every iPhone, iPad and Mac,
silently. So the capability is **probed by behaviour** once per session — put a
pixel down under a blur, ask whether ink landed beside it — and a context that
did not deliver gets a resampling blur instead: shrink the picture, draw it back
up smoothed, twice. That is a handful of `drawImage` calls on an image that is
getting smaller each time, and it tracks a real Gaussian closely enough that the
two agree to about four levels per channel across the whole radius slider.

### Colour adjustments are effects too

The panel's **Colour** section — brightness and contrast, levels, curves, hue and
saturation, colour balance, desaturate — is not a second pipeline. Each is a
member of the same `Effect` union, carries the same descriptor, opens the same
dialog, previews through the same composite and lands through the same
`bakeEffect`. What a descriptor's `group` decides is only which of the panel's
two headings lists it, and `EFFECT_GROUPS` is what the panel renders sections
from, so a third section would be a row in that array.

The arithmetic is `adjust.ts`, DOM-free like `effects.ts` and for the same reason:
a colour adjustment is a function from bytes to bytes, so the whole section can
be driven in a node test without a canvas. Two shapes of it, and the difference
is what it costs. **Per-channel** — brightness, levels, curves, balance — maps a
channel's value with no reference to the other two, so the adjustment collapses
into three 256-entry tables built once and read per pixel. **Per-pixel** —
desaturate and hue/saturation — mixes the channels (a hue is an angle only the
three together have), so the maths runs per pixel. Both skip a pixel with nothing
in it, which on a layer's own surface is most of them, and neither ever writes
alpha: an adjustment changes what colour the ink is, not how much of it there is.

Painting one is the file's **only `getImageData`**, and it is the exception that
proves the rule the rest of `effectPaint.ts` follows. "What this pixel's red
becomes" is a lookup and no compositing mode expresses one, so the window is read
back, run through `adjust.ts` and written again. What makes that affordable is
the same thing that makes it acceptable: it happens when a _dialog's_ slider
moves, never during a gesture, and it is bounded to the part of the page actually
on the canvas rather than to the sheet.

Two effects have a value that is not a number, and the descriptor admits both
rather than the dialog special-casing either.

**Curves** declares an `EffectCurve`: the field holding the four lines and the
choice naming which one the hand is on. `EffectModal` renders `CurveEditor` for
it exactly as it renders a slider for a control. The line through the handles is
a **monotone** cubic (Fritsch–Carlson), shared between the editor and the painter
so what you drag and what lands on the pixels are the same function. An ordinary
spline overshoots, and an overshoot on a tone curve is a bright band with dark
edges either side of the handle you dragged.

**Levels** declares an `EffectLevels` naming three of its _own_ controls, and
`unclaimedControls` is how the dialog knows not to draw sliders for them as well:
the black point, the white point and the midtone gamma are rendered together as
`LevelsBar`, over a histogram of the very pixels the effect would land on. Three
sliders are the one shape that cannot answer the question you have in front of a
levels control — where does the picture start and where does it stop? — and on a
scan whose ink runs from tone 40 to tone 200, "black point: 40" only means
anything once the shape says so.

Counting those tones is `histogram.ts`, split on the usual line: `tally` is
arithmetic over a pixel buffer and is tested in node, and `layerTones` is the one
wrapper that needs a DOM. It paints the target layers' marks onto a small
off-screen surface (the same marks-on-nothing surface a bake uses — the sheet
under them is not what the effect lands on) and counts luminance, skipping the
transparent pixels a layer is mostly made of. It samples at 384 pixels on the
long side, because a histogram is a **shape** rather than a measurement. What it
must never do is depend on the draft: `CanvasScreen` therefore memoises it on the
drawing and the _scope_ alone, so a slider dragged end to end rasterises the page
zero further times. Where the middle handle sits is `adjust.ts`'s `gammaAt` — a
gamma is an exponent, not a distance, so the handle's travel is two geometric
runs meeting at 1 in the middle — and `autoLevels` is the same module's answer to
putting the two ends on the ends of the data.

### A dialog in front of the thing it is previewing

The effect dialog is the only one in the app whose subject is the page **behind**
it, which makes where the card sits a real question rather than a matter of
taste. There are two answers and `EffectModal` picks between them on width,
publishing the choice as `data-previewing="loose" | "full"` so `styles.css` reads
it rather than re-deriving it from a media query of its own. Reaching the card at
all goes through that marker: a framework `Modal` gives an app what goes _inside_
it and nothing else, so the dialog marks its own content and `:has()` reaches the
card through it. Every rule hanging off it is cosmetic — a browser without
`:has()` gets an ordinary centred dialog that previews exactly as well.

**Loose** is a screen with room beside the card: it drops to the foot of the
window and is **draggable** from there by its title row (`useDialogDrag`). The
offset is written as two custom properties and applied as `translate` rather than
`transform`, so it can never collide with the framework's own swipe-to-close
transform. The clamp is asymmetric on purpose — the grip _is_ the title row, so a
card whose top edge went off the top of the window is one nothing could drag
back.

**Full** is a phone, where the card is the screen and there is no aside to step
to. It goes edge to edge and carries its own window onto the page instead:
`EffectPeek`, a small canvas painting the same drawing through the same
`renderDrawing` with the same `preview` object, panned and pinched through the
canvas's own `viewport.ts` arithmetic. It is not the canvas — no cache, no trail,
no gesture — and it clips to what it shows, which is what makes repainting it
straight through the renderer affordable. It opens on what the canvas was looking
at when the dialog opened (a document point taken once, at the opening), and
falls back to framing the marks when that window would catch none of them: a
preview showing blank page looks exactly like an effect that did nothing.

### The panel is a list the user arranges, not a block of statements

The right-hand panel used to be four blocks written out in order in
`SidePanel.tsx`, which made the order the _build's_. It is the user's now: the
sections are dragged into place by their headings, switched off whole, and
thinned out one function at a time from Settings → Panel. None of that
is expressible while the order is the order statements appear in a component, so
what the panel is made of moved to `panelSections.ts` — a pure, DOM-free registry
of descriptors, in the shape the plugin registry uses one floor up.

A descriptor says what a section is (a title, a line of explanation) and what is
inside it that can be switched off one at a time: the page actions, the effects
in that group, the controls on the layer stack. Item ids are namespaced by what
they are (`page:`, `effect:`, `layers:`) because they are **persisted** — the
settings file holds the ids that are _off_ — and a bare `delete` would collide
the moment two sections both had one. Renaming one forgets a user's choice, so
don't.

Two flags on a descriptor say what a switch is not allowed to do, and both are
answered in `panelSections.ts` rather than in the page that draws the switches.
`fixed` means the thing cannot be switched off at all — the **Image** section
and **Start over** inside it, because resizing a sheet and emptying a drawing
have no other route in the app, and a stored id naming one is ignored rather
than obeyed, so an old build's setting cannot take it away either.
`offConfirmKey` means switching the section off costs the _document_ something
and has to be agreed to first: the layer stack's, because a sketchbook with no
layers panel is one whose hidden and locked layers nothing could reach, so the
switch flattens every drawing to a single unlocked background layer
(`merge.ts`'s `flattenedStack`, one commit and therefore one undo step). The
settings page knows only that the answer was yes; what "no layers" then means to
a document is the store's.

Three settings carry the arrangement, and all three are stored the way the
toolbar's are and for the same reasons. `panelOrder` holds only the ways the
order differs from the shipped one; `hiddenPanelSections` and `hiddenPanelItems`
hold what is _off_, so a section or an effect a later release adds arrives
switched on rather than hidden from every install that already has the key. All
three apply live rather than through the Settings draft (`LIVE_SETTINGS`): the
panel is the surface _behind_ the dialog, and a section you switch off should
leave it as you press the switch.

Reordering is `order.ts`, shared with the toolbar and with a canvas preset's kit.
`orderById` lays the named ids out **in place** — a section the stored order has
never heard of keeps the slot it was registered in rather than piling up at the
end — which is what stops an arrangement going stale across an upgrade. The drag
itself is the framework's `useDragDrop`, the same hook the drawings menu
reorders with, so the only domain question the panel answers is the trivial one:
a section may land on any section but itself. The handlers go on the **whole
heading**, not on the grip: the hook's touch path is a long press held still,
and a sixteen-pixel grip is not a target a finger can hold still on — the two
meanings are told apart by the gesture (a tap folds, a hold lifts, and the hook
swallows the click at the end of a real drag) rather than by the pixel. The
section's own buttons stop the press propagating, so a long press on the bin is
a press on the bin.

`SidePanel.tsx` is the shell. It renders whatever `visibleSections` hands it, in
whatever order it comes, and the one place a section is named is the line that
picks which component paints it; the sections themselves are `panel/`, one file
each, sharing a `SectionProps` shape so the panel can treat them as
interchangeable. A section that is _made of_ its items — Image, Effects, Colour —
is left out entirely once its last row is switched off, because a heading over an
empty box is not worth the room; the layer stack is the exception, and says so
(`madeOfItems`): the list of layers _is_ that section, and its items are only
what you can do to a row.

### The sheet is a material, not a backdrop

A drawing carries a **ground** — which stock the page is cut from, and how much
of its grain shows (`Ground` in `types.ts`). It is document state: it travels
with the drawing and syncs with it. Absent means the plain solid sheet, which is
the page every drawing was already on, so no migration step and no rewritten
bytes (see `migrations.ts`).

The **stock is chosen once**, in the dialog that makes the drawing
(`NewImageModal`), and is not editable afterwards — the same treatment the page
size and the page colour get, and for a stronger reason: a wet mark is composited
_into_ the sheet it was made on, so restocking a finished page would repaint every
mark on it as something the hand that drew them never saw. `Ground.texture` (the
grain weight) is still read at every paint and still travels in the file, so a
page written with one keeps it; nothing in the app writes one today.

The catalog is deliberately short — six stocks, comparable in one glance,
because the shelf is read once under a Create button. Stocks that have been
retired from it are aliased to the survivor nearest them in absorbency
(`RETIRED_GROUNDS`) rather than dropped: a stock id is persisted, so a page made
on one this build no longer offers has to keep painting on a sheet rather than
falling back to glass. The alias is read-only — the document keeps the id it was
written with, and nothing writes a retired one.

The split is the one `effects.ts` / `effectPaint.ts` uses. `ground.ts` is pure:
the catalog of stocks, the three numbers each carries (how much it drinks, the
pitch of its grain and how deep that grain is), and the rule that turns a tool's
declared `wetness` and a sheet's absorbency into what a mark does — which
compositing it lands with, how much of what is under it it lifts, and how far
its water runs. `groundPaint.ts` is the pixels: the grain, built once as a tile
and filled as a pattern anchored to the page, at device resolution and fading
out when it gets finer than a device pixel.

Two consequences are worth knowing because they are the design rather than side
effects:

- **A layer that mixes is composited as a unit.** A wet mark mixes with the
  pixels beneath it, and painted flat "beneath it" would be every lower layer as
  well — so a layer carrying wet marks on a thirsty ground is lifted onto a
  surface of its own, exactly as a layer under an effect preview is. Mixing is
  therefore scoped to a layer, and an eraser on such a layer stops at it. It is
  what makes layers the way to keep a mark out of the water.
- **The mark cache cannot absorb a wet mark onto its own pixels.** They are a
  finished picture, sheet included, so appending a mark that mixes would mix it
  with the sheet and with layers a repaint would not. So on a sheet that soaks,
  a full repaint **keeps the topmost painted layer apart as pixels** — the very
  surface it was lifted onto, plus the screen as it stood below it — and a mark
  landing on that layer is painted onto the kept surface exactly as the repaint
  would have painted it, with the screen put back together from the two halves
  (`cache.ts`). A landed wash then costs one stroke rather than the document;
  marks landing on lower layers, and every landing while an effect dialog is
  open, still cost the repaint they always did.

`wet.ts` is the one piece that is not compositing: it copies the pixels under a
wet mark, smears them outward, cuts the smear to the mark's own shape and lays
it back down before the mark goes on top. That is what makes an ink line bleed
into a wash that crosses it, and what makes the order two washes were laid in
visible in the result — a mark can only lift what was already there. It is
bounded by the mark's box, skipped past a pixel budget, and deterministic like
every other texture in the app.

Both cases are why the rule is **a layer is only lifted onto a surface when it
has something to do there** — wet marks to mix, or an effect to show. Splitting
every layer would scope erasing to a layer for drawings that asked for nothing of
the kind, and that is behaviour this app has always had.

The SVG export needs no special handling for effects, which is one of the things
baking bought: an effect is in the marks by the time anything exports, so the
recorder emits a baked layer as an `<image>` exactly as it emits a dropped
photograph. The `<filter>` primitives the old page- and layer-scoped filters
needed are gone with them.

### The marks belong to the sheet

The canvas element is a **window** onto a page that is usually smaller than it,
so there is desk around the paper — and a gesture that begins or wanders out
there is still a gesture. It used to paint on the desk: ink floating off the
sheet on screen, which then vanished from the exported file, because an export
rasterises the page and nothing else. The screen and the file disagreed about
what the drawing was, and the screen was the one that was wrong.

So every surface that paints marks holds them to the page's own rectangle first
(`onSheet` in `render.ts`): the screen, the mark cache's append, the layer
thumbnails and the export all cut at the same edge and cannot disagree. It is a
clip rather than a rule about pointers, which matters twice over — a stroke that
runs off the page is still the whole stroke in the document, so dragging it back
on brings all of it back, and a drawing made before the clip existed loses
nothing that was ever on its page.

The sheet itself is not clipped, because it is laid _under_ the marks afterwards
and is already the page's rectangle; nor is the chrome, whose whole job is to
draw where the page ends.

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
  painted. A **zoom still under the fingers carries it**: while the canvas
  declares the view mid-gesture (`CacheSpec.zooming`), a frame that differs
  only by where the view has got to is the held pixels resampled there in one
  blit, and the sharp repaint is owed — and paid — the moment the pinch lifts
  or the wheel pauses. Every carried frame resamples the last real repaint, so
  a long pinch cannot compound blur, and a document that changes mid-gesture
  repaints for real. When a rebuild is unavoidable it paints the _screen_ and copies the
  result back, because rendering into an off-screen context is no faster and
  the copy leaves the cache holding exactly what the next frame wants. It
  compares the _painted_ strokes, so hiding or reordering a layer repaints, and
  a mark landing under something already on the pixels repaints rather than
  compositing itself on top of it.
- `trail.ts` does the same thing one level in, for the one stroke that _is_
  changing: the gesture under your finger. Almost none of it changed either —
  two samples arrived and everything behind them is already on the screen — so
  a frame repaints only the patch the gesture has just grown into and leaves
  the rest standing. Without it a gesture costs its own length every frame,
  which is quadratic in how long you have been drawing: an airbrush stroke
  across a page is a few hundred full-radius gradient fills, and repainting all
  of them per sample is what made a long spray crawl. The patch is repainted
  from the document rather than composited over what was there, so it is what a
  full frame would have painted, and it is only taken where it is provably safe
  — the tool has to declare that its mark **grows from the front**
  (`PaintPlugin.grows`), and marks that rub out or soak into the sheet are
  refused whatever they declare, because both read the pixels they land on.
- `geometry.ts` gives each stroke a box, and the renderer skips the marks that
  cannot reach the window it is painting. How far past its path a painter
  spreads is the tool's to declare (`PaintPlugin.reach`) with a generous
  default, because that box is also the patch a gesture repaints — and there
  slack costs area.
- `PaintDetail` tells each painter how big its mark is coming out on the device
  it is bound for, and the textured painters drop the dabs, hairs and specks
  that would land inside a single device pixel. The medium's own numbers stay
  written as the medium — only the screen takes away — so a mark looks the same
  as you zoom into it and the PNG export (always 1:1) is unchanged. It also
  carries the **patch being painted**, so a painter built out of hundreds of
  stamps can skip the ones that cannot reach it: repainting a corner of an
  airbrush stroke costs the cones in that corner rather than all of them. The
  brush spends it the other way about, because it is one path per _hair_ rather
  than one stamp per sample and so cannot be culled a stamp at a time — it lifts
  each hair over the stretches of the drag that are off screen, which is the
  same saving one sample at a time, and it is what makes a pan across a page of
  brushwork cost the strip of paper it exposed. Also carried is
  whether the mark is **still under the hand** (`PaintDetail.live`), which is a
  budget rather than a look: a landed mark is painted once and kept, where the
  gesture in flight is repainted from its first point every pointer sample, so a
  painter expensive enough to care may spend less on the one that is charged per
  frame. One painter does (the wash simulation, below); every other ignores it.
- `washSim.ts` keeps the marks it has **dried**, with their pixels. Drying a
  wash is the most expensive thing this app does, and every full repaint used to
  ask for all of them again — which is why zooming a heavy watercolour crawled
  while painting one felt fine: a gesture blits the committed marks and simulates
  the one mark under your hand, where a pinch simulates the lot. Keeping them is
  only sound because the field is worked out on the _page_ rather than on the
  screen, so a mark is the same picture at every zoom; those two are one
  decision, and neither works without the other. The store is sized for a whole
  painting, and when a page outgrows it anyway it **holds what it has** rather
  than churning — a repaint asks for every wash in paint order, and an
  evict-the-oldest store one mark too small would forget each one moments
  before it was asked for again, turning every repaint from all blits to all
  simulations at once. Marks whose strokes are gone for good (undone and drawn
  past, or on a page since closed) are detected by holding each mark's path
  through a `WeakRef` — the store matches paths by identity, so a collected
  path is a mark no repaint can ever name — and swept out when a new mark
  wants the room. The calligraphy pen (`quillStore.ts`) and the pencil
  (`leadStore.ts`) keep the same shelf with the same rules, with one honest
  difference at the pencil: its field is worked at the _device's_ pitch rather
  than the page's, so the cell is part of the ask and a zoom that settles
  somewhere new dries every pencil mark again — once, where it used to be once
  per frame.
- `rubber.ts` holds the one gesture that is repainted **twice** per pointer
  sample — a rubbing out is painted once as the hole and once as the relay's
  mask (`relay.ts`) — as a live walk rather than a drag re-run from its first
  press: a press whose weight can no longer change is laid once into a held
  union of lanes per weight, each frame lays only the tail the end can still
  lighten, and the three unions are blitted through whichever compositing the
  caller has in force. A frame of scrubbing then costs the presses that
  arrived rather than the presses that ever were, which is what made a long
  scrub quadratic in its own length.

The cache holds no state the document doesn't: every path into it goes through
`renderDrawing`, and where there is no DOM to build it in the canvas paints the
document directly, exactly as it did before the cache existed.

The one place a frame is not the frame a plain render would produce is mid-drag,
and it is a deliberate trade: a canvas rasteriser is not translation-invariant,
so marks carried along by a scroll keep the antialiasing fringes they were first
drawn with. The difference is bounded, does not compound, and heals once the
drag has moved a window's width.

### The panels' little pictures are painted once, and early

The controls show pictures rather than words wherever the answer _is_ a picture:
a press with the tool in your hand on each width and each shipped preset
(`toolbar/PressPreview.tsx`), a swatch per paper stock (`GroundPicker.tsx`), a
sheet painted by each wash engine (`toolbar/ToolOptions.tsx`). Every one of them
is a real render through `render.ts` — which is the point, and is why they are
not cheap: the size panel of the watercolour brush is eleven of them, one a
whole sheet of simulated pigment, and painting the set in the effect flush that
follows the press froze the thread for a third of a second.

`tiles.ts` is the answer, and it is three rules rather than a faster renderer:

- **Painted once.** A tile is a function of its key and nothing else, so the
  pixels are kept for the life of the tab and shown again with a blit. The key
  carries `rendererKey()` — how finely the wash and graphite simulations are set
  to resolve — because the renderer reads those as globals, so two tiles painted
  either side of a change are two different pictures under the same props.
- **One per frame.** Jobs go through a single shared queue taken a job at a
  time, so a panel paints and stays interactive while its pictures fill in
  rather than sitting frozen behind them. A job whose answer is no longer wanted
  is pulled back out by the effect that queued it.
- **Warm before it is asked for.** `SizePicker` warms its own tiles at idle
  while it is _closed_, from the very props it would render; `App.tsx` warms the
  new-image shelf the same way. The first tile ever painted is dearer than every
  one after it — the painters compile and the grain tiles are built on that run
  — so warming pays even where the pixels are cheap.

Nothing here is a second rendering path: a tile that is not in the cache is
painted exactly as it was before, and a queue that never ran would only make the
panel slow again.

## The canvas is a window

A page is whatever size it was created at — the new-image dialog asks, and
defaults to the screen's own resolution. The rules behind that question (the
four presets, what "this screen" resolves to, and the one scale all four are
_drawn_ at so they can be compared as rectangles) live in `canvasSize.ts`, pure
and node-testable; `NewImageModal.tsx` is only the dialog around them, and the
size reaches the document as the `init` patch `addDrawing` already took — along
with the page's colour and its sheet, which the same dialog collects as one
`PageMakeup` because all three are answers to what the page _is_.

A page can also be made on a **canvas preset** — a named page the user set up in
Settings → Canvas: a size, optionally a kit of tools, and optionally the sheet it
is usually on (`canvasPresets.ts`, pure and node-testable). Two halves of it are
worth separating:

- **The size and the sheet are answers, not rules.** They land in the same
  `PageMakeup` every other answer does, and after Create nothing distinguishes a
  page made on a preset from one typed by hand.
- **The kit is read for as long as the drawing exists.** The preset's id is
  written onto the drawing (`Drawing.canvasPreset`), and `App` resolves the
  toolbar through `toolbarFor` before handing the screen its settings — with
  `enabledPlugins` and `toolOrder` swapped for the preset's. So the toolbar, the
  keyboard shortcuts and the active-tool fallback all resolve through exactly the
  code they always did, and nothing below `App` knows a canvas preset exists.
  A kit is the same pair of lists the app-wide toolbar is, which is why one
  `toolbarEntries` call answers for both, and why Settings → Canvas and Settings
  → Tools render the same row (`settings/toolRow.tsx`).
- **How those tools are _set_ is applied once, when the page opens.** A kit also
  carries which member of a family each of its buttons stands for
  (`CanvasKit.groupTools`) and how a tool is set up (`CanvasKit.toolSettings`, a
  `PresetSettings` per tool — the very thing a preset chip applies). `withKit`
  puts both in force, and `App` calls it in an effect keyed on _which drawing is
  open_. It is a write rather than a projection, and the split is deliberate:
  nothing can change which buttons a toolbar has while you draw, but a width and
  a dial are one press away, so a kit that kept overriding them would be a panel
  whose sliders sprang back. Opening a sketchbook page presses its preset chips
  for you and then gets out of the way. The editor for it
  (`settings/kitTool.tsx`) is reached from a row's glyph and renders the same
  `WidthPicker`, `ShippedPresets`, `SavedPresets` and `ToolDials` the panel over
  the canvas does — one control per decision, wherever the decision is made.

An id naming a preset that has since been deleted falls back to the app-wide
toolbar; the page itself is untouched, because its size was baked in when it was
made. The field is additive and needs no migration step, for the same reason the
ground did.

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

The **nib outline** a mouse or a stylus wears (`PointerRing.tsx`) is deliberately
not part of a frame. It is one absolutely-positioned element moved by
`transform`, so following the pointer costs the compositor a move rather than
costing the canvas a full repaint per sample — a mouse reports as fast as a
stylus, and the drawing has not changed. Its diameter is the tool's width through
the view transform (so it says how much _page_ the nib covers at any zoom), and
whether it appears at all is `usesSize` on the descriptor.

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
which opens the drawer itself, armed whenever the drawer is the menu and the
pointer is `coarse` — there is no setting, because a gesture a mouse can't fire
costs a mouse nothing) and the layers panel (the app's, fired back through a
callback). The canvas arbitrates by **holding** a touch that lands in a
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
- `options.ts` — `dials.ts`'s sibling for the settings that are **not** about
  the next mark: an option (`PaintPlugin.options`) says how marks of a tool's
  kind are _painted_, for every drawing, so it is nowhere on a stroke and lives
  in the app settings under its own id — an option _is_ a setting, declared by
  the tool it is about. It resolves the same two ways a dial does (every option
  for the panel; each pulled back onto its own control), and an option can
  depend on another, which is how a setting belonging to one answer stays hidden
  while a different answer is picked — a seam no shipped tool uses today, kept
  because it belongs to the plugin interface rather than to whichever tool last
  needed it. `washOptions.ts` and `leadOptions.ts` are the whole set today, one
  slider each: how finely the pigment and the graphite simulations resolve. Both
  files used to hold an engine picker above that slider, with a painted swatch
  per answer; the app ships one watercolour and one pencil now, so there is
  nothing to choose between.
- `presets.ts` — the settings a tool _ships_ with (`builtin/presets.ts` for the
  set): a width and the dials that make its medium's must-haves, declared as
  only what each one moves and resolved here into a whole tool, so applying one
  puts the dials it says nothing about back where they rest.
- `controls.ts` — which button the toolbar puts beside the ink for the tool in
  hand: its width, a cog holding just its own settings (a `sizeless` tool — the
  bucket, the gradient — or one that leaves no mark and still has something to
  set, like the dropper's sample size), or nothing at all (a tool with neither).
  One place, read entirely off descriptor flags — including whether the ink
  button means anything at all, which a tool mixing its own inks answers no to.
- `swatches.ts` — `dials.ts` for colours: the inks a tool carries of its own
  (`PaintPlugin.swatches`), resolved for the panel and pared back to what
  differs from the tool's own defaults for the canvas and the mark.
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
  their own: the hand, the dropper, and the two fills — the bucket and the
  gradient, which file the area the probe traced for them.
- `brushes.ts` — the characterful painters: spray cones, soft nibs, chisel felt
  tips, feathered fills.
- `builtin/text.ts` — the one tool whose mark is typed rather than drawn. Its
  press opens a caret (`entersText`, read by the canvas) and `TextEntry.tsx`
  collects the words into a text stroke; the module also owns the typefaces, the
  font shorthand every surface sets type with, and the measurement the export
  crop and the repaint's culling both ask for.
- `bristleField.ts` / `bristleHead.ts` / `bristlePrint.ts` / `bristleWalk.ts` /
  `bristleSim.ts` / `bristleStore.ts` — the paintbrush the app actually paints
  with: the quill's architecture at a third thickness of medium. The field
  knows about paint and paper and nothing else — a film per cell over the
  _same_ sheet the pencil presses into (`sheetDip`), taken fully by a wet head
  and only on the high ground by a starving one, settling gently into a
  textured stock's dips so a canvas weave prints through the slab. The head is
  what is on the end of the handle and how hard it is bearing: a bundle
  squeezed anywhere between a round and a blade (the flatness dial and the
  angle it is held at, worked out per touch as the head's footprint against
  the way the hand is going: how wide a band it lays, and how far a blade held
  obliquely stands its leading corner off the path — which is what cuts the
  two ends of the mark at the blade's own angle instead of square across the
  direction of travel), spread further out of that ferrule the harder the hand
  bears on it — the pressure dial, which is the one input here that is not the
  implement and the one a stylus will one day move per sample, so it lives in
  the head's own footprint rather than in a branch above it, and takes the
  bundle out of its own shape as well as out of its collar — a comb of hairs
  that wander and
  give out — the partings — bearing across the mark like the cone it is or
  square like a chisel, and opening onto the sheet as the hand sweeps it down.
  The print is what a walk of cross-sections cannot say: the two ends of a
  mark, which look nothing like each other — a touch-down that opens from part
  of the bundle rather than stamping a disc, and a lift that frays into the
  bent-back hairs it was dragging. The walk drags all that along a path and
  spends a finite dip as it goes: cover, streak, scumble, trail, gone, sooner
  on a sheet that drinks. A landed mark is simulated once and kept as pixels
  in the store; the gesture under the hand is walked incrementally (settled
  prefix, provisional tail, an undo log per frame) and _promoted_ into the
  store at the lift; and everything the field cannot show falls through to the
  vector painter below.
- `bristle.ts` — the vector-hair painter that used to be the whole tool, kept
  as the simulation's fall-through: it still draws every mark too small for a
  field (and every mark on a browser with no canvas to simulate into), so it
  is still read to. It models the head being **dragged across paper**; what
  the head _is_ lives beside it in `head.ts` — how the bundle breaks into
  strands, how much paint it holds (the same charge the simulation spends),
  and how a mark exactly as wide as the head is fitted across the strands. A
  drag has two phases and they are two modules: `bristle.ts` paints the
  charge, and `residue.ts` paints the **film** left on the hairs after it.
  What both need of a single hair is `strand.ts`, so the trail is the same
  head that laid the paint down rather than a second brush drawn over the
  first.
- `aquarelle.ts` — watercolour, which is the one medium here where what is
  being painted with is _water_: the wash runs past the hair that laid it, its
  two edges wander independently, the rim dries darkest as the pool evaporates,
  the pigment granulates into the sheet, and every pass is thin because nothing
  in the medium covers. This is the **stroke** model: a wash is a closed path
  with a dried rim, a gathered inner ribbon and a mottle hashed off the page. It
  was one of two engines the app offered and is no longer chosen by anyone — it
  survives only as the floor the simulation falls through to.
- `washField.ts` / `washSim.ts` — the watercolour the app actually paints with.
  Nothing in it knows what a
  stroke is: there is a grid of paper cells with water in them and pigment in
  the water, the brush charges the cells it passes over, the field is stepped
  until the sheet is dry, and the mark is whatever settled. The rim, the
  granulation, the fraying wet edge and the blooms where a wet brush meets a
  drying wash all fall out of that rather than being drawn. `washField.ts` is
  the simulation and is pure — no canvas, no colour; `washSim.ts` drives it from
  a gesture and turns the pigment it settled into pixels, subtractively
  (`colour ^ density`, so glazing deepens towards the colour rather than
  towards grey). The grid is pitched in **document pixels** — a cell per pixel of
  the page at full detail, which is as fine as the mark has anywhere to land —
  and never in screen ones, so a wash is the same picture at every zoom and its
  pixels can be kept rather than re-dried by every pan and pinch. Past a cell
  budget the grid coarsens and the image is drawn up to the page instead, which
  is why a sweep across a whole page still softens where a stroke the size of a
  hand does not: at a cell per pixel that mark is millions of cells and a dozen
  seconds, and no budget simulates it honestly. The field is stepped inside a box
  drawn round the water rather than over the whole grid, so a mark costs its own
  wet area and not its bounding box.
- `wash.ts` — how much of the simulation's field to run, and the fall-through
  under it. The detail is a **view**, never recorded on a stroke or on a
  drawing: it is an app-wide value put in force once, and it also travels on the
  render options so the mark cache can see it change. It is the one setting in
  the app that buys nothing but speed — the field's cells widen as it comes
  down, and an ordinary mark costs the square of it. The simulation can always
  answer "not me" — no canvas to simulate on, a mark too small to be worth a
  field, a page-wide sweep whose cells would be wider than the brush — and
  `aquarelle.ts` paints the mark instead, so a browser that cannot run it still
  opens every drawing. That fall-through is all that is left of the second
  watercolour this app used to offer: it is what a mark too small to dry looks
  like, not an engine anyone picks.
- `crayon.ts` — the wax. The crayon is a **sheet** model now, the pencil's
  arrangement one shelf along: `waxSim.ts` drags a stick's face over the same
  paper the lead reads (`sheetDip`), `waxField.ts` owns what one touch leaves —
  the crumbs catching in clumps that smear with the drag, the valleys filling
  under a second pass, the burnish a cell cannot go past — and `waxStore.ts` is
  its dried-mark shelf. The `soft` dial picks the stick, china marker to oil
  pastel, the way the pencil's grade picks the lead. What is left in
  `crayon.ts` is the seam and the old geometric grain painter under it, kept as
  the **fallback** for marks no field can run — a hairline at a far zoom, a
  face finer than a couple of cells, a browser with no canvas.
- `graphite.ts` — the **stroke** model of a pencil, which is the crayon's near
  neighbour and deliberately not the same painter: graphite chips off where it
  lands instead of smearing, finds a finer tooth than a blunt wax face does, and
  is a _colour_ rather than an ink — the tool mixes its own grey out of the lead
  and the page rather than taking the one the toolbar is holding, which is what
  `fixedInk` on the descriptor says to the toolbar. Like `aquarelle.ts` it was
  one of two engines the app offered and is no longer chosen by anyone; it
  survives as the floor `leadSim.ts` falls through to, and `graphiteInk` is still
  where the lead's grey comes from for every pencil mark.
- `leadField.ts` / `leadSim.ts` — the pencil the app actually draws with, and
  `washField.ts` / `washSim.ts`'s twin one shelf along. Nothing in it knows what
  a stroke is: there is a sheet with a tooth on it and a lead being pressed into
  it, and the mark is whatever the paper kept — the broken line on rough stock,
  the crowns of a canvas weave, the valleys filling in under a second pass, and
  the black a pencil cannot go past. It reads the ground the page is cut from
  (`ground.ts`) rather than a fine tooth of its own, which is the whole
  difference from the painter above: a pencil line on hot-pressed paper and one
  on rough are two different drawings. `leadField.ts` is pure; `leadSim.ts`
  drives it from a gesture and turns what the sheet kept into pixels.
- `lead.ts` — how finely that field is worked out, and the fall-through under
  it. `wash.ts`'s twin in every respect: a **view**, app-wide, never recorded on
  a stroke, carried on the render options so the mark cache can see it move, and
  a simulation that can always answer "not me" — no canvas, a mark pulled back to
  a hairline, a lead finer than a couple of cells — so `graphite.ts` draws the
  mark instead and no drawing ever fails to open.
- `chalkField.ts` / `chalkSim.ts` / `chalkStore.ts` / `chalk.ts` — the board
  chalk, on the lead's whole arrangement one shelf along: a field that knows
  chalk dust and the sheet and nothing about gestures, a sim that walks one
  over it, a dried-mark store keyed the lead's way (device pitch and all), and
  the seam whose fall-through is a plain path paled by the hand that drew it.
  It reads the **same** `sheetDip` the pencil reads, so a chalk line and a
  pencil line agree about where the page stands high — and everything that
  makes it chalk rather than graphite is its own: a soft stick that covers in
  one pass yet never closes into solid colour (the grip's wide spread keeps
  the dark pinholes open), the streak lanes a worn face ploughs down a broad
  drag, and the sparse dust that falls just past the edge.
- `rubber.ts` — the rubber, and the only painter here whose alpha is spent
  taking something off. It reads `graphite.ts`'s own lattice rather than one of
  its own — that is the point of it: a rubber lifts from the peaks a lead
  reached and bridges the dips it never got into, so what survives a rubbing out
  is graphite in tooth the face could not reach. Nothing it does reaches 1, so a
  passage fades under the hand and is never quite gone.
- `grain.ts` — the hashes every one of them scatters with, the smoothstep and
  the path length they size their grain by, the even walk along a path they lay
  texture down on, and the floor below which a detail is too small to draw.

All of them are pure functions of the stroke, with every scatter hashed off
position rather than drawn at random, so a repaint and the PNG export grain
identically.

A tool that needs the app to treat it differently says so on its descriptor —
`erases` for the eraser, `navigates` for the hand, `picksColor` for the
dropper, `selects` for the selection family, `fixedInk` for the pencil — so the
canvas and the toolbar read a property instead of learning a name.

`lifts` and `liftable` are that seam carrying a whole feature. A canvas gives up
pixels one way only, so the **rubber** takes off everything it covers exactly as
the eraser does; what makes it a rubber is that the renderer then lays the marks
it could never have lifted straight back over the hole (`relayFixed` in
`relay.ts`). The mask they come back through is the erasing lanes painted the
ordinary way round, which is _to the pixel_ the fraction that went, so opaque
ink returns at the strength it had. The two flags are the whole of the tool
knowledge involved: `lifts` on the rubber, `liftable` on the media that sit
loose — graphite and the chalk: wax smears under a rubber rather than lifting,
so a crayon mark stays put with the ink. What it costs is stacking order inside the rubbed patch — the
ink goes back on top rather than back into its place in the stack — and the
pixels that pays for are pixels being rubbed away anyway.

The flags are also what the pass is _scoped_ by. A rubbing out can only change
the picture where its reach crosses liftable ink (`liftBounds`), so the canvas
holds the live erase-and-relay to that patch and skips both where there is
none; and while a gesture is under the hand, the committed ink it is cut from
is painted once onto a held surface and reused frame to frame instead of being
re-rendered — re-simulated, for a wash — on every pointer sample.

`picksColor` carries one obligation past the flag, for the reason `selects`
does: the behaviour answers `pick(p, ctx)` with the colour that press read off
the page. How much page a press covers is the tool's own setting — the dropper's
sample size is a dial, and a canvas that applied it would have to know that
dial's name.

`selects` carries one extra obligation past the flag: the behaviour answers
`selection(draft)` with the **closed contours** its gesture chose, in document
coordinates. That is the only currency the screen deals in, which is what lets a
box marquee, an oval, a freehand lasso and an outline traced off the page itself
all be selections without the canvas, the store or the renderer learning a shape
(see `selection.ts`).

`group` is the flag that changes how a tool is _offered_ rather than how it
behaves. The eleven shapes each stay their own plugin — their own painter, their
own remembered width, their own persisted id, so nothing already drawn is
orphaned — and share one toolbar button and one switch; the four selection tools
are grouped the same way, under the id the lone marquee used to hold, so a
settings blob written before the family existed still names their button — and
so are the two fills, under the bucket's id, and the two ways of rubbing out,
under the eraser's. That last one is the pattern doing the most work for the
least: the rubber ships behind a button every user already has, rather than
costing the toolbar a permanent one or hiding in a settings list nobody would
know to search. The button wears the
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

`presets` is that same object declared from the other end — by the _tool_ rather
than by the user. A medium is used at a handful of settings ("wet-in-wet", "2H
construction line", "one-stroke") and four sliders is a tool a beginner cannot
build, so a plugin declares those and the panel offers them above the saved row.
Both kinds meet at one type (`PresetSettings`), so matching a chip against the
tool in hand and applying one are written once and never ask which they were
handed. A tool whose must-haves come to a single setting declares none and puts
that setting in its `defaultSize` and dial defaults instead.

`dials` is that pattern carrying a whole surface. Width is the control most
tools share; past it they stop agreeing, so a tool lists what _it_ has to tune
(the paintbrush's flatness and the hand bearing on it, the watercolour brush's
water, the bucket's feather) and the panel renders the list under an **Advanced** heading without
learning a single dial's name. The numbers are fractions of the tool's own normal, kept per tool in
the settings blob, and **only the ones moved off their default** are handed to a
behaviour or written onto a mark — so a painter can keep its rest value as an
ordinary default argument, and a page drawn without touching one serialises
byte-for-byte the way it did before dials existed.

`swatches` is `dials` again, for colour rather than for number. A tool that
pours ink of its own — the gradient's two ends and its optional middle — declares
them, and the panel grows a swatch row, the settings blob keeps a colour per tool
per swatch (sparsely, like the dials), the toolbar dims its ink button, and the
mark records the ramp it was poured with. Nothing outside
`plugins/builtin/gradient.ts` knows a swatch by name.

`sizeless` and `sizePreview` are the same seam pointed at the _button_ rather
than at the panel. The bucket has no nib and an erasing mark is a hole, and
both used to be handled by the toolbar knowing which tool it was holding — a
dimmed size button for one, a fabricated blot of ink under the other's press for
the other. Now each says what it is on its descriptor and `controls.ts` answers
in one place, so the tool that lands next year gets the right button without
this file changing. `sizePreview: "life"` is the third answer and the type
tool's: draw the sample at the size it will land at rather than fitted to the
row, and let the button clip it — which is now what the size button and the
width row do for _every_ tool (`PressTile.fit`), the tool-level flag remaining
only to say that type is hung from its baseline corner rather than centred.

`hidden` is the same idea taken to its end: the dropped image's painter is a
plugin with no button anywhere and no gesture at all. An image arrives as a file,
but the mark it becomes still names a plugin, so the renderer can paint it
without any screen learning that "image" means something. `toolPlugins()` is the
list everything user-facing reads; `allPlugins()` keeps the hidden one so a
stroke never loses its painter.

Some tools need to know what is _painted_ rather than what was drawn. They ask
through `ToolContext.probe`, a narrow read of the page (`probe.ts`) that
rasterises the drawing off-screen through the same renderer, once per press. The
fills flood that snapshot and trace the outline of what they flooded
(`flood.ts` — pure, and tested on hand-built images with no canvas), then file
the outline as an ordinary `region` stroke: the pixels never reach the document,
so a fill zooms, undoes and syncs like any other mark. The gradient files the
same stroke with a `Gradient` on it — the run across the page and the colours
along it, which is geometry as much as ink and so travels with the mark when it
is moved, scaled or turned. The dropper reads the same snapshot for a colour,
averaged over the disc its sample size asks for.

`render.ts` dispatches each stroke to the plugin named in `stroke.tool`, falling
back to a generic painter when the plugin is unknown — a document from a newer
build still renders. Enabling and disabling a tool changes the _toolbar_, never
the document.

## Selections

A selection is an **area of the page**, and it is **not document state**. Where
the window is, is not saved, not synced and not undoable: `CanvasScreen` holds
one `Selection` — the contours a gesture chose, plus the box its corner grips
hang off — and drops it when another drawing opens.

It picks no marks out. What it does is decide where the next edit lands, and
there are three of those, all on the **layer being drawn on** and none on any
other (`selection.ts`, all pure and node-tested):

- **paint** — a mark made inside the window records the outline it was cut to
  and paints inside it forever after;
- **move** — the hand carries what is painted under the window, cutting every
  mark the outline crosses in two;
- **erase** — Delete, the menu, or a tap with the rubber takes what is inside
  it off.

The mechanism behind all three is one optional field on a stroke: `clip`, a list
of **masks** — closed contours in document coordinates, read with the even-odd
rule and intersected (`types.ts`'s `Mask`). `render.ts` clips to them before it
paints a mark, `bounds.ts` and `geometry.ts` measure a mark by them as well as by
its ink, `transform.ts` carries them through a page turn, `selection.ts` moves
them with the mark, and `svg.ts` records them as a `<clipPath>` so an exported
file is cut the same way the screen is.

**Nothing about a selection rasterises anything.** A cut mark is still the whole
stroke it always was — moving a window over a pencil line twice leaves a pencil
line, not a photograph of one, and one undo puts the single mark back. A window
is expressed as geometry because the document is geometry; the alternative,
lifting the pixels into a bitmap, would have made the first selection the moment
a drawing stopped being vector.

Two halves of the drag are painted by the canvas rather than said by the
document. A hand drag on a window shows the marks it holds at the offset the
finger has reached, and what the outline crossed cut to everywhere else, with the
originals left out of the page underneath (`RenderOptions.omit`, a set the canvas
keeps for the length of the drag so the mark cache can compare it by identity).
It lands as **one** edit when the finger lifts — one drag, one undo step, and no
per-frame writes to the store.

The screen holds the window through `useSelection.ts` — the state, the three
edits, and the keys that reach them, in one module rather than spread through a
screen that is already long. The canvas holds the other side of the seam the
same way: `useCanvasView.ts` owns the window onto the page (the measured size,
the clamp, the fit tokens, the wheel and a zoom's settle frame), leaving the
component to decide what a _press_ means.

The chrome is split by what it is. The outline is painted on the canvas with the
same marching ants the gesture was dragged with (`frame.ts`), so it is sharp at
any zoom; the corner grips are elements over it (`SelectionFrame.tsx`), because a
grip is a control and as an element it gets hit-testing and a cursor for free.
The **pixel grid** (`pixelGrid.ts`) is chrome too, and for the same reason the
outline is: it is painted after the mark cache has taken its copy of the screen,
so it can never be baked into a cached frame and can never reach an export. It
rules the document's own lattice — one cell per document pixel, the square a PNG
export resolves to a colour — and it is the one piece of the frame painted in
**device** pixels rather than document ones, because a boundary at a fractional
device coordinate would be antialiased into two half-lit columns instead of one
sharp line. Whether it is drawn at all is arithmetic on the zoom: nothing below
eight device pixels to the document pixel (where a one-pixel line would tint the
sheet rather than rule it), fading in to full strength at ten — 800% and 1000%
on the readout, which counts the same device pixels (`nativeScale`). That band
is why `MAX_SCALE` is sixteen rather than eight: at eight, a screen that is not
retina topped out at 800% and could never reach the grid at all.
The layer holding them is transparent to the pointer everywhere but on the grips,
so painting inside the window still reaches the canvas. While an edge is being
placed, a round magnifier floats beside it and repaints that part of the page at
300% (`loupe.ts`) — from the document, at its own scale, rather than by blowing
up the frame.

Copied marks travel on the _system_ clipboard, as text behind a marker
(`strokeClipboard.ts`), which is what makes copy-here-paste-there work across
tabs and reloads. Reading it back validates every field — the window included, so
a copy of half a mark pastes as half a mark. `clipboard.ts` classifies a paste —
marks, a picture, or words — and each lands in the surface that already exists
for it: the store, the image placement frame, or the caption box.

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

| State                 | Owner             | Persisted as                                        |
| --------------------- | ----------------- | --------------------------------------------------- |
| Drawings              | `usePaintStore`   | IndexedDB `paint:doc[:<ns>]` (JSON, versioned)      |
| Undo / redo history   | `usePaintStore`   | in memory only                                      |
| App settings          | `useAppSettings`  | `paint:settings`, plus `settings.json` on a backend |
| Namespaces            | `useNamespaces`   | `paint:namespaces` + `:active`                      |
| Theme appearance      | `App` + framework | the framework's own key                             |
| Sync backend / tokens | `useSyncEngine`   | `paint:sync:*`                                      |
| Language              | framework i18n    | `paint:language`                                    |

Everything but the drawings is a localStorage key. The drawings are not, and
that is the one interesting row.

Four of those settings are **published** as well as stored: the page colour, the
ink, the tool and the preset a fresh start is made of (`defaults.ts`). They are
read by the renderer, the export path, the swatch shelves and the thumbnail
tiles — every surface that has to resolve a page with no colour of its own or a
mark with no ink of its own — so `App.tsx` writes them to a module-level value
once per render rather than threading a settings object through a dozen pure
functions, the same way the wash and lead simulations take their detail.
Nothing else writes them; `kit.ts` is where they are put back in your hand.

The document carries a **version** only on the bytes at rest; the in-memory
model is version-free, and `migrations.ts` runs stored bytes forward on read.
The same bytes travel to a sync backend, so a document written by an older build
upgrades wherever it comes back from.

### The drawings are in IndexedDB; the store is still synchronous

localStorage was the right home while a document was pure geometry — a page of
strokes is a few kilobytes, and a synchronous `getItem` is the simplest possible
boot. Dropped pictures ended that. A photo is inlined as a `data:` URL, base64
is a third bigger than the bytes it carries, and the **whole origin** gets about
5 MB of localStorage — shared between every namespace, every quarantined copy
and every cloud cache. Two photos and a sketchbook is over.

So the working copy lives in IndexedDB ([`docDb.ts`](../src/app/docDb.ts)),
whose quota is a share of free disk rather than a fixed 5 MB. It is also the one
large-storage API Safari and Firefox both implement, so the headroom is not
Chromium-only — unlike the picked folder, which is.

What did **not** change is `usePaintStore`, which reads the document during
render and undoes by popping an array. Making that async to reach a database
would be a rewrite of the store for no user-visible gain. Instead `docDb.ts` is
a synchronous in-memory cache with a database tail, and `DocBackend` splits the
read in two:

- `peek` answers from the cache, immediately, or `null` for "not read yet".
- `hydrate` fills the cache. [`main.tsx`](../src/main.tsx) awaits it for the
  namespace the app opens on, _before_ the first render, so the canvas paints
  the real document rather than a blank page that fills in a frame later.
- `save` updates the cache synchronously and schedules the write, coalescing a
  burst of strokes into one transaction.

The distinction that carries the safety is "not read yet" (`undefined`) versus
"empty" (`null`). Collapse them and a starter document gets persisted over a
sketchbook that simply hadn't loaded — which is why an edit also marks the state
authoritative, so a read that lands a moment later can't undo the mark you just
made.

An install upgrading from the localStorage era migrates on first read, once, and
the old key is freed **only after** the IndexedDB write is confirmed: a
migration interrupted by a refused write leaves the document exactly where the
previous build will still find it.

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
