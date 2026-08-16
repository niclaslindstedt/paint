// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The plugin seam.
//
// Every tool in the app — the pencil included — is a plugin: a descriptor with
// an id, a label, an icon, and a behaviour that turns pointer gestures into
// strokes and paints them. The app core knows nothing about pencils or
// rectangles; it renders whatever the registry hands it (see `registry.ts`).
//
// Three kinds of plugin exist, and the difference is *only* how they are
// switched on:
//
//   - `core: true`      always available, always in the toolbar, no switch.
//   - `defaultOn: true` in the toolbar out of the box, but switchable off.
//   - otherwise         opt-in — the user turns it on under Settings → Tools,
//                       and it joins the toolbar (see `useAppSettings`'s
//                       `enabledPlugins`).
//
// …plus one that is not a tool at all: a `hidden` plugin has no button anywhere
// and offers no gesture. It exists to paint a mark that arrives another way —
// today, an image dropped onto the canvas.
//
// A plugin may also join a **group** (`ToolGroup`): a family of tools that share
// one toolbar button and one switch. The shapes are the case — eleven of them
// would be eleven buttons and eleven switches for one idea — so they register as
// eleven plugins (each keeps its own painter, its own width, its own persisted
// id) and are *offered* as one. Grouping changes nothing about a stroke: a
// rectangle is still drawn by the `rectangle` plugin and still records it.
//
// That is the whole extension story for now, and it is deliberately the *same*
// contract the built-in tools use: when externally-loaded plugins land later,
// they register through this interface rather than a second, parallel one.

import type { ReactNode } from "react";

import type { GroundProfile } from "../ground.ts";
import type { Rect } from "../geometry.ts";
import type { Point, Stroke } from "../types.ts";
import type { TKey } from "../i18n/index.ts";
import type { SizeGauge } from "./gauge.ts";
import type { WashEngine } from "./wash.ts";

/** A stroke that hasn't been committed to the document yet — the live gesture.
 *  It has no id until the store files it. */
export type DraftStroke = Omit<Stroke, "id">;

/** A read of what is actually *painted* on the page right now.
 *
 *  Two tools need one — the colour dropper wants the colour under the pointer,
 *  the paint bucket wants the shape of the area under it — and neither can get
 *  it from the document: a stroke list says what was drawn, not what ended up
 *  on top. So the canvas hands the tools this narrow window onto its own
 *  raster, and the tools stay ordinary pure behaviours over it (a test supplies
 *  a fake probe and drives the whole gesture with no DOM).
 *
 *  Both reads are snapshots of the page *without* the gesture in flight, and
 *  both are `null` when the point is off the page or the browser refuses the
 *  pixels (a tainted canvas). */
export type CanvasProbe = {
  /** The colour painted at `p`, as `#rrggbb`.
   *
   *  `radius` — in document pixels — reads an *average* over the disc that wide
   *  around `p` instead of the one pixel under it, which is what a dropper set
   *  to sample more than a point asks for: on a sprayed or a textured passage
   *  the single pixel under the pointer is a speck of one of the colours there,
   *  and the average is the colour you can see. Absent (or 0) is the single
   *  pixel, which is what every other caller wants. */
  colorAt(p: Point, radius?: number): string | null;
  /** Closed outlines of the connected area of like colour containing `p`, in
   *  document coordinates — what a bucket fill would cover. */
  regionAt(p: Point): Point[][] | null;
};

/** One tunable a tool offers past its width — what the size panel puts under
 *  **Advanced** when that tool is in your hand.
 *
 *  A dial is declared by the plugin, so the panel needs to know nothing about
 *  which tool it is drawing controls for: a paintbrush offers hair gauge, an
 *  airbrush offers flow, a crayon offers pressure, and the picker just renders
 *  whatever the descriptor lists.
 *
 *  Values are usually **fractions of the tool's own normal**, so 1 is "the way
 *  this tool draws" and the panel reads the dial out as a percentage; one that
 *  measures a real distance on the page (the bucket's feather) carries document
 *  pixels instead and says so with `unit`.
 *
 *  Either way a mark records only the dials that were actually moved: absent
 *  means `default`, which is what every painter's own default argument already
 *  is. A drawing made without touching a dial is byte-for-byte the document it
 *  was before dials existed. */
