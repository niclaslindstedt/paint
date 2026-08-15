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
airbrush, paint bucket, colour dropper, text, the shapes and the selection tools
— the toolbox anyone who has opened a paint program already knows how to use,
spray can included. That is the _whole_ default toolbar: nine buttons, families
counted as the one button they are, and everything else off until you ask for
it. Waiting in Settings → Tools: the rest of the media this app
adds to it (the bristle paintbrush, marker, highlighter, crayon, calligraphy
pen).

The toolbar reads down Photoshop's tool column, so a hand that already knows one
toolbar finds this one where it expects to. Sample, then paint, then erase, then
fill, then type, then the shapes, then the selection tools, and the tool that
moves the view last of all:

**dropper · pencil · paintbrush · airbrush · marker · highlighter · crayon ·
calligraphy pen · eraser · paint bucket · text · shapes · select · hand**

Photoshop's other blocks — crop, pen paths — are tools this app has no business
shipping, so the order is that column with the gaps closed up. Switching a tool
on in Settings → Tools slots it into its place in that row rather than appending
it, so the toolbar never reads in the order you happened to discover it in.

That is the _default_ order. Settings → Tools lists the whole toolbar in the
order the buttons sit in, and the up / down arrow beside each row moves it —
the toolbar follows immediately. Only the rows you actually move are recorded,
so a tool added by a later release still lands where its maker put it rather
than at the end of an arrangement written before it existed.

## Families behind one button

A **group** is a family of tools that share one toolbar button and one switch.
The shapes are the case it was built for, and they are the reason it exists:
eleven of them as eleven buttons would be most of a phone's toolbar spent on one
idea, and eleven switches in Settings → Tools for a question nobody asks eleven
times. The four selection tools are the second (see below).

So the shapes button wears whichever shape you last held. Press it again and the
family opens over the canvas — rectangle, ellipse, line, arrow, rounded
rectangle, triangle, diamond, pentagon, hexagon, star, double arrow — with the
fill toggle under them, showing the shape you have picked drawn hollow and drawn
solid. It is the same "press it twice" gesture the eraser's wipe uses, and the
same folded corner marks it.

Grouping is only about how they are _offered_. Each shape is still its own
plugin with its own painter, its own remembered width and its own persisted id,
so every rectangle ever drawn in this app still says `rectangle` and still
paints. The four that had a keyboard shortcut keep it (**R**, **O**, **L**,
**A**); the rest are one press apart in the picker.

Every shape is a two-corner drag. The polygons are inscribed in the box you
drag, stretched to fill it — so a hexagon dragged square is a hexagon and one
dragged wide is a squashed one — which means no new shape kind in the document
and no field on the stroke saying which shape it is. The painter answers that,
and the painter is chosen by the stroke's tool id, exactly as it always was.

## Four ways to select

The selection tools are the same arrangement, for the same reason: which _shape_
you pick marks out with is a smaller question than which tool you are holding.
So one button holds a **box** marquee (**V**), an **oval**, a freehand **lasso**,
and a **trace** — and the button wears whichever you last used.

They differ only in the gesture. Every one of them ends by answering one question
— `selection(draft)`, "what did this gesture choose?" — with **closed contours in
document coordinates**, and the screen takes contours and nothing else. That is
why a lasso needed no new idea anywhere outside `plugins/`: the canvas, the store
and the renderer are unchanged, and a build that adds a fifth way to select adds
a fifth behaviour and nothing more.

The trace tool is the interesting one. It has no shape of its own at all: it asks
the same probe the paint bucket asks — a rasterised snapshot of the page, flooded
from where you pressed and traced back into outlines (see `flood.ts`) — and hands
those outlines over as the selection. So it stops where the bucket would stop,
which is what makes it follow what is _drawn_ rather than a shape drawn over it.
Nothing about it reaches the document; the outline is thrown away as soon as the
marks are chosen.

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

`selects` is the flag for the tool that chooses marks rather than making one.
The **selection** tool drags an ordinary two-corner draft — so it inherits the
whole gesture pipeline, down to abandoning itself when a second finger lands —
and the canvas reads the flag to hand the finished box to the screen instead of
filing it. No stroke ever carries the tool's id. What happens next is
[selections](selection.md).

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

## A width is shown as the mark it makes

The size button and every width in its panel used to be a grey dot the width of
the nib, which told you a number you could already read. It is now a **press**:
the mark that width would leave, simulated through the same behaviour that would
make it and painted by the same painter that would paint it, on the page colour
and in the ink you have picked. So an airbrush is a soft cone, a highlighter a
translucent band, the crayon its speckle, the calligraphy pen its flat, the
rectangle a rectangle at that line width, the text tool a letter at that type
size — and the eraser, which lifts ink rather than laying it down, is a bite out
of a blot of ink, because on its own it would preview as nothing at all.

A tool has nothing to add for this. The simulation drives the contract every
tool already implements: `start` at a point and `end` is what a press _is_; a
tool that drops a press because its mark needs two anchors (the shapes) is given
the shortest gesture that does leave one; a tool that reads the page is lent one
(`ToolContext.probe`), which is how the bucket previews a real feathered fill;
and `entersText` is the flag that says to ask for a caption instead. A tool
whose press leaves nothing at all — the hand, the dropper — falls back to the
plain dot, which is the honest answer for a button that is dimmed anyway.

How far past its own geometry a medium's ink actually reaches — an airbrush cone
is over three times its nib — is **measured** rather than declared: the mark is
painted once into an off-screen tile and read back as the box its pixels reach.
That is what keeps the preview right for a painter nobody has written yet.

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
| Eraser, hand, dropper, select    | nothing — no fold appears             |

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

Settings → Tools is the toolbar with its lid off: one list, in the order the
buttons actually sit in. Every tool wears the glyph it has in the toolbar, with
its name, shortcut, one line of description, the two arrows that move it along
the row, and an on/off switch on the right. The always-on three carry a switch
too — shown on and locked, because a row that simply omitted it would read as a
rendering fault next to the others — and they reorder like everything else,
because they have a place in the row like everything else.

A family is one row: one glyph, one description, one switch for all eleven
shapes.

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
   without being asked for, `defaultSize` for the width it opens at, `dials` if
   it has anything of its own to tune, and `group` if it belongs to a family
   that already has a button (a twelfth shape is one line in the `SHAPES`
   table).
3. Add those two strings to `src/app/i18n/en.ts` (and `sv.ts`).

Externally-loaded plugins are not implemented yet. When they land they register
through this same interface rather than a second, parallel one — which is the
reason the built-in tools go through it today.
