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
//
// **Asking costs something, and the cost is not the same everywhere.** On a
// desktop Chrome that has already been granted `clipboard-read`, a look is free
// and silent, and a caller may take one to decide whether to offer a paste at
// all. Everywhere else — every WebKit, an installed iOS PWA included — a look
// puts the *system's* own Paste button in front of the user and waits for a
// tap. That is a fine thing to happen when someone just pressed Paste, and a
// baffling one when they only opened a dialog. So the two looks are two
// functions: `peekClipboardImage` is only ever taken when it is free (see
// `canLookAtClipboard`), and `pasteClipboardImage` is taken inside a gesture and
// waits as long as the person needs to answer the prompt it raises.

import { importImageFile, type ImportedImage } from "./images.ts";
import type { DraftStroke } from "./plugins/types.ts";
import { decodeStrokes, encodeStrokes } from "./strokeClipboard.ts";
import type { Stroke } from "./types.ts";

/** The clipboard API, as much of it as this module uses — typed by hand because
 *  `navigator.clipboard.read` is not in every TypeScript DOM lib, and this is
 *  the one place that cares. */
type ClipboardEntry = {
  types: readonly string[];
  getType: (type: string) => Promise<Blob>;
};

type AsyncClipboard = {
  read?: () => Promise<readonly ClipboardEntry[]>;
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
};

function asyncClipboard(): AsyncClipboard | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { clipboard?: AsyncClipboard }).clipboard;
}

/** Whether this browser will hand the clipboard over at all, however much it
 *  insists on asking first. `false` is a browser where no amount of pressing
 *  will produce a picture, so the caller shouldn't offer the press. */
export function clipboardCanBeRead(): boolean {
  return Boolean(asyncClipboard()?.read);
}

/** Whether a look at the clipboard would be free — no prompt, no system button,
 *  nothing in front of the user.
 *
 *  Only one answer counts as free: a `clipboard-read` permission that has
 *  already been *granted*. `prompt` is not free (that is the permission dialog),
 *  a browser without the Permissions API is not free (that is Safari, which
 *  shows its own Paste button instead), and a browser without `read()` has
 *  nothing to look at. Every one of those comes back `false`, and the caller
 *  asks the user instead of peeking. */
