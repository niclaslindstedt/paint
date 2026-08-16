// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Holding the dialog scrim back.
//
// A modal dims the page behind it — 50% by default, and as far as the
// Appearance tab's two knobs are turned otherwise (see `applyBackdropVars`).
// That is right for every dialog that has a question to ask about something
// elsewhere, and wrong for the one kind that is asking about the page itself:
// a filter's options are a live preview, and a preview seen through a black
// veil — or, worse, through the scrim's own blur, which would soften a page
// whatever the radius said — is not a preview at all.
//
// So a dialog that previews holds the scrim back for as long as it is open.
// The framework's `Modal` paints its backdrop from the two CSS variables the
// app writes on `<html>`, so this is the whole mechanism: zero them, and put
// back exactly what was there. The backdrop element itself stays — a press
// outside the card still closes the dialog, as it does everywhere else.

/** Take the darkness and the blur out of the modal scrim until the returned
 *  function is called.
 *
 *  Restores the previous *inline* values rather than the settings' ones, so it
 *  composes with whatever else has written them and is a no-op to undo where
 *  nothing had. A no-op entirely where there is no DOM. */
export function holdBackdrop(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const root = document.documentElement;
  const held = VARS.map(
    (name) => [name, root.style.getPropertyValue(name)] as const,
  );
  root.style.setProperty(VARS[0], "0");
  root.style.setProperty(VARS[1], "0px");
  return () => {
    for (const [name, was] of held) {
      if (was) root.style.setProperty(name, was);
      else root.style.removeProperty(name);
    }
  };
}

/** The two the scrim is painted from, in the order they are set above. Shared
 *  with `applyBackdropVars`, which is what normally writes them. */
const VARS = ["--modal-backdrop-darkness", "--modal-backdrop-blur"] as const;
