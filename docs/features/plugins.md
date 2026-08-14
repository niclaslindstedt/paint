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
paintbrush, paint bucket, colour dropper, text, rectangle, ellipse, line — the
toolbox anyone who has opened a paint program already knows how to use. Waiting
in Settings → Tools: the media this app adds to it (airbrush, marker,
highlighter, crayon, calligraphy pen) and the arrow.

Registration order is toolbar order, and it is deliberate: it reads down
Photoshop's tool column, so a hand that already knows one toolbar finds this one
where it expects to. Sample, then paint, then erase, then fill, then type, then
the shapes, and the tool that moves the view last of all:

**dropper · pencil · paintbrush · airbrush · marker · highlighter · crayon ·
calligraphy pen · eraser · paint bucket · text · rectangle · ellipse · line ·
arrow · hand**

Photoshop's other blocks — selections, crop, pen paths — are tools this app has
no business shipping, so the order is that column with the gaps closed up. Switching a tool on in Settings → Tools slots it into its place in that row
rather than appending it, so the toolbar never reads in the order you happened
to discover it in.

## Brushes are their medium

A tool that differs from the pencil only in `lineWidth` is not a tool. The
painters in `src/app/plugins/brushes.ts`, `bristle.ts` and `crayon.ts` model
what the mark is _made of_:

- the **paintbrush** is a head of hair, and the mark it leaves is opaque paint
  with the hairs' partings scratched through it. The hair is a fixed gauge, not
  a share of the width — widen the brush and you get _more_ streaks rather than
  fatter ones, the way a rack of real brushes works. The head lands blunt and
  holds its width, it is too wide to follow a wiggle finer than itself and it
  cannot turn inside its own width, and it carries a load it spends: the far end
  of a long drag opens up into separate hairs. Drag it fast and it thins, which
  the stroke knows for free — the canvas samples every 1.5 document pixels at
  the slowest, so the gaps between stored points are how quickly you crossed
  them. What decides how a mark reads is **how much paper is left showing**: a
  charged head lays hairs wide enough to meet each other and pools a body in
  between, so the mark closes into a slab with a few partings scratched through
  it, while a dry one leaves the filaments' own width with bare sheet either
  side. That is the hardness dial, and it spans a whole pressure series — dry
  brush at the bottom, a loaded flat at the top — rather than restyling one
  mark. The paper has a say too: a grain runs under every stroke and lifts the
  whole head off the sheet for a moment as it passes, which is what breaks a
  mark _across_ as well as along it. The grain is the **page's**, so it does not
  shrink with the brush — a head narrower than the dips a wide one catches on
  rides over them and leaves a line, which is why a small brush stays solid
  where a wide one at the same setting is streaking;
- the **airbrush** is a spray cone — a radial gradient stamped along the path at
  a fraction of its own radius, faint enough that coverage comes from _overlap_,
  so passing twice really is twice the paint, with a sparse grain over the top;
- the **crayon** is wax caught on the paper's tooth. The page carries a fixed
  lattice of peaks and valleys; wax lands on the peaks and smears along the way
  you were going, and the valleys stay the colour of the sheet. The tooth
  belongs to the **paper, not the stick**, so a wide crayon is a wider band of
  the same fine speckle rather than a thin one blown up — and because two marks
  that cross read the same lattice, they skip the same valleys and the page
  reads as one sheet. The edges chip and fray over a few pixels however broad
  the stick is, the face leans as you turn through a stroke so one side goes
  down solid and the other frays, and the ends fade in instead of starting
  square;
- the **calligraphy pen** is a flat nib held at an angle: broad across the
  stroke, hairline along it.

All of it is a pure function of the stored stroke: the scatter is hashed off
position rather than drawn at random, so a repaint, an undo and the PNG export
produce identical grain instead of a mark that shimmers when you pan.

## Flags, not names

The **hand** draws nothing. Its descriptor carries `navigates: true`, and that
flag — not its id — is what tells the canvas a press should pan the page rather
than start a stroke, and what dims the ink it would never use. The **dropper**
works the same way through `picksColor`. That is the pattern for any tool that
needs the app to treat it differently: a property on the descriptor, so nothing
outside `plugins/` has to know a tool by name.

`hidden` is the flag taken to its limit: a hidden plugin has no button anywhere
and no gesture at all. The dropped image's painter is the one this build ships —
a picture arrives as a file rather than as a stroke you drew, but the mark it
becomes still names a plugin, which is how it paints, exports and undoes like
every other mark without any screen knowing what an image is.

`supportsFill` is the same idea. A tool that sets it wears a folded corner in
the toolbar and opens a fill picker when you press its button a second time —
two glyphs, its own icon drawn hollow and drawn solid, and no words. That second
glyph is the descriptor's own `icon` asked for `filled`, so a new fillable tool
gets the picker by drawing itself solid, with nothing to add to the toolbar.

