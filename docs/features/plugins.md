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

Core is the irreducible three — pen, the rubbing-out family, hand. On out of the box: the
airbrush, the marker, the highlighter, the fills (the paint
bucket, and the gradient behind it), text, the shapes, the selection tools and
the colour dropper — the toolbox anyone who
has opened a paint program already knows how to use, spray can included, plus
the two felt tips a hand reaches for on a page it is thinking on. That is the
_whole_ default toolbar:
eleven buttons, families counted as the one button they are, and everything else
off until you ask for it. Waiting in Settings → Tools: the media that simulate
their medium (the graphite pencil, the watercolour brush, the paintbrush, the
crayon, the chalk, the calligraphy pen). The **rubber**
is not one of them: it ships with the eraser, behind the eraser's own button —
see below.

The row reads in the order a hand actually uses it. The pen you draw with, the
rest of the media, then the three tools that work on an _area_ rather than on a
line — rubbing one out, and filling one — then the two other families, type —
which is what you usually reach for right after picking something out — and last
the two tools that touch neither the ink nor the document:

**pen · pencil · paintbrush · watercolour · airbrush · marker · highlighter ·
crayon · chalk · calligraphy pen · erasers · fills · shapes · select · text ·
dropper · hand**

The erasers sit at the end of the media shelf, one button left of the bucket,
rather than second in the row beside the pen: taking a passage off and flooding
one are the same kind of act, and a hand picking along the marking tools should
not have to step over the one that takes marks away.

It used to read down Photoshop's tool column instead. That column is a column,
and a phone's toolbar is a row: it put the one tool that draws nothing (the
dropper) under the thumb that reaches best. Switching a tool on in Settings →
Tools slots it into its place in this row rather than appending it, so the
toolbar never reads in the order you happened to discover it in.

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
times. The four selection tools are the second, the two fills the third, and the
**two ways of taking a mark off** the fourth: press the eraser again and the
rubber is behind it.

That last one is the pattern at its plainest. An eraser and a rubber are not two
tools you choose between so much as one question — _how much of this should go_ —
with two honest answers, and the family is what lets the second answer ship
without charging every user a permanent button for it. It is also what makes it
findable: nobody goes looking in Settings → Tools for an eraser they do not know
exists. The family's id is the **eraser's own** — as the fills' is the bucket's
and the selection family's is the marquee's — so an install written before the
rubber existed keeps its button, in its slot, with the rubber now behind it.

So the shapes button wears whichever shape you last held. Press it again and the
family opens over the canvas — rectangle, ellipse, line, arrow, rounded
rectangle, triangle, diamond, pentagon, hexagon, star, double arrow — with the
fill toggle under them, showing the shape you have picked drawn hollow and drawn
solid. It is the same "press it twice" gesture the eraser's wipe uses, and the
same folded corner marks it.

The panel is only as wide as the family behind it: eleven shapes fill four
columns and three rows, while the two fills and the two erasers open a panel two
buttons wide rather than a four-wide box with half of it empty.

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

## Two ways to fill an area

The **paint bucket** and the **gradient** share a button for a reason of their
own: the gradient is not a second tool so much as the bucket's other answer. Same
press, same flood, same traced outline, same `region` stroke in the document —
what differs is what the area is filled _with_. So a second press on the bucket
offers the pair, and the button wears whichever you last used.

Press inside the space you want filled, drag the way you want the colour to run,
and let go: where you pressed is the first colour, where you let go is the last,
and the ramp runs between them. A press that never travels still fills — the ramp
is laid straight across the area instead — because a fill that came out empty
would be a strange answer to a tap.

The one thing it does not inherit is the bucket's "dragging re-aims it" rule:
re-flooding mid-drag would move the area out from under the ramp being drawn.

## A tool can carry its own inks

The gradient is poured from **two colours (or three)**, and neither of them could
ever be the one on the toolbar's ink button. So a plugin may declare `swatches`
the way it declares dials — an id, a name, the colour it rests at, and whether
"none" is one of its answers — and everything follows from that:

- the tool's settings panel grows a **swatch row** at its head, over a press of
  the mark those colours make, and a palette for whichever swatch you are
  setting;
- the toolbar's ink button is **struck through and disabled** while the tool is
  in hand, because that colour genuinely changes nothing — the same treatment
  the eraser, the hand and the marquee get, and for the same reason;
- the values are kept per tool per swatch in the settings blob, sparsely — only
  what differs from the colours the tool ships with;
- and a poured mark **records the ramp it was poured with**, so re-mixing the
  tool tomorrow cannot re-colour the fills you made today.

The gradient's are `from`, `to` and an optional `mid`, which is off out of the
box: a three-stop ramp is a deliberate thing, and a fill that quietly ran through
a third colour nobody asked for would be a puzzle. Nothing outside
`plugins/builtin/gradient.ts` knows those names.

## …or no ink you can pick at all

The pencil is the other end of that. It carries no swatches, because there is
nothing to set: **graphite is a grey mineral, and the one thing that decides
which grey is which lead is in the pencil.** So the plugin declares `fixedInk`,
and the toolbar's swatch is struck through exactly as the gradient's is — a
palette that opened and changed nothing was the tool telling you it had a colour
setting when it did not.

The colour control it does have is already on its panel: the **grade**. It picks
the grey the same way it picks how much of it goes down — an 8H is a pale, cool
scratch you can see the sheet through, a 9B is nearly black and a touch warmer
with it — and the sheet flips the whole ladder, so on dark paper it is the soft
lead that shows brightest, silverpoint-style, rather than the hard one vanishing
(see `graphiteInk`). The grey is mixed once, when you draw, and **recorded on the
mark**, so re-papering a drawing later leaves the sketch in the tone it was made
in.