export type ToolDial = {
  /** Stable id. It is persisted — in the settings blob and on every stroke
   *  drawn off-default — so renaming one forgets that tuning. */
  id: string;
  /** Catalog key for the label, interpolated with `{value}`. The unit belongs
   *  in the string itself ("Opacity: {value}%", "Feather: {value} px") — it is
   *  part of the sentence, and not every language puts it in the same place. */
  nameKey: TKey;
  /** Catalog key for the one line under the slider saying what it does. */
  hintKey: TKey;
  min: number;
  max: number;
  step: number;
  /** How the number reads. A fraction of the tool's normal shows as a
   *  percentage (the default); a dial that measures a real distance on the page
   *  shows the millimetres it is; one that measures a *tilt* — the angle a flat
   *  nib is held at — shows degrees. `px` is the raw document pixel, kept for a
   *  dial that is about the raster rather than about the page. */
  unit?: "percent" | "px" | "mm" | "deg";
  /** What the tool draws at untouched. 1 unless a dial's natural rest is
   *  somewhere else — and whatever it is, the painter's own default argument
   *  has to agree, because that is what an absent value resolves to. */
  default?: number;
  /** The values this dial actually has, when it has a handful rather than a
   *  range — and then the panel offers them as a row of chips instead of a
   *  slider.
   *
   *  Some tunings are not continuous. A pencil is graded 8H to 9B and there is
   *  nothing between a 2B and a 3B; a brush head is round or flat and there is
   *  no such thing as 60% flat. Asking someone to find 4B by dragging a slider
   *  until the readout says "4B" is asking them to hunt for a value they could
   *  simply have pressed — so a dial with `choices` is pressed.
   *
   *  The stored value is still an ordinary number on `ToolContext.dials` and on
   *  the stroke, so a painter reads a chipped dial exactly as it reads a
   *  dragged one and nothing downstream knows the difference. `label` is a
   *  designation rather than a word (`4B`, `#6`), which is why it is a plain
   *  string and not a catalog key. */
  choices?: readonly { value: number; label: string }[];
};

/** A picture of what one answer to a `ToolOption` does, painted by the tool that
 *  offers it.
 *
 *  The context arrives already scaled so that the option's `sample` box fills
 *  it, and the ink and the page are the ones the toolbar is holding — so a
 *  preview is the mark this answer would make, on your page, in your colour,
 *  the way the width row's presses are (see `toolbar/PressPreview.tsx`).
 *
 *  It is a callback rather than a declaration because a picture of an answer is
 *  the tool's own business: the panel that draws it must not learn what a wash
 *  engine is to show one. */
export type ToolOptionPreview = (
  ctx2d: CanvasRenderingContext2D,
  look: { color: string; background: string },
) => void;

/** One answer to a `ToolOption` — a value, what to call it, and (where there is
 *  one worth painting) a picture of what it does. */
export type ToolOptionAnswer = {
  /** What is stored when this answer is picked. */
  value: string;
  nameKey: TKey;
  /** The line under the name saying what this answer is for — including what it
   *  costs, which is the honest half of a choice between a cheap way and an
   *  expensive one. */
  hintKey: TKey;
  preview?: ToolOptionPreview;
};

/** One app-wide setting a tool offers — shown in the tool's own panel, beside
 *  its dials, and stored in the app settings rather than on a stroke.
 *
 *  A dial is *how this mark is made* and rides on the stroke for good; an option
 *  is **how marks of this kind are painted**, for every drawing, including the
 *  ones already made. The watercolour engine is the case that made the seam:
 *  which of the two watercolours a build paints with is a rendering choice, not
 *  a property of any wash, so recording it on a stroke would mean changing it
 *  orphaned every wash drawn before (see `plugins/wash.ts`).
 *
 *  It used to live on a page in Settings, and that was the wrong place twice
 *  over: it is a property of the brush rather than of the app, and it is judged
 *  by *painting with it* — which means it belongs where your hand already is
 *  when you are painting, under the widths.
 *
 *  The value lives in the settings blob under this option's `id`, which is a
 *  settings key by construction (see `plugins/options.ts`). That is the whole of
 *  the wiring: a tool declares its options, the panel renders whatever it
 *  declared, and nothing outside `plugins/` learns one by name. */
export type ToolOption = ToolOptionChoice | ToolOptionRange;

type ToolOptionCommon = {
  /** Stable id, and the settings key the value is kept under — so renaming one
   *  forgets the choice. */
  id: string;
  /** Catalog key for the label above the control. A range interpolates
   *  `{value}` with its percentage, the way a dial's does. */
  nameKey: TKey;
  /** Shown only while another option is on a given value — how a setting that
   *  belongs to *one answer* stays out of the way of the rest. The wash detail
   *  is one: it says how finely the simulation resolves, and there is nothing
   *  for it to say while the stroke engine is painting. */
  shownWhen?: { option: string; is: string };
};

