# Tools are plugins

Every tool in the app — the pencil included — is a plugin: a descriptor with an
id, a label, an icon, and a behaviour that turns pointer gestures into strokes
and paints them. The app core knows nothing about pencils or rectangles; it
renders whatever the registry hands it.

There are three kinds, and the only difference is how they are switched on:

| Kind           | Where it lives                   | Availability                        |
| -------------- | -------------------------------- | ----------------------------------- |
| **Core**       | `core: true` in its registration | Always in the toolbar, no switch    |
| **Default on** | `defaultOn: true`                | In the toolbar until you switch off |
| **Optional**   | everything else                  | Off until you switch it on          |

Core is the irreducible three — pencil, eraser, hand. On out of the box:
paintbrush, airbrush, paint bucket, colour dropper. Waiting in Settings → Tools:
marker, highlighter, crayon, calligraphy pen, neon pen, line, arrow, rectangle,
ellipse.

Registration order is toolbar order, and it is deliberate: the **hand** at the
far left, where the tool that moves the page rather than marking it is out of
the way, and the **eraser** at the far right, opposite it, because it is the one
you reach for by feel. Everything that draws lives between them.

## Brushes are their medium

A tool that differs from the pencil only in `lineWidth` is not a tool. The
painters in `src/app/plugins/brushes.ts` model what the mark is _made of_:

- the **paintbrush** is a head of separate hairs — a low-alpha body with 5–16
  bristles dragged through it, each with its own load and its own dry patches,
  tapering at both ends and thinning where your hand moved fast (which the
  stroke knows for free: the canvas samples every 1.5 document pixels at the
  slowest, so the gaps between stored points are how quickly you crossed them);
- the **airbrush** is a spray cone — a radial gradient stamped along the path at
  a fraction of its own radius, faint enough that coverage comes from _overlap_,
  so passing twice really is twice the paint, with a sparse grain over the top;
- the **crayon** skips over the tooth of the page, the **calligraphy pen** is a
  flat nib held at an angle, the **neon pen** is a bright core inside its halo.

All of it is a pure function of the stored stroke: the scatter is hashed off
position rather than drawn at random, so a repaint, an undo and the PNG export
produce identical grain instead of a mark that shimmers when you pan.

## Flags, not names

The **hand** draws nothing. Its descriptor carries `navigates: true`, and that
flag — not its id — is what tells the canvas a press should pan the page rather
than start a stroke, and what dims the ink it would never use. The **dropper**
works the same way through `picksColor`, and the soft brushes advertise
`supportsHardness` so the size picker knows whether to offer the dial. That is
the pattern for any tool that needs the app to treat it differently: a property
on the descriptor, so nothing outside `plugins/` has to know a tool by name.

`supportsFill` is the same idea. A tool that sets it wears a folded corner in
the toolbar and opens a fill picker when you press its button a second time —
two glyphs, its own icon drawn hollow and drawn solid, and no words. That second
glyph is the descriptor's own `icon` asked for `filled`, so a new fillable tool
gets the picker by drawing itself solid, with nothing to add to the toolbar.

## The bucket and the dropper read the page

Two tools need to know what is actually painted, not what was drawn — the
dropper wants the colour under your finger, the bucket wants the shape of the
area under it, and a stroke list can't answer either after twenty passes of a
translucent highlighter. So the canvas hands them a narrow window onto its own
raster (`ToolContext.probe`), taken once per press from the same renderer the
screen and the PNG export use.

The bucket then throws the pixels away. It floods the snapshot, traces the
outline of what it flooded, and files _that_ as an ordinary vector stroke — so a
fill scales, undoes, exports and syncs like a rectangle does, and holds a clean
edge at eight hundred percent. An island of marks inside the flooded area comes
back as a loop of its own and stays unpainted, because the fill is painted with
the even-odd rule.

## Switching one on

Settings → Tools is a rack: every tool wears the glyph it has in the toolbar,
with its name, shortcut, one line of description, and an on/off switch on the
right. The always-on three carry a switch too — shown on and locked, because a
row that simply omitted it would read as a rendering fault next to the others.

Switching one on adds it to the toolbar straight away — the tab applies live
rather than waiting for Save, because a tool you just enabled should be there
when you close the dialog. A release that ships a new default-on tool folds it
into your list once; after that the list is yours, and a tool you switched off
stays off through every later upgrade.

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
   catalog keys — plus `core` or `defaultOn` if it should be in the toolbar
   without being asked for.
3. Add those two strings to `src/app/i18n/en.ts` (and `sv.ts`).

Externally-loaded plugins are not implemented yet. When they land they register
through this same interface rather than a second, parallel one — which is the
reason the built-in tools go through it today.