`fixedInk` says nothing about _how_ a tool arrives at its colour — that is its
behaviour's business. It says only that no palette can reach it, which is why a
charcoal or a silverpoint landing next year is one flag rather than a change to
the toolbar.

## Four ways to select

The selection tools are the same arrangement, for the same reason: which _shape_
of window you cut is a smaller question than which tool you are holding.
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
Nothing about it reaches the document; the outline becomes the window and the
draft is thrown away.

## Brushes are their medium

A tool that differs from the pen only in `lineWidth` is not a tool. The
painters in `src/app/plugins/brushes.ts`, `bristle.ts`, `waxSim.ts`,
`chalkSim.ts` and `leadSim.ts` model what the mark is _made of_:

- the **paintbrush** _simulates its paint_, the way the pencil presses a lead
  into the sheet and the calligraphy pen spends a bead of ink (see
  `src/app/plugins/bristleSim.ts`): the head presses a finite dip of paint
  through a comb of hairs onto the page's own grain, and what the paper took
  is what you see. A charged head bridges the grain and lays an opaque slab
  with the hairs' partings scratched through it — and the film settles a
  little into the sheet's dips, so a canvas weave prints its over-and-under
  straight through the slab and the sealed page dries even. The dip is spent
  as the stroke travels: a #6 covers about twelve centimetres of paper, thins
  to streaks as the outer hairs give out, breaks up into the paper's own
  tooth — a starving head only reaches the high ground, which is what a
  dry-brush scumble _is_ — and then trails the film left on the hairs for
  about as far again, fading the whole way. A thirsty sheet drinks the
  reservoir as it goes, so the same dip runs shorter on cotton than on the
  sealed page, and wicks a little paint out along the fibres at the edges.
  How much one dip charges is the **load** dial; how wet and gathered the
  bundle is, is **hardness** — a loaded slab at the top of the range, a
  scumble at the bottom. Drag it fast and it thins and skips, which the
  stroke knows for free — the canvas samples every 1.5 document pixels at the
  slowest, so the gaps between stored points are how quickly you crossed
  them. And it is the round and the flat _in one handle_: **flatness** is how
  far the ferrule squeezes the head toward a blade — 0 the round that lays
  the same width whichever way you pull it, 1 the one-stroke flat that lays
  its full width square across itself and closes to a heavy line along its
  own edge, the middle a filbert — and **nib angle** is which way the blade
  is turned. What a blade does is a projection worked out per touch, so one
  stroke of a flat swells and thins round a curve without the hand doing
  anything, and the paint the narrower band stops laying sideways it carries
  as extra thickness instead. And **pressure** is the one knob on it that is
  not the brush but your hand: draw with the point of a round and it lays a
  line well inside its ferrule, lean on it and the belly goes down too — a
  band half again as wide as the ferrule, its two sides no longer parallel,
  its strands clumped, the partings between them staying open where a
  gathered head's close over, and the dip spent sooner because more paint is
  coming off. That one stroke — thin, swelling, thin again — is what a round
  brush is bought for. A flat hardly notices it, because a chisel ferrule
  holds its hairs where they are whatever you do to them, and a filbert takes
  some of it like everything else. It is one setting for the whole stroke
  today; it is also the number a stylus will move as you press, when there is
  one to read. The angle keeps hold of the mark for the whole
  of it, not just where you touched down: a blade held across the way you are
  going leaves the square-cut ends a one-stroke flat is bought for, and one
  held obliquely leads with a corner, so the mark is cut off at the angle you
  are holding it at rather than square across the direction you dragged. The **two ends** of the mark are two different
  marks, because they are two different things a hand does. A head swept onto
  the paper takes it with part of the bundle and opens to the full width of
  the ferrule over the first stretch of the stroke — it does not stamp a disc
  the diameter of the brush where you touched down. A head _placed_ on the
  spot has already landed, and starts at its full width; the tool reads the
  difference off how fast your hand was moving, so a tap leaves the print of
  the head and a flick does not — and how much of the bundle lands, how far it
  takes to open, and which side of the line it comes down on are that stroke's
  own, so no two touch-downs are the same shape. And a lift is not a
  touch-down backwards: by then every hair in the bundle is bent backwards
  along the stroke, so the pressure comes off over the last stretch and the
  mark frays out into a fan of trailing hair ends rather than closing with an
  edge. How that fan comes out is the **speed you left the paper at**: stop
  first and the head leaves a short, blunt, full-strength end, still about the
  width of the bundle; carry on going and the tips string out behind you,
  narrow and pale. Nothing about a brush is quite the same twice over, in
  fact — the strands are cut a little differently, the partings fall somewhere
  else and the paper takes it its own way for every stroke you draw — while
  the _same_ stroke always comes out the same mark, whether it is under your
  finger, redrawn from the file or exported to a PNG. Across the band,
  the round bears like the cone it is — solid down the middle, softening to
  its two sides — where a chisel ferrule is cut square and lays the slab with
  two ruled sides that a flat is bought for. A landed mark is simulated once
  and kept as pixels; the gesture under your finger is walked incrementally,
  so a frame costs the touches that arrived rather than the length of the
  stroke; and a mark too small for the field to show falls through to the
  vector-hair painter that used to be the whole tool;
- the **airbrush** is a spray cone — a radial gradient stamped along the path at
  a fraction of its own radius, faint enough that coverage comes from _overlap_,
  so passing twice really is twice the paint, with a sparse grain over the top.
  The cone is about as wide as the width you set, so a size-8 airbrush covers
  roughly what a size-8 pen does, only soft-edged instead of hard;