export type ToolOptionChoice = ToolOptionCommon & {
  kind: "choice";
  /** The answers, in the order the panel lays them out: the default first. */
  answers: readonly ToolOptionAnswer[];
  default: string;
  /** The page a preview paints on, in document pixels. Big enough that a real
   *  width and a real paper grain are both themselves at the size the swatch is
   *  drawn at; the panel scales it down to fit. */
  sample?: { width: number; height: number };
};

export type ToolOptionRange = ToolOptionCommon & {
  kind: "range";
  min: number;
  max: number;
  step: number;
  default: number;
  /** Catalog key for the line under the slider. */
  hintKey: TKey;
};

/** One ink a tool mixes for **itself**, past the one the toolbar holds — what
 *  the tool's own settings panel offers as a row of swatches.
 *
 *  A dial is a number and this is a colour, and the pair are otherwise the same
 *  idea: the plugin declares them, the panel renders whatever it declared, the
 *  settings blob keeps a value per tool per swatch, and nothing outside
 *  `plugins/` learns one by name (see `plugins/swatches.ts`).
 *
 *  Declaring any of them says something else as well, and it is the reason they
 *  exist: **this tool does not draw with the toolbar's ink.** A gradient is
 *  poured from its own two or three colours, so the ink button is struck
 *  through and disabled while it is in hand — the same honesty the toolbar
 *  already shows for a tool that lifts ink or moves the view (see
 *  `plugins/controls.ts`). */
export type ToolSwatch = {
  /** Stable id. It is persisted — in the settings blob, and on every mark the
   *  tool pours — so renaming one forgets that colour. */
  id: string;
  /** Catalog key for the label above the row. */
  nameKey: TKey;
  /** The colour it rests at. Absent means **no colour**, which is a real answer
   *  for a swatch that has one: a gradient's middle stop is normally off, and
   *  the ramp runs straight from one end to the other. */
  default?: string;
  /** True when "none" is one of this swatch's answers — the panel then offers a
   *  way back to it, and the tool reads the colour as absent. */
  optional?: boolean;
};

/** One of the settings a tool **ships with** — a whole way of holding it, under
 *  a name its maker chose.
 *
 *  A width and five dials is a lot of decisions, and a beginner has no way of
 *  knowing which of them are a *tool* and which are noise. "Dry brush" is a
 *  tool: a splayed head, the hardness right down, the opacity eased off. Nobody
 *  arrives at it by dragging five sliders and seeing what happens — they arrive
 *  at it by being handed it. So a plugin declares the handful of settings its
 *  medium is actually used at, and the panel offers them as chips above the
 *  ones the user saved for themselves (see `plugins/presets.ts`).
 *
 *  Three rules hold the set together, and the first is the one that keeps this
 *  from becoming a second dial:
 *
 *    - **One preset is a tool, not a number.** It has to differ from its
 *      neighbours in what the mark *is* — a wet wash against a dry-brush
 *      scumble — and not in one slider being a notch along. A tool whose
 *      must-haves come to a single setting ships **no presets at all**: that
 *      setting is its `defaultSize` and its dial defaults instead, which is
 *      what a default is *for*. That is why the shapes and the text tool have
 *      none.
 *    - **One of them is the tool as it comes.** Every tool that ships presets
 *      ships one that is exactly its own defaults, first in the row — so the
 *      panel opens with a chip already lit, which is how anyone learns what the
 *      row is, and so "put it back" is one press.
 *    - **Only what it moves.** A preset names the dials it has an opinion
 *      about; the rest resolve to their defaults when it is applied, so adding
 *      a dial to a tool later does not mean editing every preset it has.
 *
 *  Unlike a saved tool, this is not persisted anywhere: it is a *reading* of
 *  the plugin, so a build that retunes one retunes it for everybody, and a chip
 *  applied yesterday leaves no trace beyond the width and dials it set. */
export type BuiltinPreset = {
  /** Stable id, unique within the tool. Not persisted — the chip is a button,
   *  not a state — but it is the panel's key and the tests' address. */
  id: string;
  /** Catalog key for the name on the chip. A catalog key rather than a string
   *  because "Dry brush" is a word, and a tool's presets are read by whoever
   *  the app is in the language of. */
  nameKey: TKey;
  /** The width it sets, in document pixels. Absent only for a tool that has no
   *  width (see `PresetSettings`). */
  size?: number;
  /** The dials it has an opinion about, by dial id. Everything the tool offers
   *  and this does not name comes back to that dial's default. */
  dials?: Readonly<Record<string, number>>;
};

/** The ink the toolbar currently has selected, handed to a tool on every step
 *  of a gesture so it can build its draft. The page background travels with it
 *  because tools like the eraser paint *with* it. */
