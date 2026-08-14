// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Who the keyboard belongs to right now.
//
// The canvas listens on the *window* for its shortcuts — a tool letter, Delete,
// ⌘C — because the thing being drawn on is a `<canvas>` and a canvas takes no
// focus. That is the only way those keys can work at all, and it is also how
// they would eat every keystroke meant for something else: typing a drawing's
// name would swap the pencil for the eraser, and ⌘C in the caption box would
// copy the selection instead of the words.
//
// So there is one rule, in one place, and every window-level handler asks it
// first: **a field or a dialog that is open owns the keyboard.**

/** Whether something other than the page itself is taking keystrokes: a text
 *  field, a select, anything editable, or anything inside an open dialog. */
export function fieldHasKeyboard(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.("[role='dialog']"));
}