- the **pencil** is graphite scratched onto that same tooth, and it is not the
  crayon: the flakes chip off where they land rather than smearing, the grain is
  finer because a sharp lead reaches into tooth a blunt wax face rides over, and
  the tool mixes its own grey rather than taking the ink you picked — because a
  pencil that drew in red would be a textured pen. The lead's **grade** is one
  axis, and it is both halves of what a lead is: hard and pale at the H end,
  soft and dark at the B end, picking the grey it draws in as well as how much
  of it sticks, and reaching the deposit and never the width. **Pressure** is
  the other, and it is the hand rather than the stick: it decides how far into
  the sheet the lead is driven, so easing off leaves the paper showing through a
  broken line and bearing down fills the tooth in — and it makes the line no
  wider either. Speed is deliberately almost nothing here, because graphite
  comes off by abrasion (work done over distance) rather than by flowing like
  ink, and because the speed a stroke reports is the gap between its stored
  samples — a mark that leaned on it would be a mark that changed with the
  device that drew it;
- the **marker** and the **highlighter** are two shapes of felt tip, not one
  painter at two widths. The nib is an ellipse stamped along the path, and how
  far it is squashed is the **chisel** dial: a marker rests mostly round and
  draws the same weight whichever way you pull it, a highlighter rests nearly
  flat and held square across the page, so an underline gets the full band and a
  stroke down the page gets a hairline;
- the **crayon** is a stick of wax _simulated_ over the page's own sheet, the
  pencil's arrangement one shelf along: the paper's height decides what the
  face can reach, and the mark is whatever the tooth caught. Wax comes off in
  crumbs that catch in **clumps** — chains of little streaks pointing the way
  the hand went, with clean paper between them — and each pass stands the
  surface up under the next, so colouring something in genuinely closes it:
  the second pass reaches valleys the first rode over, up to the waxy
  near-solid a leaned-on stick **burnishes** to and cannot go past. The tooth
  belongs to the **paper, not the stick**, so a wide crayon is a wider band of
  the same clumped speckle rather than a thin one blown up — and because two
  marks that cross read the same sheet, they agree about where it is low and
  the page reads as one sheet, while each smears its clumps its own way, the
  way two real strokes do. The face leans as you turn through a stroke so one
  side goes down solid and the other frays, its worn facets plough shallow
  furrows along the mark, the edges chip over a few pixels however broad the
  stick is, and the ends fade in instead of starting square. **Softness** is
  the crayon's grade, the way the pencil's is its lead: the hard end is a
  china marker, 100% the wax crayon, the soft end an oil pastel that digs to
  the bottom of the tooth and slabs colour on at an ordinary touch — and the
  preset row hands out exactly those three sticks. Where no field can run — a
  hairline at a far zoom, a face finer than a couple of cells, a browser with
  no canvas — the old geometric grain painter catches the mark inside the
  seam, so everything always draws;
- the **chalk** is a soft board stick scrubbed over that same sheet (see
  `src/app/plugins/chalkSim.ts`), and it is neither the crayon nor the pencil:
  chalk is powder, so one ordinary pass covers where a lead sparkles — and the
  mark still never closes into solid colour, because how much dust each spot
  of the page catches is wildly uneven and the dark pinholes that stay open
  are the whole look of chalk on a board. A worn stick's facets plough faint
  **streaks** along a broad drag, loose dust falls just past the edge and
  clings here and there as a sparse halo of specks, the ends are blunt because
  a soft stick bites the moment it lands, and a second pass packs the tooth
  the first broke over — which is how a board hand bolds a heading.
  **Pressure** is its one dial, the crayon's argument at the crayon's rests: a
  light hand leaves a chain of specks the board shows through, a heavy one
  packs the tooth nearly full, and neither makes the stick any wider. Speed
  says almost nothing, for the pencil's reason — chalk comes off by abrasion,
  work done over distance;