export type ToolContext = {
  /** The picked ink, or `null` when the user hasn't picked one — a stroke then
   *  records no colour and resolves it at paint time (see `Stroke.color`). */
  color: string | null;
  size: number;
  /** The active tool's dials, and **only the ones moved off their default** —
   *  see `dials.ts`. A behaviour reads them as `ctx.dials.flow ?? 1`, so a tool
   *  that was never tuned builds exactly the draft it always did. */
  dials: Readonly<Record<string, number>>;
  /** The tool's own inks, by swatch id — see `ToolSwatch`. Absent, or missing an
   *  id, means "the colour that swatch rests at": a behaviour reads them through
   *  `inkOf` (see `plugins/swatches.ts`), so a tool nobody has re-coloured pours
   *  exactly what it ships with. */
  colors?: Readonly<Record<string, string>>;
  /** The shape tools' fill toggle. Ignored by tools that only stroke. */
  filled: boolean;
  /** The active drawing's page colour. */
  background: string;
  /** A read of the painted page, when the caller can offer one (the canvas
   *  can; a test need not). A tool that needs it must cope with its absence by
   *  beginning no stroke. */
  probe?: CanvasProbe | null;
};

/** Where a stroke is landing: how finely it is being rasterised, and what it is
 *  being rasterised *onto*.
 *
 *  The first half is everything a painter needs to stop drawing detail nobody
 *  can see; the second is the sheet, which several painters have a great deal to
 *  say about (a wash spreads further on thirsty paper and mottles into its
 *  tooth). Both are resolved once per repaint by the renderer and handed down.
 *
 *  A vector document is painted at wildly different sizes: fitted to the screen,
 *  zoomed to 800%, and at 1:1 into the PNG export. A painter that ignores that
 *  does the same work every time, and at a fitted zoom most of it lands inside a
 *  single device pixel — an airbrush laying three hundred overlapping cones
 *  across a mark two pixels wide, fifty bristles combed through a hair.
 *
 *  So the renderer measures the transform once per repaint and hands it down.
 *  What a painter does with it is the painter's business — the rule is only that
 *  detail below a device pixel is worth nothing, and the ones that respect it
 *  are the reason a busy page still pans at speed. */
export type PaintDetail = {
  /** Device pixels per document pixel. 1 at 1:1, 0.4 fitted to a phone, 8
   *  zoomed in. Never zero. */
  scale: number;
  /** The sheet this mark is landing on (see `ground.ts`). Absent means the
   *  plain solid page — no grain and nothing absorbs — which is what every mark
   *  in this app landed on before grounds existed, so a painter that reads it
   *  and a painter that ignores it both keep drawing what they always drew. */
  ground?: GroundProfile;
  /** Which watercolour engine is in force (see `plugins/wash.ts`). A *view* of
   *  the drawing rather than anything in it — like the canvas theme — so it is
   *  handed down with the scale and the sheet rather than recorded on a mark.
   *  Absent is the simple engine, which is what every painter called directly
   *  gets and what this app has always painted. */
  wash?: WashEngine;
  /** …and how finely that engine resolves, where it resolves anything at all
   *  (see `MIN_WASH_DETAIL`). Handed down beside the engine and for the same
   *  reason: it changes the picture, so every surface painting the same document
   *  has to be told the same number. Absent is all of it. */
  washDetail?: number;
  /** The only part of the page this paint will be **kept**, in document
   *  coordinates — the window, a strip of it coming into view under a drag, or
   *  the patch a gesture has just grown into (see `trail.ts`). Absent means all
   *  of it, which is what an export asks for.
   *
   *  The renderer already skips whole marks that cannot reach it
   *  (`geometry.ts`); this hands the same box *down into* the painter, for the
   *  ones that build a mark out of hundreds of small stamps. An airbrush stroke
   *  across a page is a few hundred cones, and repainting a thumbnail-sized
   *  patch of it should cost the cones in that patch rather than all of them.
   *
   *  It is a permission to skip, never an instruction to clip: a painter that
   *  ignores it draws exactly what it always drew, and one that honours it must
   *  only ever drop stamps that could not have landed inside the box anyway. */
  clip?: Rect;
};

/** The detail a painter assumes when it is handed none — 1:1 onto a plain
 *  sheet, i.e. draw everything and let the paper do nothing. A painter called
 *  directly (a test, a one-off) then behaves exactly as it did before the
 *  renderer measured anything. */
export const FULL_DETAIL: PaintDetail = { scale: 1 };

/** What a tool does with a pointer gesture, and how its strokes are painted.
 *
 *  `start` / `move` / `end` are pure: they take the draft so far and return the
 *  next one, so the canvas can re-render a gesture at any time (and a test can
 *  drive a whole stroke with no DOM). */
