// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the New drawing dialog knows about the clipboard, as a state.
//
// The dialog would like to say one of two simple things — "there is a picture,
// here it is" or nothing at all — and on a browser that lets a page look at the
// clipboard for free it can (see `clipboard.ts`). Where a look is *not* free the
// honest answer is a third one: **we may not look without asking you first.**
// That is what this state carries, and why the tab can no longer be reduced to
// "is there an image yet".
//
// Two rules fall out of it, and they are the whole of this module:
//
// - A look nobody asked for may hide the tab, because it knows there is nothing
//   there. A look the user asked for may **not** — a tab that vanishes under the
//   thumb that just pressed it reads as a broken button, so an empty answer to a
//   deliberate paste stays on screen and says so.
// - The tab is **absent** while a free look is in flight, not dim. It used to be
//   there and greyed, and where the look came back empty the tab then vanished a
//   second after it appeared — a dialog visibly changing its mind under the eye
//   reading it. So the tab only ever joins the row once it is something you can
//   press: appearing is a fine thing for a tab to do, disappearing is not.

import type { ImportedImage } from "./images.ts";

/** Where the clipboard tab is in its short life. */
export type ClipboardSource =
  /** A free look is in flight. No tab yet — it joins the row if the look finds
   *  a picture, and was never there to take away if it doesn't. */
  | { kind: "looking" }
  /** We may not look unasked. The tab offers a button that does. */
  | { kind: "ask" }
  /** A look the user asked for is in flight — the browser's own prompt may be
   *  up in front of everything. */
  | { kind: "reading" }
  /** There is a picture, and it is ready to become a drawing. */
  | { kind: "image"; image: ImportedImage }
  /** We looked because we were asked to, and there was nothing. */
  | { kind: "nothing" }
  /** We looked for free, there was nothing, and so there is no tab. */
  | { kind: "hidden" };

/** What a free look came back with — the one path allowed to take the tab away
 *  again, because the user never pressed anything to get it. */
export function afterPeek(image: ImportedImage | null): ClipboardSource {
  return image ? { kind: "image", image } : { kind: "hidden" };
}

/** What a look the user asked for came back with. Never hides the tab: they
 *  pressed a button, so the answer belongs where the button was. */
export function afterPaste(image: ImportedImage | null): ClipboardSource {
  return image ? { kind: "image", image } : { kind: "nothing" };
}

/** Whether the clipboard is offered as a source at all. Not while a free look
 *  is still out: a tab that appeared and then vanished when the look came back
 *  empty read as the dialog changing its mind. */
export function tabShown(source: ClipboardSource): boolean {
  return source.kind !== "hidden" && source.kind !== "looking";
}

/** Whether the tab can be pressed. Every state the tab is shown in is one it
 *  can be pressed in; the check keeps its own answer for the states that are
 *  never shown, so the two cannot drift apart. */
export function tabEnabled(source: ClipboardSource): boolean {
  return source.kind !== "looking" && source.kind !== "hidden";
}

/** The picture the dialog would make a drawing from, if there is one. */
export function pastedImage(source: ClipboardSource): ImportedImage | null {
  return source.kind === "image" ? source.image : null;
}

/** Whether a look is in flight, either kind — what the spinner is for. */
export function looking(source: ClipboardSource): boolean {
  return source.kind === "looking" || source.kind === "reading";
}
