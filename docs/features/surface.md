# The surface you draw on

A page has a colour and it has a **material**, and until now this app only had
the colour. Settings → Canvas now asks what the page is made of: a solid digital
sheet, one of seven papers, or primed canvas. The choice belongs to the drawing
— it travels with it, syncs with it, and undoes like any other page edit — and
it is set with the page colour rather than beside it, because a cream sheet and
a rough sheet are two unrelated questions and every combination of them is a
real page.

It matters because the sheet is not a backdrop. **Watercolour on paper is a
different mark from watercolour on glass**, and so is a marker on newsprint. So
the surface does three things, and only the first is decoration.

**It has a grain.** Each stock carries its own, at the size it would measure
under a rule at 1:1: the fine dip of hot-pressed paper, the deep tooth of rough,
the ribs of a laid sheet, the over-and-under of cotton duck. The grain is
painted under the marks, which is why it shows _through_ a wash in proportion to
how transparent the wash is and not at all through an opaque line — the thing
that makes paper look like paper. Pull the page away far enough and it fades out
rather than turning into static. **Grain** turns how much of it shows up or
down; it changes what you see and never how the sheet behaves.

**It decides whether paint sits on top or soaks in.** A sealed sheet holds paint
on its face, so a second pass covers the first. Paper takes the water into its
fibres, so paint goes _into_ the sheet and mixes with whatever is already in
there. On paper a red wash over a blue one comes out purple; on the solid sheet
it comes out red. A wash over a pencil line leaves the pencil showing through.
On a dark page the same thing runs the other way — the marks add up towards
light instead of down towards black — so a wash on a black sheet still reads as
a wash.

**It lets a wet mark disturb what it crosses.** Water goes through what is under
it and carries some of it along, so an ink line a wash crosses feathers out into
the water instead of sitting crisply beneath it. That is also what makes the
**order** you painted in visible: red then blue is not the same picture as blue
then red, because each wash can only lift what was already there. Working in
passes — glaze, let it take, glaze again — is the way to use it, which is how
the medium is actually worked.

## Wet tools and dry ones

How wet a tool is belongs to the tool, and it is multiplied by how thirsty the
sheet is. Both ends of that matter: a dry pencil on blotting paper disturbs
nothing, and a loaded brush on a sealed page behaves exactly as it always has.

| Tool                               | On paper                                              |
| ---------------------------------- | ----------------------------------------------------- |
| **Watercolour**                    | The wettest thing in the box — mixes, bleeds, spreads |
| **Round and flat brush**           | Mixes into what it is over; its edges wick            |
| **Marker, highlighter, broad nib** | Soak in; on newsprint they go furry                   |
| **Pen**                            | Dry on any sized paper, feathers on newsprint         |
| **Paint bucket**                   | Lays a wash: mixes with the marks it floods over      |
| **Airbrush**                       | Nearly dry by the time it lands                       |
| **Pencil, crayon, eraser**         | Dry — a wash laid over wax goes round it              |

## Layers keep the water apart

Wet mixing happens **within a layer**. A wash mixes with the marks on its own
sheet of the stack and leaves the layers below alone, so putting something on
another layer is how you keep it out of the water — an ink drawing that must
stay crisp goes above the washes, and a wash that should mix with everything
goes on the same layer as it.

The trade is the one a filtered layer already makes: a layer whose marks mix is
composited as a unit, so a rubbing out on it takes off that layer's ink and
shows the layers below rather than cutting through to the sheet.

## What it costs, and what it doesn't

A drawing with no surface set — every drawing until you pick one — is on the
solid sheet, and the solid sheet is byte-for-byte and pixel-for-pixel the page
this app always had. Nothing about existing work changes, and putting a page
back on **Solid** puts it back exactly.

On a sheet that soaks, finishing a wet stroke repaints the page rather than
stacking one more mark onto the cached picture, because a mark that mixes has to
mix with the same things it will mix with next time. On a busy page that is a
beat when you lift the brush.

The grain travels into PNG and JPG exports, which are pixels. It is left out of
an **SVG** export, where the marks and the page are vectors and a field of noise
is not — the file gets the drawing on a plain sheet.
