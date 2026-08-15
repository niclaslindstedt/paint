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

import type { Point, Stroke } from "../types.ts";
import type { TKey } from "../i18n/index.ts";
import type { SizeGauge } from "./gauge.ts";

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
  /** The colour painted at `p`, as `#rrggbb`. */
  colorAt(p: Point): string | null;
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
  /** The shape tools' fill toggle. Ignored by tools that only stroke. */
  filled: boolean;
  /** The active drawing's page colour. */
  background: string;
  /** A read of the painted page, when the caller can offer one (the canvas
   *  can; a test need not). A tool that needs it must cope with its absence by
   *  beginning no stroke. */
  probe?: CanvasProbe | null;
};

/** How finely a stroke is being rasterised — everything a painter needs to stop
 *  drawing detail nobody can see.
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
};

/** The detail a painter assumes when it is handed none — 1:1, i.e. draw
 *  everything. A painter called directly (a test, a one-off) then behaves
 *  exactly as it did before the renderer measured anything. */
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
  /** True when the tool moves the *view* instead of leaving a mark — the hand.
   *  A one-finger drag then pans the page and a double-tap fits it, no stroke is
   *  ever begun, and the toolbar dims the ink it would not use. This is the flag
   *  the canvas reads; nothing branches on the tool's id. */
  navigates?: boolean;
  /** True when the tool reads a colour off the page instead of leaving a mark —
   *  the dropper. The press samples the page and pins that colour as the ink;
   *  no stroke is ever begun. Like `navigates`, this is a flag the canvas reads
   *  rather than a tool id it recognises. */
  picksColor?: boolean;
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
