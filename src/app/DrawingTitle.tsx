// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { useT } from "./i18n/index.ts";

// The open drawing's name, at the head of the canvas header.
//
// It reads as a heading and edits as a field — the same treatment the sibling
// apps give the document's name (`notes`' editor title, this app's own Archive
// heading): `text-lg font-bold` in the bright foreground, no box, no fill, no
// focus ring of its own. The framework's `InlineEditField` is the wrong
// component for this spot even though it is the right one inside a menu row:
// it mounts *focused* — which raised the soft keyboard over the page every time
// a drawing was opened — and its borderless styling is a default that a caller
// passing `className` replaces, so the header ended up wearing the browser's
// native input chrome and its blue focus highlight. Both are the reason this
// field is the screen's own.
//
// The name is still edited in place: press the title and type over it. The
// press selects the whole name (so typing replaces it, the way it does in
// `notes`), Enter and a press elsewhere commit, and Escape puts the old name
// back.
export function DrawingTitle({
  /** The open drawing's name, as stored. */
  value,
  onCommit,
}: {
  value: string;
  /** Fired with the trimmed name when it actually changed. */
  onCommit: (name: string) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);

  // Follow the document: opening another drawing — or renaming this one from
  // the side menu — replaces what the field shows. Keyed on the name itself, so
  // a keystroke in flight is never overwritten by the store echoing the name
  // that is already there.
  useEffect(() => setDraft(value), [value]);

  // A press into the field selects the whole name so it can be typed over.
  // The browser collapses that selection to a caret on the click's *mouseup*,
  // so the one mouseup that gained focus is suppressed; later presses still
  // place the caret where you pressed.
  const focusingPress = useRef(false);

  function commit(next: string) {
    const trimmed = next.trim();
    // An empty title is not a rename — a drawing always has a name, and the
    // placeholder stands in for one that has never been typed. Put the stored
    // name back instead.
    if (!trimmed) {
      setDraft(value);
      return;
    }
    if (trimmed !== value) onCommit(trimmed);
    setDraft(trimmed);
  }

  return (
    <input
      type="text"
      value={draft}
      placeholder={t("menu.untitled")}
      aria-label={t("menu.drawingName")}
      enterKeyHint="done"
      onChange={(e) => setDraft(e.currentTarget.value)}
      onFocus={(e) => e.currentTarget.select()}
      onMouseDown={(e) => {
        if (document.activeElement !== e.currentTarget)
          focusingPress.current = true;
      }}
      onMouseUp={(e) => {
        if (!focusingPress.current) return;
        e.preventDefault();
        focusingPress.current = false;
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Blur to commit, so the keyboard drops on a phone and the caret
          // leaves the title — naming the drawing is done, the page is next.
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-[inherit] text-lg leading-tight font-bold tracking-wide text-fg-bright outline-none placeholder:font-bold placeholder:text-muted/60"
    />
  );
}