export type ToolBehaviour = {
  /** Begin a gesture at `p`. Returning `null` ignores the press. */
  start(p: Point, ctx: ToolContext): DraftStroke | null;
  /** Continue the gesture. Returns the updated draft. */
  move(draft: DraftStroke, p: Point, ctx: ToolContext): DraftStroke;
  /** Finish the gesture. Returning `null` discards it — how the shape tools
   *  drop a zero-size click. Defaults to committing the draft as-is. */
  end?(draft: DraftStroke, ctx: ToolContext): DraftStroke | null;
  /** What a finished gesture **chose**, as closed contours in document
   *  coordinates — asked only of a tool whose descriptor carries `selects`, and
   *  only of the draft that tool's own `end` returned.
   *
   *  It is the one question a selection tool answers past the ordinary three,
   *  and it is what lets the family be more than a rectangle: a box hands back
   *  its four corners, an oval the ellipse it inscribes, a lasso the loop you
   *  drew, and the tracing tool the outline of whatever is painted under the
   *  press. The screen takes contours and nothing else (see `selection.ts`), so
   *  a tool can choose marks with any gesture it likes without the canvas, the
   *  store or the screen learning a new shape.
   *
   *  `null` for a gesture that chose nothing — a press that never moved, a trace
   *  that found no area — which is what clears the selection. */
  selection?(draft: DraftStroke): Point[][] | null;
  /** What a press **reads off the page** — asked only of a tool whose descriptor
   *  carries `picksColor`, and instead of beginning a gesture.
   *
   *  It is the dropper's whole job, and it is a question the tool has to answer
   *  rather than the canvas, because *how much page* a sample covers is the
   *  tool's own setting: a dropper set to average a nine-pixel disc reads its
   *  radius off its dials, and the canvas would have to know that dial's name to
   *  do it (see `plugins/builtin/dropper.ts`). Pure over `ToolContext.probe`, so
   *  a whole sample can be driven in a test with no DOM.
   *
   *  `null` for a press that read nothing — off the page, or a browser that
   *  refused the pixels — and the ink is then left alone. A `picksColor` tool
   *  that offers none falls back to the plain colour under the pointer. */
  pick?(p: Point, ctx: ToolContext): string | null;
  /** Paint one stroke onto a 2D context, in document coordinates. Called for
   *  committed strokes and for the in-flight draft alike.
   *
   *  `detail` says how big the mark is about to come out on the device it is
   *  bound for. Honouring it is optional — a painter that ignores it is correct,
   *  just slower than it needs to be at a fitted zoom. */
  paint(
    ctx2d: CanvasRenderingContext2D,
    stroke: Stroke,
    detail?: PaintDetail,
  ): void;
};

/** A family of tools that share one toolbar button and one switch.
 *
 *  A group is *how tools are offered*, never how they are drawn or stored: its
 *  members stay ordinary plugins with their own ids, painters, widths and dials,
 *  and a stroke drawn by one still names that plugin. What the group replaces is
 *  the row of near-identical buttons — press it once for the shape you had, once
 *  more for the rest of the family (see `toolbar/GroupPicker.tsx`).
 *
 *  Switching it on or off in Settings → Tools switches the whole family, which
 *  is the only setting eleven shapes ever wanted between them. */
export type ToolGroup = {
  /** Stable id. It is persisted — in the enabled list and in the toolbar's
   *  order — but never on a stroke, because a group draws nothing. */
  id: string;
  /** Always offered, like a `core` plugin: no switch, because there is nothing
   *  to switch. */
  core?: boolean;
  /** In the toolbar out of the box, but switchable off. */
  defaultOn?: boolean;
  nameKey: TKey;
  descriptionKey: TKey;
  /** The glyph the settings row wears. The *toolbar* button wears the member's
   *  own glyph instead — the button is the shape you are holding, not the idea
   *  of a shape. */
  icon: (props: { className?: string; filled?: boolean }) => ReactNode;
};

/** A tool plugin: what the toolbar shows, what Settings → Tools lists, and the
 *  behaviour behind it. */
