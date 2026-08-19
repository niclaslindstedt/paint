// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the app opens on — the page, the ink, the tool in hand — and what an
// emptied sketchbook goes back to.
//
// **Why there is such a thing at all.** A paint program has a starting state,
// and until now this one's was *derived*: the page and the ink were read off
// the app theme, so the same fresh sketch was a white sheet in black ink on a
// light phone and a charcoal sheet in white ink on a dark one. That is a
// defensible answer for a sketchpad inside a shell, and it is the wrong answer
// for a drawing: a page is paper, paper is white, and a mark on it is black
// whatever colour the furniture around it happens to be. So the starting state
// is now *stated* rather than inferred — and, being stated, it is something a
// user can state differently (Settings → General → Defaults).
//
// **Why a module rather than a prop.** These four answers are read by the
// renderer, the export path, the swatch shelves and the thumbnail tiles — every
// surface that has to resolve a page with no colour of its own or a mark with
// no ink of its own. Threading a settings object through all of them would put
// a parameter on a dozen pure functions to carry one value that is the same
// everywhere. So the app *publishes* the settings' answer here once per render
// and those functions read it, exactly the way the wash and lead simulations
// take their detail (see `plugins/wash.ts`). Nothing writes it but `App.tsx`.

/** The four answers a fresh page starts from.
 *
 *  `ink` and `page` are `null` for "whatever the app theme calls for", which is
 *  what this app did before there was a choice — a dark shell painting a dark
 *  sheet in light ink. Every other value is a colour that holds whichever way
 *  the theme goes. */
export type PaintDefaults = {
  /** The tool the canvas opens with, by plugin id. */
  tool: string;
  /** Which of that tool's presets it opens set to, by preset id — `null` for
   *  the tool exactly as its maker ships it. */
  preset: string | null;
  /** The ink a mark is drawn in until a swatch is picked, or `null` to follow
   *  the theme. */
  ink: string | null;
  /** The colour of a page that has pinned none of its own, or `null` to follow
   *  the theme. */
  page: string | null;
};

/** The defaults this build ships: a white sheet, black ink, and the pen at the
 *  0.5 mm liner it is reached for as.
 *
 *  The ink is the app's near-black rather than `#000000` on purpose — it is the
 *  same value the toolbar's dark swatch carries, so the swatch row shows the
 *  ink in hand as selected before anything has been picked, and at this
 *  lightness the two are indistinguishable on paper. */
export const SHIPPED_DEFAULTS: PaintDefaults = Object.freeze({
  tool: "pencil",
  preset: "liner",
  ink: "#111827",
  page: "#ffffff",
});

let current: PaintDefaults = SHIPPED_DEFAULTS;

/** The defaults in force — the user's, once `App.tsx` has published them, and
 *  the shipped ones until then (which is also what a test with no app around it
 *  gets). */
export function paintDefaults(): PaintDefaults {
  return current;
}

/** Publish the defaults every resolver reads. Called by `App.tsx` from the
 *  settings blob, and by tests that need a different starting state. */
export function setPaintDefaults(next: PaintDefaults): void {
  current = next;
}