- the **flat brush** is no longer a second tool: it is the paintbrush's
  flatness dial turned all the way up (the "One-stroke" preset), because what
  a blade does is a projection the simulation works out per touch rather than
  a different painter. The ferrule's squeeze still empties most of the
  bundle, so a full flat runs about half as far as the round on the same dip.
  Every stroke ever drawn with the old flat brush still names it and still
  paints — the tool keeps a registration with no button (the same mechanism
  as the dropped image's painter);
- the **watercolour brush** is the one medium here where what you are painting
  with is _water_, and the pigment only goes where the water took it. Four
  things happen while a wet stroke dries on a sheet and all four are in the
  mark: the water runs on past the hair that laid it, so the wash is wider than
  the head and its two sides wander **independently** — a wet edge follows the
  paper, not the gesture; the rim dries **darkest**, because a pool evaporates
  fastest at its edge and the pigment travels out to replace what left, which is
  what makes a laid wash look laid rather than airbrushed; the pigment
  **settles** into the sheet's dips, which is granulation; and nothing
  **covers**, because the sheet is the white and every layer is a filter over
  what is under it, so passing twice really is twice the colour. The three dials
  are the three things a watercolourist changes between one stroke and the next
  — how much water is on the brush, how much colour is in the water, and what
  the paper does with what is left;
- the **calligraphy pen** is a flat nib held at an angle: broad across the
  stroke, hairline along it. The angle is a dial, in degrees, because the tilt
  of the hand is the one thing a writer actually changes about a broad nib;
- and the **rubber** is the one medium here that takes something off instead of
  putting it on. It reads the pencil's own sheet — literally the same lattice,
  so the two agree about where the paper is low — and lifts from the peaks the
  lead reached, bridging the dips it never got into. That is the whole model,
  and everything anyone knows about rubbing out falls out of it: a passage goes
  _paler_ rather than away, what survives is a speckled ghost in the tooth, the
  edge of the rub feathers into the tone around it instead of cutting a window,
  and passing again takes the same _fraction_ of what is left — so it fades and
  fades and is never quite gone. **Pressure** is how hard you lean on it, which
  is how deep into the sheet the face deforms: it fades the ghost, it never
  widens the mark. And it lifts only what a rubber can lift.

All of it is a pure function of the stored stroke: the scatter is hashed off
position rather than drawn at random, so a repaint, an undo and the PNG export
produce identical grain instead of a mark that shimmers when you pan.

### What a rubber will not take off

Graphite and chalk sit loose on the sheet and come away; everything else
stays. Ink, paint, felt tip, a bucket of colour and a dropped photograph have
soaked into the paper, and a wax crayon mark smears under a rubber rather than
lifting — so however hard you rub, only the pencil and the chalk come off. The
rubber leaves all the rest exactly where it is — which is what finally makes
the oldest workflow in drawing work here: **sketch it in pencil, ink over the
sketch, then rub the sketch out.**

Two flags say all of it, and nothing anywhere reads a tool's name: `lifts` on
the rubber, `liftable` on the media that come away. The renderer does the rest
— an erasing mark can only be a hole, so it takes everything for the length of
one composite and the marks it could never have lifted are laid straight back
over it (`relayFixed` in `relay.ts`). Ink comes back at exactly the strength it
had, because the mask it comes back through _is_ the fraction that went. The
plain **eraser** is still there and still indifferent: it is a hole, it goes
through ink and pencil at the same rate, and at full strength it takes the page
to white in one drag. That is the one you want for a mistake.

## Flags, not names

The **hand** draws nothing. Its descriptor carries `navigates: true`, and that
flag — not its id — is what tells the canvas a press should pan the page rather
than start a stroke, and what strikes out the ink it would never use. The **dropper**
works the same way through `picksColor` — and answers `pick` with the colour a
press read, because _how much page_ one press covers is the dropper's own
setting and the canvas has no business knowing what that dial is called. That is
the pattern for any tool that needs the app to treat it differently: a property
on the descriptor, so nothing outside `plugins/` has to know a tool by name.

`lifts` and `liftable` are the pair that make a rubbing out selective. `lifts`
says a tool only takes off what a rubber could have taken; `liftable` says a
medium is one of those. Neither is a rule about erasers and pencils — a charcoal
tool would declare `liftable` and be lifted, a shape that scrubbed would declare
`lifts` and need nothing else.

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

`wetness` is the flag with a number on it: how much water the tool puts on the
page, nought for a pencil and one for a loaded watercolour brush. On its own it
does nothing at all. It is multiplied by how thirsty the **sheet** is (see [the
surface you draw on](surface.md)), and the product is what decides whether a
mark mixes with what is under it rather than covering it, drags a little of what
it crossed into its own wet edge, and runs further past the nib than the tool
would on its own. A new medium declares how wet it is and gets all three; the
renderer never learns what watercolour is called.

`grows` and `reach` are the two flags nobody looking at the app can see, and
they are what keeps a long stroke drawable. `reach` says how far past its own
path a painter can spread, as a multiple of the width — 1.6 for an airbrush's
cone, half a width for a plain line — and `grows` promises that every stamp in
the mark depends only on the path up to it, so making the stroke longer cannot
change anything more than a nib's reach behind the new samples. A tool that
declares both is repainted **only where it has just been** while you draw it,
instead of from its first point on every frame. Most tools cannot declare
`grows` and should not: a brush whose run-out is measured back from the end, a
crayon whose grain coarsens as the mark grows, and a wash that is simulated over
the whole path all repaint differently all the way back when you add a sample.
The default for both is the safe answer, and the honest thing to do with a new
tool is leave them alone until someone has read its painter.

`selects` is the flag for the tool that cuts a window in the page rather than
making a mark. The **selection** tool drags an ordinary two-corner draft — so it
inherits the whole gesture pipeline, down to abandoning itself when a second
finger lands — and the canvas reads the flag to hand the finished outline to the
screen instead of filing it. No stroke ever carries the tool's id. What happens
next is [selections](selection.md).

`entersText` is the flag for the one mark that can't come from a pointer. The
**text** tool's press opens a caret on the page instead of beginning a stroke,
and the words become a mark when you are finished with them — so its behaviour's
`start` returns nothing at all, exactly like the hand's. What you type into is a
real text box sitting where the caption will land, set in the face, size and ink
it will land in, so there is no "now render it" beat between typing and having
typed. The typeface — one of four, each named in its own letters — bold and
italic ride in a small bar above the caret: they are properties of the caption
rather than of the gesture, and they mean nothing when nothing is being typed.
Enter breaks the line, Escape throws it away, and a press anywhere else on the
page keeps it. The box can be **dragged** — by its rim, or by the grip at the
head of the type bar — so a caption that landed in the wrong place is moved
rather than retyped. When the caret lands near the edge of the screen the field
is capped at the room actually left and the bar folds onto a second row rather
than walking off to the left, which keeps its buttons reachable and its grip
over the caption it moves.

## One width per tool — for the tools that have one

Width is the control most tools share — and for a long time it was one
_number_ shared by all of them, which meant reaching for a fat brush left you
with a fat pen. It is now per tool: a pen width, a brush width, a type size,
each remembered separately, and each opening at a value the tool itself declares
(`defaultSize`) rather than at one number applied to fifteen tools. The panel is
headed with the name of the tool it is setting, so a picker opened over the
drawing says whose widths these are.

### A document pixel is a real distance

**One dot of an iPhone's screen — 460 pixels to the inch**, which is what every
phone in the current line measures, and every OLED iPhone back to the 12.

It could have been a printing resolution, and it was: 300 dpi, on the reasoning
that a page is a piece of paper. But this is not a page you print, it is a page
you **draw on with a finger**, and the sheet it is really laid against is the
glass under your hand. Calibrating to the screen makes the number on the size
button a distance you can measure _on the device you are holding_: set the
marker to 5 mm, hold the drawing at 1:1, and the band under your thumb is five
millimetres wide. At 300 dpi the same band came out at three and a third — the
app said one thing and the glass said another, and the glass is the one you can
put a ruler on.

So a millimetre is 18.11 pixels: a 0.5 mm pencil lead is a nine-pixel line, a
25 mm flat brush a four-hundred-pixel band, and a 3200 × 2000 sheet a
postcard held landscape at 177 × 110 mm. Type is measured in **points**, because
type has been sold that way for four hundred years and a caption in millimetres
is one nobody can compare against anything.

The new-image dialog's **A4** preset is the one number here that is _not_ on
this scale, and deliberately: it answers a different question — how many pixels
a sheet needs to **print** sharply. Photo labs and consumer inkjets want image
data at 300 ppi (the 1440 and 5760 dpi on the box are ink droplets, not pixels),
so A4 is 2480 × 3508 whatever the page's own scale is. That rectangle measures
137 × 194 mm in the app and 210 × 297 mm on the paper; both are true of the same
pixels, and which you mean depends on whether you are looking at the glass or at
the print.

Widths on strokes are still document pixels, so nothing already drawn moved.
What changed is what a number _means_.

### Every tool comes in the sizes it is really made in

A rack of implements is not one rack. A technical pen is drawn to the ISO ladder
(0.13–2 mm), a mechanical pencil takes four leads, a round brush is numbered by
its ferrule, a flat is sold in fractions of an inch, a chisel marker runs to
15 mm and a decorator's brush starts where all of them stop. So each tool
declares a **gauge**: the range the real thing is made in, the five sizes worth
a button, and how far past either end you may still go.

The five buttons are sizes a shop actually sells, and each carries the trade's
own designation where there is one — the brush row reads **#2 · #6 · #10 · ½" ·
1"** (the round series up to where brushes start being sold in inches, which is
how every flat is), the pencil row **0.3 · 0.5 · 0.7 · 0.9 · 2.0 mm**, the type
row **10 · 12 · 18 · 24 · 48 pt**.