export async function canLookAtClipboard(): Promise<boolean> {
  const clipboard = asyncClipboard();
  if (!clipboard?.read) return false;
  try {
    const permissions = (
      navigator as Navigator & {
        permissions?: {
          query?: (d: { name: string }) => Promise<{ state: string }>;
        };
      }
    ).permissions;
    if (!permissions?.query) return false;
    const status = await permissions.query({ name: "clipboard-read" });
    return status.state === "granted";
  } catch {
    // A browser that doesn't know the name — Safari and Firefox both throw
    // here. Not free, then.
    return false;
  }
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
 *  back to the marks this app last copied.
 *
 *  **One read, not two.** A single `read()` hands over every flavour the
 *  clipboard is holding at once, so the whole question is answered by one look
 *  — which matters where a look raises a system prompt: reading the text and
 *  then the picture would put that prompt up twice for one press of Paste. The
 *  flavours are then ranked exactly as `readPaste` ranks them, so the menu's
 *  Paste and ⌘V put down the same thing. */
export async function readSystemClipboard(): Promise<PastePayload | null> {
  const clipboard = asyncClipboard();
  if (!clipboard) return null;
  if (clipboard.read) {
    return within(readEntries(clipboard.read), USER_ANSWERS_WITHIN_MS, null);
  }
  // No `read()` to take: words are all this browser will hand over.
  try {
    const text = (await clipboard.readText?.()) ?? "";
    return fromText(text);
  } catch {
    return null;
  }
}

/** Rank what one look at the clipboard turned up: marks this app wrote, then a
 *  picture, then words. Exported for the tests — the ordering is the part worth
 *  pinning, and it can be driven without a clipboard. */
export async function classifyClipboard(
  entries: readonly ClipboardEntry[],
): Promise<PastePayload | null> {
  let words = "";
  let picture: ClipboardEntry | null = null;
  for (const entry of entries) {
    const text = entry.types.find((t) => t === "text/plain");
    if (text && !words) {
      words = await entry
        .getType(text)
        .then((blob) => blob.text())
        .catch(() => "");
      const strokes = decodeStrokes(words);
      if (strokes) return { kind: "strokes", strokes };
    }
    if (!picture && entry.types.some((t) => t.startsWith("image/"))) {
      picture = entry;
    }
  }
  if (picture) {
    const image = await imageFromEntry(picture);
    if (image) return { kind: "image", image };
  }
  return fromText(words);
}

function fromText(text: string): PastePayload | null {
  if (!text) return null;
  const strokes = decodeStrokes(text);
  if (strokes) return { kind: "strokes", strokes };
  // Trailing whitespace is the newline a copied line brings with it.
  const words = text.replace(/\s+$/, "");
  return words ? { kind: "text", text: words } : null;
}

async function readEntries(
  read: () => Promise<readonly ClipboardEntry[]>,
): Promise<PastePayload | null> {
  try {
    return await classifyClipboard(await read());
  } catch {
    // Denied, dismissed, unsupported, or a clipboard we simply may not read.
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
  const clipboard = asyncClipboard();
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(encodeStrokes(strokes));
    return true;
  } catch {
    return false;
  }
}

/** How long a *free* look gets before it counts as empty.
 *
 *  `read()` does not always settle: a browser that is waiting on a permission
 *  prompt — or on a page that hasn't been clicked yet — simply leaves the
 *  promise pending, and a dialog with a tab stuck saying "asking…" is worse than
 *  one that never offered the tab. A second and a half is far longer than a
 *  clipboard read that is going to happen takes. */
const ANSWER_WITHIN_MS = 1500;

/** How long a look the user *asked for* gets.
 *
 *  This one is not a deadline anybody has to beat: the browser's own Paste
 *  button is up, finding and tapping it takes a person seconds, and cutting
 *  that short is exactly the bug this pair of functions exists to fix. It is
 *  only a backstop against a promise that never settles at all, so that a
 *  button can't spin forever. */
const USER_ANSWERS_WITHIN_MS = 60_000;

function within<T>(work: Promise<T>, ms: number, spent: T): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(spent), ms)),
  ]);
}

/** A free look for a picture — for deciding whether to *offer* a paste. Only
 *  worth calling when `canLookAtClipboard()` said yes; anywhere else it either
 *  answers `null` or raises the very prompt it is trying to avoid. */
export async function peekClipboardImage(): Promise<ImportedImage | null> {
  return within(readClipboardImage(), ANSWER_WITHIN_MS, null);
}

/** The picture on the clipboard, asked for on purpose — inside the gesture that
 *  asked for it, and waiting for however long the browser's own prompt takes to
 *  answer. `null` for every one of the many ways there isn't one. */
export async function pasteClipboardImage(): Promise<ImportedImage | null> {
  return within(readClipboardImage(), USER_ANSWERS_WITHIN_MS, null);
}

async function readClipboardImage(): Promise<ImportedImage | null> {
  const clipboard = asyncClipboard();
  if (!clipboard?.read) return null;
  try {
    for (const entry of await clipboard.read()) {
      if (!entry.types.some((t) => t.startsWith("image/"))) continue;
      return await imageFromEntry(entry);
    }
  } catch {
    // Denied, dismissed, unsupported, or a clipboard we simply may not read.
    // Not an error worth surfacing: the caller offers a paste when there is a
    // picture and says there is none when there isn't, and that is the whole of
    // what it needs.
    return null;
  }
  return null;
}

/** The picture inside one clipboard entry.
 *
 *  `importImageFile` takes a `File` because that is what a drop and a file
 *  picker hand over; a clipboard blob is the same bytes with no name, so it gets
 *  one here and goes down the identical path — including the downscale that
 *  keeps a screenshot from becoming a megabyte of document. */
async function imageFromEntry(
  entry: ClipboardEntry,
): Promise<ImportedImage | null> {
  const type = entry.types.find((t) => t.startsWith("image/"));
  if (!type) return null;
  try {
    const blob = await entry.getType(type);
    return await importImageFile(new File([blob], "clipboard", { type }));
  } catch {
    return null;
  }
}
