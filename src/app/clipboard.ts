// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The system clipboard, in both directions — the half of it that is this app's.
//
// The framework (`hooks/clipboardRead.ts`) owns the awkward part: that a look
// is free on one engine and a system Paste button on another, that one `read()`
// carries every flavour so ranking must not cost a second prompt, that a read
// does not always settle, and that every failure is simply "nothing". None of
// that is about drawing.
//
// What is about drawing is the **ranking**. Three things travel through here,
// and which one a paste turns out to be is this module's whole job: marks
// copied out of this app, a picture, or words. Marks first, because they are
// text and would otherwise be pasted as their own JSON; a picture before words,
// because a copy out of a browser usually carries both and the picture is what
// was meant.
//
// The keyboard's paste is the *good* path and is why {@link readPaste} exists
// beside {@link readSystemClipboard}: a real `paste` event hands its data over
// synchronously, with no permission and no prompt. The async clipboard is only
// asked when there is no event to read — the selection menu's own Paste item.
//
// The free/asked-for split survives here as two functions rather than one with
// a flag, because the difference is not a parameter to a caller: a prompt is a
// fine thing to raise when somebody just pressed Paste and a baffling one when
// they only opened a dialog. {@link peekClipboardImage} is only ever taken when
// a look is free (see `clipboardLookIsFree`); {@link pasteClipboardImage} is
// taken inside the gesture that asked for it.

import {
  clipboardBlob,
  clipboardText,
  CLIPBOARD_FREE_LOOK_MS,
  CLIPBOARD_USER_ANSWER_MS,
  copyTextToClipboard,
  readClipboard,
  readDataTransfer,
  type ClipboardContent,
} from "@niclaslindstedt/oss-framework/hooks";

import { importImageFile, type ImportedImage } from "./images.ts";
import type { DraftStroke } from "./plugins/types.ts";
import { decodeStrokes, encodeStrokes } from "./strokeClipboard.ts";
import type { Stroke } from "./types.ts";

export {
  clipboardCanBeRead,
  clipboardLookIsFree,
} from "@niclaslindstedt/oss-framework/hooks";

/** What a paste turned out to be holding. */
export type PastePayload =
  | { kind: "strokes"; strokes: DraftStroke[] }
  | { kind: "image"; image: ImportedImage }
  | { kind: "text"; text: string };

/** Rank what one look at the clipboard turned up: marks this app wrote, then a
 *  picture, then words.
 *
 *  Exported for the tests — the ordering is the part worth pinning, and it can
 *  be driven without a clipboard. */
export async function rankClipboard(
  found: readonly ClipboardContent[],
): Promise<PastePayload | null> {
  const words = clipboardText(found);
  if (words) {
    const strokes = decodeStrokes(words);
    if (strokes) return { kind: "strokes", strokes };
  }
  const picture = clipboardBlob(found);
  if (picture) {
    const image = await imageFromBlob(picture.type, picture.blob);
    if (image) return { kind: "image", image };
  }
  return words ? { kind: "text", text: words } : null;
}

/** Classify what a `paste` (or `drop`) event is carrying. */
export async function readPaste(
  data: DataTransfer | null,
): Promise<PastePayload | null> {
  return rankClipboard(await readDataTransfer(data));
}

/** The same question, asked of the clipboard itself — the selection menu's
 *  Paste, which has no event to read. Every refusal is `null`; the caller falls
 *  back to the marks this app last copied. */
export async function readSystemClipboard(): Promise<PastePayload | null> {
  return rankClipboard(
    await readClipboard({ timeoutMs: CLIPBOARD_USER_ANSWER_MS }),
  );
}

/** A free look for a picture — for deciding whether to *offer* a paste. Only
 *  worth calling when `clipboardLookIsFree()` said yes; anywhere else it either
 *  answers `null` or raises the very prompt it is trying to avoid. */
export async function peekClipboardImage(): Promise<ImportedImage | null> {
  return firstImage(await readClipboard({ timeoutMs: CLIPBOARD_FREE_LOOK_MS }));
}

/** The picture on the clipboard, asked for on purpose — inside the gesture that
 *  asked for it, and waiting for however long the browser's own prompt takes to
 *  answer. `null` for every one of the many ways there isn't one. */
export async function pasteClipboardImage(): Promise<ImportedImage | null> {
  return firstImage(
    await readClipboard({ timeoutMs: CLIPBOARD_USER_ANSWER_MS }),
  );
}

async function firstImage(
  found: readonly ClipboardContent[],
): Promise<ImportedImage | null> {
  const picture = clipboardBlob(found);
  return picture ? imageFromBlob(picture.type, picture.blob) : null;
}

/** The picture inside one clipboard blob.
 *
 *  `importImageFile` takes a `File` because that is what a drop and a file
 *  picker hand over; a clipboard blob is the same bytes with no name, so it
 *  gets one here and goes down the identical path — including the downscale
 *  that keeps a screenshot from becoming a megabyte of document. */
async function imageFromBlob(
  type: string,
  blob: Blob,
): Promise<ImportedImage | null> {
  try {
    return await importImageFile(new File([blob], "clipboard", { type }));
  } catch {
    return null;
  }
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
  return copyTextToClipboard(encodeStrokes(strokes));
}