Each tool **opens on one of its own five**, and on the one it is reached for
most of the time rather than on the middle of the rack: the pen at 0.5 mm (the
liner that outsells the rest put together), the pencil at 0.7 (0.5 is the lead a
shop sells most of, but a sketching hand wants the blunter point), the marker at
its 2 mm bullet, the paintbrush at a #6, the airbrush at a general-purpose
12 mm pattern. A default that is not one of the five is a fresh install whose
size row has nothing lit up in it.

The slider under them is **not linear and not one scale**. It has three bands:

| Travel      | What is there                                                       |
| ----------- | ------------------------------------------------------------------- |
| **0–10%**   | finer than the tool is made, down to a hairline                     |
| **10–50%**  | the rack — everything between the narrowest real one and the widest |
| **50–100%** | past the rack, accelerating to a nib as wide as the page            |

The band is drawn on the track, so where you are is something you can see, and
the readout says it in words as well: **0.5 mm — as made**, or _finer than made_
and _wider than made_ either side of it. Every band interpolates geometrically,
because width is a ratio quantity — the step from 0.3 to 0.4 mm is the same
_kind_ of step as the one from 3 to 4 mm, and a linear slider makes the first
invisible and the second enormous.

Nothing is forbidden. A drawing is not a photograph of a toolbox: a 0.05 mm line
has no implement behind it and is still the right line sometimes, and a slider
that refuses to draw a 200 mm pencil is a slider arguing with you. What the
panel does instead is _tell you_ which of those you are doing.

There is no "keep this width" button. A width on its own was a worse version of
a saved **tool**, which carries the dials with it and has a name and a mark on
it — so the star in the title row is the only thing in the panel that remembers
anything.

Nothing in the panel closes it, either. Picking a width, applying a saved tool
and turning a dial are all things you may want to do two of — and the panel is
where a tool gets saved, so shutting it the moment a width was picked put the
star one re-open away from the decision that earned it.

Not every tool has one. The paint bucket and the gradient fill the area they
traced whatever a nib might say, so they declare `sizeless` and are offered no
width at all; the hand, the dropper and the selection tools leave no mark, which
the descriptor already says. What the toolbar puts beside the ink follows from that in one place
(`plugins/controls.ts`): the width for a tool that has one, a **cog** for a tool
that has settings but no width, and nothing for a tool with neither. The dimmed
size button those last two used to get was a promise that the control worked
sometimes, and for them there was no sometimes.

## Presets: the tool as it is actually held

Four sliders is a tool a professional can build and a beginner cannot. Nobody
arrives at dry-brush by dragging the hardness down and the load off to see what
happens — they arrive at it by being handed it and told what it is called. So most tools **ship with the handful of settings their medium is
actually used at**, and the panel offers them as a row of chips above everything
else in it.

A preset is a **whole tool**: a width _and_ every dial. Pressing one sets the
lot, including the dials it has no opinion about, which go back to their
defaults — so a dry brush applied over a wet-in-wet is a dry brush and not some
third thing. What is on offer is the vocabulary of the medium rather than of the
app:

