// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SAVE-FILE BRIDGE: how an export leaves the app.
//
// On the web an export is a download — an anchor clicked at a `blob:` URL.
// Inside this WebView that click goes nowhere: the WebView offers the `blob:`
// URL to `App.tsx` as a navigation, and nothing on the phone can open a URL
// that only exists inside the page. So the wrapper offers the page a
// CAPABILITY instead, the framework's `save-file` contract
// (oss-framework's `docs/native-shell.md`): it advertises it in
// `window.__ossShell` before the page loads, the framework's `saveFile` then
// posts the file's bytes here rather than downloading them, and `saveFile.ts`
// writes them to the cache and opens the share sheet — from which the reader
// saves to Files, AirDrops or mails the drawing.
//
// The page never asks what it is running inside: it asks whether the shell can
// save a file, and a browser (which advertises nothing) keeps its download.
//
// Same shape as `icloudBridge.ts` and `authSessionBridge.ts`: the STRINGS and
// the pure narrowing live here, dependency-free, so the root test suite can run
// them against the framework's own `saveFile`; the effect that needs `expo`
// lives in `saveFile.ts`.

import { escapeForScript } from "./scriptText";

/** The message the page posts. The FRAMEWORK's name (`SAVE_FILE_MESSAGE` in
 *  `@niclaslindstedt/oss-framework/files`), not this app's: a drift is not an
 *  error, it is an export that never arrives. `tests/native_save_file_test.ts`
 *  pins the two together. */
export const SAVE_FILE_TYPE = "oss-framework/save-file";

/** The window event that settles the page's promise (`SAVE_FILE_RESULT_EVENT`). */
const RESULT_EVENT = "oss-framework/save-file-result";

/** Injected before the page loads, so the framework finds the capability on
 *  its first read. Merges into a descriptor another contract may already have
 *  put there, and adds the name once however often it runs. */
export const SAVE_FILE_DESCRIPTOR = `(function () {
  var shell = window.__ossShell;
  if (!shell || typeof shell !== "object") shell = { version: 1, capabilities: [] };
  if (!Array.isArray(shell.capabilities)) shell.capabilities = [];
  if (shell.capabilities.indexOf("save-file") < 0) shell.capabilities.push("save-file");
  window.__ossShell = shell;
})(); true;`;

export type SaveFileRequest = {
  type: string;
  version: number;
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
};

/** Whether a message from the page is a save-file request. */
export function isSaveFileRequest(value: unknown): value is SaveFileRequest {
  const m = value as Partial<SaveFileRequest> | null;
  return (
    typeof m === "object" &&
    m !== null &&
    m.type === SAVE_FILE_TYPE &&
    typeof m.version === "number" &&
    typeof m.id === "string" &&
    m.id !== "" &&
    typeof m.filename === "string" &&
    typeof m.mimeType === "string" &&
    typeof m.base64 === "string"
  );
}

/** A URL that only exists inside the page. The WebView offers one as a
 *  navigation when something clicks a download link; the system browser cannot
 *  open it, so `App.tsx` refuses it rather than handing it to `Linking`. */
export function isInPageUrl(url: string): boolean {
  return /^(blob|data):/i.test(url);
}

/** The name the file is written under: the last path component of what the
 *  page sent — the page has already cleaned it, but a name is never trusted —
 *  or `file` when that leaves nothing. */
export function bareName(name: string): string {
  const last = name.split(/[\\/]/).pop()?.trim() ?? "";
  return last === "" || last === "." || last === ".." ? "file" : last;
}

/** iOS picks share targets by UTI, not by MIME type. The types this app
 *  exports; anything else goes without one and iOS reads the extension. */
export const SAVE_FILE_UTI: Readonly<Record<string, string>> = {
  "application/json": "public.json",
  "image/jpeg": "public.jpeg",
  "image/png": "public.png",
  "image/svg+xml": "public.svg-image",
};

/** The script that settles the page's promise. The error is the platform's
 *  text, so it is spliced in as data. */
export function saveFileResultScript(
  id: string,
  ok: boolean,
  error?: string,
): string {
  const detail = ok ? { id, ok } : { id, ok, error };
  return `window.dispatchEvent(new CustomEvent(${escapeForScript(
    RESULT_EVENT,
  )}, { detail: JSON.parse(${escapeForScript(JSON.stringify(detail))}) })); true;`;
}
