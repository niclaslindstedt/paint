# Tools are plugins

Every tool in the app — the pencil included — is a plugin: a descriptor with an
id, a label, an icon, and a behaviour that turns pointer gestures into strokes
and paints them. The app core knows nothing about pencils or rectangles; it
renders whatever the registry hands it.

There are two kinds, and the only difference is how they are switched on:

| Kind         | Where it lives                   | Availability               |
| ------------ | -------------------------------- | -------------------------- |
| **Core**     | `core: true` in its registration | Always in the toolbar      |
| **Optional** | everything else                  | Listed in Settings → Tools |

Core today: pencil, eraser, line, rectangle, ellipse, and the hand. Optional:
arrow, marker, highlighter — off out of the box, so a first run is a handful of
buttons rather than a wall of them.

The **hand** is the odd one: it draws nothing. Its descriptor carries
`navigates: true`, and that flag — not its id — is what tells the canvas a press
should pan the page rather than start a stroke, and what dims the ink it would
never use. That is the pattern for any tool that needs the app to treat it
differently: a property on the descriptor, so nothing outside `plugins/` has to
know a tool by name.

`supportsFill` works the same way. A tool that sets it wears a folded corner in
the toolbar and opens a fill picker when you press its button a second time —
two glyphs, its own icon drawn hollow and drawn solid, and no words. That second
glyph is the descriptor's own `icon` asked for `filled`, so a new fillable tool
gets the picker by drawing itself solid, with nothing to add to the toolbar.

## Switching one on

Settings → Tools lists every optional tool with a one-line description and a
toggle. Switching one on adds it to the toolbar straight away — the tab applies
live rather than waiting for Save, because a tool you just enabled should be
there when you close the dialog.

Switching one **off** only hides the tool. Marks you already drew with it stay
on the page and keep rendering: a stroke names the tool that drew it, and the
renderer looks that up in the _registry_, not in the enabled set. (A stroke
whose tool this build doesn't ship at all still renders, through a generic
painter keyed off the shape.)

## Adding a tool

Three steps, none of which touch the canvas, the store, or the toolbar:

1. Write a `ToolBehaviour` — `start` / `move` / optional `end`, plus `paint`.
   The freehand and shape families in `src/app/plugins/builtin/` are factories,
   so most tools are a few lines of ink configuration.
2. Register it in `registerBuiltinPlugins()` with an id, an icon, and its two
   catalog keys.
3. Add those two strings to `src/app/i18n/en.ts` (and `sv.ts`).

Externally-loaded plugins are not implemented yet. When they land they register
through this same interface rather than a second, parallel one — which is the
reason the built-in tools go through it today.