| Tool            | Ships with                               |
| --------------- | ---------------------------------------- |
| Pen             | Liner · Fineliner · Guide line           |
| Pencil          | Sketch · Construction · Shading · Detail |
| Eraser          | Block · Detail · Kneaded                 |
| Rubber          | Pocket rubber · Kneaded · Pencil top     |
| Paintbrush      | Round · One-stroke · Filbert · Dry brush |
| Watercolour     | Wash · Wet-in-wet · Glaze · Dry brush    |
| Airbrush        | General · Detail · Background            |
| Marker          | Marker · Chisel · Fineliner              |
| Highlighter     | Line of text · Broad                     |
| Crayon          | Colouring · Shading · Solid              |
| Chalk           | Writing · Side of the stick · Heading    |
| Calligraphy pen | Italic · Foundational · Uncial           |
| Paint bucket    | Flat fill · Soft edge · Wash             |

Each chip wears **the mark it makes** — a press with the tool as that preset
sets it, painted by the painter that would paint it, exactly as the widths below
are (see below). That is what makes a word you may not know yet worth putting on
a button: "wet-in-wet" reads a great deal more clearly when the chip beside it
is visibly wetter than the one next to it.

**Every row opens with the tool as it comes.** The first chip of each is
precisely the tool's own defaults, so opening the panel on a tool nobody has
touched shows a chip already lit — which is how the row explains itself without a
word of help text, and which makes "put it back the way it was" one press.

**A tool whose must-haves come to a single setting ships none at all**, and puts
that setting in its defaults instead — which is what a default is _for_. A row of
one chip is a worse default than a default. That is why the eleven shapes have
none (a rectangle is a rectangle; what varies is the width of the line it is
ruled with, and the width row is already five buttons of exactly that, opening on
the half-millimetre line you would draw a box with) and why the text tool has
none either (the size row is the preset row for type, and the face, the weight
and the slant are not dials — they sit beside the caption you are typing). The
hand, the dropper and the selection tools have no dials and leave no mark, so
there is nothing to preset.

The paint bucket is the one whose presets carry **no width**, because the tool
has none: they are three dial settings, offered from the same cog that holds its
dials. A fill with a hard edge, one that fades out behind a sketch, and a pale
wash you can read the drawing through are three different tools to anyone using
them, and the bucket having no nib is no reason for it to be the one tool you
have to build by hand.

## Saved tools

A width and four dials is a lot of decisions, and the ones worth making are
worth making once. Finding the 4B at 0.7 mm under a light hand that a
drawing wants takes a minute of fiddling; wanting it again tomorrow takes the
same minute. So the panel's title row carries a **star**. Press it, give the tool a name —
"my sketching pencil" — and a **mark** from the same catalogue a drawing's own
glyph comes from, and it is a chip at the top of that tool's panel from then on.

A chip is a **whole tool**: pressing one sets the width _and_ every dial at
once, and it can put a dial back to its default as readily as away from it. They
belong to one tool, because "my sketching pencil" applied to the airbrush is
nonsense. The mark is what makes the row readable at a glance — four chips of
similar words are four chips you have to read, where the star is the one you
always reach for and the leaf is the one you sketch plants with.

The **Saved** section is not there at all until something has been saved: an
empty heading over an empty row is a promise of a feature rather than a feature,
and the star beside the tool's name is the way in. And none of it is a mode — a
chip lights up when the tool currently _is_ what it describes, which is an
observation rather than a state: move a dial afterwards and the light goes out,
and nothing has been entered or left.

Eight per tool, and saving over a name you have used replaces it, which is what
everyone means by saving.

## A width is shown as the mark it makes

The size button and every width in its panel used to be a grey dot the width of
the nib, which told you a number you could already read. It is now a **press**:
the mark that width would leave, simulated through the same behaviour that would
make it and painted by the same painter that would paint it, on the page colour
and in the ink you have picked. So an airbrush is a soft cone, a highlighter a
translucent band, the crayon its speckle, the calligraphy pen its flat, the
rectangle a rectangle at that line width, the text tool a letter at that type
size.

A tool whose mark cannot describe itself says so instead
(`sizePreview: "circle"`) and gets a plain disc. The two rubbers are the ones
that do: their mark is a _hole_, and a hole on the bare page a preview is shows
nothing at all. It used to be previewed as a bite out of a blot of ink that
nobody had drawn — a mark invented for the preview so that the preview would
have something to show. The nib is round and the number is the nib, so the
circle is both the simpler drawing and the truer one.

Every one of them is drawn at **life size**: one document pixel to one device
pixel, which is the page at 100%. Set the pen to 0.5 mm and the dot on the size
button is the dot it draws; pick a marker off the width row and the blot in the
button is the blot that lands. A nib too big for its button — a 10 mm block
eraser, an inch-wide flat — hangs over the edge and is clipped, which is the one
thing worth saying about a nib that size.

It used to be fitted instead: the size button and each row were scaled down
until the _broadest_ width the tool is made in fitted its tile. That drew a
handsome row, and it made every mark on it a different lie — against a rack that
runs up to a decorator's brush the fine end came out several times the mark it
draws and the broad end a fraction of it, so the same 0.5 mm pen previewed
three times too big and a marker three times too small. Ratios are what the
numbers under the row are for; the picture's job is the size.

The size button is also the full width of the button now, the same box the
colour swatch beside it fills, because at life size the room is the thing there
is never enough of.

Type has always worked this way and it is why (`sizePreview: "life"`): an "A" is
the same letter at 10 pt and at 48 pt, so a row fitted to its own cells drew five
identical letters and told you nothing about any of them. Its samples are hung
from the corner where the letter meets its baseline rather than centred, so what
survives the clipping is the part of a letter you read a size off.

The one place a mark is still fitted is a **preset chip**, where the picture sits
beside a name in a line of text: a chip is about what "wet-in-wet" or "dry
brush" does to a mark, not about how wide it is, and at eighteen pixels a
life-size preset would be a solid square every time.

