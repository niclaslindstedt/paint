// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Reading a picture off the system clipboard.
//
// The new-drawing dialog offers "Clipboard" only when there is actually
// something on it (see `NewDrawingModal.tsx`), which means the question has to
// be *asked* rather than assumed — and asking is the awkward part: the async
// clipboard is behind a permission on Chrome, behind a user gesture on Safari,
// and absent altogether on Firefox at the time of writing.
//
// So the rule here is that **every failure is "no image"**. A browser without
// the API, a permission the user declined, a clipboard holding a spreadsheet, a
// blob that won't decode — all of them come back `null`, and the dialog simply
// doesn't offer the tab. Nothing about this path is load-bearing: the file
// picker and the drop target reach the same place.

import { importImageFile, type ImportedImage } from "./images.ts";

/** The clipboard API, as much of it as this module uses — typed by hand because
 *  `navigator.clipboard.read` is not in every TypeScript DOM lib, and this is
 *  the one place that cares. */
type AsyncClipboard = {
  read?: () => Promise<
    readonly {
      types: readonly string[];
      getType: (type: string) => Promise<Blob>;
    }[]
  >;
};

/** How long the clipboard gets to answer before it counts as empty.
 *
 *  `read()` does not always settle: a browser that is waiting on a permission
 *  prompt — or on a page that hasn't been clicked yet — simply leaves the
 *  promise pending, and a dialog with a tab stuck saying "asking…" is worse than
 *  one that never offered the tab. A second and a half is far longer than a
 *  clipboard read that is going to happen takes. */
const ANSWER_WITHIN_MS = 1500;

/** The picture on the clipboard, ready to be placed — or `null` for every one
 *  of the many ways there isn't one. */
export async function clipboardImage(): Promise<ImportedImage | null> {
  return Promise.race([
    readClipboardImage(),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), ANSWER_WITHIN_MS),
    ),
  ]);
}

async function readClipboardImage(): Promise<ImportedImage | null> {
  const clipboard =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { clipboard?: AsyncClipboard }).clipboard;
  if (!clipboard?.read) return null;
  try {
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      // `importImageFile` takes a `File` because that is what a drop and a file
      // picker hand over; a clipboard blob is the same bytes with no name, so
      // it gets one here and goes down the identical path — including the
      // downscale that keeps a screenshot from becoming a megabyte of document.
      const file = new File([blob], "clipboard", { type });
      return await importImageFile(file);
    }
  } catch {
    // Denied, unsupported, or a clipboard we simply may not read. Not an error
    // worth surfacing: the tab is offered when there is a picture and not when
    // there isn't, and that is the whole of what the caller needs.
    return null;
  }
  return null;
}