export type PaintPlugin = {
  /** Stable id. It is persisted on every stroke this tool draws, so renaming
   *  one orphans past strokes — pick it once. */
  id: string;
  /** Always-on tools are `core` — they carry no switch in Settings → Tools
   *  because there is nothing to switch: a canvas with no pencil, no eraser and
   *  no way to move the page is not a canvas. */
  core?: boolean;
  /** Switchable, but on out of the box — the tools a first run should already
   *  have in its hand. Ignored on a `core` plugin, which is on regardless. */
  defaultOn?: boolean;
  /** The id of the `ToolGroup` this tool belongs to, if any. A grouped tool
   *  shares one toolbar button and one switch with the rest of its family, so
   *  its own `core` / `defaultOn` are the group's to answer — see `ToolGroup`. */
  group?: string;
  /** Catalog keys for the toolbar tooltip and the settings row. */
  nameKey: TKey;
  descriptionKey: TKey;
  /** Toolbar glyph. A tool that `supportsFill` is asked for a solid version of
   *  it too (`filled`), which is what the fill picker shows in place of words;
   *  a glyph that ignores the flag simply draws the same either way. */
  icon: (props: { className?: string; filled?: boolean }) => ReactNode;
  /** Single-key shortcut (lower case), shown in the tooltip. */
  shortcut?: string;
  /** True when the tool **lifts ink** instead of laying it down — the eraser.
   *
   *  Its marks are painted with `destination-out`, so what they cover is
   *  removed from the picture rather than painted over: the sheet comes back
   *  through the hole on screen, and a transparent export gets a real hole (see
   *  `render.ts`). The ink colour means nothing to such a tool — only how wide
   *  the nib is and how hard it presses (the opacity dial) — so the toolbar dims
   *  the colour button for it.
   *
   *  Like `navigates` and `picksColor`, it is a flag the renderer reads rather
   *  than a tool id anything recognises: a shape or a bucket that rubbed out
   *  would declare this and need nothing else. */
  erases?: boolean;
  /** True when the tool only takes off what a **rubber could actually lift** —
   *  the rubber. Meaningless without `erases`, which it refines.
   *
   *  A plain eraser is indifferent to what is under it: it is a hole, and a hole
   *  goes through ink and graphite alike. That is not what a rubber does to a
   *  page. Graphite and wax are *sitting on* the sheet and come away; ink has
   *  soaked into it and does not, however hard you rub — which is why anyone
   *  sketching lays the construction lines in pencil and inks over them.
   *
   *  So a lifting mark still paints with `destination-out` (there is no other
   *  way to take pixels off), and the renderer lays the marks it could never
   *  have lifted back over the hole afterwards (see `relayFixed` in
   *  `render.ts`). Which marks those are is the other half of this pair:
   *  `liftable` on the tool that drew them. */
  lifts?: boolean;
  /** True when this tool's medium **sits on the sheet** rather than soaking into
   *  it, so a rubber can take it off again — graphite and wax.
   *
   *  The default is the other way round, and deliberately: ink, paint, felt tip,
   *  a bucket of colour and a dropped photograph all stay put under a rubber,
   *  and a tool that says nothing about itself is one of those. Only the two dry
   *  media declare it.
   *
   *  It is read by exactly one thing — the rubber's compositing — and, as
   *  ever, by the flag rather than by the id: a charcoal or a pastel tool would
   *  declare it and need nothing else. */
  liftable?: boolean;
  /** True when the tool's colour is a property of the **material** rather than
   *  a choice — the pencil.
   *
   *  It is the third answer to "where does this tool's ink come from", and the
   *  only one where the answer is *nowhere you can reach*. An ordinary tool
   *  draws with the toolbar's ink; a tool with `swatches` mixes inks of its own
   *  that you set on its panel; a tool with this mixes exactly one, out of what
   *  it is made of. Graphite is a grey mineral — which grey depends on the lead
   *  and on the sheet (see `graphiteInk`), and on nothing a palette can offer.
   *
   *  What it buys is honesty in the toolbar: the ink button is **struck through
   *  and disabled** while the tool is in hand, the same treatment the eraser and
   *  the gradient get, instead of opening a palette whose every swatch changes
   *  nothing. Read off the descriptor like the rest of them (see
   *  `plugins/controls.ts`), so a charcoal or a silverpoint that lands next year
   *  declares it and needs no other line anywhere.
   *
   *  It says nothing about *how* the tool arrives at its colour: that is the
   *  behaviour's business, and the two halves are wired together in the one
   *  place a tool is registered. */
  fixedInk?: boolean;
  /** True when the tool moves the *view* instead of leaving a mark — the hand.
   *  A one-finger drag then pans the page and a double-tap fits it, no stroke is
   *  ever begun, and the toolbar strikes out the ink it would not use. This is the flag
   *  the canvas reads; nothing branches on the tool's id. */
  navigates?: boolean;
  /** True when the tool reads a colour off the page instead of leaving a mark —
   *  the dropper. The press samples the page and pins that colour as the ink;
   *  no stroke is ever begun. Like `navigates`, this is a flag the canvas reads
   *  rather than a tool id it recognises. */
  picksColor?: boolean;
  /** How much **water** this tool puts on the page, 0 (bone dry) to 1 (a
   *  loaded watercolour brush). Absent means dry.
   *
   *  It is the tool's half of a question the *sheet* answers (see `ground.ts`).
   *  Wetness on its own does nothing: a loaded brush on a sealed digital page
   *  behaves exactly as it always has. It is wetness **times** the ground's
   *  absorbency that decides whether a mark
   *
   *    - **mixes** with what is under it rather than covering it — so a red
   *      wash over a blue one on paper comes out purple, and a wash over a
   *      pencil line leaves the pencil showing through;
   *    - **lifts** a little of what it crossed into its own wet edge, which is
   *      what makes an ink line bleed out into a wash that crosses it and what
   *      makes the order two washes were laid in visible in the result;
   *    - **spreads** further past the nib than the tool would on its own.
   *
   *  Like `erases` and `navigates` this is a flag the renderer reads off the
   *  descriptor, never a tool id anything recognises: a new medium declares how
   *  wet it is and gets all three behaviours without a line of code anywhere
   *  else. It is deliberately *not* on the stroke — the sheet a drawing is on
   *  can be changed, and when it is, every mark on it has to answer again. */
  wetness?: number;
  /** True when this tool's mark **grows from the front**: every stamp in it
   *  depends only on the path up to that stamp, so making the stroke longer
   *  cannot change a pixel more than a nib's reach behind the new points.
   *
   *  It is a promise about the *painter*, and it is what lets the canvas repaint
   *  a gesture in flight only where it has just grown instead of from the first
   *  point every frame (see `trail.ts`). On a long airbrush stroke that is the
   *  difference between a frame costing three hundred cones and costing five —
   *  and the cost of getting it wrong is a stale patch of screen, so the default
   *  is no and every tool that claims it has to be read for:
   *
   *   - the spray, the plain and soft lines, the felt tip and the broad nib all
   *     qualify: each resamples the path forwards and stamps what it finds;
   *   - the brush, the crayon, the pencil and the rubber do **not**. Their
   *     texture is fitted to the mark as a whole — a grain that coarsens to stay
   *     inside a budget, a run-out measured back from the end, a fade-in whose
   *     length is a fraction of the total — so a longer stroke repaints
   *     differently all the way back to its first point;
   *   - watercolour does not either: a wash is a simulation over the whole path.
   *
   *  A tool that erases or that soaks into the sheet is excluded whatever it
   *  says here, because both of those read the pixels they land on. */
  grows?: boolean;
  /** How far past its own path this tool's painter can reach, as a multiple of
   *  the stroke's width. Absent means the generous default in `geometry.ts`,
   *  which is what every tool that has not been read for this gets.
   *
   *  It is the number two things are decided by: whether a mark is far enough
   *  off screen to skip entirely, and — while it is being drawn — how big a
   *  patch of screen the samples that just arrived can have changed (see
   *  `trail.ts`). The first only wants an *upper bound*, so being loose costs a
   *  stroke painted that needn't have been; the second pays for slack in area,
   *  which is why it is worth declaring honestly on the wide, soft tools. An
   *  airbrush throws a cone 1.6 times its width, and a patch padded by four
   *  times it instead is six times the pixels.
   *
   *  Being *wrong* the other way is a visible glitch — a mark culled with a
   *  corner still on screen, or a stale patch of a stroke being drawn — so read
   *  the painter before you write a number here, and leave a little slack. */
  reach?: number;
  /** True when the tool honours the fill toggle. */
  supportsFill?: boolean;
  /** True when the tool's gesture *chooses marks* rather than leaving one — the
   *  selection family.
   *
   *  It draws an ordinary draft (so the whole drag pipeline is the one every
   *  other tool uses), but that draft never reaches the document: the canvas
   *  reads this flag, asks the behaviour what the gesture chose
   *  (`ToolBehaviour.selection`), and hands the outlines to the screen as a
   *  selection instead of committing anything. Like `navigates`, `picksColor`
   *  and `entersText`, it is a descriptor flag rather than a tool id anything
   *  recognises. */
  selects?: boolean;
  /** True when the tool's mark is *typed* rather than drawn — the text tool.
   *
   *  A press begins no gesture; it opens a caret on the page instead, and the
   *  mark is filed when the typing is finished. Like `navigates` and
   *  `picksColor` this is a flag the canvas reads, so no screen has to know
   *  what the text tool is called. */
  entersText?: boolean;
  /** The width this tool opens at, in document pixels, before its own scaling
   *  (a paintbrush multiplies it, a text tool reads it as the type size).
   *
   *  Declared per tool because a width that suits a pencil suits nothing else:
   *  6px is a fine pencil line, a starved airbrush and unreadable type. Absent
   *  falls back to the middle of `sizes` — see `toolSize` in `useAppSettings`. */
  defaultSize?: number;
  /** The sizes this tool is really made in: the five widths its panel offers as
   *  buttons, the range a shop actually stocks, and how far past either end the
   *  slider still goes (see `plugins/gauge.ts`).
   *
   *  Declared per tool because a rack of implements is not one rack: a
   *  technical pen comes in 0.13–2 mm and a decorator's brush in 25–150 mm, and
   *  a slider spanning both spends nine tenths of its travel on widths the tool
   *  in your hand does not come in. Absent falls back to `DEFAULT_GAUGE` — the
   *  pen ladder, which is what "a line of some width" means when the tool says
   *  nothing more about itself. */
  gauge?: SizeGauge;
  /** True when a width means **nothing** to this tool's mark, so it is offered
   *  none at all.
   *
   *  The paint bucket is the case: it fills the area it traced, and it fills
   *  exactly that area whether the nib is set to two or to ninety-six. A slider
   *  that moves a number no mark reads is worse than no slider — so a sizeless
   *  tool gets no size button, and its own settings move to a cog beside the
   *  ink instead (see `plugins/controls.ts`).
   *
   *  Only tools that *do* leave a mark need declare it. A tool that leaves none
   *  — the hand, the dropper, the selection family — has no width for the same
   *  reason it has no ink, and that is read off the flags it already carries. */
  sizeless?: boolean;
  /** How a width is **shown**: on the size button, and on every button of the
   *  width row.
   *
   *  `"press"` — the default — paints the mark that width would actually leave,
   *  with the tool that would leave it (see `press.ts`). It is the right answer
   *  for everything that lays ink down, because what a width *is* differs by
   *  tool: an airbrush's eight is a soft cone, a highlighter's a broad band.
   *
   *  `"circle"` draws a plain disc instead — the width as a width. A tool
   *  reaches for it when its mark can't describe itself: the eraser's press is
   *  a *hole*, and a hole shows nothing unless the preview first fabricates
   *  some ink for it to bite into. The nib is round and the number is the nib,
   *  so a circle says everything the eraser has to say and says it at a glance. */
  sizePreview?: "press" | "circle";
  /** What this tool offers under **Advanced** in the size panel, past the width
   *  every tool shares. Two at most: the panel is a thing you reach into
   *  mid-stroke, and a rack of sliders is a settings screen.
   *
   *  Declaring one is the whole of adding it — the picker renders the list, the
   *  settings blob keeps a value per tool per dial, and the behaviour reads it
   *  off `ToolContext.dials`. Nothing outside `plugins/` learns a dial's name. */
  dials?: readonly ToolDial[];
  /** The inks this tool mixes for itself, past the toolbar's — see
   *  `ToolSwatch`. Declaring any of them puts a row of swatches at the head of
   *  the tool's settings panel and dims the toolbar's ink button, because a tool
   *  that carries its own colours does not draw with that one. */
  swatches?: readonly ToolSwatch[];
  /** The app-wide settings this tool offers — see `ToolOption`. They sit in the
   *  same panel as the dials, under a heading of their own, because they are a
   *  different kind of thing: a dial tunes the *next* mark, an option changes
   *  how every mark of this kind is painted, on every drawing.
   *
   *  The watercolour brush is the only tool with any today: which of the two
   *  engines paints a wash, and how finely the heavier one resolves. */
  options?: readonly ToolOption[];
  /** The settings this tool is actually used at — the "must haves" of the
   *  medium, offered as chips above the ones the user saved (see
   *  `BuiltinPreset` for the rules, and `plugins/builtin/presets.ts` for the
   *  shipped set).
   *
   *  Absent is a real answer, not an omission: a tool whose must-haves come to
   *  one setting puts that setting in its `defaultSize` and dial defaults
   *  instead of shipping a row of one chip. */
  presets?: readonly BuiltinPreset[];
  /** True when the plugin exists only to *paint* — it is never offered in the
   *  toolbar or listed in Settings → Tools, and its `start` returns nothing.
   *
   *  The dropped-image plugin is the case: an image is placed by dropping a
   *  file, not by a gesture, but the stroke it produces still has to name a
   *  plugin so the renderer can paint it (see `render.ts`). A hidden plugin is
   *  how a mark can exist without a button, with no screen having to know an
   *  id. */
  hidden?: boolean;
  behaviour: ToolBehaviour;
};

/** Give a stroke its committed identity. Kept here so both the store and the
 *  tests mint ids the same way. */
export function withId(draft: DraftStroke, id: string): Stroke {
  return { ...draft, id };
}