A tool has nothing to add for this. The simulation drives the contract every
tool already implements: `start` at a point and `end` is what a press _is_; a
tool that drops a press because its mark needs two anchors (the shapes) is given
the shortest gesture that does leave one; a tool that reads the page is lent one
(`ToolContext.probe`), which is how the bucket previews a real feathered fill;
and `entersText` is the flag that says to ask for a caption instead. A tool
whose press leaves nothing at all falls back to the same plain dot the circled
tools use.

How far past its own geometry a medium's ink actually reaches — an airbrush cone
is over three times its nib — is **measured** rather than declared: the mark is
painted once into an off-screen tile and read back as the box its pixels reach.
That is what keeps the preview right for a painter nobody has written yet.

## Every tool tunes differently

The size button opens the widths, and under them an **Advanced** section holding
the knobs belonging to the tool in your hand. Width is the only control most
tools share; past it a paintbrush and a highlighter have nothing in common, and
a hardness slider shown to the highlighter was a control that did nothing
sitting where a control that did something should be.

The section is a **heading, not a fold**. It was a disclosure to begin with, on
the reasoning that the panel should stay the one slider a hand reaches for
mid-stroke — but a fold you open every time you open the panel is not a saving,
and a dot beside a collapsed heading is a poor way of saying "this tool is set
differently from how it ships" when showing the sliders says it outright. For a
tool with no width (the bucket), the same section _is_ the panel, opened from
the cog and headed with the tool's own name.

So a tool declares its own, and the bar is high: the panel is something you
reach into mid-drawing, with one thumb, so a dial has to change what the mark
_is_ rather than restyle what another dial already did. For most tools that is
one or two. The paintbrush is the exception and earns it — a head of hair is
loaded or dry, dipped with much or little paint, squeezed toward a blade or
left round, and turned one way or the other when it is a blade, and no one of
those four is any of the others. Its fifth is not a fifth thing about the
brush at all: it is how hard your hand is bearing on it, which is the axis a
round brush is bought for and the one a stylus will one day move for you.

| Tool                | Advanced                                      |
| ------------------- | --------------------------------------------- |
| **Paintbrush**      | hardness, load, flatness, nib angle, pressure |
| **Watercolour**     | water, pigment, granulation                   |
| **Airbrush**        | hardness, flow                                |
| **Pencil**          | lead, pressure                                |
| **Crayon**          | pressure                                      |
| **Chalk**           | pressure                                      |
| **Marker**          | opacity, chisel                               |
| **Highlighter**     | opacity, chisel                               |
| **Calligraphy pen** | nib angle, ink                                |
| **Eraser**          | strength                                      |
| **Rubber**          | pressure                                      |
| **Paint bucket**    | opacity, feather — behind its cog             |
| **Gradient**        | opacity, feather — behind its cog             |
| **Dropper**         | sample size — behind its cog                  |
| Pen, shapes, text   | opacity                                       |
| Hand, select        | nothing — no section appears                  |

**The simulated media have no opacity, on purpose.** The pencil, the paintbrush,
the watercolour brush, the crayon, the chalk and the broad nib do not draw a
line and tint it — each works its mark out from a physical model, and each
already has the dial that makes one lighter the way that medium does: the hand
on the pencil, the crayon and the chalk, the pigment in the water, the dip on
the brush and on the nib. A
flat alpha over the finished mark is a different picture at the same greyness —
it fades the paper back out of the mark, which is the one thing the simulation
is there to put in — so those tools offer the medium's own control and not both.
Marks drawn before this carry their opacity still, and paint exactly as they
did.

Most of them are sliders. A dial with a handful of values is **pressed**
instead: there is nothing between a 2B and a 3B, so the pencil's lead is a row
of chips — 8H through 9B, the fifteen grades a shop sells — rather than a slider
to hunt along until the readout says the right thing.

Each one is wired to something the painter actually does. **Hardness** is how
wet and gathered the paintbrush's bundle is, and it is the brush's main
control: turned up it is a loaded head that covers solidly, turned down a
spent one that leaves most of its length in streaks. **Load** is how much
paint the dip took — the reservoir the whole drag spends, so a starved dip is
dry-brush within a stroke and a heavy one crosses most of a page.
**Flatness** is how far the ferrule squeezes the head toward a blade: the
round at rest, the one-stroke flat all the way up, the filbert between — and
**nib angle** is which way that blade is turned, the same dial the broad nib
carries. **Pressure** is the hand rather than the brush: on the point a round
lays a fine, tidy line, leaned on it spreads out of its ferrule into a wide
one whose sides wander and whose strands come apart — and it empties the head
sooner, because a wider band is more paint off the same dip. The flat barely
moves; the cone is what has a belly to put down. (The old hair, splay and bleed dials went with the vector painter
they tuned: the simulation grows its streaks and its soft edges out of the
sheet itself, so marks drawn with them still read them only where the old
painter still draws — at sizes too small for the field.) **Flow** is the airbrush's
trigger, and because its coverage
is built from overlapping passes rather than one opaque dab, turning it down
really does mean more passes. **Pressure** is how hard the crayon bears down:
wax only sticks to the peaks it is pressed onto, so a light hand leaves the
paper's speckle showing and a heavy one fills the valleys in — and the **rubber
carries the same word for the other end of the same idea**, how far into that
tooth its face deforms, which fades the ghost a rubbing out leaves rather than
removing it. **Softness** is which stick of wax is in the crayon — the hard
end a china marker, the soft end an oil pastel — reaching how deep the face
digs and how freely it crumbles, so a softer stick is a fuller, creamier mark
and never a wider one. **Lead** is the
pencil's grade, by name — 8H is hard and pale and rides the paper, 9B is soft
and dark and fills its tooth in — and like pressure it reaches the deposit
rather than the width. **Water** is how charged the watercolour brush is: turned
up the mark spreads past the hair, both edges wander off the gesture and what is
left in the middle is dilute; turned down it is nearly dry-brush. **Pigment** is
how much colour is dissolved in that water, and it is how a wash is made pale:
turning a whole mark down would dim the rim and the granulation with it, while
thinning the pigment leaves the sheet's own work at full strength and only the
stain weaker — which is what a glaze is. **Granulation** is the paper and the colour
rather than the brush: ultramarine on rough stock mottles enough to see across a
room, phthalo on hot-pressed does not mottle at all. **Chisel** is the shape
of a felt tip, from a round bullet to a flat wedge, and **nib angle** is the
tilt a broad nib is held at, in degrees. **Strength** is how much of a mark one
pass of the eraser takes off: it is the ink's own alpha under `destination-out`,
so turning it down gives you the pencil eraser you knock a highlight back with
rather than the one that takes the page to white in a single drag. **Feather** fades
the bucket's edge out over a few millimetres instead of stopping it, which turns the
tool into a way of laying a soft wash behind a sketch — and it stays a vector
fill, so the fade holds at eight hundred percent.

