// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Who is holding the selection mode, and how it is asked for.
//
// The mode itself is arithmetic and lives next door (`selectMode.ts`); this is
// the *state* of it, which is three small things that belong together:
//
//   - **the sticky one** — what the long press on the selection button set, and
//     what every gesture means until it is put back. It is session state, like
//     the window it works on: not in the document, not in the settings blob,
//     and gone when the tab is. A mode that survived a reload would be a mode
//     you meet again a week later with no memory of setting it, and the first
//     thing it would do is quietly eat a selection.
//   - **the held one** — Shift or Alt down right now, which wins for as long as
//     it is (see `heldMode`). Watched on the window rather than read off the
//     pointer events, so the pointer's own **+** appears the moment the key
//     goes down rather than when the mouse next moves — which is what a hand
//     coming off Photoshop expects to see, and the only way to *check* the key
//     you are holding before you commit to the drag.
//   - **whether the chooser is open**, which is the touch half of the same
//     question (see `SelectionModeModal.tsx`).
//
// The keyboard half is armed only while a selection tool is in hand. Shift is
// held for half of everything anyone does with a keyboard, and a listener that
// re-rendered the screen every time would be a listener paying for a mode that
// could not apply.

import { useEffect, useState } from "react";

import { keyboardIsClaimed } from "@niclaslindstedt/oss-framework/hooks";

import { effectiveMode, heldMode, type SelectMode } from "./selectMode.ts";

export type SelectModeControl = {
  /** What a gesture starting now would do to the window: the key being held, or
   *  the sticky mode when none is. */
  mode: SelectMode;
  /** …and the sticky one alone, which is what the chooser shows as chosen and
   *  what the strip at the foot of the canvas stands for. */
  sticky: SelectMode;
  setSticky: (mode: SelectMode) => void;
  /** Whether a key is being held rather than a mode set — the strip says so,
   *  because "you are holding Alt" and "this app is in Subtract mode" are two
   *  different things to be told. */
  held: boolean;
  /** The chooser: opened by a long press on the selection button, closed by
   *  picking one or by dismissing it. Dismissing it keeps the mode — that is
   *  the whole point of the strip it leaves behind. */
  open: boolean;
  setOpen: (open: boolean) => void;
};

export function useSelectMode(enabled: boolean): SelectModeControl {
  const [sticky, setSticky] = useState<SelectMode>("replace");
  const [keys, setKeys] = useState({ shift: false, alt: false });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const read = (e: KeyboardEvent) => {
      // A modifier held into a text field is that field's business — and a
      // Shift typed into a drawing's name must not put the canvas into Add.
      if (keyboardIsClaimed(e.target)) return;
      // A Shift that is part of a *shortcut* is not a mode: ⌘/Ctrl+Shift+Z is
      // redo, and the pointer flashing a "+" through it would be the app
      // answering a question nobody asked.
      const shift = e.shiftKey && !e.ctrlKey && !e.metaKey;
      const alt = e.altKey && !e.ctrlKey && !e.metaKey;
      setKeys((was) =>
        was.shift === shift && was.alt === alt ? was : { shift, alt },
      );
    };
    // Both keys are dropped whenever the window stops hearing about them: a
    // tab switched away with Alt down never sees the keyup, and coming back to
    // a canvas silently in Subtract is exactly the surprise this whole mode has
    // to avoid.
    const clear = () => setKeys({ shift: false, alt: false });
    window.addEventListener("keydown", read);
    window.addEventListener("keyup", read);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", read);
      window.removeEventListener("keyup", read);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [enabled]);

  // A tool that chooses nothing has no mode: the keys go quiet above, and the
  // sticky one is simply not in force until a selection tool is back in hand.
  const held = enabled ? heldMode(keys) : null;

  return {
    mode: enabled ? effectiveMode(sticky, held) : "replace",
    sticky,
    setSticky,
    held: held !== null,
    open,
    setOpen,
  };
}