`clearsPage` puts something that is _not_ a tool on that same gesture. Wiping
the page begins no stroke and leaves no mark — it is one undoable edit on the
document — but it is what erasing looks like at its largest scale, so the eraser
carries the flag and its second press offers both: rub out by hand, or clear the
sheet. The toolbar only asks; the screen owns the confirmation and the edit. A
button in the header would have been the other option, and this one puts the
destructive action where the hand reaching for it already is.

`entersText` is the flag for the one mark that can't come from a pointer. The
**text** tool's press opens a caret on the page instead of beginning a stroke,
and the words become a mark when you are finished with them — so its behaviour's
`start` returns nothing at all, exactly like the hand's. What you type into is a
real text box sitting where the caption will land, set in the face, size and ink
it will land in, so there is no "now render it" beat between typing and having
typed. Four typefaces, bold and italic ride in a small bar above the caret: they
are properties of the caption rather than of the gesture, and they mean nothing
when nothing is being typed. Enter breaks the line, Escape throws it away, and a
press anywhere else on the page keeps it.

## One width per tool

Width is the one control every tool shares — and for a long time it was one
_number_ shared by all of them, which meant reaching for a fat brush left you
with a fat pencil. It is now per tool: a pencil width, a paintbrush width, a type
size, each remembered separately, and each opening at a value the tool itself
declares (`defaultSize`) rather than at one number applied to fifteen tools. A
tool whose scale is its own says so too — the text tool offers type sizes
(`sizes`) where everything else offers the three nib widths — and the size panel
renders whatever it is handed without knowing which tool it is drawing for.

## Every tool tunes differently

The size button opens the widths, and under them an **Advanced** fold holding
the knobs belonging to the tool in your hand. Width is the only control every
tool shares; past it a paintbrush and a highlighter have nothing in common, and
a hardness slider shown to the highlighter was a control that did nothing
sitting where a control that did something should be.

So a tool declares its own, and the bar is high: the panel is something you
reach into mid-drawing, with one thumb, so a dial has to change what the mark
_is_ rather than restyle what another dial already did. For most tools that is
one or two. The paintbrush is the exception and earns it — a head of hair is
loaded or dry, milled fine or coarse, new or worn open, and on paper that wicks
or paper that does not, and no one of those four is any of the others:

| Tool                             | Advanced                              |
| -------------------------------- | ------------------------------------- |
| **Paintbrush**                   | opacity, hardness, hair, splay, bleed |
| **Airbrush**                     | hardness, flow                        |
| **Crayon**                       | opacity, pressure                     |
| **Paint bucket**                 | opacity, feather                      |
| Pencil, marker, highlighter, pen | opacity                               |
| Shapes, text                     | opacity                               |
| Eraser, hand, dropper            | nothing — no fold appears             |

Each one is wired to something the painter actually does. **Hardness** is how
charged the head is, and it is the brush's main control: turned up it is a
loaded flat that covers solidly, turned down a spent one that leaves most of its
length in streaks. **Hair** is which brush off the rack: the head is milled from
filament of a fixed gauge, so fine hair leaves many thin partings and coarse
hair a few broad ones — and neither changes the width. **Splay** is the state of
that head rather than its make — a brush out of its wrapper cuts a side you
could rule against, one washed a hundred times has a fringe on it and strays out
of its lanes. **Bleed** is the only thing here that belongs to the _paper_: how
far a wet edge wicks into the sheet before it dries, which is the brush's one
soft edge. It rests at nothing, because bristle on cartridge paper does not
bleed and a mark that always did would look damp. **Flow** is the airbrush's
trigger, and because its coverage
is built from overlapping passes rather than one opaque dab, turning it down
really does mean more passes. **Pressure** is how hard the crayon bears down:
wax only sticks to the peaks it is pressed onto, so a light hand leaves the
paper's speckle showing and a heavy one fills the valleys in. **Feather** fades
the bucket's edge out over a few pixels instead of stopping it, which turns the
tool into a way of laying a soft wash behind a sketch — and it stays a vector
fill, so the fade holds at eight hundred percent.

The settings are **per tool** and they stick: a soft brush is soft the next time
you pick it up, and it did not also make the airbrush soft. A dot beside
Advanced says a tool is tuned; **Reset** puts it back.

Marks remember what they were drawn with, the way they remember their colour and
their width, so re-tuning a dial never re-draws work you already did. And a dial
left alone is recorded nowhere at all — a drawing made without opening Advanced
is exactly the document it would have been.

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
   so most tools are a few lines of ink configuration. `paint` is also handed a
   `PaintDetail` saying how many device pixels one document pixel is about to
   become; honouring it is optional, but a painter with a texture should, so it
   doesn't lay down detail smaller than the screen can show.
2. Register it in `registerBuiltinPlugins()` with an id, an icon, and its two
   catalog keys — plus `core` or `defaultOn` if it should be in the toolbar
   without being asked for, `defaultSize` for the width it opens at, and `dials`
   if it has anything of its own to tune.
3. Add those two strings to `src/app/i18n/en.ts` (and `sv.ts`).

Externally-loaded plugins are not implemented yet. When they land they register
through this same interface rather than a second, parallel one — which is the
reason the built-in tools go through it today.
