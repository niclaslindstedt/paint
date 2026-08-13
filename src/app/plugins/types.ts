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
// That is the whole extension story for now, and it is deliberately the *same*
// contract the built-in tools use: when externally-loaded plugins land later,
// they register through this interface rather than a second, parallel one.

import type { ReactNode } from "react";

import type { Point, Stroke } from "../types.ts";
import type { TKey } from "../i18n/index.ts";

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

/** The ink the toolbar currently has selected, handed to a tool on every step
 *  of a gesture so it can build its draft. The page background travels with it
 *  because tools like the eraser paint *with* it. */
export type ToolContext = {
  /** The picked ink, or `null` when the user hasn't picked one — a stroke then
   *  records no colour and resolves it at paint time (see `Stroke.color`). */
  color: string | null;
  size: number;
  /** Edge crispness, 0 (soft) to 1 (hard). Only honoured by the tools that
   *  advertise `supportsHardness`. */
  hardness: number;
  /** The shape tools' fill toggle. Ignored by tools that only stroke. */
  filled: boolean;
  /** The active drawing's page colour. */
  background: string;
  /** A read of the painted page, when the caller can offer one (the canvas
   *  can; a test need not). A tool that needs it must cope with its absence by
   *  beginning no stroke. */
  probe?: CanvasProbe | null;
};

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
  /** Paint one stroke onto a 2D context, in document coordinates. Called for
   *  committed strokes and for the in-flight draft alike. */
  paint(ctx2d: CanvasRenderingContext2D, stroke: Stroke): void;
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
  /** Catalog keys for the toolbar tooltip and the settings row. */
  nameKey: TKey;
  descriptionKey: TKey;
  /** Toolbar glyph. A tool that `supportsFill` is asked for a solid version of
   *  it too (`filled`), which is what the fill picker shows in place of words;
   *  a glyph that ignores the flag simply draws the same either way. */
  icon: (props: { className?: string; filled?: boolean }) => ReactNode;
  /** Single-key shortcut (lower case), shown in the tooltip. */
  shortcut?: string;
  /** True when the tool paints with the page background rather than the ink
   *  colour — the colour swatch is then irrelevant and the toolbar dims it. */
  usesBackground?: boolean;
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
  /** True when the tool honours the hardness dial — the soft-edged brushes. The
   *  size picker dims the dial for every other tool rather than offering a
   *  control that would do nothing. */
  supportsHardness?: boolean;
  behaviour: ToolBehaviour;
};

/** Give a stroke its committed identity. Kept here so both the store and the
 *  tests mint ids the same way. */
export function withId(draft: DraftStroke, id: string): Stroke {
  return { ...draft, id };
}
