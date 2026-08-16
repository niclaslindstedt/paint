// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the app is called.
//
// One constant, in one file, because the name is written into more places than
// anyone renaming it would remember: the browser tab, the installed app's tile,
// the install prompt, iOS's home-screen label, and one per release channel on
// top of that. Every one of those reads this, so renaming the app is editing
// this line — and `make build && make check-seo` proves it landed everywhere.
//
// The name is deliberately **not** the tagline. A tab that says "Paint" is a
// tab you can find in a row of twenty; "Paint — a local-first sketchpad" is a
// sentence, and it belongs in the description and the share card, where there
// is room for one. Those stay hand-written prose in `index.html`.
//
// Two things that look like the name and are not, and must not be moved here:
//
//   - the cloud folder (`Apps/Paint/`, see `useSyncEngine.ts`). That is a
//     *storage identity* — rename it and every synced drawing is orphaned in a
//     folder nobody is looking at any more.
//   - the `.pct` file format's own name, which is the format's and not the
//     app's.

/** The app's name — the browser tab, the manifest, the home-screen tile. */
export const APP_NAME = "Paint";

/** …and what the two side channels are called, so three installs from one
 *  origin are three distinguishable tiles rather than three identical ones (see
 *  `channelName` in `pwa-plugin.ts`). The short forms are what a phone actually
 *  has room for under an icon. */
export const CHANNEL_NAMES: Record<string, { name: string; short: string }> = {
  "/preview/": { name: `${APP_NAME} (preview)`, short: `${APP_NAME} pre` },
  "/branch/": { name: `${APP_NAME} (branch)`, short: `${APP_NAME} br` },
};
