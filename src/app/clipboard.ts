// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The system clipboard, in both directions.
//
// Three things travel through here, and which one a paste turns out to be is
// this module's whole job: marks copied out of this app, a picture, or words.
//
// The awkward part is *asking*. The async clipboard is behind a permission on
// Chrome, behind a user gesture on Safari, and absent altogether on Firefox at
// the time of writing. So the rule here is that **every failure is "nothing"**.
// A browser without the API, a permission the user declined, a clipboard holding
// a spreadsheet, a blob that won't decode — all of them come back `null`, and
// the caller simply doesn't offer the paste. Nothing on this path is
// load-bearing: the file picker, the drop target and the keyboard's own paste
// event all reach the same place.
//
// The keyboard's paste is in fact the *good* path, and it is why `readPaste`
// exists beside `readSystemClipboard`: a real `paste` event hands over its
// `DataTransfer` synchronously, with no permission and no prompt. The async
// clipboard is only asked when there is no event to read — the selection menu's
// own Paste item.

import { importImageFile, type ImportedImage } from "./images.ts";
import type { DraftStroke } from "./plugins/types.ts";
import { decodeStrokes, encodeStrokes } from "./strokeClipboard.ts";
import type { Stroke } from "./types.ts";

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
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
};

function asyncClipboard(): AsyncClipboard | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { clipboard?: AsyncClipboard }).clipboard;
}

/** What a paste turned out to be holding. */
export type PastePayload =
  | { kind: "strokes"; strokes: DraftStroke[] }
  | { kind: "image"; image: ImportedImage }
  | { kind: "text"; text: string };

/** Classify what a `paste` event is carrying, in the order the app cares about:
 *  marks it wrote itself, then a picture, then words.
 *
 *  Marks first because they are text and would otherwise be pasted as their own
 *  JSON. A picture before words because a copy out of a browser usually carries
 *  both, and the picture is what was meant. */
export async function readPaste(
  data: DataTransfer | null,
): Promise<PastePayload | null> {
  if (!data) return null;
  const text = data.getData("text/plain");
  if (text) {
    const strokes = decodeStrokes(text);
    if (strokes) return { kind: "strokes", strokes };
  }
  const file = [...(data.files ?? [])].find((f) => f.type.startsWith("image/"));
  if (file) {
    const image = await importImageFile(file).catch(() => null);
    if (image) return { kind: "image", image };
  }
  // Trailing whitespace is the newline a copied line brings with it, not part
  // of the caption.
  const words = text.replace(/\s+$/, "");
  return words ? { kind: "text", text: words } : null;
}

/** The same question, asked of the clipboard itself — the selection menu's
 *  Paste, which has no event to read. Every refusal is `null`; the caller falls
 *  back to the marks this app last copied. */
export async function readSystemClipboard(): Promise<PastePayload | null> {
  const clipboard = asyncClipboard();
  if (!clipboard) return null;
  try {
    const text = await clipboard.readText?.();
    if (text) {
      const strokes = decodeStrokes(text);
      if (strokes) return { kind: "strokes", strokes };
      const words = text.replace(/\s+$/, "");
      if (words) return { kind: "text", text: words };
    }
  } catch {
    // Denied, unsupported, or a clipboard we may not read. Try the picture.
  }
  const image = await clipboardImage();
  return image ? { kind: "image", image } : null;
}

/** Put marks on the system clipboard, as the text this app recognises (see
 *  `strokeClipboard.ts`).
 *
 *  Best effort, and deliberately so: this is the *menu's* copy, which has no
 *  `copy` event to write through, and a browser is entitled to refuse it. The
 *  caller keeps its own copy of what was copied either way, so a refusal costs
 *  pasting into another tab and nothing else. */
export async function writeStrokes(
  strokes: readonly Stroke[],
): Promise<boolean> {
  const clipboard = asyncClipboard();
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(encodeStrokes(strokes));
    return true;
  } catch {
    return false;
  }
}

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
  const clipboard = asyncClipboard();
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
