// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The plugin seam.
//
// Every tool in the app — the pencil included — is a plugin: a descriptor with
// an id, a label, an icon, and a behaviour that turns pointer gestures into
// strokes and paints them. The app core knows nothing about pencils or
// rectangles; it renders whatever the registry hands it (see `registry.ts`).
//
// Two kinds of plugin exist, and the difference is *only* how they are
// switched on:
//
//   - `core: true`  always available, always in the toolbar.
//   - otherwise     opt-in — the user turns it on under Settings → Tools, and
//                   it joins the toolbar (see `useAppSettings`'s
//                   `enabledPlugins`).
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

/** The ink the toolbar currently has selected, handed to a tool on every step
 *  of a gesture so it can build its draft. The page background travels with it
 *  because tools like the eraser paint *with* it. */
export type ToolContext = {
  /** The picked ink, or `null` when the user hasn't picked one — a stroke then
   *  records no colour and resolves it at paint time (see `Stroke.color`). */
  color: string | null;
  size: number;
  /** The shape tools' fill toggle. Ignored by tools that only stroke. */
  filled: boolean;
  /** The active drawing's page colour. */
  background: string;
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
  /** Always-on tools are `core`; everything else is opt-in from settings. */
  core?: boolean;
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
  /** True when the tool honours the fill toggle. */
  supportsFill?: boolean;
  behaviour: ToolBehaviour;
};

/** Give a stroke its committed identity. Kept here so both the store and the
 *  tests mint ids the same way. */
export function withId(draft: DraftStroke, id: string): Stroke {
  return { ...draft, id };
}