The settings are **per tool** and they stick: a soft brush is soft the next time
you pick it up, and it did not also make the airbrush soft. **Reset** appears
beside the heading once a tool is off its defaults, and puts it back; on the
bucket's cog, where the sliders are behind a glyph rather than in the open, a
dot on the button says the same thing.

Marks remember what they were drawn with, the way they remember their colour and
their width, so re-tuning a dial never re-draws work you already did. And a dial
left alone is recorded nowhere at all — a drawing made without touching one is
exactly the document it would have been.

## Some settings are about the painting, not the next mark

A dial tunes the mark you are about to make. A tool can also declare an
**option**, and that is a different animal: it says how marks of its kind are
_painted_, for every drawing you own, including the ones already made. The
watercolour brush and the pencil have one each today — how finely the simulation
behind them works a mark out — and they sit in the same panel as that tool's
dials, under **Rendering**, above them.

They are in the tool's own panel because that is where the answer is: how a mark
is worked out is a property of the implement rather than of the app, and it is a
trade nobody can judge by reading about it. (They used to be a section of
Settings → Tools.)

Both tools used to declare a second option beside it: **which** of two engines
painted their marks, offered as a pair of swatches of the same stroke. Those are
gone — there is one watercolour and one pencil now — and the mechanism that
served them is worth keeping in mind even so, because it is still in the
interface: an option may be a **choice** rather than a slider, its answers may
carry a painted preview, and one option may be hidden behind another's answer
(`shownWhen`). No shipped tool uses any of that today. A plugin seam that lost
half of itself the moment the app stopped needing that half would be a worse
seam.

Nothing about an option is recorded on a mark, and that is the point: a setting
kept per stroke would mean changing it orphaned everything drawn before. It is a
way of looking at the page, like the canvas theme — so a wash painted at one
detail repaints at whichever is in force when the page is next painted, and a
phone that cannot afford the full field still opens a page painted at it on a
desktop.

## The fills and the dropper read the page

Some tools need to know what is actually painted, not what was drawn — the
dropper wants the colour under your finger, the bucket and the gradient want the
shape of the area under it, and a stroke list can't answer either after twenty
passes of a translucent highlighter. So the canvas hands them a narrow window
onto its own raster (`ToolContext.probe`), taken once per press from the same
renderer the screen and the PNG export use.

**How much** of that raster one press reads is the dropper's own setting. Its
sample size runs from the single pixel under the pointer to a disc eight
millimetres across, and the wider settings are what make it usable on anything
textured: aim at an airbrushed passage and the one pixel under the pointer is a
speck of spray, where the average over the disc is the colour the passage reads
as.

The bucket then throws the pixels away. It floods the snapshot, traces the
outline of what it flooded, and files _that_ as an ordinary vector stroke — so a
fill scales, undoes, exports and syncs like a rectangle does, and holds a clean
edge at eight hundred percent. An island of marks inside the flooded area comes
back as a loop of its own and stays unpainted, because the fill is painted with
the even-odd rule.

## Switching one on

The way in is the last button on the toolbar: a **…** in a dashed slot at the
end of the tool row, which opens Settings straight on its Tools section. It is
the one button in that row that picks no tool — it is there because the toolbar
can only show the tools that are switched on, and the rest of the box should not
have to be discovered through a menu.

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
   without being asked for, `defaultSize` for the width it opens at, `gauge`
   for the sizes it is really made in (see `plugins/builtin/gauges.ts` — the
   range, the five buttons, and the trade's name for each), `dials` if it has
   anything of its own to tune, `swatches` if it mixes inks of its own rather
   than drawing with the toolbar's (or `fixedInk` if its colour is what it is
   made of and no palette can reach it), `options` if it has a setting about how
   its marks are painted rather than about the next one (see above), `presets` if its medium has more than one
   way of being held (and if it has exactly one, make that its defaults instead
   of a row of one chip), and `group` if it belongs to a family
   that already has a button (a twelfth shape is one line in the `SHAPES`
   table). A tool with no width says `sizeless` and gets the cog instead of the
   size button; one whose mark cannot picture itself says
   `sizePreview: "circle"`, and one whose preview has nothing to say but the
   number says `sizePreview: "life"`.
3. Add those two strings to `src/app/i18n/en.ts` (and `sv.ts`) — plus one per
   preset, under `presets.<tool id>`. Keep the panel's own copy short: a control
   that has to be explained in the panel every time it is opened belongs in
   `docs/` with a label on it.

Externally-loaded plugins are not implemented yet. When they land they register
through this same interface rather than a second, parallel one — which is the
reason the built-in tools go through it today.
